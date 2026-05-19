const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/KanbanBoard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/KanbanBoard.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: KanbanBoard.tsx não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = "          if (filterTag === 'hasBoleto' && !o.hasBoleto) return false;";
const NEW = [
  "          if (filterTag === 'hasBoleto' && !o.hasBoleto) return false;",
  "          if (filterTag === 'semDocumento' && ((o as any).invoiceLinked || (o as any).boletoLinked || (o as any).noInvoiceLinked)) return false;",
].join('\n');

if (!content.includes(OLD)) { console.error('ERRO: Trecho não encontrado.'); process.exit(1); }
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Filtro semDocumento adicionado.');