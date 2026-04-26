import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

const CORREIOS_USER = process.env.CORREIOS_USER;
const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;
const CORREIOS_CONTRACT = process.env.CORREIOS_CONTRACT;

async function generateCorreiosLabel(order: any, selectedOption: any, token: string, origin: any, destCpfCnpj: string, destCep: string, totalWeightKg: number) {
  // 1. Extrair e formatar o código do serviço (ex: "03220")
  const serviceCode = selectedOption.id.toString().replace(/\D/g, '').padStart(5, '0');
  
  // 2. Calcular volumes
  const volumes = [{
    peso: totalWeightKg,
    altura: Math.max(2, order.boxDimensions?.height || 10),
    largura: Math.max(11, order.boxDimensions?.width || 10),
    comprimento: Math.max(16, order.boxDimensions?.length || 10)
  }];

  // 3. Formatar endereço do destinatário
  const parsedAddress = {
    logradouro: (order.addressDetails?.street || (order.address ? order.address.split(',')[0].trim() : 'Rua Padrão')).substring(0, 50),
    numero: (order.addressDetails?.number || (order.address ? order.address.split(',')[1]?.trim() : 'S/N')).substring(0, 6),
    complemento: (order.addressDetails?.complement || (order.address ? order.address.split(',')[2]?.trim() : '')).substring(0, 30),
    bairro: (order.addressDetails?.district || (order.address ? order.address.split(',')[3]?.trim() : 'Centro')).substring(0, 30),
    cidade: (order.addressDetails?.city || (order.address ? order.address.split(',')[4]?.trim() : 'São Paulo')).substring(0, 30),
    uf: (order.addressDetails?.state || (order.address ? order.address.split(',')[5]?.trim() : 'SP')).trim().substring(0, 2),
    cep: destCep.replace(/\D/g, '')
  };

  // 4. Montar a declaração de conteúdo
  const declaracaoConteudo = order.products
    .filter((p: any) => p.name)
    .map((p: any) => ({
      descricao: p.name.substring(0, 50), // Limite de caracteres dos Correios
      quantidade: p.quantity || 1,
      valor: (parseFloat(order.insuranceValue || '0') / (order.products.length || 1)) || 1.0,
      peso: (parseFloat(p.weight?.toString().replace(/\D/g, '') || '0') / 1000) * (p.quantity || 1)
    }));

  if (declaracaoConteudo.length === 0) {
    throw new Error('Declaração de conteúdo obrigatória para os Correios');
  }

  // 5. Construção do Request Body Definitivo para a API dos Correios
  const originPhone = origin.phone?.replace(/\D/g, '') || '';
  const destPhone = order.phone?.replace(/\D/g, '') || '';
  
  const originPhoneData: any = {};
  if (originPhone.length === 11) {
    originPhoneData.dddCelular = originPhone.substring(0, 2);
    originPhoneData.celular = originPhone.substring(2, 11);
  } else if (originPhone.length === 10) {
    originPhoneData.dddTelefone = originPhone.substring(0, 2);
    originPhoneData.telefone = originPhone.substring(2, 10);
  }

  const destPhoneData: any = {};
  if (destPhone.length === 11) {
    destPhoneData.dddCelular = destPhone.substring(0, 2);
    destPhoneData.celular = destPhone.substring(2, 11);
  } else if (destPhone.length === 10) {
    destPhoneData.dddTelefone = destPhone.substring(0, 2);
    destPhoneData.telefone = destPhone.substring(2, 10);
  }

  const requestBody: any = {
    idCorreios: CORREIOS_USER?.replace(/\D/g, ''),
    numeroCartaoPostagem: CORREIOS_CARD?.replace(/\D/g, ''),
    codigoServico: serviceCode,
    modalidadePagamento: 2, // 2 = A faturar (integer)
    remetente: {
      nome: (origin.name || 'Remetente Padrão').substring(0, 50),
      email: (origin.email || 'remetente@email.com').substring(0, 50),
      cpfCnpj: origin.document?.replace(/\D/g, '') || origin.company_document?.replace(/\D/g, '') || '00000000000000',
      ...originPhoneData,
      endereco: {
        logradouro: (origin.address || 'Endereço Padrão').substring(0, 50),
        numero: (origin.number || 'S/N').substring(0, 6),
        complemento: (origin.complement || '').substring(0, 30),
        bairro: (origin.district || 'Centro').substring(0, 30),
        cidade: (origin.city || 'Belo Horizonte').substring(0, 30),
        uf: (origin.state_abbr || 'MG').substring(0, 2),
        cep: (origin.zip || origin.postal_code || '30000000').replace(/\D/g, '')
      }
    },
    destinatario: {
      nome: order.clientName.substring(0, 50),
      email: (order.email || 'cliente@email.com').substring(0, 50),
      cpfCnpj: destCpfCnpj,
      ...destPhoneData,
      endereco: parsedAddress
    },
    pesoInformado: Math.round(totalWeightKg * 1000).toString(), // Peso em gramas
    codigoFormatoObjetoInformado: "2", // 2 = Caixa/Pacote
    comprimentoInformado: Math.round(volumes[0].comprimento).toString(),
    larguraInformada: Math.round(volumes[0].largura).toString(),
    alturaInformada: Math.round(volumes[0].altura).toString(),
    diametroInformado: "",
    itensDeclaracaoConteudo: declaracaoConteudo.map((item: any) => ({
      conteudo: item.descricao,
      quantidade: item.quantidade,
      valor: Number(item.valor.toFixed(2))
    })),
    cienteObjetoNaoProibido: 1
  };

  // Adicionar valor declarado se presente
  const insuranceValue = parseFloat(order.insuranceValue || '0');
  if (insuranceValue > 0) {
    // O código do serviço adicional de Valor Declarado muda de acordo com o serviço principal
    const vdCode = serviceCode === '03298' ? '064' : '019'; // 064 para PAC, 019 para SEDEX
    requestBody.listaServicoAdicional = [
      {
        codigoServicoAdicional: vdCode,
        valorDeclarado: Number(insuranceValue.toFixed(2))
      }
    ];
  }

  const response = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Resposta não JSON dos Correios:', responseText);
    throw new Error('Resposta inválida dos Correios ao criar pré-postagem');
  }

  console.log('Resposta da criação da pré-postagem:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.error('Erro Correios Pre-postagem:', data);
    let errorMessage = data.msg || data.mensagem || data.causa;
    if (!errorMessage && data.msgs && Array.isArray(data.msgs) && data.msgs.length > 0) {
      errorMessage = data.msgs[0];
    }
    throw new Error(errorMessage || 'Erro ao gerar etiqueta Correios');
  }

  // Extrair o ID da pré-postagem
  const prePostageId = data.id || data.idPrePostagem;
  if (!prePostageId) {
    console.error('Resposta dos Correios sem ID:', data);
    throw new Error('ID da pré-postagem não retornado pelos Correios');
  }

  // AGUARDAR PROCESSAMENTO (Polling)
  // Toda pré-postagem nasce como PENDENTE e leva alguns segundos para ser validada internamente
  console.log(`Aguardando processamento da pré-postagem ${prePostageId}...`);
  let statusReady = false;
  for (let i = 0; i < 5; i++) {
    const statusResponse = await fetch(`https://api.correios.com.br/prepostagem/v1/prepostagens/${prePostageId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      }
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log(`Status atual da pré-postagem ${prePostageId}: ${statusData.status}`);
      if (statusData.status === "CRIADA" || statusData.status === "FINALIZADA") {
        statusReady = true;
        break;
      }
    } else {
      const errorText = await statusResponse.text();
      console.warn(`Tentativa ${i + 1}: Erro ao consultar status:`, errorText);
    }
    
    // Esperar 2 segundos antes da próxima tentativa
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (!statusReady) {
    console.warn(`A pré-postagem ${prePostageId} ainda está PENDENTE, mas tentaremos gerar o rótulo mesmo assim.`);
  }

  // Solicitar a geração do rótulo (etiqueta) de forma assíncrona
  const labelRequest = {
    idCorreios: CORREIOS_USER?.replace(/\D/g, ''),
    numeroCartaoPostagem: CORREIOS_CARD?.replace(/\D/g, ''),
    idsPrePostagem: [prePostageId],
    tipoRotulo: "P",
    formatoRotulo: "ET",
    layoutImpressao: "LINEAR_100_150"
  };

  const labelResponse = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
    },
    body: JSON.stringify(labelRequest)
  });

  if (labelResponse.ok) {
    const labelResult = await labelResponse.json();
    data.idRecibo = labelResult.idRecibo;
    console.log(`Etiqueta Correios solicitada com sucesso. Recibo: ${data.idRecibo}`);
  } else {
    const errorText = await labelResponse.text();
    console.error('Erro ao solicitar rótulo Correios:', errorText);
    // Não lançamos erro aqui para permitir que o usuário tente baixar o PDF depois se a pré-postagem foi criada
  }

  return data;
}

export async function POST(req: Request) {
  try {
    const { order, selectedOption } = await req.json();

    const destCpfCnpj = (order.cnpj || order.cpf || '').replace(/\D/g, '');
    if (!destCpfCnpj || (destCpfCnpj.length !== 11 && destCpfCnpj.length !== 14)) {
      return NextResponse.json({ error: 'O cliente precisa ter um CPF ou CNPJ válido (11 ou 14 dígitos) cadastrado para emitir a etiqueta.' }, { status: 400 });
    }

    const destCep = (order.addressDetails?.zip || (order.address ? order.address.match(/\d{5}-?\d{3}/)?.[0] : '') || '').replace(/\D/g, '');
    if (!destCep || destCep.length !== 8) {
      return NextResponse.json({ error: 'O cliente precisa ter um CEP válido (8 dígitos) cadastrado para emitir a etiqueta.' }, { status: 400 });
    }

    // Calcular peso total
    const boxWeightG = order.boxWeight || order.products.reduce((acc: number, p: any) => {
      const w = parseFloat(p.weight?.toString().replace('g', '') || '0');
      if (p.weight?.toString().toLowerCase().includes('kg')) return acc + w * 1000 * (p.quantity || 1);
      return acc + w * (p.quantity || 1);
    }, 0);
    const totalWeightKg = Math.max(0.01, boxWeightG / 1000);

    // Lógica para definir a origem (remetente)
    const isMelhorEnvio = selectedOption.provider === 'Melhor Envio';
    let origin: any = {};
    try {
        if (isMelhorEnvio) {
            origin = JSON.parse(process.env.ORIGIN_BH_JSON || '{}');
        } else {
            origin = JSON.parse(process.env.ORIGIN_CRV_JSON || '{}');
        }
        
        origin.country_id = 'BR';
        const cnpj = process.env.ORIGIN_DOCUMENT || origin.company_document || '00000000000000';
        const cpf = process.env.ORIGIN_CPF || origin.document || '00000000000';
        origin.document = cpf;
        origin.company_document = cnpj;
        
        // Fallbacks for required fields
        origin.name = origin.name || 'Remetente Padrão';
        origin.phone = origin.phone || '11999999999';
        origin.email = origin.email || 'contato@remetente.com';
        origin.address = origin.address || 'Rua Padrão';
        origin.number = origin.number || 'S/N';
        origin.district = origin.district || 'Centro';
        origin.city = origin.city || 'São Paulo';
        origin.state_abbr = origin.state_abbr || 'SP';
        origin.postal_code = origin.postal_code || process.env.ORIGIN_CEP || '01001000';
    } catch (e) {
        console.error('Erro ao processar JSON de origem:', e);
        return NextResponse.json({ error: 'Erro na configuração do endereço de origem.' }, { status: 500 });
    }

    if (selectedOption.provider === 'Demo (Melhor Envio)') {
      return NextResponse.json({ 
          success: true, 
          labelUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          trackingNumber: 'BR123456789BR'
      });
    }

    if (selectedOption.provider === 'Correios') {
      const token = await getCorreiosToken();
      const labelData = await generateCorreiosLabel(order, selectedOption, token, origin, destCpfCnpj, destCep, totalWeightKg);
      
      // Construir a URL para download da etiqueta através do nosso proxy
      const labelUrl = labelData.idRecibo ? `/api/shipping/label/download?idRecibo=${labelData.idRecibo}` : null;

      return NextResponse.json({ 
          success: true, 
          labelUrl: labelUrl,
          trackingNumber: labelData.codigoObjeto,
          idRecibo: labelData.idRecibo
      });
    }

    if (selectedOption.provider === 'Superfrete') {
      return NextResponse.json({ error: 'Emissão de etiqueta via Superfrete ainda não implementada. Por favor, use Melhor Envio ou Correios.' }, { status: 501 });
    }

    // Lógica existente para Melhor Envio
    const token = process.env.MELHOR_ENVIO_TOKEN;
    if (!token) return NextResponse.json({ error: 'Token Melhor Envio não configurado.' }, { status: 500 });

    const MELHOR_ENVIO_URL = (process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br')
      .replace(/\/$/, '');

    // 1. Add to cart
    let serviceId = selectedOption.id.toString();
    const match = serviceId.match(/\d+/);
    if (match) {
        serviceId = match[0];
    }
    
    const cartPayload = {
      service: parseInt(serviceId.toString(), 10),
      agency: selectedOption.agency?.id,
      from: origin,
      to: {
        name: order.clientName,
        phone: order.phone?.replace(/\D/g, '') || '00000000000',
        email: order.email || 'cliente@exemplo.com',
        document: destCpfCnpj,
        address: order.addressDetails?.street || (order.address ? order.address.split(',')[0] : 'Rua Padrão'),
        number: order.addressDetails?.number || (order.address ? order.address.split(',')[1] : 'S/N'),
        complement: order.addressDetails?.complement || '',
        district: order.addressDetails?.district || (order.address ? order.address.split(',')[3] : 'Centro'),
        city: order.addressDetails?.city || (order.address ? order.address.split(',')[4] : 'São Paulo'),
        state_abbr: (order.addressDetails?.state || (order.address ? order.address.split(',')[5] : 'SP') || 'SP').trim().substring(0, 2),
        postal_code: destCep,
        country_id: 'BR'
      },
      products: order.products.map((p: any) => ({
        name: p.name.substring(0, 50),
        quantity: p.quantity,
        unitary_weight: (parseFloat(p.weight?.toString().replace(/\D/g, '') || '0') / 1000) || 0.1,
        unitary_value: (parseFloat(order.insuranceValue || '0') / (order.products.length || 1)) || 1.0
      })),
      volumes: [{
          height: Math.max(2, order.boxDimensions?.height || 10),
          width: Math.max(11, order.boxDimensions?.width || 10),
          length: Math.max(16, order.boxDimensions?.length || 10),
          weight: totalWeightKg
      }],
      options: {
          insurance_value: parseFloat(order.insuranceValue || '0'),
          receipt: false,
          own_hand: false,
          collect: false,
          reverse: false,
          non_commercial: !order.invoiceKey,
          invoice: order.invoiceKey ? { key: order.invoiceKey, number: order.invoiceNumber } : undefined,
          content_description: order.productDescription || order.products.map((p: any) => `${p.quantity}x ${p.name}`).join(', ').substring(0, 100)
      }
    };

    const cartResponse = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify(cartPayload)
    });

    if (!cartResponse.ok) {
        const errorData = await cartResponse.text();
        console.error('Erro ao adicionar ao carrinho:', cartResponse.status, errorData);
        return NextResponse.json({ error: 'Erro ao adicionar ao carrinho.' }, { status: 500 });
    }

    const cartData = JSON.parse(await cartResponse.text());
    const cartId = cartData.id;

    // 2. Checkout
    const checkoutResponse = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ orders: [cartId] })
    });

    if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.text();
        console.warn('Erro no checkout mas carrinho foi preenchido:', checkoutResponse.status, errorData);
        // Retorna sucesso com inCart = true em vez de erro
        return NextResponse.json({ 
            success: true, 
            inCart: true,
            shipmentId: cartId,
            shippingProvider: 'melhorenvio',
            message: 'A etiqueta foi gerada e enviada para o seu carrinho no Melhor Envio. Você precisa acessar o Melhor Envio para realizar o pagamento.'
        });
    }

    // 3. Print label
    const printResponse = await fetch(`${MELHOR_ENVIO_URL}/api/v2/me/shipment/print`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ mode: 'public', orders: [cartId] })
    });

    if (!printResponse.ok) {
        const errorData = await printResponse.text();
        console.warn('Erro ao imprimir, mas checkout feito:', printResponse.status, errorData);
        return NextResponse.json({ 
            success: true, 
            inCart: true,
            shipmentId: cartId,
            shippingProvider: 'melhorenvio',
            message: 'O pagamento da etiqueta foi processado ou está no carrinho, mas a impressão falhou. Acesse o site do Melhor Envio para tentar imprimir.'
        });
    }

    const printData = JSON.parse(await printResponse.text());
    
    return NextResponse.json({ 
        success: true, 
        labelUrl: printData.url,
        trackingNumber: printData.tracking_number,
        shipmentId: cartId,
        shippingProvider: 'melhorenvio'
    });
  } catch (error: any) {
    console.error('Erro na emissão de etiqueta:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
