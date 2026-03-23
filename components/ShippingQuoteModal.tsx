'use client';

import React from 'react';
import { ShippingOption } from '@/lib/types';
import { X, Truck, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface ShippingQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotes: ShippingOption[];
  onSelect: (quote: ShippingOption) => void;
  isQuoting: boolean;
  selectedQuote?: ShippingOption | null;
  onGenerateLabel?: () => void;
  isGeneratingLabel?: boolean;
}

export default function ShippingQuoteModal({ 
  isOpen, 
  onClose, 
  quotes, 
  onSelect, 
  isQuoting,
  selectedQuote,
  onGenerateLabel,
  isGeneratingLabel
}: ShippingQuoteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl p-6 shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cotação de Frete</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-6" />
          </button>
        </div>

        {isQuoting ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="size-10 animate-spin text-primary mb-4" />
            <p className="text-sm text-slate-500 font-medium">Buscando melhores opções de frete...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto custom-scrollbar pr-2 flex-1">
              {quotes.map((quote, idx) => {
                const isSelected = selectedQuote?.id === quote.id;
                return (
                  <button
                    key={`${quote.provider}-${quote.id}-${idx}`}
                    onClick={() => onSelect(quote)}
                    disabled={!!quote.error}
                    className={`w-full flex flex-col p-4 rounded-xl border transition-all text-left ${
                      quote.error 
                        ? 'border-slate-100 dark:border-slate-800 opacity-60 cursor-not-allowed' 
                        : isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-slate-100 dark:border-slate-800 hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/5 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-white dark:bg-slate-800 p-1.5 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0 relative overflow-hidden">
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
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{quote.name}</p>
                            {isSelected && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-primary text-white rounded font-bold uppercase tracking-wider">
                                Selecionado
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{quote.provider}</p>
                        </div>
                      </div>
                    </div>
                    
                    {!quote.error && (
                      <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end w-full">
                        <p className="text-lg font-black text-primary">R$ {quote.price.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500 font-bold">{quote.delivery_time} dias</p>
                      </div>
                    )}
                    {quote.error && (
                      <p className="text-[10px] text-amber-600 font-medium mt-1">{quote.error}</p>
                    )}
                  </button>
                );
              })}

              {quotes.length === 0 && (
                <div className="col-span-full py-12 text-center">
                  <p className="text-sm text-slate-500 italic">Nenhuma opção de frete disponível para este destino.</p>
                </div>
              )}
            </div>

            {quotes.length > 0 && onGenerateLabel && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={onGenerateLabel}
                  disabled={!selectedQuote || isGeneratingLabel}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                    !selectedQuote || isGeneratingLabel
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
                  }`}
                >
                  {isGeneratingLabel ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Gerando Etiqueta...
                    </>
                  ) : (
                    <>
                      <Truck className="size-5" />
                      Gerar Etiqueta
                    </>
                  )}
                </button>
                {!selectedQuote && (
                  <p className="text-[10px] text-slate-400 text-center mt-2 uppercase font-bold tracking-widest">Selecione uma opção acima para gerar a etiqueta</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
