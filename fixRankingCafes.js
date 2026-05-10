const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/Dashboard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/Dashboard.tsx'),
];
let filePath = null;
for (const p of possiblePaths) { if (fs.existsSync(p)) { filePath = p; break; } }
if (!filePath) { console.error('ERRO: Dashboard.tsx nao encontrado.'); process.exit(1); }
console.log('Arquivo encontrado em:', filePath);
let content = fs.readFileSync(filePath, 'utf8');

const OLD = `  const coffeeRanking = useMemo(() => {
    const totals: Record<string, number> = {
      'Catuaí': 0,
      'Torra Clara': 0,
      'Torra Intensa': 0,
      'Bourbon': 0,
      'Yellow': 0,
      'Gourmet': 0,
      'Gourmet Personalizado': 0,
      'DripCoffee': 0,
    };
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    orders.forEach(order => {
      if (!producedStatuses.includes(order.status)) return;
      order.products.forEach(product => {
        const tipo = normalizeTipo(product.name);
        if (!tipo) return;
        let kg = 0;
        if (tipo === 'DripCoffee') {
          kg = 0.1 * product.quantity;
        } else {
          const weightMatch = product.weight.match(/(\\d+)\\s*(g|kg)/i);
          if (!weightMatch) return;
          const value = parseInt(weightMatch[1]);
          const unit = weightMatch[2].toLowerCase();
          kg = (unit === 'kg' ? value : value / 1000) * product.quantity;
        }
        if (kg > 0 && totals[tipo] !== undefined) totals[tipo] += kg;
      });
    });`;

const NEW = `  const coffeeRanking = useMemo(() => {
    // Apenas os 6 tipos canônicos — Gourmet Personalizado e DripCoffee somam nos pais
    const totals: Record<string, number> = {
      'Catuaí': 0,
      'Torra Clara': 0,
      'Torra Intensa': 0,
      'Bourbon': 0,
      'Yellow': 0,
      'Gourmet': 0,
    };
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    orders.forEach(order => {
      if (!producedStatuses.includes(order.status)) return;
      order.products.forEach(product => {
        const tipo = normalizeTipo(product.name);
        if (!tipo) return;
        let kg = 0;
        // DripCoffee → Catuaí (0,1kg por unidade)
        if (tipo === 'DripCoffee') {
          kg = 0.1 * product.quantity;
          totals['Catuaí'] += kg;
          return;
        }
        // Gourmet Personalizado → Gourmet
        const tipoCanônico = tipo === 'Gourmet Personalizado' ? 'Gourmet' : tipo;
        if (totals[tipoCanônico] === undefined) return;
        const weightMatch = product.weight.match(/(\\d+)\\s*(g|kg)/i);
        if (!weightMatch) return;
        const value = parseInt(weightMatch[1]);
        const unit = weightMatch[2].toLowerCase();
        kg = (unit === 'kg' ? value : value / 1000) * product.quantity;
        if (kg > 0) totals[tipoCanônico] += kg;
      });
    });`;

if (!content.includes(OLD)) {
  console.error('ERRO: trecho coffeeRanking nao encontrado.');
  process.exit(1);
}
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: coffeeRanking corrigido — 6 tipos canônicos, DripCoffee→Catuaí, Gourmet Personalizado→Gourmet.');
console.log('SUCESSO.');