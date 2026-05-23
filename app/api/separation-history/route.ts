import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const COLLECTION = 'separation_history';
const MAX_ENTRIES = 10;

// GET — buscar histórico
export async function GET() {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .orderBy('timestamp', 'desc')
      .limit(MAX_ENTRIES)
      .get();
    const entries = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, entries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST — salvar nova entrada
export async function POST(request: NextRequest) {
  try {
    const { tipo, descricao, snapshot } = await request.json();
    if (!snapshot || !Array.isArray(snapshot)) {
      return NextResponse.json({ ok: false, error: 'snapshot obrigatorio' }, { status: 400 });
    }
    // Salvar nova entrada
    const newDoc = await adminDb.collection(COLLECTION).add({
      tipo: tipo || 'minicard',
      descricao: descricao || 'Separacao de embalagens',
      snapshot,
      timestamp: new Date().toISOString(),
    });
    // Manter apenas os 10 mais recentes
    const all = await adminDb.collection(COLLECTION)
      .orderBy('timestamp', 'desc')
      .get();
    if (all.size > MAX_ENTRIES) {
      const toDelete = all.docs.slice(MAX_ENTRIES);
      const batch = adminDb.batch();
      toDelete.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
    }
    return NextResponse.json({ ok: true, id: newDoc.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// DELETE — remover entrada específica
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'id obrigatorio' }, { status: 400 });
    await adminDb.collection(COLLECTION).doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
