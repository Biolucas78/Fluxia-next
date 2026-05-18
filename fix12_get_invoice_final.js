const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'app/api/bling/get-invoice/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/bling/get-invoice/route.ts'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: route.ts não encontrado.'); process.exit(1); }
console.log('Arquivo:', filePath);

const NEW_ROUTE = `import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { blingOrderId, clientName, document, orderId } = await request.json();
    const headers = { 'Authorization': \`Bearer \${token}\` };
    const docClean = (document || '').replace(/\\D/g, '');
    const allMatches: any[] = [];

    // Buscar NFs vinculadas no Firestore para excluir da lista
    const norm = (v: any) => String(v || '').trim().replace(/^0+/, '') || String(v || '');
    let lockedNumbers: Set<string> = new Set();
    try {
      const lockedSnap = await adminDb.collection('orders')
        .where('invoiceLinked', '==', true)
        .get();
      lockedSnap.docs.forEach((doc: any) => {
        const d = doc.data();
        // Não bloquear o próprio pedido
        if (doc.id !== orderId && d.invoiceNumber) {
          lockedNumbers.add(norm(d.invoiceNumber));
        }
      });
      console.log(\`[Bling] NFs já vinculadas a outros pedidos: \${lockedNumbers.size}\`);
    } catch (e) {
      console.warn('[Bling] Não foi possível buscar locks:', e);
    }

    // Busca por CPF/CNPJ (principal)
    if (docClean) {
      console.log(\`[Bling] Buscando NFs por CNPJ/CPF: \${docClean}\`);
      const MAX_PAGES = 5;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe?limite=100&pagina=\${page}\`,
          { headers }
        );
        if (!res.ok) break;
        const data = await res.json();
        const invoices: any[] = data.data || [];
        if (invoices.length === 0) break;

        invoices.filter((inv: any) => {
          const invDoc = (inv.contato?.numeroDocumento || '').replace(/\\D/g, '');
          return invDoc && invDoc === docClean;
        }).forEach((n: any) => {
          if (!allMatches.find((m: any) => m.id === n.id)) allMatches.push(n);
        });

        if (invoices.length < 100) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Fallback por blingOrderId se não achou nada por CNPJ
    if (allMatches.length === 0 && blingOrderId) {
      console.log(\`[Bling] Fallback: buscando NF por blingOrderId: \${blingOrderId}\`);
      try {
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe?idPedidoVenda=\${blingOrderId}&limite=5\`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          (data.data || []).forEach((n: any) => {
            if (!allMatches.find((m: any) => m.id === n.id)) allMatches.push(n);
          });
        }
      } catch (e) {
        console.warn('[Bling] Erro busca por blingOrderId:', e);
      }
    }

    // Fallback por nome se não achou nada
    if (allMatches.length === 0 && clientName && !docClean) {
      console.log(\`[Bling] Fallback por nome: \${clientName}\`);
      const res = await fetchWithRetry(
        \`https://api.bling.com.br/Api/v3/nfe?limite=100&pagina=1\`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const searchName = clientName.toLowerCase().trim();
        (data.data || []).filter((inv: any) => {
          const invName = (inv.contato?.nome || '').toLowerCase().trim();
          return invName === searchName || invName.startsWith(searchName);
        }).forEach((n: any) => {
          if (!allMatches.find((m: any) => m.id === n.id)) allMatches.push(n);
        });
      }
    }

    if (allMatches.length === 0) {
      return NextResponse.json({ found: false, message: 'Nenhuma nota fiscal encontrada para este cliente.' });
    }

    // Ordenar por número decrescente
    allMatches.sort((a: any, b: any) => Number(b.numero || 0) - Number(a.numero || 0));

    // Buscar detalhes e filtrar vinculadas
    const toDetail = allMatches.slice(0, 15);
    const lista: any[] = [];

    for (const inv of toDetail) {
      // Pular NFs já vinculadas a outros pedidos
      if (lockedNumbers.has(norm(inv.numero))) {
        console.log(\`[Bling] NF \${inv.numero} já vinculada, removendo da lista.\`);
        continue;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 150));
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe/\${inv.id}\`,
          { headers }
        );
        if (res.ok) {
          const det = await res.json();
          const d = det.data || {};
          // Verificar novamente com número dos detalhes
          if (lockedNumbers.has(norm(d.numero || inv.numero))) continue;
          lista.push({
            id: d.id || inv.id,
            numero: d.numero || inv.numero,
            valor: d.valorNota || d.total || d.valor || 0,
            dataEmissao: d.dataEmissao || inv.dataEmissao || '',
            cliente: d.contato?.nome || inv.contato?.nome || '',
            chaveAcesso: d.chaveAcesso || inv.chaveAcesso || '',
            situacao: d.situacao?.valor || d.situacao || '',
          });
        } else {
          lista.push({
            id: inv.id,
            numero: inv.numero,
            valor: inv.valorNota || inv.total || inv.valor || 0,
            dataEmissao: inv.dataEmissao || '',
            cliente: inv.contato?.nome || '',
            chaveAcesso: inv.chaveAcesso || '',
            situacao: inv.situacao?.valor || inv.situacao || '',
          });
        }
      } catch (e) {
        lista.push({
          id: inv.id,
          numero: inv.numero,
          valor: inv.valorNota || 0,
          dataEmissao: inv.dataEmissao || '',
          cliente: inv.contato?.nome || '',
          chaveAcesso: inv.chaveAcesso || '',
          situacao: '',
        });
      }
    }

    if (lista.length === 0) {
      return NextResponse.json({ found: false, message: 'Todas as notas fiscais deste cliente já estão vinculadas a outros pedidos.' });
    }

    console.log(\`[Bling] Retornando \${lista.length} NF(s) disponíveis.\`);
    return NextResponse.json({ found: true, lista });

  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch invoice' }, { status: 500 });
  }
}
`;

fs.writeFileSync(filePath, NEW_ROUTE, 'utf8');
console.log('OK: Rota get-invoice corrigida (remove vinculadas, busca por CNPJ primeiro).');