import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';
const SITUACOES_CANCELADAS = new Set([10, 11, 12]);

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllPages(url: string, headers: Record<string, string>, maxPages = 25): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetchWithRetry(`${url}${sep}limite=100&pagina=${page}`, { headers });
    if (!res.ok) break;
    const json = await res.json();
    const items: any[] = json.data || [];
    all.push(...items);
    if (items.length < 100) break;
    await delay(250);
  }
  return all;
}

export type SyncStatus = 'OK' | 'VALOR_DIVERGENTE' | 'AUSENTE_NO_FLUXIA' | 'SEM_CORRESPONDENTE';
export type LinkType = 'invoiceLinked' | 'noInvoiceLinked';

export interface SyncResult {
  blingId: string | null;
  blingNumero: number | null;
  blingCliente: string;
  blingValor: number | null;
  blingData: string;
  blingSituacao: string;
  fluxiaId: string | null;
  fluxiaStatus: string | null;
  fluxiaTipo: LinkType | null;
  fluxiaValor: number | null;
  status: SyncStatus;
  diferenca: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dataInicial = body.dataInicial || '2026-01-01';
    const dataFinal = body.dataFinal || new Date().toISOString().substring(0, 10);

    const token = await getValidBlingTokenServer();
    if (!token) return NextResponse.json({ error: 'Token do Bling inválido.' }, { status: 401 });
    const headers = { Authorization: `Bearer ${token}` };

    // 1. Buscar todos os pedidos do Bling no período
    const blingList = await fetchAllPages(
      `${BLING_BASE}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}`,
      headers
    );
    const cancelados = blingList.filter(o => SITUACOES_CANCELADAS.has(o.situacao?.id));
    const blingAtivos = blingList.filter(o => !SITUACOES_CANCELADAS.has(o.situacao?.id));

    // Index: blingId → order info
    const blingById = new Map<string, { id: string; numero: number; total: number; cliente: string; data: string; situacao: string }>();
    for (const o of blingAtivos) {
      blingById.set(String(o.id), {
        id: String(o.id),
        numero: Number(o.numero),
        total: o.totalProdutos || o.total || 0,
        cliente: o.contato?.nome || '',
        data: o.data || '',
        situacao: o.situacao?.valor || '',
      });
    }

    // 2. Buscar todas as NFs do Bling → nfByNumero: invoiceNumber → { blingOrderId, nfValor }
    // A listagem de NFs no Bling v3 inclui pedidoVenda.id em cada item
    const nfList = await fetchAllPages(`${BLING_BASE}/nfe`, headers);
    const nfByNumero = new Map<string, { blingOrderId: string; nfValor: number }>();
    for (const nf of nfList) {
      const nfNumero = String(nf.numero || '');
      const pedidoId = nf.pedidoVenda?.id ? String(nf.pedidoVenda.id) : null;
      const nfValor = nf.total || nf.valorNota || 0;
      if (nfNumero && pedidoId) {
        nfByNumero.set(nfNumero, { blingOrderId: pedidoId, nfValor });
      }
    }

    // Fallback: se a listagem não trouxe pedidoVenda, buscar detalhes para as NFs que precisamos
    // (identificadas pelos invoiceNumbers dos pedidos do Fluxia com invoiceLinked)
    const snapPre = await adminDb.collection('orders').where('invoiceLinked', '==', true).get();
    const neededNFNumbers = new Set<string>();
    for (const d of snapPre.docs) {
      const inv = d.data().invoiceNumber;
      if (inv && !nfByNumero.has(String(inv))) neededNFNumbers.add(String(inv));
    }

    if (neededNFNumbers.size > 0) {
      // Buscar detalhes dessas NFs específicas (máx 50 por chamada para não demorar demais)
      const needed = [...neededNFNumbers].slice(0, 50);
      for (const num of needed) {
        await delay(200);
        const res = await fetchWithRetry(`${BLING_BASE}/nfe?numero=${num}&limite=5`, { headers });
        if (!res.ok) continue;
        const json = await res.json();
        const nfs: any[] = json.data || [];
        for (const nf of nfs) {
          const nfNum = String(nf.numero || '');
          if (nfNum !== num) continue;
          // Buscar detalhe para pegar pedidoVenda
          await delay(150);
          const detRes = await fetchWithRetry(`${BLING_BASE}/nfe/${nf.id}`, { headers });
          if (!detRes.ok) continue;
          const det = await detRes.json();
          const d = det.data || {};
          const pedidoId = d.pedidoVenda?.id ? String(d.pedidoVenda.id) : null;
          if (pedidoId) {
            nfByNumero.set(nfNum, { blingOrderId: pedidoId, nfValor: d.valorNota || d.total || 0 });
          }
        }
      }
    }

