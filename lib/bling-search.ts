'use client';

import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function normalizeString(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export async function searchBlingCustomers(searchQuery: string) {
  if (!searchQuery) return [];

  const normalizedQuery = searchQuery.toLowerCase().trim();
  const customersRef = collection(db, 'bling_customers');
  
  // Basic search: we'll fetch a larger set and filter locally for now 
  // since the user wants to "erase everything related to search criteria"
  const q = query(customersRef, limit(100));
  const snapshot = await getDocs(q);

  let clientes: any[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const searchableText = `${data.nome || ''} ${data.fantasia || ''} ${data.numeroDocumento || ''}`.toLowerCase();
    if (searchableText.includes(normalizedQuery)) {
      clientes.push({ ...data, id: doc.id });
    }
  });

  return clientes;
}
