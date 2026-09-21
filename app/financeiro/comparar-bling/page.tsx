'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Search, Download, Link, RefreshCw, Plus, Zap } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type LinkType = 'invoiceLinked' | 'noInvoiceLinked' | 'none';

interface BlingRow { numero: number; data: string; cliente: string; situacao: string; valor: number; }

interface Candidato {
  fluxiaId: string; clientName: string; totalValue: number;
  status: string; createdAt: string; jaVinculado: boolean; score: number;
}

interface AusenteComCandidatos {
  blingNumero: number; blingCliente: string; blingSituacao: string;
  blingValor: number; blingData: string; candidatos: Candidato[];
}

interface CompareResult {
  blingNumero: number; blingCliente: string; blingSituacao: string;
  blingValor: number; blingData: string;
  status: 'OK' | 'AUSENTE_NO_FLUXIA' | 'DELETADO_NO_FLUXIA' | 'VALOR_DIVERGENTE';
  fluxiaId: string | null; linkType: LinkType | null;
  fluxiaStatus: string | null; fluxiaValor: number | null; diferenca: number | null;
}

interface FluxiaSemVinculo { fluxiaId: string; clientName: string; totalValue: number; status: string; createdAt: string; }

interface Summary {
  total_bling_bruto: number; total_cancelados: number;
  total_bling: number; total_fluxia: number; total_fluxia_com_vinculo: number;
  total_fluxia_sem_vinculo: number; ausentes_no_fluxia: number; deletados_no_fluxia: number;
  com_valor_divergente: number; ok: number; soma_bling: number; soma_fluxia_correspondentes: number;
}

