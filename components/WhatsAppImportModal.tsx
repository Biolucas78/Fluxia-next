'use client';

import React, { useState } from 'react';
import { X, MessageSquare, Loader2, CheckCircle2, AlertCircle, Package, UserPlus, UserCheck, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseOrderWithGemini } from '@/lib/gemini';
import { Order, OrderStatus, ProductItem } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getValidBlingToken } from '@/lib/bling-client';
import { toast } from 'react-hot-toast';
import CustomerSearchForm from './CustomerSearchForm';

interface WhatsAppImportModalProps {
  onOrdersImported: (orders: Order[]) => void;
  onClose: () => void;
  existingOrders?: Order[];
}

export default function WhatsAppImportModal({ onOrdersImported, onClose, existingOrders = [] }: WhatsAppImportModalProps) {
  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedOrders, setParsedOrders] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingCustomers, setIsSavingCustomers] = useState(false);

  const handleParse = async () => {
    if (!text.trim()) return;
    
    setIsParsing(true);
    setError(null);
    
    try {
      const result = await parseOrderWithGemini(text);
      if (result && result.orders && result.orders.length > 0) {
        // Initialize saveToDb for new customers with data
        const ordersWithDbState = result.orders.map((order: any) => ({
          ...order,
          saveToDb: !order.foundInDb && (order.cnpj || order.cpf || order.addressDetails?.street),
          customerData: null // Will be filled by CustomerSearchForm
        }));
        setParsedOrders(ordersWithDbState);
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

  const handleConfirm = async () => {
    if (!parsedOrders) return;

    setIsSavingCustomers(true);
    try {
      const token = await getValidBlingToken();
      
      // Save new customers to DB if requested
      const updatedParsedOrders = [...parsedOrders];
      
      for (let i = 0; i < updatedParsedOrders.length; i++) {
        const po = updatedParsedOrders[i];
        const cd = po.customerData;
        
        // Se o usuário confirmou um cliente (seja novo ou da base)
        if (cd) {
          // Se for um cliente novo (sem ID ou ID 'new' ou ID começando com 'local_')
          // e o usuário marcou para salvar na base (ou se for necessário para o Bling)
          const isNew = !cd.id || cd.id === 'new' || (typeof cd.id === 'string' && cd.id.startsWith('local_'));
          
          if (isNew && po.saveToDb) {
            try {
              if (!token) {
                console.warn("Sem token do Bling, pulando cadastro de cliente no Bling.");
                continue;
              }

              const payload = {
                nome: cd.nome,
                fantasia: cd.fantasia,
                tipo: cd.tipo,
                situacao: 'A',
                indicadorIe: parseInt(cd.contribuinte),
                ie: cd.ie,
                numeroDocumento: cd.numeroDocumento,
                telefones: {
                  celular: cd.celular
                },
                email: cd.email,
                endereco: {
                  geral: cd.endereco.geral
                },
                dadosAdicionais: {
                  codigoRegimeTributario: parseInt(cd.codigoRegimeTributario)
                }
              };

              const response = await fetch('/api/bling/customers', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
              });

              const result = await response.json();
              if (response.ok && result.data && result.data.id) {
                await setDoc(doc(db, 'bling_customers', String(result.data.id)), {
                  ...result.data,
                  updatedAt: Date.now()
                }, { merge: true });
                // Update po.customerData with the new ID
                updatedParsedOrders[i] = {
                  ...po,
                  customerData: {
                    ...cd,
                    id: String(result.data.id)
                  }
                };
              }
            } catch (err) {
              console.error(`Erro ao salvar cliente ${cd.nome}:`, err);
            }
          }
        }
      }

      const newOrders: Order[] = updatedParsedOrders.map(po => {
        const cd = po.customerData;
        return {
          id: Math.random().toString(36).substr(2, 9),
          clientName: cd?.nome || po.clientName,
          tradeName: cd?.fantasia || '',
          cnpj: cd?.tipo === 'J' ? cd.numeroDocumento : '',
          cpf: cd?.tipo === 'F' ? cd.numeroDocumento : '',
          phone: cd?.celular || po.phone,
          email: cd?.email || po.email,
          address: cd?.endereco?.geral?.endereco || po.address || '',
          number: cd?.endereco?.geral?.numero || po.number || '',
          complement: cd?.endereco?.geral?.complemento || po.complement || '',
          addressDetails: {
            street: cd?.endereco?.geral?.endereco || po.addressDetails?.street || po.address || '',
            number: cd?.endereco?.geral?.numero || po.number || po.addressDetails?.number || '',
            complement: cd?.endereco?.geral?.complemento || po.complement || po.addressDetails?.complement || '',
            district: cd?.endereco?.geral?.bairro || po.addressDetails?.district || '',
            city: cd?.endereco?.geral?.municipio || po.addressDetails?.city || '',
            state: cd?.endereco?.geral?.uf || po.addressDetails?.state || '',
            zip: cd?.endereco?.geral?.cep || po.cep || po.addressDetails?.zip || '',
            warning: po.addressDetails?.warning || null
          },
          isSample: po.isSample || false,
          origin: po.origin || 'whatsapp',
          status: 'pedidos' as OrderStatus,
          hasInvoice: false,
          hasBoleto: false,
          hasOrderDocument: false,
          createdAt: new Date().toISOString(),
          statusHistory: [{
            status: 'pedidos' as OrderStatus,
            timestamp: new Date().toISOString()
          }],
          products: po.products.map((p: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            quantity: p.quantity,
            name: p.name,
            weight: p.weight,
            grindType: p.grindType as any,
            productionNotes: p.productionNotes,
            checked: false
          }))
        };
      });

      onOrdersImported(newOrders);
      onClose();
    } catch (err) {
      console.error("Erro ao confirmar pedidos:", err);
      toast.error("Erro ao processar pedidos. Verifique o console.");
    } finally {
      setIsSavingCustomers(false);
    }
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

        {existingOrders.length > 0 && (
          <div className="px-6 py-3 bg-primary/5 border-b border-primary/10 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">Último Pedido Importado</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                {(() => {
                  const lastOrder = [...existingOrders].sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0];
                  return `${lastOrder.tradeName || lastOrder.clientName} • ${new Date(lastOrder.createdAt).toLocaleString('pt-BR')}`;
                })()}
              </p>
            </div>
          </div>
        )}

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
                        {order.foundInDb ? (
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Database className="size-3" />
                            Na Base
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-full">
                            Não Cadastrado
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

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                      <CustomerSearchForm 
                        initialData={order}
                        onConfirm={(customerData) => {
                          setParsedOrders(prev => {
                            if (!prev) return prev;
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], customerData };
                            return updated;
                          });
                        }}
                      />
                    </div>
                    
                    {order.addressDetails?.warning && (
                      <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-[10px] text-yellow-800 dark:text-yellow-300 flex items-start gap-1">
                        <AlertCircle className="size-3 shrink-0 mt-0.5" />
                        <span>{order.addressDetails.warning}</span>
                      </div>
                    )}
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
              disabled={isSavingCustomers}
              className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSavingCustomers ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  Confirmar e Criar Pedidos
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
