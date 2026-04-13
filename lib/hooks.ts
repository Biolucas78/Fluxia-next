'use client';

import { useState, useEffect, useMemo } from 'react';
import { Order, DashboardStats, UserProfile, UserRole, Lead, CRMStats, AuthorizedEmail, AnalyticsStats, LeadHistory } from './types';
import { calculateWeightInKg } from './parser';
import { db, auth } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setDoc, getDoc, orderBy, where, getDocFromServer } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
    
    const isDevelopment = () => {
      if (typeof window === 'undefined') return false;
      return process.env.NODE_ENV === 'development' || 
             window.location.hostname.includes('ais-dev') || 
             window.location.hostname.includes('localhost');
    };

    // Determine collection name based on environment
    const collectionName = isDevelopment() ? 'orders_dev' : 'orders';

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
    if (typeof window === 'undefined') return 'orders';
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

  const syncFromDev = async () => {
    try {
      const { getDocs, collection } = await import('firebase/firestore');
      const devSnapshot = await getDocs(collection(db, 'orders_dev'));
      const devOrders = devSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
      
      if (devOrders.length === 0) {
        return { success: false, message: 'Nenhum pedido encontrado na coleção de desenvolvimento.' };
      }

      let migratedCount = 0;
      for (const order of devOrders) {
        const sanitizedOrder = sanitizeForFirestore(order);
        await setDoc(doc(db, 'orders', order.id), sanitizedOrder);
        migratedCount++;
      }

      return { success: true, message: `${migratedCount} pedidos migrados com sucesso!` };
    } catch (e) {
      console.error('Erro na migração:', e);
      return { success: false, message: 'Erro ao migrar dados.' };
    }
  };

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
    syncFromDev,
    stats,
    isLoaded,
    collectionName: getCollectionName()
  };
}

import { UserProvider, useUserContext } from '@/components/UserProvider';

export function useUser() {
  return useUserContext();
}

export function useAuthorizedEmails() {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'authorized_emails'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as AuthorizedEmail));
      setEmails(loaded);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const addAuthorizedEmail = async (email: string, role: UserRole) => {
    const id = Math.random().toString(36).substr(2, 9);
    await setDoc(doc(db, 'authorized_emails', id), {
      id,
      email,
      role,
      createdAt: new Date().toISOString()
    });
  };

  const removeAuthorizedEmail = async (id: string) => {
    await deleteDoc(doc(db, 'authorized_emails', id));
  };

  const updateAuthorizedRole = async (id: string, role: UserRole) => {
    await updateDoc(doc(db, 'authorized_emails', id), { role });
  };

  return { emails, loading, addAuthorizedEmail, removeAuthorizedEmail, updateAuthorizedRole };
}

