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
if (!filePath) { console.error('ERRO: Arquivo não encontrado.'); process.exit(1); }

const lines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log('Total de linhas:', lines.length);

function findLine(str, from = 0, exact = false) {
  for (let i = from; i < lines.length; i++) {
    if (exact ? lines[i].trim() === str : lines[i].includes(str)) return i;
  }
  return -1;
}

// ── Encontrar todos os limites de forma dinâmica ──────────────────────────────

// 1. Dimensões: a <div> que contém "Dimensões da Caixa"
const idxDimTitle = findLine('Dimensões da Caixa (cm)');
// Procurar a <div> imediatamente acima do título (máx 3 linhas acima)
let dimDivStart = -1;
for (let i = idxDimTitle - 1; i >= idxDimTitle - 5; i--) {
  if (lines[i].trim().startsWith('<div ') && lines[i].includes('bg-slate-50')) {
    dimDivStart = i;
    break;
  }
}
if (dimDivStart === -1) { console.error('ERRO: <div> de Dimensões não encontrada.'); process.exit(1); }

// Encontrar o </div> que fecha essa div (contando abertura/fechamento)
let depth = 0;
let dimDivEnd = -1;
for (let i = dimDivStart; i < lines.length; i++) {
  const t = lines[i].trim();
  const opens = (t.match(/<div[\s>]/g) || []).length;
  const closes = (t.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (depth === 0 && i > dimDivStart) { dimDivEnd = i; break; }
}
if (dimDivEnd === -1) { console.error('ERRO: </div> de Dimensões não encontrado.'); process.exit(1); }

// A </section> que fecha Documentação+Dimensões vem logo após dimDivEnd
let sectionDocEnd = -1;
for (let i = dimDivEnd + 1; i <= dimDivEnd + 5; i++) {
  if (lines[i] && lines[i].trim() === '</section>') { sectionDocEnd = i; break; }
}
if (sectionDocEnd === -1) { console.error('ERRO: </section> após Dimensões não encontrada.'); process.exit(1); }

console.log('dimDivStart:', dimDivStart + 1, '→', lines[dimDivStart].trim().slice(0, 50));
console.log('dimDivEnd:', dimDivEnd + 1, '→', lines[dimDivEnd].trim());
console.log('sectionDocEnd:', sectionDocEnd + 1, '→', lines[sectionDocEnd].trim());

// 2. Section de Rastreamento: começa logo após sectionDocEnd
let rastSectionStart = -1;
for (let i = sectionDocEnd + 1; i <= sectionDocEnd + 5; i++) {
  if (lines[i] && lines[i].trim().startsWith('<section')) { rastSectionStart = i; break; }
}
if (rastSectionStart === -1) { console.error('ERRO: section Rastreamento não encontrada.'); process.exit(1); }
console.log('rastSectionStart:', rastSectionStart + 1, '→', lines[rastSectionStart].trim());

// 3. Section de Frete e Envio
const idxFreteTitle = findLine('Frete e Envio');
let freteSectionStart = -1;
for (let i = idxFreteTitle - 1; i >= idxFreteTitle - 10; i--) {
  if (lines[i].trim().startsWith('<section')) { freteSectionStart = i; break; }
}
if (freteSectionStart === -1) { console.error('ERRO: section Frete não encontrada.'); process.exit(1); }
console.log('freteSectionStart:', freteSectionStart + 1);

// 4. Section de Informações de Envio
const idxInfoTitle = findLine('Informações de Envio');
let infoSectionStart = -1;
for (let i = idxInfoTitle - 1; i >= idxInfoTitle - 10; i--) {
  if (lines[i].trim().startsWith('<section')) { infoSectionStart = i; break; }
}
if (infoSectionStart === -1) { console.error('ERRO: section InfoEnvio não encontrada.'); process.exit(1); }
console.log('infoSectionStart:', infoSectionStart + 1);

// 5. Encontrar o fim de InfoEnvio (a </section> que a fecha)
// É a </section> que vem após o conteúdo de InfoEnvio
// Encontrar contando tags dentro da section
let infoSectionEnd = -1;
let depthInfo = 0;
let inSection = false;
for (let i = infoSectionStart; i < lines.length; i++) {
  const t = lines[i].trim();
  if (i === infoSectionStart) { inSection = true; depthInfo = 1; continue; }
  if (!inSection) continue;
  if (t.startsWith('<section')) depthInfo++;
  if (t === '</section>') { depthInfo--; if (depthInfo === 0) { infoSectionEnd = i; break; } }
}
if (infoSectionEnd === -1) { console.error('ERRO: fim section InfoEnvio não encontrado.'); process.exit(1); }
console.log('infoSectionEnd:', infoSectionEnd + 1);

// 6. Verificar se há section extra após InfoEnvio (carrier display) antes do Histórico
const idxHistorico = findLine('statusHistory && order.statusHistory.length > 0');
console.log('idxHistorico:', idxHistorico + 1);

// Tudo entre infoSectionEnd+1 e idxHistorico pode ter seções extras (ex: carrier display)
// Incluir no bloco InfoEnvio
const blocoInfoEnvioFull = lines.slice(infoSectionStart, idxHistorico);
console.log('blocoInfoEnvioFull:', blocoInfoEnvioFull.length, 'linhas');

// 7. Right Column
const idxRightCol = findLine('Right Column: Products Checklist');
let colEsqEnd = idxRightCol - 1;
while (colEsqEnd > 0 && lines[colEsqEnd].trim() === '') colEsqEnd--;
console.log('colEsqEnd:', colEsqEnd + 1, '→', lines[colEsqEnd].trim());
console.log('idxRightCol:', idxRightCol + 1);

// 8. Fim da section da coluna direita (</section> que fecha Itens+Observações)
// É a </section> antes do </div> que fecha o grid
// O grid fecha com </div> com ~10 espaços, depois </div> com ~8 espaços
// Observações termina com </section> seguido de </div></div>
const idxObsComment = findLine('Observações do Pedido', idxRightCol);
// Procurar o </section> após as Observações
let rightSecClose = -1;
for (let i = idxObsComment + 30; i < idxObsComment + 100; i++) {
  if (lines[i] && lines[i].trim() === '</section>' && lines[i].includes('            ')) {
    // Verificar que é seguido de </div></div>
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === '') next++;
    if (lines[next] && lines[next].trim() === '</div>') {
      rightSecClose = i;
      break;
    }
  }
}
if (rightSecClose === -1) {
  // fallback: última </section> antes do footer
  const idxFooter = findLine('Footer Actions');
  for (let i = idxFooter - 1; i >= idxFooter - 10; i--) {
    if (lines[i] && lines[i].trim() === '</section>') { rightSecClose = i; break; }
  }
}
if (rightSecClose === -1) { console.error('ERRO: fim section coluna direita não encontrado.'); process.exit(1); }
console.log('rightSecClose:', rightSecClose + 1, '→', lines[rightSecClose].trim());

