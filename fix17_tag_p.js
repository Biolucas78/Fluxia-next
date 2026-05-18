const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/OrderCard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderCard.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: OrderCard.tsx não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = "          {((order as any).invoiceLinked || (order as any).boletoLinked) && (";
const NEW = "          {((order as any).invoiceLinked || (order as any).boletoLinked || (order as any).noInvoiceLinked) && (";

if (!content.includes(OLD)) { console.error('ERRO: Trecho não encontrado.'); process.exit(1); }
content = content.replace(OLD, NEW);

const OLD2 = [
  '              {(order as any).boletoLinked && (',
  '                <span className="text-[8px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-md" title="Boleto vinculado">B</span>',
  '              )}',
].join('\n');

const NEW2 = [
  '              {(order as any).boletoLinked && (',
  '                <span className="text-[8px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-md" title="Boleto vinculado">B</span>',
  '              )}',
  '              {(order as any).noInvoiceLinked && (',
  '                <span className="text-[8px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-1 py-0.5 rounded-md" title="Pedido Bling vinculado">P</span>',
  '              )}',
].join('\n');

if (!content.includes(OLD2)) { console.error('ERRO: Trecho boleto não encontrado.'); process.exit(1); }
content = content.replace(OLD2, NEW2);

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Tag P adicionada.');