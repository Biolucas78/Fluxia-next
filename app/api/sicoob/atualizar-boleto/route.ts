import { NextRequest, NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { orderId, nossoNumero } = await request.json();
    if (!orderId || !nossoNumero) {
      return NextResponse.json({ ok: false, error: 'orderId e nossoNumero sao obrigatorios' }, { status: 400 });
    }

    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');

    const result = await makeSicoobRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&codigoModalidade=1&nossoNumero=' + String(nossoNumero).trim(),
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      },
      null, pfxBuffer, certPassword
    );

    const boleto = result.body?.resultado;
    if (!boleto) {
      return NextResponse.json({ ok: false, error: 'Boleto nao encontrado no Sicoob' }, { status: 404 });
    }

    const situacao = boleto.situacaoBoleto || '';
    const isPago = situacao === 'Liquidado' || situacao === 'Pago';
    const isBaixado = situacao === 'Baixado' || situacao === 'Cancelado';

    // Buscar pedido no Firestore
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Pedido nao encontrado' }, { status: 404 });
    }
    const order = orderSnap.data() as any;

    // Atualizar situacao no array de boletos
    const boletosAtuais = order.boletos || [];
    const boletosAtualizados = boletosAtuais.map((b: any) =>
      String(b.nossoNumero) === String(nossoNumero) ? { ...b, situacao } : b
    );

    const updates: any = {
      boletSituacao: situacao,
      boletos: boletosAtualizados,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...(order.statusHistory || []),
        { action: 'Boleto sincronizado com Sicoob: ' + situacao, timestamp: new Date().toISOString() }
      ]
    };

    if (isPago) {
      updates.paymentStatus = 'pago';
      updates.paymentMethod = 'boleto';
      updates.paymentDate = boleto.dataPagamento || new Date().toISOString().split('T')[0];
    }

    await orderRef.update(updates);

    return NextResponse.json({
      ok: true,
      situacao,
      isPago,
      isBaixado,
      message: isPago ? 'Boleto liquidado — pagamento confirmado!' : isBaixado ? 'Boleto baixado/cancelado.' : `Status atualizado: ${situacao}`
    });
  } catch (error: any) {
    console.error('Erro atualizar-boleto:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
