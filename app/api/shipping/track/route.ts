import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br').replace(/\/$/, '');

async function trackMelhorEnvio(trackingNumber: string) {
  if (!MELHOR_ENVIO_TOKEN) return null;

  try {
    const response = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/tracking`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ orders: [trackingNumber] })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const tracking = data[trackingNumber];

    if (!tracking || tracking.error) return null;

    return {
      status: tracking.status,
      message: tracking.message || tracking.status,
      history: (tracking.history || []).map((h: any) => ({
        status: h.status,
        message: h.message,
        date: h.created_at,
        location: h.location
      })),
      delivered: tracking.status === 'delivered' || tracking.status === 'entregue',
      deliveryDate: tracking.delivered_at || (tracking.status === 'delivered' ? tracking.updated_at : null)
    };
  } catch (e) {
    console.error('Melhor Envio tracking error:', e);
    return null;
  }
}

async function trackCorreios(trackingNumber: string) {
  try {
    const bearerToken = await getCorreiosToken();
    const url = `https://api.correios.com.br/rastreio/v1/objetos/${trackingNumber}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    const objeto = data.objetos?.[0];

    if (!objeto || objeto.mensagem || !objeto.eventos || objeto.eventos.length === 0) return null;

    const lastEvent = objeto.eventos[0];
    const isDelivered = lastEvent.tipo === 'BDE' || lastEvent.tipo === 'BDI' || lastEvent.tipo === 'BDR';

    return {
      status: lastEvent.descricao,
      message: lastEvent.descricao,
      history: objeto.eventos.map((e: any) => ({
        status: e.descricao,
        message: e.detalhe || e.descricao,
        date: `${e.dtEvento} ${e.hrEvento}`,
        location: e.unidade ? `${e.unidade.tipo}: ${e.unidade.nome} (${e.unidade.endereco?.cidade || ''}/${e.unidade.endereco?.uf || ''})` : ''
      })),
      delivered: isDelivered,
      deliveryDate: isDelivered ? `${lastEvent.dtEvento} ${lastEvent.hrEvento}` : null
    };
  } catch (e) {
    console.error('Correios tracking error:', e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { trackingNumber, carrier } = await req.json();

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Código de rastreio ausente.' }, { status: 400 });
    }

    let result = null;

    // Try Melhor Envio first as it's more common if integrated
    result = await trackMelhorEnvio(trackingNumber);

    // If not found or not configured, try Correios directly if it looks like a Correios code
    if (!result && /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(trackingNumber.toUpperCase())) {
      result = await trackCorreios(trackingNumber.toUpperCase());
    }

    if (!result) {
      // Mock data for testing if no real tracking is available
      if (!MELHOR_ENVIO_TOKEN) {
         return NextResponse.json({
            status: 'Em trânsito (Simulação)',
            message: 'Objeto encaminhado para a unidade de distribuição',
            history: [
              { status: 'Postado', message: 'Objeto postado', date: new Date().toISOString(), location: 'Agência Central' },
              { status: 'Em trânsito', message: 'Objeto encaminhado', date: new Date().toISOString(), location: 'CTE' }
            ],
            delivered: false
         });
      }
      return NextResponse.json({ error: 'Rastreio não encontrado ou provedor não configurado.' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Tracking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
