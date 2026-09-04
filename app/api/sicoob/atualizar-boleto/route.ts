import { NextRequest, NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';
import { adminDb } from '@/lib/firebase-admin';

function extrairDataPagamento(boleto: any): string | null {
  // Tenta listaHistorico — o Sicoob não retorna dataPagamento direto,
  // mas inclui o histórico de movimentos onde consta a liquidação
  const historico: any[] = boleto.listaHistorico || [];
  console.log('[atualizar-boleto] listaHistorico:', JSON.stringify(historico));

  // Procura pelo evento de liquidação/pagamento (mais recente primeiro)
  const reversed = [...historico].reverse();
  const entrada = reversed.find((h: any) => {
    const desc = (h.descricaoMovimento || h.descricaoHistorico || h.descricao || '').toLowerCase();
    const codigo = h.codigoMovimento ?? h.codigoHistorico ?? h.codigo ?? null;
    // códigos Sicoob: 6 = Liquidado banco, 9 = Baixa solicitada, 17 = Baixa manual
    return desc.includes('liquida') || desc.includes('pagamento') || codigo === 6 || codigo === 9 || codigo === 17;
  });

  if (entrada) {
    const rawDate = entrada.dataMovimento || entrada.dataHistorico || entrada.dataHoraRegistro || entrada.data || entrada.dataOcorrencia;
    console.log('[atualizar-boleto] entrada pagamento encontrada:', JSON.stringify(entrada));
    if (rawDate) return String(rawDate).substring(0, 10);
  }

  console.log('[atualizar-boleto] nenhuma entrada de pagamento encontrada no historico');
  return null;
}

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

    // Data de pagamento extraída do histórico (sem fallback)
    const datePago = isPago ? extrairDataPagamento(boleto) : null;

    // Buscar pedido no Firestore
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Pedido nao encontrado' }, { status: 404 });
    }
    const order = orderSnap.data() as any;

    // Atualizar situacao (e dataPagamento se disponível) no array de boletos
    const boletosAtuais = order.boletos || [];
    const boletosAtualizados = boletosAtuais.map((b: any) =>
      String(b.nossoNumero) === String(nossoNumero)
        ? { ...b, situacao, ...(datePago ? { dataPagamento: datePago } : {}) }
        : b
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
      if (datePago) updates.paymentDate = datePago;
    }

    await orderRef.update(updates);

    return NextResponse.json({
      ok: true,
      situacao,
      isPago,
      isBaixado,
      datePago,
      message: isPago ? 'Boleto liquidado — pagamento confirmado!' : isBaixado ? 'Boleto baixado/cancelado.' : `Status atualizado: ${situacao}`
    });
  } catch (error: any) {
    console.error('Erro atualizar-boleto:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
