'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import KanbanBoard from '@/components/KanbanBoard';
import OrderForm from '@/components/OrderForm';
import WhatsAppImportModal from '@/components/WhatsAppImportModal';
import Login from '@/components/Login';
import { useOrders } from '@/lib/hooks';
import { OrderStatus, Order } from '@/lib/types';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

const COLUMNS: { id: OrderStatus; title: string }[] = [
  { id: 'pedidos', title: 'Pedidos' },
  { id: 'embalagens_separadas', title: 'Emb. Separadas' },
  { id: 'embalagens_prontas', title: 'Emb. Prontas' },
  { id: 'caixa_montada', title: 'Caixa Montada' },
  { id: 'enviado', title: 'Enviado' },
  { id: 'entregue', title: 'Entregue' },
];

export default function ProducaoPage() {
  const { orders, setOrders, handleOrderCreated, handleUpdateOrder, handleDeleteOrder, handleArchiveOrder, isLoaded } = useOrders();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Legacy data migration: Ensure all orders have a statusHistory
  useEffect(() => {
    if (isLoaded && orders.length > 0) {
      const ordersToUpdate = orders.filter(o => !o.statusHistory || o.statusHistory.length === 0);
      if (ordersToUpdate.length > 0) {
        console.log(`Migrating ${ordersToUpdate.length} orders to include statusHistory`);
        ordersToUpdate.forEach(order => {
          handleUpdateOrder({
            ...order,
            statusHistory: [{
              status: order.status,
              timestamp: order.createdAt || new Date().toISOString()
            }]
          });
        });
      }
    }
  }, [isLoaded, orders, handleUpdateOrder]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleOrdersImported = async (newOrders: Order[]) => {
    // Save each imported order to Firestore
    for (const order of newOrders) {
      await handleOrderCreated(order);
    }
  };

  const handleMoveOrder = (order: any, direction: 'next' | 'prev') => {
    const currentIndex = COLUMNS.findIndex(c => c.id === order.status);
    let nextIndex = currentIndex;

    if (direction === 'next' && currentIndex < COLUMNS.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (direction === 'prev' && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    }

    if (nextIndex !== currentIndex) {
      const nextStatus = COLUMNS[nextIndex].id;
      
      let updatedProducts = order.products;
      const isMovingForward = nextIndex > currentIndex;
      
      if (isMovingForward) {
        if (nextStatus === 'embalagens_separadas' || nextStatus === 'embalagens_prontas') {
          updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
        }
      } else {
        updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
      }

      handleUpdateOrder({
        ...order,
        status: nextStatus,
        products: updatedProducts
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Fluxo de Produção" 
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onImportWhatsApp={() => setIsImportOpen(true)}
        />
        
        <div className="flex-1 overflow-hidden">
          <KanbanBoard 
            orders={orders} 
            onUpdateOrder={handleUpdateOrder}
            onMoveOrder={handleMoveOrder}
            onDeleteOrder={handleDeleteOrder}
            onArchiveOrder={handleArchiveOrder}
            searchQuery={searchQuery}
          />
        </div>
      </main>

      {isImportOpen && (
        <WhatsAppImportModal 
          onOrdersImported={handleOrdersImported}
          onClose={() => setIsImportOpen(false)}
          existingOrders={orders}
        />
      )}
    </div>
  );
}
