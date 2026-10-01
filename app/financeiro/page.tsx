'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrders, useUser } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import { Order } from '@/lib/types';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, Clock, AlertTriangle, CheckCircle2, FileText,
  Loader2, X, Filter, Calendar, ChevronDown, CalendarOff, ArrowUpDown,
  MessageSquare, CreditCard, Search, SlidersHorizontal,
  Receipt, Landmark, Smartphone, ShoppingBag, Store, Warehouse, RefreshCw, ExternalLink
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
  { value: 'all',         label: 'Todo o período' },
  { value: 'today',       label: 'Hoje' },
  { value: 'week',        label: 'Esta semana' },
  { value: 'month',       label: 'Este mês' },
  { value: 'last_month',  label: 'Mês anterior' },
  { value: 'quarter',     label: 'Trimestre' },
  { value: 'year',        label: 'Este ano' },
  { value: 'mes',         label: 'Mês ▾' },
  { value: 'custom',      label: 'Período' },
];

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Base de data usada para filtrar/ordenar/agrupar cada aba
type DateBasis = 'vencimento' | 'criacao' | 'recebimento';

const DATE_BASIS_OPTIONS: { value: DateBasis; label: string }[] = [
  { value: 'vencimento',  label: 'Vencimento' },
  { value: 'criacao',     label: 'Criação' },
  { value: 'recebimento', label: 'Recebimento' },
];

const DEFAULT_BASIS_BY_SECTION: Record<string, DateBasis> = {
  receber: 'vencimento',
  vencidos: 'vencimento',
  recebidos: 'recebimento',
  todos: 'criacao',
};

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

// Data de emissão = data de entrada do pedido no Fluxia.
function getIssueDate(order: Order): string | undefined {
  return toDateOnly(order.createdAt || (order as any).updatedAt || undefined);
}

// Normaliza qualquer string de data (timestamp ISO ou 'YYYY-MM-DD') para só a parte 'YYYY-MM-DD'
function toDateOnly(s?: string): string | undefined {
  if (!s) return undefined;
  return s.length >= 10 ? s.substring(0, 10) : s;
}

// Retorna a data do pedido conforme a base escolhida (vencimento / criação / recebimento)
function getDateForBasis(order: Order, basis: DateBasis): string | undefined {
  if (basis === 'vencimento') return getDueDate(order);
  if (basis === 'recebimento') return (order as any).paymentDate || undefined;
  return order.createdAt || (order as any).updatedAt || undefined;
}

// Um "item recebível": pedido não parcelado = o pedido inteiro; pedido parcelado = CADA parcela
// vira um item próprio, com seu próprio vencimento/valor/situação — para não jogar o valor
// total do pedido inteiro numa única data (a da última parcela).
interface ReceivableItem {
  order: Order;
  parcelaIndex: number | null; // null = pedido não parcelado (o pedido inteiro é o item)
  valor: number;
  dueDate?: string;
  paymentDate?: string;
  paid: boolean;
  overdueFlag: boolean;
  seuNumero?: string;
  nossoNumero?: string;
  paidManually?: boolean;
}

function getReceivableItems(order: Order): ReceivableItem[] {
  const allBoletos = (order.boletos as any[]) || [];
  // Parcelas canceladas/baixadas não representam dinheiro a receber nem recebido — ignoradas
  // na hora de montar os itens (mas o índice original é preservado para as ações de sync/baixa).
  const activeBoletos = allBoletos.filter((b: any) => {
    const sit = (b.situacao || '').toLowerCase();
    return sit !== 'cancelado' && sit !== 'baixado';
  });
  // Se o pedido como um todo já foi confirmado como pago (ex: PIX confirmado manualmente,
  // fora do fluxo de boleto), isso vale pra qualquer parcela restante — mesmo que a situação
  // individual dela no Sicoob ainda não tenha sido sincronizada.
  const orderConfirmedPaid = isPaid(order);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (activeBoletos.length > 1) {
    return activeBoletos.map((b) => {
      const sit = (b.situacao || '').toLowerCase();
      const paid = orderConfirmedPaid || sit === 'liquidado' || sit === 'pago';
      const due = b.dataVencimento as string | undefined;
      const overdueFlag = !paid && !!due && new Date(due + 'T12:00:00') < today;
      return {
        order,
        parcelaIndex: allBoletos.indexOf(b),
        valor: b.valor || 0,
        dueDate: due,
        paymentDate: b.dataPagamento || b.paymentDate || order.paymentDate || undefined,
        paid,
        overdueFlag,
        seuNumero: b.seuNumero,
        nossoNumero: b.nossoNumero,
        paidManually: !!b.paidManually || !!(order as any).paymentConfirmedManually,
      };
    });
  }

  // 0 ou 1 parcela ativa restante (as demais foram canceladas/baixadas)
  const only = activeBoletos[0];
  if (only) {
    const sit = (only.situacao || '').toLowerCase();
    const paid = orderConfirmedPaid || sit === 'liquidado' || sit === 'pago';
    const due = only.dataVencimento as string | undefined;
    const overdueFlag = !paid && !!due && new Date(due + 'T12:00:00') < today;
    return [{
      order,
      parcelaIndex: allBoletos.length > 1 ? allBoletos.indexOf(only) : null,
      valor: only.valor || 0,
      dueDate: due,
      paymentDate: only.dataPagamento || only.paymentDate || order.paymentDate || undefined,
      paid,
      overdueFlag,
      seuNumero: only.seuNumero,
      nossoNumero: only.nossoNumero,
      paidManually: !!only.paidManually || !!(order as any).paymentConfirmedManually,
    }];
  }

  // Nenhuma parcela ativa (sem boleto, ou todos cancelados) — usa os dados do pedido (PIX, depósito, etc.)
  return [{
    order,
    parcelaIndex: null,
    valor: getOrderValue(order),
    dueDate: getDueDate(order),
    paymentDate: order.paymentDate,
    paid: orderConfirmedPaid,
    overdueFlag: isOverdue(order),
    seuNumero: undefined,
    nossoNumero: (order as any).boletoNossoNumero,
    paidManually: !!(order as any).paymentConfirmedManually,
  }];
}

