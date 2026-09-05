import { NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert, extrairDataPagamento } from '@/lib/sicoob';
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');
    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;

    // Busca todos os pedidos com boleto vinculado
    const snapshot = await adminDb.collection('orders')
      .where('boletoLinked', '==', true)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ ok: true, atualizados: 0, ignorados: 0, erros: 0, message: 'Nenhum pedido com boleto vinculado' });
    }

    let atualizados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const docSnap of snapshot.docs) {
      const order = docSnap.data();

      // Só re-sincroniza boletos pagos
      const isPago = order.paymentStatus === 'pago' || order.paymentConfirmedManually;
      if (!isPago) { ignorados++; continue; }

      try {
        // CASO 1: Pedido com múltiplos boletos (array boletos[])
        if (order.boletos && Array.isArray(order.boletos) && order.boletos.length > 1) {
          let alterou = false;
          const boletosAtualizados = [...order.boletos];

          for (let i = 0; i < boletosAtualizados.length; i++) {
            const b = boletosAtualizados[i];
            const nossoNumero = String(b.nossoNumero || '').trim();
            if (!nossoNumero) continue;

            // Só processa parcelas pagas sem dataPagamento real (ou com data suspeita = mesmo dia da sync)
            const situacaoParca = b.situacao || '';
            const parcIsPaga = situacaoParca === 'Liquidado' || situacaoParca === 'Pago' || b.paidManually;
            if (!parcIsPaga) continue;

            const result = await makeSicoobRequest(
              {
                hostname: 'api.sicoob.com.br',
                port: 443,
                path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&codigoModalidade=1&nossoNumero=' + nossoNumero,
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token },
              },
              null, pfxBuffer, certPassword
            );

            const boletoDados = result.body?.resultado;
            if (!boletoDados) continue;

            const dataPag = extrairDataPagamento(boletoDados);
            if (dataPag && dataPag !== b.dataPagamento) {
              boletosAtualizados[i] = { ...b, dataPagamento: dataPag };
              alterou = true;
            }
          }

          if (alterou) {
            await docSnap.ref.update({ boletos: boletosAtualizados, updatedAt: new Date().toISOString() });
            atualizados++;
          } else {
            ignorados++;
          }
          continue;
        }

        // CASO 2: Pedido com boleto único (boletoNossoNumero)
        const nossoNumerosRaw = String(order.boletoNossoNumero || '').trim();
        if (!nossoNumerosRaw) { ignorados++; continue; }

        // Pode ser múltiplos separados por vírgula mesmo no campo único
        const nossoNumeros = nossoNumerosRaw.split(',').map((n: string) => n.trim()).filter(Boolean);
        let melhorData: string | null = null;
        const boletosAtualizadosCaso2 = [...(order.boletos || [])];

        for (const nossoNumero of nossoNumeros) {
          const result = await makeSicoobRequest(
            {
              hostname: 'api.sicoob.com.br',
              port: 443,
              path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&codigoModalidade=1&nossoNumero=' + nossoNumero,
              method: 'GET',
              headers: { 'Authorization': 'Bearer ' + token },
            },
            null, pfxBuffer, certPassword
          );

          const boletoDados = result.body?.resultado;
          if (!boletoDados) continue;

          const dataPag = extrairDataPagamento(boletoDados);
          if (dataPag) {
            melhorData = dataPag;
            // Atualiza também no array de boletos se existir
            for (let i = 0; i < boletosAtualizadosCaso2.length; i++) {
              if (String(boletosAtualizadosCaso2[i].nossoNumero) === nossoNumero) {
                boletosAtualizadosCaso2[i] = { ...boletosAtualizadosCaso2[i], dataPagamento: dataPag };
              }
            }
          }
        }

        if (melhorData && melhorData !== order.paymentDate) {
          const upd: any = { paymentDate: melhorData, updatedAt: new Date().toISOString() };
          if (boletosAtualizadosCaso2.length > 0) upd.boletos = boletosAtualizadosCaso2;
          await docSnap.ref.update(upd);
          atualizados++;
        } else {
          ignorados++;
        }

      } catch {
        erros++;
      }
    }

    return NextResponse.json({
      ok: true,
      atualizados,
      ignorados,
      erros,
      total: snapshot.size,
      message: `${atualizados} pedido(s) atualizados com data real de pagamento do Sicoob.`
    });

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
