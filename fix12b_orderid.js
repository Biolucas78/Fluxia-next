const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/OrderDetailsModal.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderDetailsModal.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: Modal não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = "        body: JSON.stringify({ \n          blingOrderId: order.blingOrderId,\n          clientName: order.clientName,\n          document: order.cnpj || order.cpf\n        })";
const NEW = "        body: JSON.stringify({ \n          blingOrderId: order.blingOrderId,\n          clientName: order.clientName,\n          document: order.cnpj || order.cpf,\n          orderId: order.id\n        })";

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado.');
  process.exit(1);
}
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: orderId adicionado na chamada get-invoice.');