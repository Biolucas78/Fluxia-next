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
console.log('Arquivo:', filePath);

let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Adicionar estados pendingBoleto e boletosList após isFetchingBoleto ────
const OLD_STATE = "  const [isFetchingBoleto, setIsFetchingBoleto] = useState(false);";
const NEW_STATE = [
  "  const [isFetchingBoleto, setIsFetchingBoleto] = useState(false);",
  "  const [pendingBoleto, setPendingBoleto] = useState<any>(null);",
  "  const [boletosList, setBoletosList] = useState<any[]>([]);",
].join('\n');

if (!content.includes(OLD_STATE)) {
  console.error('ERRO: Estado isFetchingBoleto não encontrado.'); process.exit(1);
}
content = content.replace(OLD_STATE, NEW_STATE);
console.log('OK: Estados pendingBoleto e boletosList adicionados.');

// ── 2. Substituir o bloco do botão Buscar Boleto + lógica ────────────────────
const OLD_BOLETO_BLOCK = [
  "                      <button",
  "                        onClick={async () => {",
  "                          const cpfCnpj = (order.cnpj || order.cpf || '').replace(/\\D/g, '');",
  "                          if (!cpfCnpj) { toast.error('Cliente sem CPF/CNPJ cadastrado'); return; }",
  "                          setIsFetchingBoleto(true);",
  "                          try {",
  "                            const res = await fetch(`/api/sicoob/consultar?cpfCnpj=${cpfCnpj}`);",
  "                            const data = await res.json();",
  "                            if (!data.ok || !data.data) { toast.error('Nenhum boleto encontrado'); return; }",
  "                            const boletos: any[] = data.data.resultado || data.data.items || (Array.isArray(data.data) ? data.data : []);",
  "                            if (boletos.length === 0) { toast.error('Nenhum boleto encontrado para este cliente'); return; }",
  "                            let boleto = boletos[0];",
  "                            if (order.invoiceNumber) {",
  "                              const match = boletos.find((b: any) => String(b.seuNumero).trim() === String(order.invoiceNumber).trim());",
  "                              if (match) boleto = match;",
  "                            } else {",
  "                              boleto = boletos.sort((a: any, b: any) => new Date(b.dataEmissao || 0).getTime() - new Date(a.dataEmissao || 0).getTime())[0];",
  "                            }",
  "                            const updates: any = { hasBoleto: true };",
  "                            if (boleto.nossoNumero) updates.boletoNossoNumero = String(boleto.nossoNumero);",
  "                            if (boleto.valor) updates.invoiceValue = boleto.valor;",
  "                            if (boleto.dataVencimento) updates.paymentDueDate = boleto.dataVencimento;",
  "                            if (boleto.dataEmissao) updates.paymentDate = boleto.dataEmissao;",
  "                            if (boleto.situacaoBoleto === 'LIQUIDADO') updates.paymentStatus = 'pago';",
  "                            onUpdateOrder({ ...order, ...updates, statusHistory: [...(order.statusHistory || []), { action: 'Boleto encontrado no Sicoob', details: `NF: ${boleto.seuNumero || 'N/A'} | NossoNumero: ${boleto.nossoNumero || 'N/A'}`, timestamp: new Date().toISOString() }] });",
  "                            setBoletoData({ nossoNumero: String(boleto.nossoNumero || ''), seuNumero: String(boleto.seuNumero || ''), valor: boleto.valor || 0, dataEmissao: boleto.dataEmissao || '', dataVencimento: boleto.dataVencimento || '', situacao: boleto.situacaoBoleto || '' });",
  "                            toast.success(`Boleto NF ${boleto.seuNumero} encontrado`);",
  "                          } catch (e: any) {",
  "                            toast.error('Erro ao buscar boleto: ' + e.message);",
  "                          } finally {",
  "                            setIsFetchingBoleto(false);",
  "                          }",
  "                        }}",
  "                        className=\"text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-3 mt-1\"",
  "                      >",
  "                        {isFetchingBoleto ? <Loader2 className=\"size-3 animate-spin\" /> : <RefreshCw className=\"size-3\" />}",
  "                        {order.hasBoleto ? 'Atualizar Boleto' : 'Buscar Boleto no Sicoob'}",
  "                      </button>",
].join('\n');

