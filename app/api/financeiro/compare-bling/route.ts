import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

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
  const diff = Math.abs(f.financialValue - blingValor);
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

    const cancelados = blingOrders.filter(b => String(b.situacao).toLowerCase().includes('cancel'));
    const activeBlingOrders = blingOrders.filter(b => !String(b.situacao).toLowerCase().includes('cancel'));

    const snap = await adminDb.collection('orders').get();
    const fluxiaOrders: FluxiaOrder[] = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      const linkType: LinkType = data.invoiceLinked ? 'invoiceLinked' : data.noInvoiceLinked ? 'noInvoiceLinked' : 'none';
      const financialValue =
        linkType === 'invoiceLinked' ? (data.invoiceValue ?? 0) :
        linkType === 'noInvoiceLinked' ? (data.noInvoiceValue ?? 0) :
        (data.totalValue ?? data.total ?? 0);
      return {
        id: d.id,
        blingOrderNumero: data.blingOrderNumero ?? null,
        clientName: data.clientName ?? data.client ?? '',
        status: data.status ?? '',
        financialValue,
        linkType,
        createdAt: data.createdAt ?? '',
        isDeleted: !!(data.isDeleted || data.deleted),
        isSample: !!data.isSample,
      };
    });

    const fluxiaByNumero = new Map<string, FluxiaOrder>();
    for (const o of fluxiaOrders) {
      if (o.blingOrderNumero != null && String(o.blingOrderNumero) !== '') {
        fluxiaByNumero.set(String(o.blingOrderNumero), o);
      }
    }

    const fluxiaSemVinculo = fluxiaOrders.filter(
      f => !f.isDeleted && !f.isSample && f.linkType === 'none' && !f.blingOrderNumero
    );

    const results: CompareResult[] = [];
    const ausentes: AusenteComCandidatos[] = [];
    const linkedIds = new Set(fluxiaOrders.filter(o => o.blingOrderNumero || o.linkType !== 'none').map(o => o.id));
    const candidatePool = fluxiaOrders.filter(f => !f.isDeleted && !f.isSample);

    for (const b of activeBlingOrders) {
      const numero = Number(b.numero);
      const f = fluxiaByNumero.get(String(numero));

      if (!f) {
        const scored = candidatePool
          .map(fl => ({ fl, score: candidateScore(b.cliente, b.valor, fl) }))
          .filter(x => x.score >= 0.25)
          .sort((a, z) => z.score - a.score)
          .slice(0, 4);

        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'AUSENTE_NO_FLUXIA',
          fluxiaId: null, linkType: null, fluxiaStatus: null, fluxiaValor: null, diferenca: null,
        });
        ausentes.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          candidatos: scored.map(x => ({
            fluxiaId: x.fl.id, clientName: x.fl.clientName, totalValue: x.fl.financialValue,
            status: x.fl.status, createdAt: String(x.fl.createdAt).substring(0, 10),
            jaVinculado: linkedIds.has(x.fl.id), score: Math.round(x.score * 100),
          })),
        });
        continue;
      }

      const diff = Math.abs(f.financialValue - (b.valor ?? 0));
      const hasValueDiff = diff > 0.05;

      if (f.isDeleted) {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'DELETADO_NO_FLUXIA', fluxiaId: f.id, linkType: f.linkType,
          fluxiaStatus: f.status, fluxiaValor: f.financialValue, diferenca: hasValueDiff ? diff : null,
        });
      } else if (hasValueDiff) {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'VALOR_DIVERGENTE', fluxiaId: f.id, linkType: f.linkType,
          fluxiaStatus: f.status, fluxiaValor: f.financialValue, diferenca: diff,
        });
      } else {
        results.push({
          blingNumero: numero, blingCliente: b.cliente, blingSituacao: b.situacao,
          blingValor: b.valor, blingData: b.data,
          status: 'OK', fluxiaId: f.id, linkType: f.linkType,
          fluxiaStatus: f.status, fluxiaValor: f.financialValue, diferenca: null,
        });
      }
    }

    const summary = {
      total_bling_bruto: blingOrders.length,
      total_cancelados: cancelados.length,
      total_bling: activeBlingOrders.length,
      total_fluxia: fluxiaOrders.length,
      total_fluxia_com_vinculo: fluxiaOrders.filter(f => f.blingOrderNumero).length,
      total_fluxia_sem_vinculo: fluxiaSemVinculo.length,
      ausentes_no_fluxia: results.filter(r => r.status === 'AUSENTE_NO_FLUXIA').length,
      deletados_no_fluxia: results.filter(r => r.status === 'DELETADO_NO_FLUXIA').length,
      com_valor_divergente: results.filter(r => r.status === 'VALOR_DIVERGENTE').length,
      ok: results.filter(r => r.status === 'OK').length,
      soma_bling: activeBlingOrders.reduce((s, b) => s + (b.valor ?? 0), 0),
      soma_fluxia_correspondentes: results.filter(r => r.fluxiaValor != null).reduce((s, r) => s + (r.fluxiaValor ?? 0), 0),
    };

    return NextResponse.json({
      summary,
      problemas: results.filter(r => r.status !== 'OK'),
      ausentes,
      fluxia_sem_vinculo: fluxiaSemVinculo.map(f => ({
        fluxiaId: f.id, clientName: f.clientName, totalValue: f.financialValue,
        status: f.status, createdAt: String(f.createdAt).substring(0, 10),
      })),
    });
  } catch (err: any) {
    console.error('[compare-bling]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

type LinkType = 'invoiceLinked' | 'noInvoiceLinked' | 'none';

interface BlingOrder {
  numero: number | string;
  data: string;
  cliente: string;
  situacao: string;
  valor: number;
}

interface FluxiaOrder {
  id: string;
  blingOrderNumero: string | number | null;
  clientName: string;
  status: string;
  financialValue: number;
  linkType: LinkType;
  createdAt: string;
  isDeleted: boolean;
  isSample: boolean;
}

interface CompareResult {
  blingNumero: number;
  blingCliente: string;
  blingSituacao: string;
  blingValor: number;
  blingData: string;
  status: 'OK' | 'AUSENTE_NO_FLUXIA' | 'DELETADO_NO_FLUXIA' | 'VALOR_DIVERGENTE';
  fluxiaId: string | null;
  linkType: LinkType | null;
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
