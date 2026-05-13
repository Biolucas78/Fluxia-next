import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Webhook Sicoob recebido:', JSON.stringify(body));

    // Validacao do webhook (confirmacao de URL)
    if (body.validacaoWebhook === true) {
      console.log('Validacao de webhook Sicoob confirmada');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Verificar se e um pagamento (tipoMovimento 7 = Pagamento/baixa operacional)
    if (body.tipoMovimento !== 7) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const dados = body.dados;
    if (!dados) {
      return NextResponse.json({ ok: false, error: 'Dados ausentes' }, { status: 400 });
    }

    const nossoNumero = String(dados.nossoNumero);
    const valorPagamento = dados.valorPagamento;
    const dataPagamento = dados.dataHoraSituacaoBaixa;

    if (!nossoNumero) {
      return NextResponse.json({ ok: false, error: 'nossoNumero ausente' }, { status: 400 });
    }

    // Buscar pedido pelo nossoNumero do boleto
    const ordersRef = adminDb.collection('orders');
    const snapshot = await ordersRef
      .where('boletoNossoNumero', '>=', nossoNumero)
      .where('boletoNossoNumero', '<=', nossoNumero + '\uf8ff')
      .get();

    if (snapshot.empty) {
      console.log('Nenhum pedido encontrado para nossoNumero:', nossoNumero);
      return NextResponse.json({ ok: true, message: 'Pedido nao encontrado' }, { status: 200 });
    }

    // Atualizar pedido como pago
    const updates: Promise<any>[] = [];
    snapshot.forEach((docSnap: FirebaseFirestore.QueryDocumentSnapshot) => {
      const order = docSnap.data();
      console.log('Atualizando pedido:', docSnap.id, 'cliente:', order.clientName);

      const statusHistory = [
        ...(order.statusHistory || []),
        {
          action: 'Pagamento confirmado via boleto Sicoob',
          details: `Valor: R$ ${valorPagamento}`,
          timestamp: dataPagamento || new Date().toISOString()
        }
      ];

      updates.push(
        docSnap.ref.update({
          paymentStatus: 'pago',
          paymentMethod: 'boleto',
          paymentDate: dataPagamento
            ? new Date(dataPagamento).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          statusHistory,
        })
      );

      // Arquivar automaticamente se estiver na fase entregue
      if (order.status === 'entregue') {
        updates.push(
          docSnap.ref.update({
            archived: true,
            archivedAt: new Date().toISOString(),
          })
        );
      }
    });

    await Promise.all(updates);
    console.log('Webhook Sicoob processado com sucesso para nossoNumero:', nossoNumero);
    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (error: any) {
    console.error('Erro no webhook Sicoob:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'Sicoob Webhook' }, { status: 200 });
}
