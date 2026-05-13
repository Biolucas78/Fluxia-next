const fs = require('fs');
const path = require('path');

const possibleRoots = ['.', path.join(process.env.HOME || '', 'Fluxia-next')];
let projectRoot = null;
for (const p of possibleRoots) {
  if (fs.existsSync(path.join(p, 'package.json'))) { projectRoot = p; break; }
}

// ─── Fix 1: Botão Buscar NF sempre visível no modal ───
const modalPath = path.join(projectRoot, 'components/OrderDetailsModal.tsx');
let modalContent = fs.readFileSync(modalPath, 'utf8');

// Remover condição !order.hasInvoice do botão
const OLD_BTN = `                        {!order.hasInvoice && (
                          <button
                            onClick={handleCheckInvoice}
                            disabled={isCheckingInvoice}
                            className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-3"
                          >
                            {isCheckingInvoice ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            Buscar Nota Fiscal no Bling
                          </button>
                        )}`;

const NEW_BTN = `                        <button
                            onClick={handleCheckInvoice}
                            disabled={isCheckingInvoice}
                            className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-3"
                          >
                            {isCheckingInvoice ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            {order.hasInvoice ? 'Atualizar Nota Fiscal' : 'Buscar Nota Fiscal no Bling'}
                          </button>`;

if (!modalContent.includes(OLD_BTN)) {
  console.error('ERRO: Botão Buscar NF não encontrado.');
  process.exit(1);
}
modalContent = modalContent.replace(OLD_BTN, NEW_BTN);
console.log('OK: Botão Buscar NF sempre visível no modal.');

// Adicionar botão também na seção de informações (visível em todas as fases)
// Após o título do pedido / dados do cliente, adicionar botão rápido de NF
const OLD_NF_SECTION = `              {order.invoiceNumber && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nota Fiscal</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">NF-e {order.invoiceNumber}</p>
                </div>
              )}`;

const NEW_NF_SECTION = `              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nota Fiscal</p>
                  <button
                    onClick={handleCheckInvoice}
                    disabled={isCheckingInvoice}
                    className="text-[9px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    {isCheckingInvoice ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    {order.invoiceNumber ? 'Atualizar' : 'Buscar no Bling'}
                  </button>
                </div>
                {order.invoiceNumber
                  ? <p className="text-sm font-bold text-slate-900 dark:text-white">NF-e {order.invoiceNumber}</p>
                  : <p className="text-xs text-slate-400 italic">Nenhuma NF vinculada</p>
                }
              </div>`;

if (modalContent.includes(OLD_NF_SECTION)) {
  modalContent = modalContent.replace(OLD_NF_SECTION, NEW_NF_SECTION);
  console.log('OK: Botão NF adicionado na seção de informações do modal.');
}

fs.writeFileSync(modalPath, modalContent, 'utf8');

// ─── Fix 2: Adicionar botão Buscar NF na página Financeiro ───
const financPath = path.join(projectRoot, 'app/financeiro/page.tsx');
let financContent = fs.readFileSync(financPath, 'utf8');

// Adicionar estado e função de buscar NF
const OLD_STATE_FIN = `  const [isSyncing, setIsSyncing] = useState(false);`;
const NEW_STATE_FIN = `  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchingNFId, setFetchingNFId] = useState<string | null>(null);`;

if (!financContent.includes('fetchingNFId')) {
  financContent = financContent.replace(OLD_STATE_FIN, NEW_STATE_FIN);
}

// Adicionar função handleFetchNF
const OLD_FN_FIN = `  const handleConfirmPayment = async () => {`;
const NEW_FN_FIN = `  const handleFetchNF = async (order: Order) => {
    setFetchingNFId(order.id);
    try {
      const document = order.cnpj || order.cpf;
      if (!document) { toast.error('Cliente sem CPF/CNPJ cadastrado'); return; }
      const token = await fetch('/api/bling/token').then(r => r.json()).then(d => d.token).catch(() => null);
      if (!token) { toast.error('Erro ao obter token do Bling'); return; }
      const res = await fetch(\`/api/bling/invoice?document=\${document.replace(/\\D/g,'')}&orderId=\${order.blingOrderId || ''}\`);
      const data = await res.json();
      if (data.invoiceNumber) {
        await fetch('/api/orders/' + order.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceNumber: data.invoiceNumber, invoiceValue: data.invoiceValue, invoiceKey: data.invoiceKey, hasInvoice: true })
        });
        toast.success('NF ' + data.invoiceNumber + ' vinculada!');
      } else {
        toast.error('NF não encontrada no Bling');
      }
    } catch (e: any) {
      toast.error('Erro ao buscar NF: ' + e.message);
    } finally {
      setFetchingNFId(null);
    }
  };

  const handleConfirmPayment = async () => {`;

