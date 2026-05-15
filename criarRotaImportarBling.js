const fs = require('fs');
const path = require('path');

// Detectar caminho do projeto
const possiblePaths = [
  'app/api/bling/importar-pedidos/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/bling/importar-pedidos/route.ts'),
];

let basePath = null;
for (const p of possiblePaths) {
  const dir = path.dirname(p);
  if (fs.existsSync(path.dirname(path.dirname(path.dirname(dir))))) {
    basePath = path.dirname(path.dirname(path.dirname(path.dirname(p))));
    break;
  }
}

// Tentar detectar pelo cwd
if (!basePath) {
  if (fs.existsSync('app/api/bling')) basePath = '.';
  else if (fs.existsSync(path.join(process.env.HOME || '', 'Fluxia-next/app/api/bling'))) {
    basePath = path.join(process.env.HOME || '', 'Fluxia-next');
  }
}

if (!basePath) {
  console.error('ERRO: Rode de dentro da pasta Fluxia-next.');
  process.exit(1);
}

const routeDir = path.join(basePath, 'app/api/bling/importar-pedidos');
const routePath = path.join(routeDir, 'route.ts');

if (!fs.existsSync(routeDir)) {
  fs.mkdirSync(routeDir, { recursive: true });
  console.log('Pasta criada:', routeDir);
}

