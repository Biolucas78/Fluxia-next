'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Package, Truck, AlertCircle, CheckCircle2, Loader2, RefreshCw, MapPin } from 'lucide-react';

export default function ShippingTest() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [sender, setSender] = useState<'BH' | 'CRV'>('BH');
  const [destinationCep, setDestinationCep] = useState('01310-930');

  const checkConfig = async () => {
    try {
      const res = await fetch('/api/shipping/quote');
      if (!res.ok) {
        console.error('Error checking config: Server returned', res.status);
        return;
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Error checking config: Expected JSON but got', contentType);
        return;
      }
      const data = await res.json();
      setConfig(data.config);
    } catch (e) {
      console.error('Error checking config:', e);
    }
  };

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    
    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep: destinationCep,
          weight: 1000, // 1kg
          boxDimensions: { width: 20, height: 15, length: 25 },
          originType: sender
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao calcular frete');
      }

      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    checkConfig();
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <Truck className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Teste de Integração de Frete</h3>
            <p className="text-sm text-slate-500">Cotação rápida antes de inserir o pedido</p>
          </div>
        </div>
        <button 
          onClick={runTest}
          disabled={loading || !destinationCep}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {loading ? 'Calculando...' : 'Cotar Frete'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Remetente (Origem)</label>
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSender('BH')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                sender === 'BH' 
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Belo Horizonte (BH)
            </button>
            <button
              onClick={() => setSender('CRV')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                sender === 'CRV' 
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Conceição do Rio Verde (CRV)
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CEP de Destino</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input 
              type="text"
              value={destinationCep}
              onChange={(e) => setDestinationCep(e.target.value)}
              placeholder="00000-000"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            />
          </div>
        </div>
      </div>

      {config && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Melhor Envio</p>
            <div className="flex items-center gap-1.5">
              {config.hasMelhorEnvio ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertCircle className="size-3 text-amber-500" />}
              <span className="text-xs font-bold">{config.hasMelhorEnvio ? 'Configurado' : 'Pendente'}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Correios (Contrato)</p>
            <div className="flex items-center gap-1.5">
              {config.hasCorreios ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertCircle className="size-3 text-amber-500" />}
              <span className="text-xs font-bold">{config.hasCorreios ? 'Configurado' : 'Pendente'}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Superfrete</p>
            <div className="flex items-center gap-1.5">
              {config.hasSuperfrete ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertCircle className="size-3 text-amber-500" />}
              <span className="text-xs font-bold">{config.hasSuperfrete ? 'Configurado' : 'Pendente'}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CEP Origem</p>
            <div className="flex items-center gap-1.5">
              {config.hasOriginCep ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertCircle className="size-3 text-red-500" />}
              <span className="text-xs font-bold">{config.originCep || 'Não definido'}</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 flex items-start gap-3">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800 dark:text-red-300">Erro na Cotação</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resultados da Cotação (Destino: 01310-930, 1kg)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((quote, idx) => (
              <div key={idx} className={`flex flex-col p-4 rounded-xl border ${quote.error ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-white dark:bg-slate-700 p-1 border border-slate-100 dark:border-slate-600 flex items-center justify-center relative overflow-hidden">
                      {quote.company?.picture ? (
                        <Image 
                          src={quote.company.picture} 
                          alt={quote.company.name} 
                          fill
                          className="object-contain p-1"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Truck className="size-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{quote.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{quote.provider}</p>
                    </div>
                  </div>
                  {!quote.error && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">R$ {quote.price.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{quote.delivery_time} dias</p>
                    </div>
                  )}
                </div>
                {quote.error && (
                  <div className="mt-1 p-2 rounded bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed font-medium">
                      {quote.error}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <p className="text-sm text-slate-500 italic text-center py-4">Nenhuma cotação retornada pelos provedores ativos.</p>
          )}
        </div>
      )}
    </div>
  );
}
