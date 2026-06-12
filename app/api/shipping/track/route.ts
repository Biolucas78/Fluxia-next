import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';
import { getTotalExpressApiAuthHeader, TOTAL_EXPRESS_URL, TOTAL_EXPRESS_SENDER_ID } from '@/lib/totalexpress';

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br')
  .replace(/\/$/, '');
const SITERASTREIO_TOKEN = process.env.SITERASTREIO_TOKEN;

// Rastreia qualquer código dos Correios via Site Rastreio (wonca)
async function trackSiteRastreio(trackingNumber: string) {
  if (!SITERASTREIO_TOKEN) {
    console.warn('SiteRastreio: Token não configurado.');
    return null;
  }

  try {
    const response = await fetch('https://api-labs.wonca.com.br/wonca.labs.v1.LabsService/Track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${SITERASTREIO_TOKEN}`
      },
      body: JSON.stringify({ code: trackingNumber.toUpperCase() })
    });

    if (!response.ok) {
      console.warn(`SiteRastreio API error (${response.status})`);
      return null;
    }

    const data = await response.json();
    console.log('SiteRastreio resposta:', JSON.stringify(data).substring(0, 300));

    // A API retorna os dados dentro de um campo "json" como string
    let parsed: any = data;
    if (data.json && typeof data.json === 'string') {
      try {
        parsed = JSON.parse(data.json);
      } catch (e) {
        console.warn('SiteRastreio: Falha ao parsear campo json');
        return null;
      }
    }

    // Suporta objeto único ou array
    const objeto = parsed.objetos?.[0] || parsed;
    const eventos = objeto?.eventos || [];

    if (!objeto || eventos.length === 0) {
      console.warn('SiteRastreio: Nenhum evento retornado para', trackingNumber);
      return null;
    }

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
    };

    const history = eventos.map((e: any) => {
      const friendlyStatus = CORREIOS_STATUS_MAP[e.codigo] || e.descricao || e.status || 'Em trânsito';
      return {
        status: friendlyStatus,
        message: e.detalhe || e.descricao || friendlyStatus,
        date: e.dtHrCriado || e.data || e.date,
        location: e.unidade
          ? `${e.unidade.tipo || ''} - ${e.unidade.endereco?.cidade || ''}/${e.unidade.endereco?.uf || ''}`
          : (e.local || e.location || '')
      };
    });

    const lastEvent = history[0];
    const ultimoCodigo = objeto?.eventos?.[0]?.codigo || '';
    const delivered = ['BDE', 'BDI', 'BDR'].includes(ultimoCodigo) ||
      lastEvent?.status?.toUpperCase().includes('ENTREGUE') || false;

    return {
      status: lastEvent?.status || 'Postado',
      message: lastEvent?.message || 'Objeto em trânsito',
      history,
      delivered,
      deliveryDate: objeto?.dtPrevista || null
    };

  } catch (e) {
    console.error('SiteRastreio tracking error:', e);
    return null;
  }
}

async function trackCorreiosProxy(trackingNumber: string) {
  try {
    const url = `https://proxyapp.correios.com.br/v1/sro-rastro/${trackingNumber.toUpperCase()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
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
      console.error(`Melhor Envio: Resposta não é JSON. Início do corpo: ${text.substring(0, 100)}`);
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

  if (!isUUID(trackingNumber)) {
    try {
      const searchUrl = `${MELHOR_ENVIO_URL}/api/v2/me/orders/search?q=${trackingNumber}`;
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
        }
      });

      if (searchResponse.status === 204) {
        console.warn(`Melhor Envio: Nenhum envio encontrado para ${trackingNumber} (204)`);
        return null;
      }

      if (searchResponse.ok) {
        const contentType = searchResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return null;
        
        const searchData = await searchResponse.json();
        const results = Array.isArray(searchData) ? searchData : (searchData.data || []);
        const shipment = results[0];

        if (shipment && shipment.id && isUUID(shipment.id)) {
          shipmentId = shipment.id;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } catch (e) {
      console.error('Melhor Envio search error:', e);
      return null;
    }
  }

  if (!isUUID(shipmentId)) return null;

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

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return null;

    const data = await response.json();
    const tracking = data[shipmentId];

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
      deliveryDate: tracking.delivered_at || (tracking.status === 'delivered' ? tracking.updated_at : null),
      trackingUrl: `https://www.melhorrastreio.com.br/rastreio/${trackingNumber}`
    };
  } catch (e) {
    console.error('Melhor Envio tracking error:', e);
    return null;
  }
}

