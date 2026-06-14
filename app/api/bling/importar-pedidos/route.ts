import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';
const SITUACOES_CANCELADAS = [12, 11, 10];

function normalize(str: string) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function gerarId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function fetchBlingOrderDetails(blingOrderId: string, headers: any) {
  try {
    const res = await fetchWithRetry(`${BLING_BASE}/pedidos/vendas/${blingOrderId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch { return null; }
}


async function fetchContatoCompleto(contatoId: string, headers: any) {
  try {
    const res = await fetchWithRetry(`${BLING_BASE}/contatos/${contatoId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch { return null; }
}
async function fetchNFDetails(nfeId: string, headers: any) {
  try {
    const res = await fetchWithRetry(`${BLING_BASE}/nfe/${nfeId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch { return null; }
}

async function loadProductMapping() {
  try {
    const snapshot = await adminDb.collection('product_mapping').get();
    if (!snapshot.empty) {
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }
  } catch (e) {
    console.log('[Importar] Erro ao carregar product_mapping:', e);
  }
  return [
    { appName: 'Catuai', appWeight: '250g', appGrind: 'moido', blingSku: '112501' },
    { appName: 'Catuai', appWeight: '250g', appGrind: 'graos', blingSku: '112502' },
    { appName: 'Catuai', appWeight: '500g', appGrind: 'moido', blingSku: '115001' },
    { appName: 'Catuai', appWeight: '500g', appGrind: 'graos', blingSku: '115002' },
    { appName: 'Catuai', appWeight: '1kg', appGrind: 'moido', blingSku: '111001' },
    { appName: 'Catuai', appWeight: '1kg', appGrind: 'graos', blingSku: '111002' },
    { appName: 'Bourbon', appWeight: '250g', appGrind: 'moido', blingSku: '102501' },
    { appName: 'Bourbon', appWeight: '250g', appGrind: 'graos', blingSku: '102502' },
    { appName: 'Gourmet', appWeight: '250g', appGrind: 'moido', blingSku: '132501' },
    { appName: 'Gourmet', appWeight: '250g', appGrind: 'graos', blingSku: '132502' },
    { appName: 'Gourmet', appWeight: '1kg', appGrind: 'moido', blingSku: '141002' },
    { appName: 'Gourmet', appWeight: '1kg', appGrind: 'graos', blingSku: '141000' },
    { appName: 'DripCoffee', appWeight: '100g', appGrind: 'moido', blingSku: 'CGP040' },
    { appName: 'DripCoffee', appWeight: '250g', appGrind: 'moido', blingSku: 'CGP250' },
    { appName: 'DripCoffee', appWeight: '500g', appGrind: 'moido', blingSku: 'CGP500' },
  ];
}

function mapBlingItensToProducts(itens: any[], productMapping: any[]) {
  const products = [];
  for (const item of itens) {
    const sku = item.produto?.codigo || item.codigo || '';
    const mapping = productMapping.find((m: any) => m.blingSku === sku);
    if (mapping) {
      products.push({
        id: gerarId(),
        name: mapping.appName,
        weight: mapping.appWeight,
        grindType: (mapping.appGrind || 'N/A') as 'moido' | 'graos' | 'N/A',
        quantity: item.quantidade || 1,
        checked: false,
        blingSku: sku,
        blingId: item.produto?.id || undefined,
      });
    } else if (sku) {
      products.push({
        id: gerarId(),
        name: item.produto?.nome || item.descricao || 'Produto',
        weight: '',
        grindType: 'N/A' as const,
        quantity: item.quantidade || 1,
        checked: false,
        blingSku: sku,
      });
    }
  }
  return products;
}

function detectarOrigem(blingOrder: any): string {
  const servico = normalize(blingOrder.transporte?.volumes?.[0]?.servico || '');
  if (servico.includes('amazon')) return 'Amazon';
  const loja = blingOrder.loja?.descricao || blingOrder.loja?.nome || '';
  const canal = normalize(loja);
  if (canal.includes('amazon')) return 'Amazon';
  if (canal.includes('mercado') || canal.includes('meli')) return 'Meli';
  if (canal.includes('wix') || canal.includes('site')) return 'Wix';
  return 'whatsapp';
}

function detectarFormaPagamento(blingOrder: any, origem: string): string {
  if (origem === 'Amazon') return 'transferencia';
  const formaPagId = blingOrder.parcelas?.[0]?.formaPagamento?.id;
  if (formaPagId === 15 || formaPagId === 16) return 'boleto';
  if (formaPagId === 1) return 'dinheiro';
  return 'pix';
}

function montarEndereco(etiqueta: any, contatoGeral?: any) {
  const end = etiqueta || contatoGeral?.endereco?.geral || {};
  if (!end || (!end.endereco && !end.logradouro && !end.municipio)) return undefined;
  return {
    street: end.endereco || end.logradouro || '',
    number: end.numero || '',
    complement: end.complemento || '',
    district: end.bairro || '',
    city: end.municipio || '',
    state: end.uf || '',
    zip: (end.cep || '').replace(/\D/g, ''),
  };
}

// apenasNovos=true: só usa blingOrderId como deduplicação — nunca toca pedidos existentes por CPF/CNPJ/nome
function findFluxiaOrder(blingOrder: any, allFluxiaOrders: any[], usedFluxiaIds: Set<string>, apenasNovos = false) {
  const blingId = String(blingOrder.id);
  const numeroLoja = blingOrder.numeroLoja || '';
  const doc = (blingOrder.contato?.numeroDocumento || '').replace(/\D/g, '');
  const valor = blingOrder.total;
  const dataBling = blingOrder.data;
  const nomeCliente = normalize(blingOrder.contato?.nome || '');

  const tryReturn = (order: any, matchType: string) => {
    if (!order) return null;
    if (usedFluxiaIds.has(order.id)) return null;
    return { order, matchType };
  };

  // Estratégia 1: numeroLoja == id do pedido Fluxia (pedido criado via integração)
  if (!apenasNovos && numeroLoja) {
    const byLoja = allFluxiaOrders.find(o => o.id === numeroLoja);
    const r = tryReturn(byLoja, 'numeroLoja');
    if (r) return r;
  }

  // Estratégia 2: blingOrderId já registrado — único match seguro para re-importação
  const byBlingId = allFluxiaOrders.find(o => String(o.blingOrderId) === blingId);
  const r2 = tryReturn(byBlingId, 'blingOrderId');
  if (r2) return r2;

  // As estratégias abaixo são desabilitadas em modo apenasNovos para evitar
  // que pedidos de meses anteriores sejam confundidos com pedidos de outros meses do mesmo cliente
  if (apenasNovos) return null;

  if (doc.length === 14) {
    const byCnpj = allFluxiaOrders.filter(o => !usedFluxiaIds.has(o.id) && (o.cnpj || '').replace(/\D/g, '') === doc);
    if (byCnpj.length === 1) return tryReturn(byCnpj[0], 'cnpj');
    if (byCnpj.length > 1) {
      const byVD = byCnpj.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const dd = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dd < 5 * 24 * 60 * 60 * 1000;
      });
      return tryReturn(byVD, 'cnpj+valor+data');
    }
  }

  if (doc.length === 11) {
    const byCpf = allFluxiaOrders.filter(o => !usedFluxiaIds.has(o.id) && (o.cpf || '').replace(/\D/g, '') === doc);
    if (byCpf.length === 1) return tryReturn(byCpf[0], 'cpf');
    if (byCpf.length > 1) {
      const byVD = byCpf.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const dd = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dd < 5 * 24 * 60 * 60 * 1000;
      });
      return tryReturn(byVD, 'cpf+valor+data');
    }
  }

  if (nomeCliente.length > 3) {
    const primeiroNome = nomeCliente.split(' ')[0];
    const byNome = allFluxiaOrders.filter(o => {
      if (usedFluxiaIds.has(o.id)) return false;
      const nomeFluxia = normalize(o.clientName || '');
      if (!nomeFluxia.includes(primeiroNome)) return false;
      const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
      const dd = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
      return diff < 1 && dd < 3 * 24 * 60 * 60 * 1000;
    });
    if (byNome.length === 1) return tryReturn(byNome[0], 'nome+valor+data');
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    // apenasNovos=true: desativa match por CPF/CNPJ/nome — apenas blingOrderId evita duplicata
    // Use sempre true para importar pedidos históricos de meses anteriores
    const apenasNovos: boolean = body.apenasNovos !== false; // padrão true
    const dataInicial = body.dataInicial || '2026-03-01';
    const dataFinal = body.dataFinal || new Date().toISOString().substring(0, 10);

    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Token Bling nao encontrado.' }, { status: 401 });
    }
    const headers = { 'Authorization': `Bearer ${token}` };

    const productMapping = await loadProductMapping();
    console.log(`[Importar Bling] ${productMapping.length} mapeamentos carregados`);

    const snapshot = await adminDb.collection('orders').get();
    const allFluxiaOrders = snapshot.docs.map((d: any) => ({ _ref: d.ref, id: d.id, ...d.data() }));
    console.log(`[Importar Bling] ${allFluxiaOrders.length} pedidos no Fluxia`);

    let allBlingOrders: any[] = [];
    let pagina = 1;
    while (pagina <= 20) {
      const res = await fetchWithRetry(
        `${BLING_BASE}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&limite=100&pagina=${pagina}`,
        { headers }
      );
      if (!res.ok) break;
      const data = await res.json();
      const orders = data.data || [];
      if (orders.length === 0) break;
      allBlingOrders = [...allBlingOrders, ...orders];
      if (orders.length < 100) break;
      pagina++;
      await new Promise(r => setTimeout(r, 300));
    }

    const blingAtivos = allBlingOrders.filter(o => !SITUACOES_CANCELADAS.includes(o.situacao?.id));
    console.log(`[Importar Bling] ${blingAtivos.length} pedidos ativos`);

    const results = { matched: [] as any[], criados: [] as any[], atualizados: 0, erros: [] as any[] };
    const usedFluxiaIds = new Set<string>();

    for (const blingOrderResumido of blingAtivos) {
      try {
        await new Promise(r => setTimeout(r, 200));
        const blingOrder = await fetchBlingOrderDetails(String(blingOrderResumido.id), headers);
        if (!blingOrder) {
          results.erros.push({ blingId: blingOrderResumido.id, error: 'Falha ao buscar detalhes' });
          continue;
        }

        const origem = detectarOrigem(blingOrder);
        const formaPagamento = detectarFormaPagamento(blingOrder, origem);
        const contato = blingOrder.contato || {};
        const doc = (contato.numeroDocumento || '').replace(/\D/g, '');
        // Buscar contato completo para pegar telefone
        let contatoCompleto: any = null;
        if (contato.id) {
          await new Promise(r => setTimeout(r, 150));
          contatoCompleto = await fetchContatoCompleto(String(contato.id), headers);
        }
        const telefone = (contatoCompleto?.telefone || contatoCompleto?.celular || '').replace(/\D/g, '') || undefined;
        const email = contatoCompleto?.email || undefined;
        // Endereço de entrega via transporte.etiqueta, fallback no contato completo
        const etiqueta = blingOrder.transporte?.etiqueta;
        const addressDetails = montarEndereco(etiqueta, contatoCompleto);
        const itens = blingOrder.itens || [];
        const products = mapBlingItensToProducts(itens, productMapping);

        let nfData: any = null;
        if (blingOrder.notaFiscal?.id) {
          await new Promise(r => setTimeout(r, 200));
          nfData = await fetchNFDetails(String(blingOrder.notaFiscal.id), headers);
        }

        const match = findFluxiaOrder(blingOrder, allFluxiaOrders, usedFluxiaIds, apenasNovos);

        if (match) {
          const { order: fluxiaOrder, matchType } = match;
          usedFluxiaIds.add(fluxiaOrder.id);

          const updates: any = {
            blingOrderId: String(blingOrder.id),
            blingOrderNumero: blingOrder.numero,
          };

          if (!fluxiaOrder.phone && telefone) updates.phone = telefone;
          if (!fluxiaOrder.email && email) updates.email = email;
          if (!fluxiaOrder.cpf && doc.length === 11) updates.cpf = doc;
          if (!fluxiaOrder.cnpj && doc.length === 14) updates.cnpj = doc;
          if (!fluxiaOrder.addressDetails && addressDetails) updates.addressDetails = addressDetails;
          if (!fluxiaOrder.address && addressDetails) {
            updates.address = `${addressDetails.street}, ${addressDetails.number} - ${addressDetails.city}/${addressDetails.state}`;
          }
          if (!fluxiaOrder.origin && origem !== 'whatsapp') updates.origin = origem;
          if (!fluxiaOrder.paymentMethod) updates.paymentMethod = formaPagamento;
          if (!fluxiaOrder.paymentStatus) updates.paymentStatus = 'pago';
          if (!fluxiaOrder.paymentDate) updates.paymentDate = blingOrder.data;
          if (!fluxiaOrder.invoiceValue && blingOrder.total) updates.invoiceValue = blingOrder.total;
          if (nfData && !fluxiaOrder.invoiceNumber) {
            updates.hasInvoice = true;
            updates.invoiceNumber = String(nfData.numero || '');
            updates.invoiceKey = nfData.chaveAcesso || '';
            updates.invoiceValue = nfData.valorNota || blingOrder.total;
          }
          if ((!fluxiaOrder.products || fluxiaOrder.products.length === 0) && products.length > 0) {
            updates.products = products;
          }

          const updatesKeys = Object.keys(updates).filter(k => !['blingOrderId', 'blingOrderNumero'].includes(k));
          results.matched.push({
            fluxiaId: fluxiaOrder.id, blingId: blingOrder.id, blingNumero: blingOrder.numero,
            cliente: contato.nome, valor: blingOrder.total, matchType,
            updates: updatesKeys, temNF: !!nfData, produtos: products.length,
          });

          if (!dryRun && Object.keys(updates).length > 0) {
            await fluxiaOrder._ref.update({ ...updates, updatedAt: new Date().toISOString() });
            results.atualizados++;
          }

        } else {
          const novoId = gerarId();
          const createdAtISO = `${blingOrder.data}T12:00:00.000Z`;
          const novoPedido: any = {
            id: novoId,
            clientName: contato.nome || 'Cliente Bling',
            tradeName: contatoCompleto?.fantasia || contato?.fantasia || undefined,
            phone: telefone,
            email: email,
            cpf: doc.length === 11 ? doc : undefined,
            cnpj: doc.length === 14 ? doc : undefined,
            address: addressDetails ? `${addressDetails.street}, ${addressDetails.number} - ${addressDetails.city}/${addressDetails.state}` : undefined,
            addressDetails: addressDetails || undefined,
            products,
            invoiceValue: nfData?.valorNota || blingOrder.total || 0,
            origin: origem !== 'whatsapp' ? origem : undefined,
            paymentMethod: formaPagamento,
            paymentStatus: 'pago',
            paymentConfirmedManually: true,
            paymentDate: blingOrder.data,
            hasInvoice: false,
            hasBoleto: false,
            hasOrderDocument: true,
            status: 'entregue',
            blingOrderId: String(blingOrder.id),
            blingOrderNumero: blingOrder.numero,
            createdAt: createdAtISO,
            updatedAt: new Date().toISOString(),
            statusHistory: [
              { status: 'entregue', timestamp: createdAtISO },
              { action: 'Importado do Bling', details: `Pedido Bling #${blingOrder.numero}`, timestamp: new Date().toISOString() },
            ],
          };

          if (nfData) {
            novoPedido.hasInvoice = true;
            novoPedido.invoiceLinked = true;
            novoPedido.invoiceNumber = String(nfData.numero || '');
            novoPedido.invoiceKey = nfData.chaveAcesso || '';
            novoPedido.invoiceValue = nfData.valorNota || blingOrder.total;
          }
          if (blingOrder.parcelas?.length > 0) {
            const ultima = blingOrder.parcelas[blingOrder.parcelas.length - 1];
            if (ultima.dataVencimento && ultima.dataVencimento !== '0000-00-00') {
              novoPedido.paymentDueDate = ultima.dataVencimento;
            }
          }

          // Tentar vincular boleto Sicoob via seuNumero == invoiceNumber (apenas na importação real)
          if (!dryRun && novoPedido.paymentMethod === 'boleto' && novoPedido.invoiceNumber && doc) {
            try {
              const sicoobCert = getSicoobCert();
              const sicoobToken = await getSicoobToken('boletos_consulta');
              const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;
              const sicoobResult = await makeSicoobRequest(
                {
                  hostname: 'api.sicoob.com.br',
                  port: 443,
                  path: `/cobranca-bancaria/v3/pagadores/${doc}/boletos?numeroCliente=${numeroCliente}`,
                  method: 'GET',
                  headers: { 'Authorization': 'Bearer ' + sicoobToken },
                },
                null, sicoobCert.pfxBuffer, sicoobCert.certPassword
              );
              const sicoobBoletos = sicoobResult.body?.resultado || [];
              if (Array.isArray(sicoobBoletos)) {
                const invoiceNum = String(novoPedido.invoiceNumber).replace(/^0+/, '');
                const boletoAchado = sicoobBoletos.find((b: any) =>
                  String(b.seuNumero || '').replace(/^0+/, '') === invoiceNum
                );
                if (boletoAchado) {
                  novoPedido.boletoNossoNumero = String(boletoAchado.nossoNumero);
                  novoPedido.hasBoleto = true;
                  novoPedido.boletoLinked = true;
                }
              }
            } catch (sicoobErr: any) {
              console.warn('[Importar Bling] Sicoob lookup falhou para', contato.nome, ':', sicoobErr.message);
            }
          }

          results.criados.push({
            blingId: blingOrder.id, blingNumero: blingOrder.numero,
            cliente: contato.nome, valor: blingOrder.total,
            origem, temNF: !!nfData, temBoleto: !!novoPedido.boletoNossoNumero, produtos: products.length,
          });

          if (!dryRun) {
            const pedidoLimpo = Object.fromEntries(Object.entries(novoPedido).filter(([_, v]) => v !== undefined));
            await adminDb.collection('orders').doc(novoId).set(pedidoLimpo);
          }
        }

      } catch (e: any) {
        results.erros.push({ blingId: blingOrderResumido.id, error: e.message });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({
      ok: true, dryRun,
      periodo: { dataInicial, dataFinal },
      resumo: {
        blingTotal: allBlingOrders.length,
        blingCancelados: allBlingOrders.length - blingAtivos.length,
        blingAtivos: blingAtivos.length,
        fluxiaTotal: allFluxiaOrders.length,
        matched: results.matched.length,
        criados: results.criados.length,
        atualizados: results.atualizados,
        erros: results.erros.length,
      },
      matched: results.matched,
      criados: results.criados,
      erros: results.erros,
    });

  } catch (error: any) {
    console.error('[Importar Bling] Erro:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Use POST com dryRun:true para simular.' });
}
