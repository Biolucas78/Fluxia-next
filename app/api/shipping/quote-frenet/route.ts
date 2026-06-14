import { NextResponse } from 'next/server';

const FRENET_TOKEN = process.env.FRENET_TOKEN;
const FRENET_LEGACY_URL = 'https://api.frenet.com.br';

// Cache por 5 min
const cache = new Map<string, { data: any; expiresAt: number }>();

export async function POST(req: Request) {
  try {
    const { destinationCep, weight, boxDimensions, originType, insuranceValue } = await req.json();

    if (!FRENET_TOKEN) {
      return NextResponse.json({ error: 'Token Frenet não configurado.' }, { status: 500 });
    }

    if (!destinationCep || !weight) {
      return NextResponse.json({ error: 'CEP e peso são obrigatórios.' }, { status: 400 });
    }

    let originCep = '';
    let sellerDoc = '';
    try {
      const originJson = JSON.parse(
        originType === 'BH' ? (process.env.ORIGIN_BH_JSON || '{}') : (process.env.ORIGIN_CRV_JSON || '{}')
      );
      originCep = (originJson.postal_code || originJson.zip || '').replace(/\D/g, '');
      const jsonDoc = (originJson.company_document || originJson.document || '').replace(/\D/g, '');
      const envDoc = (process.env.ORIGIN_DOCUMENT || '').replace(/\D/g, '');
      sellerDoc = jsonDoc || envDoc;
    } catch (e) {
      console.error('Frenet: erro ao parsear JSON de origem', e);
    }

    if (!originCep) {
      return NextResponse.json({ error: 'CEP de origem não configurado.' }, { status: 400 });
    }

    const destCep = destinationCep.replace(/\D/g, '');
    const weightKg = Math.max(0.1, weight / 1000);
    const declaredValue = Math.max(0, parseFloat(insuranceValue || '0'));
    const height = Math.max(2, boxDimensions?.height || 10);
    const width = Math.max(11, boxDimensions?.width || 15);
    const length = Math.max(16, boxDimensions?.length || 15);

    const cacheKey = `${originCep}-${destCep}-${weightKg.toFixed(3)}-${height}-${width}-${length}-${declaredValue.toFixed(2)}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }

    const payload = {
      SellerCPFCNPJ: sellerDoc,
      ShipFrom: { Zipcode: originCep },
      ShipTo: { Zipcode: destCep },
      ShippingItemArray: [{
        Weight: weightKg,
        Length: length,
        Height: height,
        Width: width,
        Quantity: 1,
        InsuredDeclaredValue: declaredValue.toFixed(2)
      }]
    };

    const response = await fetch(`${FRENET_LEGACY_URL}/shipping/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'token': FRENET_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('Frenet Legacy Quote (sellerDoc length:', sellerDoc.length, '):', responseText.substring(0, 600));

    if (!response.ok) {
      return NextResponse.json({ error: `Frenet: HTTP ${response.status}` }, { status: 502 });
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: 'Resposta inválida da Frenet.' }, { status: 502 });
    }

    // Frenet tem um typo no campo: "ShippingSevicesArray" em vez de "ShippingServicesArray"
    const services: any[] = data.ShippingSevicesArray || data.ShippingServicesArray || [];
    const valid = services.filter((s: any) => !s.Error && parseFloat(s.ShippingPrice) > 0);

    if (!valid.length) {
      const firstError = services[0]?.Msg || 'Nenhuma opção disponível para este CEP.';
      return NextResponse.json({ error: firstError }, { status: 404 });
    }

    const result = valid.map((s: any) => ({
      id: `frenet-${s.Carrier}-${s.ServiceCode}`.toLowerCase().replace(/[\s/]/g, '-'),
      provider: 'Frenet',
      name: `${s.Carrier} - ${s.ServiceDescription || s.ServiceCode}`,
      price: parseFloat(s.ShippingPrice),
      currency: 'BRL',
      deliveryTime: parseInt(s.DeliveryTime, 10) > 0 ? `${s.DeliveryTime} dias úteis` : 'Consulte prazo',
      delivery_time: parseInt(s.DeliveryTime, 10) || 0,
      company: {
        name: s.Carrier,
        picture: '/images/frenet-logo.svg'
      },
      frenetServiceCode: s.ServiceCode,
      frenetCarrierCode: s.Carrier,
      frenetCarrier: s.Carrier,
      frenetServiceName: s.ServiceDescription || s.ServiceCode,
      frenetShippingPrice: parseFloat(s.ShippingPrice)
    }));

    cache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });

    return NextResponse.json(result);

  } catch (e: any) {
    console.error('Frenet legacy quote error:', e);
    return NextResponse.json({ error: e.message || 'Erro interno.' }, { status: 500 });
  }
}