if (!financContent.includes('handleFetchNF')) {
  financContent = financContent.replace(OLD_FN_FIN, NEW_FN_FIN);
}

// Adicionar botão entre WhatsApp e Confirmar/Receber
const OLD_BTNS = `                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleSendWhatsApp(order)}
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all"
                            title="Cobrar via WhatsApp"
                          >
                            <MessageSquare className="size-4" />
                          </button>
                          <button
                            onClick={() => { setSelectedOrder(order); setPaymentForm({ method: 'pix', date: new Date().toISOString().split('T')[0] }); }}
                            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                          >
                            Confirmar
                          </button>
                        </div>`;

const NEW_BTNS = `                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleSendWhatsApp(order)}
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all"
                            title="Cobrar via WhatsApp"
                          >
                            <MessageSquare className="size-4" />
                          </button>
                          <button
                            onClick={() => handleFetchNF(order)}
                            disabled={fetchingNFId === order.id}
                            className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                            title="Buscar Nota Fiscal no Bling"
                          >
                            {fetchingNFId === order.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                          </button>
                          <button
                            onClick={() => { setSelectedOrder(order); setPaymentForm({ method: 'pix', date: new Date().toISOString().split('T')[0] }); }}
                            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                          >
                            Receber
                          </button>
                        </div>`;

if (!financContent.includes('handleFetchNF(order)')) {
  financContent = financContent.replace(OLD_BTNS, NEW_BTNS);
  console.log('OK: Botão NF e renomeação para Receber adicionados na lista A Receber.');
}

// Fazer o mesmo para a lista de Vencidos
const OLD_BTNS_VENC = `                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleSendWhatsApp(order)}
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-all"
                            title="Cobrar via WhatsApp"
                          >
                            <MessageSquare className="size-4" />
                          </button>
                          <button
                            onClick={() => { setSelectedOrder(order); setPaymentForm({ method: 'pix', date: new Date().toISOString().split('T')[0] }); }}
                            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                          >
                            Confirmar
                          </button>
                        </div>`;

const NEW_BTNS_VENC = `                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleSendWhatsApp(order)}
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-all"
                            title="Cobrar via WhatsApp"
                          >
                            <MessageSquare className="size-4" />
                          </button>
                          <button
                            onClick={() => handleFetchNF(order)}
                            disabled={fetchingNFId === order.id}
                            className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                            title="Buscar Nota Fiscal no Bling"
                          >
                            {fetchingNFId === order.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                          </button>
                          <button
                            onClick={() => { setSelectedOrder(order); setPaymentForm({ method: 'pix', date: new Date().toISOString().split('T')[0] }); }}
                            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                          >
                            Receber
                          </button>
                        </div>`;

if (financContent.includes(OLD_BTNS_VENC)) {
  financContent = financContent.replace(OLD_BTNS_VENC, NEW_BTNS_VENC);
  console.log('OK: Botão NF e renomeação para Receber adicionados na lista Vencidos.');
}

// Adicionar FileText no import
if (!financContent.includes('FileText')) {
  financContent = financContent.replace(
    `  DollarSign, Clock, AlertTriangle, CheckCircle2, 
  Loader2, X, TrendingUp, Filter, Calendar,
  MessageSquare, Archive, CreditCard, Banknote,
  Smartphone, Building2, ChevronDown`,
    `  DollarSign, Clock, AlertTriangle, CheckCircle2, 
  Loader2, X, TrendingUp, Filter, Calendar,
  MessageSquare, Archive, CreditCard, Banknote,
  Smartphone, Building2, ChevronDown, FileText`
  );
}

fs.writeFileSync(financPath, financContent, 'utf8');
console.log('OK: Página Financeiro atualizada.');
console.log('OK: Tudo aplicado com sucesso.');