// Data do item conforme a base escolhida (vencimento/criação/recebimento).
// Criação é sempre a do pedido inteiro (não existe "data de criação da parcela").
function getItemDate(item: ReceivableItem, basis: DateBasis): string | undefined {
  if (basis === 'vencimento') return item.dueDate;
  if (basis === 'recebimento') return item.paymentDate;
  return item.order.createdAt || (item.order as any).updatedAt || undefined;
}

interface ItemGroup { dateKey: string; items: ReceivableItem[]; total: number }

function groupItemsByDate(items: ReceivableItem[], basis: DateBasis, sortDir: 'asc' | 'desc'): ItemGroup[] {
  const groups = new Map<string, ReceivableItem[]>();
  for (const it of items) {
    const key = toDateOnly(getItemDate(it, basis)) || '__nodate__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const dateKeys = [...groups.keys()].filter(k => k !== '__nodate__')
    .sort((a, b) => sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
  const orderedKeys = groups.has('__nodate__') ? [...dateKeys, '__nodate__'] : dateKeys;
  return orderedKeys.map(key => {
    const its = groups.get(key)!.sort((a, b) => a.order.clientName.localeCompare(b.order.clientName));
    return { dateKey: key, items: its, total: its.reduce((s, i) => s + i.valor, 0) };
  });
}

interface DateGroup { dateKey: string; orders: Order[]; total: number }

// Agrupa pedidos por dia (conforme a base de data escolhida), ordenando os grupos.
// Pedidos sem a data escolhida ficam num grupo "__nodate__", sempre no final.
function groupByDate(orders: Order[], basis: DateBasis, sortDir: 'asc' | 'desc'): DateGroup[] {
  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const key = toDateOnly(getDateForBasis(o, basis)) || '__nodate__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  const dateKeys = [...groups.keys()].filter(k => k !== '__nodate__')
    .sort((a, b) => sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
  const orderedKeys = groups.has('__nodate__') ? [...dateKeys, '__nodate__'] : dateKeys;
  return orderedKeys.map(key => {
    const orders = groups.get(key)!.sort((a, b) => a.clientName.localeCompare(b.clientName));
    return { dateKey: key, orders, total: orders.reduce((s, o) => s + getOrderValue(o), 0) };
  });
}

function formatGroupDateHeader(dateKey: string): string {
  if (dateKey === '__nodate__') return 'Data não informada';
  const d = new Date(dateKey + 'T12:00:00');
  return `Dia ${String(d.getDate()).padStart(2, '0')} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
}

function isPaid(order: Order): boolean {
  if ((order as any).paymentConfirmedManually) return true;
  const boletoLinked = (order as any).boletoLinked as boolean | undefined;
  if (boletoLinked) {
    const boletos = order.boletos as any[] | undefined;
    if (boletos && boletos.length > 0) {
      return boletos.every((b: any) => {
        const sit = (b.situacao || '').toLowerCase();
        return sit === 'liquidado' || sit === 'pago';
      });
    }
    const situacao = ((order as any).boletSituacao as string || '').toLowerCase();
    return situacao === 'liquidado' || situacao === 'pago';
  }
  return order.paymentStatus === 'pago';
}

// Retorna true se o pedido está VENCIDO (não pago + data de vencimento passou).
function isOverdue(order: Order): boolean {
  if (isPaid(order)) return false;
  const due = getDueDate(order);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due + 'T12:00:00') < today;
}

// Pedidos excluídos da página Financeiro (tag Amostras, etc.)
function isExcluded(order: Order): boolean {
  const tags = (order as any).tags as string[] | undefined;
  if ((order as any).isSample) return true;
  return false;
}

function getDocType(order: Order): 'invoice' | 'order' | 'none' {
  if (order.invoiceLinked) return 'invoice';
  if ((order as any).noInvoiceLinked) return 'order';
  return 'none';
}

function getPaymentMethodInfo(method?: string) {
  return PAYMENT_METHODS.find(m => m.value === method) || { label: method || '—', icon: '💰', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' };
}

// Quantas "semanas" (blocos de 7 dias) cabem num mês — usado no seletor de semana do mês
function getWeeksInMonth(year: number, monthIdx0: number): number {
  const lastDay = new Date(year, monthIdx0 + 1, 0).getDate();
  return Math.ceil(lastDay / 7);
}

function getPeriodRange(preset: string, customFrom: string, customTo: string, weekOfMonth?: number | null): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Mês específico: formato 'mes_YYYY_MM'
  if (preset.startsWith('mes_')) {
    const parts = preset.split('_');
    const year = parseInt(parts[1]);
    const month = parseInt(parts[2]) - 1; // 0-indexed
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (weekOfMonth) {
      const startDay = (weekOfMonth - 1) * 7 + 1;
      const endDay = Math.min(startDay + 6, lastDay);
      return { from: new Date(year, month, startDay), to: new Date(year, month, endDay, 23, 59, 59) };
    }
    return { from: new Date(year, month, 1), to: new Date(year, month + 1, 0, 23, 59, 59) };
  }
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
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
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

function SyncBoletoButton({ order }: { order: Order }) {
  const [syncing, setSyncing] = React.useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sicoob/atualizar-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, nossoNumero: (order as any).boletoNossoNumero }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || 'Boleto atualizado!');
      } else {
        toast.error('Erro: ' + (data.error || 'Falha ao sincronizar'));
      }
    } catch (e: any) {
      toast.error('Erro ao sincronizar boleto: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };
  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all disabled:opacity-50"
      title="Sincronizar boleto com Sicoob"
    >
      {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
    </button>
  );
}

function BoletoSyncButton({ orderId, nossoNumero }: { orderId: string; nossoNumero: string }) {
  const [syncing, setSyncing] = React.useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sicoob/atualizar-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, nossoNumero }),
      });
      const data = await res.json();
      if (data.ok) toast.success(data.message || 'Boleto atualizado!');
      else toast.error('Erro: ' + (data.error || 'Falha ao sincronizar'));
    } catch (e: any) {
      toast.error('Erro ao sincronizar boleto: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };
  return (
    <button onClick={handleSync} disabled={syncing}
      className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all disabled:opacity-50"
      title="Sincronizar boleto com Sicoob">
      {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
    </button>
  );
}

// Campo rápido pra definir o vencimento direto na aba "Sem Vencimento", sem precisar
// abrir o pedido no Kanban. Se o pedido já tem data de pagamento, pré-preenche com ela
// (comum: pedido já foi recebido mas nunca teve o vencimento formal registrado).
function DueDateQuickFix({ order, onSave }: { order: Order; onSave: (date: string) => Promise<void> }) {
  const [value, setValue] = useState(() => (order.paymentDate ? order.paymentDate.substring(0, 10) : ''));
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
      <label className="text-[9px] font-black text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-widest shrink-0">
        Definir vencimento:
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none focus:border-primary"
      />
      <button
        onClick={async () => {
          if (!value) return;
          setSaving(true);
          try {
            await onSave(value);
          } finally {
            setSaving(false);
          }
        }}
        disabled={!value || saving}
        className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
        Confirmar
      </button>
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  showOverdue?: boolean;
  showReceiveBtn?: boolean;
  showStatusBadge?: boolean;
  onReceive?: (order: Order) => void;
  onManualPayBoleto?: (order: Order, boletIndex: number, valor: number, seuNumero: string) => void;
  // Quando presente, o card exibe os dados de UMA parcela específica (não o pedido inteiro)
  itemOverride?: ReceivableItem;
}

function OrderCard({ order, showOverdue, showReceiveBtn, showStatusBadge, onReceive, onManualPayBoleto, itemOverride }: OrderCardProps) {
  const isItemView = !!itemOverride;
  const due = isItemView ? itemOverride!.dueDate : getDueDate(order);
  const issue = getIssueDate(order);
  const overdueFlag = isItemView ? itemOverride!.overdueFlag : isOverdue(order);
  const value = isItemView ? itemOverride!.valor : getOrderValue(order);
  const paidFlag = isItemView ? itemOverride!.paid : isPaid(order);
  const paymentDateValue = isItemView ? itemOverride!.paymentDate : order.paymentDate;
  // Em visão de parcela única, não repete a lista de todas as parcelas dentro do card
  const boletos = isItemView ? undefined : (order.boletos as any[] | undefined);
  const { userProfile } = useUser();
  const router = useRouter();
  const daysOverdue = (overdueFlag && due)
    ? Math.floor((new Date().getTime() - new Date(due + 'T12:00:00').getTime()) / 86400000)
    : 0;

  const phone = order.phone?.replace(/\D/g, '');
  const cobrancaMsg = (() => {
    const v = formatCurrency(value);
    const emissao = issue ? formatDate(issue) : '';
    const nf = order.invoiceNumber || (order as any).noInvoiceBlingOrderId || '';
    const venc = due ? formatDate(due) : '';
    const boletoValor = (boletos && boletos.length > 0) ? formatCurrency(boletos[0].valor || value) : v;
    return `Pedido faturado em ${emissao || '-'}, referente a nota fiscal ${nf || '-'}, no valor de ${boletoValor}, vencido em ${venc || '-'}.`;
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
            <button
              onClick={() => router.push('/producao?busca=' + encodeURIComponent(order.id))}
              className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all shrink-0"
              title="Ver pedido na Produção"
            >
              <ExternalLink className="size-3" />
            </button>
            {itemOverride?.parcelaIndex != null && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                Parc. {itemOverride.parcelaIndex + 1}
              </span>
            )}
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
            <PaymentBadge method={(order as any).boletoLinked ? "boleto" : order.paymentMethod} />
            <DocBadge order={order} />
            {showStatusBadge && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                paidFlag
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : overdueFlag
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              }`}>
                {paidFlag ? 'Recebido' : overdueFlag ? 'Vencido' : 'A Receber'}
              </span>
            )}
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
            {paidFlag && paymentDateValue && !(boletos && boletos.length > 1) && (
              <span className="text-emerald-600 font-semibold">
                Pago em: {paymentDateValue.substring(0, 10).split('-').reverse().join('/')}
              </span>
            )}
          </div>
          {boletos && boletos.length > 1 && (
            <div className="space-y-1">
              {boletos.map((b: any, i: number) => {
                const sit = (b.situacao || '').toLowerCase();
                const isParcPaga = sit === 'liquidado' || sit === 'pago';
                const isParcVencida = !isParcPaga && !!b.dataVencimento && new Date(b.dataVencimento + 'T12:00:00') < new Date();
                const sitLabel = isParcPaga ? (b.paidManually ? 'Pago — PIX' : 'Pago') : isParcVencida ? 'Vencido' : 'A Receber';
                const sitColor = isParcPaga ? 'text-emerald-600' : isParcVencida ? 'text-red-500' : 'text-amber-600';
                return (
                  <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] ${isParcPaga ? 'bg-emerald-50 dark:bg-emerald-900/10' : isParcVencida ? 'bg-red-50 dark:bg-red-900/10' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <span className="flex-1 font-medium text-slate-600 dark:text-slate-400 truncate">
                      Parc {i+1} · NF {b.seuNumero || '-'} · {isParcPaga
                        ? `Pago: ${(b.dataPagamento||b.paymentDate||'').substring(0,10).split('-').reverse().join('/') || '—'}`
                        : `Venc: ${b.dataVencimento ? b.dataVencimento.split('-').reverse().join('/') : '-'}`}
                    </span>
                    <span className={sitColor + ' font-bold shrink-0'}>{sitLabel}</span>
                    <span className="font-black text-slate-700 dark:text-slate-300 shrink-0">{formatCurrency(b.valor||0)}</span>
                    <button
                      onClick={async (evt) => {
                        evt.stopPropagation();
                        try {
                          const res = await fetch('/api/sicoob/atualizar-boleto', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderId: order.id, nossoNumero: b.nossoNumero }) });
                          const data = await res.json();
                          if (data.ok) toast.success(data.message || 'Atualizado!');
                          else toast.error('Erro: ' + (data.error || 'Falha'));
                        } catch (err: any) { toast.error('Erro: ' + err.message); }
                      }}
                      className="p-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all shrink-0"
                      title="Atualizar no Sicoob"
                    >
                      <RefreshCw className="size-2.5" />
                    </button>
                    {b.paidManually ? (
                      <button
                        onClick={async (evt) => {
                          evt.stopPropagation();
                          try {
                            const res = await fetch('/api/orders/update-boleto-manual', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderId: order.id, boletIndex: i, paidManually: false, userName: userProfile?.email, userId: userProfile?.uid }) });
                            const data = await res.json();
                            if (data.ok) toast.success(data.message || 'Baixa desfeita.');
                            else toast.error('Erro: ' + (data.error || 'Falha'));
                          } catch (err: any) { toast.error('Erro: ' + err.message); }
                        }}
                        className="p-1 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all shrink-0"
                        title="Desfazer baixa manual"
                      >
                        <X className="size-2.5" />
                      </button>
                    ) : !isParcPaga && (
                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          onManualPayBoleto?.(order, i, b.valor || 0, b.seuNumero || '');
                        }}
                        className="p-1 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all shrink-0"
                        title="Dar baixa manual (PIX)"
                      >
                        <CheckCircle2 className="size-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {(() => {
                const paid = boletos.filter((b: any) => { const s = (b.situacao||'').toLowerCase(); return s === 'liquidado' || s === 'pago'; });
                if (paid.length === 0 || paid.length === boletos.length) return null;
                const outstanding = boletos.filter((b: any) => { const s = (b.situacao||'').toLowerCase(); return s !== 'liquidado' && s !== 'pago'; }).reduce((acc: number, b: any) => acc + (b.valor||0), 0);
                return (
                  <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 border-t border-dashed border-slate-200 dark:border-slate-700 pt-1 mt-0.5">
                    <span>{paid.length}/{boletos.length} pagas</span>
                    <span className="font-bold text-amber-600">Restante: {formatCurrency(outstanding)}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Valor + ações */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {value === 0 ? (
            <div className="flex flex-col items-end gap-1">
              <p className="text-base font-black text-amber-500 dark:text-amber-400 line-through opacity-50">
                R$ 0,00
              </p>
              <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full uppercase">
                Corrigir valor
              </span>
            </div>
          ) : (
            <p className={`text-base font-black ${overdueFlag && showOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {formatCurrency(value)}
            </p>
          )}
          {(showReceiveBtn || waPersonal || (isItemView ? (itemOverride!.nossoNumero || itemOverride!.paidManually) : ((order as any).boletoLinked && (order as any).boletoNossoNumero && !(boletos && boletos.length > 1)))) && (
            <div className="flex gap-1.5 items-center flex-wrap justify-end">
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
              {isItemView ? (
                <>
                  {itemOverride!.nossoNumero && (
                    <BoletoSyncButton orderId={order.id} nossoNumero={itemOverride!.nossoNumero} />
                  )}
                  {paidFlag && itemOverride!.paidManually && itemOverride!.parcelaIndex != null && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/orders/update-boleto-manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, boletIndex: itemOverride!.parcelaIndex, paidManually: false, userName: userProfile?.email, userId: userProfile?.uid }) });
                          const data = await res.json();
                          if (data.ok) toast.success(data.message || 'Baixa desfeita.');
                          else toast.error('Erro: ' + (data.error || 'Falha'));
                        } catch (err: any) { toast.error('Erro: ' + err.message); }
                      }}
                      className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all"
                      title="Desfazer baixa manual"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                  {showReceiveBtn && !paidFlag && itemOverride!.parcelaIndex != null && onManualPayBoleto && (
                    <button
                      onClick={() => onManualPayBoleto(order, itemOverride!.parcelaIndex!, itemOverride!.valor, itemOverride!.seuNumero || '')}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                    >
                      Receber
                    </button>
                  )}
                  {showReceiveBtn && !paidFlag && itemOverride!.parcelaIndex == null && onReceive && (
                    <button
                      onClick={() => onReceive(order)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                    >
                      Receber
                    </button>
                  )}
                </>
              ) : (
                <>
                  {(order as any).boletoLinked && (order as any).boletoNossoNumero && !(boletos && boletos.length > 1) && (
                    <SyncBoletoButton order={order} />
                  )}
                  {showReceiveBtn && onReceive && (
                    <button
                      onClick={() => onReceive(order)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 transition-all"
                    >
                      Receber
                    </button>
                  )}
                </>
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
  const { allOrders, isLoaded, handleUpdateOrder } = useOrders();
  const { userProfile, loading: userLoading } = useUser();

  // Busca
  const [searchQuery, setSearchQuery] = useState('');

  // Aba principal
  const [activeSection, setActiveSection] = useState<'receber' | 'recebidos' | 'vencidos' | 'todos' | 'sem_data'>('receber');

  // Filtros
  const [showFilters, setShowFilters] = useState(false);
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [filterWeek, setFilterWeek] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Base de data usada em cada aba (vencimento/criação/recebimento) — lembrada por aba
  const [dateBasisBySection, setDateBasisBySection] = useState<Record<string, DateBasis>>(DEFAULT_BASIS_BY_SECTION);
  const activeBasis = dateBasisBySection[activeSection] ?? 'criacao';

  // Modal pagamento (ordem completa)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    method: 'pix' as string,
    date: new Date().toISOString().split('T')[0],
  });

  // Modal pagamento parcela individual
  const [selectedBoleto, setSelectedBoleto] = useState<{ order: Order; boletIndex: number; valor: number; seuNumero: string } | null>(null);
  const [boletoPayForm, setBoletoPayForm] = useState({ method: 'pix', date: new Date().toISOString().split('T')[0] });
  const [isConfirmingBoleto, setIsConfirmingBoleto] = useState(false);

  const todosOsPedidos = useMemo(() => allOrders, [allOrders]);

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

  // ── Filtro de período (usa a base de data escolhida para a aba: vencimento/criação/recebimento) ──
  function matchesPeriod(order: Order, basis: DateBasis) {
    if (filterPeriod === 'all') return true;
    const dateStr = toDateOnly(getDateForBasis(order, basis));
    if (!dateStr) return false; // sem a data escolhida não dá pra dizer se está no período
    const { from, to } = getPeriodRange(filterPeriod, customFrom, customTo, filterWeek);
    const d = new Date(dateStr + 'T12:00:00');
    return d >= from && d <= to;
  }

  // ── Listas calculadas ────────────────────────────────────────────────────────

  // Pedidos elegiveis: tem pagamento lancado (qualquer coluna) + nao excluidos (Amostras) + nao deletados
  // Inclui arquivados pois todosOsPedidos ja contem archivedOrders
  const pedidosElegiveis = useMemo(() => {
    return todosOsPedidos.filter(o =>
      (o.paymentLinked || o.invoiceLinked || (o as any).noInvoiceLinked || o.boletoLinked) &&
      !isExcluded(o) &&
      !(o as any).deleted
    );
  }, [todosOsPedidos]);

  // Itens recebíveis: pedido não parcelado = 1 item (o pedido), pedido parcelado = 1 item POR PARCELA.
  // É isso que faz o vencimento/soma do período respeitar cada parcela e não o valor total do pedido.
  const allReceivableItems = useMemo(() => pedidosElegiveis.flatMap(getReceivableItems), [pedidosElegiveis]);

  function matchesPeriodItem(item: ReceivableItem, basis: DateBasis) {
    if (filterPeriod === 'all') return true;
    const dateStr = toDateOnly(getItemDate(item, basis));
    if (!dateStr) return false;
    const { from, to } = getPeriodRange(filterPeriod, customFrom, customTo, filterWeek);
    const d = new Date(dateStr + 'T12:00:00');
    return d >= from && d <= to;
  }

  // A RECEBER: nao pago + vencimento >= hoje + vencimento definido (sem vencimento vai pra aba "Sem Vencimento")
  // Cobre: boleto em aberto (cada parcela separada), PIX/deposito com data futura
  const toReceive = useMemo(() => {
    const basis = dateBasisBySection.receber ?? 'vencimento';
    return allReceivableItems.filter(it =>
      !it.paid &&
      !it.overdueFlag &&
      !!it.dueDate &&
      matchesSearch(it.order) &&
      matchesDoc(it.order) &&
      matchesPayment(it.order) &&
      matchesPeriodItem(it, basis)
    );
  }, [allReceivableItems, searchQuery, filterDoc, filterPayment, filterPeriod, customFrom, customTo, filterWeek, dateBasisBySection.receber]);

  // VENCIDOS: nao pago + vencimento < hoje (cada parcela separada)
  const overdue = useMemo(() => {
    const basis = dateBasisBySection.vencidos ?? 'vencimento';
    return allReceivableItems.filter(it =>
      !it.paid &&
      it.overdueFlag &&
      matchesSearch(it.order) &&
      matchesDoc(it.order) &&
      matchesPayment(it.order) &&
      matchesPeriodItem(it, basis)
    );
  }, [allReceivableItems, searchQuery, filterDoc, filterPayment, filterPeriod, customFrom, customTo, filterWeek, dateBasisBySection.vencidos]);

  // RECEBIDOS: pago (cada parcela separada, com sua própria data/valor de recebimento)
  const received = useMemo(() => {
    const basis = dateBasisBySection.recebidos ?? 'recebimento';
    return allReceivableItems.filter(it =>
      it.paid &&
      matchesSearch(it.order) &&
      matchesDoc(it.order) &&
      matchesPayment(it.order) &&
      matchesPeriodItem(it, basis)
    );
  }, [allReceivableItems, searchQuery, filterDoc, filterPayment, filterPeriod, customFrom, customTo, filterWeek, dateBasisBySection.recebidos]);

  // TODOS: todos os pedidos elegíveis com filtros (visão por pedido, não por parcela)
  const allFiltered = useMemo(() => {
    const basis = dateBasisBySection.todos ?? 'criacao';
    return pedidosElegiveis.filter(o =>
      matchesSearch(o) &&
      matchesDoc(o) &&
      matchesPayment(o) &&
      matchesPeriod(o, basis)
    );
  }, [pedidosElegiveis, searchQuery, filterDoc, filterPayment, filterPeriod, customFrom, customTo, filterWeek, dateBasisBySection.todos]);

  // SEM VENCIMENTO: pedidos elegíveis sem data de vencimento e/ou sem data de emissão definida
  // Não tem filtro de período (não há data pra filtrar) — serve como lista de correção.
  const semVencimento = useMemo(() => {
    return pedidosElegiveis.filter(o =>
      (!getDueDate(o) || !getIssueDate(o)) &&
      matchesSearch(o) &&
      matchesDoc(o) &&
      matchesPayment(o)
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [pedidosElegiveis, searchQuery, filterDoc, filterPayment]);

  const totalToReceive = useMemo(() => toReceive.reduce((s, i) => s + i.valor, 0), [toReceive]);
  const totalOverdue = useMemo(() => overdue.reduce((s, i) => s + i.valor, 0), [overdue]);
  const totalReceived = useMemo(() => received.reduce((s, i) => s + i.valor, 0), [received]);
  const totalAll = useMemo(() => allFiltered.reduce((s, o) => s + getOrderValue(o), 0), [allFiltered]);
  const totalSemVencimento = useMemo(() => semVencimento.reduce((s, o) => s + getOrderValue(o), 0), [semVencimento]);

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
        paymentConfirmedManually: true,
        statusHistory: [
          ...(selectedOrder.statusHistory || []),
          {
            action: `Pagamento confirmado — ${getPaymentMethodInfo(paymentForm.method).label}`,
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await handleUpdateOrder(updatedOrder);
      toast.success('Pagamento confirmado!');
      setSelectedOrder(null);
    } catch (e: any) {
      toast.error('Erro ao confirmar pagamento: ' + e.message);
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const handleConfirmBoletoPay = async () => {
    if (!selectedBoleto) return;
    setIsConfirmingBoleto(true);
    try {
      const res = await fetch('/api/orders/update-boleto-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedBoleto.order.id,
          boletIndex: selectedBoleto.boletIndex,
          paidManually: true,
          paymentMethod: boletoPayForm.method,
          paymentDate: boletoPayForm.date,
          userName: userProfile?.email,
          userId: userProfile?.uid,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Parcela marcada como paga!');
        setSelectedBoleto(null);
      } else {
        toast.error('Erro: ' + (data.error || 'Falha'));
      }
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setIsConfirmingBoleto(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (userLoading) return null;
  if (!userProfile) return <Login />;

  const sections = [
    { id: 'receber',   label: 'A Receber',      count: toReceive.length,      total: totalToReceive,      color: 'text-amber-600',   bg: 'bg-amber-600',   icon: Clock },
    { id: 'recebidos', label: 'Recebidos',      count: received.length,       total: totalReceived,       color: 'text-emerald-600', bg: 'bg-emerald-600', icon: CheckCircle2 },
    { id: 'vencidos',  label: 'Vencidos',       count: overdue.length,        total: totalOverdue,        color: 'text-red-600',     bg: 'bg-red-600',    icon: AlertTriangle },
    { id: 'todos',     label: 'Todos',          count: allFiltered.length,    total: totalAll,            color: 'text-slate-600',   bg: 'bg-slate-600',  icon: DollarSign },
    { id: 'sem_data',  label: 'Sem Vencimento', count: semVencimento.length,  total: totalSemVencimento,  color: 'text-fuchsia-600', bg: 'bg-fuchsia-600', icon: CalendarOff },
  ];

  // A Receber/Vencidos/Recebidos operam por PARCELA (ReceivableItem); Todos/Sem Vencimento operam por PEDIDO.
  const isItemBasedSection = activeSection === 'receber' || activeSection === 'vencidos' || activeSection === 'recebidos';

  const activeItems: ReceivableItem[] =
    activeSection === 'receber'   ? toReceive :
    activeSection === 'vencidos'  ? overdue :
    activeSection === 'recebidos' ? received :
    [];

  const activeOrders: Order[] =
    activeSection === 'todos'    ? allFiltered :
    activeSection === 'sem_data' ? semVencimento :
    [];

  const activeCount = isItemBasedSection ? activeItems.length : activeOrders.length;
  const activeTotal = isItemBasedSection
    ? activeItems.reduce((s, i) => s + i.valor, 0)
    : activeOrders.reduce((s, o) => s + getOrderValue(o), 0);

  const itemGroups = isItemBasedSection ? groupItemsByDate(activeItems, activeBasis, sortDir) : null;
  const orderGroups = activeSection === 'todos' ? groupByDate(activeOrders, activeBasis, sortDir) : null;

  const currentWeeksInMonth = filterPeriod.startsWith('mes_')
    ? getWeeksInMonth(parseInt(filterPeriod.split('_')[1]), parseInt(filterPeriod.split('_')[2]) - 1)
    : 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Financeiro"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <FinanceiroNav />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Subtítulo de seção */}
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Contas a Receber — Atualizado em tempo real
          </p>

          {/* Cards de resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                      sec.id === 'vencidos'  ? 'bg-red-100 dark:bg-red-900/30' :
                      sec.id === 'sem_data'  ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30' :
                                              'bg-slate-100 dark:bg-slate-800'
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
              {/* Ordenação */}
              <button
                onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                title={sortDir === 'desc' ? 'Mais recente primeiro' : 'Mais antiga primeiro'}
                className="px-3 py-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all border-l border-slate-100 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <ArrowUpDown className="size-3.5" />
                <span className="hidden sm:inline">{sortDir === 'desc' ? 'Recente' : 'Antiga'}</span>
              </button>
              {/* Botão filtros */}
              <button
                onClick={() => setShowFilters(f => !f)}
                className={`px-4 py-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all border-l border-slate-100 dark:border-slate-800 ${
                  showFilters ? 'text-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <SlidersHorizontal className="size-3.5" />
                Filtros
                {(filterDoc !== 'all' || filterPayment !== 'all' || filterPeriod !== 'all') && (
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

                    {/* Base de data (por aba) */}
                    {activeSection !== 'sem_data' && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Filtrar/agrupar por</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DATE_BASIS_OPTIONS.map(b => (
                            <button key={b.value}
                              onClick={() => setDateBasisBySection(prev => ({ ...prev, [activeSection]: b.value }))}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                activeBasis === b.value
                                  ? 'bg-primary text-white'
                                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'
                              }`}
                            >{b.label}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Período */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Período</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PERIOD_PRESETS.map(p => (
                          <div key={p.value} className="relative">
                            <button
                              onClick={() => {
                                if (p.value === 'mes') {
                                  setShowMonthPicker(v => !v);
                                } else {
                                  setFilterPeriod(p.value);
                                  setShowMonthPicker(false);
                                  setFilterWeek(null);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                (p.value === 'mes' && filterPeriod.startsWith('mes_')) || filterPeriod === p.value
                                  ? 'bg-primary text-white'
                                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'
                              }`}
                            >
                              {p.value === 'mes' && filterPeriod.startsWith('mes_')
                                ? (() => { const pts = filterPeriod.split('_'); return MONTH_NAMES[parseInt(pts[2])-1] + ' ' + pts[1]; })()
                                : p.label}
                            </button>
                            {/* Dropdown de meses */}
                            {p.value === 'mes' && showMonthPicker && (
                              <div className="absolute top-8 left-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 min-w-[160px]">
                                {[new Date().getFullYear(), new Date().getFullYear() - 1].map(year => (
                                  <div key={year}>
                                    <p className="text-[9px] font-black text-slate-400 uppercase px-2 py-1">{year}</p>
                                    <div className="grid grid-cols-3 gap-1">
                                      {MONTH_NAMES.map((name, idx) => {
                                        const val = `mes_${year}_${String(idx+1).padStart(2,'0')}`;
                                        return (
                                          <button key={val}
                                            onClick={() => { setFilterPeriod(val); setShowMonthPicker(false); setFilterWeek(null); }}
                                            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold transition-all ${filterPeriod === val ? 'bg-primary text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                          >{name.slice(0,3)}</button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Semana do mês (só quando um mês específico está selecionado) */}
                      {filterPeriod.startsWith('mes_') && currentWeeksInMonth > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <button onClick={() => setFilterWeek(null)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${!filterWeek ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'}`}
                          >Mês inteiro</button>
                          {Array.from({ length: currentWeeksInMonth }, (_, i) => i + 1).map(w => (
                            <button key={w} onClick={() => setFilterWeek(w)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${filterWeek === w ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'}`}
                            >Semana {w}</button>
                          ))}
                        </div>
                      )}
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
                    {(filterDoc !== 'all' || filterPayment !== 'all' || filterPeriod !== 'all') && (
                      <button
                        onClick={() => { setFilterDoc('all'); setFilterPayment('all'); setFilterPeriod('all'); setCustomFrom(''); setCustomTo(''); setShowMonthPicker(false); setFilterWeek(null); }}
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
            <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
              {!isLoaded && (
                <div className="py-12 text-center"><Loader2 className="size-8 animate-spin text-primary mx-auto" /></div>
              )}

              {isLoaded && activeCount === 0 && (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  {activeSection === 'receber'   && <Clock className="size-10 mx-auto mb-3 opacity-30" />}
                  {activeSection === 'recebidos' && <CheckCircle2 className="size-10 mx-auto mb-3 text-emerald-400 opacity-60" />}
                  {activeSection === 'vencidos'  && <AlertTriangle className="size-10 mx-auto mb-3 opacity-30" />}
                  {activeSection === 'sem_data'  && <CalendarOff className="size-10 mx-auto mb-3 text-fuchsia-400 opacity-60" />}
                  {activeSection === 'todos'     && <DollarSign className="size-10 mx-auto mb-3 opacity-30" />}
                  <p className="font-bold text-sm">
                    {activeSection === 'receber'   ? 'Nenhum recebimento pendente' :
                     activeSection === 'recebidos' ? 'Nenhum recebimento no período' :
                     activeSection === 'vencidos'  ? 'Nenhum pagamento vencido' :
                     activeSection === 'sem_data'  ? 'Todos os pedidos têm data de emissão e vencimento' :
                                                     'Nenhum pedido no período'}
                  </p>
                  {searchQuery && <p className="text-xs">Tente limpar a busca</p>}
                </div>
              )}

              {/* Aba Sem Vencimento: lista simples por pedido, sem agrupamento por dia */}
              {isLoaded && activeSection === 'sem_data' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {semVencimento.map(order => (
                    <div key={order.id}>
                      <div className="px-4 pt-2 flex gap-1.5">
                        {!getDueDate(order) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300">Sem vencimento</span>
                        )}
                        {!getIssueDate(order) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">Sem emissão</span>
                        )}
                      </div>
                      {!getDueDate(order) && (
                        <DueDateQuickFix
                          order={order}
                          onSave={async (date) => {
                            await handleUpdateOrder({
                              ...order,
                              paymentDueDate: date,
                              noInvoiceDueDate: date,
                              statusHistory: [
                                ...(order.statusHistory || []),
                                { action: `Data de vencimento definida pelo Financeiro: ${date.split('-').reverse().join('/')}`, timestamp: new Date().toISOString() },
                              ],
                            } as any);
                            toast.success('Vencimento definido!');
                          }}
                        />
                      )}
                      <OrderCard
                        order={order}
                        showOverdue={false}
                        showReceiveBtn={!isPaid(order)}
                        showStatusBadge={true}
                        onReceive={openReceive}
                        onManualPayBoleto={(ord, idx, val, nf) => {
                          setSelectedBoleto({ order: ord, boletIndex: idx, valor: val, seuNumero: nf });
                          setBoletoPayForm({ method: 'pix', date: new Date().toISOString().split('T')[0] });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Todos: agrupado por dia, por PEDIDO (visão geral, não quebra em parcelas) */}
              {isLoaded && activeSection === 'todos' && orderGroups?.map(group => (
                <div key={group.dateKey}>
                  <div className="sticky top-0 z-10 px-4 py-2 bg-slate-100 dark:bg-slate-800/80 backdrop-blur border-y border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
                      {formatGroupDateHeader(group.dateKey)}
                    </p>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200">{formatCurrency(group.total)}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.orders.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        showOverdue={true}
                        showReceiveBtn={!isPaid(order)}
                        showStatusBadge={true}
                        onReceive={openReceive}
                        onManualPayBoleto={(ord, idx, val, nf) => {
                          setSelectedBoleto({ order: ord, boletIndex: idx, valor: val, seuNumero: nf });
                          setBoletoPayForm({ method: 'pix', date: new Date().toISOString().split('T')[0] });
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* A Receber / Vencidos / Recebidos: agrupado por dia, por PARCELA — cada uma com seu próprio valor */}
              {isLoaded && isItemBasedSection && itemGroups?.map(group => (
                <div key={group.dateKey}>
                  <div className="sticky top-0 z-10 px-4 py-2 bg-slate-100 dark:bg-slate-800/80 backdrop-blur border-y border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
                      {formatGroupDateHeader(group.dateKey)}
                    </p>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200">{formatCurrency(group.total)}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.items.map(item => (
                      <OrderCard
                        key={item.order.id + (item.parcelaIndex != null ? `-${item.parcelaIndex}` : '')}
                        order={item.order}
                        itemOverride={item}
                        showOverdue={activeSection === 'vencidos' || activeSection === 'receber'}
                        showReceiveBtn={activeSection !== 'recebidos'}
                        showStatusBadge={false}
                        onReceive={openReceive}
                        onManualPayBoleto={(ord, idx, val, nf) => {
                          setSelectedBoleto({ order: ord, boletIndex: idx, valor: val, seuNumero: nf });
                          setBoletoPayForm({ method: 'pix', date: new Date().toISOString().split('T')[0] });
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé com total filtrado */}
            {isLoaded && activeCount > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {activeCount} {isItemBasedSection ? 'lançamento' : 'pedido'}{activeCount !== 1 ? 's' : ''}
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {formatCurrency(activeTotal)}
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

      {/* Modal Baixa Manual — Parcela */}
      <AnimatePresence>
        {selectedBoleto && (
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
                  <p className="text-xs text-slate-500 font-bold">{selectedBoleto.order.clientName}</p>
                  {selectedBoleto.order.tradeName && (
                    <p className="text-[10px] text-slate-400">{selectedBoleto.order.tradeName}</p>
                  )}
                </div>
                <button onClick={() => setSelectedBoleto(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="size-5 text-slate-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Valor da parcela */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Valor da Parcela</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(selectedBoleto.valor)}</p>
                  {selectedBoleto.seuNumero && (
                    <p className="text-[10px] text-slate-400 mt-0.5">NF {selectedBoleto.seuNumero}</p>
                  )}
                </div>

                {/* Meio de pagamento */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Meio de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setBoletoPayForm(f => ({ ...f, method: m.value }))}
                        className={`py-2 px-1 rounded-xl text-[10px] font-bold border transition-all text-center ${
                          boletoPayForm.method === m.value
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
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Data do Recebimento</p>
                  <input
                    type="date"
                    value={boletoPayForm.date}
                    onChange={e => setBoletoPayForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setSelectedBoleto(null)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmBoletoPay}
                    disabled={isConfirmingBoleto}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isConfirmingBoleto ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
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
