import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

const BLING_BASE = 'https://api.bling.com.br/Api/v3';

// POST /api/financeiro/populate-bling-numero
// Preenche blingOrderNumero em todos os pedidos que ainda não têm, em 3 casos:
// 1. noInvoiceLinked: usa noInvoiceBlingOrderId → GET /pedidos/vendas/{id}
// 2. invoiceLinked: usa invoiceNumber → GET /nfe?numero=X → pedidoVenda.numero
// 3. blingOrderId direto (legado): usa blingOrderId → GET /pedidos/vendas/{id}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Token do Bling inválido. Re-autentique em Configurações → Bling.' }, { status: 401 });
    }
    const headers = { Authorization: `Bearer ${token}` };

    const snap = await adminDb.collection('orders').get();
    const semNumero = snap.docs.filter((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data();
      return !data.blingOrderNumero && (data.noInvoiceBlingOrderId || data.blingOrderId || data.invoiceLinked);
    });

    if (semNumero.length === 0) {
      return NextResponse.json({ ok: true, atualizados: 0, mensagem: 'Todos os pedidos já têm blingOrderNumero.' });
    }

    let atualizados = 0;
    let erros = 0;
    const detalhes: any[] = [];

    for (const doc of semNumero) {
      const data = doc.data();
      await delay(200);

      // Caso 1: Vinculado via pedido sem NF (tem noInvoiceBlingOrderId)
      if (data.noInvoiceBlingOrderId) {
        const blingId = String(data.noInvoiceBlingOrderId);
        try {
          const res = await fetchWithRetry(`${BLING_BASE}/pedidos/vendas/${blingId}`, { headers });
          if (!res.ok) { erros++; detalhes.push({ id: doc.id, caso: 'noInvoice', blingId, erro: `HTTP ${res.status}` }); continue; }
          const json = await res.json();
          const numero = json?.data?.numero ?? json?.numero;
          if (numero) {
            await doc.ref.update({ blingOrderNumero: numero, updatedAt: new Date().toISOString() });
            atualizados++;
            detalhes.push({ id: doc.id, caso: 'noInvoice', blingId, numero, cliente: data.clientName });
          } else {
            erros++; detalhes.push({ id: doc.id, caso: 'noInvoice', blingId, erro: 'numero não encontrado na resposta' });
          }
        } catch (e: any) { erros++; detalhes.push({ id: doc.id, caso: 'noInvoice', blingId, erro: e.message }); }
        continue;
      }

      // Caso 2: Vinculado via Nota Fiscal (tem invoiceLinked + invoiceNumber)
      if (data.invoiceLinked && data.invoiceNumber) {
        const nfNumero = String(data.invoiceNumber);
        try {
          const res = await fetchWithRetry(`${BLING_BASE}/nfe?numero=${nfNumero}&limite=5`, { headers });
          if (!res.ok) { erros++; detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, erro: `HTTP ${res.status}` }); continue; }
          const json = await res.json();
          const nfList: any[] = json?.data ?? [];
          const nf = nfList.find((n: any) => String(n.numero) === nfNumero) ?? nfList[0];
          if (!nf) { erros++; detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, erro: 'NF não encontrada no Bling' }); continue; }

          // Pegar numero do pedido via detalhe da NF
          await delay(150);
          const detRes = await fetchWithRetry(`${BLING_BASE}/nfe/${nf.id}`, { headers });
          if (!detRes.ok) { erros++; detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, erro: `NF detail HTTP ${detRes.status}` }); continue; }
          const detJson = await detRes.json();
          const pedidoNumero = detJson?.data?.pedidoVenda?.numero ?? nf?.pedidoVenda?.numero;

          if (pedidoNumero) {
            await doc.ref.update({ blingOrderNumero: pedidoNumero, updatedAt: new Date().toISOString() });
            atualizados++;
            detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, numero: pedidoNumero, cliente: data.clientName });
          } else {
            erros++; detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, erro: 'pedidoVenda.numero não encontrado na NF' });
          }
        } catch (e: any) { erros++; detalhes.push({ id: doc.id, caso: 'invoice', nfNumero, erro: e.message }); }
        continue;
      }

      // Caso 3: Tem blingOrderId direto (legado)
      if (data.blingOrderId) {
        const blingId = String(data.blingOrderId);
        try {
          const res = await fetchWithRetry(`${BLING_BASE}/pedidos/vendas/${blingId}`, { headers });
          if (!res.ok) { erros++; detalhes.push({ id: doc.id, caso: 'blingOrderId', blingId, erro: `HTTP ${res.status}` }); continue; }
          const json = await res.json();
          const numero = json?.data?.numero ?? json?.numero;
          if (numero) {
            await doc.ref.update({ blingOrderNumero: numero, updatedAt: new Date().toISOString() });
            atualizados++;
            detalhes.push({ id: doc.id, caso: 'blingOrderId', blingId, numero, cliente: data.clientName });
          } else {
            erros++; detalhes.push({ id: doc.id, caso: 'blingOrderId', blingId, erro: 'numero não encontrado na resposta' });
          }
        } catch (e: any) { erros++; detalhes.push({ id: doc.id, caso: 'blingOrderId', blingId, erro: e.message }); }
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
