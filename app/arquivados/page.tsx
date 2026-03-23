'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import OrderForm from '@/components/OrderForm';
import { useOrders } from '@/lib/hooks';
import { RotateCcw, Trash2, Search, Calendar, User, Package, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function ArchivedOrdersPage() {
  const { archivedOrders, handleRestoreOrder, handleDeleteOrder, handleOrderCreated, isLoaded } = useOrders();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOrders = archivedOrders.filter(o => 
    o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar onNewOrder={() => setIsFormOpen(true)} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Pedidos Arquivados" 
          onNewOrder={() => setIsFormOpen(true)} 
        />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Search and Stats */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Buscar por cliente ou ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                />
              </div>
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Arquivados: {archivedOrders.length}</p>
              </div>
            </div>

            {/* Orders List */}
            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredOrders.map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex flex-col md:flex-row gap-6 justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                            #{order.id.toUpperCase()}
                          </span>
                          <span className="text-slate-400 text-[10px] font-bold uppercase flex items-center gap-1">
                            <Calendar className="size-3" />
                            Arquivado em: {order.archivedAt ? new Date(order.archivedAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="size-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <User className="size-6 text-slate-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{order.clientName}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 italic">
                              <MapPin className="size-3" /> {order.address || 'Endereço não informado'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {order.products.map((p, idx) => (
                            <span key={idx} className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                              {p.quantity}x {p.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex md:flex-col gap-2 justify-center shrink-0">
                        <button
                          onClick={() => handleRestoreOrder(order.id)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-bold transition-all"
                        >
                          <RotateCcw className="size-4" />
                          Restaurar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Tenha certeza que deseja excluir permanentemente este pedido?')) {
                              handleDeleteOrder(order.id);
                            }
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-xs font-bold transition-all"
                        >
                          <Trash2 className="size-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredOrders.length === 0 && (
                <div className="py-20 text-center bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                  <Package className="size-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhum pedido arquivado</h3>
                  <p className="text-sm text-slate-500">Pedidos finalizados aparecerão aqui.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {isFormOpen && (
        <OrderForm 
          onOrderCreated={handleOrderCreated}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
}
