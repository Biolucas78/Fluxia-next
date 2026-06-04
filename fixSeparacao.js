const fs = require('fs');
const path = require('path');

const paths = [
  'components/Dashboard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/Dashboard.tsx'),
];
let filePath = null;
for (const p of paths) { if (fs.existsSync(p)) { filePath = p; break; } }
if (!filePath) { console.error('ERRO: Dashboard.tsx nao encontrado.'); process.exit(1); }
console.log('Arquivo encontrado em:', filePath);

let content = fs.readFileSync(filePath, 'utf8');

// Corrigir as duas comparacoes que usam grindType direto
const OLD = `                      const affected = pedidos.filter(order => order.products.some(p => {
                        const grind = p.grindType !== 'N/A' ? \` (\${p.grindType})\` : '';
                        return \`\${p.name} \${p.weight}\${grind}\` === item.name && !p.checked;
                      }));
                      if (affected.length > 0) {
                        await saveToHistory('minicard', \`Separou: \${item.qty}x \${item.name}\`, affected);
                      }
                      pedidos.forEach(order => {
                        let hasChange = false;
                        const updatedProducts = order.products.map(p => {
                          const grind = p.grindType !== 'N/A' ? \` (\${p.grindType})\` : '';
                          const productKey = \`\${p.name} \${p.weight}\${grind}\`;
                          if (productKey === item.name && !p.checked) {`;

const NEW = `                      const affected = pedidos.filter(order => order.products.some(p => {
                        const grindNorm = normalizeGrindForKey(p.grindType || '');
                        const grind = grindNorm ? \` (\${grindNorm})\` : '';
                        return \`\${p.name.trim()} \${(p.weight || '').trim()}\${grind}\` === item.name && !p.checked;
                      }));
                      if (affected.length > 0) {
                        await saveToHistory('minicard', \`Separou: \${item.qty}x \${item.name}\`, affected);
                      }
                      pedidos.forEach(order => {
                        let hasChange = false;
                        const updatedProducts = order.products.map(p => {
                          const grindNorm = normalizeGrindForKey(p.grindType || '');
                          const grind = grindNorm ? \` (\${grindNorm})\` : '';
                          const productKey = \`\${p.name.trim()} \${(p.weight || '').trim()}\${grind}\`;
                          if (productKey === item.name && !p.checked) {`;

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho nao encontrado. Me mande essa mensagem para investigar.');
  process.exit(1);
}

content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Comparacao de grindType corrigida nas duas ocorrencias.');