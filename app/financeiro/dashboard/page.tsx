'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useOrders } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  Target, ShoppingCart, Percent, AlertCircle, Loader2,
  RefreshCw, ChevronDown,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFinanceiroCollections,
  EXPENSE_COLORS, INCOME_COLORS,
  CMV_CATEGORIES, FIXED_COST_CATEGORIES,
  Transaction, Bill,
} from '@/lib/financeiro-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  label: string;
  value: string;
  sub?: string;
  Icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

const PERIOD_OPTIONS = [
  { value: 'month',      label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'quarter',    label: 'Trimestre' },
  { value: 'year',       label: 'Este ano' },
];

const MONTH_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  if (period === 'month') {
    return {
      from: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      to:   `${y}-${String(m + 1).padStart(2, '0')}-31`,
    };
  }
  if (period === 'last_month') {
    const lm = m === 0 ? 12 : m;
    const ly = m === 0 ? y - 1 : y;
    return {
      from: `${ly}-${String(lm).padStart(2, '0')}-01`,
      to:   `${ly}-${String(lm).padStart(2, '0')}-31`,
    };
  }
  if (period === 'quarter') {
    const qStart = m - (m % 3);
    return {
      from: `${y}-${String(qStart + 1).padStart(2, '0')}-01`,
      to:   `${y}-${String(m + 1).padStart(2, '0')}-31`,
    };
  }
  // year
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function inPeriod(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function getOrderVal(o: any): number {
  if (o.invoiceLinked && o.invoiceValue) return Number(o.invoiceValue) || 0;
  if (o.noInvoiceLinked && o.noInvoiceValue) return Number(o.noInvoiceValue) || 0;
  if (Array.isArray(o.boletos) && o.boletos.length > 0)
    return o.boletos.reduce((s: number, b: any) => s + (b.valor || 0), 0);
  if (o.invoiceValue) return Number(o.invoiceValue) || 0;
  return 0;
}

function isOrderPaid(o: any): boolean {
  if (o.isSample) return false;
  if (o.paymentConfirmedManually) return true;
  if (o.boletoLinked) {
    if (Array.isArray(o.boletos) && o.boletos.length > 0) {
      return o.boletos.every((b: any) => {
        const sit = (b.situacao || '').toLowerCase();
        return sit === 'liquidado' || sit === 'pago';
      });
    }
    const sit = (o.boletSituacao || '').toLowerCase();
    return sit === 'liquidado' || sit === 'pago';
  }
  return o.paymentStatus === 'pago' || o.paymentStatus === 'paid';
}

// Elegível para faturamento (pipeline completo: caixa_montada/enviado/entregue)
function isEligibleForFaturamento(o: any): boolean {
  if (o.isSample) return false;
  if (o.isDeleted || o.deleted) return false;
  return ['caixa_montada', 'enviado', 'entregue'].includes(o.status);
}

// Elegível para receita/recebido — idêntico ao pedidosElegiveis do A Receber
function isEligibleForReceita(o: any): boolean {
  if (o.isSample) return false;
  if (o.isDeleted || o.deleted) return false;
  return o.status === 'entregue';
}

// Data de faturamento: emissão boleto/NF → statusHistory → createdAt (= mesmo que A Receber)
function getBillingDate(o: any): string {
  if (Array.isArray(o.boletos) && o.boletos.length > 0 && o.boletos[0].dataEmissao) {
    return String(o.boletos[0].dataEmissao).split('T')[0];
  }
  if (Array.isArray(o.statusHistory)) {
    for (const st of ['entregue', 'enviado', 'caixa_montada']) {
      const h = (o.statusHistory as any[]).find((x: any) => x.status === st);
      if (h?.timestamp) return String(h.timestamp).split('T')[0];
    }
    const faturado = (o.statusHistory as any[]).find((h: any) => h.action?.includes('faturad'));
    if (faturado?.timestamp) return String(faturado.timestamp).split('T')[0];
  }
  if (o.createdAt) return String(o.createdAt).split('T')[0];
  return '';
}

function isOrderOverdue(o: any): boolean {
  if (isOrderPaid(o)) return false;
  if (Array.isArray(o.boletos) && o.boletos.length > 0) {
    const last = o.boletos[o.boletos.length - 1];
    if (last?.dataVencimento) return new Date(last.dataVencimento + 'T12:00:00') < new Date();
  }
  if (o.paymentDueDate) return new Date(o.paymentDueDate + 'T12:00:00') < new Date();
  return false;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{name}</p>
      <p className="text-slate-500 dark:text-slate-400">{fmtCurrency(value)}</p>
    </div>
  );
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtCurrency(p.value)}</p>
      ))}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FinanceiroDashboardPage() {
  const { userProfile, loading: userLoading } = useUser();
  const { allOrders: orders, isLoaded: ordersLoaded } = useOrders();
  const [period, setPeriod] = useState('month');
  const [showPeriodDrop, setShowPeriodDrop] = useState(false);
  const [loading, setLoading] = useState(true);

  // Raw data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userProfile) return;
    loadAll();
  }, [userProfile]);

  async function loadAll() {
    setLoading(true);
    const cols = getFinanceiroCollections();
    try {
      const [txSnap, billSnap] = await Promise.all([
        getDocs(collection(db, cols.transactions)),
        getDocs(collection(db, cols.bills)),
      ]);
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setBills(billSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bill)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const { from, to } = useMemo(() => getPeriodDates(period), [period]);

  const computed = useMemo(() => {
    // ── Faturamento: todos os pedidos elegíveis (caixa_montada/enviado/entregue) no período ──
    // Data de referência = emissão boleto/NF → statusHistory → createdAt (igual ao A Receber)
    const faturamentoOrders = orders.filter((o: any) => {
      if (!isEligibleForFaturamento(o)) return false;
      const d = getBillingDate(o);
      return d ? inPeriod(d, from, to) : false;
    });
    const faturamento = faturamentoOrders.reduce((s: number, o: any) => s + getOrderVal(o), 0);
    const faturamentoCount = faturamentoOrders.length;
    const overdueTotal = faturamentoOrders
      .filter((o: any) => !isOrderPaid(o) && isOrderOverdue(o))
      .reduce((s: number, o: any) => s + getOrderVal(o), 0);
    const pendingTotal = faturamentoOrders
      .filter((o: any) => !isOrderPaid(o) && !isOrderOverdue(o))
      .reduce((s: number, o: any) => s + getOrderVal(o), 0);

    // ── Receita recebida: mesma regra do A Receber "Recebidos" (só entregue + pago) ──
    const receivedOrders = orders.filter((o: any) => {
      if (!isEligibleForReceita(o)) return false;
      if (!isOrderPaid(o)) return false;
      const d = getBillingDate(o);
      return d ? inPeriod(d, from, to) : false;
    });
    const orderRevenue = receivedOrders.reduce((s: number, o: any) => s + getOrderVal(o), 0);
    const receivedCount = receivedOrders.length;

    const manualIncome = transactions
      .filter(t => t.type === 'income' && inPeriod(t.date, from, to))
      .reduce((s, t) => s + t.value, 0);

    // DRE usa receita recebida (base caixa)
    const totalIncome = orderRevenue + manualIncome;

    // Despesas: transações expense + contas pagas
    const txExpenses = transactions
      .filter(t => t.type === 'expense' && inPeriod(t.date, from, to))
      .reduce((s, t) => s + t.value, 0);

    const billsPaid = bills
      .filter(b => b.status === 'paid' && b.paidDate && inPeriod(b.paidDate, from, to))
      .reduce((s, b) => s + (b.paidValue ?? b.value), 0);

    const totalExpenses = txExpenses + billsPaid;

    // CMV (Custo Mercadoria Vendida)
    const cmv = transactions
      .filter(t => t.type === 'expense' && CMV_CATEGORIES.includes(t.category as any) && inPeriod(t.date, from, to))
      .reduce((s, t) => s + t.value, 0) +
      bills
      .filter(b => b.status === 'paid' && b.paidDate && CMV_CATEGORIES.includes(b.category as any) && inPeriod(b.paidDate, from, to))
      .reduce((s, b) => s + (b.paidValue ?? b.value), 0);

    // Custos fixos (para ponto de equilíbrio)
    const fixedCosts = transactions
      .filter(t => t.type === 'expense' && FIXED_COST_CATEGORIES.includes(t.category as any) && inPeriod(t.date, from, to))
      .reduce((s, t) => s + t.value, 0) +
      bills
      .filter(b => b.status === 'paid' && b.paidDate && FIXED_COST_CATEGORIES.includes(b.category as any) && inPeriod(b.paidDate, from, to))
      .reduce((s, b) => s + (b.paidValue ?? b.value), 0);

    const grossProfit = totalIncome - cmv;
    const grossMargin = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
    const netProfit = totalIncome - totalExpenses;
    const profitability = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    const operationalCost = totalExpenses - cmv;

    // Ponto de equilíbrio: custos fixos / margem bruta
    const breakevenUnits = grossMargin > 0 ? fixedCosts / (grossMargin / 100) : 0;

    // Ticket médio: sobre pedidos recebidos
    const averageTicket = receivedCount > 0 ? orderRevenue / receivedCount : 0;

    // Despesas por categoria
    const expByCat: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense' && inPeriod(t.date, from, to))
      .forEach(t => { expByCat[t.category] = (expByCat[t.category] || 0) + t.value; });
    bills
      .filter(b => b.status === 'paid' && b.paidDate && inPeriod(b.paidDate, from, to))
      .forEach(b => { expByCat[b.category] = (expByCat[b.category] || 0) + (b.paidValue ?? b.value); });

    const expensesByCategory = Object.entries(expByCat)
      .map(([name, value]) => ({ name, value }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // Receitas por categoria
    const incByCat: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'income' && inPeriod(t.date, from, to))
      .forEach(t => { incByCat[t.category] = (incByCat[t.category] || 0) + t.value; });
    if (orderRevenue > 0) {
      incByCat['Vendas Diretas'] = (incByCat['Vendas Diretas'] || 0) + orderRevenue;
    }
    const incomeByCategory = Object.entries(incByCat)
      .map(([name, value]) => ({ name, value }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // Dados mensais para barchart: usa getBillingDate (igual ao A Receber)
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const my = d.getFullYear();
      const mm = d.getMonth();
      const mFrom = `${my}-${String(mm + 1).padStart(2, '0')}-01`;
      const mTo   = `${my}-${String(mm + 1).padStart(2, '0')}-31`;
      const label = `${MONTH_ABBR[mm]}/${String(my).slice(2)}`;

      // Faturamento do mês = todos elegíveis pela billing date
      const mFat = orders
        .filter((o: any) => {
          if (!isEligibleForFaturamento(o)) return false;
          const ds = getBillingDate(o);
          return ds ? inPeriod(ds, mFrom, mTo) : false;
        })
        .reduce((s: number, o: any) => s + getOrderVal(o), 0);
      const mInc = transactions.filter(t => t.type === 'income' && inPeriod(t.date, mFrom, mTo)).reduce((s, t) => s + t.value, 0);
      const mExp = transactions.filter(t => t.type === 'expense' && inPeriod(t.date, mFrom, mTo)).reduce((s, t) => s + t.value, 0)
        + bills.filter(b => b.status === 'paid' && b.paidDate && inPeriod(b.paidDate, mFrom, mTo)).reduce((s, b) => s + (b.paidValue ?? b.value), 0);

      const receita = mFat + mInc;
      return { month: label, receita, despesas: mExp, lucro: receita - mExp };
    });

    return {
      faturamento, faturamentoCount, overdueTotal, pendingTotal,
      orderRevenue, receivedCount,
      totalIncome, totalExpenses, netProfit, grossMargin,
      operationalCost, profitability, breakevenUnits,
      averageTicket, cmv,
      expensesByCategory, incomeByCategory, monthlyData,
    };
  }, [transactions, bills, orders, from, to]);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!userProfile) return <Login />;

  // ── KPI cards ────────────────────────────────────────────────────────────────
  const kpis: KPI[] = [
    {
      label: 'Faturamento',
      value: fmtCurrency(computed.faturamento),
      sub: `${computed.faturamentoCount} pedidos · ${fmtCurrency(computed.orderRevenue)} recebido`,
      Icon: DollarSign,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
      trend: computed.faturamento > 0 ? 'up' : 'neutral',
    },
    {
      label: 'Lucro Líquido',
      value: fmtCurrency(computed.netProfit),
      sub: `Margem: ${fmtPct(computed.profitability)}`,
      Icon: TrendingUp,
      iconClass: computed.netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500',
      bgClass: computed.netProfit >= 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-red-100 dark:bg-red-900/30',
      trend: computed.netProfit >= 0 ? 'up' : 'down',
    },
    {
      label: 'Margem Bruta',
      value: fmtPct(computed.grossMargin),
      sub: `CMV: ${fmtCurrency(computed.cmv)}`,
      Icon: Percent,
      iconClass: 'text-violet-600 dark:text-violet-400',
      bgClass: 'bg-violet-100 dark:bg-violet-900/30',
      trend: computed.grossMargin >= 40 ? 'up' : computed.grossMargin >= 20 ? 'neutral' : 'down',
    },
    {
      label: 'Custo Operacional',
      value: fmtCurrency(computed.operationalCost),
      sub: `Total despesas: ${fmtCurrency(computed.totalExpenses)}`,
      Icon: TrendingDown,
      iconClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      label: 'Lucratividade',
      value: fmtPct(computed.profitability),
      sub: `Lucro / Faturamento`,
      Icon: BarChart3,
      iconClass: computed.profitability >= 15 ? 'text-emerald-600 dark:text-emerald-400' : computed.profitability >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500',
      bgClass: computed.profitability >= 15 ? 'bg-emerald-100 dark:bg-emerald-900/30' : computed.profitability >= 5 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30',
      trend: computed.profitability >= 15 ? 'up' : computed.profitability >= 5 ? 'neutral' : 'down',
    },
    {
      label: 'Ponto de Equilíbrio',
      value: fmtCurrency(computed.breakevenUnits),
      sub: `Receita mínima para cobrir fixos`,
      Icon: Target,
      iconClass: 'text-cyan-600 dark:text-cyan-400',
      bgClass: 'bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      label: 'Ticket Médio',
      value: fmtCurrency(computed.averageTicket),
      sub: `Por pedido pago`,
      Icon: ShoppingCart,
      iconClass: 'text-indigo-600 dark:text-indigo-400',
      bgClass: 'bg-indigo-100 dark:bg-indigo-900/30',
    },
  ];

  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || '';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Financeiro" />
        <FinanceiroNav />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Dashboard Financeiro
            </p>
            <div className="flex items-center gap-2">
              {/* Period selector */}
              <div className="relative">
                <button
                  onClick={() => setShowPeriodDrop(v => !v)}
                  className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 transition-all"
                >
                  {periodLabel}
                  <ChevronDown className="size-3.5" />
                </button>
                {showPeriodDrop && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                    {PERIOD_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setPeriod(opt.value); setShowPeriodDrop(false); }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                          period === opt.value ? 'font-black text-primary' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={loadAll}
                className="size-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-primary hover:border-primary/50 transition-all"
              >
                <RefreshCw className={`size-3.5 ${loading || !ordersLoaded ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loading || !ordersLoaded ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {kpis.map((kpi, i) => {
                  const KpiIcon = kpi.Icon;
                  return (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`size-9 rounded-xl ${kpi.bgClass} flex items-center justify-center shrink-0`}>
                        <KpiIcon className={`size-5 ${kpi.iconClass}`} />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                        {kpi.label}
                      </p>
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white leading-none">{kpi.value}</p>
                    {kpi.sub && <p className="text-[11px] text-slate-400 mt-1">{kpi.sub}</p>}
                    {kpi.trend && (
                      <div className={`mt-2 inline-flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                        kpi.trend === 'up'      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' :
                        kpi.trend === 'down'    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                                                  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'}
                        {kpi.trendLabel || (kpi.trend === 'up' ? 'Positivo' : kpi.trend === 'down' ? 'Atenção' : 'Neutro')}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Monthly bar chart */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Evolução Mensal — Últimos 6 meses
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={computed.monthlyData} barSize={14} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomBarTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="receita"  name="Receita"  fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[3,3,0,0]} />
                      <Bar dataKey="lucro"    name="Lucro"    fill="#6366f1" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Expense pie */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Despesas por Categoria
                  </p>
                  {computed.expensesByCategory.length === 0 ? (
                    <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
                      Nenhuma despesa no período
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="55%" height={200}>
                        <PieChart>
                          <Pie
                            data={computed.expensesByCategory}
                            cx="50%" cy="50%"
                            innerRadius={50} outerRadius={80}
                            dataKey="value" nameKey="name"
                            paddingAngle={2}
                          >
                            {computed.expensesByCategory.map((entry, idx) => (
                              <Cell
                                key={idx}
                                fill={EXPENSE_COLORS[entry.name] || `hsl(${idx * 37}, 60%, 55%)`}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        {computed.expensesByCategory.slice(0, 7).map((item, i) => (
                          <div key={i} className="flex items-center gap-2 min-w-0">
                            <div
                              className="size-2.5 rounded-full shrink-0"
                              style={{ background: EXPENSE_COLORS[item.name] || `hsl(${i * 37}, 60%, 55%)` }}
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1">{item.name}</span>
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                              {fmtCurrency(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Income pie + summary row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Income pie */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Receitas por Categoria
                  </p>
                  {computed.incomeByCategory.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                      Nenhuma receita no período
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="55%" height={200}>
                        <PieChart>
                          <Pie
                            data={computed.incomeByCategory}
                            cx="50%" cy="50%"
                            innerRadius={50} outerRadius={80}
                            dataKey="value" nameKey="name"
                            paddingAngle={2}
                          >
                            {computed.incomeByCategory.map((entry, idx) => (
                              <Cell
                                key={idx}
                                fill={INCOME_COLORS[entry.name] || `hsl(${idx * 60 + 120}, 60%, 45%)`}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        {computed.incomeByCategory.slice(0, 7).map((item, i) => (
                          <div key={i} className="flex items-center gap-2 min-w-0">
                            <div
                              className="size-2.5 rounded-full shrink-0"
                              style={{ background: INCOME_COLORS[item.name] || `hsl(${i * 60 + 120}, 60%, 45%)` }}
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate flex-1">{item.name}</span>
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                              {fmtCurrency(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* P&L summary */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Resumo DRE — {periodLabel}
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: 'Receita Bruta',      value: computed.totalIncome,    color: 'text-emerald-600 dark:text-emerald-400', bold: false },
                      { label: '(−) CMV',             value: -computed.cmv,           color: 'text-red-500 dark:text-red-400', bold: false },
                      { label: '= Lucro Bruto',       value: computed.totalIncome - computed.cmv, color: 'text-slate-900 dark:text-white', bold: true },
                      { label: '(−) Custo Operac.',   value: -computed.operationalCost, color: 'text-red-500 dark:text-red-400', bold: false },
                      { label: '= Lucro Operacional', value: computed.netProfit,       color: computed.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500', bold: true },
                    ].map((row, i) => (
                      <div key={i} className={`flex justify-between items-center ${row.bold ? 'pt-2 border-t border-slate-100 dark:border-slate-800' : ''}`}>
                        <span className={`text-sm ${row.bold ? 'font-black text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                          {row.label}
                        </span>
                        <span className={`text-sm font-semibold ${row.bold ? 'font-black ' : ''}${row.color}`}>
                          {fmtCurrency(Math.abs(row.value))}
                          {row.value < 0 && !row.label.startsWith('(') ? '' : ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Alert if negative */}
                  {computed.netProfit < 0 && (
                    <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
                      <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Resultado negativo no período. Despesas superam receitas em {fmtCurrency(Math.abs(computed.netProfit))}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
