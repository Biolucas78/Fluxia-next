import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return NextResponse.json({ error: 'Token Bling não encontrado.' }, { status: 401 });

    const { clientName, document, orderId } = await request.json();
    const headers = { 'Authorization': `Bearer ${token}` };
    const docClean = (document || '').replace(/\D/g, '');

    // Buscar pedidos já vinculados no Firestore para excluir da lista
    const norm = (v: any) => String(v || '').trim().replace(/^0+/, '') || String(v || '');
    let lockedIds: Set<string> = new Set();
    try {
      const lockedSnap = await adminDb.collection('orders')
        .where('noInvoiceLinked', '==', true)
        .get();
      lockedSnap.docs.forEach((doc: any) => {
        const d = doc.data();
        // Não bloquear o próprio pedido
        if (doc.id !== orderId && d.noInvoiceBlingOrderId) {
          lockedIds.add(norm(d.noInvoiceBlingOrderId));
        }
      });
      console.log(`[Bling] Pedidos já vinculados a outros cards: ${lockedIds.size}`);
    } catch (e) {
      console.warn('[Bling] Não foi possível buscar locks:', e);
    }

    const allMatches: any[] = [];

    // Busca por CPF/CNPJ (principal) — paginada
    if (docClean) {
      console.log(`[Bling] Buscando pedidos por CNPJ/CPF: ${docClean}`);
      const MAX_PAGES = 5;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchWithRetry(
          `https://api.bling.com.br/Api/v3/pedidos/vendas?limite=100&pagina=${page}`,
          { headers }
        );
        if (!res.ok) break;
        const data = await res.json();
        const pedidos: any[] = data.data || [];
        if (pedidos.length === 0) break;

        pedidos.filter((p: any) => {
          const pDoc = (p.contato?.numeroDocumento || '').replace(/\D/g, '');
          return pDoc && pDoc === docClean;
        }).forEach((p: any) => {
          if (!allMatches.find((m: any) => m.id === p.id)) allMatches.push(p);
        });

        if (pedidos.length < 100) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Fallback por nome se não achou nada por CNPJ
    if (allMatches.length === 0 && clientName && !docClean) {
      console.log(`[Bling] Fallback por nome: ${clientName}`);
      const res = await fetchWithRetry(
        `https://api.bling.com.br/Api/v3/pedidos/vendas?limite=100&pagina=1`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const searchName = clientName.toLowerCase().trim();
        (data.data || []).filter((p: any) => {
          const pName = (p.contato?.nome || '').toLowerCase().trim();
          return pName === searchName || pName.startsWith(searchName);
        }).forEach((p: any) => {
          if (!allMatches.find((m: any) => m.id === p.id)) allMatches.push(p);
        });
      }
    }

    if (allMatches.length === 0) {
      return NextResponse.json({ found: false, message: 'Nenhum pedido encontrado no Bling para este cliente.' });
    }

    // Ordenar por número decrescente
    allMatches.sort((a: any, b: any) => Number(b.numero || 0) - Number(a.numero || 0));

    // Filtrar os já vinculados a outros cards
    const lista = allMatches
      .filter((p: any) => !lockedIds.has(norm(String(p.id || ''))))
      .slice(0, 15)
      .map((p: any) => ({
        id: p.id,
        numero: p.numero,
        valor: p.totalProdutos || p.total || p.valor || 0,
        data: p.data || '',
        cliente: p.contato?.nome || clientName || '',
        situacao: p.situacao?.valor || p.situacao || '',
      }));

    if (lista.length === 0) {
      return NextResponse.json({ found: false, message: 'Todos os pedidos deste cliente já estão vinculados a outros cards.' });
    }

    console.log(`[Bling] Retornando ${lista.length} pedido(s) disponíveis.`);
    return NextResponse.json({ found: true, lista });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
