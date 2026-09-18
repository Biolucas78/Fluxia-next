import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// POST /api/financeiro/compare-bling
// Body: { orders: BlingOrder[] }
// BlingOrder: { numero: number, data: string, cliente: string, situacao: string, valor: number }

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
        // blingOrderNumero = número sequencial visível no Bling (ex: 1542)
        // blingOrderId = ID interno do Bling (número grande, ex: 14814793...)
        blingOrderNumero: data.blingOrderNumero ?? null,
        clientName: data.clientName ?? data.client ?? '',
        status: data.status ?? '',
        // invoiceValue é o campo usado pelos pedidos importados do Bling
        totalValue: data.totalValue ?? data.invoiceValue ?? data.noInvoiceValue ?? data.total ?? 0,
        isDeleted: !!(data.isDeleted || data.deleted),
        isSample: !!data.isSample,
        paymentStatus: data.paymentStatus ?? '',
        paymentConfirmedManually: !!data.paymentConfirmedManually,
      };
    });

    // Indexar por blingOrderNumero (número sequencial = o que o PDF mostra)
    // Fallback: tenta blingOrderId caso blingOrderNumero não esteja preenchido
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

    const results: CompareResult[] = [];

    for (const b of blingOrders) {
      const numero = Number(b.numero);
      // Prioridade: blingOrderNumero → blingOrderId
      const f = fluxiaByNumero.get(String(numero)) ?? fluxiaByBlingId.get(String(numero));

      if (!f) {
        results.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          status: 'AUSENTE_NO_FLUXIA',
          fluxiaStatus: null,
          fluxiaValor: null,
          diferenca: null,
        });
        continue;
      }

      const diff = Math.abs((f.totalValue ?? 0) - (b.valor ?? 0));
      const hasValueDiff = diff > 0.05;

      if (f.isDeleted) {
        results.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          status: 'DELETADO_NO_FLUXIA',
          fluxiaStatus: f.status,
          fluxiaValor: f.totalValue,
          diferenca: hasValueDiff ? diff : null,
        });
      } else if (hasValueDiff) {
        results.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          status: 'VALOR_DIVERGENTE',
          fluxiaStatus: f.status,
          fluxiaValor: f.totalValue,
          diferenca: diff,
        });
      } else {
        results.push({
          blingNumero: numero,
          blingCliente: b.cliente,
          blingSituacao: b.situacao,
          blingValor: b.valor,
          status: 'OK',
          fluxiaStatus: f.status,
          fluxiaValor: f.totalValue,
          diferenca: null,
        });
      }
    }

    // Pedidos no Fluxia que não estão no Bling
    const blingNums = new Set(blingOrders.map(b => String(Number(b.numero))));
    const fluxiaSemBling = fluxiaOrders.filter(f => {
      if (f.isDeleted || f.isSample) return false;
      if (!f.blingOrderNumero && !f.blingOrderId) return false;
      const num = String(f.blingOrderNumero ?? '');
      const id = String(f.blingOrderId ?? '');
      return !blingNums.has(num) && !blingNums.has(id);
    });

    const summary = {
      total_bling: blingOrders.length,
      total_fluxia_com_blingId: fluxiaOrders.filter(f => f.blingOrderNumero || f.blingOrderId).length,
      total_fluxia: fluxiaOrders.length,
      ausentes_no_fluxia: results.filter(r => r.status === 'AUSENTE_NO_FLUXIA').length,
      deletados_no_fluxia: results.filter(r => r.status === 'DELETADO_NO_FLUXIA').length,
      com_valor_divergente: results.filter(r => r.status === 'VALOR_DIVERGENTE').length,
      ok: results.filter(r => r.status === 'OK').length,
      no_fluxia_sem_bling: fluxiaSemBling.length,
      soma_bling: blingOrders.reduce((s, b) => s + (b.valor ?? 0), 0),
      soma_fluxia_correspondentes: results.reduce((s, r) => s + (r.fluxiaValor ?? 0), 0),
    };

    const problemas = results.filter(r => r.status !== 'OK');

    return NextResponse.json({
      summary,
      problemas,
      fluxia_sem_bling: fluxiaSemBling.slice(0, 100),
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
  status: 'OK' | 'AUSENTE_NO_FLUXIA' | 'DELETADO_NO_FLUXIA' | 'VALOR_DIVERGENTE';
  fluxiaStatus: string | null;
  fluxiaValor: number | null;
  diferenca: number | null;
}
