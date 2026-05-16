'use client';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function searchBlingCustomers(searchQuery: string) {
  if (!searchQuery) return [];
  const normalized = searchQuery.toLowerCase().trim().replace(/\D/g, '') || searchQuery.toLowerCase().trim();
  const isDoc = /^\d{11,14}$/.test(searchQuery.replace(/\D/g, ''));

  const customersRef = collection(db, 'bling_customers');
  const q = query(customersRef, limit(1000));
  const snapshot = await getDocs(q);

  let clientes: any[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const docNum = (data.numeroDocumento || '').replace(/\D/g, '');
    const searchable = `${data.nome || ''} ${data.fantasia || ''} ${docNum}`.toLowerCase();
    const queryLower = searchQuery.toLowerCase().trim();

    const match = isDoc
      ? docNum.includes(searchQuery.replace(/\D/g, ''))
      : searchable.includes(queryLower) || (data.fantasia || '').toLowerCase().includes(queryLower);

    if (match) clientes.push({ ...data, id: doc.id });
  });

  // Ordenar: fantasia primeiro, depois nome
  clientes.sort((a, b) => {
    const nA = (a.fantasia || a.nome || '').toLowerCase();
    const nB = (b.fantasia || b.nome || '').toLowerCase();
    return nA.localeCompare(nB);
  });

  return clientes.slice(0, 20);
}
