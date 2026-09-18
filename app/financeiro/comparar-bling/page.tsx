'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Search, Download } from 'lucide-react';

interface BlingRow {
  numero: number;
  data: string;
  cliente: string;
  situacao: string;
  valor: number;
}

interface CompareResult {
  blingNumero: number;
  blingCliente: string;
  blingSituacao: string;
  blingValor: number;
  status: 'OK' | 'AUSENTE_NO_FLUXIA' | 'DELETADO_NO_FLUXIA' | 'VALOR_DIVERGENTE';
  fluxiaStatus: string | null;
  fluxiaValor: number | null;
  diferenca: number | null;
}

interface Summary {
  total_bling: number;
  total_fluxia: number;
  total_fluxia_com_blingId: number;
  ausentes_no_fluxia: number;
  deletados_no_fluxia: number;
  com_valor_divergente: number;
  ok: number;
  no_fluxia_sem_bling: number;
  soma_bling: number;
  soma_fluxia_correspondentes: number;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Detectar separador: tabulação (Excel), ; ou ,
function detectSep(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  if (tabs >= semis && tabs >= commas) return '\t';
  if (semis >= commas) return ';';
  return ',';
}

// Converter dados colados do Excel / CSV do Bling para array de objetos
// Formato: Nº Pedido | Data | Cliente | Situação | Valor (qualquer separador)
function parseCSV(text: string): BlingRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const sep = detectSep(lines[0]);
  const normalize = (s: string) => s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .replace(/['"]/g, '');

  const headers = lines[0].split(sep).map(normalize);

  const numIdx = headers.findIndex(h => h.includes('pedido') || h === 'numero' || h === 'n' || h.startsWith('nº') || h === 'no');
  const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('emiss'));
  const clientIdx = headers.findIndex(h => h.includes('cliente') || h.includes('nome') || h.includes('razao'));
  const situacaoIdx = headers.findIndex(h => h.includes('situa') || h.includes('status'));
  const valorIdx = headers.findIndex(h => (h.includes('valor') || h.includes('total')) && !h.includes('custo'));

  // Fallback: se headers não detectados, assumir ordem padrão do Bling: 0=nº, 1=data, 2=cliente, 3=situação, 4=valor
  const iNum = numIdx >= 0 ? numIdx : 0;
  const iDate = dateIdx >= 0 ? dateIdx : 1;
  const iClient = clientIdx >= 0 ? clientIdx : 2;
  const iSit = situacaoIdx >= 0 ? situacaoIdx : 3;
  const iVal = valorIdx >= 0 ? valorIdx : 4;

  const rows: BlingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const numero = parseInt(cols[iNum] ?? '', 10);
    if (isNaN(numero)) continue;
    const valorRaw = (cols[iVal] ?? '0').replace(/\./g, '').replace(',', '.');
    rows.push({
      numero,
      data: cols[iDate] ?? '',
      cliente: cols[iClient] ?? '',
      situacao: cols[iSit] ?? '',
      valor: parseFloat(valorRaw) || 0,
    });
  }
  return rows;
}

