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

let content = fs.readFileSync(filePath, 'utf8');

// Localizar o fim da seção de origem — logo antes de </section> que precede Documentação
const OLD = `                </div>
              </section>
              <section className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="size-4" /> Documentação
                    </h3>`;

const NEW = `                </div>

                {/* Tag Amostra */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => onUpdateOrder({
                      ...order,
                      isSample: !order.isSample,
                      statusHistory: [...(order.statusHistory || []), {
                        action: (order.isSample ? 'Desmarcou' : 'Marcou') + ' tag Amostra',
                        timestamp: new Date().toISOString()
                      }]
                    })}
                    className={[
                      'px-3 py-2 rounded-xl text-[10px] font-bold border transition-all',
                      order.isSample
                        ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-200 dark:shadow-violet-900/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400 hover:text-violet-600'
                    ].join(' ')}
                  >
                    🎁 Amostra
                  </button>
                  {order.isSample && (
                    <span className="text-[10px] text-violet-500 font-bold">
                      Este pedido não aparece no Financeiro
                    </span>
                  )}
                </div>

              </section>
              <section className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="size-4" /> Documentação
                    </h3>`;

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho nao encontrado.');
  console.error('Rode: grep -n "Documentacao" components/OrderDetailsModal.tsx | head -5');
  process.exit(1);
}

content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Botao Amostra adicionado na secao de origem.');
console.log('Proximo passo: npx tsc --noEmit');