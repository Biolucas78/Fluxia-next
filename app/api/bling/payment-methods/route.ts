import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';

export async function GET() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

    const response = await fetch('https://api.bling.com.br/Api/v3/formas-pagamento', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
