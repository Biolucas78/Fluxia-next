'use client';
import React, { useState, useMemo } from 'react';
import { useOrders, useUser } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import { Order } from '@/lib/types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, Clock, AlertTriangle, CheckCircle2, FileText, 
  Loader2, X, TrendingUp, Filter, Calendar,
  MessageSquare, Archive, CreditCard, Banknote,
  Smartphone, Building2, ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const PAYMENT_METHODS = [
  { value: 'boleto', label: 'Boleto', icon: '🏦' },
  { value: 'pix', label: 'PIX', icon: '⚡' },
  { value: 'transferencia', label: 'Transferência', icon: '🔄' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'cartao', label: 'Cartão', icon: '💳' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function getOrderValue(order: Order): number {
  return order.invoiceValue || 0;
}

function getDueDate(order: Order): string | undefined {
  if (order.paymentDueDate) return order.paymentDueDate;
  if (order.boletoNossoNumero) return undefined; // boleto tem data própria
  // Calcular com base na condição de pagamento
  const delivered = order.statusHistory?.find(h => h.status === 'entregue');
  if (!delivered) return undefined;
  const base = new Date(delivered.timestamp);
  const cond = order.paymentCondition;
  if (cond === 'A vista') { base.setDate(base.getDate()); }
  else if (cond === '15 dias') { base.setDate(base.getDate() + 15); }
  else if (cond === '21 dias') { base.setDate(base.getDate() + 21); }
  else if (cond === '30 dias') { base.setDate(base.getDate() + 30); }
  else if (cond === '2x') { base.setDate(base.getDate() + 30); }
  return base.toISOString().split('T')[0];
}

function isOverdue(order: Order): boolean {
  const due = getDueDate(order);
  if (!due) return false;
  return new Date(due) < new Date();
}

export default function FinanceiroPage() {
  const { allOrders, archivedOrders, isLoaded, handleUpdateOrder, handleArchiveOrder } = useOrders();
  const todosOsPedidos = useMemo(() => [...allOrders, ...archivedOrders], [allOrders, archivedOrders]);
  const { userProfile, loading: userLoading } = useUser();
  const [activeTab, setActiveTab] = useState<'receber' | 'recebidos' | 'vencidos'>('receber');
  const [filterPeriod, setFilterPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchingNFId, setFetchingNFId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    method: 'pix' as string,
    date: new Date().toISOString().split('T')[0],
  });

  // Pedidos entregues não pagos
  const toReceive = useMemo(() => {
    return allOrders.filter(o =>
      o.status === 'entregue' &&
      !o.archived &&
      o.paymentStatus !== 'pago'
    ).sort((a, b) => {
      const da = getDueDate(a) || '';
      const db = getDueDate(b) || '';
      return da.localeCompare(db);
    });
  }, [allOrders]);

  // Vencidos
  const overdue = useMemo(() => {
    return toReceive.filter(o => isOverdue(o));
  }, [toReceive]);

  // Recebidos no período
  const received = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    if (filterPeriod === 'month') startDate.setMonth(now.getMonth() - 1);
    else if (filterPeriod === 'quarter') startDate.setMonth(now.getMonth() - 3);
    else startDate.setFullYear(now.getFullYear() - 1);

    return todosOsPedidos.filter(o =>
      o.paymentStatus === 'pago' &&
      o.paymentDate &&
      new Date(o.paymentDate) >= startDate
    ).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [allOrders, filterPeriod]);

  // Totais
  const totalToReceive = useMemo(() => toReceive.reduce((s, o) => s + getOrderValue(o), 0), [toReceive]);
  const totalOverdue = useMemo(() => overdue.reduce((s, o) => s + getOrderValue(o), 0), [overdue]);
  const totalReceived = useMemo(() => received.reduce((s, o) => s + getOrderValue(o), 0), [received]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sicoob/sincronizar', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Sincronizado! ${data.updated} boleto(s) atualizado(s).`);
      } else {
        toast.error('Erro ao sincronizar: ' + data.error);
      }
    } catch (e: any) {
      toast.error('Erro ao sincronizar: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchNF = async (order: Order) => {
    setFetchingNFId(order.id);
    try {
      const res = await fetch('/api/bling/get-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blingOrderId: order.blingOrderId,
          clientName: order.clientName,
          document: order.cnpj || order.cpf,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao buscar nota fiscal');
      }
      const data = await res.json();
      if (data.found) {
        await handleUpdateOrder({
          ...order,
          hasInvoice: true,
          invoiceKey: data.invoiceKey,
          invoiceNumber: data.invoiceNumber,
          invoiceValue: data.invoiceValue,
          statusHistory: [
            ...(order.statusHistory || []),
            { action: 'Nota fiscal vinculada via Financeiro', details: `NF: ${data.invoiceNumber}, Valor: R$ ${data.invoiceValue}`, timestamp: new Date().toISOString() }
          ]
        });
        toast.success('NF ' + data.invoiceNumber + ' vinculada!');
      } else {
        toast(data.message || 'Nenhuma NF encontrada no Bling para este pedido.');
      }
    } catch (e: any) {
      toast.error('Erro ao buscar NF: ' + e.message);
    } finally {
      setFetchingNFId(null);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedOrder) return;
    setIsConfirmingPayment(true);
    try {
      const updatedOrder = {
        ...selectedOrder,
        paymentStatus: 'pago' as const,
        paymentMethod: paymentForm.method as any,
        paymentDate: paymentForm.date,
        statusHistory: [
          ...(selectedOrder.statusHistory || []),
          { action: `Pagamento confirmado via ${PAYMENT_METHODS.find(m => m.value === paymentForm.method)?.label || paymentForm.method}`, timestamp: new Date().toISOString() }
        ]
      };
      await handleUpdateOrder(updatedOrder);

      // Arquivar se status for entregue
      if (selectedOrder.status === 'entregue') {
        await handleArchiveOrder(selectedOrder.id);
        toast.success('Pagamento confirmado e pedido arquivado!');
      } else {
        toast.success('Pagamento confirmado!');
      }
      setSelectedOrder(null);
    } catch (e: any) {
      toast.error('Erro ao confirmar pagamento: ' + e.message);
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const getCobrancaMsg = (order: Order) => {
    const due = getDueDate(order);
    const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getOrderValue(order));
    const emissao = (order.paymentDate || '').split('-').reverse().join('/');
    const vencimento = due ? (typeof due === 'string' ? due.split('-').reverse().join('/') : new Date(due).toLocaleDateString('pt-BR')) : '';
    const nf = order.invoiceNumber || '';
    return `Pedido faturado em ${emissao}, referente a nota fiscal ${nf}, no valor de ${value}, vencido em ${vencimento}.`;
  };
  const getCobrancaUrlPessoal = (order: Order) => {
    const phone = order.phone?.replace(/\D/g, '');
    if (!phone) return null;
    return `https://wa.me/55${phone}?text=${encodeURIComponent(getCobrancaMsg(order))}`;
  };
  const getCobrancaUrlBusiness = (order: Order) => {
    const phone = order.phone?.replace(/\D/g, '');
    if (!phone) return null;
    return `intent://send?phone=55${phone}&text=${encodeURIComponent(getCobrancaMsg(order))}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
  };

  if (userLoading) return null;
  if (!userProfile) return <Login />;

  const tabs = [
    { id: 'receber', label: 'A Receber', count: toReceive.length, color: 'text-amber-600' },
    { id: 'recebidos', label: 'Recebidos', count: received.length, color: 'text-emerald-600' },
    { id: 'vencidos', label: 'Vencidos', count: overdue.length, color: 'text-red-600' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Financeiro" />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Header com botão sync */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Atualizado em tempo real via Firestore</p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="size-3 animate-spin" /> : <TrendingUp className="size-3" />}
              {isSyncing ? 'Sincronizando...' : 'Sincronizar com Sicoob'}
            </button>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">A Receber</p>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalToReceive)}</p>
              <p className="text-xs text-slate-500 mt-1">{toReceive.length} pedido{toReceive.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Recebido</p>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalReceived)}</p>
              <p className="text-xs text-slate-500 mt-1">{received.length} pedido{received.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Vencido</p>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalOverdue)}</p>
              <p className="text-xs text-slate-500 mt-1">{overdue.length} pedido{overdue.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100 dark:border-slate-800">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-b-2 border-primary text-primary bg-primary/5'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Filtro de período (só em Recebidos) */}
            {activeTab === 'recebidos' && (
              <div className="flex gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
                {[['month', 'Último mês'], ['quarter', 'Último trimestre'], ['year', 'Último ano']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setFilterPeriod(v as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterPeriod === v ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >{l}</button>
                ))}
              </div>
            )}

            {/* Lista */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {!isLoaded && (
                <div className="py-12 text-center"><Loader2 className="size-8 animate-spin text-primary mx-auto" /></div>
              )}

              {/* A Receber */}
              {activeTab === 'receber' && isLoaded && (
                <>
                  {toReceive.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="size-10 mx-auto mb-3 text-emerald-400" />
                      <p className="font-bold">Nenhum recebimento pendente!</p>
                    </div>
                  )}
                  {toReceive.map(order => {
                    const due = getDueDate(order);
                    const overdue = isOverdue(order);
                    return (
                      <div key={order.id} className={`p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                            {overdue && <span className="text-[9px] font-black bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full uppercase">Vencido</span>}
                            {order.boletoNossoNumero && <span className="text-[9px] font-black bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full uppercase">Boleto</span>}
                          </div>
                          <div className="flex gap-3 text-xs text-slate-500">
                            <span>{order.paymentCondition || 'A vista'}</span>
                            {due && <span className={`${overdue ? 'text-red-500 font-bold' : ''}`}>Vence: {formatDate(due)}</span>}
                            {order.invoiceNumber && <span>NF {order.invoiceNumber}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(getOrderValue(order))}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <a
                            href={getCobrancaUrlPessoal(order) || '#'}
                            target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all flex items-center justify-center"
                            title="Cobrar via WhatsApp Pessoal (DDD 31)"
                          >
                            <MessageSquare className="size-4" />
                          </a>
                          <a
                            href={getCobrancaUrlBusiness(order) || '#'}
                            target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-all flex items-center justify-center"
                            title="Cobrar via WhatsApp Business (DDD 11)"
                          >
                            <MessageSquare className="size-4" />
                          </a>
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
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Recebidos */}
              {activeTab === 'recebidos' && isLoaded && (
                <>
                  {received.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="font-bold">Nenhum recebimento no período</p>
                    </div>
                  )}
                  {received.map(order => (
                    <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                      <div className="size-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                        <div className="flex gap-3 text-xs text-slate-500">
                          <span>{PAYMENT_METHODS.find(m => m.value === order.paymentMethod)?.icon} {PAYMENT_METHODS.find(m => m.value === order.paymentMethod)?.label || order.paymentMethod}</span>
                          <span>Pago em {formatDate(order.paymentDate)}</span>
                          {order.invoiceNumber && <span>NF {order.invoiceNumber}</span>}
                        </div>
                      </div>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(getOrderValue(order))}</p>
                    </div>
                  ))}
                </>
              )}

              {/* Vencidos */}
              {activeTab === 'vencidos' && isLoaded && (
                <>
                  {overdue.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="size-10 mx-auto mb-3 text-emerald-400" />
                      <p className="font-bold">Nenhum pagamento vencido!</p>
                    </div>
                  )}
                  {overdue.map(order => {
                    const due = getDueDate(order);
                    const daysOverdue = due ? Math.floor((new Date().getTime() - new Date(due).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    return (
                      <div key={order.id} className="p-4 flex items-center gap-4 bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                        <div className="size-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                          <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                          <div className="flex gap-3 text-xs text-slate-500">
                            <span className="text-red-500 font-bold">{daysOverdue} dia{daysOverdue !== 1 ? 's' : ''} em atraso</span>
                            {due && <span>Venceu em {formatDate(due)}</span>}
                            {order.invoiceNumber && <span>NF {order.invoiceNumber}</span>}
                          </div>
                        </div>
                        <p className="text-sm font-black text-red-600 dark:text-red-400 shrink-0">{formatCurrency(getOrderValue(order))}</p>
                        <div className="flex gap-2 shrink-0">
                          <a
                            href={getCobrancaUrlPessoal(order) || '#'}
                            target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-all flex items-center justify-center"
                            title="Cobrar via WhatsApp Pessoal (DDD 31)"
                          >
                            <MessageSquare className="size-4" />
                          </a>
                          <a
                            href={getCobrancaUrlBusiness(order) || '#'}
                            target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-all flex items-center justify-center"
                            title="Cobrar via WhatsApp Business (DDD 11)"
                          >
                            <MessageSquare className="size-4" />
                          </a>
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
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Confirmar Pagamento */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Confirmar Pagamento</h2>
                  <p className="text-xs text-slate-500 font-bold">{selectedOrder.clientName}</p>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="size-5 text-slate-400" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Valor</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(getOrderValue(selectedOrder))}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Meio de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setPaymentForm(f => ({ ...f, method: m.value }))}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center ${paymentForm.method === m.value ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                      >
                        <div className="text-base mb-0.5">{m.icon}</div>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Data do Pagamento</p>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    disabled={isConfirmingPayment}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isConfirmingPayment ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