interface CompareResponse {
  summary: Summary; problemas: CompareResult[]; ausentes: AusenteComCandidatos[];
  fluxia_sem_vinculo: FluxiaSemVinculo[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function detectSep(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  if (tabs >= semis && tabs >= commas) return '\t';
  if (semis >= commas) return ';';
  return ',';
}

function parseCSV(text: string): BlingRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = detectSep(lines[0]);
  const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['"]/g, '');
  const headers = lines[0].split(sep).map(norm);
  const iNum = Math.max(0, headers.findIndex(h => h.includes('pedido') || h === 'numero' || h.startsWith('n')));
  const iDate = headers.findIndex(h => h.includes('data') || h.includes('emiss'));
  const iClient = headers.findIndex(h => h.includes('cliente') || h.includes('nome') || h.includes('razao'));
  const iSit = headers.findIndex(h => h.includes('situa') || h.includes('status'));
  const iVal = headers.findIndex(h => (h.includes('valor') || h.includes('total')) && !h.includes('custo'));
  const rows: BlingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const numero = parseInt(cols[iNum] ?? '', 10);
    if (isNaN(numero)) continue;
    const valorRaw = (cols[iVal >= 0 ? iVal : 4] ?? '0').replace(/\./g, '').replace(',', '.');
    rows.push({
      numero,
      data: cols[iDate >= 0 ? iDate : 1] ?? '',
      cliente: cols[iClient >= 0 ? iClient : 2] ?? '',
      situacao: cols[iSit >= 0 ? iSit : 3] ?? '',
      valor: parseFloat(valorRaw) || 0,
    });
  }
  return rows;
}

function linkTypeBadge(lt: LinkType | null) {
  if (lt === 'invoiceLinked') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">NF</span>;
  if (lt === 'noInvoiceLinked') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">Pedido</span>;
  return null;
}

function scoreBadge(score: number) {
  if (score >= 80) return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-medium">{score}%</span>;
  if (score >= 50) return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">{score}%</span>;
  return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">{score}%</span>;
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CompararBlingPage() {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<BlingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [populando, setPopulando] = useState(false);
  const [populandoMsg, setPopulandoMsg] = useState('');
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'comparar' | 'sincronizar'>('comparar');
  const [filterProblemas, setFilterProblemas] = useState<'todos' | 'ausente' | 'divergente' | 'deletado'>('todos');
  const [vinculados, setVinculados] = useState<Record<number, string>>({});
  const [vinculandoId, setVinculandoId] = useState<number | null>(null);
  const [sincronizandoId, setSincronizandoId] = useState<string | null>(null);
  const [sincronizados, setSincronizados] = useState<Record<string, number>>({});  // fluxiaId → novo valor
  const [buscaManual, setBuscaManual] = useState<Record<number, string>>({});
  const [expandido, setExpandido] = useState<number | null>(null);

  function handleParse() {
    const rows = parseCSV(csvText);
    setParsed(rows);
    setResult(null);
    setVinculados({});
    setSincronizados({});
    setError(rows.length === 0 ? 'Nenhum pedido encontrado. Verifique o formato.' : '');
  }

  async function handleCompare() {
    if (parsed.length === 0) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/financeiro/compare-bling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro');
      setResult(data);
      setActiveTab('comparar');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handlePopularNumeros() {
    setPopulando(true); setPopulandoMsg('Buscando números no Bling...');
    try {
      const res = await fetch('/api/financeiro/populate-bling-numero', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro');
      setPopulandoMsg(`✓ ${data.atualizados} pedidos atualizados. Clique em "Comparar" novamente.`);
    } catch (e: any) { setPopulandoMsg(`Erro: ${e.message}`); }
    finally { setPopulando(false); }
  }

  async function sincronizarValor(fluxiaId: string, blingValor: number, blingNumero: number) {
    setSincronizandoId(fluxiaId);
    try {
      const res = await fetch('/api/financeiro/sincronizar-valor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fluxiaId, blingValor, blingNumero }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro');
      setSincronizados(prev => ({ ...prev, [fluxiaId]: blingValor }));
    } catch (e: any) { alert(`Erro ao sincronizar: ${e.message}`); }
    finally { setSincronizandoId(null); }
  }

  async function vincular(blingNumero: number, blingData: string, blingValor: number, blingCliente: string, blingSituacao: string, fluxiaId: string) {
    setVinculandoId(blingNumero);
    try {
      const res = await fetch('/api/financeiro/vincular-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fluxiaId, blingNumero, blingValor, blingData, blingCliente }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro');
      setVinculados(prev => ({ ...prev, [blingNumero]: fluxiaId }));
    } catch (e: any) { alert(`Erro ao vincular: ${e.message}`); }
    finally { setVinculandoId(null); }
  }

  function downloadCSV() {
    if (!result) return;
    const header = 'Nº Bling;Data;Cliente;Situação;Valor Bling;Tipo Vínculo;Status;Status Fluxia;Valor Fluxia;Diferença\n';
    const rows = result.problemas.map(r =>
      [r.blingNumero, r.blingData, r.blingCliente, r.blingSituacao, r.blingValor, r.linkType ?? '', r.status, r.fluxiaStatus ?? '', r.fluxiaValor ?? '', r.diferenca ?? ''].join(';')
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'divergencias-bling-fluxia.csv';
    a.click();
  }

  const filteredProblemas = result?.problemas.filter(r => {
    if (filterProblemas === 'todos') return true;
    if (filterProblemas === 'ausente') return r.status === 'AUSENTE_NO_FLUXIA';
    if (filterProblemas === 'divergente') return r.status === 'VALOR_DIVERGENTE';
    if (filterProblemas === 'deletado') return r.status === 'DELETADO_NO_FLUXIA';
    return true;
  }) ?? [];

  const ausentesRestantes = useMemo(
    () => (result?.ausentes ?? []).filter(a => !vinculados[a.blingNumero]),
    [result, vinculados]
  );

  const divergentesRestantes = useMemo(
    () => (result?.problemas ?? []).filter(r => r.status === 'VALOR_DIVERGENTE' && r.fluxiaId && !sincronizados[r.fluxiaId]),
    [result, sincronizados]
  );

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bling × Fluxia</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Exporte os pedidos do Bling (Vendas → Pedidos → Exportar CSV), cole abaixo e compare.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handlePopularNumeros} disabled={populando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50">
            <RefreshCw size={12} className={populando ? 'animate-spin' : ''} />
            {populando ? 'Buscando...' : 'Preencher nº de pedidos (1x)'}
          </button>
          {populandoMsg && <p className="text-xs text-gray-500 max-w-xs text-right">{populandoMsg}</p>}
        </div>
      </div>

      {/* Input CSV */}
      <div className="space-y-3">
        <textarea value={csvText} onChange={e => { setCsvText(e.target.value); setParsed([]); setResult(null); }}
          placeholder={'Nº do pedido\tData\tCliente\tSituação\tValor\n1542\t01/01/2026\tCLIENTE A\tAtendido\t500,00'}
          className="w-full h-36 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono resize-y text-gray-800 dark:text-gray-200" />
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={handleParse} disabled={!csvText.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Processar CSV
          </button>
          {parsed.length > 0 && (
            <button onClick={handleCompare} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              <Search size={15} />
              {loading ? 'Comparando...' : `Comparar ${parsed.length} pedidos`}
            </button>
          )}
        </div>
        {parsed.length > 0 && !result && (
          <div className="text-xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800"><tr>
                {['Nº', 'Data', 'Cliente', 'Situação', 'Valor'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {parsed.slice(0, 4).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1 font-mono">{r.numero}</td>
                    <td className="px-3 py-1">{r.data}</td>
                    <td className="px-3 py-1 max-w-[200px] truncate">{r.cliente}</td>
                    <td className="px-3 py-1">{r.situacao}</td>
                    <td className="px-3 py-1 font-mono">{fmt(r.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-emerald-600 dark:text-emerald-400 font-medium">{parsed.length} pedidos lidos. Clique em "Comparar".</p>
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Resultado */}
      {result && (
        <>
          {result.summary.total_cancelados > 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              ⚠ {result.summary.total_cancelados} pedido(s) com status <strong>Cancelado</strong> ignorados —
              {' '}analisando {result.summary.total_bling} de {result.summary.total_bling_bruto} pedidos do Bling.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <KPI label="Bling (ativos)" value={result.summary.total_bling} color="blue" />
            <KPI label="OK" value={result.summary.ok} color="emerald" />
            <KPI label="Divergentes" value={result.summary.com_valor_divergente} color="orange" />
            <KPI label="Ausentes" value={result.summary.ausentes_no_fluxia} color="red" />
            <KPI label="Vinculados" value={Object.keys(vinculados).length} color="purple" />
            <KPI label="Sincronizados" value={Object.keys(sincronizados).length} color="emerald" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p className="text-xs text-gray-500 mb-0.5">Soma Bling</p>
              <p className="font-bold text-gray-900 dark:text-white text-lg">{fmt(result.summary.soma_bling)}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p className="text-xs text-gray-500 mb-0.5">Soma Fluxia (correspondentes)</p>
              <p className="font-bold text-gray-900 dark:text-white text-lg">{fmt(result.summary.soma_fluxia_correspondentes)}</p>
              <p className="text-xs text-gray-400">Δ {fmt(Math.abs(result.summary.soma_bling - result.summary.soma_fluxia_correspondentes))}</p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
            {(['comparar', 'sincronizar'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {tab === 'comparar'
                  ? `Comparação (${result.problemas.length} problemas)`
                  : `Ausentes (${ausentesRestantes.length} restantes)`}
              </button>
            ))}
          </div>

          {/* ABA: COMPARAR */}
          {activeTab === 'comparar' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(['todos', 'ausente', 'divergente', 'deletado'] as const).map(f => (
                  <button key={f} onClick={() => setFilterProblemas(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterProblemas === f
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                        : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                    }`}>
                    {f === 'todos' ? `Todos (${result.problemas.length})` :
                     f === 'ausente' ? `Ausentes (${result.summary.ausentes_no_fluxia})` :
                     f === 'divergente' ? `Divergentes (${result.summary.com_valor_divergente})` :
                     `Deletados (${result.summary.deletados_no_fluxia})`}
                  </button>
                ))}

                {/* Botão sincronizar todos divergentes */}
                {divergentesRestantes.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Sincronizar ${divergentesRestantes.length} pedidos divergentes com os valores do Bling?`)) return;
                      for (const r of divergentesRestantes) {
                        if (r.fluxiaId) await sincronizarValor(r.fluxiaId, r.blingValor, r.blingNumero);
                      }
                    }}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-600 text-white hover:bg-orange-700">
                    <Zap size={11} /> Sincronizar todos ({divergentesRestantes.length})
                  </button>
                )}

                <button onClick={downloadCSV} className={`${divergentesRestantes.length > 0 ? '' : 'ml-auto'} flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-500`}>
                  <Download size={11} /> CSV
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
                    <tr>
                      {['Nº', 'Data', 'Cliente', 'Valor Bling', 'Vínculo', 'Status', 'Valor Fluxia', 'Δ', ''].map(h =>
                        <th key={h} className="px-3 py-2.5 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredProblemas.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhum resultado</td></tr>}
                    {filteredProblemas.map((r, i) => {
                      const jaSincronizado = r.fluxiaId ? sincronizados[r.fluxiaId] != null : false;
                      return (
                        <tr key={i} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${jaSincronizado ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2 font-mono font-medium text-gray-900 dark:text-white">{r.blingNumero}</td>
                          <td className="px-3 py-2 text-gray-500">{r.blingData}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{r.blingCliente}</td>
                          <td className="px-3 py-2 font-mono text-right text-gray-900 dark:text-white">{fmt(r.blingValor)}</td>
                          <td className="px-3 py-2">{linkTypeBadge(r.linkType)}</td>
                          <td className="px-3 py-2"><StatusBadge status={jaSincronizado ? 'OK' : r.status} /></td>
                          <td className="px-3 py-2 font-mono text-right">
                            {jaSincronizado
                              ? <span className="text-emerald-600 dark:text-emerald-400">{fmt(sincronizados[r.fluxiaId!])}</span>
                              : (r.fluxiaValor != null ? fmt(r.fluxiaValor) : '—')}
                          </td>
                          <td className="px-3 py-2 font-mono text-right text-red-500">{!jaSincronizado && r.diferenca != null ? fmt(r.diferenca) : '—'}</td>
                          <td className="px-3 py-2">
                            {r.status === 'VALOR_DIVERGENTE' && r.fluxiaId && !jaSincronizado && (
                              <button
                                onClick={() => sincronizarValor(r.fluxiaId!, r.blingValor, r.blingNumero)}
                                disabled={sincronizandoId === r.fluxiaId}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 disabled:opacity-50 whitespace-nowrap">
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
            </div>
          )}

          {/* ABA: AUSENTES/VINCULAR */}
          {activeTab === 'sincronizar' && (
            <SincronizarTab
              ausentes={result.ausentes}
              fluxiaSemVinculo={result.fluxia_sem_vinculo}
              vinculados={vinculados}
              vinculandoId={vinculandoId}
              buscaManual={buscaManual}
              setBuscaManual={setBuscaManual}
              expandido={expandido}
              setExpandido={setExpandido}
              onVincular={vincular}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Aba Ausentes ─────────────────────────────────────────────────────────────

interface SincronizarTabProps {
  ausentes: AusenteComCandidatos[];
  fluxiaSemVinculo: FluxiaSemVinculo[];
  vinculados: Record<number, string>;
  vinculandoId: number | null;
  buscaManual: Record<number, string>;
  setBuscaManual: (v: Record<number, string>) => void;
  expandido: number | null;
  setExpandido: (v: number | null) => void;
  onVincular: (blingNumero: number, blingData: string, blingValor: number, blingCliente: string, blingSituacao: string, fluxiaId: string) => void;
}

function SincronizarTab({ ausentes, fluxiaSemVinculo, vinculados, vinculandoId, buscaManual, setBuscaManual, expandido, setExpandido, onVincular }: SincronizarTabProps) {
  const restantes = ausentes.filter(a => !vinculados[a.blingNumero]);
  const concluidos = ausentes.filter(a => vinculados[a.blingNumero]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {restantes.length} pedidos do Bling sem correspondente vinculado no Fluxia
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Sugestões calculadas por nome + valor. Use a busca manual para encontrar outros candidatos.
          </p>
        </div>
        {concluidos.length > 0 && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ {concluidos.length} vinculados nesta sessão
          </span>
        )}
      </div>

      <div className="space-y-2">
        {restantes.map(a => {
          const busca = (buscaManual[a.blingNumero] ?? '').toLowerCase();
          const candidatosFiltrados = busca
            ? fluxiaSemVinculo.filter(f =>
                f.clientName.toLowerCase().includes(busca) ||
                String(f.totalValue).includes(busca)
              ).slice(0, 6)
            : a.candidatos;

          const isExpanded = expandido === a.blingNumero;

          return (
            <div key={a.blingNumero} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div
                onClick={() => setExpandido(isExpanded ? null : a.blingNumero)}
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">#{a.blingNumero}</span>
                    <span className="text-xs text-gray-500">{a.blingData}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{a.blingSituacao}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate mt-0.5">{a.blingCliente}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-gray-900 dark:text-white">{fmt(a.blingValor)}</p>
                  <p className="text-xs text-gray-400">{a.candidatos.length} sugestão(ões)</p>
                </div>
                <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div className="px-4 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Search size={13} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou valor no Fluxia..."
                      value={buscaManual[a.blingNumero] ?? ''}
                      onChange={e => setBuscaManual({ ...buscaManual, [a.blingNumero]: e.target.value })}
                      className="flex-1 text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:border-blue-400"
                      onClick={e => e.stopPropagation()}
                    />
                    {buscaManual[a.blingNumero] && (
                      <button onClick={e => { e.stopPropagation(); setBuscaManual({ ...buscaManual, [a.blingNumero]: '' }); }}
                        className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    )}
                  </div>

                  {candidatosFiltrados.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">
                      {busca ? 'Nenhum pedido encontrado com esse critério.' : 'Nenhuma sugestão automática. Use a busca acima.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {candidatosFiltrados.map((c: any) => (
                        <div key={c.fluxiaId}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{c.clientName}</p>
                              {c.score != null && scoreBadge(c.score)}
                              {c.jaVinculado && <span className="text-xs text-amber-500">já vinculado</span>}
                            </div>
                            <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                              <span>{c.status}</span>
                              <span>{c.createdAt}</span>
                              <span className="font-mono">{fmt(c.totalValue ?? 0)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => onVincular(a.blingNumero, a.blingData, a.blingValor, a.blingCliente, a.blingSituacao, c.fluxiaId)}
                            disabled={vinculandoId === a.blingNumero}
                            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                            <Link size={11} />
                            {vinculandoId === a.blingNumero ? '...' : 'Vincular'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-1 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                    <a href={`/importar-bling?pedido=${a.blingNumero}`} target="_blank"
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <Plus size={11} /> Criar como novo pedido no Fluxia
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {restantes.length === 0 && (
          <div className="text-center py-10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={32} className="mx-auto mb-2" />
            <p className="font-medium">Todos os pedidos foram vinculados!</p>
          </div>
        )}
      </div>

      {concluidos.length > 0 && (
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-600">▶ {concluidos.length} vinculados nesta sessão</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {concluidos.map(a => (
              <li key={a.blingNumero} className="text-emerald-600 dark:text-emerald-400">
                ✓ #{a.blingNumero} {a.blingCliente} → Fluxia {vinculados[a.blingNumero]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Componentes menores ───────────────────────────────────────────────────────

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  const c: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
  };
  return (
    <div className={`rounded-lg p-3 ${c[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'OK') return <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs"><CheckCircle size={12} /> OK</span>;
  if (status === 'AUSENTE_NO_FLUXIA') return <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs"><XCircle size={12} /> Ausente</span>;
  if (status === 'DELETADO_NO_FLUXIA') return <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs"><AlertTriangle size={12} /> Deletado</span>;
  if (status === 'VALOR_DIVERGENTE') return <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs"><AlertTriangle size={12} /> Divergente</span>;
  return <span className="text-xs">{status}</span>;
}
