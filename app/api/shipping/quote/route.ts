import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br').replace(/\/$/, '');
const SUPERFRETE_TOKEN = process.env.SUPERFRETE_TOKEN;
const SUPERFRETE_URL = (process.env.SUPERFRETE_URL || 'https://api.superfrete.com/api/v0').replace(/\/$/, '');
let ORIGIN_CEP = process.env.ORIGIN_CEP;

if (!ORIGIN_CEP) {
  try {
    const bh = JSON.parse(process.env.ORIGIN_BH_JSON || '{}');
    if (bh.postal_code || bh.zip) ORIGIN_CEP = bh.postal_code || bh.zip;
    else {
      const crv = JSON.parse(process.env.ORIGIN_CRV_JSON || '{}');
      if (crv.postal_code || crv.zip) ORIGIN_CEP = crv.postal_code || crv.zip;
    }
  } catch (e) {
    console.error('Erro ao fazer parse dos JSONs de origem', e);
  }
}

const CORREIOS_USER = process.env.CORREIOS_USER;
const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;
const CORREIOS_CONTRACT = process.env.CORREIOS_CONTRACT;

async function getCorreiosQuotes(destinationCep: string, weight: number, dimensions: any) {
  if (!CORREIOS_USER || !CORREIOS_TOKEN || !ORIGIN_CEP) return [];

  try {
    // 1. Autenticação (Usando a função compartilhada)
    const bearerToken = await getCorreiosToken();

    // 2. Cotação (Preço e Prazo)
    const services = [
      { id: "03220", name: "SEDEX" },
      { id: "03298", name: "PAC" }
    ];

    const quotePromises = services.map(async (service) => {
      const queryParams = new URLSearchParams({
        cepOrigem: ORIGIN_CEP.replace(/\D/g, ''),
        cepDestino: destinationCep.replace(/\D/g, ''),
        psObjeto: Math.round(weight).toString(),
        tpObjeto: "2",
        comprimento: Math.round(dimensions.length).toString(),
        largura: Math.round(dimensions.width).toString(),
        altura: Math.round(dimensions.height).toString()
      });
      const url = `https://api.correios.com.br/preco/v1/nacional/${service.id}?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
        }
      });

      if (!response.ok) return null;
      
      const data = await response.json();
      return {
        id: `correios-${data.coProduto}`,
        provider: 'Correios',
        name: `Correios (${service.name})`,
        price: parseFloat(data.pcFinal.replace(',', '.')),
        currency: 'BRL',
        delivery_time: 0,
        company: {
          id: 1,
          name: 'Correios',
          picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png'
        }
      };
    });

    const results = await Promise.all(quotePromises);
    return results.filter(result => result !== null);
  } catch (e) {
    console.error('Correios quote error:', e);
    return [];
  }
}

async function getMelhorEnvioQuotes(destinationCep: string, weight: number, dimensions: any) {
  if (!MELHOR_ENVIO_TOKEN || !ORIGIN_CEP) return [];

  try {
    const payload = {
      from: { postal_code: ORIGIN_CEP.replace(/\D/g, '') },
      to: { postal_code: destinationCep.replace(/\D/g, '') },
      volumes: [{
        width: dimensions.width,
        height: dimensions.height,
        length: dimensions.length,
        weight: weight / 1000,
        insurance_value: 50.0
      }]
    };

    const response = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Melhor Envio error response:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    return data
      .filter((option: any) => !option.error)
      .map((option: any) => ({
        id: `me-${option.id}`,
        provider: 'Melhor Envio',
        name: option.name,
        price: parseFloat(option.price),
        currency: option.currency,
        delivery_time: option.delivery_time,
        company: {
          id: option.company.id,
          name: option.company.name,
          picture: option.company.picture
        }
      }));
  } catch (e) {
    console.error('Melhor Envio error:', e);
    return [];
  }
}
async function getSuperfreteQuotes(destinationCep: string, weight: number, dimensions: any) {
  if (!SUPERFRETE_TOKEN || !ORIGIN_CEP) return [];

  try {
    const payload = {
      from: { postal_code: ORIGIN_CEP.replace(/\D/g, '') },
      to: { postal_code: destinationCep.replace(/\D/g, '') },
      services: "1,2", // 1: PAC, 2: SEDEX
      package: {
        width: dimensions.width,
        height: dimensions.height,
        length: dimensions.length,
        weight: weight / 1000,
      }
    };

    const response = await fetch(`${SUPERFRETE_URL}/calculator`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPERFRETE_TOKEN.trim()}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Superfrete error response:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    return data.map((option: any) => ({
        id: `sf-${option.id}`,
        provider: 'Superfrete',
        name: option.name,
        price: parseFloat(option.price),
        currency: 'BRL',
        delivery_time: option.delivery_time,
        company: {
          id: option.company.id,
          name: option.company.name,
          picture: option.company.picture
        }
    }));
  } catch (e) {
    console.error('Superfrete error:', e);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const { destinationCep, weight, boxDimensions } = await req.json();

    if (!ORIGIN_CEP) {
      console.warn('CEP de origem não configurado. Usando mock data.');
      return NextResponse.json([
        {
          id: 'mock-1',
          provider: 'Demo (Melhor Envio)',
          name: 'SEDEX',
          price: 25.90,
          currency: 'BRL',
          delivery_time: 3,
          company: { id: 1, name: 'Correios', picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png' }
        },
        {
          id: 'mock-2',
          provider: 'Demo (Melhor Envio)',
          name: 'PAC',
          price: 18.50,
          currency: 'BRL',
          delivery_time: 8,
          company: { id: 1, name: 'Correios', picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png' }
        }
      ]);
    }

    if (!destinationCep || !weight) {
      return NextResponse.json({ error: 'Dados de destino ou peso ausentes.' }, { status: 400 });
    }

    const cleanDestinationCep = destinationCep.replace(/\D/g, '');
    if (cleanDestinationCep.length !== 8) {
      return NextResponse.json({ error: 'CEP de destino inválido. Deve conter 8 dígitos.' }, { status: 400 });
    }

    const dimensions = {
      width: Math.max(11, boxDimensions?.width || 15),
      height: Math.max(2, boxDimensions?.height || 15),
      length: Math.max(16, boxDimensions?.length || 15)
    };
    const safeWeight = Math.max(100, weight); // minimum 100g

    const [meQuotes, sfQuotes, correiosQuotes] = await Promise.all([
      getMelhorEnvioQuotes(cleanDestinationCep, safeWeight, dimensions),
      getSuperfreteQuotes(cleanDestinationCep, safeWeight, dimensions),
      getCorreiosQuotes(cleanDestinationCep, safeWeight, dimensions)
    ]);
    
    const allOptions = [...meQuotes, ...sfQuotes, ...correiosQuotes].sort((a, b) => a.price - b.price);

    // If no real providers returned quotes
    if (allOptions.length === 0) {
      if (process.env.NODE_ENV === 'production' && (MELHOR_ENVIO_TOKEN || SUPERFRETE_TOKEN || CORREIOS_USER)) {
        return NextResponse.json({ error: 'Nenhuma transportadora retornou cotação. Verifique suas credenciais e os dados do pedido (CEP, peso, dimensões).' }, { status: 400 });
      }
      
      console.warn('Nenhuma cotação real encontrada. Retornando mock data.');
      return NextResponse.json([
        {
          id: 'mock-1',
          provider: 'Demo (Melhor Envio)',
          name: 'SEDEX',
          price: 25.90,
          currency: 'BRL',
          delivery_time: 3,
          company: { id: 1, name: 'Correios', picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png' }
        },
        {
          id: 'mock-2',
          provider: 'Demo (Melhor Envio)',
          name: 'PAC',
          price: 18.50,
          currency: 'BRL',
          delivery_time: 8,
          company: { id: 1, name: 'Correios', picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png' }
        }
      ]);
    }

    return NextResponse.json(allOptions);
  } catch (error) {
    console.error('Shipping quote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    config: {
      hasMelhorEnvio: !!MELHOR_ENVIO_TOKEN,
      hasSuperfrete: !!SUPERFRETE_TOKEN,
      hasCorreios: !!(CORREIOS_USER && CORREIOS_TOKEN),
      hasOriginCep: !!ORIGIN_CEP,
      originCep: ORIGIN_CEP ? `${ORIGIN_CEP.substring(0, 2)}*****` : null,
      melhorEnvioUrl: MELHOR_ENVIO_URL
    }
  });
}
