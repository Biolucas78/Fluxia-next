'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUser } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import {
  Plus, X, Loader2, Save, Trash2, Edit3, CheckCircle2,
  Clock, AlertTriangle, Filter, ChevronDown, Sparkles,
  Upload, FileText, RefreshCw, CalendarClock, Repeat,
} from 'lucide-react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFinanceiroCollections,
  EXPENSE_CATEGORIES, PAYMENT_METHODS_FINANCEIRO, BANK_ACCOUNTS,
  RECURRENCE_LABELS, Bill, BillStatus, BillRecurrence,
} from '@/lib/financeiro-types';
import { toast } from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function resolveStatus(bill: Bill): BillStatus {
  if (bill.status === 'paid') return 'paid';
  if (bill.dueDate < todayStr()) return 'overdue';
  return 'pending';
}

const STATUS_FILTERS = [
  { value: 'all',     label: 'Todas',     icon: Filter },
  { value: 'pending', label: 'Em aberto', icon: Clock },
  { value: 'overdue', label: 'Atrasadas', icon: AlertTriangle },
  { value: 'paid',    label: 'Pagas',     icon: CheckCircle2 },
];

const EMPTY_BILL: Omit<Bill, 'id' | 'createdAt' | 'updatedAt' | 'history'> = {
  supplier: '',
  description: '',
  category: '',
  value: 0,
  issueDate: '',
  dueDate: '',
  competenceDate: '',
  paymentMethod: 'boleto',
  account: 'sicoob',
  status: 'pending',
  recurrence: 'once',
  observation: '',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ContasPagarPage() {
  const { userProfile, loading: userLoading } = useUser();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | BillStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [form, setForm] = useState({ ...EMPTY_BILL });
  const [showPayModal, setShowPayModal] = useState<Bill | null>(null);
  const [payForm, setPayForm] = useState({ paidDate: todayStr(), paidValue: '', interest: '0', fine: '0', account: 'sicoob', paymentMethod: 'boleto' });
  const [showAI, setShowAI] = useState(false);
  const [aiText, setAIText] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  const danfeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (userProfile) loadBills(); }, [userProfile]);

  async function loadBills() {
    setLoading(true);
    const cols = getFinanceiroCollections();
    try {
      const snap = await getDocs(collection(db, cols.bills));
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bill)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const resolved = useMemo(() =>
    bills.map(b => ({ ...b, _status: resolveStatus(b) })),
    [bills]
  );

  const filtered = useMemo(() => {
    return resolved
      .filter(b => statusFilter === 'all' || b._status === statusFilter)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [resolved, statusFilter]);

  const totals = useMemo(() => {
    const pending = resolved.filter(b => b._status === 'pending').reduce((s, b) => s + b.value, 0);
    const overdue = resolved.filter(b => b._status === 'overdue').reduce((s, b) => s + b.value, 0);
    const paid    = resolved.filter(b => b._status === 'paid').reduce((s, b) => s + (b.paidValue ?? b.value), 0);
    return { pending, overdue, paid };
  }, [resolved]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  function openNewForm() {
    setEditingBill(null);
    setForm({ ...EMPTY_BILL, dueDate: todayStr() });
    setShowForm(true);
    setShowAI(false);
  }

  function openEditForm(b: Bill) {
    setEditingBill(b);
    setForm({
      supplier: b.supplier,
      description: b.description,
      category: b.category,
      value: b.value,
      issueDate: b.issueDate || '',
      dueDate: b.dueDate,
      competenceDate: b.competenceDate || '',
      paymentMethod: b.paymentMethod || 'boleto',
      account: b.account || 'sicoob',
      status: b.status,
      recurrence: b.recurrence,
      observation: b.observation || '',
    });
    setShowForm(true);
    setShowAI(false);
  }

  async function saveBill() {
    if (!form.supplier || !form.description || !form.value || !form.dueDate || !form.category) {
      toast.error('Preencha fornecedor, descrição, categoria, valor e vencimento'); return;
    }
    const cols = getFinanceiroCollections();
    setSaving(true);
    try {
      const data: Omit<Bill, 'id'> = {
        ...form,
        value: typeof form.value === 'string' ? parseFloat(String(form.value).replace(',', '.')) || 0 : form.value,
        history: editingBill
          ? [...(editingBill.history || []), { action: 'edit', timestamp: new Date().toISOString() }]
          : [{ action: 'create', timestamp: new Date().toISOString() }],
        createdAt: editingBill?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (editingBill) {
        await updateDoc(doc(db, cols.bills, editingBill.id), data);
        toast.success('Conta atualizada');
      } else {
        await addDoc(collection(db, cols.bills), data);
        toast.success('Conta adicionada');

        // If recurring, generate future instances (up to 12)
        if (form.recurrence !== 'once') {
          await generateRecurring(data, form.recurrence);
        }
      }
      setShowForm(false);
      setEditingBill(null);
      loadBills();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  }

  async function generateRecurring(base: Omit<Bill, 'id'>, rec: BillRecurrence) {
    const cols = getFinanceiroCollections();
    const daysMap: Record<string, number> = {
      weekly: 7, monthly: 30, bimonthly: 60, quarterly: 90, annual: 365,
    };
    const count = rec === 'annual' ? 2 : rec === 'quarterly' ? 4 : rec === 'bimonthly' ? 6 : 12;
    const base_date = new Date(base.dueDate + 'T12:00:00');
    for (let i = 1; i <= count; i++) {
      const next = new Date(base_date);
      if (rec === 'monthly' || rec === 'bimonthly' || rec === 'quarterly') {
        const months = rec === 'monthly' ? i : rec === 'bimonthly' ? i * 2 : i * 3;
        next.setMonth(next.getMonth() + months);
      } else if (rec === 'annual') {
        next.setFullYear(next.getFullYear() + i);
      } else {
        next.setDate(next.getDate() + daysMap[rec] * i);
      }
      const dateStr = next.toISOString().split('T')[0];
      await addDoc(collection(db, cols.bills), {
        ...base, dueDate: dateStr, status: 'pending',
        history: [{ action: 'create_recurring', timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
  }

  async function deleteBill(b: Bill) {
    if (!confirm(`Excluir "${b.description}"?`)) return;
    const cols = getFinanceiroCollections();
    await deleteDoc(doc(db, cols.bills, b.id));
    toast.success('Conta excluída');
    loadBills();
  }

  // ── Mark as paid ──────────────────────────────────────────────────────────────
  function openPayModal(b: Bill) {
    setShowPayModal(b);
    setPayForm({
      paidDate: todayStr(),
      paidValue: b.value.toFixed(2).replace('.', ','),
      interest: '0',
      fine: '0',
      account: b.account || 'sicoob',
      paymentMethod: b.paymentMethod || 'boleto',
    });
  }

  async function confirmPay() {
    if (!showPayModal) return;
    const cols = getFinanceiroCollections();
    const paidVal = parseFloat(payForm.paidValue.replace(',', '.')) || showPayModal.value;
    const interest = parseFloat(payForm.interest) || 0;
    const fine = parseFloat(payForm.fine) || 0;
    setSaving(true);
    try {
      const history = [...(showPayModal.history || []), {
        action: 'paid',
        timestamp: new Date().toISOString(),
      }];
      await updateDoc(doc(db, cols.bills, showPayModal.id), {
        status: 'paid',
        paidDate: payForm.paidDate,
        paidValue: paidVal,
        interest,
        fine,
        account: payForm.account,
        paymentMethod: payForm.paymentMethod,
        history,
        updatedAt: new Date().toISOString(),
      });

      // Create transaction record
      await addDoc(collection(db, cols.transactions), {
        type: 'expense',
        category: showPayModal.category,
        description: showPayModal.description,
        value: paidVal + interest + fine,
        date: payForm.paidDate,
        paymentMethod: payForm.paymentMethod,
        account: payForm.account,
        origin: 'bill_payment',
        referenceBillId: showPayModal.id,
        notes: `Pagamento: ${showPayModal.supplier}${interest > 0 ? ` | Juros: ${fmtCurrency(interest)}` : ''}${fine > 0 ? ` | Multa: ${fmtCurrency(fine)}` : ''}`,
        createdAt: new Date().toISOString(),
      });

      toast.success('Pagamento registrado');
      setShowPayModal(null);
      loadBills();
    } catch { toast.error('Erro ao registrar pagamento'); }
    finally { setSaving(false); }
  }

  // ── AI ────────────────────────────────────────────────────────────────────────
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
      setForm(f => ({
        ...f,
        description: d.description || f.description,
        category: d.category || f.category,
        value: d.value || f.value,
        dueDate: d.date || f.dueDate,
        paymentMethod: d.paymentMethod || f.paymentMethod,
        account: d.account || f.account,
        observation: d.notes || f.observation,
      }));
      setShowForm(true);
      setShowAI(false);
      setAIText('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao interpretar');
    } finally {
      setAILoading(false);
    }
  }

  // ── DANFE ─────────────────────────────────────────────────────────────────────
  async function handleDANFE(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      if (file.name.endsWith('.xml')) {
        fd.append('xml', await file.text());
      } else {
        fd.append('file', file);
      }
      const res = await fetch('/api/financeiro/parse-danfe', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const d = json.data;
      setForm(f => ({
        ...f,
        supplier: d.supplier || f.supplier,
        description: d.description || f.description,
        category: d.category || f.category,
        value: d.value || f.value,
        issueDate: d.issueDate || f.issueDate,
        observation: d.notes || f.observation,
      }));
      setShowForm(true);
      setShowAI(false);
      toast.success('Nota fiscal extraída com IA');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar DANFE');
    } finally {
      setSaving(false);
      if (danfeRef.current) danfeRef.current.value = '';
    }
  }

  // ── Auth guard ────────────────────────────────────────────────────────────────
  if (userLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
  if (!userProfile) return <Login />;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Financeiro" />
        <FinanceiroNav />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contas a Pagar</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setShowAI(v => !v); setShowForm(false); }}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Sparkles className="size-3.5" /> IA
              </button>
              <button
                onClick={() => danfeRef.current?.click()}
                className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold hover:border-primary/50 transition-colors"
              >
                <FileText className="size-3.5" /> DANFE/NF
              </button>
              <input ref={danfeRef} type="file" accept=".pdf,.xml,.PDF,.XML" className="hidden" onChange={handleDANFE} />
              <button
                onClick={openNewForm}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="size-3.5" /> Nova Conta
              </button>
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
                  placeholder='Ex: "1155 contador março" ou "385 embalagens fornecedor X"'
                  className="flex-1 bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                />
                <button
                  onClick={parseAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold"
                >
                  {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Interpretar
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {editingBill ? 'Editar Conta' : 'Nova Conta a Pagar'}
                </p>
                <button onClick={() => { setShowForm(false); setEditingBill(null); }} className="text-slate-400 hover:text-slate-600">
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Supplier */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label>
                  <input
                    value={form.supplier}
                    onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="Nome do fornecedor"
                  />
                </div>

                {/* Category */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Selecione…</option>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="Descrição da conta"
                  />
                </div>

                {/* Value */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                  <input
                    type="number" step="0.01"
                    value={form.value || ''}
                    onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="0,00"
                  />
                </div>

                {/* Due date */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Issue date */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emissão</label>
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Competence date */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Competência</label>
                  <input
                    type="date"
                    value={form.competenceDate}
                    onChange={e => setForm(f => ({ ...f, competenceDate: e.target.value }))}
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

                {/* Recurrence */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Repeat className="size-3" /> Recorrência
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(Object.entries(RECURRENCE_LABELS) as [BillRecurrence, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setForm(f => ({ ...f, recurrence: val }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          form.recurrence === val
                            ? 'bg-primary text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {form.recurrence !== 'once' && !editingBill && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                      Serão criadas automaticamente instâncias futuras com o mesmo valor. Você poderá editar cada uma individualmente.
                    </p>
                  )}
                </div>

                {/* Observation */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações</label>
                  <textarea
                    value={form.observation}
                    onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowForm(false); setEditingBill(null); }}
                  className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveBill}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Em Aberto', value: totals.pending, color: 'text-amber-600 dark:text-amber-400', count: resolved.filter(b => b._status === 'pending').length, bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
              { label: 'Atrasadas', value: totals.overdue, color: 'text-red-600 dark:text-red-400', count: resolved.filter(b => b._status === 'overdue').length, bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
              { label: 'Pagas',     value: totals.paid,    color: 'text-emerald-600 dark:text-emerald-400', count: resolved.filter(b => b._status === 'paid').length, bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border ${s.bg} p-4 shadow-sm`}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{fmtCurrency(s.value)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.count} conta{s.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-1 shadow-sm w-fit">
            {STATUS_FILTERS.map(f => {
              const Icon = f.icon;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    statusFilter === f.value
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Bills list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <CalendarClock className="size-10 opacity-30" />
              <p className="text-sm">Nenhuma conta encontrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(b => {
                const isPaid = b._status === 'paid';
                const isOverdue = b._status === 'overdue';
                return (
                  <div
                    key={b.id}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-4 flex items-center gap-4 group ${
                      isPaid    ? 'border-emerald-200 dark:border-emerald-900/50 opacity-75' :
                      isOverdue ? 'border-red-200 dark:border-red-900/50' :
                                  'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Status indicator */}
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isPaid    ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                      isOverdue ? 'bg-red-100 dark:bg-red-900/30' :
                                  'bg-amber-100 dark:bg-amber-900/30'
                    }`}>
                      {isPaid    ? <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" /> :
                       isOverdue ? <AlertTriangle className="size-5 text-red-500" /> :
                                   <Clock className="size-5 text-amber-600 dark:text-amber-400" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{b.description}</p>
                        {b.recurrence !== 'once' && (
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                            <Repeat className="size-2.5" /> {RECURRENCE_LABELS[b.recurrence]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-slate-400">{b.supplier}</span>
                        <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-[11px] text-slate-400">{b.category}</span>
                        <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                        <span className={`text-[11px] font-semibold ${isOverdue ? 'text-red-500' : 'text-slate-500'}`}>
                          Venc. {fmtDate(b.dueDate)}
                        </span>
                        {isPaid && b.paidDate && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            · Pago {fmtDate(b.paidDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-right shrink-0">
                      <p className={`text-base font-black ${
                        isPaid ? 'text-emerald-600 dark:text-emerald-400' :
                        isOverdue ? 'text-red-500' :
                        'text-slate-800 dark:text-slate-100'
                      }`}>
                        {fmtCurrency(isPaid ? (b.paidValue ?? b.value) : b.value)}
                      </p>
                      {isPaid && b.paidValue !== undefined && b.paidValue !== b.value && (
                        <p className="text-[11px] text-slate-400">orig. {fmtCurrency(b.value)}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                      {!isPaid && (
                        <button
                          onClick={() => openPayModal(b)}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        >
                          <CheckCircle2 className="size-3.5" /> Pagar
                        </button>
                      )}
                      <button onClick={() => openEditForm(b)} className="text-slate-300 hover:text-primary p-1.5 rounded-lg transition-colors">
                        <Edit3 className="size-4" />
                      </button>
                      <button onClick={() => deleteBill(b)} className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition-colors">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md space-y-4 p-6">
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-900 dark:text-white">Registrar Pagamento</p>
              <button onClick={() => setShowPayModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{showPayModal.description}</p>
              <p className="text-xs text-slate-400 mt-0.5">{showPayModal.supplier} · Venc. {fmtDate(showPayModal.dueDate)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data do Pagamento</label>
                <input type="date" value={payForm.paidDate} onChange={e => setPayForm(f => ({ ...f, paidDate: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Pago (R$)</label>
                <input value={payForm.paidValue} onChange={e => setPayForm(f => ({ ...f, paidValue: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="0,00" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Juros (R$)</label>
                <input value={payForm.interest} onChange={e => setPayForm(f => ({ ...f, interest: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="0,00" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Multa (R$)</label>
                <input value={payForm.fine} onChange={e => setPayForm(f => ({ ...f, fine: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" placeholder="0,00" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                  {PAYMENT_METHODS_FINANCEIRO.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta</label>
                <select value={payForm.account} onChange={e => setPayForm(f => ({ ...f, account: e.target.value }))}
                  className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                  {BANK_ACCOUNTS.map(a => <option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowPayModal(null)} className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700">
                Cancelar
              </button>
              <button onClick={confirmPay} disabled={saving}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
