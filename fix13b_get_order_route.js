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

// ── 1. Adicionar estados novos após isFetchingBoleto ─────────────────────────
const OLD_STATES = "  const [boletosList, setBoletosList] = useState<any[]>([]);";
const NEW_STATES = [
  "  const [boletosList, setBoletosList] = useState<any[]>([]);",
  "  const [paymentMethod, setPaymentMethod] = useState<string>(order.paymentMethod || '');",
  "  const [noInvoiceValue, setNoInvoiceValue] = useState<string>(order.noInvoiceValue ? String(order.noInvoiceValue) : '');",
  "  const [noInvoiceDueDate, setNoInvoiceDueDate] = useState<string>(order.noInvoiceDueDate || '');",
  "  const [isFetchingBlingOrder, setIsFetchingBlingOrder] = useState(false);",
  "  const [pendingBlingOrder, setPendingBlingOrder] = useState<any>(null);",
].join('\n');

if (!content.includes(OLD_STATES)) {
  console.error('ERRO: Estado boletosList não encontrado.'); process.exit(1);
}
content = content.replace(OLD_STATES, NEW_STATES);
console.log('OK: Estados novos adicionados.');

// ── 2. Inserir bloco "Sem Nota Fiscal" após o bloco de NF existente ──────────
// Inserir antes do aviso "NF-e não detectada"
const OLD_NF_WARNING = [
  "                        {!order.hasInvoice && ['pedidos', 'embalagens_separadas', 'embalagens_prontas', 'caixa_montada'].includes(order.status) && (",
  "                          <p className=\"text-[9px] text-amber-600 dark:text-amber-400 px-3 italic flex items-center gap-1\">",
  "                            <AlertCircle className=\"size-3\" /> NF-e não detectada.",
  "                          </p>",
  "                        )}",
  "                      </div>",
].join('\n');

