import { NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');
    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;

    // Buscar todos os pedidos com boleto emitido e não pagos
    const snapshot = await adminDb.collection('orders')
      .where('boletoNossoNumero', '!=', '')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ ok: true, updated: 0, message: 'Nenhum boleto encontrado' });
    }

    let updated = 0;
    let errors = 0;

    for (const docSnap of snapshot.docs) {
      const order = docSnap.data();
      if (order.paymentStatus === 'pago') continue; // Já pago, pula

      const nossoNumeros = String(order.boletoNossoNumero).split(',');

      for (const nossoNumero of nossoNumeros) {
        if (!nossoNumero.trim()) continue;
        try {
          const result = await makeSicoobRequest(
            {
              hostname: 'api.sicoob.com.br',
              port: 443,
              path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&nossoNumero=' + nossoNumero.trim(),
              method: 'GET',
              headers: { 'Authorization': 'Bearer ' + token },
            },
            null,
            pfxBuffer,
            certPassword
          );

          const boleto = result.body?.resultado?.[0] || result.body?.resultado;
          if (!boleto) continue;

          // Verificar se foi pago (situacao 6 = liquidado, 9 = baixado)
          const situacao = boleto.codigoSituacaoBoleto;
          if (situacao === 6 || situacao === 9) {
            const statusHistory = [
              ...(order.statusHistory || []),
              {
                action: 'Pagamento confirmado via sincronizacao Sicoob',
                details: 'NossoNumero: ' + nossoNumero.trim(),
                timestamp: new Date().toISOString()
              }
            ];
            await docSnap.ref.update({
              paymentStatus: 'pago',
              paymentMethod: 'boleto',
              paymentDate: boleto.dataPagamento || new Date().toISOString().split('T')[0],
              statusHistory,
              ...(order.status === 'entregue' ? { archived: true, archivedAt: new Date().toISOString() } : {}),
            });
            updated++;
          }
        } catch (e) {
          errors++;
        }
      }
    }

    return NextResponse.json({ ok: true, updated, errors, total: snapshot.size });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
