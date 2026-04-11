import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br')
  .replace(/\/$/, '');

async function trackCorreiosProxy(trackingNumber: string) {
  try {
    // Endpoint público usado pelo App Oficial dos Correios
    const url = `https://proxyapp.correios.com.br/v1/sro-rastro/${trackingNumber.toUpperCase()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // User-Agent mais próximo do App oficial para evitar 403
        'User-Agent': 'Dart/2.15 (dart:io)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR'
      }
    });

    if (!response.ok) {
      console.warn(`Correios Proxy API error (${response.status})`);
      return null;
    }

    const data = await response.json();
    const objeto = data.objetos?.[0];
    
    if (!objeto || objeto.mensagem) return null;

    // Mapeamento dos eventos do Proxy App
    const history = (objeto.eventos || []).map((e: any) => ({
      status: e.descricao,
      message: e.detalhe || e.descricao,
      date: e.dtHrCriado,
      location: e.unidade ? `${e.unidade.tipo} - ${e.unidade.endereco?.cidade}/${e.unidade.endereco?.uf}` : ''
    }));

    const lastEvent = history[0];
    return {
      status: lastEvent?.status || 'Postado',
      message: lastEvent?.message || 'Objeto em trânsito',
      history: history,
      delivered: lastEvent?.status.toUpperCase().includes('ENTREGUE'),
      deliveryDate: objeto.dtPrevista || null
    };
  } catch (e) {
    console.error('Correios Proxy tracking error:', e);
    return null;
  }
}

// Mapa de tradução de status dos Correios para mensagens amigáveis
const CORREIOS_STATUS_MAP: Record<string, string> = {
  'BDE': 'Objeto entregue ao destinatário',
  'BDI': 'Objeto entregue ao destinatário',
  'BDR': 'Objeto entregue ao destinatário',
  'OEC': 'Objeto saiu para entrega ao destinatário',
  'PAR': 'Objeto recebido pelos Correios do Brasil',
  'PO': 'Objeto postado',
  'RO': 'Objeto em trânsito - por favor aguarde',
  'DO': 'Objeto em trânsito - por favor aguarde',
  'LDI': 'Objeto aguardando retirada na agência',
  'FC': 'Objeto saído para entrega cancelado',
  'BDE 01': 'Objeto entregue ao destinatário',
};

async function trackCorreios(trackingNumber: string) {
  try {
    const token = await getCorreiosToken();
    // Adicionando idioma=pt-BR para resolver o erro SRO-018
    const url = `https://api.correios.com.br/srorastro/v1/objetos/${trackingNumber.toUpperCase()}?resultado=T&idioma=pt-BR`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Correios Rastro API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    return processCorreiosData(data);
  } catch (e) {
    console.error('Correios Rastro tracking error:', e);
    return null;
  }
}

function processCorreiosData(data: any) {
  const objeto = data.objetos?.[0];
  if (!objeto || objeto.mensagem) return null;

  const history = (objeto.eventos || []).map((e: any) => {
    const friendlyStatus = CORREIOS_STATUS_MAP[e.codigo] || e.descricao;
    return {
      status: friendlyStatus,
      message: e.detalhe || friendlyStatus,
      date: e.dtHrCriado,
      location: e.unidade ? `${e.unidade.tipo} - ${e.unidade.endereco?.cidade}/${e.unidade.endereco?.uf}` : ''
    };
  });

  const lastEvent = history[0];
  return {
    status: lastEvent?.status || 'Postado',
    message: lastEvent?.message || 'Objeto em trânsito',
    history: history,
    delivered: objeto.tipoPostal?.categoria === 'ENTREGUE' || 
               lastEvent?.status.toUpperCase().includes('ENTREGUE') ||
               ['BDE', 'BDI', 'BDR'].includes(objeto.eventos?.[0]?.codigo),
    deliveryDate: objeto.dtPrevista || null
  };
}

