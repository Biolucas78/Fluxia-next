'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUser } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import {
  Plus, Upload, Sparkles, X, ChevronDown, Loader2,
  TrendingUp, TrendingDown, Wallet, Edit3, Trash2,
  Save, RefreshCw, FileText, Filter,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, where, orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFinanceiroCollections,
  EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  EXPENSE_COLORS, INCOME_COLORS,
  PAYMENT_METHODS_FINANCEIRO, BANK_ACCOUNTS,
  Transaction, CaixaConfig,
} from '@/lib/financeiro-types';
import { toast } from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
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

function monthKey(d: string) {
  return d ? d.slice(0, 7) : '';
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

const TYPE_FILTERS = [
  { value: 'all',     label: 'Todos' },
  { value: 'income',  label: 'Entradas' },
  { value: 'expense', label: 'Saídas' },
];

const EMPTY_FORM: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'origin'> = {
  type: 'expense',
  category: '',
  description: '',
  value: 0,
  date: todayStr(),
  paymentMethod: 'pix',
  account: 'sicoob',
  notes: '',
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{payload[0].name}</p>
      <p className="text-slate-500 dark:text-slate-400">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CaixaPage() {
  const { userProfile, loading: userLoading } = useUser();
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showMonthDrop, setShowMonthDrop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [saldoInicialInput, setSaldoInicialInput] = useState('');
  const [editingSaldo, setEditingSaldo] = useState(false);

  // UI states
  const [showForm, setShowForm] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showOFX, setShowOFX] = useState(false);
  const [aiText, setAIText] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const ofxRef = useRef<HTMLInputElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userProfile) return;
    loadData();
  }, [userProfile, selectedMonth]);

  async function loadData() {
    setLoading(true);
    const cols = getFinanceiroCollections();
    const isDev = typeof window !== 'undefined' &&
      (window.location.hostname.includes('localhost') || window.location.hostname.includes('ais-dev'));
    const ordersCol = isDev ? 'orders_dev' : 'orders';

    try {
      const [txSnap, cfgSnap, ordSnap] = await Promise.all([
        getDocs(collection(db, cols.transactions)),
        getDocs(collection(db, cols.config)),
        getDocs(collection(db, ordersCol)),
      ]);
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setOrders(ordSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const cfgDoc = cfgSnap.docs.find(d => (d.data() as CaixaConfig).month === selectedMonth);
      const si = cfgDoc ? (cfgDoc.data() as CaixaConfig).saldoInicial : 0;
      setSaldoInicial(si);
      setSaldoInicialInput(si.toFixed(2).replace('.', ','));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const monthTx = useMemo(() =>
    transactions.filter(t => monthKey(t.date) === selectedMonth),
    [transactions, selectedMonth]
  );

  const paidOrdersInMonth = useMemo(() => {
    return orders.filter((o: any) => {
      if (!isOrderPaid(o)) return false;
      const d = getOrderPaymentDate(o);
      return d ? monthKey(d) === selectedMonth : false;
    });
  }, [orders, selectedMonth]);

  const orderRevenue = useMemo(() =>
    paidOrdersInMonth.reduce((s: number, o: any) => s + getOrderVal(o), 0),
    [paidOrdersInMonth]
  );

  const totalIncome = useMemo(() =>
    monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.value, 0) + orderRevenue,
    [monthTx, orderRevenue]
  );

  const totalExpenses = useMemo(() =>
    monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.value, 0),
    [monthTx]
  );

  const saldoFinal = saldoInicial + totalIncome - totalExpenses;

  const expByCat = useMemo(() => {
    const map: Record<string, number> = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.value;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  // Filtered list for the table
  const filteredTx = useMemo(() => {
    const all: (Transaction & { _source?: string })[] = [
      ...monthTx.map(t => ({ ...t })),
    ];
    // Add paid orders as virtual income entries
    paidOrdersInMonth.forEach((o: any) => {
      const val = getOrderVal(o);
      if (val > 0) {
        all.push({
          id: `order_${o.id}`,
          type: 'income',
          category: 'Vendas Diretas',
          description: `Pedido #${o.orderNumber || o.id?.slice(-6)} — ${o.clientName || 'Cliente'}`,
          value: val,
          date: getOrderPaymentDate(o),
          paymentMethod: o.paymentMethod || '',
          origin: 'order_sync' as const,
          createdAt: o.createdAt || '',
          _source: 'order',
        });
      }
    });

    return all
      .filter(t => typeFilter === 'all' || t.type === typeFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [monthTx, paidOrdersInMonth, typeFilter]);

  // ── Saldo Inicial ─────────────────────────────────────────────────────────────
  async function saveSaldoInicial() {
    const cols = getFinanceiroCollections();
    const val = parseFloat(saldoInicialInput.replace(',', '.')) || 0;
    setSaving(true);
    try {
      const snap = await getDocs(collection(db, cols.config));
      const existing = snap.docs.find(d => (d.data() as CaixaConfig).month === selectedMonth);
      if (existing) {
        await updateDoc(doc(db, cols.config, existing.id), { saldoInicial: val, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, cols.config), {
          month: selectedMonth, saldoInicial: val, createdAt: new Date().toISOString()
        });
      }
      setSaldoInicial(val);
      setEditingSaldo(false);
      toast.success('Saldo inicial salvo');
    } catch {
      toast.error('Erro ao salvar saldo');
    } finally {
      setSaving(false);
    }
  }

  // ── CRUD transactions ─────────────────────────────────────────────────────────
  function openNewForm(type: 'income' | 'expense' = 'expense') {
    setEditingTx(null);
    setForm({ ...EMPTY_FORM, type, date: `${selectedMonth}-01` });
    setShowForm(true);
    setShowAI(false);
  }

  function openEditForm(tx: Transaction) {
    setEditingTx(tx);
    setForm({
      type: tx.type,
      category: tx.category,
      description: tx.description,
      value: tx.value,
      date: tx.date,
      paymentMethod: tx.paymentMethod || 'pix',
      account: tx.account || 'sicoob',
      notes: tx.notes || '',
    });
    setShowForm(true);
    setShowAI(false);
  }

  async function saveTransaction() {
    if (!form.description || !form.value || !form.date || !form.category) {
      toast.error('Preencha descrição, categoria, valor e data'); return;
    }
    const cols = getFinanceiroCollections();
    setSaving(true);
    try {
      const data: Omit<Transaction, 'id'> = {
        ...form,
        value: typeof form.value === 'string' ? parseFloat(String(form.value).replace(',', '.')) || 0 : form.value,
        origin: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: !!editingTx,
      };
      if (editingTx) {
        await updateDoc(doc(db, cols.transactions, editingTx.id), { ...data, isEdited: true });
        toast.success('Lançamento atualizado');
      } else {
        await addDoc(collection(db, cols.transactions), data);
        toast.success('Lançamento registrado');
      }
      setShowForm(false);
      setEditingTx(null);
      loadData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTx(tx: Transaction) {
    if (!confirm(`Excluir "${tx.description}"?`)) return;
    const cols = getFinanceiroCollections();
    await deleteDoc(doc(db, cols.transactions, tx.id));
    toast.success('Lançamento excluído');
    loadData();
  }

  // ── AI entry ─────────────────────────────────────────────────────────────────
  async function parseAI() {
    if (!aiText.trim()) return;
    setAILoading(true);
    try {
      const res = await fetch('/api/financeiro/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const d = json.data;
      setForm({
        type: d.type || 'expense',
        category: d.category || '',
        description: d.description || '',
        value: d.value || 0,
        date: d.date || todayStr(),
        paymentMethod: d.paymentMethod || 'pix',
        account: d.account || 'sicoob',
        notes: d.notes || '',
      });
      setShowForm(true);
      setShowAI(false);
      setAIText('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao interpretar');
    } finally {
      setAILoading(false);
    }
  }

  // ── OFX import ───────────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setSaving(true);
    try {
      const res = await fetch('/api/financeiro/ofx-import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erro no OFX');

      const cols = getFinanceiroCollections();
      const txs: Transaction[] = (json.transactions || []).map((t: any) => ({
        id: '',
        type: t.type as 'income' | 'expense',
        category: t.type === 'income' ? 'Outras Entradas' : 'Outros',
        description: t.memo || 'Transação OFX',
        value: t.amount,
        date: t.date,
        paymentMethod: 'transferencia',
        account: 'sicoob' as const,
        origin: 'ofx_import' as const,
        notes: `FITID: ${t.fitid}`,
        createdAt: new Date().toISOString(),
      }));

      let count = 0;
      for (const tx of txs) {
        if (monthKey(tx.date) === selectedMonth) {
          const { id, ...rest } = tx;
          await addDoc(collection(db, cols.transactions), rest);
          count++;
        }
      }
      toast.success(`${count} transações do mês importadas`);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
      if (ofxRef.current) ofxRef.current.value = '';
    }
  }

  // ── Auth guard ───────────────────────────────────────────────────────────────
  if (userLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
  if (!userProfile) return <Login />;

  const categories = form.type === 'income' ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES];
  const monthLabel = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || selectedMonth;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Financeiro" />
        <FinanceiroNav />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Caixa</p>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Month selector */}
              <div className="relative">
                <button
                  onClick={() => setShowMonthDrop(v => !v)}
                  className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 transition-all"
                >
                  {monthLabel}
                  <ChevronDown className="size-3.5" />
                </button>
                {showMonthDrop && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden min-w-[180px] max-h-60 overflow-y-auto">
                    {MONTH_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setSelectedMonth(opt.value); setShowMonthDrop(false); }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                          selectedMonth === opt.value ? 'font-black text-primary' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <button
                onClick={() => { setShowAI(v => !v); setShowForm(false); }}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Sparkles className="size-3.5" /> IA
              </button>
              <button
                onClick={() => openNewForm('expense')}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="size-3.5" /> Saída
              </button>
              <button
                onClick={() => openNewForm('income')}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="size-3.5" /> Entrada
              </button>
              <button
                onClick={() => ofxRef.current?.click()}
                className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors hover:border-primary/50"
              >
                <Upload className="size-3.5" /> OFX
              </button>
              <input ref={ofxRef} type="file" accept=".ofx,.OFX" className="hidden" onChange={handleOFX} />
            </div>
          </div>

          {/* AI input */}
          {showAI && (
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="size-3.5" /> Lançar via IA
              </p>
              <div className="flex gap-2">
                <input
                  value={aiText}
                  onChange={e => setAIText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && parseAI()}
                  placeholder='Ex: "250 gasolina pix" ou "1155 contador março"'
                  className="flex-1 bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                />
                <button
                  onClick={parseAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {aiLoading ? 'Interpretando…' : 'Interpretar'}
                </button>
              </div>
              <p className="text-[11px] text-violet-500">A IA interpreta o texto e preenche o formulário — você pode ajustar antes de salvar.</p>
            </div>
          )}

          {/* Manual form */}
          {showForm && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {editingTx ? 'Editar Lançamento' : 'Novo Lançamento'}
                </p>
                <button onClick={() => { setShowForm(false); setEditingTx(null); }} className="text-slate-400 hover:text-slate-600">
                  <X className="size-4" />
                </button>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2">
                {(['expense', 'income'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, type: t, category: '' }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      form.type === t
                        ? t === 'expense'
                          ? 'bg-red-500 text-white'
                          : 'bg-emerald-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {t === 'expense' ? '↓ Saída' : '↑ Entrada'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Description */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="Descrição do lançamento"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Selecione…</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Value */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.value || ''}
                    onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="0,00"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Payment method */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma</label>
                  <select
                    value={form.paymentMethod}
                    onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    {PAYMENT_METHODS_FINANCEIRO.map(m => (
                      <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Account */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta</label>
                  <select
                    value={form.account}
                    onChange={e => setForm(f => ({ ...f, account: e.target.value as any }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    {BANK_ACCOUNTS.map(a => (
                      <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowForm(false); setEditingTx(null); }}
                  className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveTransaction}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Saldo Inicial */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo Inicial</p>
                  {editingSaldo ? (
                    <div className="flex gap-1.5 items-center">
                      <input
                        value={saldoInicialInput}
                        onChange={e => setSaldoInicialInput(e.target.value)}
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary w-0"
                      />
                      <button onClick={saveSaldoInicial} disabled={saving} className="text-emerald-600 hover:text-emerald-700 transition-colors">
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      </button>
                      <button onClick={() => setEditingSaldo(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <p className="text-xl font-black text-slate-900 dark:text-white">{fmtCurrency(saldoInicial)}</p>
                      <button onClick={() => setEditingSaldo(true)} className="text-slate-300 hover:text-primary ml-1">
                        <Edit3 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Entradas */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="size-3.5 text-emerald-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas</p>
                  </div>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalIncome)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {paidOrdersInMonth.length} pedido{paidOrdersInMonth.length !== 1 ? 's' : ''} + lançamentos
                  </p>
                </div>

                {/* Saídas */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="size-3.5 text-red-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saídas</p>
                  </div>
                  <p className="text-xl font-black text-red-500 dark:text-red-400">{fmtCurrency(totalExpenses)}</p>
                </div>

                {/* Saldo Final */}
                <div className={`rounded-2xl border p-4 shadow-sm ${
                  saldoFinal >= 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wallet className="size-3.5 text-slate-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Final</p>
                  </div>
                  <p className={`text-xl font-black ${saldoFinal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtCurrency(saldoFinal)}
                  </p>
                </div>
              </div>

              {/* Charts + table row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Expense pie */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Saídas por Categoria</p>
                  {expByCat.length === 0 ? (
                    <div className="flex items-center justify-center h-36 text-slate-400 text-sm">Sem saídas no mês</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={expByCat} cx="50%" cy="50%" outerRadius={65} dataKey="value" nameKey="name" paddingAngle={2}>
                            {expByCat.map((entry, idx) => (
                              <Cell key={idx} fill={EXPENSE_COLORS[entry.name] || `hsl(${idx * 37}, 60%, 55%)`} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-2">
                        {expByCat.slice(0, 5).map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5 min-w-0">
                            <div className="size-2 rounded-full shrink-0" style={{ background: EXPENSE_COLORS[item.name] || `hsl(${i * 37}, 60%, 55%)` }} />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1">{item.name}</span>
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">{fmtCurrency(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Transactions table */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Movimentações</p>
                    <div className="flex gap-1">
                      {TYPE_FILTERS.map(f => (
                        <button
                          key={f.value}
                          onClick={() => setTypeFilter(f.value as any)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            typeFilter === f.value
                              ? 'bg-primary/10 text-primary'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[400px] overflow-y-auto">
                    {filteredTx.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                        Nenhuma movimentação no período
                      </div>
                    ) : (
                      filteredTx.map(tx => (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                          <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${
                            tx.type === 'income'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30'
                              : 'bg-red-100 dark:bg-red-900/30'
                          }`}>
                            {tx.type === 'income'
                              ? <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                              : <TrendingDown className="size-4 text-red-500 dark:text-red-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{tx.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-slate-400">{fmtDate(tx.date)}</span>
                              <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-[11px] text-slate-400 truncate">{tx.category}</span>
                              {(tx as any)._source === 'order' && (
                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">Pedido</span>
                              )}
                              {tx.origin === 'ofx_import' && (
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">OFX</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className={`text-sm font-black ${
                              tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                            }`}>
                              {tx.type === 'expense' ? '−' : '+'}{fmtCurrency(tx.value)}
                            </p>
                            {!(tx as any)._source && (
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button onClick={() => openEditForm(tx)} className="text-slate-300 hover:text-primary transition-colors">
                                  <Edit3 className="size-3.5" />
                                </button>
                                <button onClick={() => deleteTx(tx)} className="text-slate-300 hover:text-red-500 transition-colors">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
