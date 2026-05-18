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

// ── 1. Adicionar estado nfList ────────────────────────────────────────────────
const OLD_STATE = "  const [pendingInvoice, setPendingInvoice] = useState<{invoiceId?: string; invoiceKey?: string; invoiceNumber?: string; invoiceValue?: number; clientNameMatch?: string} | null>(null);";
const NEW_STATE = [
  "  const [pendingInvoice, setPendingInvoice] = useState<{invoiceId?: string; invoiceKey?: string; invoiceNumber?: string; invoiceValue?: number; clientNameMatch?: string} | null>(null);",
  "  const [nfList, setNfList] = useState<any[]>([]);",
].join('\n');

if (!content.includes(OLD_STATE)) {
  console.error('ERRO: Estado pendingInvoice não encontrado.'); process.exit(1);
}
content = content.replace(OLD_STATE, NEW_STATE);
console.log('OK: Estado nfList adicionado.');

// ── 2. Modificar handleCheckInvoice para usar lista ───────────────────────────
const OLD_HANDLE = [
  "      const data = await response.json();",
  "      if (data.found) {",
  "        // Mostrar para confirmação em vez de vincular automaticamente",
  "        setPendingInvoice({",
  "          invoiceId: data.invoiceId,",
  "          invoiceKey: data.invoiceKey,",
  "          invoiceNumber: data.invoiceNumber,",
  "          invoiceValue: data.invoiceValue,",
  "          clientNameMatch: data.clientNameMatch,",
  "        });",
  "        toast('NF encontrada! Confirme os dados abaixo para vincular.', { icon: '🔍' });",
  "      } else {",
  "        toast(data.message || 'Nenhuma nota fiscal encontrada para este pedido no Bling.');",
  "      }",
].join('\n');

const NEW_HANDLE = [
  "      const data = await response.json();",
  "      if (data.found && data.lista && data.lista.length > 0) {",
  "        setPendingInvoice(null);",
  "        setNfList(data.lista);",
  "        toast(`${data.lista.length} NF(s) encontrada(s). Escolha a correta abaixo.`, { icon: '🔍' });",
  "      } else {",
  "        toast(data.message || 'Nenhuma nota fiscal encontrada para este cliente.');",
  "      }",
].join('\n');

if (!content.includes(OLD_HANDLE)) {
  console.error('ERRO: Trecho handleCheckInvoice não encontrado.'); process.exit(1);
}
content = content.replace(OLD_HANDLE, NEW_HANDLE);
console.log('OK: handleCheckInvoice modificado para usar lista.');

// ── 3. Substituir card de confirmação por lista de NFs ────────────────────────
const OLD_PENDING_CARD = [
  "                        {/* Card de confirmação da NF pendente */}",
  "                        {pendingInvoice && (",
  "                          <div className=\"mx-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2\">",
  "                            <p className=\"text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase\">Confirmar vinculação da NF?</p>",
  "                            <div className=\"grid grid-cols-2 gap-2\">",
  "                              <div>",
  "                                <p className=\"text-[9px] text-slate-400 uppercase\">Número</p>",
  "                                <p className=\"text-xs font-bold text-slate-900 dark:text-white font-mono select-all\">{pendingInvoice.invoiceNumber}</p>",
  "                              </div>",
  "                              <div>",
  "                                <p className=\"text-[9px] text-slate-400 uppercase\">Valor</p>",
  "                                <p className=\"text-xs font-bold text-slate-900 dark:text-white\">{pendingInvoice.invoiceValue ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(pendingInvoice.invoiceValue) : '-'}</p>",
  "                              </div>",
  "                              <div className=\"col-span-2\">",
  "                                <p className=\"text-[9px] text-slate-400 uppercase\">Cliente</p>",
  "                                <p className=\"text-xs text-slate-600 dark:text-slate-400 select-all\">{pendingInvoice.clientNameMatch || '-'}</p>",
  "                              </div>",
  "                              {pendingInvoice.invoiceKey && (",
  "                                <div className=\"col-span-2\">",
  "                                  <p className=\"text-[9px] text-slate-400 uppercase\">Chave NF-e</p>",
  "                                  <p className=\"text-[9px] text-slate-600 dark:text-slate-400 font-mono break-all select-all\">{pendingInvoice.invoiceKey}</p>",
  "                                </div>",
  "                              )}",
  "                            </div>",
  "                            <div className=\"flex gap-2 pt-1\">",
  "                              <button",
  "                                onClick={() => {",
  "                                  onUpdateOrder({",
  "                                    ...order,",
  "                                    hasInvoice: true,",
  "                                    invoiceLinked: true,",
  "                                    invoiceKey: pendingInvoice.invoiceKey || '',",
  "                                    invoiceNumber: pendingInvoice.invoiceNumber || '',",
  "                                    invoiceValue: pendingInvoice.invoiceValue,",
  "                                    statusHistory: [...(order.statusHistory || []), { action: 'Nota Fiscal vinculada e confirmada', details: `NF: ${pendingInvoice.invoiceNumber} | Valor: ${pendingInvoice.invoiceValue}`, timestamp: new Date().toISOString() }]",
  "                                  } as any);",
  "                                  setManualInvoiceKey(pendingInvoice.invoiceKey || '');",
  "                                  setManualInvoiceNumber(pendingInvoice.invoiceNumber || '');",
  "                                  setManualInvoiceValue(pendingInvoice.invoiceValue || '');",
  "                                  setPendingInvoice(null);",
  "                                  toast.success('Nota Fiscal vinculada com sucesso!');",
  "                                }}",
  "                                className=\"flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\"",
  "                              >",
  "                                <CheckCircle2 className=\"size-3\" /> Confirmar",
  "                              </button>",
  "                              <button",
  "                                onClick={() => setPendingInvoice(null)}",
  "                                className=\"flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\"",
  "                              >",
  "                                <X className=\"size-3\" /> Cancelar",
  "                              </button>",
  "                            </div>",
  "                          </div>",
  "                        )}",
].join('\n');

