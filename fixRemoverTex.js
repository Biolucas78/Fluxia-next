const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/OrderDetailsModal.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderDetailsModal.tsx'),
];
let filePath = null;
for (const p of possiblePaths) { if (fs.existsSync(p)) { filePath = p; break; } }
if (!filePath) { console.error('ERRO: arquivo nao encontrado.'); process.exit(1); }
console.log('Arquivo encontrado em:', filePath);

const lines = fs.readFileSync(filePath, 'utf8').split('\n');

if (!lines[693].includes('Buscar cotacoes em paralelo')) {
  console.error('ERRO: Linha 694 errada: ' + lines[693]); process.exit(1);
}
if (!lines[739].includes('onUpdateOrder')) {
  console.error('ERRO: Linha 740 errada: ' + lines[739]); process.exit(1);
}
console.log('Verificacao OK.');

const newBlock = [
  "      const response = await fetch('/api/shipping/quote', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  "        body: JSON.stringify({",
  "          destinationCep,",
  "          weight: totalWeightG,",
  "          products: targetOrder.products,",
  "          boxDimensions: targetOrder.boxDimensions,",
  "          originType: originType,",
  "          insuranceValue: targetOrder.insuranceValue || targetOrder.invoiceValue",
  "        })",
  "      });",
  "      if (!response.ok) {",
  "        const data = await response.json();",
  "        throw new Error(data.error || 'Erro ao buscar cotacao.');",
  "      }",
  "      const quotes: ShippingOption[] = await response.json();",
  "      onUpdateOrder({ ...order, shippingQuote: quotes });",
];

const before = lines.slice(0, 693);
const after = lines.slice(740);
fs.writeFileSync(filePath, [...before, ...newBlock, ...after].join('\n'), 'utf8');
console.log('OK: TEX removida do modal de cotacao.');
console.log('SUCESSO.');