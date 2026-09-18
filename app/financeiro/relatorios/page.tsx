'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUser, useOrders } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import {
  Printer, Loader2, ChevronDown, FileText, BarChart3,
  TrendingUp, TrendingDown, DollarSign, Percent,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFinanceiroCollections, Transaction, Bill,
  CMV_CATEGORIES, EXPENSE_COLORS,
} from '@/lib/financeiro-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
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
    if (Array.isArray(o.boletos) && o.boletos.length > 0)
      return o.boletos.some((b: any) => b.situacao === 'LIQUIDADO');
    return o.boletSituacao === 'LIQUIDADO';
  }
  return o.paymentStatus === 'paid' || o.boletSituacao === 'LIQUIDADO';
}

function getOrderPaymentDate(o: any): string {
  if (o.paymentDate) return String(o.paymentDate).split('T')[0];
  if (o.paymentConfirmedAt) return String(o.paymentConfirmedAt).split('T')[0];
  if (Array.isArray(o.boletos) && o.boletos.length > 0) {
    const paidBoleto = [...o.boletos].reverse().find((b: any) => b.situacao === 'LIQUIDADO' && b.dataPagamento);
    if (paidBoleto?.dataPagamento) return String(paidBoleto.dataPagamento).split('T')[0];
    const last = o.boletos[o.boletos.length - 1];
    if (last?.dataVencimento) return String(last.dataVencimento).split('T')[0];
  }
  if (o.updatedAt) return String(o.updatedAt).split('T')[0];
  return '';
}

const MONTH_OPTIONS: { value: string; label: string }[] = (() => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value: val, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
})();

