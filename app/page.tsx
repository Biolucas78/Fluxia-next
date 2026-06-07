'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/components/Dashboard';
import Login from '@/components/Login';
import { useOrders, useUser } from '@/lib/hooks';
import { Order } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { orders: allOrders, stats, handleOrderCreated, handleUpdateOrder, isLoaded } = useOrders();
  const orders = allOrders.filter(o => !o.isDeleted);
  const { userProfile, loading: userLoading, effectiveRole } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole === 'gestor_trafego' || effectiveRole === 'gestor_vendas') {
      router.push('/crm');
    }
  }, [effectiveRole, router]);


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

  // If user is restricted, don't render the production dashboard while redirecting
  if (effectiveRole === 'gestor_trafego' || effectiveRole === 'gestor_vendas') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Dashboard de Produção"
        />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <Dashboard 
            stats={stats} 
            orders={orders} 
            onUpdateOrder={handleUpdateOrder}
          />
        </div>
      </main>
    </div>
  );
}
