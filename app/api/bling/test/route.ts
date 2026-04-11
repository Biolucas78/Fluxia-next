import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';

export async function GET(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    
    // Test 1: /Api/v3/notas/vendas
    const res1 = await fetch('https://api.bling.com.br/Api/v3/notas/vendas?limite=3', { headers });
    const data1 = await res1.json().catch(() => null);

    // Test 2: /v3/notas/vendas (to see if it works or 404s)
    const res2 = await fetch('https://api.bling.com.br/v3/notas/vendas?limite=3', { headers });
    const data2 = await res2.json().catch(() => null);

    return NextResponse.json({
      test1_Api_v3: { status: res1.status, data: data1 },
      test2_v3: { status: res2.status, data: data2 }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
