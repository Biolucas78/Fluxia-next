'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import MapWrapper from '@/components/MapWrapper';
import { Loader2 } from 'lucide-react';

export default function MapaParceirosPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch all customers, we will filter them in the map component
    const q = query(collection(db, 'bling_customers'), orderBy('nome', 'asc'), limit(1000));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCustomers(docs);
      setIsLoading(false);
    }, (error) => {
      console.error('Error fetching customers for map:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full m-0 p-0 overflow-hidden bg-white">
      <MapWrapper customers={customers} isPublic={true} />
    </div>
  );
}
