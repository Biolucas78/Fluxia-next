'use client';

import React, { useState } from 'react';
import { X, MessageSquare, Loader2, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseOrderWithGemini } from '@/lib/gemini';
import { Order, OrderStatus, ProductItem } from '@/lib/types';

interface WhatsAppImportModalProps {
  onOrdersImported: (orders: Order[]) => void;
  onClose: () => void;
}

export default function WhatsAppImportModal({ onOrdersImported, onClose }: WhatsAppImportModalProps) {
  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedOrders, setParsedOrders] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    
    setIsParsing(true);
    setError(null);
    
    try {
      const result = await parseOrderWithGemini(text);
      if (result && result.orders && result.orders.length > 0) {
        setParsedOrders(result.orders);
      } else {
        setError('Não foi possível identificar pedidos no texto fornecido.');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Ocorreu um erro ao processar o texto. Tente novamente.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!parsedOrders) return;

    const newOrders: Order[] = parsedOrders.map(po => ({
      id: Math.random().toString(36).substr(2, 9),
      clientName: po.clientName,
      cnpj: po.cnpj,
      cpf: po.cpf,
      phone: po.phone,
      address: po.address || '',
      number: po.number || '',
      complement: po.complement || '',
      addressDetails: po.addressDetails || (po.cep ? undefined : {
        street: po.address || '',
        number: po.number || '',
        complement: po.complement || '',
        district: '',
        city: '',
        state: '',
        zip: po.cep || ''
      }),
      isSample: po.isSample || false,
      status: 'pedidos' as OrderStatus,
      hasInvoice: false,
      hasBoleto: false,
      hasOrderDocument: false,
      createdAt: new Date().toISOString(),
      products: po.products.map((p: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        quantity: p.quantity,
        name: p.name,
        weight: p.weight,
        grindType: p.grindType as any,
        productionNotes: p.productionNotes,
        checked: false
      }))
    }));

    onOrdersImported(newOrders);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <MessageSquare className="size-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Importar do WhatsApp</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Cole as mensagens do grupo abaixo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X className="size-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {!parsedOrders ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                  Copie as mensagens de pedidos do seu WhatsApp e cole no campo abaixo. A IA irá identificar automaticamente os clientes, produtos e quantidades.
                </p>
              </div>
              
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ex: 
João Silva: 10 pacotes Bourbon moído
Maria Oliveira: 5 pacotes Catuaí em grãos 500g"
                className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none"
              />

              {error && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                  <AlertCircle className="size-4" />
                  <p className="text-xs font-bold">{error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">Pedidos Identificados ({parsedOrders.length})</h3>
                <button 
                  onClick={() => setParsedOrders(null)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Limpar e colar novamente
                </button>
              </div>
              
              <div className="space-y-3">
                {parsedOrders.map((order, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{order.clientName}</span>
                        {(order.cnpj || order.cpf) && (
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                            Cliente Identificado
                          </span>
                        )}
                      </div>
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    </div>
                    <div className="space-y-1 mb-2">
                      {order.products.map((p: any, pIdx: number) => (
                        <div key={pIdx} className="flex items-center gap-2 text-xs text-slate-500">
                          <Package className="size-3" />
                          <span>{p.quantity}x {p.name} ({p.weight}, {p.grindType})</span>
                        </div>
                      ))}
                    </div>
                    
                    {(order.cpf || order.cnpj || order.phone || order.cep) && (
                      <div className="pt-2 pb-2 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                        {order.cpf && <div><span className="font-bold text-slate-400">CPF:</span> {order.cpf}</div>}
                        {order.cnpj && <div><span className="font-bold text-slate-400">CNPJ:</span> {order.cnpj}</div>}
                        {order.phone && <div><span className="font-bold text-slate-400">TEL:</span> {order.phone}</div>}
                        {order.cep && <div><span className="font-bold text-slate-400">CEP:</span> {order.cep}</div>}
                      </div>
                    )}
                    
                    {order.addressDetails?.warning && (
                      <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-[10px] text-yellow-800 dark:text-yellow-300 flex items-start gap-1">
                        <AlertCircle className="size-3 shrink-0 mt-0.5" />
                        <span>{order.addressDetails.warning}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Endereço / Info Extra:</p>
                      <textarea 
                        value={order.address || ''}
                        onChange={(e) => {
                          const updated = [...parsedOrders];
                          updated[idx] = { ...updated[idx], address: e.target.value };
                          setParsedOrders(updated);
                        }}
                        className="w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-600 dark:text-slate-400 outline-none focus:ring-1 focus:ring-primary resize-none h-16"
                        placeholder="Nenhum endereço identificado"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            Cancelar
          </button>
          {!parsedOrders ? (
            <button
              onClick={handleParse}
              disabled={isParsing || !text.trim()}
              className="flex-[2] bg-primary hover:bg-primary/90 disabled:bg-slate-300 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
            >
              {isParsing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  Analisar Texto
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              Confirmar e Criar Pedidos
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
