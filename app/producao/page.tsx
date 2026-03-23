'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import KanbanBoard from '@/components/KanbanBoard';
import OrderForm from '@/components/OrderForm';
import WhatsAppImportModal from '@/components/WhatsAppImportModal';
import { useOrders } from '@/lib/hooks';
import { OrderStatus, Order } from '@/lib/types';

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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isLoaded) return null;

  const handleOrdersImported = (newOrders: Order[]) => {
    setOrders(prev => [...newOrders, ...prev]);
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
      <Sidebar onNewOrder={() => setIsFormOpen(true)} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Fluxo de Produção" 
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewOrder={() => setIsFormOpen(true)} 
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

      {isFormOpen && (
        <OrderForm 
          onOrderCreated={handleOrderCreated}
          onClose={() => setIsFormOpen(false)}
        />
      )}

      {isImportOpen && (
        <WhatsAppImportModal 
          onOrdersImported={handleOrdersImported}
          onClose={() => setIsImportOpen(false)}
        />
      )}
    </div>
  );
}
