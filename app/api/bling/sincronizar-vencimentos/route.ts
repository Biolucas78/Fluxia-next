import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Token Bling não encontrado.' }, { status: 401 });
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    // Busca todos os pedidos que têm blingOrderId (pedidos sincronizados com Bling)
    // Firestore: blingOrderId > '' retorna documentos onde o campo existe e é não-vazio
    const snapshot = await adminDb.collection('orders')
      .where('blingOrderId', '>', '')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ ok: true, atualizados: 0, ignorados: 0, erros: 0, total: 0 });
    }

    let atualizados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const docSnap of snapshot.docs) {
      const order = docSnap.data();

      // Pular pedidos que já têm paymentDueDate preenchido
      if (order.paymentDueDate && order.paymentDueDate !== '0000-00-00') {
        ignorados++;
        continue;
      }

      // Pular pedidos com boleto — o vencimento vem do boleto
      if (order.boletoLinked) {
        ignorados++;
        continue;
      }

      try {
        await new Promise(r => setTimeout(r, 150));
        const res = await fetchWithRetry(
          `https://api.bling.com.br/Api/v3/pedidos/vendas/${order.blingOrderId}`,
          { headers }
        );
        if (!res.ok) { erros++; continue; }

        const data = await res.json();
        const blingOrder = data.data || data;
        const parcelas: any[] = blingOrder.parcelas || [];

        if (parcelas.length === 0) { ignorados++; continue; }

        const ultima = parcelas[parcelas.length - 1];
        if (!ultima.dataVencimento || ultima.dataVencimento === '0000-00-00') {
          ignorados++;
          continue;
        }

        const updates: any = {
          paymentDueDate: ultima.dataVencimento,
          statusHistory: [
            ...(order.statusHistory || []),
            { action: `Vencimento sincronizado do Bling: ${ultima.dataVencimento}`, timestamp: new Date().toISOString() },
          ],
        };

        // Se for pedido Sem NF, atualizar também noInvoiceDueDate
        if (order.noInvoiceLinked) {
          updates.noInvoiceDueDate = ultima.dataVencimento;
        }

        await docSnap.ref.update(updates);
        atualizados++;
      } catch {
        erros++;
      }
    }

    return NextResponse.json({ ok: true, atualizados, ignorados, erros, total: snapshot.size });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
