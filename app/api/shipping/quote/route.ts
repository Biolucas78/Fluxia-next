import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';
import { XMLParser } from 'fast-xml-parser';

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br')
  .replace(/\/$/, '');
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
const CORREIOS_DR = process.env.CORREIOS_DR;

// Cache para prazos de entrega (CEP Origem + CEP Destino + Serviço)
// Válido por 12 horas para economizar chamadas à API de Prazo
const DELIVERY_TIME_CACHE = new Map<string, { time: number, expires: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; 

async function getCorreiosQuotes(destinationCep: string, weight: number, dimensions: any, originCep: string, insuranceValue: number = 0) {
  if (!CORREIOS_USER || !CORREIOS_TOKEN || !originCep) return [];

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
        cepOrigem: originCep.replace(/\D/g, ''),
        cepDestino: destinationCep.replace(/\D/g, ''),
        psObjeto: Math.round(weight).toString(),
        tpObjeto: "2", // 2 = Caixa/Pacote
        comprimento: Math.round(dimensions.length).toString(),
        largura: Math.round(dimensions.width).toString(),
        altura: Math.round(dimensions.height).toString()
      });

      if (insuranceValue > 0) {
        // A API REST dos Correios espera o separador decimal como ponto.
        // Além disso, o valor mínimo declarado para os Correios é R$ 25,00.
        const correiosInsuranceValue = Math.max(25, insuranceValue);
        queryParams.append('vlDeclarado', correiosInsuranceValue.toFixed(2));
        
        // O código do serviço adicional de Valor Declarado muda de acordo com o serviço principal
        const vdCode = service.id === '03298' ? '064' : '019'; // 064 para PAC, 019 para SEDEX
        queryParams.append('servicosAdicionais', vdCode);
      }

      if (CORREIOS_CONTRACT && CORREIOS_DR) {
        queryParams.append('nuContrato', CORREIOS_CONTRACT.replace(/\D/g, ''));
        queryParams.append('nuDR', CORREIOS_DR.replace(/\D/g, ''));
      }
      
      const url = `https://api.correios.com.br/preco/v1/nacional/${service.id}?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Correios error response (${service.name}):`, response.status, errorText.substring(0, 200));
        
        let errorMessage = 'Erro na API dos Correios';
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.msgs && errJson.msgs.length > 0) {
            errorMessage = errJson.msgs[0];
          } else if (errJson.mensagem) {
            errorMessage = errJson.mensagem;
          }
        } catch (e) {}

        return {
          id: `correios-${service.id}-err`,
          provider: 'Correios',
          name: `Correios (${service.name})`,
          error: errorMessage,
          price: 0,
          delivery_time: 0,
          company: {
            id: 1,
            name: 'Correios',
            picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png'
          }
        };
      }
      
      const data = await response.json();
      
      let deliveryTime = parseInt(data.prazoEntrega || data.prazo || "0");

      // Se o prazo vier zerado, tentamos o cache ou o endpoint de prazo (contingência)
      if (deliveryTime === 0) {
        const cacheKey = `${originCep.replace(/\D/g, '')}-${destinationCep.replace(/\D/g, '')}-${service.id}`;
        const cached = DELIVERY_TIME_CACHE.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
          deliveryTime = cached.time;
        } else {
          try {
            const urlPrazo = `https://api.correios.com.br/prazo/v1/nacional/${service.id}?${queryParams.toString()}`;
            const responsePrazo = await fetch(urlPrazo, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Accept': 'application/json'
              }
            });
            if (responsePrazo.ok) {
              const dataPrazo = await responsePrazo.json();
              deliveryTime = parseInt(dataPrazo.prazoEntrega || dataPrazo.prazo || "0");
              
              // Guarda no cache se o prazo for válido
              if (deliveryTime > 0) {
                DELIVERY_TIME_CACHE.set(cacheKey, {
                  time: deliveryTime,
                  expires: Date.now() + CACHE_TTL
                });
              }
            }
          } catch (e) {
            console.error(`Erro na contingência de prazo Correios (${service.name}):`, e);
          }
        }
      }

      if (!data || !data.pcFinal) {
        console.warn(`Correios quote response missing price data (${service.name}):`, data);
        return {
          id: `correios-${service.id}-err-price`,
          provider: 'Correios',
          name: `Correios (${service.name})`,
          error: 'Preço não disponível para este serviço/trecho',
          price: 0,
          delivery_time: 0,
          company: {
            id: 1,
            name: 'Correios',
            picture: 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png'
          }
        };
      }

      return {
        id: `correios-${data.coProduto || service.id}`,
        provider: 'Correios',
        name: `Correios (${service.name})`,
        price: parseFloat(data.pcFinal.replace(',', '.')),
        currency: 'BRL',
        delivery_time: deliveryTime,
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

async function getMelhorEnvioQuotes(destinationCep: string, weight: number, dimensions: any, originCep: string, insuranceValue: number = 0) {
  if (!MELHOR_ENVIO_TOKEN || !originCep) return [];
  
  try {
    const payload = {
      from: { postal_code: originCep.replace(/\D/g, '') },
      to: { postal_code: destinationCep.replace(/\D/g, '') },
      volumes: [{
        width: dimensions.width,
        height: dimensions.height,
        length: dimensions.length,
        weight: weight / 1000,
        insurance_value: Math.max(0, insuranceValue)
      }],
      options: {
        receipt: false,
        own_hand: false,
        insurance: true
      }
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
      console.error('Melhor Envio error response:', response.status, errorText.substring(0, 200));
      return [];
    }

    const data = await response.json();
    
    // Fetch agencies for Jadlog if needed (Jadlog IDs are usually 3 and 4)
    // For a "perfect integration", we should ideally return agency options, 
    // but for now we'll pick the first available agency for the sender
    const quotes = await Promise.all(data
      .filter((option: any) => !option.error)
      .map(async (option: any) => {
        const quote: any = {
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
        };

        // If Jadlog (ID 3 or 4) or other carriers that might need an agency
        if ([3, 4].includes(option.id)) {
          try {
            const agencyRes = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/agencies?company=${option.company.id}&postal_code=${originCep.replace(/\D/g, '')}`, {
              headers: {
                'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN.trim()}`,
                'Accept': 'application/json'
              }
            });
            if (agencyRes.ok) {
              const agencies = await agencyRes.json();
              if (agencies && agencies.length > 0) {
                quote.agency = agencies[0]; // Pick the first agency for the sender
              }
            }
          } catch (e) {
            console.warn('Failed to fetch agencies for Jadlog:', e);
          }
        }

        return quote;
      }));

    return quotes;
  } catch (e) {
    console.error('Melhor Envio error:', e);
    return [];
  }
}
async function getSuperfreteQuotes(destinationCep: string, weight: number, dimensions: any, originCep: string) {
  if (!SUPERFRETE_TOKEN || !originCep) return [];

  try {
    const payload = {
      from: { postal_code: originCep.replace(/\D/g, '') },
      to: { postal_code: destinationCep.replace(/\D/g, '') },
      services: "1,2", // 1: PAC, 2: SEDEX
      package: {
        width: dimensions.width,
        height: dimensions.height,
        length: dimensions.length,
        weight: weight / 1000,
      }
    };

    const baseUrl = SUPERFRETE_URL.endsWith('/calculator') ? SUPERFRETE_URL.replace(/\/calculator$/, '') : SUPERFRETE_URL;
    const response = await fetch(`${baseUrl}/calculator`, {
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
      console.error('Superfrete error response:', response.status, errorText.substring(0, 200));
      return [];
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Superfrete returned non-JSON response:', response.status, text.substring(0, 200));
      return [];
    }

    const data = await response.json();
    
    // Superfrete can return an array or an object with a services property
    const options = Array.isArray(data) ? data : (data.services || []);

    return options.map((option: any) => ({
        id: `sf-${option.id}`,
        provider: 'Superfrete',
        name: option.name,
        price: parseFloat(option.price),
        currency: 'BRL',
        delivery_time: option.delivery_time,
        company: {
          id: option.company?.id || 1,
          name: option.company?.name || 'Correios',
          picture: option.company?.picture || 'https://www.melhorenvio.com.br/images/shipping-companies/correios.png'
        }
    }));
  } catch (e) {
    console.error('Superfrete error:', e);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const { destinationCep, weight, boxDimensions, originType, insuranceValue } = await req.json();

    let selectedOriginCep = '';
    try {
      if (originType === 'BH') {
        const bh = JSON.parse(process.env.ORIGIN_BH_JSON || '{}');
        selectedOriginCep = bh.postal_code || bh.zip || '';
      } else if (originType === 'CRV') {
        const crv = JSON.parse(process.env.ORIGIN_CRV_JSON || '{}');
        selectedOriginCep = crv.postal_code || crv.zip || '';
      } else {
        // Fallback para o CEP global se nenhum tipo for especificado
        selectedOriginCep = ORIGIN_CEP || '';
      }
    } catch (e) {
      console.error('Erro ao parsear JSON de origem', e);
      selectedOriginCep = ORIGIN_CEP || '';
    }

    if (!selectedOriginCep) {
      return NextResponse.json({ error: 'CEP de origem não configurado. Verifique se as variáveis ORIGIN_BH_JSON ou ORIGIN_CRV_JSON (Conceição do Rio Verde) estão preenchidas nos segredos.' }, { status: 400 });
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
    const safeWeight = Math.max(100, Number(weight) || 0); // minimum 100g
    const safeInsuranceValue = parseFloat(insuranceValue || '0');

    const [meQuotes, sfQuotes, correiosQuotes] = await Promise.all([
      getMelhorEnvioQuotes(cleanDestinationCep, safeWeight, dimensions, selectedOriginCep, safeInsuranceValue),
      getSuperfreteQuotes(cleanDestinationCep, safeWeight, dimensions, selectedOriginCep),
      getCorreiosQuotes(cleanDestinationCep, safeWeight, dimensions, selectedOriginCep, safeInsuranceValue)
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
      hasCorreiosDR: !!CORREIOS_DR,
      hasOriginCep: !!ORIGIN_CEP,
      originCep: ORIGIN_CEP ? `${ORIGIN_CEP.substring(0, 2)}*****` : null,
      melhorEnvioUrl: MELHOR_ENVIO_URL
    }
  });
}
