import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// POST /api/financeiro/sincronizar-valor
// Atualiza o valor financeiro de um pedido Fluxia com o valor do Bling (fonte de verdade).
// Detecta automaticamente qual campo atualizar conforme o tipo de vínculo.

export async function POST(req: NextRequest) {
  try {
    const { fluxiaId, blingValor, blingNumero } = await req.json();

    if (!fluxiaId || blingValor == null) {
      return NextResponse.json({ error: 'fluxiaId e blingValor são obrigatórios.' }, { status: 400 });
    }

    const ref = adminDb.collection('orders').doc(String(fluxiaId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Pedido "${fluxiaId}" não encontrado.` }, { status: 404 });
    }

    const data = snap.data() ?? {};
    const valor = Number(blingValor);
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    let campoAtualizado = '';

    if (data.invoiceLinked) {
      updates.invoiceValue = valor;
      campoAtualizado = 'invoiceValue';
    } else if (data.noInvoiceLinked) {
      updates.noInvoiceValue = valor;
      campoAtualizado = 'noInvoiceValue';
    } else {
      updates.totalValue = valor;
      campoAtualizado = 'totalValue';
    }

    updates.statusHistory = [
      ...(data.statusHistory ?? []),
      {
        action: `Valor sincronizado com Bling${blingNumero ? ` (pedido #${blingNumero})` : ''}`,
        details: `Valor atualizado para R$ ${valor.toFixed(2)} (campo: ${campoAtualizado})`,
        timestamp: new Date().toISOString(),
      },
    ];

    await ref.update(updates);

    return NextResponse.json({ ok: true, fluxiaId, campoAtualizado, novoValor: valor });
  } catch (err: any) {
    console.error('[sincronizar-valor]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
