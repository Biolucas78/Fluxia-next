import { NextResponse } from 'next/server';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const onlyDigits = (s?: string) => (s || '').replace(/\D/g, '');

// Ex: {"error":{"fields":[{"msg":"O CNPJ já está cadastrado no contato NOME","element":"cnpj"}]}}
function isDocumentDuplicateError(errorText: string): boolean {
  try {
    const fields = JSON.parse(errorText)?.error?.fields || [];
    return fields.some((f: any) => f.element === 'cnpj' || f.element === 'cpf');
  } catch {
    return false;
  }
}

// Procura no Bling o contato que realmente tem o CNPJ/CPF: primeiro pelo documento,
// depois pelo nome citado na mensagem de erro (confirmando que o documento bate)
async function findRealContactId(customerData: any, errorText: string, headers: Record<string, string>): Promise<string | null> {
  const documento = onlyDigits(customerData?.numeroDocumento);
  if (!documento) return null;

  const r1 = await fetch(`https://api.bling.com.br/Api/v3/contatos?numeroDocumento=${documento}`, { headers });
  if (r1.ok) {
    const found = ((await r1.json())?.data || []).find((c: any) => !c.numeroDocumento || onlyDigits(c.numeroDocumento) === documento);
    if (found?.id) return String(found.id);
  }

  let nameFromError = '';
  try {
    const fields = JSON.parse(errorText)?.error?.fields || [];
    const msg: string = fields.find((f: any) => f.element === 'cnpj' || f.element === 'cpf')?.msg || '';
    nameFromError = msg.match(/no contato (.+)$/i)?.[1]?.trim() || '';
  } catch { /* resposta sem JSON */ }
  if (!nameFromError) return null;

  await sleep(400);
  const r2 = await fetch(`https://api.bling.com.br/Api/v3/contatos?nome=${encodeURIComponent(nameFromError)}`, { headers });
  if (r2.ok) {
    const found = ((await r2.json())?.data || []).find((c: any) => onlyDigits(c.numeroDocumento) === documento);
    if (found?.id) return String(found.id);
  }
  return null;
}

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

    // ID salvo no Fluxia pode estar desatualizado (contato apagado/duplicado no Bling): nesse caso o Bling
    // responde 404 ou 400 "CNPJ já cadastrado no contato X". Procura o contato verdadeiro e atualiza ele.
    if (res.status === 404 || res.status === 400) {
      const errorText = res.status === 400 ? await res.text() : '';
      const isDocDuplicate = res.status === 404 || isDocumentDuplicateError(errorText);

      if (isDocDuplicate) {
        const realId = await findRealContactId(customerData, errorText, headers);
        if (realId && String(realId) !== String(id)) {
          console.warn(`[Bling Update Customer] ID ${id} desatualizado — atualizando o contato verdadeiro ${realId}.`);
          await sleep(400);
          const retryRes = await fetch(`https://api.bling.com.br/Api/v3/contatos/${realId}`, {
            method: 'PUT', headers, body: JSON.stringify(customerData),
          });
          if (!retryRes.ok) {
            const retryText = await retryRes.text();
            console.error('[Bling Update Customer (contato verdadeiro)] Error:', retryText);
            return NextResponse.json({ error: `Erro na API do Bling: ${retryRes.status} ${retryText}` }, { status: retryRes.status });
          }
          // Devolve o cadastro completo do contato verdadeiro para o Fluxia corrigir o vínculo
          await sleep(400);
          const detailRes = await fetch(`https://api.bling.com.br/Api/v3/contatos/${realId}`, { headers });
          const detail = detailRes.ok ? (await detailRes.json()).data : { id: realId };
          return NextResponse.json({ success: true, resolvedId: String(realId), data: detail });
        }
      }

      if (res.status === 400) {
        console.error('[Bling Update Customer API] Error:', errorText);
        return NextResponse.json({ error: `Erro na API do Bling: 400 ${errorText}` }, { status: 400 });
      }
    }

    // Se o contato não existe mais no Bling (404) e não há outro com o mesmo documento, cria como novo (POST)
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
