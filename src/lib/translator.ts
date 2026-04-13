/**
 * Deterministic Portugol to Python Translator
 */

export interface TranslationResult {
  pythonCode: string;
  explanations: { line: number; text: string }[];
}

export function splitDeclarations(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if ((char === '"' || char === "'") && (i === 0 || str[i-1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuotes = false;
      }
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) result.push(current.trim());
  return result;
}

export function translatePortugolToPython(portugolCode: string): TranslationResult {
  const lines = portugolCode.split('\n');
  const pythonLines: string[] = [];
  const explanations: { line: number; text: string }[] = [];
  
  let indentLevel = 0;
  let inMain = false;
  let hasInput = false;

  const getIndent = (level: number) => '    '.repeat(level);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      pythonLines.push('');
      continue;
    }

    // Handle Structure
    if (line.startsWith('programa {')) {
      explanations.push({ line: pythonLines.length + 1, text: "O bloco 'programa' define o início do seu algoritmo em Portugol." });
      continue; 
    }

    if (line.includes('funcao inicio()')) {
      pythonLines.push(getIndent(indentLevel) + "def main():");
      explanations.push({ line: pythonLines.length, text: "A função 'inicio' é o ponto de entrada. Em Python, usamos 'def main()'." });
      inMain = true;
      indentLevel++;
      continue;
    }

    if (line.trim() === '}') {
      indentLevel = Math.max(0, indentLevel - 1);
      continue;
    }

    if (line.match(/^}\s*senao/)) {
      indentLevel = Math.max(0, indentLevel - 1);
      line = line.replace(/^}\s*/, '');
    }

    // Replace Portugol logical operators with Python ones
    line = line.replace(/\be\b/g, 'and').replace(/\bou\b/g, 'or');
    
    let translatedLines: string[] = [line];
    let explanation = "";

    // Keywords
    if (line.includes('escreva(')) {
      translatedLines = [line.replace(/escreva\((.*)\)/, 'print($1)')];
      explanation = "'escreva' mostra dados na tela. Em Python, usamos 'print()'.";
    } else if (line.includes('leia(')) {
      const varMatch = line.match(/leia\((.*)\)/);
      if (varMatch) {
        const varName = varMatch[1].trim();
        translatedLines = [`${varName} = input()`];
        explanation = "'leia' recebe dados do usuário. Em Python, usamos 'input()'.";
        hasInput = true;
      }
    } else if (line.match(/^(inteiro|real|cadeia|caracter|logico)\s+/)) {
      // Variable declaration: inteiro x = 10 -> x = 10
      const withoutType = line.replace(/^(inteiro|real|cadeia|caracter|logico)\s+/, '');
      const declarations = splitDeclarations(withoutType);
      translatedLines = declarations.map(d => {
        if (!d.includes('=')) return `${d} = None`;
        return d;
      });
      explanation = "Em Python, não precisamos declarar o tipo da variável explicitamente. Múltiplas variáveis são separadas em linhas diferentes.";
    } else if (line.startsWith('se (')) {
      translatedLines = [line.replace(/se\s*\((.*)\)\s*{?/, 'if $1:')];
      explanation = "'se' é uma estrutura de decisão. Em Python, usamos 'if' seguido de dois pontos.";
      // We don't increment indent here because the next line will be indented
    } else if (line.startsWith('senao {') || line.startsWith('senao')) {
      translatedLines = ["else:"];
      explanation = "'senao' é o caminho alternativo. Em Python, usamos 'else:'.";
    } else if (line.startsWith('enquanto (')) {
      translatedLines = [line.replace(/enquanto\s*\((.*)\)\s*{?/, 'while $1:')];
      explanation = "'enquanto' é um laço de repetição. Em Python, usamos 'while'.";
    } else if (line.startsWith('para (')) {
      const paraMatch = line.match(/para\s*\((?:inteiro|real)?\s*(\w+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\d+)\s*;\s*.*\)/);
      if (paraMatch) {
        translatedLines = [`for ${paraMatch[1]} in range(${paraMatch[2]}, ${paraMatch[3]}):`];
      } else {
        translatedLines = [line.replace(/para\s*\((.*)\)/, '# TODO: Tradução complexa de "para": for $1')];
      }
      explanation = "'para' é um laço contado. Em Python, usamos 'for ... in range()'.";
    } else if (line.startsWith('funcao ')) {
      const funcMatch = line.match(/funcao\s+([a-zA-Z_]\w*)\s*\((.*?)\)/);
      if (funcMatch) {
        translatedLines = [`def ${funcMatch[1]}(${funcMatch[2]}):`];
        explanation = "Funções regulares em Portugol começam com 'funcao'. Em Python, usamos 'def'.";
      }
    }


    // Adjust indent for control structures that were just opened
    const currentIndent = (line.startsWith('se (') || line.startsWith('senao') || line.startsWith('enquanto (') || line.startsWith('para (')) 
      ? indentLevel 
      : indentLevel;

    translatedLines.forEach((tLine, idx) => {
      // Clean up trailing braces and add indentation
      const cleanedLine = tLine.replace(/\s*{$/, ':');
      pythonLines.push(getIndent(currentIndent) + cleanedLine);
      
      if (idx === 0 && explanation) {
        explanations.push({ line: pythonLines.length, text: explanation });
      }
    });

    // Increment indent for next lines if this line opened a block
    if (line.endsWith('{') || translatedLines[0].endsWith(':')) {
      indentLevel++;
    }
  }

  // Add the main wrapper
  if (inMain) {
    pythonLines.push('');
    pythonLines.push('if __name__ == "__main__":');
    pythonLines.push('    main()');
  }

  return {
    pythonCode: pythonLines.join('\n'),
    explanations
  };
}
