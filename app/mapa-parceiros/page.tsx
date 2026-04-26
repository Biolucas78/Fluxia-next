import React from 'react';
import { adminDb } from '@/lib/firebase-admin';
import MapWrapper from '@/components/MapWrapper';

export const revalidate = 3600; // Revalidate every hour

export default async function MapaParceirosPage() {
  let customers: any[] = [];
  
  try {
    const snapshot = await adminDb.collection('bling_customers').orderBy('nome', 'asc').limit(2000).get();
    customers = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        nome: data.nome || '',
        fantasia: data.fantasia || '',
        tipo: data.tipo || 'J',
        mostrarNoMapa: data.mostrarNoMapa !== false,
        endereco: data.endereco || null,
        coordenadas: data.coordenadas || null,
      };
    });
  } catch (error) {
    console.error('Error fetching customers server-side:', error);
  }

  return (
    <div className="h-screen w-full m-0 p-0 overflow-hidden bg-white">
      <MapWrapper customers={customers} isPublic={true} />
    </div>
  );
}
