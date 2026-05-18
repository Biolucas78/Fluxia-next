const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'app/api/check-lock/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/check-lock/route.ts'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: check-lock/route.ts não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = "    if (!type || !value) return NextResponse.json({ locked: false });";
const NEW = [
  "    if (!type || !value) return NextResponse.json({ locked: false });",
  "    // Normalizar: remover zeros à esquerda para comparação consistente",
  "    const normalizedValue = String(value).trim().replace(/^0+/, '') || String(value);",
].join('\n');

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado.'); process.exit(1);
}
content = content.replace(OLD, NEW);

// Usar normalizedValue nas queries
content = content.replace(
  ".where('invoiceNumber', '==', String(value))",
  ".where('invoiceNumber', '==', normalizedValue)"
);
content = content.replace(
  ".where('boletoNossoNumero', '==', String(value))",
  ".where('boletoNossoNumero', '==', normalizedValue)"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: check-lock normaliza zeros à esquerda.');