import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
    }

    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ 
        error: 'Bling token not found or expired.' 
      }, { status: 401 });
    }

    console.log(`[Bling Detail] Fetching order details for: ${id}`);
    const response = await fetchWithRetry(`https://api.bling.com.br/Api/v3/pedidos/vendas/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Erro ao buscar detalhes do pedido no Bling' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data.data);
  } catch (error: any) {
    console.error('Error fetching Bling order details:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
