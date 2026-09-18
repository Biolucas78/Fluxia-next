import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';

// POST /api/financeiro/populate-bling-numero
// Busca no Bling o campo "numero" para todos os pedidos do Firestore
// que têm blingOrderId mas não têm blingOrderNumero.
// Salva blingOrderNumero em cada documento.

export async function POST() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Token do Bling inválido. Re-autentique em Configurações → Bling.' }, { status: 401 });
    }
    const headers = { Authorization: `Bearer ${token}` };

    // Buscar pedidos que têm blingOrderId mas não blingOrderNumero
    const snap = await adminDb.collection('orders')
      .where('blingOrderId', '>', '')
      .get();

    const semNumero = snap.docs.filter((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      return !data.blingOrderNumero && data.blingOrderId;
    });

    if (semNumero.length === 0) {
      return NextResponse.json({ ok: true, atualizados: 0, mensagem: 'Todos os pedidos já têm blingOrderNumero.' });
    }

    let atualizados = 0;
    let erros = 0;
    const detalhes: any[] = [];

    for (const doc of semNumero) {
      const data = doc.data();
      const blingId = String(data.blingOrderId);

      // Pequeno delay para não estourar rate limit do Bling
      await new Promise(r => setTimeout(r, 200));

      try {
        const res = await fetchWithRetry(`${BLING_BASE}/pedidos/vendas/${blingId}`, { headers });
        if (!res.ok) {
          erros++;
          detalhes.push({ id: doc.id, blingId, erro: `HTTP ${res.status}` });
          continue;
        }
        const json = await res.json();
        const numero = json?.data?.numero ?? json?.numero;
        if (numero) {
          await doc.ref.update({ blingOrderNumero: numero, updatedAt: new Date().toISOString() });
          atualizados++;
          detalhes.push({ id: doc.id, blingId, numero, cliente: data.clientName });
        } else {
          erros++;
          detalhes.push({ id: doc.id, blingId, erro: 'numero não encontrado na resposta' });
        }
      } catch (e: any) {
        erros++;
        detalhes.push({ id: doc.id, blingId, erro: e.message });
      }
    }

    return NextResponse.json({
      ok: true,
      total_sem_numero: semNumero.length,
      atualizados,
      erros,
      detalhes: detalhes.slice(0, 200),
    });
  } catch (err: any) {
    console.error('[populate-bling-numero]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