const NEW_NF_WITH_SEM_NOTA = [
  "                        {!order.hasInvoice && ['pedidos', 'embalagens_separadas', 'embalagens_prontas', 'caixa_montada'].includes(order.status) && (",
  "                          <p className=\"text-[9px] text-amber-600 dark:text-amber-400 px-3 italic flex items-center gap-1\">",
  "                            <AlertCircle className=\"size-3\" /> NF-e não detectada.",
  "                          </p>",
  "                        )}",
  "                        {/* Sem Nota Fiscal */}",
  "                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.noInvoice ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>",
  "                          <input type=\"checkbox\" checked={!!order.noInvoice} onChange={() => onUpdateOrder({ ...order, noInvoice: !order.noInvoice, statusHistory: [...(order.statusHistory||[]), { action: `${!order.noInvoice ? 'Marcou' : 'Desmarcou'} Sem Nota Fiscal`, timestamp: new Date().toISOString() }] })} className=\"rounded border-slate-300 text-amber-500 focus:ring-amber-500 size-4\" />",
  "                          <span className={`text-sm font-medium ${order.noInvoice ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>Sem Nota Fiscal</span>",
  "                        </label>",
  "                        {order.noInvoice && (",
  "                          <div className=\"px-3 space-y-3\">",
  "                            {/* Valor e vencimento */}",
  "                            <div className=\"grid grid-cols-2 gap-2\">",
  "                              <div className=\"space-y-1\">",
  "                                <label className=\"text-[9px] text-slate-400 uppercase font-bold\">Valor (R$)</label>",
  "                                <input type=\"number\" step=\"0.01\" value={noInvoiceValue} onChange={(e) => setNoInvoiceValue(e.target.value)} onBlur={() => { if (noInvoiceValue) onUpdateOrder({ ...order, noInvoiceValue: Number(noInvoiceValue) }); }} placeholder=\"Ex: 150.00\" className=\"w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary\" />",
  "                              </div>",
  "                              <div className=\"space-y-1\">",
  "                                <label className=\"text-[9px] text-slate-400 uppercase font-bold\">Vencimento</label>",
  "                                <input type=\"date\" value={noInvoiceDueDate} onChange={(e) => { setNoInvoiceDueDate(e.target.value); onUpdateOrder({ ...order, noInvoiceDueDate: e.target.value }); }} className=\"w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary\" />",
  "                              </div>",
  "                            </div>",
  "                            {/* Botão Buscar Pedido no Bling */}",
  "                            <div className=\"flex items-center gap-2\">",
  "                              <button onClick={async () => {",
  "                                if (!order.blingOrderId && !order.clientName) { toast.error('Pedido sem ID do Bling ou nome do cliente.'); return; }",
  "                                setIsFetchingBlingOrder(true); setPendingBlingOrder(null);",
  "                                try {",
  "                                  const res = await fetch('/api/bling/get-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blingOrderId: order.blingOrderId, clientName: order.clientName, document: order.cnpj || order.cpf, orderId: order.id }) });",
  "                                  const data = await res.json();",
  "                                  if (data.found) { setPendingBlingOrder(data.order); toast('Pedido encontrado! Confirme para vincular.', { icon: '🔍' }); }",
  "                                  else { toast.error(data.message || 'Pedido não encontrado no Bling.'); }",
  "                                } catch (e: any) { toast.error('Erro: ' + e.message); }",
  "                                finally { setIsFetchingBlingOrder(false); }",
  "                              }} disabled={isFetchingBlingOrder} className=\"text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1\">",
  "                                {isFetchingBlingOrder ? <Loader2 className=\"size-3 animate-spin\" /> : <RefreshCw className=\"size-3\" />}",
  "                                Buscar Pedido no Bling",
  "                              </button>",
  "                              {order.noInvoiceLinked && (",
  "                                <button onClick={() => onUpdateOrder({ ...order, noInvoiceLinked: false, noInvoiceBlingOrderId: '', statusHistory: [...(order.statusHistory||[]), { action: 'Pedido Bling desvinculado (Sem NF)', timestamp: new Date().toISOString() }] })} className=\"text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1\">",
  "                                  <X className=\"size-3\" /> Desvincular",
  "                                </button>",
  "                              )}",
  "                            </div>",
  "                            {/* Card confirmação pedido Bling */}",
  "                            {pendingBlingOrder && (",
  "                              <div className=\"p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2\">",
  "                                <p className=\"text-[9px] font-bold text-amber-700 uppercase\">Confirmar vinculação do Pedido?</p>",
  "                                <div className=\"grid grid-cols-2 gap-2\">",
  "                                  <div><p className=\"text-[9px] text-slate-400 uppercase\">Número</p><p className=\"text-xs font-bold select-all\">{pendingBlingOrder.numero}</p></div>",
  "                                  <div><p className=\"text-[9px] text-slate-400 uppercase\">Valor</p><p className=\"text-xs font-bold text-primary\">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(pendingBlingOrder.valor||0)}</p></div>",
  "                                  <div className=\"col-span-2\"><p className=\"text-[9px] text-slate-400 uppercase\">Cliente</p><p className=\"text-xs text-slate-600 dark:text-slate-400\">{pendingBlingOrder.cliente}</p></div>",
  "                                </div>",
  "                                <div className=\"flex gap-2\">",
  "                                  <button onClick={() => {",
  "                                    onUpdateOrder({ ...order, noInvoiceLinked: true, noInvoiceBlingOrderId: String(pendingBlingOrder.id||''), noInvoiceValue: pendingBlingOrder.valor, statusHistory: [...(order.statusHistory||[]), { action: 'Pedido Bling vinculado (Sem NF)', details: `Pedido: ${pendingBlingOrder.numero} | Valor: ${pendingBlingOrder.valor}`, timestamp: new Date().toISOString() }] });",
  "                                    setNoInvoiceValue(String(pendingBlingOrder.valor||'')); setPendingBlingOrder(null);",
  "                                    toast.success('Pedido vinculado com sucesso!');",
  "                                  }} className=\"flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                                    <CheckCircle2 className=\"size-3\" /> Confirmar",
  "                                  </button>",
  "                                  <button onClick={() => setPendingBlingOrder(null)} className=\"flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1\">",
  "                                    <X className=\"size-3\" /> Cancelar",
  "                                  </button>",
  "                                </div>",
  "                              </div>",
  "                            )}",
  "                            {order.noInvoiceLinked && (",
  "                              <div className=\"flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg\">",
  "                                <CheckCircle2 className=\"size-3 text-emerald-600\" />",
  "                                <span className=\"text-[10px] font-bold text-emerald-700 dark:text-emerald-400\">Pedido Bling vinculado</span>",
  "                              </div>",
  "                            )}",
  "                          </div>",
  "                        )}",
  "                      </div>",
].join('\n');

if (!content.includes(OLD_NF_WARNING)) {
  console.error('ERRO: Bloco aviso NF não encontrado.'); process.exit(1);
}
content = content.replace(OLD_NF_WARNING, NEW_NF_WITH_SEM_NOTA);
console.log('OK: Bloco Sem Nota Fiscal inserido.');

// ── 3. Inserir bloco "Pagamento" após o bloco do Boleto ──────────────────────
// Inserir antes do bloco hasOrderDocument
const OLD_ORDER_DOC = [
  "                      <div className=\"flex flex-col gap-2\">",
  "                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasOrderDocument ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>",
  "                          <input ",
  "                            type=\"checkbox\"",
  "                            checked={order.hasOrderDocument}",
].join('\n');

