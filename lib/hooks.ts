'use client';

import { useState, useEffect, useMemo } from 'react';
import { Order, DashboardStats } from './types';
import { calculateWeightInKg } from './parser';
import { db, auth } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUserId(user ? user.uid : null);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userId) {
      setOrders([]);
      setIsLoaded(true);
      return;
    }

    // Migration logic: check localStorage and move to Firestore
    const migrateData = async () => {
      const saved = localStorage.getItem('coffee_crm_orders');
      if (saved) {
        try {
          const loadedOrders: Order[] = JSON.parse(saved);
          if (loadedOrders.length > 0) {
            console.log("Migrating orders to Firestore...");
            for (const order of loadedOrders) {
              await addDoc(collection(db, 'orders'), order);
            }
            localStorage.removeItem('coffee_crm_orders');
            console.log("Migration complete.");
          }
        } catch (e) {
          console.error("Failed to migrate data", e);
        }
      }
    };

    migrateData().then(() => {
      const q = query(collection(db, 'orders'));
      const unsubscribeOrders = onSnapshot(q, (snapshot) => {
        const loadedOrders: Order[] = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as Order));
        setOrders(loadedOrders);
        setIsLoaded(true);
      }, (error) => {
        console.error("Failed to fetch orders from Firestore", error);
        setIsLoaded(true);
      });

      return () => unsubscribeOrders();
    });
  }, [userId]);

  const handleOrderCreated = async (order: Order) => {
    try {
      await addDoc(collection(db, 'orders'), order);
    } catch (e) {
      console.error("Failed to save to Firestore", e);
    }
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    try {
      const orderRef = doc(db, 'orders', updatedOrder.id);
      await updateDoc(orderRef, { ...updatedOrder });
    } catch (e) {
      console.error("Failed to update in Firestore", e);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (e) {
      console.error("Failed to delete from Firestore", e);
    }
  };

  const handleArchiveOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { archived: true, archivedAt: new Date().toISOString() });
    } catch (e) {
      console.error("Failed to archive in Firestore", e);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { archived: false, archivedAt: null });
    } catch (e) {
      console.error("Failed to restore in Firestore", e);
    }
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
