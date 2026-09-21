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

function normalizeNome(nome: string): string {
  return (nome ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ltda|me|eireli|sa|ss|epp|mei|comercio|comercial|industria|servicos|alimentos|bebidas|cafeteria|emporio|distribuidora)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  matchMethod: string;
  status: SyncStatus;
  diferenca: number | null;
}

interface BlingOrderInfo {
  id: string;
  numero: number;
  total: number;
  cliente: string;
  clienteNorm: string;
  data: string;
  situacao: string;
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

    // Index por ID e por valor arredondado (para fuzzy match)
    const blingById = new Map<string, BlingOrderInfo>();
    const blingByValor = new Map<string, BlingOrderInfo[]>();  // chave: valor arredondado em centavos

    for (const o of blingAtivos) {
      const info: BlingOrderInfo = {
        id: String(o.id),
        numero: Number(o.numero),
        total: o.totalProdutos || o.total || 0,
        cliente: o.contato?.nome || '',
        clienteNorm: normalizeNome(o.contato?.nome || ''),
        data: o.data || '',
        situacao: o.situacao?.valor || String(o.situacao?.id || ''),
      };
      blingById.set(info.id, info);

      const valorKey = String(Math.round(info.total * 100));
      if (!blingByValor.has(valorKey)) blingByValor.set(valorKey, []);
      blingByValor.get(valorKey)!.push(info);
    }

    // 2. Buscar listagem de NFs para tentar extrair pedidoVenda (se disponível)
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

    // 3. Carregar todos os pedidos do Fluxia (com blingOrderId para match direto)
    const snap = await adminDb.collection('orders').get();
    const fluxiaOrders = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      return {
        id: d.id,
        clientName: data.clientName ?? '',
        status: data.status ?? '',
        isDeleted: !!(data.isDeleted || data.deleted),
        isSample: !!data.isSample,
        // Vínculo via NF
        invoiceLinked: !!data.invoiceLinked,
        invoiceNumber: data.invoiceNumber ? String(data.invoiceNumber) : null,
        invoiceValue: typeof data.invoiceValue === 'number' ? data.invoiceValue : null,
        // Vínculo via Pedido sem NF
        noInvoiceLinked: !!data.noInvoiceLinked,
        noInvoiceBlingOrderId: data.noInvoiceBlingOrderId ? String(data.noInvoiceBlingOrderId) : null,
        noInvoiceValue: typeof data.noInvoiceValue === 'number' ? data.noInvoiceValue : null,
        // blingOrderId pode estar setado em ambos os casos
        blingOrderId: data.blingOrderId ? String(data.blingOrderId) : null,
      };
    });

    // 4. Match e comparação
    const matchedBlingIds = new Set<string>();
    const resultados: SyncResult[] = [];

    function fuzzyFindBlingOrder(clientName: string, valor: number | null): { order: BlingOrderInfo; method: string } | null {
      if (valor == null) return null;
      const valorKey = String(Math.round(valor * 100));
      const candidates = blingByValor.get(valorKey) ?? [];
      const normFluxia = normalizeNome(clientName);
      const firstWord = normFluxia.split(' ')[0];
      for (const bo of candidates) {
        if (matchedBlingIds.has(bo.id)) continue;
        // Match exato de nome normalizado
        if (bo.clienteNorm === normFluxia) return { order: bo, method: 'nome+valor' };
        // Match por primeiro nome
        if (firstWord.length > 2 && (bo.clienteNorm.startsWith(firstWord) || normFluxia.startsWith(bo.clienteNorm.split(' ')[0]))) {
          return { order: bo, method: 'primeiroNome+valor' };
        }
        // Match parcial: nome do Bling contém nome do Fluxia ou vice-versa
        if (firstWord.length > 3 && (bo.clienteNorm.includes(firstWord) || normFluxia.includes(bo.clienteNorm.split(' ')[0]))) {
          return { order: bo, method: 'nomeContém+valor' };
        }
      }
      return null;
    }

    for (const f of fluxiaOrders) {
      if (f.isDeleted || f.isSample) continue;
      if (!f.invoiceLinked && !f.noInvoiceLinked) continue;

      let blingOrder: BlingOrderInfo | null = null;
      let fluxiaValor: number | null = null;
      let fluxiaTipo: LinkType | null = null;
      let blingValorRef: number | null = null;
      let matchMethod = '';

      if (f.noInvoiceLinked) {
        // ─── Pedido sem NF: match direto por noInvoiceBlingOrderId ───
        if (f.noInvoiceBlingOrderId) {
          blingOrder = blingById.get(f.noInvoiceBlingOrderId) ?? null;
          if (blingOrder) matchMethod = 'noInvoiceBlingOrderId';
        }
        // Fallback: blingOrderId genérico
        if (!blingOrder && f.blingOrderId) {
          blingOrder = blingById.get(f.blingOrderId) ?? null;
          if (blingOrder) matchMethod = 'blingOrderId';
        }
        fluxiaValor = f.noInvoiceValue;
        fluxiaTipo = 'noInvoiceLinked';
        blingValorRef = blingOrder?.total ?? null;

      } else if (f.invoiceLinked) {
        // ─── Pedido com NF: 3 estratégias ───

        // Estratégia 1: blingOrderId direto no Fluxia (mais confiável)
        if (f.blingOrderId) {
          blingOrder = blingById.get(f.blingOrderId) ?? null;
          if (blingOrder) matchMethod = 'blingOrderId';
        }

        // Estratégia 2: nfByNumero → pedidoVenda.id (se Bling retornou pedidoVenda na lista de NFs)
        if (!blingOrder && f.invoiceNumber) {
          const nfInfo = nfByNumero.get(f.invoiceNumber);
          if (nfInfo) {
            blingOrder = blingById.get(nfInfo.blingOrderId) ?? null;
            if (blingOrder) {
              blingValorRef = nfInfo.nfValor;
              matchMethod = 'nfPedidoVenda';
            }
          }
        }

        // Estratégia 3: fuzzy por nome + valor (quando blingOrderId não está setado)
        if (!blingOrder) {
          const found = fuzzyFindBlingOrder(f.clientName, f.invoiceValue);
          if (found) {
            blingOrder = found.order;
            matchMethod = found.method;
          }
        }

        fluxiaValor = f.invoiceValue;
        fluxiaTipo = 'invoiceLinked';
        // Valor de referência: NF value se disponível, senão total do pedido Bling
        if (!blingValorRef) {
          const nfInfo = f.invoiceNumber ? nfByNumero.get(f.invoiceNumber) : null;
          blingValorRef = nfInfo?.nfValor ?? blingOrder?.total ?? null;
        }
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
          matchMethod,
          status,
          diferenca: diff != null && diff > 0.05 ? diff : null,
        });
      } else {
        // Fluxia order linked mas sem correspondente no Bling no período selecionado
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
          matchMethod: 'sem-match',
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
          matchMethod: '',
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
        nfs_com_pedido: nfByNumero.size,
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
