'use client';

import { useState, useEffect, useMemo } from 'react';
import { Order, DashboardStats } from './types';
import { calculateWeightInKg } from './parser';
import { db, auth } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  
  // Handle basic types
  if (typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .map(sanitizeForFirestore)
      .filter(item => item !== undefined);
  }
  
  // Handle plain objects
  const sanitized: any = {};
  let hasValue = false;
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const sanitizedValue = sanitizeForFirestore(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
      hasValue = true;
    }
  });
  return hasValue ? sanitized : {};
};

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
      // Use a microtask or timeout to avoid synchronous setState in effect body
      const timer = setTimeout(() => {
        setOrders([]);
        setIsLoaded(true);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Determine collection name based on environment
    // In AI Studio/Development, we use 'orders_dev' to avoid affecting production data
    const isDev = process.env.NODE_ENV === 'development' || window.location.hostname.includes('ais-dev') || window.location.hostname.includes('localhost');
    const collectionName = isDev ? 'orders_dev' : 'orders';

    // Migration logic: check localStorage and move to Firestore
    const migrateData = async () => {
      const saved = localStorage.getItem('coffee_crm_orders');
      if (saved) {
        try {
          const loadedOrders: Order[] = JSON.parse(saved);
          if (loadedOrders.length > 0) {
            console.log(`Migrating orders to Firestore collection: ${collectionName}...`);
            for (const order of loadedOrders) {
              const sanitizedOrder = sanitizeForFirestore(order);
              // Use setDoc with the existing ID to maintain consistency
              await setDoc(doc(db, collectionName, order.id), sanitizedOrder);
            }
            localStorage.removeItem('coffee_crm_orders');
            console.log("Migration complete.");
          }
        } catch (e) {
          console.error("Failed to migrate data", e);
        }
      }
    };

    let isMounted = true;
    let unsubscribeOrders: (() => void) | undefined;

    const setupListener = async () => {
      await migrateData();
      
      if (!isMounted) return;

      const q = query(collection(db, collectionName));
      unsubscribeOrders = onSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        const loadedOrders: Order[] = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as Order));
        setOrders(loadedOrders);
        setIsLoaded(true);
      }, (error) => {
        if (!isMounted) return;
        console.error(`Failed to fetch orders from Firestore (${collectionName})`, error);
        setIsLoaded(true);
      });
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, [userId]);

  const getCollectionName = () => {
    const isDev = process.env.NODE_ENV === 'development' || window.location.hostname.includes('ais-dev') || window.location.hostname.includes('localhost');
    return isDev ? 'orders_dev' : 'orders';
  };

  const handleOrderCreated = async (order: Order) => {
    console.log("Creating order in Firestore:", order.id);
    try {
      const sanitizedOrder = sanitizeForFirestore(order);
      console.log("Sanitized order for creation:", JSON.stringify(sanitizedOrder));
      
      // Use setDoc with the client-side ID to maintain consistency
      const collectionName = getCollectionName();
      await setDoc(doc(db, collectionName, order.id), sanitizedOrder);
      
      console.log("Order created successfully");
    } catch (e) {
      console.error("Failed to save to Firestore", e);
    }
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    console.log("Updating order in Firestore:", updatedOrder.id);
    try {
      const orderRef = doc(db, getCollectionName(), updatedOrder.id);
      const sanitizedOrder = sanitizeForFirestore(updatedOrder);
      
      // Remove id from update payload as it's part of the path
      const { id, ...updateData } = sanitizedOrder;
      
      console.log("Update data for Firestore:", JSON.stringify(updateData));
      
      await updateDoc(orderRef, updateData);
      console.log("Order updated successfully");
    } catch (e) {
      console.error("Failed to update in Firestore", e);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    console.log("handleDeleteOrder called with ID:", orderId);
    try {
      const collectionName = getCollectionName();
      console.log("Deleting from collection:", collectionName);
      await deleteDoc(doc(db, collectionName, orderId));
      console.log("Successfully deleted from Firestore");
    } catch (e) {
      console.error("Failed to delete from Firestore", e);
    }
  };

  const handleArchiveOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, getCollectionName(), orderId);
      await updateDoc(orderRef, { archived: true, archivedAt: new Date().toISOString() });
    } catch (e) {
      console.error("Failed to archive in Firestore", e);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, getCollectionName(), orderId);
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