const NEW_BOLETO_BLOCK = [
  "                      {/* Botão Buscar Boleto — sempre visível */}",
  "                      <div className=\"flex items-center gap-2 px-3 mt-1\">",
  "                        <button",
  "                          onClick={async () => {",
  "                            const cpfCnpj = (order.cnpj || order.cpf || '').replace(/\\D/g, '');",
  "                            if (!cpfCnpj) { toast.error('Cliente sem CPF/CNPJ cadastrado'); return; }",
  "                            setIsFetchingBoleto(true);",
  "                            setPendingBoleto(null);",
  "                            setBoletosList([]);",
  "                            try {",
  "                              const res = await fetch(`/api/sicoob/consultar?cpfCnpj=${cpfCnpj}`);",
  "                              const data = await res.json();",
  "                              if (!data.ok || !data.data) { toast.error('Nenhum boleto encontrado'); return; }",
  "                              const boletos: any[] = data.data.resultado || data.data.items || (Array.isArray(data.data) ? data.data : []);",
  "                              if (boletos.length === 0) { toast.error('Nenhum boleto encontrado para este cliente'); return; }",
  "                              // Normalizar NF para match",
  "                              const norm = (v: any) => String(v || '').trim().replace(/^0+/, '') || '0';",
  "                              const nfNorm = norm(order.invoiceNumber);",
  "                              // Match perfeito: seuNumero normalizado + valor igual",
  "                              const perfectMatch = boletos.find((b: any) => {",
  "                                const nfOk = nfNorm !== '0' && norm(b.seuNumero) === nfNorm;",
  "                                const valOk = order.invoiceValue ? Math.abs((b.valor || 0) - order.invoiceValue) < 0.01 : true;",
  "                                return nfOk && valOk;",
  "                              });",
  "                              if (perfectMatch) {",
  "                                setPendingBoleto(perfectMatch);",
  "                                toast('Boleto encontrado! Confirme os dados para vincular.', { icon: '🔍' });",
  "                              } else {",
  "                                // Sem match perfeito: mostrar lista para escolha manual",
  "                                const sorted = [...boletos].sort((a: any, b: any) =>",
  "                                  new Date(b.dataEmissao || 0).getTime() - new Date(a.dataEmissao || 0).getTime()",
  "                                );",
  "                                setBoletosList(sorted);",
  "                                toast('Nenhum boleto com match exato. Escolha manualmente abaixo.', { icon: '⚠️' });",
  "                              }",
  "                            } catch (e: any) {",
  "                              toast.error('Erro ao buscar boleto: ' + e.message);",
  "                            } finally {",
  "                              setIsFetchingBoleto(false);",
  "                            }",
  "                          }}",
  "                          className=\"text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1\"",
  "                        >",
  "                          {isFetchingBoleto ? <Loader2 className=\"size-3 animate-spin\" /> : <RefreshCw className=\"size-3\" />}",
  "                          Buscar Boleto no Sicoob",
  "                        </button>",
  "                        {(order as any).boletoLinked && (",
  "                          <button",
  "                            onClick={() => {",
  "                              onUpdateOrder({",
  "                                ...order,",
  "                                hasBoleto: false,",
  "                                boletoLinked: false,",
  "                                boletoNossoNumero: '',",
  "                                paymentDueDate: '',",
  "                                paymentDate: '',",
  "                                boletSituacao: '',",
  "                                statusHistory: [...(order.statusHistory || []), { action: 'Boleto desvinculado manualmente', timestamp: new Date().toISOString() }]",
  "                              } as any);",
  "                              setBoletoData(null);",
  "                              setPendingBoleto(null);",
  "                              setBoletosList([]);",
  "                            }}",
  "                            className=\"text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1\"",
  "                          >",
  "                            <X className=\"size-3\" /> Desvincular",
  "                          </button>",
  "                        )}",
  "                      </div>",
  "                      {/* Card de confirmação de boleto com match perfeito */}",
  "                      {pendingBoleto && (",
  "                        <div className=\"mx-3 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2\">",
  "                          <p className=\"text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase\">Confirmar vinculação do Boleto?</p>",
  "                          <div className=\"grid grid-cols-2 gap-2\">",
  "                            <div><p className=\"text-[9px] text-slate-400 uppercase\">NF / Seu Número</p><p className=\"text-xs font-bold text-slate-900 dark:text-white select-all\">{pendingBoleto.seuNumero}</p></div>",
  "                            <div><p className=\"text-[9px] text-slate-400 uppercase\">Valor</p><p className=\"text-xs font-bold text-slate-900 dark:text-white\">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(pendingBoleto.valor||0)}</p></div>",
  "                            <div><p className=\"text-[9px] text-slate-400 uppercase\">Emissão</p><p className=\"text-xs font-bold text-slate-900 dark:text-white\">{(pendingBoleto.dataEmissao||'').split('-').reverse().join('/')}</p></div>",
  "                            <div><p className=\"text-[9px] text-slate-400 uppercase\">Vencimento</p><p className=\"text-xs font-bold text-slate-900 dark:text-white\">{(pendingBoleto.dataVencimento||'').split('-').reverse().join('/')}</p></div>",
  "                            <div className=\"col-span-2\"><p className=\"text-[9px] text-slate-400 uppercase\">NossoNumero</p><p className=\"text-xs text-slate-600 dark:text-slate-400 select-all\">{pendingBoleto.nossoNumero}</p></div>",
  "                          </div>",
  "                          <div className=\"flex gap-2 pt-1\">",
  "                            <button onClick={() => {",
  "                              onUpdateOrder({ ...order, hasBoleto: true, boletoLinked: true, boletoNossoNumero: String(pendingBoleto.nossoNumero||''), invoiceNumber: String(pendingBoleto.seuNumero||''), invoiceValue: pendingBoleto.valor, paymentDueDate: pendingBoleto.dataVencimento||'', paymentDate: pendingBoleto.dataEmissao||'', boletSituacao: pendingBoleto.situacaoBoleto||'', statusHistory: [...(order.statusHistory||[]), { action: 'Boleto vinculado e confirmado', details: `NF: ${pendingBoleto.seuNumero} | NossoNumero: ${pendingBoleto.nossoNumero}`, timestamp: new Date().toISOString() }] } as any);",
  "                              setBoletoData({ nossoNumero: String(pendingBoleto.nossoNumero||''), seuNumero: String(pendingBoleto.seuNumero||''), valor: pendingBoleto.valor||0, dataEmissao: pendingBoleto.dataEmissao||'', dataVencimento: pendingBoleto.dataVencimento||'', situacao: pendingBoleto.situacaoBoleto||'' });",
  "                              setPendingBoleto(null); setBoletosList([]);",
  "                              toast.success('Boleto vinculado com sucesso!');",
  "                            }} className=\"flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                              <CheckCircle2 className=\"size-3\" /> Confirmar",
  "                            </button>",
  "                            <button onClick={() => setPendingBoleto(null)} className=\"flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                              <X className=\"size-3\" /> Cancelar",
  "                            </button>",
  "                          </div>",
  "                        </div>",
  "                      )}",
  "                      {/* Lista de boletos para escolha manual */}",
  "                      {boletosList.length > 0 && !pendingBoleto && (",
  "                        <div className=\"mx-3 mt-2 space-y-2\">",
  "                          <p className=\"text-[9px] font-bold text-slate-500 uppercase\">Escolha o boleto correto:</p>",
  "                          <div className=\"space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar\">",
  "                            {boletosList.map((b: any, i: number) => (",
  "                              <button key={i} onClick={() => { setPendingBoleto(b); setBoletosList([]); }}",
  "                                className=\"w-full text-left p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary hover:bg-primary/5 transition-all\">",
  "                                <div className=\"flex justify-between items-center\">",
  "                                  <span className=\"text-xs font-bold text-slate-900 dark:text-white\">NF {b.seuNumero}</span>",
  "                                  <span className=\"text-xs font-bold text-primary\">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(b.valor||0)}</span>",
  "                                </div>",
  "                                <div className=\"flex gap-3 mt-0.5\">",
  "                                  <span className=\"text-[9px] text-slate-400\">Emissão: {(b.dataEmissao||'').split('-').reverse().join('/')}</span>",
  "                                  <span className=\"text-[9px] text-slate-400\">Venc: {(b.dataVencimento||'').split('-').reverse().join('/')}</span>",
  "                                </div>",
  "                              </button>",
  "                            ))}",
  "                          </div>",
  "                          <button onClick={() => setBoletosList([])} className=\"text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-1\">",
  "                            <X className=\"size-3\" /> Fechar lista",
  "                          </button>",
  "                        </div>",
  "                      )}",
].join('\n');

if (!content.includes(OLD_BOLETO_BLOCK)) {
  console.error('ERRO: Bloco do botão Buscar Boleto não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_BOLETO_BLOCK, NEW_BOLETO_BLOCK);
console.log('OK: Bloco Boleto substituído com confirmação, lista e desvinculação.');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');