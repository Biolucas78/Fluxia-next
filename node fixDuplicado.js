const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/Dashboard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/Dashboard.tsx'),
];

let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Linha 149 (índice 148) tem o }; duplicado — remover
if (lines[148].trim() === '};') {
  lines.splice(148, 1);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('OK: Linha duplicada removida.');
} else {
  console.error('ERRO: Linha 149 nao contem o }; esperado. Conteudo: ' + lines[148]);
  process.exit(1);
}