const routeContent = `import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';

const SITUACOES_CANCELADAS = [12, 11, 10];

// Normaliza string para comparação
function normalize(str: string) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
}

// Gera ID aleatório tipo Firestore
function gerarId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Busca detalhes completos do pedido Bling (inclui itens, endereço, parcelas)
async function fetchBlingOrderDetails(blingOrderId: string, headers: any) {
  try {
    const res = await fetchWithRetry(\`\${BLING_BASE}/pedidos/vendas/\${blingOrderId}\`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch {
    return null;
  }
}

// Busca detalhes da NF
async function fetchNFDetails(nfeId: string, headers: any) {
  try {
    const res = await fetchWithRetry(\`\${BLING_BASE}/nfe/\${nfeId}\`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch {
    return null;
  }
}

// Carrega product_mapping do Firestore
async function loadProductMapping() {
  try {
    const snapshot = await adminDb.collection('product_mapping').get();
    if (!snapshot.empty) {
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }
  } catch (e) {
    console.log('[Importar] Erro ao carregar product_mapping:', e);
  }
  // Fallback hardcoded
  return [
    { appName: 'Catuaí', appWeight: '250g', appGrind: 'moído', blingSku: '112501' },
    { appName: 'Catuaí', appWeight: '250g', appGrind: 'grãos', blingSku: '112502' },
    { appName: 'Catuaí', appWeight: '500g', appGrind: 'moído', blingSku: '115001' },
    { appName: 'Catuaí', appWeight: '500g', appGrind: 'grãos', blingSku: '115002' },
    { appName: 'Catuaí', appWeight: '1kg', appGrind: 'moído', blingSku: '111001' },
    { appName: 'Catuaí', appWeight: '1kg', appGrind: 'grãos', blingSku: '111002' },
    { appName: 'Bourbon', appWeight: '250g', appGrind: 'moído', blingSku: '102501' },
    { appName: 'Bourbon', appWeight: '250g', appGrind: 'grãos', blingSku: '102502' },
    { appName: 'Gourmet', appWeight: '250g', appGrind: 'moído', blingSku: '132501' },
    { appName: 'Gourmet', appWeight: '250g', appGrind: 'grãos', blingSku: '132502' },
    { appName: 'Gourmet', appWeight: '1kg', appGrind: 'moído', blingSku: '141002' },
    { appName: 'Gourmet', appWeight: '1kg', appGrind: 'grãos', blingSku: '141000' },
    { appName: 'DripCoffee', appWeight: '100g', appGrind: 'moído', blingSku: 'CGP040' },
    { appName: 'DripCoffee', appWeight: '250g', appGrind: 'moído', blingSku: 'CGP250' },
    { appName: 'DripCoffee', appWeight: '500g', appGrind: 'moído', blingSku: 'CGP500' },
  ];
}

// Mapeia itens do Bling para ProductItems do Fluxia via SKU
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
        grindType: mapping.appGrind || 'N/A',
        quantity: item.quantidade || 1,
        checked: false,
        blingSku: sku,
        blingId: item.produto?.id || undefined,
      });
    } else if (sku) {
      // SKU não mapeado — salva com nome do Bling como fallback
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

// Detecta origem do pedido pelo canal/loja do Bling
function detectarOrigem(blingOrder: any): string {
  const loja = blingOrder.loja?.descricao || blingOrder.loja?.nome || '';
  const canal = normalize(loja);
  if (canal.includes('amazon')) return 'Amazon';
  if (canal.includes('mercado') || canal.includes('meli') || canal.includes('meli')) return 'Meli';
  if (canal.includes('wix') || canal.includes('site')) return 'Wix';
  return 'whatsapp';
}

// Forma de pagamento baseada na origem e parcelas
function detectarFormaPagamento(blingOrder: any, origem: string): string {
  if (origem === 'Amazon') return 'transferencia';
  const formaPagId = blingOrder.parcelas?.[0]?.formaPagamento?.id;
  if (formaPagId === 15 || formaPagId === 16) return 'boleto'; // IDs comuns de boleto no Bling
  if (formaPagId === 1) return 'dinheiro';
  return 'pix'; // padrão para WhatsApp
}

// Monta addressDetails a partir do contato Bling
function montarEndereco(contato: any) {
  if (!contato) return undefined;
  const end = contato.endereco || {};
  if (!end.logradouro && !end.municipio) return undefined;
  return {
    street: end.logradouro || '',
    number: end.numero || '',
    complement: end.complemento || '',
    district: end.bairro || '',
    city: end.municipio || '',
    state: end.uf || '',
    zip: (end.cep || '').replace(/\\D/g, ''),
  };
}

// Tenta encontrar pedido no Fluxia com múltiplos critérios
function findFluxiaOrder(blingOrder: any, allFluxiaOrders: any[], usedFluxiaIds: Set<string>) {
  const blingId = String(blingOrder.id);
  const numeroLoja = blingOrder.numeroLoja || '';
  const doc = (blingOrder.contato?.numeroDocumento || '').replace(/\\D/g, '');
  const valor = blingOrder.total;
  const dataBling = blingOrder.data;
  const nomeCliente = normalize(blingOrder.contato?.nome || '');

  const tryReturn = (order: any, matchType: string) => {
    if (!order) return null;
    if (usedFluxiaIds.has(order.id)) return null;
    return { order, matchType };
  };

  // 1. Por numeroLoja = fluxiaId
  if (numeroLoja) {
    const byLoja = allFluxiaOrders.find(o => o.id === numeroLoja);
    const r = tryReturn(byLoja, 'numeroLoja');
    if (r) return r;
  }

  // 2. Por blingOrderId
  const byBlingId = allFluxiaOrders.find(o => String(o.blingOrderId) === blingId);
  const r2 = tryReturn(byBlingId, 'blingOrderId');
  if (r2) return r2;

  // 3. Por CNPJ (14 dígitos)
  if (doc.length === 14) {
    const byCnpj = allFluxiaOrders.filter(o => !usedFluxiaIds.has(o.id) && (o.cnpj || '').replace(/\\D/g, '') === doc);
    if (byCnpj.length === 1) return tryReturn(byCnpj[0], 'cnpj');
    if (byCnpj.length > 1) {
      const byValorData = byCnpj.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const dateDiff = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dateDiff < 5 * 24 * 60 * 60 * 1000;
      });
      return tryReturn(byValorData, 'cnpj+valor+data');
    }
  }

  // 4. Por CPF (11 dígitos)
  if (doc.length === 11) {
    const byCpf = allFluxiaOrders.filter(o => !usedFluxiaIds.has(o.id) && (o.cpf || '').replace(/\\D/g, '') === doc);
    if (byCpf.length === 1) return tryReturn(byCpf[0], 'cpf');
    if (byCpf.length > 1) {
      const byValorData = byCpf.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const dateDiff = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dateDiff < 5 * 24 * 60 * 60 * 1000;
      });
      return tryReturn(byValorData, 'cpf+valor+data');
    }
  }

  // 5. Por nome + valor + data (±3 dias) — fallback para sem documento
  if (nomeCliente.length > 3) {
    const byNome = allFluxiaOrders.filter(o => {
      if (usedFluxiaIds.has(o.id)) return false;
      const nomeFluxia = normalize(o.clientName || '');
      if (!nomeFluxia.includes(nomeCliente.split(' ')[0])) return false;
      const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
      const dateDiff = Math.abs(new Date((o.createdAt || '').substring(0, 10)).getTime() - new Date(dataBling).getTime());
      return diff < 1 && dateDiff < 3 * 24 * 60 * 60 * 1000;
    });
    if (byNome.length === 1) return tryReturn(byNome[0], 'nome+valor+data');
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const dataInicial = body.dataInicial || '2026-03-01';
    const dataFinal = body.dataFinal || new Date().toISOString().substring(0, 10);

    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Token Bling não encontrado. Reautentique em Configurações.' }, { status: 401 });
    }
    const headers = { 'Authorization': \`Bearer \${token}\` };

    // Carregar product_mapping
    const productMapping = await loadProductMapping();
    console.log(\`[Importar Bling] \${productMapping.length} mapeamentos de produtos carregados\`);

    // Buscar todos os pedidos do Fluxia
    const snapshot = await adminDb.collection('orders').get();
    const archivedSnap = await adminDb.collection('orders').where('archived', '==', true).get();
    const allFluxiaOrders = [
      ...snapshot.docs.map((d: any) => ({ _ref: d.ref, id: d.id, ...d.data() })),
      ...archivedSnap.docs
        .filter((d: any) => !snapshot.docs.find((s: any) => s.id === d.id))
        .map((d: any) => ({ _ref: d.ref, id: d.id, ...d.data() })),
    ];
    console.log(\`[Importar Bling] \${allFluxiaOrders.length} pedidos no Fluxia\`);

    // Buscar pedidos do Bling no período (paginado)
    let allBlingOrders: any[] = [];
    let pagina = 1;
    const MAX_PAGES = 20;

    while (pagina <= MAX_PAGES) {
      const res = await fetchWithRetry(
        \`\${BLING_BASE}/pedidos/vendas?dataInicial=\${dataInicial}&dataFinal=\${dataFinal}&limite=100&pagina=\${pagina}\`,
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
    console.log(\`[Importar Bling] \${blingAtivos.length} pedidos ativos de \${dataInicial} a \${dataFinal}\`);

    const results = {
      matched: [] as any[],
      criados: [] as any[],
      atualizados: 0,
      erros: [] as any[],
    };

    const usedFluxiaIds = new Set<string>();

    for (const blingOrderResumido of blingAtivos) {
      try {
        // Buscar detalhes completos (itens, endereço completo, parcelas)
        await new Promise(r => setTimeout(r, 200));
        const blingOrder = await fetchBlingOrderDetails(String(blingOrderResumido.id), headers);
        if (!blingOrder) {
          results.erros.push({ blingId: blingOrderResumido.id, error: 'Falha ao buscar detalhes' });
          continue;
        }

        const origem = detectarOrigem(blingOrder);
        const formaPagamento = detectarFormaPagamento(blingOrder, origem);
        const contato = blingOrder.contato || {};
        const doc = (contato.numeroDocumento || '').replace(/\\D/g, '');
        const addressDetails = montarEndereco(contato);

        // Mapear produtos
        const itens = blingOrder.itens || [];
        const products = mapBlingItensToProducts(itens, productMapping);

        // Buscar NF se tiver
        let nfData: any = null;
        if (blingOrder.notaFiscal?.id) {
          await new Promise(r => setTimeout(r, 200));
          nfData = await fetchNFDetails(String(blingOrder.notaFiscal.id), headers);
        }

        // Tentar match com pedido existente no Fluxia
        const match = findFluxiaOrder(blingOrder, allFluxiaOrders, usedFluxiaIds);

        if (match) {
          // ATUALIZAR pedido existente
          const { order: fluxiaOrder, matchType } = match;
          usedFluxiaIds.add(fluxiaOrder.id);

          const updates: any = {
            blingOrderId: String(blingOrder.id),
            blingOrderNumero: blingOrder.numero,
          };

          // Dados do cliente
          if (!fluxiaOrder.phone && contato.celular) updates.phone = contato.celular.replace(/\\D/g, '');
          if (!fluxiaOrder.email && contato.email) updates.email = contato.email;
          if (!fluxiaOrder.cpf && doc.length === 11) updates.cpf = doc;
          if (!fluxiaOrder.cnpj && doc.length === 14) updates.cnpj = doc;
          if (!fluxiaOrder.addressDetails && addressDetails) updates.addressDetails = addressDetails;
          if (!fluxiaOrder.address && addressDetails) {
            updates.address = \`\${addressDetails.street}, \${addressDetails.number} - \${addressDetails.city}/\${addressDetails.state}\`;
          }

          // Origem
          if (!fluxiaOrder.origin && origem !== 'whatsapp') updates.origin = origem;

          // Pagamento
          if (!fluxiaOrder.paymentMethod) updates.paymentMethod = formaPagamento;
          if (!fluxiaOrder.paymentStatus) updates.paymentStatus = 'pago';
          if (!fluxiaOrder.paymentDate) updates.paymentDate = blingOrder.data;

          // Valor
          if (!fluxiaOrder.invoiceValue && blingOrder.total) updates.invoiceValue = blingOrder.total;

          // NF
          if (nfData && !fluxiaOrder.invoiceNumber) {
            updates.hasInvoice = true;
            updates.invoiceNumber = String(nfData.numero || '');
            updates.invoiceKey = nfData.chaveAcesso || '';
            updates.invoiceValue = nfData.valorNota || blingOrder.total;
          }

          // Produtos (só adiciona se o pedido não tem)
          if ((!fluxiaOrder.products || fluxiaOrder.products.length === 0) && products.length > 0) {
            updates.products = products;
          }

          const updatesKeys = Object.keys(updates).filter(k => !['blingOrderId', 'blingOrderNumero'].includes(k));

          results.matched.push({
            fluxiaId: fluxiaOrder.id,
            blingId: blingOrder.id,
            blingNumero: blingOrder.numero,
            cliente: contato.nome,
            valor: blingOrder.total,
            matchType,
            updates: updatesKeys,
            temNF: !!nfData,
            produtos: products.length,
          });

          if (!dryRun) {
            await fluxiaOrder._ref.update({
              ...updates,
              updatedAt: new Date().toISOString(),
            });
            results.atualizados++;
          }

        } else {
          // CRIAR novo pedido arquivado
          const novoId = gerarId();
          const novoPedido: any = {
            id: novoId,
            clientName: contato.nome || 'Cliente Bling',
            phone: (contato.celular || '').replace(/\\D/g, '') || undefined,
            email: contato.email || undefined,
            cpf: doc.length === 11 ? doc : undefined,
            cnpj: doc.length === 14 ? doc : undefined,
            address: addressDetails
              ? \`\${addressDetails.street}, \${addressDetails.number} - \${addressDetails.city}/\${addressDetails.state}\`
              : undefined,
            addressDetails: addressDetails || undefined,
            products: products,
            invoiceValue: nfData?.valorNota || blingOrder.total || 0,
            origin: origem,
            paymentMethod: formaPagamento,
            paymentStatus: 'pago',
            paymentDate: blingOrder.data,
            status: 'entregue', // arquivados já entregues
            archived: true,
            archivedAt: new Date().toISOString(),
            blingOrderId: String(blingOrder.id),
            blingOrderNumero: blingOrder.numero,
            createdAt: \`\${blingOrder.data}T12:00:00.000Z\`,
            updatedAt: new Date().toISOString(),
            statusHistory: [{
              action: 'Importado do Bling',
              details: \`Pedido Bling #\${blingOrder.numero} importado automaticamente\`,
              timestamp: new Date().toISOString(),
            }],
          };

          // NF
          if (nfData) {
            novoPedido.hasInvoice = true;
            novoPedido.invoiceNumber = String(nfData.numero || '');
            novoPedido.invoiceKey = nfData.chaveAcesso || '';
            novoPedido.invoiceValue = nfData.valorNota || blingOrder.total;
          }

          // Parcelas
          if (blingOrder.parcelas?.length > 0) {
            const ultima = blingOrder.parcelas[blingOrder.parcelas.length - 1];
            if (ultima.dataVencimento && ultima.dataVencimento !== '0000-00-00') {
              novoPedido.paymentDueDate = ultima.dataVencimento;
            }
          }

          results.criados.push({
            blingId: blingOrder.id,
            blingNumero: blingOrder.numero,
            cliente: contato.nome,
            valor: blingOrder.total,
            origem,
            temNF: !!nfData,
            produtos: products.length,
          });

          if (!dryRun) {
            await adminDb.collection('orders').doc(novoId).set(novoPedido);
          }
        }

      } catch (e: any) {
        results.erros.push({
          blingId: blingOrderResumido.id,
          error: e.message,
        });
      }

      await new Promise(r => setTimeout(r, 200)); // rate limit
    }

    return NextResponse.json({
      ok: true,
      dryRun,
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
  return NextResponse.json({
    ok: true,
    message: 'Use POST com { "dryRun": true, "dataInicial": "2026-03-01" } para simular.',
  });
}
`;

fs.writeFileSync(routePath, routeContent, 'utf8');
console.log('OK: Rota criada em', routePath);
console.log('');
console.log('Próximo passo:');
console.log('  npx tsc --noEmit');
console.log('  git add . && git commit -m "feat: rota importar-pedidos Bling com criação automática" && git push');
console.log('');
console.log('Depois teste com dryRun:');
console.log('  curl -s -X POST https://fluxia-next.vercel.app/api/bling/importar-pedidos \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"dryRun":true,"dataInicial":"2026-03-01"}\' | head -c 3000');