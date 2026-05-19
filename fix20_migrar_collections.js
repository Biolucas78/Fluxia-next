const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'app/api/migrar-banco/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/migrar-banco/route.ts'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: route.ts não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = `const COLLECTIONS = [
  'orders', 'leads', 'clientes', 'bling_customers', 'products',
  'inventory', 'recurrence_messages',
];`;

const NEW = `const COLLECTIONS = [
  'orders', 'leads', 'clientes', 'bling_customers', 'products',
  'inventory', 'recurrence_messages', 'bling_config', 'product_mapping',
];`;

if (!content.includes(OLD)) { console.error('ERRO: Trecho não encontrado.'); process.exit(1); }
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: bling_config e product_mapping adicionados à migração.');