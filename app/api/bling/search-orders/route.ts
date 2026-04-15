import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({ error: 'Nome para busca é obrigatório' }, { status: 400 });
    }

    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ 
        error: 'Bling token not found or expired. Please re-authenticate in Settings.' 
      }, { status: 401 });
    }

    // 1. Search for contacts by name
    console.log(`[Bling Search] Searching contacts for: ${name}`);
    const contactsResponse = await fetchWithRetry(`https://api.bling.com.br/Api/v3/contatos?nome=${encodeURIComponent(name)}&limite=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!contactsResponse.ok) {
      return NextResponse.json({ error: 'Erro ao buscar contatos no Bling' }, { status: contactsResponse.status });
    }

    const contactsData = await contactsResponse.json();
    const contacts = contactsData.data || [];

    if (contacts.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    // 2. For each contact, search for recent sales orders
    // We'll limit to the last 60 days to keep it relevant
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateFilter = sixtyDaysAgo.toISOString().split('T')[0];

    let allOrders: any[] = [];

    for (const contact of contacts) {
      console.log(`[Bling Search] Searching orders for contact: ${contact.nome} (${contact.id})`);
      const ordersResponse = await fetchWithRetry(`https://api.bling.com.br/Api/v3/pedidos/vendas?idContato=${contact.id}&dataInicial=${dateFilter}&limite=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        if (ordersData.data) {
          allOrders = [...allOrders, ...ordersData.data];
        }
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Sort by date descending
    allOrders.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    return NextResponse.json({ orders: allOrders });
  } catch (error: any) {
    console.error('Error searching Bling orders:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