    // 3. Carregar todos os pedidos do Fluxia
    const snap = await adminDb.collection('orders').get();
    const fluxiaOrders = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      return {
        id: d.id,
        clientName: data.clientName ?? '',
        status: data.status ?? '',
        isDeleted: !!(data.isDeleted || data.deleted),
        isSample: !!data.isSample,
        invoiceLinked: !!data.invoiceLinked,
        invoiceNumber: data.invoiceNumber ? String(data.invoiceNumber) : null,
        invoiceValue: typeof data.invoiceValue === 'number' ? data.invoiceValue : null,
        noInvoiceLinked: !!data.noInvoiceLinked,
        noInvoiceBlingOrderId: data.noInvoiceBlingOrderId ? String(data.noInvoiceBlingOrderId) : null,
        noInvoiceValue: typeof data.noInvoiceValue === 'number' ? data.noInvoiceValue : null,
      };
    });

    // 4. Match e comparação
    const matchedBlingIds = new Set<string>();
    const resultados: SyncResult[] = [];

    for (const f of fluxiaOrders) {
      if (f.isDeleted || f.isSample) continue;
      if (!f.invoiceLinked && !f.noInvoiceLinked) continue;

      let blingOrder: ReturnType<typeof blingById.get> | null = null;
      let fluxiaValor: number | null = null;
      let fluxiaTipo: LinkType | null = null;
      let blingValorRef: number | null = null;

      if (f.noInvoiceLinked && f.noInvoiceBlingOrderId) {
        blingOrder = blingById.get(f.noInvoiceBlingOrderId) ?? null;
        fluxiaValor = f.noInvoiceValue;
        fluxiaTipo = 'noInvoiceLinked';
        blingValorRef = blingOrder?.total ?? null;
      } else if (f.invoiceLinked && f.invoiceNumber) {
        const nfInfo = nfByNumero.get(f.invoiceNumber);
        if (nfInfo) {
          blingOrder = blingById.get(nfInfo.blingOrderId) ?? null;
          blingValorRef = nfInfo.nfValor;
        }
        fluxiaValor = f.invoiceValue;
        fluxiaTipo = 'invoiceLinked';
      }

      if (blingOrder) {
        matchedBlingIds.add(blingOrder.id);
        const diff = fluxiaValor != null && blingValorRef != null ? Math.abs(fluxiaValor - blingValorRef) : null;
        const status: SyncStatus = diff != null && diff > 0.05 ? 'VALOR_DIVERGENTE' : 'OK';
        resultados.push({
          blingId: blingOrder.id,
          blingNumero: blingOrder.numero,
          blingCliente: blingOrder.cliente,
          blingValor: blingValorRef,
          blingData: blingOrder.data,
          blingSituacao: blingOrder.situacao,
          fluxiaId: f.id,
          fluxiaStatus: f.status,
          fluxiaTipo,
          fluxiaValor,
          status,
          diferenca: diff != null && diff > 0.05 ? diff : null,
        });
      } else {
        // Pedido vinculado no Fluxia mas sem correspondente no Bling (cancelado ou fora do período)
        resultados.push({
          blingId: null,
          blingNumero: null,
          blingCliente: f.clientName,
          blingValor: null,
          blingData: '',
          blingSituacao: '',
          fluxiaId: f.id,
          fluxiaStatus: f.status,
          fluxiaTipo,
          fluxiaValor,
          status: 'SEM_CORRESPONDENTE',
          diferenca: null,
        });
      }
    }

    // 5. Pedidos do Bling sem correspondente no Fluxia
    for (const [blingId, bo] of blingById) {
      if (!matchedBlingIds.has(blingId)) {
        resultados.push({
          blingId,
          blingNumero: bo.numero,
          blingCliente: bo.cliente,
          blingValor: bo.total,
          blingData: bo.data,
          blingSituacao: bo.situacao,
          fluxiaId: null,
          fluxiaStatus: null,
          fluxiaTipo: null,
          fluxiaValor: null,
          status: 'AUSENTE_NO_FLUXIA',
          diferenca: null,
        });
      }
    }

    const priority: Record<SyncStatus, number> = {
      AUSENTE_NO_FLUXIA: 0,
      VALOR_DIVERGENTE: 1,
      SEM_CORRESPONDENTE: 2,
      OK: 3,
    };
    resultados.sort((a, b) => {
      const p = priority[a.status] - priority[b.status];
      if (p !== 0) return p;
      return (b.blingNumero ?? 0) - (a.blingNumero ?? 0);
    });

    return NextResponse.json({
      summary: {
        total_bling: blingAtivos.length,
        total_cancelados: cancelados.length,
        total_nfs: nfList.length,
        ok: resultados.filter(r => r.status === 'OK').length,
        divergentes: resultados.filter(r => r.status === 'VALOR_DIVERGENTE').length,
        ausentes: resultados.filter(r => r.status === 'AUSENTE_NO_FLUXIA').length,
        sem_correspondente: resultados.filter(r => r.status === 'SEM_CORRESPONDENTE').length,
      },
      resultados,
    });
  } catch (err: any) {
    console.error('[sync-check]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
