import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

const CORREIOS_USER = process.env.CORREIOS_USER;
const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;
const CORREIOS_CONTRACT = process.env.CORREIOS_CONTRACT;

async function generateCorreiosLabel(order: any, selectedOption: any, token: string, origin: any) {
  // 1. Extrair e formatar o código do serviço (ex: "03220")
  const serviceCode = selectedOption.id.toString().replace(/\D/g, '').padStart(5, '0');
  
  // 2. Calcular volumes e peso
  const volumes = order.products.map((p: any) => ({
    peso: (parseFloat(p.weight?.toString().replace('g', '') || '0') / 1000) * (p.quantity || 1),
    altura: order.boxDimensions?.height || 10,
    largura: order.boxDimensions?.width || 10,
    comprimento: order.boxDimensions?.length || 10
  }));

  const totalWeightKg = volumes.reduce((acc: number, v: any) => acc + v.peso, 0);

  // 3. Formatar endereço do destinatário
  const parsedAddress = {
    logradouro: order.addressDetails?.street || order.address?.split(',')[0]?.trim() || '',
    numero: order.addressDetails?.number || order.address?.split(',')[1]?.trim() || 'S/N',
    complemento: order.addressDetails?.complement || order.address?.split(',')[2]?.trim() || '',
    bairro: order.addressDetails?.district || order.address?.split(',')[3]?.trim() || '',
    cidade: order.addressDetails?.city || order.address?.split(',')[4]?.trim() || '',
    uf: order.addressDetails?.state || order.address?.split(',')[5]?.trim() || 'UF',
    cep: order.addressDetails?.zip?.toString().replace(/\D/g, '') || order.address?.match(/\d{5}-\d{3}/)?.[0]?.replace('-', '') || ''
  };

  // 4. Montar a declaração de conteúdo
  const declaracaoConteudo = order.products
    .filter((p: any) => p.name)
    .map((p: any) => ({
      descricao: p.name.substring(0, 50), // Limite de caracteres dos Correios
      quantidade: p.quantity || 1,
      valor: parseFloat(order.insuranceValue || 0) / (order.products.length || 1),
      peso: (parseFloat(p.weight?.toString().replace('g', '') || '0') / 1000) * (p.quantity || 1)
    }));

  if (declaracaoConteudo.length === 0) {
    throw new Error('Declaração de conteúdo obrigatória');
  }

  // 5. Construção do Request Body Definitivo para a API dos Correios
  const requestBody = {
    codigoServico: serviceCode,
    remetente: {
      nome: (origin.name || 'Remetente Padrão').substring(0, 50),
      email: origin.email || 'remetente@email.com',
      cpfCnpj: origin.document?.replace(/\D/g, '') || origin.company_document?.replace(/\D/g, '') || '00000000000000',
      dddCelular: origin.phone?.replace(/\D/g, '').substring(0, 2) || '11',
      celular: origin.phone?.replace(/\D/g, '').substring(2, 11) || '999999999',
      endereco: {
        logradouro: origin.address || 'Endereço Padrão',
        numero: origin.number || 'S/N',
        complemento: origin.complement || '',
        bairro: origin.district || 'Centro',
        cidade: origin.city || 'Belo Horizonte',
        uf: origin.state_abbr || 'MG',
        cep: (origin.zip || origin.postal_code || '30000000').replace(/\D/g, '')
      }
    },
    destinatario: {
      nome: order.clientName.substring(0, 50),
      email: order.email || 'cliente@email.com',
      cpfCnpj: order.cnpj?.replace(/\D/g, '') || order.cpf?.replace(/\D/g, '') || '00000000000',
      dddCelular: order.phone?.replace(/\D/g, '').substring(0, 2) || '11',
      celular: order.phone?.replace(/\D/g, '').substring(2, 11) || '999999999',
      endereco: parsedAddress
    },
    pesoInformado: Math.round(totalWeightKg * 1000).toString(), // Peso em gramas
    codigoFormatoObjetoInformado: "2", // 2 = Caixa/Pacote
    comprimentoInformado: (volumes[0]?.comprimento || 16).toString(),
    larguraInformada: (volumes[0]?.largura || 11).toString(),
    alturaInformada: (volumes[0]?.altura || 2).toString(),
    diametroInformado: "0",
    itensDeclaracaoConteudo: declaracaoConteudo.map((item: any) => ({
      conteudo: item.descricao,
      quantidade: item.quantidade.toString(),
      valor: item.valor.toFixed(2)
    })),
    cienteObjetoNaoProibido: "1"
  };

  const response = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Resposta não JSON:', responseText);
    data = { msg: 'Resposta inválida ou erro inesperado dos Correios' };
  }

  if (!response.ok) {
    console.error('Erro Correios PLP:', data);
    throw new Error(data.msg || data.mensagem || 'Erro ao gerar etiqueta Correios');
  }

  // Extrair o ID da pré-postagem (pode vir como 'id' ou 'idPrePostagem')
  const prePostageId = data.id || data.idPrePostagem;
  if (!prePostageId) {
    console.error('Resposta dos Correios sem ID:', data);
    throw new Error('ID da pré-postagem não retornado pelos Correios');
  }

  // Solicitar a geração do rótulo (etiqueta) de forma assíncrona
  const labelRequest = {
    idsPrePostagem: [prePostageId],
    idCorreios: data.idCorreios,
    numeroCartaoPostagem: data.numeroCartaoPostagem || CORREIOS_CARD?.replace(/\D/g, ''),
    tipoRotulo: "P",
    formatoRotulo: "ET",
    layoutImpressao: "LINEAR_100_150"
  };

  const labelResponse = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(labelRequest)
  });

  if (labelResponse.ok) {
    const labelResult = await labelResponse.json();
    data.idRecibo = labelResult.idRecibo;
  } else {
    const errorText = await labelResponse.text();
    console.error('Erro ao solicitar rótulo:', errorText);
    // Se falhar aqui, ainda retornamos os dados da pré-postagem, mas sem o idRecibo
    // O frontend ou o proxy de download devem lidar com isso
  }

  return data;
}

