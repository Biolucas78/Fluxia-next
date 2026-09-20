import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Normaliza nome para comparação: remove acentos, sufixos jurídicos, pontuação
function normalizeNome(nome: string): string {
  return (nome ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ltda|me|eireli|sa|ss|epp|mei|comercio|comercial|industria|industrias|servicos|servico|alimentos|bebidas|cafeteria|cafe|emporio|distribuidora|distribuidores)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nomeScore(a: string, b: string): number {
  const na = normalizeNome(a);
  const nb = normalizeNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = new Set(nb.split(' ').filter(w => w.length > 2));
  if (wa.length === 0 || wb.size === 0) return 0;
  const common = wa.filter(w => wb.has(w));
  return (common.length / Math.max(wa.length, wb.size)) * 0.8;
}

function candidateScore(blingCliente: string, blingValor: number, f: FluxiaOrder): number {
  const nome = nomeScore(blingCliente, f.clientName);
  if (nome < 0.25) return 0;
  const fVal = f.totalValue ?? 0;
  const diff = Math.abs(fVal - blingValor);
  const valorScore = diff < 0.5 ? 1 : diff < 50 ? 0.8 : diff < 200 ? 0.5 : diff < 500 ? 0.2 : 0;
  return nome * 0.65 + valorScore * 0.35;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const blingOrders: BlingOrder[] = body.orders ?? [];

    if (!Array.isArray(blingOrders) || blingOrders.length === 0) {
      return NextResponse.json({ error: 'Envie um array "orders" com os pedidos do Bling.' }, { status: 400 });
    }

    // Buscar todos os pedidos do Firestore
    const snap = await adminDb.collection('orders').get();
    const fluxiaOrders: FluxiaOrder[] = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      return {
        id: d.id,
        blingOrderId: data.blingOrderId ?? null,
        blingOrderNumero: data.blingOrderNumero ?? null,
        clientName: data.clientName ?? data.client ?? '',
        status: data.status ?? '',
        totalValue: data.totalValue ?? data.invoiceValue ?? data.noInvoiceValue ?? data.total ?? 0,
        createdAt: data.createdAt ?? '',
        isDeleted: !!(data.isDeleted || data.deleted),
        isSample: !!data.isSample,
        paymentStatus: data.paymentStatus ?? '',
        paymentConfirmedManually: !!data.paymentConfirmedManually,
      };
    });

    // Índices por número e ID
    const fluxiaByNumero = new Map<string, FluxiaOrder>();
    const fluxiaByBlingId = new Map<string, FluxiaOrder>();
    for (const o of fluxiaOrders) {
      if (o.blingOrderNumero != null && String(o.blingOrderNumero) !== '') {
        fluxiaByNumero.set(String(o.blingOrderNumero), o);
      }
      if (o.blingOrderId != null && String(o.blingOrderId) !== '' && String(o.blingOrderId) !== '0') {
        fluxiaByBlingId.set(String(o.blingOrderId), o);
      }
    }

    // Fluxia sem vínculo: não é amostra, não é deletado, sem blingOrderNumero e sem blingOrderId
    const fluxiaSemVinculo = fluxiaOrders.filter(
      f => !f.isDeleted && !f.isSample && !f.blingOrderNumero && !f.blingOrderId
    );

    const results: CompareResult[] = [];
    const ausentes: AusenteComCandidatos[] = [];

    // IDs de Fluxia já vinculados (para não sugerir como candidatos)
    const fluxiaVinculados = new Set<string>();
    for (const o of fluxiaOrders) {
      if (o.blingOrderNumero || o.blingOrderId) fluxiaVinculados.add(o.id);
    }

    // Pool de candidatos: pedidos sem vínculo OU com vínculo (para o caso de re-link)
    const candidatePool = fluxiaOrders.filter(f => !f.isDeleted && !f.isSample);

    for (const b of blingOrders) {
      const numero = Number(b.numero);
      const f = fluxiaByNumero.get(String(numero)) ?? fluxiaByBlingId.get(String(numero));

      if (!f) {
        // Calcular candidatos por similaridade de nome + valor
        const scored = candidatePool
          .map(fl => ({ fl, score: candidateScore(b.cliente, b.valor, fl) }))
          .filter(x => x.score >= 0.25)
          .sort((a, z) => z.score - a.score)
          .slice(0, 4);

        results.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          blingData: b.data,
          status: 'AUSENTE_NO_FLUXIA',
          fluxiaStatus: null,
          fluxiaValor: null,
          diferenca: null,
        });

        ausentes.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          blingData: b.data,
          candidatos: scored.map(x => ({
            fluxiaId: x.fl.id,
            clientName: x.fl.clientName,
            totalValue: x.fl.totalValue,
            status: x.fl.status,
            createdAt: String(x.fl.createdAt).substring(0, 10),
            jaVinculado: fluxiaVinculados.has(x.fl.id),
            score: Math.round(x.score * 100),
          })),
        });
        continue;
      }

      const diff = Math.abs((f.totalValue ?? 0) - (b.valor ?? 0));
      const hasValueDiff = diff > 0.05;

      if (f.isDeleted) {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'DELETADO_NO_FLUXIA', fluxiaStatus: f.status,
          fluxiaValor: f.totalValue, diferenca: hasValueDiff ? diff : null,
        });
      } else if (hasValueDiff) {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'VALOR_DIVERGENTE', fluxiaStatus: f.status,
          fluxiaValor: f.totalValue, diferenca: diff,
        });
      } else {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'OK', fluxiaStatus: f.status,
          fluxiaValor: f.totalValue, diferenca: null,
        });
      }
    }

    // Pedidos no Bling que possuem algum match no Fluxia (por numero)
    const blingNums = new Set(blingOrders.map(b => String(Number(b.numero))));

    const summary = {
      total_bling: blingOrders.length,
      total_fluxia: fluxiaOrders.length,
      total_fluxia_com_vinculo: fluxiaOrders.filter(f => f.blingOrderNumero || f.blingOrderId).length,
      total_fluxia_sem_vinculo: fluxiaSemVinculo.length,
      ausentes_no_fluxia: results.filter(r => r.status === 'AUSENTE_NO_FLUXIA').length,
      deletados_no_fluxia: results.filter(r => r.status === 'DELETADO_NO_FLUXIA').length,
      com_valor_divergente: results.filter(r => r.status === 'VALOR_DIVERGENTE').length,
      ok: results.filter(r => r.status === 'OK').length,
      soma_bling: blingOrders.reduce((s, b) => s + (b.valor ?? 0), 0),
      soma_fluxia_correspondentes: results.filter(r => r.fluxiaValor != null).reduce((s, r) => s + (r.fluxiaValor ?? 0), 0),
    };

    const problemas = results.filter(r => r.status !== 'OK');

    return NextResponse.json({
      summary,
      problemas,
      ausentes,
      fluxia_sem_vinculo: fluxiaSemVinculo.map(f => ({
        fluxiaId: f.id,
        clientName: f.clientName,
        totalValue: f.totalValue,
        status: f.status,
        createdAt: String(f.createdAt).substring(0, 10),
      })),
    });
  } catch (err: any) {
    console.error('[compare-bling]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

interface BlingOrder {
  numero: number | string;
  data: string;
  cliente: string;
  situacao: string;
  valor: number;
}

interface FluxiaOrder {
  id: string;
  blingOrderId: string | number | null;
  blingOrderNumero: string | number | null;
  clientName: string;
  status: string;
  totalValue: number;
  createdAt: string;
  isDeleted: boolean;
  isSample: boolean;
  paymentStatus: string;
  paymentConfirmedManually: boolean;
}

interface CompareResult {
  blingNumero: number;
  blingCliente: string;
  blingSituacao: string;
  blingValor: number;
  blingData: string;
  status: 'OK' | 'AUSENTE_NO_FLUXIA' | 'DELETADO_NO_FLUXIA' | 'VALOR_DIVERGENTE';
  fluxiaStatus: string | null;
  fluxiaValor: number | null;
  diferenca: number | null;
}

interface AusenteComCandidatos {
  blingNumero: number;
  blingCliente: string;
  blingSituacao: string;
  blingValor: number;
  blingData: string;
  candidatos: {
    fluxiaId: string;
    clientName: string;
    totalValue: number;
    status: string;
    createdAt: string;
    jaVinculado: boolean;
    score: number;
  }[];
}
