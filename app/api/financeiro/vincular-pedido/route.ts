import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// POST /api/financeiro/vincular-pedido
// Vincula um pedido do Fluxia ao respectivo pedido do Bling,
// salvando blingOrderNumero, blingOrderId e sincronizando o valor (invoiceValue).
// Não altera outros campos do pedido Fluxia.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fluxiaId, blingNumero, blingId, blingValor, blingData, blingCliente } = body;

    if (!fluxiaId || !blingNumero) {
      return NextResponse.json({ error: 'fluxiaId e blingNumero são obrigatórios.' }, { status: 400 });
    }

    const ref = adminDb.collection('orders').doc(String(fluxiaId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Pedido Fluxia "${fluxiaId}" não encontrado.` }, { status: 404 });
    }

    const current = snap.data() ?? {};

    const updates: Record<string, any> = {
      blingOrderNumero: Number(blingNumero),
      updatedAt: new Date().toISOString(),
    };

    if (blingId) updates.blingOrderId = String(blingId);

    // Sincroniza o valor com o Bling (fonte de verdade)
    if (blingValor != null && blingValor > 0) {
      updates.invoiceValue = Number(blingValor);
      // Se não tem totalValue próprio, preenche também
      if (!current.totalValue) updates.totalValue = Number(blingValor);
    }

    // Preenche data de criação/pagamento somente se não existe
    if (blingData && !current.paymentDate) {
      updates.paymentDate = blingData;
    }

    // Log no statusHistory
    const historyEntry = {
      action: `Vinculado ao pedido Bling #${blingNumero}`,
      details: blingCliente ? `Cliente Bling: ${blingCliente} | Valor: R$ ${blingValor}` : `Valor: R$ ${blingValor}`,
      timestamp: new Date().toISOString(),
    };
    updates.statusHistory = [...(current.statusHistory ?? []), historyEntry];

    await ref.update(updates);

    return NextResponse.json({
      ok: true,
      fluxiaId,
      blingNumero: Number(blingNumero),
      camposAtualizados: Object.keys(updates).filter(k => k !== 'statusHistory' && k !== 'updatedAt'),
    });
  } catch (err: any) {
    console.error('[vincular-pedido]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
