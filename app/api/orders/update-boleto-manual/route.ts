import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { orderId, boletIndex, paidManually, paymentMethod, paymentDate, userName, userId } = await request.json();
    if (!orderId || boletIndex === undefined) {
      return NextResponse.json({ ok: false, error: 'orderId e boletIndex são obrigatórios' }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 });
    }

    const order = orderSnap.data() as any;
    const boletos: any[] = order.boletos || [];

    if (boletIndex < 0 || boletIndex >= boletos.length) {
      return NextResponse.json({ ok: false, error: 'Índice de boleto inválido' }, { status: 400 });
    }

    const b = boletos[boletIndex];
    const novaSituacao = paidManually ? 'LIQUIDADO' : 'EM_ABERTO';
    const boletosAtualizados = boletos.map((bl: any, j: number) => {
      if (j !== boletIndex) return bl;
      if (paidManually) {
        return { ...bl, situacao: novaSituacao, paidManually: true, ...(paymentMethod ? { paymentMethod } : {}), ...(paymentDate ? { paymentDate } : {}) };
      }
      return { ...bl, situacao: novaSituacao, paidManually: false };
    });

    const allPaid = boletosAtualizados.every((bl: any) => {
      const s = (bl.situacao || '').toLowerCase();
      return s === 'liquidado' || s === 'pago';
    });

    const action = paidManually
      ? `Parcela ${boletIndex + 1} (NF ${b.seuNumero}) baixada manualmente — PIX`
      : `Baixa manual da Parcela ${boletIndex + 1} (NF ${b.seuNumero}) desfeita`;

    const updates: any = {
      boletos: boletosAtualizados,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...(order.statusHistory || []),
        { action, timestamp: new Date().toISOString(), ...(userId ? { userId } : {}), ...(userName ? { userName } : {}) }
      ]
    };

    if (paidManually && allPaid) {
      updates.boletSituacao = 'LIQUIDADO';
      updates.paymentStatus = 'pago';
    }

    await orderRef.update(updates);

    return NextResponse.json({ ok: true, message: paidManually ? 'Parcela marcada como paga!' : 'Baixa desfeita.' });
  } catch (error: any) {
    console.error('Erro update-boleto-manual:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
