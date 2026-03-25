'use client';

import React, { useState } from 'react';
import { parseWhatsAppOrder } from '@/lib/parser';
import { parseOrderWithGemini } from '@/lib/gemini';
import { Order } from '@/lib/types';
import { Plus, X, ClipboardPaste, Loader2, Sparkles } from 'lucide-react';

interface OrderFormProps {
  onOrderCreated: (order: Order) => void;
  onClose: () => void;
}

export default function OrderForm({ onOrderCreated, onClose }: OrderFormProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Por favor, cole as informações do pedido.');
      return;
    }

    setIsParsing(true);
    setError('');

    try {
      // Try Gemini first for high accuracy
      let parsedData = await parseOrderWithGemini(text);
      
      // Fallback to local parser if Gemini fails or returns incomplete data
      if (!parsedData || !parsedData.orders || parsedData.orders.length === 0) {
        console.log("Gemini parsing failed or incomplete, falling back to local parser");
        const localResult = parseWhatsAppOrder(text);
        parsedData = { orders: [localResult] };
      }
      
      let validOrdersCount = 0;

      for (const rawOrderData of parsedData.orders) {
        if (!rawOrderData.clientName || !rawOrderData.products || rawOrderData.products.length === 0) {
          console.warn('Skipping invalid order:', rawOrderData);
          continue;
        }

        validOrdersCount++;

        const newOrder: Order = {
          id: Math.random().toString(36).substring(2, 9),
          clientName: rawOrderData.clientName!,
          cnpj: rawOrderData.cnpj || '',
          cpf: rawOrderData.cpf || '',
          phone: rawOrderData.phone || '',
          address: rawOrderData.address || '',
          number: rawOrderData.number || '',
          complement: rawOrderData.complement || '',
          addressDetails: rawOrderData.addressDetails || {
            street: rawOrderData.address || '',
            number: rawOrderData.number || '',
            complement: rawOrderData.complement || '',
            district: '',
            city: '',
            state: '',
            zip: rawOrderData.cep || ''
          },
          isSample: rawOrderData.isSample || false,
          products: rawOrderData.products.map((p: any) => ({
            ...p,
            id: p.id || Math.random().toString(36).substring(2, 9),
            checked: false
          })),
          status: 'pedidos',
          hasInvoice: false,
          hasBoleto: false,
          hasOrderDocument: false,
          createdAt: new Date().toISOString(),
        };

        onOrderCreated(newOrder);
      }

      if (validOrdersCount === 0) {
        setError('Não foi possível identificar pedidos válidos. Verifique o formato do texto.');
        setIsParsing(false);
        return;
      }

      onClose();
    } catch (err) {
      console.error("Error parsing order:", err);
      setError('Ocorreu um erro ao processar o pedido. Tente novamente.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Novo Pedido</h2>
            <p className="text-sm text-slate-500">Cole a mensagem do WhatsApp abaixo</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="size-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <ClipboardPaste className="size-4" />
              Entrada de Texto
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError('');
              }}
              placeholder="Exemplo:&#10;Lucas&#10;16795729000131&#10;Rua ulisses 36, 301, Buritis, Belo Horizonte MG&#10;&#10;13 Catuaí 250g&#10;25 Gourmet 1Kg grãos&#10;8 DripCoffee"
              className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
            />
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isParsing}
              className="flex-[2] px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isParsing ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="size-5" />
                  Criar Pedido com IA
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
