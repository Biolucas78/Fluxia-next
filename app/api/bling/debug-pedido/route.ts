import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || '25195222206';
  const token = await getValidBlingTokenServer();
  if (!token) return NextResponse.json({ error: 'Token nao encontrado' }, { status: 401 });
  const res = await fetchWithRetry(`https://api.bling.com.br/Api/v3/pedidos/vendas/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return NextResponse.json(data.data || data);
}
