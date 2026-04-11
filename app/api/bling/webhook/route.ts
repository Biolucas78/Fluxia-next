import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type');
    let data: any;

    if (contentType?.includes('application/json')) {
      data = await request.json();
    } else {
      // Bling v1 envia dados via POST form-encoded com um campo 'data' contendo JSON ou XML
      const formData = await request.formData();
      const jsonStr = formData.get('data') as string;
      if (jsonStr) {
        try {
          data = JSON.parse(jsonStr);
        } catch (e) {
          console.warn('[Bling Webhook] Falha ao parsear JSON no campo data, tentando tratar como objeto direto');
          data = jsonStr;
        }
      } else {
        // Tenta pegar o corpo bruto se não houver campo 'data'
        const rawBody = await request.text();
        console.log('[Bling Webhook] Corpo bruto recebido:', rawBody);
        try {
          data = JSON.parse(rawBody);
        } catch (e) {
          console.warn('[Bling Webhook] Corpo não é JSON válido.');
        }
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'No data received' }, { status: 400 });
    }

    console.log('[Bling Webhook] Recebido:', JSON.stringify(data, null, 2));

    // Mapeamento para suportar v1 e v3
    // Na v1, o Bling costuma enviar: { "retorno": { "notasfiscais": [ { "notafiscal": { ... } } ] } }
    // Ou simplesmente o objeto da nota se for um webhook de evento específico
    let nota = null;
    if (data.retorno?.notasfiscais) {
      nota = data.retorno.notasfiscais[0]?.notafiscal;
    } else if (data.notaFiscal) {
      nota = data.notaFiscal;
    } else if (data.vendas) {
      // Se for webhook de pedido
      nota = data.vendas[0]?.venda;
    }
    
    if (nota) {
      // Na v1 os campos podem ser diferentes: numero, chaveAcesso, idPedidoVenda
      const blingOrderId = nota.idPedidoVenda || nota.pedido?.id || nota.numeroPedido;
      const invoiceKey = nota.chaveAcesso || nota.chave_acesso;
      const invoiceNumber = nota.numero || nota.numeroNota;
      const invoiceValue = nota.valorNota || nota.valor_nota || 0;
      
      // Dados do cliente para fallback (v1 usa estruturas variadas)
      const clienteDocumento = nota.contato?.numeroDocumento || nota.cliente?.cnpj || nota.cliente?.cpf || nota.cnpj || nota.cpf;
      const clienteNome = nota.contato?.nome || nota.cliente?.nome || nota.nome;

      if (invoiceKey) {
        console.log(`[Bling Webhook] Processando NF ${invoiceNumber} para ${clienteNome} (${clienteDocumento})`);
        
        const ordersRef = adminDb.collection('orders');
        let querySnapshot: any = null;

        // 1. Tentar buscar pelo blingOrderId (vínculo direto)
        if (blingOrderId) {
          querySnapshot = await ordersRef.where('blingOrderId', '==', String(blingOrderId)).get();
        }

        // 2. Fallback: Buscar pelo Documento (CPF/CNPJ) se não encontrou pelo ID
        if ((!querySnapshot || querySnapshot.empty) && clienteDocumento) {
          const docClean = String(clienteDocumento).replace(/\D/g, '');
          console.log(`[Bling Webhook] Pedido não encontrado por ID. Tentando por documento: ${docClean}`);
          
          // Buscamos pedidos que ainda não têm nota e são do mesmo cliente
          // Filtramos por CPF ou CNPJ
          const cnpjQuery = await ordersRef
            .where('cnpj', '==', docClean)
            .where('hasInvoice', '==', false)
            .get();
          
          if (!cnpjQuery.empty) {
            querySnapshot = cnpjQuery;
          } else {
            const cpfQuery = await ordersRef
              .where('cpf', '==', docClean)
              .where('hasInvoice', '==', false)
              .get();
            querySnapshot = cpfQuery;
          }
        }

        // 3. Fallback: Buscar pelo Nome (último recurso)
        if ((!querySnapshot || querySnapshot.empty) && clienteNome) {
          console.log(`[Bling Webhook] Tentando por nome: ${clienteNome}`);
          querySnapshot = await ordersRef
            .where('clientName', '==', clienteNome)
            .where('hasInvoice', '==', false)
            .get();
        }

        if (querySnapshot && !querySnapshot.empty) {
          const batch = adminDb.batch();
          querySnapshot.forEach((doc: any) => {
            // Só atualizamos se o pedido for recente (ex: criado nos últimos 7 dias) 
            // ou se estiver em um status que aguarda nota
            const data = doc.data();
            const isRecent = data.createdAt > (Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            if (isRecent || data.status === 'embalagens_prontas') {
              batch.update(doc.ref, {
                hasInvoice: true,
                invoiceKey: invoiceKey,
                invoiceNumber: String(invoiceNumber),
                invoiceValue: Number(invoiceValue),
                // Se o pedido veio do site/amazon, aproveitamos para salvar o blingOrderId correto
                blingOrderId: data.blingOrderId || String(blingOrderId),
                updatedAt: Date.now()
              });
              console.log(`[Bling Webhook] Pedido ${doc.id} atualizado com sucesso.`);
            }
          });
          await batch.commit();
        } else {
          console.warn(`[Bling Webhook] Nenhum pedido correspondente encontrado no nosso sistema.`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Bling Webhook] Erro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
