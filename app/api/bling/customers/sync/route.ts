import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limite = parseInt(searchParams.get('limite') || '100', 10);
    const dataInclusaoInicio = searchParams.get('dataInclusaoInicio') || '';

    console.log(`[Bling Sync API] Buscando página ${page}...`);
    let url = `https://api.bling.com.br/v3/contatos?limite=${limite}&pagina=${page}`;
    if (dataInclusaoInicio) url += `&dataInclusaoInicio=${encodeURIComponent(dataInclusaoInicio)}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Bling Sync API] Erro na página ${page}:`, errorText);
      return NextResponse.json({ error: `Erro na API do Bling: ${res.status} ${errorText}` }, { status: res.status });
    }

    const json = await res.json();
    const contacts = json.data || [];

    return NextResponse.json({ success: true, contacts, page, hasMore: contacts.length > 0 });
  } catch (error: any) {
    console.error('[Bling Sync API] Erro interno:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
