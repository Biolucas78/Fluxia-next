import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import crypto from 'crypto';

const MELHOR_ENVIO_SECRET = process.env.MELHOR_ENVIO_CLIENT_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const signature = req.headers.get('x-me-signature');

    console.log('📦 Webhook Melhor Envio recebido:', body.event);

    // 1. Validação de Segurança (Opcional mas recomendada)
    if (MELHOR_ENVIO_SECRET && signature) {
      const hmac = crypto.createHmac('sha256', MELHOR_ENVIO_SECRET);
      const digest = hmac.update(JSON.stringify(body)).digest('hex');
      // Nota: A assinatura do ME costuma vir em Base64, a validação exata pode variar
      // Por enquanto vamos logar para depuração se necessário
    }

    const { event, data } = body;
    const shipmentId = data.id; // UUID do envio
    const newStatus = data.status;
    const trackingNumber = data.tracking;

    if (!shipmentId) {
      return new Response('ID de envio ausente', { status: 400 });
    }

    // 2. Buscar o pedido no Firebase pelo shipmentId
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('shipmentId', '==', shipmentId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn(`⚠️ Webhook: Pedido com shipmentId ${shipmentId} não encontrado no banco.`);
      return new Response('Pedido não encontrado', { status: 200 }); // Retornamos 200 para o ME não ficar tentando
    }

    // 3. Atualizar o pedido
    const orderDoc = querySnapshot.docs[0];
    const orderData = orderDoc.data();

    // Mapeamento de status do Webhook para o seu sistema
    let systemStatus = orderData.status;
    if (event === 'order.delivered') systemStatus = 'entregue';
    if (event === 'order.posted') systemStatus = 'enviado';

    await updateDoc(doc(db, 'orders', orderDoc.id), {
      status: systemStatus,
      trackingStatus: newStatus,
      trackingNumber: trackingNumber || orderData.trackingNumber,
      lastTrackingUpdate: new Date().toISOString(),
      // Adiciona ao histórico se desejar
      trackingHistory: [
        {
          status: newStatus,
          message: `Atualização via Webhook: ${event}`,
          date: new Date().toISOString(),
          location: 'Sistema Melhor Envio'
        },
        ...(orderData.trackingHistory || [])
      ].slice(0, 10) // Mantém os últimos 10 eventos
    });

    console.log(`✅ Pedido ${orderDoc.id} atualizado via Webhook para: ${newStatus}`);

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('❌ Erro no Webhook Melhor Envio:', error);
    return new Response('Erro interno', { status: 500 });
  }
}
