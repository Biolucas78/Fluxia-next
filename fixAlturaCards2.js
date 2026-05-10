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

// PASSO 1: Voltar items-stretch para items-start no grid
const OLD_GRID = `      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">`;
const NEW_GRID = `      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">`;

if (!content.includes(OLD_GRID)) {
  console.error('ERRO no Passo 1: grid nao encontrado.');
  process.exit(1);
}
content = content.replace(OLD_GRID, NEW_GRID);
console.log('Passo 1 OK: items-stretch -> items-start.');

// PASSO 2: Ranking — adicionar altura fixa
const OLD_RANKING = `        {/* 🏆 Ranking de Cafés */}
        <div className="flex flex-col gap-3 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">`;
const NEW_RANKING = `        {/* 🏆 Ranking de Cafés */}
        <div className="flex flex-col gap-3 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm h-[480px]">`;

if (!content.includes(OLD_RANKING)) {
  console.error('ERRO no Passo 2: card Ranking nao encontrado.');
  process.exit(1);
}
content = content.replace(OLD_RANKING, NEW_RANKING);
console.log('Passo 2 OK: Ranking com h-[500px].');

// PASSO 3: Volume por Embalagem — altura fixa + scroll interno
const OLD_PKG = `        {/* 📦 Volume por Embalagem */}
        <div className="flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full">`;
const NEW_PKG = `        {/* 📦 Volume por Embalagem */}
        <div className="flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-[500px]">`;

if (!content.includes(OLD_PKG)) {
  console.error('ERRO no Passo 3: card Volume nao encontrado.');
  process.exit(1);
}
content = content.replace(OLD_PKG, NEW_PKG);
console.log('Passo 3 OK: Volume por Embalagem com h-[500px].');

// PASSO 4: Geografia — altura fixa + scroll interno
const OLD_GEO = `        {/* 🌍 Geografia */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm h-full overflow-y-auto custom-scrollbar">`;
const NEW_GEO = `        {/* 🌍 Geografia */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm h-[500px] overflow-y-auto custom-scrollbar">`;

if (!content.includes(OLD_GEO)) {
  console.error('ERRO no Passo 4: card Geografia nao encontrado.');
  process.exit(1);
}
content = content.replace(OLD_GEO, NEW_GEO);
console.log('Passo 4 OK: Geografia com h-[500px].');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nSUCESSO: Todos os cards da linha 2 com h-[500px].');