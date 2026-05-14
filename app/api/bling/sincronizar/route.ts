import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';

// Busca detalhes da NF pelo ID dela no Bling
async function fetchNFDetails(nfeId: string, headers: any) {
  try {
    const res = await fetchWithRetry(`${BLING_BASE}/nfe/${nfeId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch {
    return null;
  }
}

// Busca pedido Bling por ID
async function fetchBlingOrder(blingOrderId: string, headers: any) {
  try {
    const res = await fetchWithRetry(`${BLING_BASE}/pedidos/vendas/${blingOrderId}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || data || null;
  } catch {
    return null;
  }
}

// Tenta encontrar o pedido no Fluxia correspondente ao pedido do Bling
async function findFluxiaOrder(blingOrder: any, allFluxiaOrders: any[]) {
  const blingId = String(blingOrder.id);
  const doc = (blingOrder.contato?.numeroDocumento || '').replace(/\D/g, '');
  const valor = blingOrder.total;
  const dataBling = blingOrder.data; // 'YYYY-MM-DD'

  // 1. Por blingOrderId
  const byId = allFluxiaOrders.find(o => String(o.blingOrderId) === blingId);
  if (byId) return { order: byId, matchType: 'blingOrderId' };

  // 2. Por CNPJ
  if (doc.length === 14) {
    const byCnpj = allFluxiaOrders.filter(o => {
      const cnpj = (o.cnpj || '').replace(/\D/g, '');
      return cnpj === doc;
    });
    if (byCnpj.length === 1) return { order: byCnpj[0], matchType: 'cnpj' };
    // Se mais de um, refina por valor e data
    if (byCnpj.length > 1) {
      const byValor = byCnpj.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const orderDate = (o.createdAt || '').substring(0, 10);
        const dateDiff = Math.abs(new Date(orderDate).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dateDiff < 7 * 24 * 60 * 60 * 1000; // mesmo valor, ±7 dias
      });
      if (byValor) return { order: byValor, matchType: 'cnpj+valor+data' };
    }
  }

  // 3. Por CPF
  if (doc.length === 11) {
    const byCpf = allFluxiaOrders.filter(o => {
      const cpf = (o.cpf || '').replace(/\D/g, '');
      return cpf === doc;
    });
    if (byCpf.length === 1) return { order: byCpf[0], matchType: 'cpf' };
    if (byCpf.length > 1) {
      const byValor = byCpf.find(o => {
        const diff = Math.abs((o.invoiceValue || o.totalValue || 0) - valor);
        const orderDate = (o.createdAt || '').substring(0, 10);
        const dateDiff = Math.abs(new Date(orderDate).getTime() - new Date(dataBling).getTime());
        return diff < 1 && dateDiff < 7 * 24 * 60 * 60 * 1000;
      });
      if (byValor) return { order: byValor, matchType: 'cpf+valor+data' };
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true; // se true, só lista o que faria sem salvar

    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Token Bling não encontrado. Reautentique em Configurações.' }, { status: 401 });
    }
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Buscar todos os pedidos do Fluxia (março/abril/maio)
    const snapshot = await adminDb.collection('orders').get();
    const allFluxiaOrders = snapshot.docs.map((doc: any) => ({ _ref: doc.ref, id: doc.id, ...doc.data() }));
    console.log(`[Sync Bling] ${allFluxiaOrders.length} pedidos no Fluxia`);

    // 2. Buscar pedidos do Bling de março a hoje (paginado)
    const dataInicial = '2026-03-01';
    let allBlingOrders: any[] = [];
    let pagina = 1;
    const MAX_PAGES = 15; // 15 × 100 = 1500 pedidos max

    while (pagina <= MAX_PAGES) {
      const res = await fetchWithRetry(
        `${BLING_BASE}/pedidos/vendas?dataInicial=${dataInicial}&limite=100&pagina=${pagina}`,
        { headers }
      );
      if (!res.ok) break;
      const data = await res.json();
      const orders = data.data || [];
      if (orders.length === 0) break;
      allBlingOrders = [...allBlingOrders, ...orders];
      if (orders.length < 100) break; // última página
      pagina++;
      await new Promise(r => setTimeout(r, 300)); // evitar 429
    }

    console.log(`[Sync Bling] ${allBlingOrders.length} pedidos no Bling desde ${dataInicial}`);

    // 3. Para cada pedido do Bling, tentar parear com Fluxia e sincronizar
    const results = {
      matched: [] as any[],
      unmatched: [] as any[],
      updated: 0,
      errors: [] as any[],
    };

    for (const blingOrder of allBlingOrders) {
      try {
        const match = await findFluxiaOrder(blingOrder, allFluxiaOrders);

        if (!match) {
          results.unmatched.push({
            blingId: blingOrder.id,
            numero: blingOrder.numero,
            cliente: blingOrder.contato?.nome,
            documento: blingOrder.contato?.numeroDocumento,
            valor: blingOrder.total,
            data: blingOrder.data,
            temNF: !!blingOrder.notaFiscal?.id,
          });
          continue;
        }

        const { order: fluxiaOrder, matchType } = match;

        // Montar updates
        const updates: any = {
          blingOrderId: String(blingOrder.id),
          blingOrderNumero: blingOrder.numero,
        };

        // Data de vencimento das parcelas
        if (blingOrder.parcelas && blingOrder.parcelas.length > 0) {
          const ultimaParcela = blingOrder.parcelas[blingOrder.parcelas.length - 1];
          if (ultimaParcela.dataVencimento && ultimaParcela.dataVencimento !== '0000-00-00') {
            updates.paymentDueDate = ultimaParcela.dataVencimento;
          }
          // Forma de pagamento
          if (blingOrder.parcelas[0]?.formaPagamento?.id > 0) {
            updates.blingFormaPagamentoId = blingOrder.parcelas[0].formaPagamento.id;
          }
        }

        // NF vinculada no Bling
        if (blingOrder.notaFiscal?.id && !fluxiaOrder.invoiceNumber) {
          await new Promise(r => setTimeout(r, 200));
          const nfDetails = await fetchNFDetails(String(blingOrder.notaFiscal.id), headers);
          if (nfDetails) {
            updates.hasInvoice = true;
            updates.invoiceNumber = String(nfDetails.numero || '');
            updates.invoiceKey = nfDetails.chaveAcesso || '';
            updates.invoiceValue = nfDetails.valorNota || blingOrder.total || 0;
          }
        }

        // Valor do pedido se não tiver
        if (!fluxiaOrder.invoiceValue && blingOrder.total) {
          updates.invoiceValue = blingOrder.total;
        }

        const matchInfo = {
          fluxiaId: fluxiaOrder.id,
          blingId: blingOrder.id,
          blingNumero: blingOrder.numero,
          cliente: blingOrder.contato?.nome,
          valor: blingOrder.total,
          data: blingOrder.data,
          matchType,
          updates: Object.keys(updates).filter(k => k !== 'blingOrderId' && k !== 'blingOrderNumero'),
          temNF: !!updates.invoiceNumber,
        };

        results.matched.push(matchInfo);

        if (!dryRun && Object.keys(updates).length > 0) {
          await fluxiaOrder._ref.update({
            ...updates,
            statusHistory: [
              ...(fluxiaOrder.statusHistory || []),
              {
                action: `Sincronizado com Bling (match: ${matchType})`,
                details: updates.invoiceNumber ? `NF: ${updates.invoiceNumber}` : 'Dados atualizados',
                timestamp: new Date().toISOString(),
              },
            ],
          });
          results.updated++;
        }

      } catch (e: any) {
        results.errors.push({
          blingId: blingOrder.id,
          error: e.message,
        });
      }

      await new Promise(r => setTimeout(r, 150)); // rate limit
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      resumo: {
        blingOrders: allBlingOrders.length,
        fluxiaOrders: allFluxiaOrders.length,
        matched: results.matched.length,
        unmatched: results.unmatched.length,
        updated: results.updated,
        errors: results.errors.length,
      },
      matched: results.matched,
      unmatched: results.unmatched.slice(0, 50), // limitar para não estourar resposta
      errors: results.errors,
    });

  } catch (error: any) {
    console.error('[Sync Bling] Erro:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET — só retorna status sem fazer nada
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Use POST com { "dryRun": true } para simular, ou POST sem dryRun para sincronizar.',
  });
}