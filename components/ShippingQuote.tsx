'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Truck, Loader2, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { ShippingOption, Order } from '@/lib/types';

interface ShippingQuoteProps {
  order: Order;
  onSelectOption?: (option: ShippingOption) => void;
  onClose?: () => void;
}

export default function ShippingQuote({ order, onSelectOption, onClose }: ShippingQuoteProps) {
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<ShippingOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    if (!order.address) {
      setError('Endereço do pedido não encontrado.');
      return;
    }

    // Extract CEP from address
    const cepMatch = order.address.match(/\d{5}-?\d{3}/);
    if (!cepMatch) {
      setError('CEP não encontrado no endereço do pedido.');
      return;
    }

    const destinationCep = cepMatch[0];
    
    // Calculate total weight
    const totalWeight = order.products.reduce((acc, p) => {
      const weightMatch = p.weight.match(/(\d+)(g|kg)/i);
      if (weightMatch) {
        const value = parseInt(weightMatch[1]);
        const unit = weightMatch[2].toLowerCase();
        return acc + (unit === 'kg' ? value * 1000 : value) * p.quantity;
      }
      return acc;
    }, 0);

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep,
          weight: totalWeight,
          boxDimensions: order.boxDimensions || { width: 20, height: 15, length: 25 },
          originType: order.originType,
          insuranceValue: order.insuranceValue || order.invoiceValue
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao calcular frete');
      }

      setQuotes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [order.address, order.products, order.boxDimensions, order.insuranceValue, order.invoiceValue, order.originType]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-w-2xl w-full">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <Truck className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cotação de Frete</h3>
            <p className="text-xs text-slate-500 font-medium">Pedido #{order.id.toUpperCase()} • {order.clientName}</p>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronRight className="size-6 rotate-90" />
          </button>
        )}
      </div>

      <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="size-8 text-primary animate-spin" />
            <p className="text-sm text-slate-500 font-medium animate-pulse">Buscando melhores opções de frete...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 flex items-start gap-3">
            <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800 dark:text-red-300">Não foi possível cotar o frete</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
              <button 
                onClick={fetchQuotes}
                className="mt-3 text-xs font-bold text-red-700 dark:text-red-400 underline hover:no-underline"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote, idx) => (
              <button
                key={`${quote.provider}-${quote.id}-${idx}`}
                onClick={() => onSelectOption?.(quote)}
                disabled={!!quote.error}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                  quote.error 
                    ? 'border-slate-100 dark:border-slate-800 opacity-60 cursor-not-allowed' 
                    : 'border-slate-100 dark:border-slate-800 hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/5 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-white dark:bg-slate-800 p-2 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0 relative overflow-hidden">
                    {quote.company?.picture ? (
                      <Image 
                        src={quote.company.picture} 
                        alt={quote.company.name} 
                        fill
                        className="object-contain p-2"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Truck className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{quote.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{quote.provider}</p>
                    {quote.error && (
                      <p className="text-[10px] text-amber-600 font-medium mt-0.5">{quote.error}</p>
                    )}
                  </div>
                </div>
                
                {!quote.error && (
                  <div className="text-right">
                    <p className="text-lg font-black text-primary">R$ {quote.price.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500 font-bold">{quote.delivery_time} dias úteis</p>
                  </div>
                )}
              </button>
            ))}

            {quotes.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500 italic">Nenhuma opção de frete disponível para este destino.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
        <button 
          onClick={onClose}
          className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
