import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import crypto from 'crypto';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Melhor Envio Webhook Endpoint is active',
    environment: process.env.NODE_ENV,
    vercel_env: process.env.NEXT_PUBLIC_VERCEL_ENV || 'local'
  });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    
    // Verificação de segurança oficial do Melhor Envio
    const signatureHeader = req.headers.get('x-me-signature');
    const appSecret = process.env.MELHOR_ENVIO_WEBHOOK_SECRET?.trim(); // O "Secret" do aplicativo no painel do Melhor Envio

    if (appSecret && signatureHeader) {
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      if (signatureHeader !== expectedSignature) {
        console.warn('Webhook do Melhor Envio: Falha na autenticação (Assinatura inválida)');
        console.log('Signature received:', signatureHeader);
        console.log('Secret configured (first 4 chars):', appSecret.substring(0, 4) + '...');
        
        // Se o corpo estiver vazio, é provável que seja apenas um teste de validação de URL
        if (!rawBody || rawBody.trim() === '') {
          console.log('Corpo vazio detectado em falha de assinatura. Retornando 200 para validação de URL.');
          return NextResponse.json({ message: 'URL validated' }, { status: 200 });
        }

        return NextResponse.json({ 
          error: 'Unauthorized', 
          message: 'Invalid signature. Check MELHOR_ENVIO_WEBHOOK_SECRET in Vercel.',
          received_signature: signatureHeader.substring(0, 8) + '...',
          expected_signature_preview: expectedSignature.substring(0, 8) + '...'
        }, { status: 401 });
      }
    } else if (!signatureHeader) {
      // Se não houver assinatura, mas for um teste de validação (corpo vazio), permitimos
      if (!rawBody || rawBody.trim() === '') {
        console.log('Requisição sem assinatura e sem corpo. Retornando 200 para validação de URL.');
        return NextResponse.json({ message: 'URL validated' }, { status: 200 });
      }
    }

    const body = JSON.parse(rawBody);
    console.log('Melhor Envio Webhook Received:', JSON.stringify(body, null, 2));

    // O Melhor Envio envia o evento no campo "event" e os dados no campo "data"
    // Ou às vezes envia os dados diretamente dependendo da versão/configuração
    const event = body.event;
    const data = body.data || body;

    const shipmentId = data.id;
    const trackingCode = data.tracking;
    const status = data.status;

    if (!shipmentId && !trackingCode) {
      console.warn('Webhook recebido sem shipmentId ou trackingCode');
      return NextResponse.json({ received: true });
    }

    // Determinar a coleção (dev ou prod)
    const isDev = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';
    const collectionName = isDev ? 'orders_dev' : 'orders';

    // Buscar o pedido pelo shipmentId ou trackingNumber
    let orderDoc = null;
    let orderId = null;

    if (shipmentId) {
      const snapshot = await adminDb.collection(collectionName)
        .where('shipmentId', '==', shipmentId)
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        orderDoc = snapshot.docs[0];
        orderId = orderDoc.id;
      }
    }

    if (!orderId && trackingCode) {
      const snapshot = await adminDb.collection(collectionName)
        .where('trackingNumber', '==', trackingCode)
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        orderDoc = snapshot.docs[0];
        orderId = orderDoc.id;
      }
    }

    if (orderId && orderDoc) {
      const currentOrder = orderDoc.data();
      let newStatus = currentOrder.status;

      // Mapeamento de status do Melhor Envio para o App
      // Status comuns: 'posted', 'delivered', 'released', 'canceled', 'undelivered'
      if (status === 'delivered' || status === 'entregue') {
        newStatus = 'entregue';
      } else if (status === 'posted' || status === 'postado' || status === 'released' || status === 'em_transito') {
        // Se já estiver entregue, não retrocedemos o status
        if (currentOrder.status !== 'entregue') {
          newStatus = 'enviado';
        }
      }

      const updatePayload: any = {
        status: newStatus,
        lastTrackingUpdate: new Date().toISOString(),
        trackingStatus: status,
        trackingHistory: data.history || currentOrder.trackingHistory || []
      };

      if (data.delivered_at) {
        updatePayload.deliveryDate = data.delivered_at;
      }

      await adminDb.collection(collectionName).doc(orderId).update(updatePayload);
      console.log(`Pedido ${orderId} atualizado via Webhook para status: ${newStatus}`);
    } else {
      console.warn(`Nenhum pedido encontrado para shipmentId: ${shipmentId} ou trackingCode: ${trackingCode}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Erro ao processar Webhook do Melhor Envio:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