async function trackTotalExpress(trackingNumber: string) {
  if (!trackingNumber) return null;

  let authHeader: string;
  try {
    authHeader = getTotalExpressApiAuthHeader();
  } catch (e: any) {
    console.error('Total Express: credenciais não configuradas —', e.message);
    return null;
  }

  try {
    // Envia o AWB como recebido — TEX é case-sensitive (termina em 'tx' minúsculo)
    const response = await fetch(`${TOTAL_EXPRESS_URL}/ics-tracking-encomenda-lv/v1/tracking`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({
        awbs: [trackingNumber]
      })
    });

    if (response.status === 404) {
      console.warn(`Total Express: AWB ${trackingNumber} não encontrado (404)`);
      return null;
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Total Express Tracking error (${response.status}):`, errText.substring(0, 300));
      return null;
    }

    const data = await response.json();
    console.log('Total Express tracking raw:', JSON.stringify(data).substring(0, 600));

    const encomendas = data.data || data.encomendas || [];
    const encomenda = Array.isArray(encomendas) ? encomendas[0] : encomendas;

    if (!encomenda) {
      console.warn('Total Express: Nenhum registro para', trackingNumber);
      return null;
    }

    const eventos: any[] = encomenda.ocorrencias || encomenda.eventos || encomenda.historico || [];

    const history = eventos.map((e: any) => ({
      status: e.descricao || e.status || e.titulo || 'Em trânsito',
      message: e.complemento || e.detalhe || e.descricao || e.status || '',
      date: e.data || e.dataHora || e.dtHr || e.created_at,
      location: [e.cidade, e.uf].filter(Boolean).join('/') || e.local || e.unidade || ''
    }));

    const lastStatus = encomenda.status || encomenda.situacao || history[0]?.status || 'Em trânsito';
    const isDelivered =
      String(lastStatus).toUpperCase().includes('ENTREGUE') ||
      String(lastStatus).toUpperCase().includes('DELIVERED');

    return {
      status: lastStatus,
      message: history[0]?.message || String(lastStatus),
      history,
      delivered: isDelivered,
      deliveryDate: encomenda.dataEntrega || encomenda.dtEntrega || encomenda.previsaoEntrega || null
    };
  } catch (e) {
    console.error('Total Express tracking error:', e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { trackingNumber, shipmentId, shippingProvider, carrier, invoiceNumber } = await req.json();

    if (!trackingNumber && !shipmentId) {
      return NextResponse.json({ error: 'Código de rastreio ou ID de envio ausente.' }, { status: 400 });
    }

    const trimmedTracking = trackingNumber?.trim() || '';
    const upperTracking = trimmedTracking.toUpperCase();
    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const isCorreiosCode = (str: string) => str.length === 13 && /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(str);

    let result = null;

    const getTrackingDirectLink = (c: string, code: string, nfiscal?: string) => {
      const lowerC = (c || '').toLowerCase();
      if (lowerC.includes('melhor') || lowerC.includes('envio')) {
        return `https://melhorrastreio.com.br/rastreio/${code}`;
      }
      if (lowerC.includes('total')) {
        const reid = TOTAL_EXPRESS_SENDER_ID || '65818';
        const awb = encodeURIComponent(code);
        const nf = encodeURIComponent(nfiscal || code);
        return `https://tracking.totalexpress.com.br/poupup_track.php?reid=${reid}&pedido=${awb}&nfiscal=${nf}`;
      }
      return `https://www.siterastreio.com.br/${code}`;
    };

    // PRIORIDADE 1: Código formato Correios
    if (isCorreiosCode(upperTracking)) {
      const isOfficialCorreios = shippingProvider === 'correios';

      if (isOfficialCorreios) {
        // Etiqueta gerada pelo nosso sistema via API dos Correios — usa API oficial (não gasta SiteRastreio)
        console.log(`Código Correios contrato: ${upperTracking}. Tentando API Oficial.`);
        result = await trackCorreios(upperTracking);

        if (!result) {
          console.log(`API Oficial falhou. Tentando Proxy dos Correios.`);
          result = await trackCorreiosProxy(upperTracking);
        }
      } else {
        // Código colado manualmente (Superfrete, pré-postagem, etc.) — usa SiteRastreio
        console.log(`Código Correios externo: ${upperTracking}. Tentando SiteRastreio.`);
        result = await trackSiteRastreio(upperTracking);

        if (!result) {
          console.log(`SiteRastreio falhou. Tentando API Oficial como fallback.`);
          result = await trackCorreios(upperTracking);
        }
      }
    }

    // PRIORIDADE 2: shipmentId UUID do Melhor Envio
    if (!result && shipmentId && isUUID(shipmentId) && shippingProvider === 'melhorenvio') {
      console.log(`Rastreio direto via ID Melhor Envio: ${shipmentId}`);
      result = await trackMelhorEnvioById(shipmentId);
    }

    // PRIORIDADE 3: Total Express (AWB termina em "tx" ou shippingProvider = totalexpress)
    const isTEXCode = (str: string) => /^[A-Za-z0-9]+tx$/i.test(str);
    if (!result && trimmedTracking && (shippingProvider === 'totalexpress' || isTEXCode(trimmedTracking))) {
      console.log(`Rastreio Total Express: ${trimmedTracking}`);
      result = await trackTotalExpress(trimmedTracking);
    }

    // PRIORIDADE 4: trackingNumber é UUID (Melhor Envio)
    if (!result && isUUID(trimmedTracking)) {
      console.log(`Rastreio via Melhor Envio UUID: ${trimmedTracking}`);
      result = await trackMelhorEnvio(trimmedTracking);
    }

    // PRIORIDADE 5: Busca genérica no Melhor Envio
    if (!result && !isCorreiosCode(upperTracking) && !isUUID(trimmedTracking) && trimmedTracking) {
      console.log(`Busca genérica no Melhor Envio: ${trimmedTracking}`);
      result = await trackMelhorEnvio(trimmedTracking);
    }

    if (result) {
      return NextResponse.json(result);
    }

    return NextResponse.json({
      error: 'Rastreio não encontrado no sistema automático.',
      directLink: getTrackingDirectLink(carrier || shippingProvider || '', trimmedTracking || shipmentId || '', invoiceNumber)
    }, { status: 404 });

  } catch (e: any) {
    console.error('Track route error:', e);
    return NextResponse.json({ error: e.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}