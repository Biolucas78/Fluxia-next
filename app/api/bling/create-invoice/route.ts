import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { blingOrderId } = await request.json();
    if (!blingOrderId) {
      return NextResponse.json({ error: 'ID do pedido no Bling não fornecido.' }, { status: 400 });
    }

    console.log(`[Bling API] Gerando NF-e para o pedido: ${blingOrderId}`);

    // 1. Criar a nota fiscal a partir do pedido
    const response = await fetch('https://api.bling.com.br/v3/notas/vendas', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pedido: { id: Number(blingOrderId) }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Bling API] Erro ao gerar nota:', JSON.stringify(errorData, null, 2));
      return NextResponse.json({ 
        error: errorData.error?.description || 'Erro ao gerar nota fiscal no Bling.',
        details: errorData
      }, { status: response.status });
    }

    const data = await response.json();
    const invoiceId = data.data?.id;

    // 2. Buscar a chave de acesso da nota (pode levar alguns segundos para ser gerada/autorizada)
    // Em um cenário real, poderíamos precisar de um polling ou webhook.
    // Para simplificar, vamos tentar buscar uma vez após um pequeno delay.
    await new Promise(resolve => setTimeout(resolve, 2000));

    const invoiceResponse = await fetch(`https://api.bling.com.br/v3/notas/vendas/${invoiceId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    let invoiceKey = '';
    let invoiceNumber = '';
    let invoiceValue = 0;
    if (invoiceResponse.ok) {
      const invoiceData = await invoiceResponse.json();
      invoiceKey = invoiceData.data?.chaveAcesso || '';
      invoiceNumber = invoiceData.data?.numero || '';
      invoiceValue = invoiceData.data?.valorNota || 0;
    }

    return NextResponse.json({ 
      success: true, 
      invoiceId, 
      invoiceKey,
      invoiceNumber,
      invoiceValue,
      message: 'Nota fiscal gerada com sucesso!' 
    });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: error.message || 'Failed to create invoice' }, { status: 500 });
  }
}
