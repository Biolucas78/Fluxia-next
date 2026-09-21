'use client';

import { useState } from 'react';
import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Download, RefreshCw, Zap, Loader2 } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SyncStatus = 'OK' | 'VALOR_DIVERGENTE' | 'AUSENTE_NO_FLUXIA' | 'SEM_CORRESPONDENTE';
type LinkType = 'invoiceLinked' | 'noInvoiceLinked';

interface SyncResult {
  blingId: string | null;
  blingNumero: number | null;
  blingCliente: string;
  blingValor: number | null;
  blingData: string;
  blingSituacao: string;
  fluxiaId: string | null;
  fluxiaStatus: string | null;
  fluxiaTipo: LinkType | null;
  fluxiaValor: number | null;
  status: SyncStatus;
  diferenca: number | null;
}

interface Summary {
  total_bling: number;
  total_cancelados: number;
  total_nfs: number;
  ok: number;
  divergentes: number;
  ausentes: number;
  sem_correspondente: number;
}

interface SyncResponse {
  summary: Summary;
  resultados: SyncResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? d.substring(0, 10).split('-').reverse().join('/') : '—';

function LinkBadge({ tipo }: { tipo: LinkType | null }) {
  if (tipo === 'invoiceLinked') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 whitespace-nowrap">NF</span>
  );
  if (tipo === 'noInvoiceLinked') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 whitespace-nowrap">Pedido</span>
  );
  return <span className="text-[10px] text-gray-400">—</span>;
}

function StatusBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, React.ReactElement> = {
    OK: <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs"><CheckCircle size={12} /> OK</span>,
    VALOR_DIVERGENTE: <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs"><AlertTriangle size={12} /> Divergente</span>,
    AUSENTE_NO_FLUXIA: <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs"><XCircle size={12} /> Ausente</span>,
    SEM_CORRESPONDENTE: <span className="flex items-center gap-1 text-gray-500 text-xs"><AlertTriangle size={12} /> Sem NF/Pedido no período</span>,
  };
  return map[status];
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  const c: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  };
  return (
    <div className={`rounded-lg p-3 ${c[color] ?? c.gray}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function SyncBlingPage() {
  const today = new Date().toISOString().substring(0, 10);
  const [dataInicial, setDataInicial] = useState('2026-01-01');
  const [dataFinal, setDataFinal] = useState(today);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todos' | 'divergente' | 'ausente' | 'ok'>('todos');
  const [sincronizandoId, setSincronizandoId] = useState<string | null>(null);
  const [sincronizados, setSincronizados] = useState<Record<string, number>>({});

  async function handleSync() {
    setLoading(true); setError(''); setResult(null); setSincronizados({});
    try {
      const res = await fetch('/api/financeiro/sync-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataInicial, dataFinal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido');
      setResult(data);
      setFilter('todos');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sincronizarValor(fluxiaId: string, blingValor: number, blingNumero: number | null) {
    setSincronizandoId(fluxiaId);
    try {
      const res = await fetch('/api/financeiro/sincronizar-valor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fluxiaId, blingValor, blingNumero }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro');
      setSincronizados(prev => ({ ...prev, [fluxiaId]: blingValor }));
    } catch (e: any) {
      alert(`Erro ao sincronizar: ${e.message}`);
    } finally {
      setSincronizandoId(null);
    }
  }

  async function sincronizarTodos() {
    if (!result) return;
    const divergentes = result.resultados.filter(
      r => r.status === 'VALOR_DIVERGENTE' && r.fluxiaId && r.blingValor != null && !sincronizados[r.fluxiaId]
    );
    if (!confirm(`Sincronizar ${divergentes.length} pedidos divergentes com os valores do Bling?`)) return;
    for (const r of divergentes) {
      if (r.fluxiaId && r.blingValor != null) {
        await sincronizarValor(r.fluxiaId, r.blingValor, r.blingNumero);
      }
    }
  }

  function downloadCSV() {
    if (!result) return;
    const header = 'Nº Bling;Data;Cliente;Situação Bling;Tipo;Valor Bling;Valor Fluxia;Diferença;Status\n';
    const rows = result.resultados.map(r =>
      [
        r.blingNumero ?? '',
        fmtDate(r.blingData),
        r.blingCliente,
        r.blingSituacao,
        r.fluxiaTipo ?? '',
        r.blingValor != null ? r.blingValor.toFixed(2) : '',
        r.fluxiaValor != null ? r.fluxiaValor.toFixed(2) : '',
        r.diferenca != null ? r.diferenca.toFixed(2) : '',
        r.status,
      ].join(';')
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bling-fluxia-${dataInicial}_${dataFinal}.csv`;
    a.click();
  }

  const filtered = result?.resultados.filter(r => {
    if (filter === 'todos') return true;
    if (filter === 'divergente') return r.status === 'VALOR_DIVERGENTE';
    if (filter === 'ausente') return r.status === 'AUSENTE_NO_FLUXIA';
    if (filter === 'ok') return r.status === 'OK';
    return true;
  }) ?? [];

  const divergentesRestantes = result?.resultados.filter(
    r => r.status === 'VALOR_DIVERGENTE' && r.fluxiaId && !sincronizados[r.fluxiaId]
  ).length ?? 0;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bling × Fluxia — Verificação</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Compara os pedidos do Bling com os correspondentes no Fluxia via API. Nenhum CSV necessário.
        </p>
      </div>

      {/* Filtro de datas + botão */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data inicial</label>
          <input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data final</label>
          <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
        </div>
        <button onClick={handleSync} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {loading ? 'Buscando no Bling...' : 'Verificar com Bling'}
        </button>
        {loading && (
          <p className="text-xs text-gray-400">Buscando pedidos e NFs no Bling. Pode levar 20–40 segundos...</p>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Resultados */}
      {result && (
        <>
          {result.summary.total_cancelados > 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              ⚠ {result.summary.total_cancelados} pedido(s) cancelados ignorados — analisando {result.summary.total_bling} pedidos ativos + {result.summary.total_nfs} NFs do Bling.
            </p>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KPI label="Pedidos Bling" value={result.summary.total_bling} color="blue" />
            <KPI label="OK" value={result.summary.ok} color="emerald" />
            <KPI label="Divergentes" value={result.summary.divergentes} color="orange" />
            <KPI label="Ausentes no Fluxia" value={result.summary.ausentes} color="red" />
            <KPI label="Fora do período" value={result.summary.sem_correspondente} color="gray" />
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'todos', label: `Todos (${result.resultados.length})` },
              { key: 'divergente', label: `Divergentes (${result.summary.divergentes})` },
              { key: 'ausente', label: `Ausentes (${result.summary.ausentes})` },
              { key: 'ok', label: `OK (${result.summary.ok})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === key
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                    : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                }`}>
                {label}
              </button>
            ))}

            {divergentesRestantes > 0 && (
              <button onClick={sincronizarTodos}
                className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-600 text-white hover:bg-orange-700">
                <Zap size={11} /> Sincronizar todos divergentes ({divergentesRestantes})
              </button>
            )}

            <button onClick={downloadCSV}
              className={`${divergentesRestantes > 0 ? '' : 'ml-auto'} flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-500`}>
              <Download size={11} /> Exportar CSV
            </button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left">Nº Bling</th>
                  <th className="px-3 py-2.5 text-left">Data</th>
                  <th className="px-3 py-2.5 text-left">Cliente</th>
                  <th className="px-3 py-2.5 text-left">Situação</th>
                  <th className="px-3 py-2.5 text-center">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Valor Bling</th>
                  <th className="px-3 py-2.5 text-right">Valor Fluxia</th>
                  <th className="px-3 py-2.5 text-right">Δ</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Nenhum resultado</td></tr>
                )}
                {filtered.map((r, i) => {
                  const jaSinc = r.fluxiaId ? sincronizados[r.fluxiaId] != null : false;
                  const displayBlingValor = r.blingValor != null ? fmt(r.blingValor) : '—';
                  const displayFluxiaValor = jaSinc && r.fluxiaId
                    ? fmt(sincronizados[r.fluxiaId])
                    : r.fluxiaValor != null ? fmt(r.fluxiaValor) : '—';
                  const effectiveStatus: SyncStatus = jaSinc ? 'OK' : r.status;

                  return (
                    <tr key={i} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${jaSinc ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 font-mono font-medium text-gray-900 dark:text-white">
                        {r.blingNumero ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.blingData)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{r.blingCliente}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{r.blingSituacao}</td>
                      <td className="px-3 py-2 text-center"><LinkBadge tipo={r.fluxiaTipo} /></td>
                      <td className="px-3 py-2 font-mono text-right text-gray-900 dark:text-white">{displayBlingValor}</td>
                      <td className="px-3 py-2 font-mono text-right">
                        {jaSinc
                          ? <span className="text-emerald-600 dark:text-emerald-400">{displayFluxiaValor}</span>
                          : <span className={r.status === 'VALOR_DIVERGENTE' ? 'text-orange-600 dark:text-orange-400' : ''}>{displayFluxiaValor}</span>
                        }
                      </td>
                      <td className="px-3 py-2 font-mono text-right text-red-500">
                        {!jaSinc && r.diferenca != null ? fmt(r.diferenca) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={effectiveStatus} /></td>
                      <td className="px-3 py-2">
                        {r.status === 'VALOR_DIVERGENTE' && r.fluxiaId && r.blingValor != null && !jaSinc && (
                          <button
                            onClick={() => sincronizarValor(r.fluxiaId!, r.blingValor!, r.blingNumero)}
                            disabled={sincronizandoId === r.fluxiaId}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 disabled:opacity-50 whitespace-nowrap">
                            <Zap size={10} />
                            {sincronizandoId === r.fluxiaId ? '...' : 'Sincronizar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-1">
            <span><span className="text-blue-600 font-medium">NF</span> = pedido vinculado via Nota Fiscal (valor comparado com a NF do Bling)</span>
            <span><span className="text-purple-600 font-medium">Pedido</span> = vinculado diretamente ao pedido do Bling (sem NF)</span>
            <span><span className="text-gray-500 font-medium">Fora do período</span> = pedido vinculado no Fluxia mas o Bling correspondente está fora das datas selecionadas ou foi cancelado</span>
          </div>
        </>
      )}
    </div>
  );
}
