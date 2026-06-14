'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  Loader2,
  PackagePlus,
  RefreshCw,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  User,
} from 'lucide-react';

interface BlingOrderSummary {
  blingId: number;
  blingNumero: string;
  cliente: string;
  valor: number;
  origem?: string;
  temNF: boolean;
  produtos: number;
  updates?: string[];
  matchType?: string;
  fluxiaId?: string;
  error?: string;
}

interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  periodo: { dataInicial: string; dataFinal: string };
  resumo: {
    blingTotal: number;
    blingCancelados: number;
    blingAtivos: number;
    fluxiaTotal: number;
    matched: number;
    criados: number;
    atualizados: number;
    erros: number;
  };
  matched: BlingOrderSummary[];
  criados: BlingOrderSummary[];
  erros: BlingOrderSummary[];
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CollapseSection({
  title,
  count,
  color,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count <= 20);
  if (count === 0) return null;
  return (
    <div className={`border rounded-xl overflow-hidden ${color}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-sm"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title} ({count})
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="divide-y divide-white/10 max-h-96 overflow-y-auto">{children}</div>}
    </div>
  );
}

export default function ImportarBlingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [dataInicial, setDataInicial] = useState('2025-02-01');
  const [dataFinal, setDataFinal] = useState('2025-02-28');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setAuthed(true);
      } else {
        router.push('/');
      }
      setChecking(false);
    });
    return unsub;
  }, [router]);

  async function runImport(dryRun: boolean) {
    dryRun ? setLoading(true) : setConfirming(true);
    setError('');
    if (!dryRun) setDone(false);

    try {
      const res = await fetch('/api/bling/importar-pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // apenasNovos:true garante que NENHUM pedido existente no Fluxia será alterado.
        // Apenas blingOrderId é usado como deduplicação (evitar re-importar o mesmo pedido).
        body: JSON.stringify({ dataInicial, dataFinal, dryRun, apenasNovos: true }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erro desconhecido');
      setResult(data);
      if (!dryRun) setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      dryRun ? setLoading(false) : setConfirming(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!authed) return null;

  const simulated = result?.dryRun;
  const hasDryRun = result && result.dryRun;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold">Importar Pedidos do Bling</h1>
          </div>
          <p className="text-gray-400 text-sm ml-13 pl-1">
            Busca pedidos do Bling para um período e cria cards no Kanban (fase Entregues) sem duplicar os que já existem.
          </p>
        </div>

        {/* Config Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-sm text-gray-300 mb-4">Período de importação</h2>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Data inicial</label>
              <input
                type="date"
                value={dataInicial}
                onChange={e => { setDataInicial(e.target.value); setResult(null); setDone(false); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Data final</label>
              <input
                type="date"
                value={dataFinal}
                onChange={e => { setDataFinal(e.target.value); setResult(null); setDone(false); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Info box */}
          <div className="bg-green-950/40 border border-green-800/50 rounded-lg px-4 py-3 text-xs text-green-300 mb-3 space-y-1">
            <p className="font-semibold text-green-200">Modo seguro ativo — pedidos existentes no Fluxia não serão alterados.</p>
            <p>• Nenhum pedido já existente será tocado (notas, boletos e dados permanecem intactos).</p>
            <p>• Apenas <strong>blingOrderId</strong> é checado: se o mesmo pedido Bling já foi importado antes, é ignorado. Caso contrário, é criado como novo.</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-xs text-gray-400 mb-5 space-y-1">
            <p>• Pedidos <strong>cancelados</strong> no Bling são ignorados.</p>
            <p>• Novos pedidos chegam como <strong>Entregues</strong> no Kanban, computados no Dashboard e Financeiro.</p>
            <p>• Nota fiscal vinculada automaticamente quando disponível no Bling.</p>
            <p>• Boleto Sicoob vinculado automaticamente quando <code className="bg-gray-700 px-1 rounded">seuNumero</code> coincide com número da NF.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => runImport(true)}
              disabled={loading || confirming}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Simular (sem salvar)
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={loading || confirming || !hasDryRun}
              title={!hasDryRun ? 'Simule primeiro para habilitar' : ''}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors ${
                hasDryRun
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              } disabled:opacity-50`}
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Confirmar e Importar
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-950/50 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Success done */}
        {done && !result?.dryRun && (
          <div className="flex items-center gap-2 bg-green-950/50 border border-green-800 rounded-xl px-4 py-3 text-green-300 text-sm mb-6">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Importação concluída! Os pedidos já estão no Kanban em fase Entregues.
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5">
            {/* Summary banner */}
            <div className={`border rounded-2xl p-5 ${simulated ? 'bg-yellow-950/30 border-yellow-800/40' : 'bg-green-950/30 border-green-800/40'}`}>
              <div className="flex items-center gap-2 mb-3">
                {simulated
                  ? <AlertCircle className="w-4 h-4 text-yellow-400" />
                  : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                <span className="font-semibold text-sm">
                  {simulated ? 'Simulação — nenhum dado foi salvo' : 'Importação realizada'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Bling (ativos)', value: result.resumo.blingAtivos },
                  { label: 'Novos a criar', value: result.resumo.criados, highlight: true },
                  { label: 'Já importados (ignorados)', value: result.resumo.matched },
                  { label: 'Erros', value: result.resumo.erros, warn: result.resumo.erros > 0 },
                ].map(({ label, value, highlight, warn }) => (
                  <div key={label} className={`rounded-xl px-3 py-2 text-center ${highlight ? 'bg-indigo-500/20' : warn && value > 0 ? 'bg-red-500/20' : 'bg-white/5'}`}>
                    <div className={`text-2xl font-bold ${highlight ? 'text-indigo-300' : warn && value > 0 ? 'text-red-300' : 'text-white'}`}>{value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* New orders */}
            <CollapseSection
              title="Novos pedidos a criar"
              count={result.criados.length}
              color="bg-indigo-950/30 border-indigo-800/40 text-indigo-200"
              icon={PackagePlus}
            >
              {result.criados.map((o, i) => (
                <div key={i} className="px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-gray-400 shrink-0">#{o.blingNumero}</span>
                  <span className="font-medium flex-1">{o.cliente}</span>
                  <span className="text-indigo-300">{fmt(o.valor)}</span>
                  <span className="text-gray-500">{o.origem || '—'}</span>
                  {o.temNF && (
                    <span className="inline-flex items-center gap-1 bg-green-900/40 text-green-300 px-1.5 py-0.5 rounded text-xs">
                      <FileText className="w-3 h-3" /> NF
                    </span>
                  )}
                  <span className="text-gray-500">{o.produtos} prod.</span>
                </div>
              ))}
            </CollapseSection>

            {/* Matched — com apenasNovos só aparecem por blingOrderId (re-importação) */}
            <CollapseSection
              title="Já importados antes — serão ignorados"
              count={result.matched.length}
              color="bg-gray-800/50 border-gray-700 text-gray-400"
              icon={User}
            >
              {result.matched.map((o, i) => (
                <div key={i} className="px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-gray-500 shrink-0">#{o.blingNumero}</span>
                  <span className="font-medium flex-1">{o.cliente}</span>
                  <span className="text-gray-400">{fmt(o.valor)}</span>
                  <span className="text-gray-600 text-xs italic">já importado (blingOrderId)</span>
                </div>
              ))}
            </CollapseSection>

            {/* Errors */}
            <CollapseSection
              title="Erros"
              count={result.erros.length}
              color="bg-red-950/30 border-red-800/40 text-red-200"
              icon={XCircle}
            >
              {result.erros.map((o, i) => (
                <div key={i} className="px-4 py-2 text-xs flex items-center gap-3">
                  <span className="text-gray-500 shrink-0">Bling #{o.blingId}</span>
                  <span className="text-red-300">{o.error}</span>
                </div>
              ))}
            </CollapseSection>

            {/* Confirm CTA after dry run */}
            {simulated && result.resumo.criados > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 text-sm text-gray-300">
                  Tudo certo? Clique em <strong className="text-white">Confirmar e Importar</strong> acima para salvar os {result.resumo.criados} novos pedidos no Kanban.
                </div>
                <button
                  onClick={() => runImport(false)}
                  disabled={confirming}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  Confirmar e Importar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
