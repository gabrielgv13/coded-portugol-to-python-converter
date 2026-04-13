import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Download, 
  Bug, 
  Terminal as TerminalIcon, 
  Code2, 
  RefreshCw,
  Info,
  Copy,
  Trash2,
  Check,
  ChevronRight,
  Square,
  Database,
  Plus,
  Minus,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronUp,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { translatePortugolToPython, splitDeclarations } from './lib/translator';

const DEFAULT_PORTUGOL = `programa {
    funcao inicio() {
    }
}`;

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

type VariableHistoryType = { val: any; op?: string; env?: Record<string, any> };
type DebugCommand = 'forward' | 'back' | 'stop';
type DebugSnapshot = {
  pc: number;
  variables: Record<string, any>;
  variableHistory: Record<string, { currentValue: any; history: VariableHistoryType[] }>;
  consoleOutput: string[];
  loopState: Record<number, { initialized: boolean }>;
  callStack: { returnPc: number, restoredParams: Record<string, any>, assignTo?: string }[];
};

const cloneDebugValue = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export default function App() {
  const [portugolCode, setPortugolCode] = useState(DEFAULT_PORTUGOL);
  const [pythonCode, setPythonCode] = useState('');
  const [explanations, setExplanations] = useState<{ line: number; text: string }[]>([]);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [showExplanations, setShowExplanations] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDebugPaused, setIsDebugPaused] = useState(false);
  const [showPythonTab, setShowPythonTab] = useState(false);
  const [executionSpeed, setExecutionSpeed] = useState(100);
  const [showConsole, setShowConsole] = useState(true);
  const [showMemory, setShowMemory] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [activeVariables, setActiveVariables] = useState<Record<string, { currentValue: any; history: VariableHistoryType[] }>>({});
  const [memoryFontSize, setMemoryFontSize] = useState(14);
  const [footerHeight, setFooterHeight] = useState(208);
  const [isResizing, setIsResizing] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const syntaxHighlightRef = useRef<HTMLDivElement>(null);
  const lineHighlightRef = useRef<HTMLDivElement>(null);
  const debugCommandRef = useRef<((command: DebugCommand) => void) | null>(null);
  const cancelExecutionRef = useRef<boolean>(false);
  const executionSpeedRef = useRef<number>(100);

  const startResizing = React.useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = footerHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(100, Math.min(800, startHeight - deltaY));
      setFooterHeight(newHeight);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [footerHeight]);

  useEffect(() => {
    const result = translatePortugolToPython(portugolCode);
    setPythonCode(result.pythonCode);
    
    // Deduplicate explanations by text
    const uniqueExplanations = result.explanations.filter(
      (v, i, a) => a.findIndex(t => t.text === v.text) === i
    );
    setExplanations(uniqueExplanations);
  }, [portugolCode]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleOutput]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    if (syntaxHighlightRef.current) {
      syntaxHighlightRef.current.scrollTop = scrollTop;
      syntaxHighlightRef.current.scrollLeft = scrollLeft;
    }
    if (lineHighlightRef.current) {
      lineHighlightRef.current.style.transform = `translateY(-${scrollTop}px)`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newCode = portugolCode.substring(0, start) + '    ' + portugolCode.substring(end);
      setPortugolCode(newCode);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const linesBefore = portugolCode.substring(0, start).split('\n');
      const currentLineText = linesBefore[linesBefore.length - 1];
      const indentMatch = currentLineText.match(/^\s*/);
      let indent = indentMatch ? indentMatch[0] : '';
      
      if (currentLineText.trim().endsWith('{')) {
        indent += '    ';
      }
      
      const newCode = portugolCode.substring(0, start) + '\n' + indent + portugolCode.substring(end);
      setPortugolCode(newCode);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1 + indent.length;
        }
      }, 0);
    }
  };

  const highlightCode = (code: string, mode: 'portugol' | 'python') => {
    if (!code) return '';
    
    const rules = mode === 'portugol' ? [
      { token: 'comment', regex: /\/\/.*$/m },
      { token: 'string', regex: /"[^"]*"|'[^']*'/ },
      { token: 'function', regex: /\b(escreva|leia)\b/ },
      { token: 'control', regex: /\b(se|senao)\b/ },
      { token: 'loop', regex: /\b(para|enquanto|faca)\b/ },
      { token: 'datatype', regex: /\b(inteiro|real|cadeia|caracter|logico)\b/ },
      { token: 'type', regex: /\b(programa|funcao|inicio)\b/ },
      { token: 'operator', regex: /[+\-*/%=<>!]+|\be\b|\bou\b/ },
      { token: 'number', regex: /\b\d+\b/ },
      { token: 'bracket_open', regex: /[\{\(\[]/ },
      { token: 'bracket_close', regex: /[\}\)\]]/ },
    ] : [
      { token: 'comment', regex: /#.*$/m },
      { token: 'string', regex: /"[^"]*"|'[^']*'/ },
      { token: 'function', regex: /\b(print|input)\b/ },
      { token: 'control', regex: /\b(if|else|elif)\b/ },
      { token: 'loop', regex: /\b(for|while|in|range)\b/ },
      { token: 'type', regex: /\b(def|True|False|None|import|from|as|return)\b/ },
      { token: 'operator', regex: /[+\-*/%=<>!]+/ },
      { token: 'number', regex: /\b\d+\b/ },
      { token: 'bracket_open', regex: /[\{\(\[]/ },
      { token: 'bracket_close', regex: /[\}\)\]]/ },
    ];

    const colors: Record<string, string> = {
      comment: 'text-gray-500 italic',
      string: 'text-emerald-400',
      function: 'text-sky-400 font-bold',
      control: 'text-pink-400 font-bold',
      loop: 'text-yellow-400 font-bold',
      type: 'text-blue-400',
      datatype: 'text-cyan-400 font-bold',
      operator: 'text-orange-400',
      number: 'text-purple-400',
    };

    const bracketColors = ['text-yellow-400 font-bold', 'text-emerald-400 font-bold', 'text-pink-400 font-bold', 'text-orange-500 font-bold'];
    let bracketDepth = 0;

    let result = '';
    let remaining = code;

    while (remaining.length > 0) {
      let bestMatch: { token: string, index: number, length: number } | null = null;

      for (const rule of rules) {
        const match = rule.regex.exec(remaining);
        if (match && (bestMatch === null || match.index < bestMatch.index)) {
          bestMatch = {
            token: rule.token,
            index: match.index,
            length: match[0].length
          };
        }
      }

      if (bestMatch === null) {
        result += remaining.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        break;
      }

      if (bestMatch.index > 0) {
        result += remaining.slice(0, bestMatch.index).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      const matchText = remaining.slice(bestMatch.index, bestMatch.index + bestMatch.length);
      const escapedMatch = matchText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      if (bestMatch.token === 'bracket_open') {
        const color = bracketColors[bracketDepth % bracketColors.length];
        result += `<span class="${color}">${escapedMatch}</span>`;
        bracketDepth++;
      } else if (bestMatch.token === 'bracket_close') {
        bracketDepth = Math.max(0, bracketDepth - 1);
        const color = bracketColors[bracketDepth % bracketColors.length];
        result += `<span class="${color}">${escapedMatch}</span>`;
      } else {
        result += `<span class="${colors[bestMatch.token]}">${escapedMatch}</span>`;
      }

      remaining = remaining.slice(bestMatch.index + bestMatch.length);
    }

    return result;
  };

  const highlightExplanation = (text: string) => {
    const terms = /\b(escreva|print|leia|input|se|if|senao|else|enquanto|while|para|for|inteiro|real|cadeia|caracter|logico|def|main|inicio|programa)\b/g;
    return text.replace(terms, '<span class="text-orange-400 font-mono font-bold">$1</span>');
  };

  const handleDownload = () => {
    const downloadFile = (content: string, filename: string) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    downloadFile(portugolCode, 'algoritmo.por');
    downloadFile(pythonCode, 'algoritmo.py');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Tem certeza que deseja limpar o código?")) {
      setPortugolCode(DEFAULT_PORTUGOL);
      setConsoleOutput([]);
    }
  };

  const sendDebugCommand = (command: DebugCommand) => {
    if (debugCommandRef.current) {
      debugCommandRef.current(command);
      debugCommandRef.current = null;
    }
  };

  const handleNextStep = () => {
    sendDebugCommand('forward');
  };

  const handleRewindStep = () => {
    sendDebugCommand('back');
  };

  const handleStopDebug = () => {
    cancelExecutionRef.current = true;
    sendDebugCommand('stop');
  };

  const evaluateExpression = (expr: string, vars: Record<string, any>) => {
    let sanitized = expr.trim();
    if (!sanitized) return null;
    
    // Replace Portugol operators with JS ones
    sanitized = sanitized
      .replace(/<>/g, '!==')
      .replace(/!=/g, '!==')
      .replace(/==/g, '===')
      .replace(/\be\b/g, '&&')
      .replace(/\bou\b/g, '||');
    
    // Sort keys by length descending to avoid partial replacements
    const sortedKeys = Object.keys(vars).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      const val = vars[key];
      const replacement = typeof val === 'string' ? `"${val.replace(/"/g, '\\"')}"` : val;
      sanitized = sanitized.replace(regex, String(replacement));
    }
    
    try {
      const result = new Function(`return ${sanitized}`)();
      return result;
    } catch (e) {
      if (sanitized.startsWith('"') && sanitized.endsWith('"')) return sanitized.slice(1, -1);
      return null;
    }
  };

  const runAlgorithm = async (stepByStep = false) => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    let currentConsoleOutput = ["[Iniciando execução...]"];
    setConsoleOutput(currentConsoleOutput);
    setActiveVariables({});
    setDebugMode(stepByStep);
    cancelExecutionRef.current = false;
    setIsDebugPaused(false);
    setCurrentLine(null);

    const lines = portugolCode.split('\n');
    let variables: Record<string, any> = {};
    let variableHistory: Record<string, { currentValue: any; history: VariableHistoryType[] }> = {};

    const assignVariable = (name: string, val: any, op?: string) => {
       const isNew = !(name in variables);
       const prevVal = variables[name];
       const envSnapshot = { ...variables };
       variables[name] = val;
       
       if (!variableHistory[name]) {
          variableHistory[name] = { currentValue: val, history: [] };
          if (op !== undefined && op !== String(val) && !/^['"]/.test(op) && isNaN(Number(op))) {
             variableHistory[name].history.push({ val: prevVal, op: op, env: envSnapshot });
          }
       } else if (prevVal !== val) {
          variableHistory[name].history.push({ val: prevVal, op: op, env: envSnapshot });
          if (variableHistory[name].history.length > 20) variableHistory[name].history.shift();
          variableHistory[name].currentValue = val;
       }
    };
    
    // Pre-process block boundaries and functions
    const blockMap: Record<number, number> = {};
    const stack: number[] = [];
    const functionsMap: Record<string, { startIdx: number, params: string[], endIdx: number }> = {};
    const loopState: Record<number, { initialized: boolean }> = {};
    const callStack: { returnPc: number, restoredParams: Record<string, any>, assignTo?: string }[] = [];
    const debugSnapshots: DebugSnapshot[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('{')) {
        stack.push(i);
        const funcMatch = line.match(/funcao\s+([a-zA-Z_]\w*)\s*\((.*?)\)/);
        if (funcMatch) {
          const params = funcMatch[2].split(',').map(p => p.trim()).filter(Boolean);
          functionsMap[funcMatch[1]] = { startIdx: i, params, endIdx: -1 };
        }
      }
      if (line.includes('}')) {
        const start = stack.pop();
        if (start !== undefined) {
          blockMap[start] = i;
          blockMap[i] = start;
          const startLine = lines[start].trim();
          const funcMatch = startLine.match(/funcao\s+([a-zA-Z_]\w*)\s*\((.*?)\)/);
          if (funcMatch && functionsMap[funcMatch[1]]) {
             functionsMap[funcMatch[1]].endIdx = i;
          }
        }
      }
    }

    let pc = 0;
    if (functionsMap['inicio']) {
      pc = functionsMap['inicio'].startIdx + 1;
    }

    const syncVisibleState = () => {
      setActiveVariables(cloneDebugValue(variableHistory));
      setConsoleOutput([...currentConsoleOutput]);
      setCurrentLine(pc);
      setIsDebugPaused(stepByStep);
    };

    const createSnapshot = (): DebugSnapshot => ({
      pc,
      variables: cloneDebugValue(variables),
      variableHistory: cloneDebugValue(variableHistory),
      consoleOutput: cloneDebugValue(currentConsoleOutput),
      loopState: cloneDebugValue(loopState),
      callStack: cloneDebugValue(callStack)
    });

    const pushSnapshot = () => {
      debugSnapshots.push(createSnapshot());
    };

    const restoreSnapshot = (snapshot: DebugSnapshot) => {
      pc = snapshot.pc;
      variables = cloneDebugValue(snapshot.variables);
      variableHistory = cloneDebugValue(snapshot.variableHistory);
      currentConsoleOutput = cloneDebugValue(snapshot.consoleOutput);
      Object.keys(loopState).forEach(key => delete loopState[Number(key)]);
      Object.assign(loopState, cloneDebugValue(snapshot.loopState));
      callStack.length = 0;
      callStack.push(...cloneDebugValue(snapshot.callStack));
      setActiveVariables(cloneDebugValue(variableHistory));
      setConsoleOutput([...currentConsoleOutput]);
      setCurrentLine(pc);
      setIsDebugPaused(true);
    };

    const waitForDebugCommand = () => new Promise<DebugCommand>(resolve => {
      debugCommandRef.current = resolve;
    });

    if (stepByStep) {
      pushSnapshot();
    }

    while (pc < lines.length) {
      if (cancelExecutionRef.current) break;
      if (stepByStep) {
        syncVisibleState();
        const command = await waitForDebugCommand();
        if (command === 'stop') break;
        if (command === 'back') {
          if (debugSnapshots.length > 1) {
            debugSnapshots.pop();
            restoreSnapshot(debugSnapshots[debugSnapshots.length - 1]);
          }
          continue;
        }
      }
      setCurrentLine(pc);
      const line = lines[pc].trim();
      
      // Handle Braces and Block Ends
      if (line === '}') {
        const startLineIdx = blockMap[pc];
        if (startLineIdx !== undefined) {
          const startLine = lines[startLineIdx].trim();

          // Is it returning from a function?
          if (startLine.startsWith('funcao ')) {
            if (callStack.length > 0) {
              const popped = callStack.pop()!;
              Object.assign(variables, popped.restoredParams);
              pc = popped.returnPc;
              // we don't continue here to let the closing brace get highlighted and delayed
            } else {
               break; // End of main function or last stack
            }
          } else {
            // Keep existing block handling for if/else, loops
            // If this is the end of a 'se' block, check if there's a 'senao' to skip
            if (startLine.startsWith('se')) {
              const nextLine = lines[pc + 1]?.trim();
              if (nextLine && nextLine.startsWith('senao')) {
                const endOfSenao = blockMap[pc + 1];
                if (endOfSenao !== undefined) {
                  pc = endOfSenao + 1;
                  if (stepByStep) pushSnapshot();
                  continue;
                }
              }
            }

            if (startLine.startsWith('enquanto') || startLine.startsWith('para')) {
              // Loop back
              if (startLine.startsWith('para')) {
                const match = startLine.match(/para\s*\((.*);(.*);(.*)\)/);
                if (match) {
                  const increment = match[3].trim();
                  if (increment.endsWith('++')) {
                    const varName = increment.slice(0, -2).trim();
                    assignVariable(varName, (Number(variables[varName]) || 0) + 1, `${varName} + 1`);
                  } else if (increment.includes('=')) {
                    const [name, expr] = increment.split('=').map(s => s.trim());
                    assignVariable(name, evaluateExpression(expr, variables), expr);
                  }
                }
              }
              pc = startLineIdx;
              if (stepByStep) pushSnapshot();
              continue;
            }
          }
        }
        pc++;
        if (stepByStep) pushSnapshot();
        continue;
      }

      if (!line || line === '{' || line.startsWith('programa') || line.startsWith('funcao')) {
        if (line.startsWith('funcao ')) {
          const endIdx = blockMap[pc];
          if (endIdx !== undefined) {
            pc = endIdx + 1;
            if (stepByStep) pushSnapshot();
            continue;
          }
        }
        pc++;
        if (stepByStep) pushSnapshot();
        continue;
      }

      // Handle 'para'
      if (line.startsWith('para')) {
        const match = line.match(/para\s*\((.*);(.*);(.*)\)/);
        if (match) {
          const init = match[1].trim();
          const condition = match[2].trim();
          
          if (!loopState[pc]?.initialized) {
            const initParts = init.split(/\s+/);
            const decl = initParts.slice(-1)[0];
            if (decl.includes('=')) {
              const [name, valExpr] = decl.split('=').map(s => s.trim());
              assignVariable(name, evaluateExpression(valExpr, variables), valExpr);
            }
            loopState[pc] = { initialized: true };
          }
          
          if (!evaluateExpression(condition, variables)) {
            pc = blockMap[pc] + 1;
            delete loopState[pc];
            if (stepByStep) pushSnapshot();
            continue;
          }
        }
      }
      // Handle 'enquanto'
      else if (line.startsWith('enquanto')) {
        const match = line.match(/enquanto\s*\((.*)\)/);
        if (match) {
          const condition = match[1].trim();
          if (!evaluateExpression(condition, variables)) {
            pc = blockMap[pc] + 1;
            if (stepByStep) pushSnapshot();
            continue;
          }
        }
      }
      // Handle 'se'
      else if (line.startsWith('se')) {
        const match = line.match(/se\s*\((.*)\)/);
        if (match) {
          const condition = match[1].trim();
          const result = evaluateExpression(condition, variables);
          if (!result) {
            const endOfIf = blockMap[pc];
            if (endOfIf !== undefined) {
              const nextLine = lines[endOfIf + 1]?.trim();
              if (nextLine && nextLine.startsWith('senao')) {
                pc = endOfIf + 1; // Jump to 'senao' line, next iteration will enter it
                if (stepByStep) pushSnapshot();
                continue;
              } else {
                pc = endOfIf + 1; // Skip the IF block
                if (stepByStep) pushSnapshot();
                continue;
              }
            }
          }
        }
      }
      // Handle 'escreva'
      else if (line.includes('escreva(')) {
        const match = line.match(/escreva\((.*)\)/);
        if (match) {
          const content = match[1].trim();
          let output = '';
          if (content.includes('+')) {
            output = content.split('+').map(t => {
              const val = evaluateExpression(t.trim(), variables);
              return val !== null && val !== undefined ? String(val) : t.trim().replace(/"/g, '');
            }).join('');
          } else {
            const val = evaluateExpression(content, variables);
            output = val !== null && val !== undefined ? String(val) : content.replace(/"/g, '');
          }
          currentConsoleOutput = [...currentConsoleOutput, `> ${output}`];
          setConsoleOutput([...currentConsoleOutput]);
        }
      }
      // Handle 'retorne'
      else if (line.startsWith('retorne')) {
        const valExpr = line.replace(/^retorne/, '').trim();
        let returnVal = null;
        if (valExpr) returnVal = evaluateExpression(valExpr, variables);
        
        if (callStack.length > 0) {
          const popped = callStack.pop()!;
          Object.assign(variables, popped.restoredParams);
          if (popped.assignTo) {
             assignVariable(popped.assignTo, returnVal, 'retorno');
          }
          pc = popped.returnPc;
        } else {
          break;
        }
      }
      // Handle assignments, function calls, and declarations
      else {
        const funcCallRegex = /^([a-zA-Z_]\w*)\s*\((.*?)\)$/;
        const assignCallRegex = /^([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w*)\s*\((.*?)\)$/;
        
        const funcCallMatch = line.match(funcCallRegex);
        const assignCallMatch = line.match(assignCallRegex);

        if (funcCallMatch && functionsMap[funcCallMatch[1]] && funcCallMatch[1] !== 'escreva' && funcCallMatch[1] !== 'leia') {
          const funcName = funcCallMatch[1];
          const argString = funcCallMatch[2];
          const args = splitDeclarations(argString).map(expr => evaluateExpression(expr, variables));
          
          const oldParams: Record<string, any> = {};
          functionsMap[funcName].params.forEach((param, idx) => {
             const pName = param.replace(/^(inteiro|real|cadeia|caracter|logico)\s+/, '').trim();
             oldParams[pName] = variables[pName];
             variables[pName] = args[idx] !== undefined ? args[idx] : null;
          });
          
          callStack.push({ returnPc: pc, restoredParams: oldParams });
          pc = functionsMap[funcName].startIdx;
        } else if (assignCallMatch && functionsMap[assignCallMatch[2]] && assignCallMatch[2] !== 'escreva' && assignCallMatch[2] !== 'leia') {
          const assignTo = assignCallMatch[1];
          const funcName = assignCallMatch[2];
          const argString = assignCallMatch[3];
          const args = splitDeclarations(argString).map(expr => evaluateExpression(expr, variables));
          
          const oldParams: Record<string, any> = {};
          functionsMap[funcName].params.forEach((param, idx) => {
             const pName = param.replace(/^(inteiro|real|cadeia|caracter|logico)\s+/, '').trim();
             oldParams[pName] = variables[pName];
             assignVariable(pName, args[idx] !== undefined ? args[idx] : null, 'param');
          });
          callStack.push({ returnPc: pc, restoredParams: oldParams, assignTo });
          pc = functionsMap[funcName].startIdx;
        } else {
          let potentialDecls = line;
          const typeMatch = line.match(/^(?:inteiro|real|cadeia|caracter|logico)\s+(.*)$/);
          let isDeclaration = false;
          if (typeMatch) {
            potentialDecls = typeMatch[1];
            isDeclaration = true;
          }
          
          const decls = splitDeclarations(potentialDecls);
          for (const decl of decls) {
            if (decl.includes('=')) {
              const [name, valExpr] = decl.split('=').map(s => s.trim());
              assignVariable(name, evaluateExpression(valExpr, variables), valExpr);
            } else if (isDeclaration) {
              const name = decl.trim();
              if (name && !(name in variables)) {
                  assignVariable(name, undefined);
              }
            }
          }
        }
      }

      if (stepByStep) {
        pc++;
        pushSnapshot();
      } else {
        setActiveVariables(cloneDebugValue(variableHistory));
        const delay = executionSpeedRef.current === 0 ? 1000000 : 200 * (100 / executionSpeedRef.current);
        await new Promise(resolve => setTimeout(resolve, delay));
        pc++;
      }
    }

    setActiveVariables(cloneDebugValue(variableHistory));
    currentConsoleOutput = [...currentConsoleOutput, cancelExecutionRef.current ? "[Execução interrompida]" : "[Execução finalizada]"];
    setConsoleOutput(currentConsoleOutput);
    setIsExecuting(false);
    setCurrentLine(null);
    setDebugMode(false);
    setIsDebugPaused(false);
    debugCommandRef.current = null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#E4E3E0] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      {showHeader && (
        <header className="h-14 border-b border-[#222] flex items-center justify-between px-6 bg-[#111] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-900/20">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-serif italic text-lg tracking-tight leading-none">Coded Portugol <span className="text-orange-500">→</span> Python</h1>
              <span className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-mono">IDE Educacional</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowPythonTab(!showPythonTab)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer border",
                showPythonTab 
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30" 
                  : "bg-[#1a1a1a] border-[#333] text-white/60 hover:text-white hover:bg-[#222]"
              )}
            >
              Python
            </button>
            <button 
              onClick={handleDownload}
              className="p-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-md text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Download Files"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReset}
              className="p-2 bg-[#1a1a1a] hover:bg-red-900/20 border border-[#333] hover:border-red-900/50 rounded-md text-white/70 hover:text-red-500 transition-colors cursor-pointer"
              title="Reset Code"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="h-6 w-px bg-[#333] mx-1" />
            <button 
              onClick={() => setShowHeader(false)}
              className="p-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-md text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Hide Header"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}
      {!showHeader && (
        <button 
          onClick={() => setShowHeader(true)}
          className="absolute top-2 right-4 z-[60] p-1.5 bg-[#111]/90 hover:bg-[#222] border border-[#333] rounded-md text-white/50 hover:text-white backdrop-blur-sm cursor-pointer shadow-lg transition-colors"
          title="Show Header"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden min-h-0 bg-[#0d0d0d]">
        {/* Portugol Editor */}
        <div className="flex-1 flex flex-col border-r border-[#222] relative">
          <div className="h-10 bg-[#111] border-b border-[#222] flex items-center px-4 justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Portugol Editor</span>
              </div>

              <div className="h-4 w-px bg-[#333]" />

              {/* Speed Slider */}
              <div className="flex items-center gap-2 bg-[#1a1a1a] px-2 py-1 rounded border border-[#333]">
                <span className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Speed</span>
                <input 
                  type="range" 
                  min="1" 
                  max="200" 
                  value={executionSpeed} 
                  onChange={(e) => {
                    setExecutionSpeed(Number(e.target.value));
                    executionSpeedRef.current = Number(e.target.value);
                  }}
                  className="w-16 accent-orange-500 h-1 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div className="h-4 w-px bg-[#333]" />

              <div className="flex items-center gap-1.5">
                {isExecuting ? (
                  <button 
                    onClick={() => {
                      handleStopDebug();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-red-900/10"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                ) : (
                  <button 
                    onClick={() => runAlgorithm(false)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-emerald-900/10"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Play
                  </button>
                )}
                <button 
                  onClick={() => runAlgorithm(true)}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-sky-900/10"
                >
                  <Bug className="w-3 h-3" />
                  Debug
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <RefreshCw className={cn("w-4 h-4 opacity-40", isExecuting && "animate-spin text-orange-500 opacity-100")} />
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden font-mono text-sm leading-relaxed bg-[#0d0d0d] flex">
            <div 
              ref={lineNumbersRef}
              className="w-12 shrink-0 bg-[#111] border-r border-[#222] flex flex-col items-center py-4 text-white/30 select-none z-10 overflow-hidden"
            >
              {portugolCode.split('\n').map((_, i) => (
                <div key={i} className={cn("h-6 flex items-center text-[10px]", currentLine === i && "text-orange-500 font-bold")}>
                  {(i + 1).toString().padStart(2, '0')}
                </div>
              ))}
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div 
                ref={syntaxHighlightRef}
                className="absolute inset-0 px-4 py-4 text-[#E4E3E0] pointer-events-none whitespace-pre overflow-hidden z-10"
                style={{ lineHeight: '1.5rem', fontFamily: MONO_FONT }}
                dangerouslySetInnerHTML={{ __html: highlightCode(portugolCode, 'portugol') + '\n' }}
              />
              <textarea
                ref={textareaRef}
                value={portugolCode}
                onChange={(e) => setPortugolCode(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                spellCheck={false}
                wrap="off"
                className="w-full h-full bg-transparent outline-none resize-none px-4 py-4 text-transparent caret-orange-500 relative z-20 whitespace-pre"
                style={{ lineHeight: '1.5rem', fontFamily: MONO_FONT }}
              />
              {/* Line Highlight */}
              {currentLine !== null && (
                <motion.div 
                  ref={lineHighlightRef}
                  className="absolute left-0 right-0 bg-orange-500/10 border-y border-orange-500/20 pointer-events-none z-0"
                  initial={false}
                  animate={{ top: `calc(${currentLine * 1.5}rem + 1rem)` }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 1 }}
                  style={{ height: '1.5rem' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Python Output */}
        <AnimatePresence mode="wait">
          {showPythonTab && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '50%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="flex flex-col border-l border-[#222] overflow-hidden"
            >
              <div className="h-10 bg-[#111] border-b border-[#222] flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Python Equivalent</span>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleCopy}
                    className="p-1.5 rounded hover:bg-[#222] text-white/40 hover:text-white transition-colors cursor-pointer"
                    title="Copy Python Code"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    onClick={() => setShowExplanations(!showExplanations)}
                    className={cn("p-1.5 rounded hover:bg-[#222] transition-colors cursor-pointer", showExplanations ? "text-orange-500" : "text-white/40")}
                    title="Toggle Explanations"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto font-mono text-sm leading-relaxed p-6 bg-[#0a0a0a] relative">
                <pre 
                  className="text-[#E4E3E0] whitespace-pre-wrap selection:bg-blue-500/20"
                  style={{ fontFamily: MONO_FONT }}
                  dangerouslySetInnerHTML={{ __html: highlightCode(pythonCode, 'python') }}
                />

                {/* Explanations Overlay */}
                <AnimatePresence>
                  {showExplanations && explanations.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="absolute top-6 right-6 w-72 flex flex-col gap-3 pointer-events-none"
                    >
                      {explanations.slice(0, 6).map((exp, idx) => (
                        <motion.div 
                          key={idx} 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="bg-[#161616] border border-[#222] p-4 rounded-xl shadow-2xl pointer-events-auto backdrop-blur-sm"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            <span className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-40">Insight</span>
                          </div>
                          <p 
                            className="text-[11px] leading-relaxed text-[#aaa] font-sans"
                            dangerouslySetInnerHTML={{ __html: highlightExplanation(exp.text) }}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Area */}
      <footer 
        className={cn(
          "border-t border-[#222] bg-[#080808] flex shrink-0 divide-x divide-[#222] relative", 
          !isResizing && "transition-[height] duration-300"
        )}
        style={{ height: (showConsole || showMemory) ? footerHeight : 37 }}
      >
        {/* Resize Handle */}
        {(showConsole || showMemory) && (
          <div 
            onMouseDown={startResizing}
            className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-50 -translate-y-1/2 hover:bg-orange-500/50 transition-colors"
          />
        )}
        
        {/* Terminal */}
        <div className={cn("flex flex-col transition-all duration-300", showConsole ? "flex-1 min-w-0" : "w-[50px] overflow-hidden")}>
          <button 
             onClick={() => setShowConsole(!showConsole)}
             className="h-9 bg-[#111] border-b border-[#222] flex items-center px-4 gap-2 shrink-0 cursor-pointer w-full text-left outline-none whitespace-nowrap"
             title="Toggle Console"
          >
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className={cn("text-[10px] font-mono uppercase tracking-widest opacity-50 transition-opacity", !showConsole && "opacity-0 hidden")}>Console Output</span>
          </button>
          
          <div 
            ref={consoleRef}
            className={cn("flex-1 p-5 font-mono text-[11px] overflow-auto scroll-smooth bg-black/40", !showConsole && "hidden")}
          >
            {consoleOutput.map((line, i) => (
              <div key={i} className={cn(
                "mb-1.5 flex gap-3",
                line.startsWith('[') ? "text-sky-500/80 italic" : "text-emerald-400"
              )}>
                <span className="opacity-20 select-none">[{i.toString().padStart(2, '0')}]</span>
                <span>{line}</span>
              </div>
            ))}
            {isExecuting && !isDebugPaused && (
              <div className="flex gap-3 items-center">
                <span className="opacity-20 select-none">[{consoleOutput.length.toString().padStart(2, '0')}]</span>
                <div className="w-1.5 h-3 bg-orange-500 animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Variables Memory */}
        <div className={cn("flex flex-col bg-[#0a0a0a] transition-all duration-300", showMemory ? (showConsole ? "w-[400px]" : "flex-1 min-w-0") : "w-[50px] overflow-hidden")}>
          <div className="h-9 bg-[#111] border-b border-[#222] flex items-center px-4 gap-2 shrink-0 w-full justify-between">
            <button 
               onClick={() => setShowMemory(!showMemory)}
               className="flex items-center gap-2 cursor-pointer outline-none whitespace-nowrap min-w-0"
               title="Toggle Memória"
            >
              <Database className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span className={cn("text-[10px] font-mono uppercase tracking-widest opacity-50 transition-opacity", !showMemory && "opacity-0 hidden")}>Memória (Variáveis)</span>
            </button>
            {showMemory && (
               <div className="flex items-center gap-0.5 shrink-0">
                 <button onClick={() => setMemoryFontSize(p => Math.max(8, p - 2))} className="p-1 hover:bg-[#222] rounded cursor-pointer text-white/50 hover:text-white transition-colors" title="Diminuir Fonte">
                   <Minus className="w-3 h-3" />
                 </button>
                 <button onClick={() => setMemoryFontSize(p => Math.min(32, p + 2))} className="p-1 hover:bg-[#222] rounded cursor-pointer text-white/50 hover:text-white transition-colors" title="Aumentar Fonte">
                   <Plus className="w-3 h-3" />
                 </button>
               </div>
            )}
          </div>
          
          <div className={cn("flex-1 p-4 overflow-auto bg-black/20 content-start flex-wrap gap-3", showMemory ? "flex" : "hidden")}>
            <AnimatePresence>
              {Object.entries(activeVariables).map(([key, value]: [string, any]) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                  className="bg-[#161616] border border-[#333] rounded-lg px-3 py-2 min-w-[120px] shadow-lg flex flex-col gap-1 h-fit"
                  style={{ fontSize: memoryFontSize }}
                >
                  <span className="text-white/50 font-mono tracking-wider opacity-60" style={{ fontSize: memoryFontSize * 0.85 }}>{key}</span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {value.history.map((hist: VariableHistoryType, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        {hist.val !== undefined && hist.val !== null && (
                          <span className="font-mono text-white/30 line-through">
                            {typeof hist.val === 'string' ? `"${hist.val}"` : String(hist.val)}
                          </span>
                        )}
                        {hist.op && (
                          <div className="flex bg-white/5 border border-white/10 px-1 py-0.5 rounded shadow-sm font-mono text-white/40" style={{ fontSize: memoryFontSize * 0.75 }}>
                             {hist.op.split(/(\b[a-zA-Z_]\w*\b)/g).map((token: string, tIdx: number) => {
                               if (!token) return null;
                               const isVar = /^[a-zA-Z_]\w*$/.test(token) && hist.env && hist.env[token] !== undefined;
                               return (
                                 <div key={tIdx} className="flex flex-col items-center">
                                   <span className="leading-none whitespace-pre">{token}</span>
                                   {isVar && (
                                     <span className="font-bold text-sky-400 mt-0.5 leading-none" style={{ fontSize: memoryFontSize * 0.65 }}>
                                       {typeof hist.env![token] === 'string' ? `"${hist.env![token]}"` : String(hist.env![token])}
                                     </span>
                                   )}
                                 </div>
                               );
                             })}
                          </div>
                        )}
                        <ChevronRight className="w-3 h-3 text-white/20" />
                      </div>
                    ))}
                    {value.currentValue !== undefined && value.currentValue !== null && (
                      <span className="font-mono text-emerald-400 font-bold">
                        {typeof value.currentValue === 'string' ? `"${value.currentValue}"` : String(value.currentValue)}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
              {Object.keys(activeVariables).length === 0 && (
                <div className="w-full h-full flex items-center justify-center opacity-20">
                   <span className="text-xs font-mono">Nenhuma variável alocada</span>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </footer>

      {/* Debug Info Overlay */}
      <AnimatePresence>
        {debugMode && currentLine !== null && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-60 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 border border-orange-400/30"
          >
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-black tracking-widest opacity-60">Execução Passo a Passo</span>
              <span className="text-base font-bold">Linha {currentLine + 1}</span>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="max-w-xs">
              <p className="text-xs font-medium leading-tight">
                {explanations.find(e => e.line === currentLine + 1)?.text || "Processando instrução..."}
              </p>
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              <button 
                onClick={handleRewindStep}
                disabled={!isExecuting || currentLine === null}
                className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Voltar um passo"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleNextStep}
                disabled={!isExecuting || currentLine === null}
                className="p-2 bg-white text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                title="Avançar um passo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
