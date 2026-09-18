'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useOrders } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import FinanceiroNav from '@/components/FinanceiroNav';
import {
  Search, TrendingUp, TrendingDown, Loader2, Users, Building2,
  DollarSign, ChevronDown,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFinanceiroCollections, Transaction, Bill,
} from '@/lib/financeiro-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
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

interface FichaEntry {
  id: string;
  date: string;
  description: string;
  type: 'income' | 'expense';
  value: number;
  category: string;
  source: 'transaction' | 'bill' | 'order';
  entity: string; // nome do cliente/fornecedor
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FichaPage() {
  const { userProfile, loading: userLoading } = useUser();
  const { allOrders: orders, isLoaded: ordersLoaded } = useOrders();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [entityFilter, setEntityFilter] = useState<'all' | 'supplier' | 'customer'>('all');

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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // ── Build unified entries ──────────────────────────────────────────────────
  const allEntries = useMemo((): FichaEntry[] => {
    const entries: FichaEntry[] = [];

    // Transactions
    transactions.forEach(t => {
      entries.push({
        id: t.id,
        date: t.date,
        description: t.description,
        type: t.type,
        value: t.value,
        category: t.category,
        source: 'transaction',
        entity: t.notes?.split('|')[0]?.trim() || t.description,
      });
    });

    // Bills (paid)
    bills.filter(b => b.status === 'paid').forEach(b => {
      entries.push({
        id: b.id,
        date: b.paidDate || b.dueDate,
        description: b.description,
        type: 'expense',
        value: b.paidValue ?? b.value,
        category: b.category,
        source: 'bill',
        entity: b.supplier,
      });
    });

    // Paid orders
    orders.filter((o: any) => isOrderPaid(o)).forEach((o: any) => {
      const val = getOrderVal(o);
      if (val > 0) {
        entries.push({
          id: `order_${o.id}`,
          date: getOrderPaymentDate(o),
          description: `Pedido #${o.orderNumber || o.id?.slice(-6)}`,
          type: 'income',
          value: val,
          category: 'Vendas Diretas',
          source: 'order',
          entity: o.clientName || 'Cliente',
        });
      }
    });

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, bills, orders]);

  // ── Unique entities for quick-pick ────────────────────────────────────────
  const entities = useMemo(() => {
    const map: Map<string, { type: 'supplier' | 'customer'; total: number; count: number }> = new Map();

    // Suppliers from bills
    bills.forEach(b => {
      const key = b.supplier.toLowerCase();
      if (!map.has(key)) map.set(key, { type: 'supplier', total: 0, count: 0 });
      const e = map.get(key)!;
      e.total += b.paidValue ?? b.value;
      e.count++;
      map.set(key, { ...e, type: 'supplier' });
    });

    // Customers from orders
    orders.forEach((o: any) => {
      const name = (o.clientName || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const val = getOrderVal(o);
      if (!map.has(key)) map.set(key, { type: 'customer', total: 0, count: 0 });
      const e = map.get(key)!;
      e.total += val;
      e.count++;
    });

    return Array.from(map.entries()).map(([key, v]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      ...v,
    })).sort((a, b) => b.total - a.total);
  }, [bills, orders]);

  // ── Filtered entries ──────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allEntries.filter(e =>
      e.entity.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );
  }, [allEntries, search]);

  const stats = useMemo(() => {
    const income = filteredEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.value, 0);
    const expense = filteredEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.value, 0);
    return { income, expense, net: income - expense };
  }, [filteredEntries]);

  const filteredEntitiesList = useMemo(() => {
    if (entityFilter === 'all') return entities;
    return entities.filter(e => e.type === entityFilter);
  }, [entities, entityFilter]);

  // ── Auth guard ────────────────────────────────────────────────────────────
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ficha Financeira</p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente, fornecedor, descrição ou categoria…"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary shadow-sm"
            />
          </div>

          {loading || !ordersLoaded ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : search.trim() ? (
            <>
              {/* Search results */}
              {filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                  <Search className="size-10 opacity-30" />
                  <p className="text-sm">Nenhum resultado para "{search}"</p>
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Entradas', value: stats.income, color: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Saídas',   value: stats.expense, color: 'text-red-500 dark:text-red-400' },
                      { label: 'Saldo',    value: stats.net, color: stats.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                        <p className={`text-lg font-black ${s.color}`}>{fmtCurrency(s.value)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{filteredEntries.filter(e => e.type === (s.label === 'Saídas' ? 'expense' : 'income')).length || filteredEntries.length} movimentação{filteredEntries.length !== 1 ? 'ções' : 'ção'}</p>
                      </div>
                    ))}
                  </div>

                  {/* Entries */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {filteredEntries.length} resultado{filteredEntries.length !== 1 ? 's' : ''} para "{search}"
                      </p>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
                      {filteredEntries.map(e => (
                        <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${
                            e.type === 'income'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30'
                              : 'bg-red-100 dark:bg-red-900/30'
                          }`}>
                            {e.type === 'income'
                              ? <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                              : <TrendingDown className="size-4 text-red-500 dark:text-red-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{e.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-slate-500 font-medium">{e.entity}</span>
                              <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-[11px] text-slate-400">{e.category}</span>
                              <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-[11px] text-slate-400">{fmtDate(e.date)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                e.source === 'order'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                  : e.source === 'bill'
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}>
                                {e.source === 'order' ? 'Pedido' : e.source === 'bill' ? 'Conta' : 'Manual'}
                              </span>
                            </div>
                          </div>
                          <p className={`text-sm font-black shrink-0 ${
                            e.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                          }`}>
                            {e.type === 'income' ? '+' : '−'}{fmtCurrency(e.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Entity quick-pick list */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Clientes e Fornecedores
                  </p>
                  <div className="flex gap-1">
                    {[
                      { value: 'all',      label: 'Todos' },
                      { value: 'customer', label: 'Clientes' },
                      { value: 'supplier', label: 'Fornecedores' },
                    ].map(f => (
                      <button
                        key={f.value}
                        onClick={() => setEntityFilter(f.value as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          entityFilter === f.value
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
                  {filteredEntitiesList.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                      Nenhum dado ainda
                    </div>
                  ) : (
                    filteredEntitiesList.map((entity, i) => (
                      <button
                        key={i}
                        onClick={() => setSearch(entity.name)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left group"
                      >
                        <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                          entity.type === 'customer'
                            ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-amber-100 dark:bg-amber-900/30'
                        }`}>
                          {entity.type === 'customer'
                            ? <Users className="size-4 text-blue-600 dark:text-blue-400" />
                            : <Building2 className="size-4 text-amber-600 dark:text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{entity.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {entity.count} movimentação{entity.count !== 1 ? 'ções' : 'ção'} ·
                            {entity.type === 'customer' ? ' Cliente' : ' Fornecedor'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-black ${
                            entity.type === 'customer'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400'
                          }`}>
                            {fmtCurrency(entity.total)}
                          </p>
                        </div>
                        <ChevronDown className="size-3.5 text-slate-300 -rotate-90 group-hover:text-slate-500 transition-colors" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center">
                Clique em um cliente ou fornecedor para ver todas as movimentações, ou use a busca acima.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