export default function CompararBlingPage() {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<BlingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [populando, setPopulando] = useState(false);
  const [populandoMsg, setPopulandoMsg] = useState('');
  const [result, setResult] = useState<{ summary: Summary; problemas: CompareResult[]; fluxia_sem_bling: any[] } | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todos' | 'ausente' | 'divergente' | 'deletado'>('todos');

  function handleParse() {
    const rows = parseCSV(csvText);
    setParsed(rows);
    setResult(null);
    setError(rows.length === 0 ? 'Nenhum pedido encontrado. Verifique o formato do CSV.' : '');
  }

  async function handleCompare() {
    if (parsed.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/financeiro/compare-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePopularNumeros() {
    setPopulando(true);
    setPopulandoMsg('Buscando números de pedidos no Bling...');
    try {
      const res = await fetch('/api/financeiro/populate-bling-numero', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido');
      setPopulandoMsg(`Concluído: ${data.atualizados} pedidos atualizados, ${data.erros} erros. Agora clique em "Comparar" novamente.`);
    } catch (e: any) {
      setPopulandoMsg(`Erro: ${e.message}`);
    } finally {
      setPopulando(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const header = 'Nº Bling;Cliente;Situação Bling;Valor Bling;Status;Status Fluxia;Valor Fluxia;Diferença\n';
    const rows = result.problemas.map(r =>
      [r.blingNumero, r.blingCliente, r.blingSituacao, r.blingValor, r.status, r.fluxiaStatus ?? '', r.fluxiaValor ?? '', r.diferenca ?? ''].join(';')
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'divergencias-bling-fluxia.csv';
    a.click();
  }

  const filtered = result?.problemas.filter(r => {
    if (filter === 'todos') return true;
    if (filter === 'ausente') return r.status === 'AUSENTE_NO_FLUXIA';
    if (filter === 'divergente') return r.status === 'VALOR_DIVERGENTE';
    if (filter === 'deletado') return r.status === 'DELETADO_NO_FLUXIA';
    return true;
  }) ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Comparar Bling × Fluxia</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Exporte os pedidos do Bling como CSV (Vendas → Exportar) e cole abaixo. A comparação usa o campo <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Nº Pedido</code> para cruzar os dados.
      </p>

      {/* Entrada de CSV */}
      <div className="space-y-3">
        <textarea
          value={csvText}
          onChange={e => { setCsvText(e.target.value); setParsed([]); setResult(null); }}
          placeholder={'Nº Pedido;Data;Cliente;Situação;Valor\n1542;01/01/2026;CLIENTE A;Atendido;500,00\n...'}
          className="w-full h-40 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono resize-y text-gray-800 dark:text-gray-200"
        />
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={handleParse}
            disabled={!csvText.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Processar CSV
          </button>
          {parsed.length > 0 && (
            <button
              onClick={handleCompare}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <Search size={16} />
              {loading ? 'Comparando...' : `Comparar ${parsed.length} pedidos`}
            </button>
          )}
          <div className="ml-auto flex flex-col items-end gap-1">
            <button
              onClick={handlePopularNumeros}
              disabled={populando}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-400 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              {populando ? 'Buscando no Bling...' : '🔄 Preencher nº de pedidos (1x)'}
            </button>
            {populandoMsg && <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm text-right">{populandoMsg}</p>}
          </div>
        </div>
        {parsed.length > 0 && !result && (
          <div className="space-y-2">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{parsed.length} pedidos detectados. Verifique as primeiras linhas abaixo e clique em "Comparar":</p>
            <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Nº</th>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Situação</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {parsed.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1 font-mono">{r.numero}</td>
                      <td className="px-3 py-1">{r.data}</td>
                      <td className="px-3 py-1 max-w-[200px] truncate">{r.cliente}</td>
                      <td className="px-3 py-1">{r.situacao}</td>
                      <td className="px-3 py-1 text-right font-mono">{fmt(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Resumo */}
      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card color="blue" label="Total Bling" value={result.summary.total_bling} />
            <Card color="emerald" label="OK" value={result.summary.ok} />
            <Card color="amber" label="Valor Divergente" value={result.summary.com_valor_divergente} />
            <Card color="red" label="Ausentes no Fluxia" value={result.summary.ausentes_no_fluxia} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1">
              <p className="text-gray-500 dark:text-gray-400">Soma Bling</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(result.summary.soma_bling)}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1">
              <p className="text-gray-500 dark:text-gray-400">Soma Fluxia (correspondentes)</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(result.summary.soma_fluxia_correspondentes)}</p>
              <p className="text-xs text-gray-400">Diferença: {fmt(Math.abs(result.summary.soma_bling - result.summary.soma_fluxia_correspondentes))}</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['todos', 'ausente', 'divergente', 'deletado'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === f
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                    : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                }`}
              >
                {f === 'todos' ? `Todos os problemas (${result.problemas.length})` :
                 f === 'ausente' ? `Ausentes (${result.summary.ausentes_no_fluxia})` :
                 f === 'divergente' ? `Divergentes (${result.summary.com_valor_divergente})` :
                 `Deletados (${result.summary.deletados_no_fluxia})`}
              </button>
            ))}
            <button onClick={downloadCSV} className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500">
              <Download size={12} /> Exportar CSV
            </button>
          </div>

          {/* Tabela de problemas */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nº Bling</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Situação Bling</th>
                  <th className="px-4 py-3 text-right">Valor Bling</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Status Fluxia</th>
                  <th className="px-4 py-3 text-right">Valor Fluxia</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum problema encontrado neste filtro</td></tr>
                )}
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-mono font-medium text-gray-900 dark:text-white">{r.blingNumero}</td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{r.blingCliente}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{r.blingSituacao}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{fmt(r.blingValor)}</td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{r.fluxiaStatus ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{r.fluxiaValor != null ? fmt(r.fluxiaValor) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-600 dark:text-red-400">{r.diferenca != null ? fmt(r.diferenca) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ color, label, value }: { color: string; label: string; value: number }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  };
  return (
    <div className={`rounded-lg p-4 ${colors[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'OK') return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle size={14} /> OK</span>;
  if (status === 'AUSENTE_NO_FLUXIA') return <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle size={14} /> Ausente</span>;
  if (status === 'DELETADO_NO_FLUXIA') return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle size={14} /> Deletado</span>;
  if (status === 'VALOR_DIVERGENTE') return <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"><AlertTriangle size={14} /> Divergente</span>;
  return <span>{status}</span>;
}
