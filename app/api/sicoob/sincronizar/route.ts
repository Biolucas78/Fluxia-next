import { NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert, extrairDataPagamento } from '@/lib/sicoob';
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');
    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;

    // Buscar todos os pedidos entregues nao pagos
    const snapshot = await adminDb.collection('orders')
      .where('status', '==', 'entregue')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ ok: true, updated: 0, message: 'Nenhum pedido entregue encontrado' });
    }

    let updated = 0;
    let linked = 0;
    let errors = 0;

    for (const docSnap of snapshot.docs) {
      const order = docSnap.data();
      if (order.paymentStatus === 'pago') continue;

      const cpfCnpj = (order.cnpj || order.cpf || '').replace(/\D/g, '');
      if (!cpfCnpj) continue;

      try {
        // CASO 1: Já tem nossoNumero — consulta direta
        if (order.boletoNossoNumero) {
          const nossoNumeros = String(order.boletoNossoNumero).split(',');
          for (const nossoNumero of nossoNumeros) {
            if (!nossoNumero.trim()) continue;
            const result = await makeSicoobRequest(
              {
                hostname: 'api.sicoob.com.br',
                port: 443,
                path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&codigoModalidade=1&nossoNumero=' + nossoNumero.trim(),
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token },
              },
              null, pfxBuffer, certPassword
            );
            const boleto = result.body?.resultado;
            if (!boleto) continue;
            const situacao = boleto.situacaoBoleto;
            const isPago = situacao === 'Liquidado' || situacao === 'Pago';
            if (isPago || situacao === 'Baixado') {
              const dataPag = isPago ? extrairDataPagamento(boleto) : null;
              const boletosAtualizados = (order.boletos || []).map((b: any) =>
                String(b.nossoNumero) === nossoNumero.trim()
                  ? { ...b, situacao, ...(dataPag ? { dataPagamento: dataPag } : {}) }
                  : b
              );
              const updatePayload: any = {
                paymentStatus: 'pago',
                paymentMethod: 'boleto',
                boletSituacao: situacao,
                ...(boletosAtualizados.length > 0 ? { boletos: boletosAtualizados } : {}),
                statusHistory: [
                  ...(order.statusHistory || []),
                  { action: 'Pagamento confirmado via sincronizacao Sicoob', timestamp: new Date().toISOString() }
                ],
                ...(order.status === 'entregue' ? { archived: true, archivedAt: new Date().toISOString() } : {}),
              };
              if (dataPag) updatePayload.paymentDate = dataPag;
              await docSnap.ref.update(updatePayload);
              updated++;
            }
          }
          continue;
        }

        // CASO 2: Tem NF mas nao tem nossoNumero — busca pelo CPF/CNPJ
        if (!order.invoiceNumber) continue;

        const result = await makeSicoobRequest(
          {
            hostname: 'api.sicoob.com.br',
            port: 443,
            path: '/cobranca-bancaria/v3/pagadores/' + cpfCnpj + '/boletos?numeroCliente=' + numeroCliente,
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token },
          },
          null, pfxBuffer, certPassword
        );

        const boletos = result.body?.resultado || [];
        if (!Array.isArray(boletos)) continue;

        // Cruzar pelo seuNumero === invoiceNumber
        const invoiceNum = String(order.invoiceNumber).replace(/^0+/, '');
        const boletoEncontrado = boletos.find((b: any) => {
          const seuNum = String(b.seuNumero || '').replace(/^0+/, '');
          return seuNum === invoiceNum;
        });

        if (!boletoEncontrado) continue;

        // Salvar nossoNumero no pedido
        const nossoNumeroEncontrado = String(boletoEncontrado.nossoNumero);
        const updates: any = {
          boletoNossoNumero: nossoNumeroEncontrado,
          statusHistory: [
            ...(order.statusHistory || []),
            { action: 'NossoNumero vinculado via sincronizacao Sicoob: ' + nossoNumeroEncontrado, timestamp: new Date().toISOString() }
          ]
        };

        // Verificar se ja foi pago
        const situacao = boletoEncontrado.situacaoBoleto;
        if (situacao === 'Liquidado' || situacao === 'Baixado' || situacao === 'Pago') {
          updates.paymentStatus = 'pago';
          updates.paymentMethod = 'boleto';
          const dataPagCaso2 = (situacao === 'Liquidado' || situacao === 'Pago') ? extrairDataPagamento(boletoEncontrado) : null;
          if (dataPagCaso2) {
            updates.paymentDate = dataPagCaso2;
          }
          if (order.status === 'entregue') {
            updates.archived = true;
            updates.archivedAt = new Date().toISOString();
          }
          updated++;
        }

        await docSnap.ref.update(updates);
        linked++;

      } catch (e) {
        errors++;
      }
    }

    return NextResponse.json({ ok: true, updated, linked, errors, total: snapshot.size });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