async function trackMelhorEnvioById(shipmentId: string) {
  if (!MELHOR_ENVIO_TOKEN) return null;

  try {
    // Usamos o endpoint de tracking (POST) em vez do de shipment (GET) 
    // porque o de tracking retorna o histórico formatado para rastreio.
    const response = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/tracking`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ orders: [shipmentId] })
    });

    if (!response.ok) {
      console.error(`Melhor Envio Tracking API error (${response.status})`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`Melhor Envio: Resposta não é JSON (${contentType}). Início do corpo: ${text.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const tracking = data[shipmentId];

    if (!tracking || tracking.error) {
      console.warn(`Melhor Envio: Rastreio não encontrado para ID ${shipmentId}`);
      return null;
    }

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
    console.error('Melhor Envio track by ID error:', e);
    return null;
  }
}

async function trackMelhorEnvio(trackingNumber: string) {
  if (!MELHOR_ENVIO_TOKEN) {
    console.warn('Melhor Envio: Token não configurado para rastreamento.');
    return null;
  }

  const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  let shipmentId = trackingNumber;

  // Se o código não for um UUID (36 caracteres), tentamos buscar o ID do envio primeiro
  if (!isUUID(trackingNumber)) {
    try {
      console.log(`Melhor Envio: Buscando ID do envio para o código ${trackingNumber}`);
      const searchUrl = `${MELHOR_ENVIO_URL}/api/v2/me/orders/search?q=${trackingNumber}`;
      console.log(`Melhor Envio: Chamando busca em ${searchUrl}`);
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
        }
      });

      if (searchResponse.status === 204) {
         console.warn(`Melhor Envio: Nenhum envio encontrado para o código ${trackingNumber} (Status 204)`);
         return null;
      }

      if (searchResponse.ok) {
        const contentType = searchResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await searchResponse.text();
          console.error(`Melhor Envio: Resposta não é JSON (${contentType}). Início do corpo: ${text.substring(0, 100)}`);
          return null;
        }
        
        const searchData = await searchResponse.json();
        // O endpoint /orders/search retorna uma lista no campo 'data'
        const shipment = (Array.isArray(searchData.data) ? searchData.data[0] : searchData.data) || searchData;

        if (shipment && shipment.id && isUUID(shipment.id)) {
          console.log(`Melhor Envio: ID encontrado: ${shipment.id}`);
          shipmentId = shipment.id;
        } else {
          console.warn(`Melhor Envio: Nenhum ID de envio (UUID) encontrado para o código ${trackingNumber}. Resultado da busca:`, shipment);
          return null;
        }
      } else {
        const errText = await searchResponse.text();
        console.warn(`Melhor Envio Search API error (${searchResponse.status}):`, errText);
        return null;
      }
    } catch (e) {
      console.error('Melhor Envio search error:', e);
      return null;
    }
  }

  // Se chegamos aqui e ainda não temos um UUID, não chamamos a API de rastreio para evitar o erro 422
  if (!isUUID(shipmentId)) {
    console.warn(`Melhor Envio: shipmentId "${shipmentId}" não é um UUID válido de 36 caracteres.`);
    return null;
  }

  // Agora que temos o ID (ou se já era um ID), chamamos a API de rastreio
  try {
    const response = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/tracking`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ orders: [shipmentId] })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Melhor Envio API error (${response.status}):`, errorData);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`Melhor Envio: Resposta não é JSON (${contentType}). Início do corpo: ${text.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const tracking = data[shipmentId];

    if (!tracking || tracking.error) {
      console.warn(`Melhor Envio: Rastreio não encontrado para ${shipmentId}`);
      return null;
    }

    // Map Melhor Envio status to a more readable format if needed
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
      deliveryDate: tracking.delivered_at || (tracking.status === 'delivered' ? tracking.updated_at : null),
      trackingUrl: `https://www.melhorrastreio.com.br/rastreio/${trackingNumber}`
    };
  } catch (e) {
    console.error('Melhor Envio tracking error:', e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { trackingNumber, shipmentId, shippingProvider } = await req.json();

    if (!trackingNumber && !shipmentId) {
      return NextResponse.json({ error: 'Código de rastreio ou ID de envio ausente.' }, { status: 400 });
    }

    const trimmedTracking = trackingNumber?.trim() || '';
    const upperTracking = trimmedTracking.toUpperCase();
    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    let result = null;

    // 1. Se tivermos o shipmentId (UUID) e o provedor for Melhor Envio, usamos o endpoint direto de shipment
    if (shipmentId && isUUID(shipmentId) && shippingProvider === 'melhorenvio') {
      console.log(`Tentando rastreio direto via ID do Melhor Envio: ${shipmentId}`);
      result = await trackMelhorEnvioById(shipmentId);
    }

    // 2. Se não tivermos resultado ainda, tentamos a lógica anterior
    if (!result) {
      // Try Melhor Envio if it looks like a shipment ID (UUID)
      if (isUUID(trimmedTracking)) {
        console.log(`Tentando rastreio via Melhor Envio para ${trimmedTracking}`);
        result = await trackMelhorEnvio(trimmedTracking);
      }
    }

    // 2. If not found or not a UUID, it might be a carrier tracking code (like Correios)
    if (!result && !isUUID(trimmedTracking)) {
      // Try direct Correios tracking if it looks like a Correios code (13 chars)
      if (upperTracking.length === 13 && /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(upperTracking)) {
        // 1. Try Official API first (Contract)
        console.log(`Tentando rastreio via API Oficial para ${upperTracking}`);
        result = await trackCorreios(upperTracking);
        
        // 2. Try Proxy App as fallback (Public)
        if (!result) {
          console.log(`Tentando rastreio via Proxy App para ${upperTracking}`);
          result = await trackCorreiosProxy(upperTracking);
        }
      }
      
      // 3. Try Melhor Envio as fallback for carrier codes (some might be tracked there)
      if (!result) {
        console.log(`Tentando rastreio via Melhor Envio (fallback) para ${trimmedTracking}`);
        result = await trackMelhorEnvio(trimmedTracking);
      }
    }

    if (!result) {
      // If still no result, provide the direct link to LinkCorreios which the user confirmed works
      return NextResponse.json({ 
        error: 'Rastreio não encontrado no sistema automático.',
        directLink: `https://linkcorreios.com.br/${upperTracking}`
      }, { status: 200 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Tracking error:', error);
    return NextResponse.json({ error: 'Erro interno ao processar rastreamento.' }, { status: 500 });
  }
}
