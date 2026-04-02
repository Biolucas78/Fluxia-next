'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import OrderForm from '@/components/OrderForm';
import Login from '@/components/Login';
import { useOrders } from '@/lib/hooks';
import { Truck, Package, MapPin, Search, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function LogisticaPage() {
  const { orders, handleOrderCreated, handleUpdateOrder, isLoaded } = useOrders();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Logistics focus: orders in 'caixa_montada', 'enviado', 'entregue'
  const logisticsOrders = orders.filter(o => 
    ['caixa_montada', 'enviado', 'entregue'].includes(o.status) &&
    (o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || o.id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const updateStatus = (order: any, newStatus: string) => {
    handleUpdateOrder({
      ...order,
      status: newStatus
    });
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar onNewOrder={() => setIsFormOpen(true)} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Logística e Entregas" 
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewOrder={() => setIsFormOpen(true)} 
        />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Package className="size-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aguardando Coleta</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'caixa_montada').length}
                    </h3>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Truck className="size-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Em Trânsito</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'enviado').length}
                    </h3>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                    <MapPin className="size-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Entregues</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'entregue').length}
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {logisticsOrders.map((order) => (
                <div key={order.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                        #{order.id.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'caixa_montada' ? 'bg-amber-100 text-amber-600' :
                        order.status === 'enviado' ? 'bg-blue-100 text-blue-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {order.status === 'caixa_montada' ? 'Coleta' :
                         order.status === 'enviado' ? 'Trânsito' : 'Entregue'}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{order.clientName}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 italic">
                      <MapPin className="size-3" /> {order.address}
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {order.carrier && (
                      <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {order.carrier}
                      </span>
                    )}
                    {order.trackingNumber && (
                      <span className="text-[10px] font-mono text-slate-500">
                        {order.trackingNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {order.status === 'caixa_montada' && (
                      <button 
                        onClick={() => updateStatus(order, 'enviado')}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                      >
                        <Truck className="size-4" /> Marcar Enviado
                      </button>
                    )}
                    {order.status === 'enviado' && (
                      <button 
                        onClick={() => updateStatus(order, 'entregue')}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                      >
                        <MapPin className="size-4" /> Marcar Entregue
                      </button>
                    )}
                  </div>
                </div>
              ))}
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
