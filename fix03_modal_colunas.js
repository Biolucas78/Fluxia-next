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

// ── Verificações precisas (idx = linha - 1) ───────────────────────────────────
// Confirmado pelo terminal:
// Linha 1788 (idx 1787): <div bg-slate-50 ... space-y-4>  ← início Dimensões
// Linha 1830 (idx 1829): </div>                            ← fecha Dimensões
// Linha 1831 (idx 1830): </section>                        ← fecha section Documentação
// Linha 1832 (idx 1831): (vazia)
// Linha 1833 (idx 1832): <section className="space-y-4">  ← Rastreamento

function chk(idx, expected, label) {
  if (!lines[idx] || !lines[idx].includes(expected)) {
    console.error(`ERRO [${label}] linha ${idx+1}: esperava "${expected}"`);
    console.error('  Encontrado: "' + (lines[idx] || '') + '"');
    process.exit(1);
  }
  console.log(`OK [${label}] linha ${idx+1}`);
}

chk(1787, 'bg-slate-50',         'div Dimensões start');
chk(1789, 'Dimensões da Caixa',  'Dimensões title');
chk(1829, '</div>',              'div Dimensões end');
chk(1830, '</section>',          'section Documentação end');
chk(1832, 'space-y-4',           'section Rastreamento start');

// Encontrar dinamicamente os demais blocos
function findLine(str, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].includes(str)) return i;
  }
  return -1;
}

// Frete: section que contém "Frete e Envio"
const idxFreteTitle   = findLine('Frete e Envio');
const idxFreteSection = findLine('<section', idxFreteTitle - 15);

// InfoEnvio: section que contém "Informações de Envio"
const idxInfoTitle    = findLine('Informações de Envio');
const idxInfoSection  = findLine('<section', idxInfoTitle - 10);

// Histórico
const idxHistorico    = findLine('statusHistory && order.statusHistory.length > 0');

// Right Column
const idxRightCol     = findLine('Right Column: Products Checklist');
let colEsqEndIdx = idxRightCol - 1;
while (lines[colEsqEndIdx].trim() === '') colEsqEndIdx--;

console.log('\nMarcadores encontrados:');
console.log('  Frete section:   linha', idxFreteSection + 1);
console.log('  InfoEnvio section: linha', idxInfoSection + 1);
console.log('  Histórico:       linha', idxHistorico + 1);
console.log('  Right Column:    linha', idxRightCol + 1);
console.log('  Fim col esquerda: linha', colEsqEndIdx + 1, '→', lines[colEsqEndIdx].trim());

if ([idxFreteSection, idxInfoSection, idxHistorico, idxRightCol].includes(-1)) {
  console.error('ERRO: Algum marcador não encontrado.');
  process.exit(1);
}

// ── Extrair blocos ────────────────────────────────────────────────────────────
// dimDivStart..dimDivEnd: a <div> de Dimensões (idx 1787 a 1830, exclusive)
const blocoDimensoes    = lines.slice(1787, 1830);  // idx 1787–1829 = 43 linhas

// Rastreamento: idx 1832 até idxFreteSection (exclusive)
const blocoRastreamento = lines.slice(1832, idxFreteSection);

// Frete: idxFreteSection até idxInfoSection (exclusive)
const blocoFrete        = lines.slice(idxFreteSection, idxInfoSection);

// InfoEnvio: idxInfoSection até idxHistorico (exclusive)
const blocoInfoEnvio    = lines.slice(idxInfoSection, idxHistorico);

// Histórico: idxHistorico até colEsqEndIdx (exclusive)
const blocoHistorico    = lines.slice(idxHistorico, colEsqEndIdx);

// Coluna direita: idxRightCol em diante
const colunaDireita     = lines.slice(idxRightCol);

