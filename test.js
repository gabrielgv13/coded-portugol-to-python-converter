import { translatePortugolToPython } from './src/lib/translator.ts';

const code = `programa {
    funcao inicio() {
        escreva("ola")
    }
    funcao somar(num1, num2) {
        sum = num1 + num2
    }
}`;

console.log(translatePortugolToPython(code).pythonCode);
