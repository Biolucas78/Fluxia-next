import { NextResponse } from 'next/server';
import { getTotalExpressApiAuthHeader } from '@/lib/totalexpress';

const TEX_FREIGHT_URL = 'https://edi.totalexpress.com.br/webservice_calculo_frete_v2.php';

// Cache por 5 min — TEX bloqueia requisições idênticas dentro desse período
const cache = new Map<string, { data: any; expiresAt: number }>();

function buildSoapBody(params: {
  cep: string;
  peso: string;
  valorDeclarado: string;
  altura: number;
  largura: number;
  profundidade: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xmlns:xsd="http://www.w3.org/2001/XMLSchema"
              xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
              xmlns:urn="urn:calcularFrete">
<soapenv:Header/>
<soapenv:Body>
    <urn:calcularFrete soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <calcularFreteRequest xsi:type="web:calcularFreteRequest"
            xmlns:web="http://edi.totalexpress.com.br/soap/webservice_calculo_frete.total">
            <TipoServico xsi:type="xsd:string">EXP</TipoServico>
            <CepDestino xsi:type="xsd:nonNegativeInteger">${params.cep}</CepDestino>
            <Peso xsi:type="xsd:string">${params.peso}</Peso>
            <ValorDeclarado xsi:type="xsd:string">${params.valorDeclarado}</ValorDeclarado>
            <TipoEntrega xsi:type="xsd:nonNegativeInteger">0</TipoEntrega>
            <ServicoCOD xsi:type="xsd:boolean">false</ServicoCOD>
            <Altura xsi:type="xsd:nonNegativeInteger">${params.altura}</Altura>
            <Largura xsi:type="xsd:nonNegativeInteger">${params.largura}</Largura>
            <Profundidade xsi:type="xsd:nonNegativeInteger">${params.profundidade}</Profundidade>
        </calcularFreteRequest>
    </urn:calcularFrete>
</soapenv:Body>
</soapenv:Envelope>`;
}

function extractXml(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return match ? match[1].trim() : '';
}

export async function POST(req: Request) {
  try {
    const { destinationCep, weight, boxDimensions, insuranceValue } = await req.json();

    if (!destinationCep || !weight) {
      return NextResponse.json({ error: 'CEP e peso são obrigatórios.' }, { status: 400 });
    }

    const cep = destinationCep.replace(/\D/g, '').padStart(8, '0');
    const pesoKg = weight / 1000;
    // TEX usa vírgula como separador decimal no SOAP
    const pesoFmt = pesoKg.toFixed(2).replace('.', ',');
    const valor = Math.max(1, parseFloat(String(insuranceValue || '0')) || 1);
    const valorFmt = valor.toFixed(2).replace('.', ',');

    const altura = Math.round(boxDimensions?.height || 0);
    const largura = Math.round(boxDimensions?.width || 0);
    const profundidade = Math.round(boxDimensions?.length || 0);

    const cacheKey = `${cep}-${pesoFmt}-${valorFmt}-${altura}-${largura}-${profundidade}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }

    let authHeader: string;
    try {
      authHeader = getTotalExpressApiAuthHeader();
    } catch {
      return NextResponse.json({ error: 'Credenciais Total Express não configuradas.' }, { status: 500 });
    }

    const soapBody = buildSoapBody({ cep, peso: pesoFmt, valorDeclarado: valorFmt, altura, largura, profundidade });

    const response = await fetch(TEX_FREIGHT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'Authorization': authHeader,
        'Accept': '*/*',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)',
        'Accept-Charset': 'UTF-8',
      },
      body: soapBody,
    });

    const xmlText = await response.text();
    console.log('TEX Frete XML:', xmlText.substring(0, 600));

    if (!response.ok) {
      return NextResponse.json({ error: `Total Express: HTTP ${response.status}` }, { status: 502 });
    }

    const codigoProc = extractXml(xmlText, 'CodigoProc');

    if (codigoProc !== '1') {
      const msg = extractXml(xmlText, 'MensagemErro') || extractXml(xmlText, 'Mensagem') || `Erro TEX código ${codigoProc}`;
      console.error('TEX Frete erro:', codigoProc, msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const prazo = parseInt(extractXml(xmlText, 'Prazo'), 10) || 0;
    const preco = parseFloat(extractXml(xmlText, 'ValorServico').replace(',', '.')) || 0;
    const rota = extractXml(xmlText, 'Rota');

    if (preco <= 0) {
      return NextResponse.json({ error: 'Total Express não atende este CEP.' }, { status: 404 });
    }

    const result = [{
      id: 'tex-expresso',
      provider: 'Total Express',
      name: 'TEX Expresso',
      price: preco,
      currency: 'BRL',
      deliveryTime: prazo > 0 ? `${prazo} dias úteis` : 'Consulte prazo',
      delivery_time: prazo,
      company: {
        name: 'Total Express',
        picture: '/images/total-express-logo.svg',
      },
      rota,
    }];

    cache.set(cacheKey, { data: result, expiresAt: now + 5 * 60 * 1000 });

    return NextResponse.json(result);

  } catch (e: any) {
    console.error('TEX quote error:', e);
    return NextResponse.json({ error: e.message || 'Erro interno.' }, { status: 500 });
  }
}