const REPORT_TYPES = [
  { value: 'dre',      label: 'DRE',           desc: 'Demonstrativo de Resultado do Exercício' },
  { value: 'caixa',    label: 'Fluxo de Caixa', desc: 'Entradas e saídas do período' },
  { value: 'balancete',label: 'Balancete',      desc: 'Resumo de categorias' },
  { value: 'contas',   label: 'Contas a Pagar', desc: 'Relatório detalhado de contas' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { userProfile, loading: userLoading } = useUser();
  const { allOrders: orders, isLoaded: ordersLoaded } = useOrders();
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);
  const [reportType, setReportType] = useState('dre');
  const [showMonthDrop, setShowMonthDrop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (userProfile) loadAll(); }, [userProfile]);

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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // ── Period bounds ─────────────────────────────────────────────────────────
  const from = `${selectedMonth}-01`;
  const to   = `${selectedMonth}-31`;

  // ── Computed financials ───────────────────────────────────────────────────
  const computed = useMemo(() => {
    const paidOrders = orders.filter((o: any) => {
      if (!isOrderPaid(o)) return false;
      const d = getOrderPaymentDate(o);
      return d ? inPeriod(d, from, to) : false;
    });
    const orderRevenue = paidOrders.reduce((s: number, o: any) => s + getOrderVal(o), 0);

    const monthTx = transactions.filter(t => inPeriod(t.date, from, to));
    const manualIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.value, 0);
    const manualExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.value, 0);
    const billsPaidInMonth = bills.filter(b => b.status === 'paid' && b.paidDate && inPeriod(b.paidDate, from, to));
    const billsExpense = billsPaidInMonth.reduce((s, b) => s + (b.paidValue ?? b.value), 0);

    const totalIncome = orderRevenue + manualIncome;
    const totalExpenses = manualExpense + billsExpense;

    const cmv = monthTx.filter(t => t.type === 'expense' && CMV_CATEGORIES.includes(t.category as any)).reduce((s, t) => s + t.value, 0)
      + billsPaidInMonth.filter(b => CMV_CATEGORIES.includes(b.category as any)).reduce((s, b) => s + (b.paidValue ?? b.value), 0);

    const grossProfit = totalIncome - cmv;
    const grossMargin = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
    const netProfit = totalIncome - totalExpenses;
    const profitability = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    // Expenses by category
    const expByCat: Record<string, number> = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      expByCat[t.category] = (expByCat[t.category] || 0) + t.value;
    });
    billsPaidInMonth.forEach(b => {
      expByCat[b.category] = (expByCat[b.category] || 0) + (b.paidValue ?? b.value);
    });

    // Income by category
    const incByCat: Record<string, number> = {};
    monthTx.filter(t => t.type === 'income').forEach(t => {
      incByCat[t.category] = (incByCat[t.category] || 0) + t.value;
    });
    if (orderRevenue > 0) incByCat['Vendas Diretas'] = (incByCat['Vendas Diretas'] || 0) + orderRevenue;

    // All movements for caixa
    const movements: { date: string; desc: string; value: number; type: 'income' | 'expense'; category: string }[] = [];
    paidOrders.forEach((o: any) => {
      const val = getOrderVal(o);
      movements.push({ date: getOrderPaymentDate(o), desc: `Pedido #${o.orderNumber || o.id?.slice(-6)} — ${o.clientName || 'Cliente'}`, value: val, type: 'income', category: 'Vendas Diretas' });
    });
    monthTx.forEach(t => movements.push({ date: t.date, desc: t.description, value: t.value, type: t.type, category: t.category }));
    billsPaidInMonth.forEach(b => movements.push({ date: b.paidDate!, desc: `${b.description} (${b.supplier})`, value: b.paidValue ?? b.value, type: 'expense', category: b.category }));
    movements.sort((a, b) => b.date.localeCompare(a.date));

    return {
      paidOrders, orderRevenue, manualIncome, manualExpense, billsExpense,
      totalIncome, totalExpenses, cmv, grossProfit, grossMargin,
      netProfit, profitability, expByCat, incByCat, movements,
    };
  }, [transactions, bills, orders, from, to]);

  function handlePrint() {
    window.print();
  }

  if (userLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
  if (!userProfile) return <Login />;

  const monthLabel = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || selectedMonth;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Financeiro" />
        <FinanceiroNav />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Relatórios</p>
            <div className="flex items-center gap-2">
              {/* Month */}
              <div className="relative">
                <button
                  onClick={() => setShowMonthDrop(v => !v)}
                  className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 transition-all"
                >
                  {monthLabel} <ChevronDown className="size-3.5" />
                </button>
                {showMonthDrop && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden min-w-[180px] max-h-60 overflow-y-auto">
                    {MONTH_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => { setSelectedMonth(opt.value); setShowMonthDrop(false); }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedMonth === opt.value ? 'font-black text-primary' : 'text-slate-700 dark:text-slate-300'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Printer className="size-3.5" /> Imprimir
              </button>
            </div>
          </div>

          {/* Report type tabs */}
          <div className="flex gap-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-1 shadow-sm flex-wrap">
            {REPORT_TYPES.map(r => (
              <button
                key={r.value}
                onClick={() => setReportType(r.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  reportType === r.value ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {loading || !ordersLoaded ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <div ref={printRef} className="print:bg-white print:text-black">

              {/* ── DRE ── */}
              {reportType === 'dre' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <p className="font-black text-slate-900 dark:text-white text-base">
                      Demonstrativo de Resultado — {monthLabel}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Café Fazenda Itaoca</p>
                  </div>
                  <div className="p-5 space-y-1.5">
                    {/* Income section */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 mb-1">RECEITAS</p>
                    <DRERow label="Vendas (pedidos pagos)" value={computed.orderRevenue} />
                    {Object.entries(computed.incByCat).filter(([k]) => k !== 'Vendas Diretas').map(([cat, val]) => (
                      <DRERow key={cat} label={cat} value={val} indent />
                    ))}
                    <DRERow label="RECEITA BRUTA" value={computed.totalIncome} bold />

                    <div className="border-t border-slate-100 dark:border-slate-800 my-2" />

                    {/* Expense section */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CUSTOS E DESPESAS</p>
                    {Object.entries(computed.expByCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                      <DRERow key={cat} label={cat} value={-val} indent
                        isCMV={CMV_CATEGORIES.includes(cat as any)}
                      />
                    ))}
                    <DRERow label="TOTAL DESPESAS" value={-computed.totalExpenses} bold />

                    <div className="border-t border-slate-100 dark:border-slate-800 my-2" />

                    {/* Results */}
                    <DRERow label="CMV (Matéria-prima + Emb. + Frete)" value={-computed.cmv} indent />
                    <DRERow label="LUCRO BRUTO" value={computed.grossProfit} bold />
                    <DRERow label={`Margem Bruta`} value={computed.grossMargin / 100} isPct bold={false} />

                    <div className="border-t border-slate-100 dark:border-slate-800 my-2" />

                    <DRERow label="LUCRO OPERACIONAL (LÍQUIDO)" value={computed.netProfit} bold
                      highlight={computed.netProfit >= 0 ? 'green' : 'red'} />
                    <DRERow label="Lucratividade" value={computed.profitability / 100} isPct bold={false} />
                  </div>
                </div>
              )}

              {/* ── Fluxo de Caixa ── */}
              {reportType === 'caixa' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <p className="font-black text-slate-900 dark:text-white text-base">Fluxo de Caixa — {monthLabel}</p>
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas</p>
                      <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(computed.totalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saídas</p>
                      <p className="text-lg font-black text-red-500">{fmtCurrency(computed.totalExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo</p>
                      <p className={`text-lg font-black ${computed.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {fmtCurrency(computed.netProfit)}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                    {computed.movements.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Sem movimentações</div>
                    ) : (
                      computed.movements.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                            m.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
                          }`}>
                            {m.type === 'income'
                              ? <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                              : <TrendingDown className="size-3.5 text-red-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{m.desc}</p>
                            <p className="text-[11px] text-slate-400">{fmtDate(m.date)} · {m.category}</p>
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${m.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            {m.type === 'income' ? '+' : '−'}{fmtCurrency(m.value)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ── Balancete ── */}
              {reportType === 'balancete' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Income by cat */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receitas por Categoria</p>
                      </div>
                      <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {Object.entries(computed.incByCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                          <div key={cat} className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-slate-600 dark:text-slate-300">{cat}</span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(val)}</span>
                          </div>
                        ))}
                        {Object.keys(computed.incByCat).length === 0 && (
                          <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Sem receitas</div>
                        )}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-sm font-black text-slate-800 dark:text-slate-200">TOTAL</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(computed.totalIncome)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expenses by cat */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Despesas por Categoria</p>
                      </div>
                      <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {Object.entries(computed.expByCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                          <div key={cat} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="size-2 rounded-full shrink-0" style={{ background: EXPENSE_COLORS[cat] || '#94a3b8' }} />
                              <span className="text-sm text-slate-600 dark:text-slate-300">{cat}</span>
                            </div>
                            <span className="text-sm font-bold text-red-500">{fmtCurrency(val)}</span>
                          </div>
                        ))}
                        {Object.keys(computed.expByCat).length === 0 && (
                          <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Sem despesas</div>
                        )}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-sm font-black text-slate-800 dark:text-slate-200">TOTAL</span>
                          <span className="text-sm font-black text-red-500">{fmtCurrency(computed.totalExpenses)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net summary */}
                  <div className={`rounded-2xl border p-5 shadow-sm ${
                    computed.netProfit >= 0
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultado do Período</p>
                        <p className={`text-2xl font-black mt-1 ${computed.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>
                          {fmtCurrency(computed.netProfit)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lucratividade</p>
                        <p className={`text-2xl font-black mt-1 ${computed.profitability >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>
                          {fmtPct(computed.profitability)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Contas a Pagar report ── */}
              {reportType === 'contas' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <p className="font-black text-slate-900 dark:text-white text-base">Contas a Pagar — {monthLabel}</p>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                    {bills.filter(b => b.dueDate >= from && b.dueDate <= to).length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Sem contas no período</div>
                    ) : (
                      bills
                        .filter(b => b.dueDate >= from && b.dueDate <= to)
                        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                        .map(b => (
                          <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                            <div className={`size-2.5 rounded-full shrink-0 ${
                              b.status === 'paid' ? 'bg-emerald-500' :
                              b.dueDate < new Date().toISOString().split('T')[0] ? 'bg-red-500' :
                              'bg-amber-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{b.description}</p>
                              <p className="text-[11px] text-slate-400">{b.supplier} · Venc. {fmtDate(b.dueDate)}
                                {b.status === 'paid' && b.paidDate ? ` · Pago ${fmtDate(b.paidDate)}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold ${b.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                {fmtCurrency(b.status === 'paid' ? (b.paidValue ?? b.value) : b.value)}
                              </p>
                              <p className={`text-[10px] font-bold ${
                                b.status === 'paid' ? 'text-emerald-500' :
                                b.dueDate < new Date().toISOString().split('T')[0] ? 'text-red-500' :
                                'text-amber-500'
                              }`}>
                                {b.status === 'paid' ? 'Paga' : b.dueDate < new Date().toISOString().split('T')[0] ? 'Atrasada' : 'Em aberto'}
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DRE Row ─────────────────────────────────────────────────────────────────

function DRERow({
  label, value, bold = false, indent = false, isPct = false, isCMV = false, highlight,
}: {
  label: string; value: number; bold?: boolean; indent?: boolean;
  isPct?: boolean; isCMV?: boolean; highlight?: 'green' | 'red';
}) {
  const displayVal = isPct
    ? `${(value * 100).toFixed(1)}%`
    : fmtCurrency(Math.abs(value));

  const isNegative = value < 0;
  const color = highlight
    ? highlight === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    : isNegative
    ? 'text-red-500 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'bg-slate-50 dark:bg-slate-800/50 px-3 rounded-lg' : ''}`}>
      <span className={`text-sm ${bold ? 'font-black text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'} ${indent ? 'pl-4' : ''} ${isCMV ? 'text-violet-600 dark:text-violet-400' : ''}`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? 'font-black' : 'font-semibold'} ${color}`}>
        {isNegative && !isPct ? '−' : ''}{displayVal}
      </span>
    </div>
  );
}
