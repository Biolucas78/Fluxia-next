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
if (!filePath) {
  console.error('ERRO: OrderDetailsModal.tsx nao encontrado.');
  process.exit(1);
}
console.log('Arquivo encontrado em:', filePath);

const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Localizar a linha que fecha a grid de origens (</div>) antes de </section>
// Procurar pela sequência: ))} seguido de </div> seguido de </section>
let insertLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (
    lines[i].includes('))}') &&
    lines[i+1] && lines[i+1].trim() === '</div>' &&
    lines[i+2] && lines[i+2].trim() === '</section>' &&
    lines[i+3] && lines[i+3].trim() === '<section className="space-y-6">'
  ) {
    insertLine = i + 2; // linha do </section>
    break;
  }
}

if (insertLine === -1) {
  console.error('ERRO: Nao encontrei o ponto de insercao.');
  console.error('Me mande: grep -n "))}\\|<\\/section>\\|space-y-6" components/OrderDetailsModal.tsx | head -30');
  process.exit(1);
}

console.log('Ponto de insercao encontrado na linha:', insertLine + 1);
console.log('Linha atual:', lines[insertLine]);

const newBlock = [
  '',
  '                {/* Tag Amostra */}',
  '                <div className="flex items-center gap-2 mt-1">',
  '                  <button',
  '                    onClick={() => onUpdateOrder({',
  '                      ...order,',
  '                      isSample: !order.isSample,',
  '                      statusHistory: [...(order.statusHistory || []), {',
  "                        action: (order.isSample ? 'Desmarcou' : 'Marcou') + ' tag Amostra',",
  '                        timestamp: new Date().toISOString()',
  '                      }]',
  '                    })}',
  '                    className={[',
  "                      'px-3 py-2 rounded-xl text-[10px] font-bold border transition-all',",
  '                      order.isSample',
  "                        ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-200 dark:shadow-violet-900/30'",
  "                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400 hover:text-violet-600'",
  "                    ].join(' ')}",
  '                  >',
  '                    \uD83C\uDF81 Amostra',
  '                  </button>',
  '                  {order.isSample && (',
  '                    <span className="text-[10px] text-violet-500 font-bold">',
  '                      Este pedido n\u00e3o aparece no Financeiro',
  '                    </span>',
  '                  )}',
  '                </div>',
];

// Inserir antes da linha </section>
const before = lines.slice(0, insertLine);
const after = lines.slice(insertLine);
const newLines = [...before, ...newBlock, ...after];

fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log('OK: Botao Amostra inserido com sucesso.');
console.log('Proximo passo: npx tsc --noEmit');