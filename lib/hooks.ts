'use client';

import { useState, useEffect, useMemo } from 'react';
import { Order, DashboardStats } from './types';
import { calculateWeightInKg } from './parser';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('coffee_crm_orders');
    } catch (e) {
      console.error("Failed to access localStorage", e);
    }

    const timer = setTimeout(() => {
      if (saved) {
        try {
          let loadedOrders: Order[] = JSON.parse(saved);
          
          // Auto-archive orders in 'entregue' phase from previous months
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          
          let changed = false;
          const processedOrders = loadedOrders.map(order => {
            if (order.status === 'entregue' && !order.archived) {
              const orderDate = new Date(order.createdAt);
              if (orderDate.getMonth() !== currentMonth || orderDate.getFullYear() !== currentYear) {
                changed = true;
                return { ...order, archived: true, archivedAt: now.toISOString() };
              }
            }
            return order;
          });

          if (changed) {
            setOrders(processedOrders);
          } else {
            setOrders(loadedOrders);
          }
        } catch (e) {
          console.error("Failed to parse orders from localStorage", e);
          setOrders([]);
        }
      }
      setIsLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('coffee_crm_orders', JSON.stringify(orders));
      } catch (e) {
        console.error("Failed to save to localStorage", e);
      }
    }
  }, [orders, isLoaded]);

  const handleOrderCreated = (order: Order) => {
    setOrders(prev => [order, ...prev]);
  };

  const handleUpdateOrder = (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const handleArchiveOrder = (orderId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, archived: true, archivedAt: new Date().toISOString() };
      }
      return o;
    }));
  };

  const handleRestoreOrder = (orderId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, archived: false, archivedAt: undefined };
      }
      return o;
    }));
  };

  const activeOrders = useMemo(() => orders.filter(o => !o.archived), [orders]);
  const archivedOrders = useMemo(() => orders.filter(o => o.archived), [orders]);

  const stats = useMemo<DashboardStats>(() => {
    const producedOrders = activeOrders.filter(o => 
      ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status)
    );

    const totalKg = producedOrders.reduce((acc, order) => {
      return acc + order.products.reduce((pAcc, p) => pAcc + calculateWeightInKg(p.weight, p.quantity), 0);
    }, 0);

    const totalUnits = producedOrders.reduce((acc, order) => {
      return acc + order.products.reduce((pAcc, p) => pAcc + p.quantity, 0);
    }, 0);

    const totalClients = new Set(activeOrders.map(o => o.clientName)).size;

    return { totalKg, totalUnits, totalClients };
  }, [activeOrders]);

  return {
    orders: activeOrders,
    archivedOrders,
    allOrders: orders,
    setOrders,
    handleOrderCreated,
    handleUpdateOrder,
    handleDeleteOrder,
    handleArchiveOrder,
    handleRestoreOrder,
    stats,
    isLoaded
  };
}
