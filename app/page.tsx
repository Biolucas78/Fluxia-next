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
  const { orders, stats, handleOrderCreated, handleUpdateOrder, isLoaded } = useOrders();
  const { userProfile, loading: userLoading, effectiveRole } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole === 'gestor_trafego' || effectiveRole === 'gestor_vendas') {
      router.push('/crm');
    }
  }, [effectiveRole, router]);

  const handleSeedOrder = () => {
    const testOrder: Order = {
      id: `test-${Math.random().toString(36).substring(2, 7)}`,
      clientName: 'Cliente de Teste (Belo Horizonte)',
      address: 'Rua da Bahia, 1000, Centro, Belo Horizonte - MG, 30160-011',
      products: [
        { id: 'p1', name: 'Café Especial 250g', quantity: 2, weight: '250g', grindType: 'grãos', checked: true },
        { id: 'p2', name: 'Café Reserva 500g', quantity: 1, weight: '500g', grindType: 'moído', checked: true }
      ],
      status: 'caixa_montada',
      hasInvoice: true,
      hasBoleto: true,
      hasOrderDocument: false,
      createdAt: new Date().toISOString(),
      boxDimensions: { width: 20, height: 15, length: 25 }
    };
    handleOrderCreated(testOrder);
  };

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
          onSeedOrder={handleSeedOrder}
        />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <Dashboard 
            stats={stats} 
            orders={orders} 
            onSeedOrder={handleSeedOrder} 
            onUpdateOrder={handleUpdateOrder}
          />
        </div>
      </main>
    </div>
  );
}
