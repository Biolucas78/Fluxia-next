import { NextResponse } from 'next/server';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebaseInstances } from '@/lib/firebase';

async function getBlingToken() {
  const { db } = getFirebaseInstances();
  const docRef = doc(db, 'bling_config', 'tokens');
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error('No Bling tokens found');
  return docSnap.data().access_token;
}

export async function POST(request: Request) {
  try {
    const order = await request.json();
    const token = await getBlingToken();

    // 1. Find or Create Client
    let clientId = await findClient(token, order.clientName);
    if (!clientId) {
      clientId = await createClient(token, order);
    }

    // 2. Map Products to SKUs
    const items = await mapProductsToBling(order.products);

    // 3. Create Order
    const response = await fetch('https://bling.com.br/Api/v3/pedidos/vendas', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cliente: { id: clientId },
        itens: items,
        // Add other required fields based on Bling API
      })
    });

    if (!response.ok) throw new Error('Failed to create order in Bling');

    return NextResponse.json({ message: 'Order created successfully' });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}

async function findClient(token: string, name: string) {
  const response = await fetch(`https://bling.com.br/Api/v3/contatos?nome=${encodeURIComponent(name)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  return data.data?.[0]?.id || null;
}

async function createClient(token: string, order: any) {
  const response = await fetch('https://bling.com.br/Api/v3/contatos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nome: order.clientName,
      tipo: 'F', // Default to Pessoa Física
      // Add more fields if available in order
    })
  });
  const data = await response.json();
  return data.data.id;
}

async function mapProductsToBling(products: any[]) {
  const { db } = getFirebaseInstances();
  const items = [];
  for (const product of products) {
    const mappingRef = collection(db, 'product_mapping');
    const q = query(mappingRef, where('appName', '==', product.name));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) throw new Error(`Product mapping not found for: ${product.name}`);
    
    const mapping = querySnapshot.docs[0].data();
    items.push({
      produto: { id: mapping.blingSku },
      quantidade: product.quantity
    });
  }
  return items;
}