console.log('\nTamanhos dos blocos:');
console.log('  Dimensões:', blocoDimensoes.length, '| primeira:', blocoDimensoes[0]?.trim().slice(0, 50));
console.log('  Rastreamento:', blocoRastreamento.length, '| primeira:', blocoRastreamento[0]?.trim().slice(0, 50));
console.log('  Frete:', blocoFrete.length, '| primeira:', blocoFrete[0]?.trim().slice(0, 50));
console.log('  InfoEnvio:', blocoInfoEnvio.length, '| primeira:', blocoInfoEnvio[0]?.trim().slice(0, 50));
console.log('  Histórico:', blocoHistorico.length, '| primeira:', blocoHistorico[0]?.trim().slice(0, 50));
console.log('  Coluna direita:', colunaDireita.length, '| primeira:', colunaDireita[0]?.trim().slice(0, 50));

// ── Nova coluna esquerda ──────────────────────────────────────────────────────
// Tudo antes de Dimensões (0..1786) + </section> (idx 1830) + Histórico + </div> col
const novaEsquerda = [
  ...lines.slice(0, 1787),     // até linha 1787 (idx 1786, vazia) inclusive
  lines[1830],                  // </section> que fecha a section de Documentação
  '',
  ...blocoHistorico,
  lines[colEsqEndIdx],          // </div> da coluna esquerda
];

// ── Nova coluna direita ───────────────────────────────────────────────────────
// Encontrar o </div> que fecha o grid (10 espaços)
let gridCloseIdx = -1;
for (let i = colunaDireita.length - 1; i >= 0; i--) {
  if (colunaDireita[i].trim() === '</div>' && colunaDireita[i].match(/^ {10}<\/div>/)) {
    gridCloseIdx = i;
    break;
  }
}
if (gridCloseIdx === -1) {
  // fallback
  for (let i = colunaDireita.length - 1; i >= 0; i--) {
    if (colunaDireita[i].trim() === '</div>' && colunaDireita[i].startsWith('          ')) {
      gridCloseIdx = i;
      break;
    }
  }
}
if (gridCloseIdx === -1) {
  console.error('ERRO: Fechamento do grid não encontrado.');
  colunaDireita.slice(-10).forEach((l, i) => console.log(`  ${i}: "${l}"`));
  process.exit(1);
}
console.log(`\nFechamento do grid: pos ${gridCloseIdx} → "${colunaDireita[gridCloseIdx]}"`);

// Dimensões envolto em section própria na coluna direita
const dimensoesSection = [
  '                <section className="space-y-4">',
  ...blocoDimensoes,
  '                </section>',
];

const novaColunaDireita = [
  ...colunaDireita.slice(0, gridCloseIdx),
  ...dimensoesSection,
  ...blocoRastreamento,
  ...blocoFrete,
  ...blocoInfoEnvio,
  colunaDireita[gridCloseIdx],
  ...colunaDireita.slice(gridCloseIdx + 1),
];

// ── Montar e verificar ────────────────────────────────────────────────────────
const novoArquivo = [...novaEsquerda, ...novaColunaDireita].join('\n');

const termos = [
  'Dados do Cliente', 'Texto Original do Pedido', 'Condições de Pagamento',
  'Origem do Pedido', 'Documentação', 'Histórico do Pedido',
  'Itens do Pedido', 'Observações do Pedido',
  'Dimensões da Caixa', 'Rastreamento em Tempo Real', 'Frete e Envio', 'Informações de Envio',
];

console.log('\nVerificações finais:');
let allOk = true;
for (const t of termos) {
  if (novoArquivo.includes(t)) {
    console.log(`  ✓ "${t}"`);
  } else {
    console.error(`  ✗ FALTANDO: "${t}"`);
    allOk = false;
  }
}

if (!allOk) {
  console.error('\nERRO: Arquivo incompleto. Não salvo.');
  process.exit(1);
}

fs.writeFileSync(filePath, novoArquivo, 'utf8');
console.log('\n✅ Arquivo salvo! Execute: npx tsc --noEmit');