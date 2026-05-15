import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;

  const snap = await adminDb.collection('orders').where('archived', '==', true).get();
  const total = snap.docs.length;
  const comBling = snap.docs.filter((d: any) => d.data().blingOrderId).length;
  const semBling = snap.docs.filter((d: any) => !d.data().blingOrderId).length;

  if (dryRun) {
    return NextResponse.json({ dryRun: true, total, comBling, semBling,
      semBlingIds: snap.docs.filter((d: any) => !d.data().blingOrderId).map((d: any) => ({ id: d.id, nome: d.data().clientName }))
    });
  }

  const batch = adminDb.batch();
  snap.docs.filter((d: any) => d.data().blingOrderId).forEach((d: any) => batch.delete(d.ref));
  await batch.commit();
  return NextResponse.json({ ok: true, deletados: comBling, mantidos: semBling });
}
