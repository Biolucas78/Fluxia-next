'use client';

import React, { useMemo } from 'react';
import { useOrders, useUser } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Loader2, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import Login from '@/components/Login';
import { motion } from 'motion/react';

export default function RecorrenciaPage() {
  const { allOrders, isLoaded } = useOrders();
  const { userProfile, loading: userLoading, effectiveRole } = useUser();

  const recurrenceData = useMemo(() => {
    const clients: Record<string, { lastOrder: string; totalOrders: number; clientName: string }> = {};
    
    allOrders.forEach(order => {
      const existing = clients[order.clientName];
      if (!existing || new Date(order.createdAt) > new Date(existing.lastOrder)) {
        clients[order.clientName] = {
          clientName: order.clientName,
          lastOrder: order.createdAt,
          totalOrders: (existing?.totalOrders || 0) + 1
        };
      } else {
        existing.totalOrders += 1;
      }
    });

    const now = new Date();
    return Object.values(clients)
      .map(client => {
        const lastDate = new Date(client.lastOrder);
        const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return { ...client, diffDays };
      })
      .filter(client => client.diffDays >= 20)
      .sort((a, b) => b.diffDays - a.diffDays);
  }, [allOrders]);

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return <Login />;
  }

  if (effectiveRole === 'gestor_trafego') {
    return (
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <AlertCircle className="size-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito</h1>
          <p className="text-slate-500 text-center max-w-md">Sua função de Gestor de Tráfego não possui permissão para acessar a Gestão de Recorrência.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Gestão de Recorrência" />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">Atenção à Recorrência</h3>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                  Estes clientes realizaram o último pedido há mais de 20 dias. Considere entrar em contato para fidelização.
                </p>
              </div>
            </div>

            {!isLoaded ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin size-8 text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {recurrenceData.map((client, index) => (
                  <motion.div
                    key={client.clientName}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-between group hover:border-primary transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`size-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                        client.diffDays > 40 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {client.clientName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{client.clientName}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="size-3" />
                            Último pedido: {new Date(client.lastOrder).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <AlertCircle className="size-3" />
                            {client.diffDays} dias sem pedir
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right mr-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total de Pedidos</p>
                        <p className="text-lg font-black text-slate-900 dark:text-white">{client.totalOrders}</p>
                      </div>
                      <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all">
                        <MessageSquare className="size-4" />
                        Abordar Cliente
                      </button>
                    </div>
                  </motion.div>
                ))}

                {recurrenceData.length === 0 && (
                  <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-slate-400 font-medium">Nenhum cliente na zona de risco de recorrência.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