const NEW_PAYMENT_BEFORE_DOC = [
  "                      {/* Pagamento sem boleto */}",
  "                      <div className=\"flex flex-col gap-2\">",
  "                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.paymentLinked ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>",
  "                          <input type=\"checkbox\" checked={!!order.paymentLinked} onChange={() => onUpdateOrder({ ...order, paymentLinked: !order.paymentLinked, statusHistory: [...(order.statusHistory||[]), { action: `${!order.paymentLinked ? 'Marcou' : 'Desmarcou'} Pagamento`, timestamp: new Date().toISOString() }] })} className=\"rounded border-slate-300 text-primary focus:ring-primary size-4\" />",
  "                          <span className={`text-sm font-medium ${order.paymentLinked ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Pagamento</span>",
  "                        </label>",
  "                        {order.paymentLinked && (",
  "                          <div className=\"px-3 space-y-3\">",
  "                            {/* Forma de pagamento */}",
  "                            <div className=\"space-y-1\">",
  "                              <label className=\"text-[9px] text-slate-400 uppercase font-bold\">Forma de Pagamento</label>",
  "                              <div className=\"grid grid-cols-3 gap-1\">",
  "                                {(['pix', 'deposito_amazon', 'deposito_meli'] as const).map((m) => (",
  "                                  <button key={m} onClick={() => { setPaymentMethod(m); onUpdateOrder({ ...order, paymentMethod: m, statusHistory: [...(order.statusHistory||[]), { action: `Definiu forma de pagamento: ${m}`, timestamp: new Date().toISOString() }] }); }}",
  "                                    className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${paymentMethod === m ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary'}`}>",
  "                                    {m === 'pix' ? 'PIX' : m === 'deposito_amazon' ? 'Depósito Amazon' : 'Depósito Meli'}",
  "                                  </button>",
  "                                ))}",
  "                              </div>",
  "                            </div>",
  "                            {/* Valor e vencimento */}",
  "                            <div className=\"grid grid-cols-2 gap-2\">",
  "                              <div className=\"space-y-1\">",
  "                                <label className=\"text-[9px] text-slate-400 uppercase font-bold\">Valor (R$)</label>",
  "                                <p className=\"text-sm font-bold text-slate-900 dark:text-white\">{order.invoiceValue ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(order.invoiceValue) : '-'}</p>",
  "                              </div>",
  "                              <div className=\"space-y-1\">",
  "                                <label className=\"text-[9px] text-slate-400 uppercase font-bold\">Vencimento</label>",
  "                                <p className=\"text-sm font-bold text-slate-900 dark:text-white\">{order.paymentDueDate ? order.paymentDueDate.split('-').reverse().join('/') : '-'}</p>",
  "                              </div>",
  "                            </div>",
  "                            {/* Confirmar pagamento */}",
  "                            {order.paymentStatus !== 'pago' && (",
  "                              <button onClick={() => onUpdateOrder({ ...order, paymentStatus: 'pago', statusHistory: [...(order.statusHistory||[]), { action: `Pagamento confirmado via ${paymentMethod || order.paymentMethod || 'não informado'}`, timestamp: new Date().toISOString() }] })} className=\"w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all\">",
  "                                <CheckCircle2 className=\"size-4\" /> Confirmar Pagamento",
  "                              </button>",
  "                            )}",
  "                            {order.paymentStatus === 'pago' && (",
  "                              <div className=\"flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg\">",
  "                                <CheckCircle2 className=\"size-3 text-emerald-600\" />",
  "                                <span className=\"text-[10px] font-bold text-emerald-700 dark:text-emerald-400\">Pagamento confirmado — {order.paymentMethod === 'pix' ? 'PIX' : order.paymentMethod === 'deposito_amazon' ? 'Depósito Amazon' : order.paymentMethod === 'deposito_meli' ? 'Depósito Meli' : order.paymentMethod}</span>",
  "                              </div>",
  "                            )}",
  "                          </div>",
  "                        )}",
  "                      </div>",
  "                      <div className=\"flex flex-col gap-2\">",
  "                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasOrderDocument ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>",
  "                          <input ",
  "                            type=\"checkbox\"",
  "                            checked={order.hasOrderDocument}",
].join('\n');

if (!content.includes(OLD_ORDER_DOC)) {
  console.error('ERRO: Bloco hasOrderDocument não encontrado.'); process.exit(1);
}
content = content.replace(OLD_ORDER_DOC, NEW_PAYMENT_BEFORE_DOC);
console.log('OK: Bloco Pagamento inserido antes de Declaração de Conteúdo.');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');