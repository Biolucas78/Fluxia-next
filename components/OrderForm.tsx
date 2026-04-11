'use client';

import React, { useState } from 'react';
import { parseWhatsAppOrder } from '@/lib/parser';
import { parseOrderWithGemini } from '@/lib/gemini';
import { Order } from '@/lib/types';
import { Plus, X, ClipboardPaste, Loader2, Sparkles, User, MapPin, Hash, Check } from 'lucide-react';

interface OrderFormProps {
  onOrderCreated: (order: Order) => void;
  onClose: () => void;
}

export default function OrderForm({ onOrderCreated, onClose }: OrderFormProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [currentPendingIndex, setCurrentPendingIndex] = useState(0);
  const [blingResults, setBlingResults] = useState<any[]>([]);
  const [isSearchingBling, setIsSearchingBling] = useState(false);

  const handleSearchBling = async (name: string) => {
    setIsSearchingBling(true);
    try {
      const { searchBlingCustomers } = await import('@/lib/bling-search');
      const data = await searchBlingCustomers(name);
      setBlingResults(data || []);
    } catch (error) {
      console.error('Error searching Bling:', error);
    } finally {
      setIsSearchingBling(false);
    }
  };

  const handleSelectBlingCustomer = (customer: any) => {
    const updatedOrder = { ...pendingOrders[currentPendingIndex] };
    const isJ = customer.tipo === 'J';
    
    // Prioriza Nome Fantasia conforme solicitado pelo usuário
    updatedOrder.clientName = customer.fantasia && customer.fantasia !== customer.nome 
      ? `${customer.fantasia} (${customer.nome})` 
      : customer.nome;
      
    updatedOrder.cnpj = isJ ? customer.numeroDocumento : '';
    updatedOrder.cpf = !isJ ? customer.numeroDocumento : '';
    updatedOrder.phone = customer.celular || customer.telefone || '';
    
    if (customer.endereco) {
      updatedOrder.addressDetails = {
        street: customer.endereco.endereco || '',
        number: customer.endereco.numero || '',
        complement: customer.endereco.complemento || '',
        district: customer.endereco.bairro || '',
        city: customer.endereco.municipio || '',
        state: customer.endereco.uf || '',
        zip: customer.endereco.cep || ''
      };
      updatedOrder.address = `${customer.endereco.endereco}, ${customer.endereco.numero}`;
    }

    onOrderCreated(updatedOrder);
    moveToNextPending();
  };

  const moveToNextPending = () => {
    if (currentPendingIndex < pendingOrders.length - 1) {
      setCurrentPendingIndex(prev => prev + 1);
      setBlingResults([]);
      handleSearchBling(pendingOrders[currentPendingIndex + 1].clientName);
    } else {
      onClose();
    }
  };

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
      const toIdentify: Order[] = [];

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
          paymentCondition: rawOrderData.paymentCondition || 'A vista',
          observations: rawOrderData.observations || '',
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

        // Check if identification is needed
        const hasAddress = newOrder.addressDetails?.street || newOrder.address;
        const hasDoc = newOrder.cnpj || newOrder.cpf;

        if (!hasAddress && !hasDoc) {
          toIdentify.push(newOrder);
        } else {
          onOrderCreated(newOrder);
        }
      }

      if (validOrdersCount === 0) {
        setError('Não foi possível identificar pedidos válidos. Verifique o formato do texto.');
        setIsParsing(false);
        return;
      }

      if (toIdentify.length > 0) {
        setPendingOrders(toIdentify);
        setCurrentPendingIndex(0);
        handleSearchBling(toIdentify[0].clientName);
        setIsParsing(false);
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Error parsing order:", err);
      setError('Ocorreu um erro ao processar o pedido. Tente novamente.');
      setIsParsing(false);
    }
  };

  if (pendingOrders.length > 0) {
    const currentOrder = pendingOrders[currentPendingIndex];
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-primary/5 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="size-5 text-primary" />
                Identificação de Cliente ({currentPendingIndex + 1}/{pendingOrders.length})
              </h2>
              <p className="text-sm text-slate-500">O cliente &quot;{currentOrder.clientName}&quot; precisa ser identificado no Bling</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="size-5 text-slate-500" />
            </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar min-h-0">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Produtos do Pedido</h3>
              <div className="space-y-2">
                {currentOrder.products.map((p, i) => (
                  <div key={i} className="text-sm text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>{p.quantity}x {p.name} {p.weight}</span>
                    <span className="text-xs text-slate-400 italic">{p.grindType}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
                Resultados no Bling
                {isSearchingBling && <Loader2 className="size-4 animate-spin text-primary" />}
              </h3>
              
              <div className="space-y-2">
                {blingResults.length > 0 ? (
                  blingResults.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => handleSelectBlingCustomer(customer)}
                      className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all border border-slate-100 dark:border-slate-700 hover:border-primary group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                            {customer.fantasia && customer.fantasia !== customer.nome ? (
                              <>
                                <span className="text-primary">{customer.fantasia}</span>
                                <span className="text-xs text-slate-400 font-normal ml-2">({customer.nome})</span>
                              </>
                            ) : (
                              customer.nome
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex gap-3 mt-1">
                            {customer.numeroDocumento && (
                              <span className="flex items-center gap-1">
                                <Hash className="size-3" /> {customer.numeroDocumento}
                              </span>
                            )}
                            {customer.endereco && (
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3" /> {customer.endereco.municipio} - {customer.endereco.uf}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Check className="size-5 text-primary" />
                        </div>
                      </div>
                    </button>
                  ))
                ) : !isSearchingBling ? (
                  <div className="text-center py-8 text-slate-500">
                    <User className="size-8 mx-auto mb-2 opacity-20" />
                    <p>Nenhum cliente encontrado com este nome.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <div className="flex gap-3">
              <button
                onClick={moveToNextPending}
                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Ignorar e Criar Sem Dados
              </button>
              <button
                onClick={() => {
                  onOrderCreated(currentOrder);
                  moveToNextPending();
                }}
                className="flex-1 px-6 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all"
              >
                Manter Como Está
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
