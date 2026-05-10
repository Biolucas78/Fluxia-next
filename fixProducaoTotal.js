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
if (!filePath) {
  console.error('ERRO: Dashboard.tsx nao encontrado.');
  process.exit(1);
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Verificar linhas certas
if (!lines[130].includes('filteredStats')) {
  console.error('ERRO: Linha 131 nao contem filteredStats. Conteudo: ' + lines[130]);
  process.exit(1);
}
if (!lines[146].includes('totalClients: clients.size')) {
  console.error('ERRO: Linha 147 nao contem totalClients. Conteudo: ' + lines[146]);
  process.exit(1);
}
console.log('Verificacao de linhas OK.');

const newBlock = `  const filteredStats = useMemo(() => {
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    let totalKg = 0;
    let totalUnits = 0;
    const clients = new Set<string>();
    orders.forEach(o => {
      if (!producedStatuses.includes(o.status)) return;
      o.products.forEach(p => {
        totalKg += calculateWeightInKg(p.weight, p.quantity);
        totalUnits += p.quantity;
      });
      clients.add(o.clientName);
    });
    return {
      totalKg,
      totalUnits,
      totalClients: clients.size
    };`.split('\n');

// Substituir linhas 131-147 (índices 130-146) pelo novo bloco
const before = lines.slice(0, 130);
const after = lines.slice(147);

const newLines = [...before, ...newBlock, ...after];
fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log('OK: filteredStats corrigido para filtrar por status de producao.');
console.log('');
console.log('SUCESSO.');