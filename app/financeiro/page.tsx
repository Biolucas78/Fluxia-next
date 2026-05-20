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
  Loader2, X, Filter, Calendar, ChevronDown,
  MessageSquare, CreditCard, Search, SlidersHorizontal,
  Receipt, Landmark, Smartphone, ShoppingBag, Store, Warehouse
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'boleto',            label: 'Boleto',             icon: '🏦', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  { value: 'pix',               label: 'PIX',                icon: '⚡', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  { value: 'transferencia',     label: 'Transferência',      icon: '🔄', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' },
  { value: 'dinheiro',          label: 'Dinheiro',           icon: '💵', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
  { value: 'cartao',            label: 'Cartão',             icon: '💳', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
  { value: 'deposito_amazon',   label: 'Dep. Amazon',        icon: '📦', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  { value: 'deposito_meli',     label: 'Dep. Mercado Livre', icon: '🛒', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' },
  { value: 'deposito_fazendinha', label: 'Dep. Fazendinha',  icon: '🌿', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  { value: 'deposito_wix',      label: 'Dep. Wix',           icon: '🌐', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
];

const DOC_FILTERS = [
  { value: 'all',       label: 'Todos' },
  { value: 'invoice',   label: 'NF Vinculada' },
  { value: 'order',     label: 'Pedido Vinculado' },
  { value: 'none',      label: 'Sem Documento' },
];

const PERIOD_PRESETS = [
  { value: 'today',       label: 'Hoje' },
  { value: 'week',        label: 'Esta semana' },
  { value: 'month',       label: 'Este mês' },
  { value: 'last_month',  label: 'Mês anterior' },
  { value: 'quarter',     label: 'Trimestre' },
  { value: 'year',        label: 'Este ano' },
  { value: 'custom',      label: 'Período' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('pt-BR');
}

function getOrderValue(order: Order): number {
  if (order.invoiceLinked && order.invoiceValue) return order.invoiceValue;
  if (order.noInvoiceLinked && order.noInvoiceValue) return order.noInvoiceValue;
  if ((order.boletos as any)?.length > 0) {
    return (order.boletos as any[]).reduce((s: number, b: any) => s + (b.valor || 0), 0);
  }
  if (order.invoiceValue) return order.invoiceValue;
  return 0;
}

function getDueDate(order: Order): string | undefined {
  // 1. Boleto(s)
  const boletos = order.boletos as any[] | undefined;
  if (boletos && boletos.length > 0) {
    const lastBoleto = boletos[boletos.length - 1];
    if (lastBoleto.dataVencimento) return lastBoleto.dataVencimento;
  }
  // 2. paymentDueDate
  if (order.paymentDueDate) return order.paymentDueDate;
  // 3. noInvoiceDueDate
  if ((order as any).noInvoiceDueDate) return (order as any).noInvoiceDueDate;
  // 4. Cálculo por condição de pagamento
  const delivered = order.statusHistory?.find((h: any) => h.status === 'entregue');
  if (!delivered) return undefined;
  const base = new Date(delivered.timestamp);
  const cond = order.paymentCondition;
  if (cond === '15 dias') base.setDate(base.getDate() + 15);
  else if (cond === '21 dias') base.setDate(base.getDate() + 21);
  else if (cond === '30 dias') base.setDate(base.getDate() + 30);
  else if (cond === '2x') base.setDate(base.getDate() + 30);
  return base.toISOString().split('T')[0];
}

function getIssueDate(order: Order): string | undefined {
  const boletos = order.boletos as any[] | undefined;
  if (boletos && boletos.length > 0 && boletos[0].dataEmissao) return boletos[0].dataEmissao;
  const hist = order.statusHistory?.find((h: any) => h.status === 'entregue' || h.action?.includes('faturad'));
  return hist?.timestamp?.split('T')[0];
}

function isOverdue(order: Order): boolean {
  const due = getDueDate(order);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due + 'T12:00:00') < today;
}

function getDocType(order: Order): 'invoice' | 'order' | 'none' {
  if (order.invoiceLinked) return 'invoice';
  if ((order as any).noInvoiceLinked) return 'order';
  return 'none';
}

function getPaymentMethodInfo(method?: string) {
  return PAYMENT_METHODS.find(m => m.value === method) || { label: method || '—', icon: '💰', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' };
}

function getPeriodRange(preset: string, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
    case 'week': {
      const day = today.getDay();
      const from = new Date(today); from.setDate(today.getDate() - day);
      const to = new Date(from); to.setDate(from.getDate() + 6);
      return { from, to };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0) };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) };
    case 'custom':
      return {
        from: customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), 0, 1),
        to: customTo ? new Date(customTo + 'T23:59:59') : now,
      };
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function PaymentBadge({ method }: { method?: string }) {
  const info = getPaymentMethodInfo(method);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${info.color}`}>
      <span>{info.icon}</span>
      {info.label}
    </span>
  );
}

function DocBadge({ order }: { order: Order }) {
  if (order.invoiceLinked && order.invoiceNumber) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"><FileText className="size-2.5" />NF {order.invoiceNumber}</span>;
  }
  if ((order as any).noInvoiceLinked && (order as any).noInvoiceBlingOrderId) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"><Receipt className="size-2.5" />Ped. {(order as any).noInvoiceBlingOrderId}</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Sem doc.</span>;
}

interface OrderCardProps {
  order: Order;
  showOverdue?: boolean;
  showReceiveBtn?: boolean;
  onReceive?: (order: Order) => void;
}

function OrderCard({ order, showOverdue, showReceiveBtn, onReceive }: OrderCardProps) {
  const due = getDueDate(order);
  const issue = getIssueDate(order);
  const overdueFlag = isOverdue(order);
  const value = getOrderValue(order);
  const boletos = order.boletos as any[] | undefined;
  const daysOverdue = (overdueFlag && due)
    ? Math.floor((new Date().getTime() - new Date(due + 'T12:00:00').getTime()) / 86400000)
    : 0;

  const phone = order.phone?.replace(/\D/g, '');
  const cobrancaMsg = (() => {
    const v = formatCurrency(value);
    const nf = order.invoiceNumber ? `nota fiscal ${order.invoiceNumber}` : (order as any).noInvoiceBlingOrderId ? `pedido ${(order as any).noInvoiceBlingOrderId}` : 'seu pedido';
    const venc = due ? formatDate(due) : '';
    return `Olá! Passando para avisar sobre o pagamento referente à ${nf}, no valor de ${v}${venc ? `, com vencimento em ${venc}` : ''}. Poderia nos confirmar?`;
  })();

  const waPersonal = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(cobrancaMsg)}` : null;
  const waBusiness = phone ? `intent://send?phone=55${phone}&text=${encodeURIComponent(cobrancaMsg)}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end` : null;

  return (
    <div className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all ${overdueFlag && showOverdue ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Info principal */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Nome */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">
              {order.clientName}
            </p>
            {overdueFlag && showOverdue && (
              <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase">
                {daysOverdue}d atraso
              </span>
            )}
          </div>
          {order.tradeName && (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium -mt-1">{order.tradeName}</p>
          )}

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <PaymentBadge method={order.paymentMethod} />
            <DocBadge order={order} />
          </div>

          {/* Datas */}
          <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
            {issue && <span>Emissão: {formatDate(issue)}</span>}
            {due && (
              <span className={overdueFlag && showOverdue ? 'text-red-500 font-bold' : ''}>
                Venc.: {formatDate(due)}
              </span>
            )}
            {boletos && boletos.length > 1 && (
              <span className="text-blue-500">{boletos.length}x parcelas</span>
            )}
          </div>
        </div>

        {/* Valor + ações */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className={`text-base font-black ${overdueFlag && showOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
            {formatCurrency(value)}
          </p>
          {(showReceiveBtn || waPersonal) && (
            <div className="flex gap-1.5 items-center">
              {waPersonal && (
                <a href={waPersonal} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all"
                  title="WhatsApp Pessoal">
                  <MessageSquare className="size-3.5" />
                </a>
              )}
              {waBusiness && (
                <a href={waBusiness} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 transition-all"
                  title="WhatsApp Business">
                  <MessageSquare className="size-3.5" />
                </a>
              )}
              {showReceiveBtn && onReceive && (
                <button
                  onClick={() => onReceive(order)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                >
                  Receber
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const { allOrders, archivedOrders, isLoaded, handleUpdateOrder, handleArchiveOrder } = useOrders();
  const { userProfile, loading: userLoading } = useUser();

  // Busca
  const [searchQuery, setSearchQuery] = useState('');

  // Aba principal
  const [activeSection, setActiveSection] = useState<'receber' | 'recebidos' | 'vencidos'>('receber');

  // Filtros
  const [showFilters, setShowFilters] = useState(false);
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Modal pagamento
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    method: 'pix' as string,
    date: new Date().toISOString().split('T')[0],
  });

  const todosOsPedidos = useMemo(() => [...allOrders, ...archivedOrders], [allOrders, archivedOrders]);

  // ── Filtro de busca ──────────────────────────────────────────────────────────
  function matchesSearch(order: Order) {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.clientName.toLowerCase().includes(q) ||
      (order.tradeName && order.tradeName.toLowerCase().includes(q)) ||
      order.id.toLowerCase().includes(q)
    );
  }

  // ── Filtro de documento ──────────────────────────────────────────────────────
  function matchesDoc(order: Order) {
    if (filterDoc === 'all') return true;
    return getDocType(order) === filterDoc;
  }

  // ── Filtro de forma de pagamento ─────────────────────────────────────────────
  function matchesPayment(order: Order) {
    if (filterPayment === 'all') return true;
    return order.paymentMethod === filterPayment;
  }

  // ── Filtro de período (usa data de vencimento ou entrega) ────────────────────
  function matchesPeriod(order: Order, dateStr?: string) {
    if (!dateStr) return true;
    const { from, to } = getPeriodRange(filterPeriod, customFrom, customTo);
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
    return d >= from && d <= to;
  }

  // ── Listas calculadas ────────────────────────────────────────────────────────

  const toReceive = useMemo(() => {
    return allOrders.filter(o =>
      o.status === 'entregue' &&
      !o.archived &&
      o.paymentStatus !== 'pago' &&
      !isOverdue(o) &&
      matchesSearch(o) &&
      matchesDoc(o) &&
      matchesPayment(o)
    ).sort((a, b) => (getDueDate(a) || '').localeCompare(getDueDate(b) || ''));
  }, [allOrders, searchQuery, filterDoc, filterPayment]);

  const overdue = useMemo(() => {
    return allOrders.filter(o =>
      o.status === 'entregue' &&
      !o.archived &&
      o.paymentStatus !== 'pago' &&
      isOverdue(o) &&
      matchesSearch(o) &&
      matchesDoc(o) &&
      matchesPayment(o)
    ).sort((a, b) => (getDueDate(a) || '').localeCompare(getDueDate(b) || ''));
  }, [allOrders, searchQuery, filterDoc, filterPayment]);

  const received = useMemo(() => {
    return todosOsPedidos.filter(o =>
      o.paymentStatus === 'pago' &&
      matchesSearch(o) &&
      matchesDoc(o) &&
      matchesPayment(o) &&
      matchesPeriod(o, o.paymentDate)
    ).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [todosOsPedidos, searchQuery, filterDoc, filterPayment, filterPeriod, customFrom, customTo]);

  const totalToReceive = useMemo(() => toReceive.reduce((s, o) => s + getOrderValue(o), 0), [toReceive]);
  const totalOverdue = useMemo(() => overdue.reduce((s, o) => s + getOrderValue(o), 0), [overdue]);
  const totalReceived = useMemo(() => received.reduce((s, o) => s + getOrderValue(o), 0), [received]);

  // ── Modal pagamento ──────────────────────────────────────────────────────────

  const openReceive = (order: Order) => {
    setSelectedOrder(order);
    setPaymentForm({
      method: order.paymentMethod || 'pix',
      date: new Date().toISOString().split('T')[0],
    });
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
        paymentLinked: true,
        statusHistory: [
          ...(selectedOrder.statusHistory || []),
          {
            action: `Pagamento confirmado — ${getPaymentMethodInfo(paymentForm.method).label}`,
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await handleUpdateOrder(updatedOrder);
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

  // ── Render ───────────────────────────────────────────────────────────────────

  if (userLoading) return null;
  if (!userProfile) return <Login />;

  const sections = [
    { id: 'receber',   label: 'A Receber', count: toReceive.length, total: totalToReceive,  color: 'text-amber-600',  bg: 'bg-amber-600',  icon: Clock },
    { id: 'recebidos', label: 'Recebidos', count: received.length,  total: totalReceived,   color: 'text-emerald-600', bg: 'bg-emerald-600', icon: CheckCircle2 },
    { id: 'vencidos',  label: 'Vencidos',  count: overdue.length,   total: totalOverdue,    color: 'text-red-600',    bg: 'bg-red-600',    icon: AlertTriangle },
  ];

  const activeList = activeSection === 'receber' ? toReceive : activeSection === 'recebidos' ? received : overdue;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Financeiro"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Subtítulo de seção */}
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Contas a Receber — Atualizado em tempo real
          </p>

          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sections.map(sec => {
              const Icon = sec.icon;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id as any)}
                  className={`text-left bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 shadow-sm hover:shadow-md ${
                    activeSection === sec.id
                      ? 'border-primary ring-1 ring-primary/30'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`size-8 rounded-xl flex items-center justify-center ${
                      sec.id === 'receber'   ? 'bg-amber-100 dark:bg-amber-900/30' :
                      sec.id === 'recebidos' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                                              'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      <Icon className={`size-4 ${sec.color}`} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sec.label}</p>
                  </div>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(sec.total)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{sec.count} pedido{sec.count !== 1 ? 's' : ''}</p>
                </button>
              );
            })}
          </div>

          {/* Painel principal */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">

            {/* Barra de abas + filtros */}
            <div className="flex items-center border-b border-slate-100 dark:border-slate-800">
              {/* Abas */}
              <div className="flex flex-1">
                {sections.map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id as any)}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                      activeSection === sec.id
                        ? 'border-b-2 border-primary text-primary bg-primary/5'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {sec.label}
                    {sec.count > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        activeSection === sec.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>{sec.count}</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Botão filtros */}
              <button
                onClick={() => setShowFilters(f => !f)}
                className={`px-4 py-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all border-l border-slate-100 dark:border-slate-800 ${
                  showFilters ? 'text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <SlidersHorizontal className="size-3.5" />
                Filtros
                {(filterDoc !== 'all' || filterPayment !== 'all' || filterPeriod !== 'month') && (
                  <span className="size-1.5 rounded-full bg-primary" />
                )}
              </button>
            </div>

            {/* Painel de filtros */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-slate-100 dark:border-slate-800"
                >
                  <div className="p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">

                    {/* Período */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Período</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PERIOD_PRESETS.map(p => (
                          <button
                            key={p.value}
                            onClick={() => setFilterPeriod(p.value)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              filterPeriod === p.value
                                ? 'bg-primary text-white'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'
                            }`}
                          >{p.label}</button>
                        ))}
                      </div>
                      {filterPeriod === 'custom' && (
                        <div className="flex gap-2 mt-2">
                          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-primary" />
                          <span className="text-slate-400 self-center text-xs">até</span>
                          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-primary" />
                        </div>
                      )}
                    </div>

                    {/* Documento */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Documento</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {DOC_FILTERS.map(d => (
                          <button key={d.value} onClick={() => setFilterDoc(d.value)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              filterDoc === d.value
                                ? 'bg-primary text-white'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'
                            }`}>{d.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Pagamento */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Forma de Pagamento</p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => setFilterPayment('all')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${filterPayment === 'all' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'}`}>Todos</button>
                        {PAYMENT_METHODS.map(m => (
                          <button key={m.value} onClick={() => setFilterPayment(m.value)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              filterPayment === m.value
                                ? 'bg-primary text-white'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'
                            }`}>{m.icon} {m.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Limpar filtros */}
                    {(filterDoc !== 'all' || filterPayment !== 'all' || filterPeriod !== 'month') && (
                      <button
                        onClick={() => { setFilterDoc('all'); setFilterPayment('all'); setFilterPeriod('month'); setCustomFrom(''); setCustomTo(''); }}
                        className="text-[10px] font-black text-red-500 hover:text-red-600 uppercase tracking-widest"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lista de pedidos */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[55vh] overflow-y-auto custom-scrollbar">
              {!isLoaded && (
                <div className="py-12 text-center"><Loader2 className="size-8 animate-spin text-primary mx-auto" /></div>
              )}

              {isLoaded && activeList.length === 0 && (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  {activeSection === 'receber' && <Clock className="size-10 mx-auto mb-3 opacity-30" />}
                  {activeSection === 'recebidos' && <CheckCircle2 className="size-10 mx-auto mb-3 text-emerald-400 opacity-60" />}
                  {activeSection === 'vencidos' && <AlertTriangle className="size-10 mx-auto mb-3 opacity-30" />}
                  <p className="font-bold text-sm">
                    {activeSection === 'receber'   ? 'Nenhum recebimento pendente' :
                     activeSection === 'recebidos' ? 'Nenhum recebimento no período' :
                                                     'Nenhum pagamento vencido'}
                  </p>
                  {searchQuery && <p className="text-xs">Tente limpar a busca</p>}
                </div>
              )}

              {isLoaded && activeList.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  showOverdue={activeSection === 'vencidos' || activeSection === 'receber'}
                  showReceiveBtn={activeSection !== 'recebidos'}
                  onReceive={openReceive}
                />
              ))}
            </div>

            {/* Rodapé com total filtrado */}
            {isLoaded && activeList.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {activeList.length} pedido{activeList.length !== 1 ? 's' : ''}
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {formatCurrency(activeList.reduce((s, o) => s + getOrderValue(o), 0))}
                </p>
              </div>
            )}
          </div>

          {/* Espaço reservado para futuras seções */}
          {/* 
            TODO: 
            - <PagamentosSection /> — fornecedores, impostos, contador
            - <CustosVariaveisSection /> — margem e DRE
          */}

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
                  {selectedOrder.tradeName && (
                    <p className="text-[10px] text-slate-400">{selectedOrder.tradeName}</p>
                  )}
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="size-5 text-slate-400" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Valor */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Valor</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(getOrderValue(selectedOrder))}</p>
                </div>

                {/* Doc info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <DocBadge order={selectedOrder} />
                  {getDueDate(selectedOrder) && (
                    <span className="text-xs text-slate-500">Venc.: {formatDate(getDueDate(selectedOrder))}</span>
                  )}
                </div>

                {/* Meio de pagamento */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Meio de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setPaymentForm(f => ({ ...f, method: m.value }))}
                        className={`py-2 px-1 rounded-xl text-[10px] font-bold border transition-all text-center ${
                          paymentForm.method === m.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-base mb-0.5">{m.icon}</div>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Data do Pagamento</p>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-1">
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