const NEW_NF_LIST = [
  "                        {/* Card de confirmação da NF selecionada */}",
  "                        {pendingInvoice && (",
  "                          <div className=\"mx-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2\">",
  "                            <p className=\"text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase\">Confirmar vinculação da NF?</p>",
  "                            <div className=\"grid grid-cols-2 gap-2\">",
  "                              <div><p className=\"text-[9px] text-slate-400 uppercase\">Número</p><p className=\"text-xs font-bold text-slate-900 dark:text-white font-mono select-all\">{pendingInvoice.invoiceNumber}</p></div>",
  "                              <div><p className=\"text-[9px] text-slate-400 uppercase\">Valor</p><p className=\"text-xs font-bold text-slate-900 dark:text-white\">{pendingInvoice.invoiceValue ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(pendingInvoice.invoiceValue) : '-'}</p></div>",
  "                              <div className=\"col-span-2\"><p className=\"text-[9px] text-slate-400 uppercase\">Cliente</p><p className=\"text-xs text-slate-600 dark:text-slate-400 select-all\">{pendingInvoice.clientNameMatch || '-'}</p></div>",
  "                              {pendingInvoice.invoiceKey && (<div className=\"col-span-2\"><p className=\"text-[9px] text-slate-400 uppercase\">Chave NF-e</p><p className=\"text-[9px] text-slate-600 dark:text-slate-400 font-mono break-all select-all\">{pendingInvoice.invoiceKey}</p></div>)}",
  "                            </div>",
  "                            <div className=\"flex gap-2 pt-1\">",
  "                              <button onClick={() => {",
  "                                onUpdateOrder({ ...order, hasInvoice: true, invoiceLinked: true, invoiceKey: pendingInvoice.invoiceKey||'', invoiceNumber: pendingInvoice.invoiceNumber||'', invoiceValue: pendingInvoice.invoiceValue, statusHistory: [...(order.statusHistory||[]), { action: 'Nota Fiscal vinculada e confirmada', details: `NF: ${pendingInvoice.invoiceNumber} | Valor: ${pendingInvoice.invoiceValue}`, timestamp: new Date().toISOString() }] } as any);",
  "                                setManualInvoiceKey(pendingInvoice.invoiceKey||''); setManualInvoiceNumber(pendingInvoice.invoiceNumber||''); setManualInvoiceValue(pendingInvoice.invoiceValue||'');",
  "                                setPendingInvoice(null); setNfList([]);",
  "                                toast.success('Nota Fiscal vinculada com sucesso!');",
  "                              }} className=\"flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                                <CheckCircle2 className=\"size-3\" /> Confirmar",
  "                              </button>",
  "                              <button onClick={() => { setPendingInvoice(null); }} className=\"flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                                <X className=\"size-3\" /> Cancelar",
  "                              </button>",
  "                            </div>",
  "                          </div>",
  "                        )}",
  "                        {/* Lista de NFs para escolha manual */}",
  "                        {nfList.length > 0 && !pendingInvoice && (",
  "                          <div className=\"mx-3 mt-2 space-y-2\">",
  "                            <p className=\"text-[9px] font-bold text-slate-500 uppercase\">Escolha a nota fiscal correta:</p>",
  "                            <div className=\"space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar\">",
  "                              {nfList.map((nf: any, i: number) => (",
  "                                <button key={i} onClick={() => { setPendingInvoice({ invoiceId: nf.id, invoiceKey: nf.chaveAcesso, invoiceNumber: String(nf.numero), invoiceValue: nf.valor, clientNameMatch: nf.cliente }); setNfList([]); }}",
  "                                  className=\"w-full text-left p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary hover:bg-primary/5 transition-all\">",
  "                                  <div className=\"flex justify-between items-center\">",
  "                                    <span className=\"text-xs font-bold text-slate-900 dark:text-white\">NF {nf.numero}</span>",
  "                                    <span className=\"text-xs font-bold text-primary\">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(nf.valor||0)}</span>",
  "                                  </div>",
  "                                  <div className=\"flex gap-3 mt-0.5\">",
  "                                    <span className=\"text-[9px] text-slate-400\">Emissão: {(nf.dataEmissao||'').split('-').reverse().join('/')}</span>",
  "                                    <span className=\"text-[9px] text-slate-400 truncate\">{nf.cliente}</span>",
  "                                  </div>",
  "                                </button>",
  "                              ))}",
  "                            </div>",
  "                            <button onClick={() => setNfList([])} className=\"text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-1\">",
  "                              <X className=\"size-3\" /> Fechar lista",
  "                            </button>",
  "                          </div>",
  "                        )}",
].join('\n');

if (!content.includes(OLD_PENDING_CARD)) {
  console.error('ERRO: Card de confirmação da NF não encontrado.'); process.exit(1);
}
content = content.replace(OLD_PENDING_CARD, NEW_NF_LIST);
console.log('OK: Lista de NFs adicionada.');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');