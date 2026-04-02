import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const order = await request.json();

    // 1. Find or Create Client
    let clientId = await findClient(token, order.clientName);
    if (!clientId) {
      clientId = await createClient(token, order);
    }

    // 2. Map Products to SKUs
    const items = await mapProductsToBling(order.products);

    // 3. Create Order
    const response = await fetch('https://api.bling.com.br/Api/v3/pedidos/vendas', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contato: { id: clientId },
        itens: items,
        data: new Date().toISOString().split('T')[0],
        numeroLoja: order.id, // Use order ID as store number for reference
        observacoes: order.observations || ''
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Bling API error creating order:', errorData);
      throw new Error('Failed to create order in Bling');
    }

    return NextResponse.json({ message: 'Order created successfully' });
  } catch (error: any) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: error.message || 'Failed to create order' }, { status: 500 });
  }
}

async function findClient(token: string, name: string) {
  const response = await fetch(`https://api.bling.com.br/Api/v3/contatos?nome=${encodeURIComponent(name)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    console.error('Bling API error finding client:', response.status);
    return null;
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.error('Non-JSON response from Bling API finding client');
    return null;
  }
  const data = await response.json();
  return data.data?.[0]?.id || null;
}

async function createClient(token: string, order: any) {
  const response = await fetch('https://api.bling.com.br/Api/v3/contatos', {
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
  if (!response.ok) {
    console.error('Bling API error creating client:', response.status);
    throw new Error('Failed to create client in Bling');
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.error('Non-JSON response from Bling API creating client');
    throw new Error('Non-JSON response from Bling API creating client');
  }
  const data = await response.json();
  return data.data.id;
}

async function mapProductsToBling(products: any[]) {
  const items = [];
  for (const product of products) {
    const mappingRef = adminDb.collection('product_mapping');
    // Try to find exact match with weight and grind
    const querySnapshot = await mappingRef
      .where('appName', '==', product.name)
      .where('appWeight', '==', product.weight)
      .where('appGrind', '==', product.grindType)
      .get();
    
    if (querySnapshot.empty) {
      console.warn(`Product mapping not found for: ${product.name} ${product.weight} ${product.grindType}`);
      // Fallback: try to find by name only
      const nameOnlySnapshot = await mappingRef.where('appName', '==', product.name).get();
      if (nameOnlySnapshot.empty) {
        continue;
      }
      const mapping = nameOnlySnapshot.docs[0].data();
      items.push({
        codigo: mapping.blingSku,
        quantidade: product.quantity,
        descricao: mapping.blingName || product.name
      });
    } else {
      const mapping = querySnapshot.docs[0].data();
      items.push({
        codigo: mapping.blingSku,
        quantidade: product.quantity,
        descricao: mapping.blingName || product.name
      });
    }
  }
  return items;
}