export function useAnalytics(startDate?: string, endDate?: string) {
  const [analytics, setAnalytics] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!startDate || !endDate) return;
      
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/analytics?startDate=${startDate}&endDate=${endDate}`);
        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setAnalytics(data);
        }
      } catch (err) {
        setError('Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [startDate, endDate]);

  return { analytics, loading, error };
}

export function useLeads(dateRange?: { start: Date; end: Date }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { userProfile, loading: userLoading, effectiveRole } = useUser();
  const { allOrders } = useOrders();

  useEffect(() => {
    if (userLoading) return;
    
    if (!userProfile) {
      setTimeout(() => {
        setLeads([]);
        setIsLoaded(true);
      }, 0);
      return;
    }

    const isDev = () => {
      if (typeof window === 'undefined') return false;
      return window.location.hostname.includes('ais-dev') || window.location.hostname.includes('localhost');
    };

    const collectionName = isDev() ? 'leads_dev' : 'leads';
    
    let q;
    if (effectiveRole === 'gestor_trafego') {
      // Gestor de tráfego só pode ver leads da landing page
      // Nota: Isso pode exigir um índice composto no Firestore (origem ASC, createdAt DESC)
      q = query(
        collection(db, collectionName), 
        where('origem', '==', 'landing_page'),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedLeads = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Lead));
      setLeads(loadedLeads);
      setIsLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, collectionName);
    });

    return () => unsubscribe();
  }, [userProfile, userLoading, effectiveRole]);

  const getCollectionName = () => {
    if (typeof window === 'undefined') return 'leads';
    const isDev = window.location.hostname.includes('ais-dev') || window.location.hostname.includes('localhost');
    return isDev ? 'leads_dev' : 'leads';
  };

  const handleCreateLead = async (leadData: Partial<Lead>) => {
    const collectionName = getCollectionName();
    try {
      const now = new Date().toISOString();
      const id = Math.random().toString(36).substr(2, 9);
      const newLead = {
        ...leadData,
        id,
        createdAt: now,
        updatedAt: now,
        history: [{ status: leadData.status || 'lead', timestamp: now, note: 'Lead criado' }]
      };
      await setDoc(doc(db, collectionName, id), sanitizeForFirestore(newLead));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, collectionName);
    }
  };

  const handleUpdateLead = async (leadId: string, updates: Partial<Lead>) => {
    try {
      const leadRef = doc(db, getCollectionName(), leadId);
      const now = new Date().toISOString();
      const currentLead = leads.find(l => l.id === leadId);
      
      const updatePayload: any = {
        ...updates,
        updatedAt: now
      };

      if (updates.status && currentLead && updates.status !== currentLead.status) {
        const historyItem: LeadHistory = {
          status: updates.status,
          timestamp: now,
          note: `Status alterado de ${currentLead.status.replace(/_/g, ' ')} para ${updates.status.replace(/_/g, ' ')}`
        };
        updatePayload.history = [...(currentLead.history || []), historyItem];
      }

      await updateDoc(leadRef, sanitizeForFirestore(updatePayload));
    } catch (e) {
      console.error("Failed to update lead", e);
    }
  };

  const stats = useMemo<CRMStats>(() => {
    const filteredLeads = dateRange 
      ? leads.filter(l => {
          const d = new Date(l.createdAt);
          return d >= dateRange.start && d <= dateRange.end;
        })
      : leads;

    const prevLeads = dateRange
      ? leads.filter(l => {
          const d = new Date(l.createdAt);
          const diff = dateRange.end.getTime() - dateRange.start.getTime();
          const prevStart = new Date(dateRange.start.getTime() - diff - 86400000);
          const prevEnd = new Date(dateRange.start.getTime() - 86400000);
          return d >= prevStart && d <= prevEnd;
        })
      : [];

    const filteredOrders = dateRange
      ? allOrders.filter(o => {
          const d = new Date(o.createdAt);
          return d >= dateRange.start && d <= dateRange.end;
        })
      : allOrders;

    const prevOrders = dateRange
      ? allOrders.filter(o => {
          const d = new Date(o.createdAt);
          const diff = dateRange.end.getTime() - dateRange.start.getTime();
          const prevStart = new Date(dateRange.start.getTime() - diff - 86400000);
          const prevEnd = new Date(dateRange.start.getTime() - 86400000);
          return d >= prevStart && d <= prevEnd;
        })
      : [];

    const leadsByStatus: Record<string, number> = {};
    const leadsByOrigin: Record<string, number> = {};
    
    filteredLeads.forEach(lead => {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1;
      leadsByOrigin[lead.origem] = (leadsByOrigin[lead.origem] || 0) + 1;
    });

    const totalLeads = filteredLeads.length;
    const closedWon = leadsByStatus['fez_pedido'] || 0;
    const conversionRate = totalLeads > 0 ? (closedWon / totalLeads) * 100 : 0;

    const totalSalesValue = filteredOrders.reduce((acc, o) => acc + (o.invoiceValue || 0), 0);
    const prevSalesValue = prevOrders.reduce((acc, o) => acc + (o.invoiceValue || 0), 0);
    
    const totalOrdersCount = filteredOrders.length;
    const prevOrdersCount = prevOrders.length;

    const formSubmissions = filteredLeads.filter(l => l.origem === 'landing_page').length;

    const comparison = dateRange ? {
      leadsChange: prevLeads.length > 0 ? ((totalLeads - prevLeads.length) / prevLeads.length) * 100 : 0,
      salesValueChange: prevSalesValue > 0 ? ((totalSalesValue - prevSalesValue) / prevSalesValue) * 100 : 0,
      ordersCountChange: prevOrdersCount > 0 ? ((totalOrdersCount - prevOrdersCount) / prevOrdersCount) * 100 : 0,
    } : undefined;

    return { 
      totalLeads, 
      leadsByStatus, 
      leadsByOrigin, 
      conversionRate,
      totalSalesValue,
      totalOrdersCount,
      formSubmissions,
      comparison
    };
  }, [leads, allOrders, dateRange]);

  const handleDeleteLead = async (leadId: string) => {
    try {
      const leadRef = doc(db, getCollectionName(), leadId);
      await deleteDoc(leadRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, getCollectionName());
    }
  };

  return {
    leads,
    stats,
    isLoaded,
    handleCreateLead,
    handleUpdateLead,
    handleDeleteLead
  };
}
