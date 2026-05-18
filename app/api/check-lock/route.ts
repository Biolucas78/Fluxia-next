import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { type, value, orderId } = await request.json();
    if (!type || !value) return NextResponse.json({ locked: false });
    // Normalizar: remover zeros à esquerda para comparação consistente
    const normalizedValue = String(value).trim().replace(/^0+/, '') || String(value);

    const collection = 'orders';
    let snapshot;

    if (type === 'nf') {
      snapshot = await adminDb.collection(collection)
        .where('invoiceNumber', '==', normalizedValue)
        .where('invoiceLinked', '==', true)
        .limit(5)
        .get();
    } else if (type === 'boleto') {
      snapshot = await adminDb.collection(collection)
        .where('boletoNossoNumero', '==', normalizedValue)
        .where('boletoLinked', '==', true)
        .limit(5)
        .get();
    } else {
      return NextResponse.json({ locked: false });
    }

    if (snapshot.empty) return NextResponse.json({ locked: false });

    const others = snapshot.docs.filter((doc: any) => doc.id !== orderId);
    if (others.length === 0) return NextResponse.json({ locked: false });

    const other = others[0].data();
    return NextResponse.json({
      locked: true,
      lockedBy: {
        orderId: others[0].id,
        clientName: other.clientName || 'Cliente desconhecido',
        invoiceNumber: other.invoiceNumber || '',
      }
    });
  } catch (error: any) {
    console.error('[check-lock] Erro:', error);
    return NextResponse.json({ locked: false });
  }
}
