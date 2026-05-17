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

// ── 1. Adicionar estado pendingInvoice após os estados existentes ─────────────
const OLD_STATES = [
  "  const [isCheckingInvoice, setIsCheckingInvoice] = useState(false);",
].join('\n');

const NEW_STATES = [
  "  const [isCheckingInvoice, setIsCheckingInvoice] = useState(false);",
  "  const [pendingInvoice, setPendingInvoice] = useState<{invoiceId?: string; invoiceKey?: string; invoiceNumber?: string; invoiceValue?: number; clientNameMatch?: string} | null>(null);",
].join('\n');

if (!content.includes(OLD_STATES)) {
  console.error('ERRO: Estado isCheckingInvoice não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_STATES, NEW_STATES);
console.log('OK: Estado pendingInvoice adicionado.');

// ── 2. Modificar handleCheckInvoice para não vincular automaticamente ─────────
const OLD_HANDLE = [
  "      const data = await response.json();",
  "      if (data.found) {",
  "        onUpdateOrder({ ",
  "          ...order, ",
  "          hasInvoice: true, ",
  "          invoiceKey: data.invoiceKey,",
  "          invoiceNumber: data.invoiceNumber,",
  "          invoiceValue: data.invoiceValue,",
  "          statusHistory: [",
  "            ...(order.statusHistory || []),",
  "            { ",
  "              action: 'Nota fiscal vinculada (Sincronizada do Bling)',",
  "              details: `NF: ${data.invoiceNumber || 'N/A'}, Valor: R$ ${data.invoiceValue || '0.00'}`,",
  "              timestamp: new Date().toISOString() ",
  "            }",
  "          ]",
  "        });",
  "        setManualInvoiceKey(data.invoiceKey || '');",
  "        setManualInvoiceNumber(data.invoiceNumber || '');",
  "        setManualInvoiceValue(data.invoiceValue || '');",
  "        toast.success('Nota fiscal encontrada e vinculada!');",
  "      } else {",
  "        toast(data.message || 'Nenhuma nota fiscal encontrada para este pedido no Bling.');",
  "      }",
].join('\n');

const NEW_HANDLE = [
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

if (!content.includes(OLD_HANDLE)) {
  console.error('ERRO: Trecho handleCheckInvoice não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_HANDLE, NEW_HANDLE);
console.log('OK: handleCheckInvoice modificado para mostrar confirmação.');

// ── 3. Substituir o bloco de exibição da NF no modal ─────────────────────────
const OLD_NF_BLOCK = [
  "                        <button",
  "                            onClick={handleCheckInvoice}",
  "                            disabled={isCheckingInvoice}",
  "                            className=\"text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-3\"",
  "                          >",
  "                            {isCheckingInvoice ? <Loader2 className=\"size-3 animate-spin\" /> : <RefreshCw className=\"size-3\" />}",
  "                            {order.hasInvoice ? 'Atualizar Nota Fiscal' : 'Buscar Nota Fiscal no Bling'}",
  "                          </button>",
  "                        {order.hasInvoice && (",
  "                          <div className=\"px-3 space-y-2\">",
  "                            <div className=\"flex justify-between items-center\">",
  "                              <p className=\"text-[9px] text-slate-400 font-bold uppercase\">Dados da NF-e</p>",
  "                              <button ",
  "                                onClick={() => {",
  "                                  if (isEditingInvoiceManually) {",
  "                                    onUpdateOrder({",
  "                                      ...order,",
  "                                      invoiceKey: manualInvoiceKey,",
  "                                      invoiceNumber: manualInvoiceNumber,",
  "                                      invoiceValue: manualInvoiceValue === '' ? undefined : Number(manualInvoiceValue),",
  "                                      statusHistory: [",
  "                                        ...(order.statusHistory || []),",
  "                                        { ",
  "                                          action: 'Dados da Nota Fiscal atualizados manualmente',",
  "                                          details: `NF: ${manualInvoiceNumber || 'N/A'}, Valor: R$ ${manualInvoiceValue || '0.00'}`,",
  "                                          timestamp: new Date().toISOString() ",
  "                                        }",
  "                                      ]",
  "                                    });",
  "                                  }",
  "                                  setIsEditingInvoiceManually(!isEditingInvoiceManually);",
  "                                }}",
  "                                className=\"text-[9px] font-bold text-primary hover:underline\"",
  "                              >",
  "                                {isEditingInvoiceManually ? 'Salvar' : 'Editar Manual'}",
  "                              </button>",
  "                            </div>",
].join('\n');

const NEW_NF_BLOCK = [
  "                        {/* Botão Buscar NF — sempre visível */}",
  "                        <div className=\"flex items-center gap-2 px-3\">",
  "                          <button",
  "                            onClick={handleCheckInvoice}",
  "                            disabled={isCheckingInvoice}",
  "                            className=\"text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1\"",
  "                          >",
  "                            {isCheckingInvoice ? <Loader2 className=\"size-3 animate-spin\" /> : <RefreshCw className=\"size-3\" />}",
  "                            Buscar Nota Fiscal no Bling",
  "                          </button>",
  "                          {(order as any).invoiceLinked && (",
  "                            <button",
  "                              onClick={() => {",
  "                                onUpdateOrder({",
  "                                  ...order,",
  "                                  hasInvoice: false,",
  "                                  invoiceLinked: false,",
  "                                  invoiceKey: '',",
  "                                  invoiceNumber: '',",
  "                                  invoiceValue: undefined,",
  "                                  statusHistory: [...(order.statusHistory || []), { action: 'Nota Fiscal desvinculada manualmente', timestamp: new Date().toISOString() }]",
  "                                } as any);",
  "                                setManualInvoiceKey('');",
  "                                setManualInvoiceNumber('');",
  "                                setManualInvoiceValue('');",
  "                                setPendingInvoice(null);",
  "                              }}",
  "                              className=\"text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1\"",
  "                            >",
  "                              <X className=\"size-3\" /> Desvincular",
  "                            </button>",
  "                          )}",
  "                        </div>",
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
  "                        {order.hasInvoice && (",
  "                          <div className=\"px-3 space-y-2\">",
  "                            <div className=\"flex justify-between items-center\">",
  "                              <p className=\"text-[9px] text-slate-400 font-bold uppercase\">Dados da NF-e</p>",
  "                              <button ",
  "                                onClick={() => {",
  "                                  if (isEditingInvoiceManually) {",
  "                                    onUpdateOrder({",
  "                                      ...order,",
  "                                      invoiceKey: manualInvoiceKey,",
  "                                      invoiceNumber: manualInvoiceNumber,",
  "                                      invoiceValue: manualInvoiceValue === '' ? undefined : Number(manualInvoiceValue),",
  "                                      statusHistory: [",
  "                                        ...(order.statusHistory || []),",
  "                                        { ",
  "                                          action: 'Dados da Nota Fiscal atualizados manualmente',",
  "                                          details: `NF: ${manualInvoiceNumber || 'N/A'}, Valor: R$ ${manualInvoiceValue || '0.00'}`,",
  "                                          timestamp: new Date().toISOString() ",
  "                                        }",
  "                                      ]",
  "                                    });",
  "                                  }",
  "                                  setIsEditingInvoiceManually(!isEditingInvoiceManually);",
  "                                }}",
  "                                className=\"text-[9px] font-bold text-primary hover:underline\"",
  "                              >",
  "                                {isEditingInvoiceManually ? 'Salvar' : 'Editar Manual'}",
  "                              </button>",
  "                            </div>",
].join('\n');

if (!content.includes(OLD_NF_BLOCK)) {
  console.error('ERRO: Bloco de exibição da NF não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_NF_BLOCK, NEW_NF_BLOCK);
console.log('OK: Bloco NF substituído com confirmação e desvinculação.');

// ── 4. Verificar que X está importado (Lucide) ────────────────────────────────
if (!content.includes('X,') && !content.includes(', X ') && !content.includes(', X}') && !content.includes('{ X')) {
  // Adicionar X aos imports do Lucide
  content = content.replace(
    "import { ",
    "import { X, "
  );
  console.log('OK: X adicionado aos imports Lucide.');
} else {
  console.log('OK: X já está nos imports.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');