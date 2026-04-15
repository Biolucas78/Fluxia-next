'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Download, Loader2, Package, User, Calendar, Hash, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Order, ProductItem, OrderStatus } from '@/lib/types';
import { toast } from 'react-hot-toast';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseInstances } from '@/lib/firebase';

interface BlingImportModalProps {
  onClose: () => void;
  onImport: (order: Order) => void;
}

export default function BlingImportModal({ onClose, onImport }: BlingImportModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState<string | null>(null);
  const [mappings, setMappings] = useState<any[]>([]);

  useEffect(() => {
    const fetchMappings = async () => {
      try {
        const { db } = getFirebaseInstances();
        const snapshot = await getDocs(collection(db, 'product_mapping'));
        const maps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMappings(maps);
      } catch (error) {
        console.error('Error fetching mappings:', error);
      }
    };
    fetchMappings();
  }, []);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/bling/search-orders?name=${encodeURIComponent(searchTerm)}`);
      if (!response.ok) throw new Error('Falha ao buscar pedidos no Bling');
      
      const data = await response.json();
      setOrders(data.orders || []);
      
      if (data.orders?.length === 0) {
        toast.error('Nenhum pedido encontrado para este nome.');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (blingOrder: any) => {
    setIsImporting(blingOrder.id);
    try {
      // 1. Fetch full details
      const response = await fetch(`/api/bling/get-order-details?id=${blingOrder.id}`);
      if (!response.ok) throw new Error('Falha ao buscar detalhes do pedido');
      
      const details = await response.json();
      
      // 2. Map to our Order interface
      const products: ProductItem[] = details.itens.map((item: any) => {
        // Try to find a mapping by SKU or name
        const mapping = mappings.find(m => 
          (m.blingSku && m.blingSku === item.codigo) || 
          (m.blingName && m.blingName.toLowerCase() === item.descricao.toLowerCase())
        );

        return {
          id: Math.random().toString(36).substr(2, 9),
          quantity: Number(item.quantidade),
          name: mapping?.appName || item.descricao,
          weight: mapping?.appWeight || 'N/A',
          grindType: mapping?.appGrind || 'N/A',
          checked: false,
          blingSku: item.codigo,
          blingId: item.produto?.id
        };
      });

      const newOrder: Order = {
        id: `BL-${details.numero || details.id}`,
        clientName: details.contato.nome,
        tradeName: details.contato.nome,
        cnpj: details.contato.numeroDocumento,
        phone: details.contato.celular || details.contato.telefone,
        email: details.contato.email,
        address: `${details.contato.endereco?.geral?.endereco || ''}, ${details.contato.endereco?.geral?.numero || ''}`,
        addressDetails: {
          street: details.contato.endereco?.geral?.endereco || '',
          number: details.contato.endereco?.geral?.numero || '',
          complement: details.contato.endereco?.geral?.complemento || '',
          district: details.contato.endereco?.geral?.bairro || '',
          city: details.contato.endereco?.geral?.municipio || '',
          state: details.contato.endereco?.geral?.uf || '',
          zip: details.contato.endereco?.geral?.cep || '',
        },
        products,
        status: 'pedidos',
        hasInvoice: !!details.notaFiscal?.id,
        hasBoleto: false,
        hasOrderDocument: true,
        createdAt: new Date().toISOString(),
        origin: 'CRM', // Default origin for imported orders
        blingOrderId: details.id,
        observations: details.observacoes || '',
        statusHistory: [
          { status: 'pedidos', timestamp: new Date().toISOString() }
        ]
      };

      onImport(newOrder);
      toast.success('Pedido importado com sucesso!');
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsImporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Importar do Bling</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Busque pedidos por nome do cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X className="size-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Digite o nome do cliente no Bling..."
              className="w-full pl-12 pr-32 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchTerm.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {isSearching ? <Loader2 className="size-4 animate-spin" /> : 'Buscar'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {isSearching ? (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="size-12 mx-auto animate-spin text-primary/30" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Buscando no Bling...</p>
            </div>
          ) : orders.length > 0 ? (
            <div className="grid gap-3">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className="group relative bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 hover:border-primary/50 hover:shadow-lg transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center">
                        <User className="size-5 text-slate-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{order.contato.nome}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">#{order.numero}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Calendar className="size-3" /> {new Date(order.data).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-primary">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {order.situacao.id === 6 ? 'Em aberto' : 'Outro'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleImport(order)}
                    disabled={isImporting !== null}
                    className="w-full mt-2 bg-slate-900 dark:bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-primary transition-all flex items-center justify-center gap-2"
                  >
                    {isImporting === order.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="size-4" /> Importar Pedido
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : searchTerm && !isSearching ? (
            <div className="py-20 text-center opacity-30">
              <Package className="size-12 mx-auto mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">Nenhum pedido encontrado</p>
            </div>
          ) : (
            <div className="py-20 text-center opacity-30">
              <Search className="size-12 mx-auto mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">Busque por nome, CPF ou CNPJ</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800/50">
            <AlertCircle className="size-5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              Pedidos importados serão criados na fase <strong>Pedidos</strong>. Certifique-se de que os produtos no Bling estão mapeados corretamente para evitar divergências.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