export async function POST(req: Request) {
  try {
    const { order, selectedOption } = await req.json();

    // Lógica para definir a origem (remetente)
    const isMelhorEnvio = selectedOption.provider === 'Melhor Envio';
    let origin;
    try {
        if (isMelhorEnvio) {
            origin = JSON.parse(process.env.ORIGIN_BH_JSON || '{}');
        } else {
            origin = JSON.parse(process.env.ORIGIN_CRV_JSON || '{}');
        }
        
        origin.country_id = 'BR';
        const cnpj = process.env.ORIGIN_DOCUMENT || origin.document || '00000000000000';
        const cpf = process.env.ORIGIN_CPF || '00000000000';
        origin.document = cpf;
        origin.company_document = cnpj;
    } catch (e) {
        console.error('Erro ao processar JSON de origem:', e);
        return NextResponse.json({ error: 'Erro na configuração do endereço de origem.' }, { status: 500 });
    }

    if (selectedOption.provider === 'Correios') {
      const token = await getCorreiosToken();
      const labelData = await generateCorreiosLabel(order, selectedOption, token, origin);
      
      // Construir a URL para download da etiqueta através do nosso proxy
      const labelUrl = labelData.idRecibo ? `/api/shipping/label/download?idRecibo=${labelData.idRecibo}` : null;

      return NextResponse.json({ 
          success: true, 
          labelUrl: labelUrl,
          trackingNumber: labelData.codigoObjeto,
          idRecibo: labelData.idRecibo
      });
    }

    // Lógica existente para Melhor Envio/Superfrete
    const token = process.env.MELHOR_ENVIO_TOKEN;
    if (!token) return NextResponse.json({ error: 'Token Melhor Envio não configurado.' }, { status: 500 });

    // 1. Add to cart
    let serviceId = selectedOption.id.toString();
    // Extract numeric part if it has a prefix like "me-" or "sf-"
    const match = serviceId.match(/\d+/);
    if (match) {
        serviceId = match[0];
    }
    
    const cartResponse = await fetch(`${process.env.MELHOR_ENVIO_URL}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        service: parseInt(serviceId.toString(), 10),
        agency: selectedOption.agency?.id,
        from: origin,
        to: {
          name: order.clientName,
          phone: order.phone || '00000000000',
          email: order.email || 'cliente@exemplo.com',
          document: order.cnpj || '00000000000',
          address: order.addressDetails?.street || order.address || '',
          number: order.addressDetails?.number || '',
          complement: order.addressDetails?.complement || '',
          district: order.addressDetails?.district || '',
          city: order.addressDetails?.city || '',
          state_abbr: (order.addressDetails?.state || '').length > 2 ? 'MG' : (order.addressDetails?.state || ''), // Simplified for now
          postal_code: order.addressDetails?.zip || '',
          country_id: 'BR'
        },
        products: order.products.map((p: any) => ({
          name: p.name,
          quantity: p.quantity,
          unitary_weight: parseFloat(p.weight) / 1000,
          unitary_value: parseFloat(order.insuranceValue || 0) / (order.products.length || 1)
        })),
        volumes: [{
            height: order.boxDimensions?.height || 10,
            width: order.boxDimensions?.width || 10,
            length: order.boxDimensions?.length || 10,
            weight: Math.max(0.01, (order.boxWeight || 0) / 1000)
        }],
        options: {
            insurance_value: parseFloat(order.insuranceValue || 0),
            invoice: {
                key: order.invoiceKey || ''
            },
            content_description: order.productDescription || ''
        }
      })
    });

    if (!cartResponse.ok) {
        const errorData = await cartResponse.json();
        console.error('Erro ao adicionar ao carrinho:', errorData);
        return NextResponse.json({ error: 'Erro ao adicionar ao carrinho.' }, { status: 500 });
    }

    const cartData = await cartResponse.json();
    const cartId = cartData.id;

    // 2. Checkout
    const checkoutResponse = await fetch(`${process.env.MELHOR_ENVIO_URL}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ orders: [cartId] })
    });

    if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.json();
        console.error('Erro no checkout:', errorData);
        return NextResponse.json({ error: 'Erro ao finalizar compra do frete.' }, { status: 500 });
    }

    // 3. Print label
    const printResponse = await fetch(`${process.env.MELHOR_ENVIO_URL}/api/v2/me/shipment/print`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ mode: 'public', orders: [cartId] })
    });

    if (!printResponse.ok) {
        const errorData = await printResponse.json();
        console.error('Erro ao gerar etiqueta:', errorData);
        return NextResponse.json({ error: 'Erro ao gerar etiqueta.' }, { status: 500 });
    }

    const printData = await printResponse.json();
    
    return NextResponse.json({ 
        success: true, 
        labelUrl: printData.url,
        trackingNumber: printData.tracking_number
    });
  } catch (error: any) {
    console.error('Erro na emissão de etiqueta:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