// ── Extrair blocos ────────────────────────────────────────────────────────────
const blocoDimensoes    = lines.slice(dimDivStart, dimDivEnd + 1);
const blocoRastreamento = lines.slice(rastSectionStart, freteSectionStart);
const blocoFrete        = lines.slice(freteSectionStart, infoSectionStart);
const blocoInfoEnvio    = blocoInfoEnvioFull;
const blocoHistorico    = lines.slice(idxHistorico, colEsqEnd);

console.log('\nBlocos extraídos:');
console.log('  Dimensões:', blocoDimensoes.length);
console.log('  Rastreamento:', blocoRastreamento.length);
console.log('  Frete:', blocoFrete.length);
console.log('  InfoEnvio:', blocoInfoEnvio.length);
console.log('  Histórico:', blocoHistorico.length);

// ── Montar novo arquivo ───────────────────────────────────────────────────────
const novoArquivo = [
  // COLUNA ESQUERDA
  ...lines.slice(0, dimDivStart),          // tudo antes da <div> Dimensões
  lines[sectionDocEnd],                     // </section> fecha Documentação
  '',
  ...blocoHistorico,                        // Histórico do Pedido
  lines[colEsqEnd],                         // </div> fecha coluna esquerda
  '',
  // COLUNA DIREITA
  ...lines.slice(idxRightCol, rightSecClose),  // Right Column + Itens + Observações
  // Dimensões com section wrapper
  '                <section className="space-y-4">',
  ...blocoDimensoes,
  '                </section>',
  // Rastreamento, Frete, InfoEnvio (já têm suas próprias sections)
  ...blocoRastreamento,
  ...blocoFrete,
  ...blocoInfoEnvio,
  lines[rightSecClose],                     // </section> fecha coluna direita
  ...lines.slice(rightSecClose + 1),        // resto (</div></div> footer etc)
].join('\n');

// ── Verificações ──────────────────────────────────────────────────────────────
const termos = [
  'Dados do Cliente', 'Texto Original do Pedido', 'Condições de Pagamento',
  'Origem do Pedido', 'Documentação', 'Histórico do Pedido',
  'Itens do Pedido', 'Observações do Pedido',
  'Dimensões da Caixa', 'Rastreamento em Tempo Real', 'Frete e Envio', 'Informações de Envio',
];

console.log('\nVerificações:');
let ok = true;
for (const t of termos) {
  if (novoArquivo.includes(t)) { console.log(`  ✓ ${t}`); }
  else { console.error(`  ✗ FALTANDO: ${t}`); ok = false; }
}

if (!ok) { console.error('\nNão salvo.'); process.exit(1); }

fs.writeFileSync(filePath, novoArquivo, 'utf8');
console.log('\n✅ Salvo! Execute: npx tsc --noEmit');