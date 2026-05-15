import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    const snap = await adminDb.collection('orders')
      .where('createdAt', '>=', '2026-03-01')
      .where('createdAt', '<=', '2026-03-31')
      .limit(3).get();
    return NextResponse.json(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  }
  const doc = await adminDb.collection('orders').doc(id).get();
  return NextResponse.json({ id: doc.id, ...doc.data() });
}
