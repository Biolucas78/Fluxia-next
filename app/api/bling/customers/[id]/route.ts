import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const url = `https://api.bling.com.br/Api/v3/contatos/${id}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Bling Get Customer API] Error:', errorText);
      return NextResponse.json({ error: `Erro na API do Bling: ${res.status} ${errorText}` }, { status: res.status });
    }

    const json = await res.json();
    return NextResponse.json({ success: true, data: json.data });
  } catch (error: any) {
    console.error('[Bling Get Customer API] Internal Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const customerData = await request.json();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const url = `https://api.bling.com.br/Api/v3/contatos/${id}`;
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(customerData) });

    // Se o contato não existe mais no Bling (404), cria como novo (POST)
    if (res.status === 404) {
      console.warn(`[Bling Update Customer] ID ${id} não encontrado no Bling — criando como novo contato.`);
      const createRes = await fetch('https://api.bling.com.br/Api/v3/contatos', {
        method: 'POST', headers, body: JSON.stringify(customerData),
      });
      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error('[Bling Create Customer (fallback)] Error:', errorText);
        return NextResponse.json({ error: `Erro na API do Bling: ${createRes.status} ${errorText}` }, { status: createRes.status });
      }
      const createText = await createRes.text();
      const createJson = createText ? JSON.parse(createText) : {};
      return NextResponse.json({ success: true, created: true, data: createJson.data || createJson });
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Bling Update Customer API] Error:', errorText);
      return NextResponse.json({ error: `Erro na API do Bling: ${res.status} ${errorText}` }, { status: res.status });
    }

    if (res.status === 204) {
      return NextResponse.json({ success: true });
    }

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    return NextResponse.json({ success: true, data: json.data || json });
  } catch (error: any) {
    console.error('[Bling Update Customer API] Internal Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const url = `https://api.bling.com.br/Api/v3/contatos/${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Bling Delete Customer API] Error:', errorText);
      return NextResponse.json({ error: `Erro na API do Bling: ${res.status} ${errorText}` }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Bling Delete Customer API] Internal Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
