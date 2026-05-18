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

// Nova rota: busca todas as NFs do cliente e retorna lista
const NEW_ROUTE = `import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { blingOrderId, clientName, document } = await request.json();
    const headers = { 'Authorization': \`Bearer \${token}\` };
    const allMatches: any[] = [];

    // 1. Busca direta pelo ID do Pedido no Bling (mais precisa)
    if (blingOrderId) {
      console.log(\`[Bling API] Buscando NF pelo ID do pedido: \${blingOrderId}\`);
      try {
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe?idPedidoVenda=\${blingOrderId}&limite=5\`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          const nfes = data.data || [];
          if (nfes.length > 0) {
            console.log(\`[Bling API] \${nfes.length} NF(s) encontrada(s) pelo pedido \${blingOrderId}\`);
            nfes.forEach((n: any) => allMatches.push({ ...n, _matchType: 'blingOrderId' }));
          }
        }
      } catch (e) {
        console.warn('[Bling API] Erro na busca por idPedidoVenda:', e);
      }
    }

    // 2. Busca por CPF/CNPJ ou Nome — coleta todas as NFs do cliente
    if (document || clientName) {
      console.log(\`[Bling API] Buscando NFs por documento (\${document}) ou nome (\${clientName})\`);
      const MAX_PAGES = 5;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe?limite=100&pagina=\${page}\`,
          { headers }
        );
        if (!res.ok) break;
        const data = await res.json();
        const invoices = data.data || [];
        if (invoices.length === 0) break;

        const matched = invoices.filter((inv: any) => {
          if (document) {
            const docClean = document.replace(/\\D/g, '');
            const invDoc = inv.contato?.numeroDocumento?.replace(/\\D/g, '');
            if (docClean && invDoc && docClean === invDoc) return true;
          }
          if (clientName) {
            const searchName = clientName.toLowerCase().trim();
            const invName = (inv.contato?.nome || inv.nome || '').toLowerCase().trim();
            if (invName && (invName.includes(searchName) || searchName.includes(invName))) return true;
          }
          return false;
        });

        matched.forEach((n: any) => {
          // Evitar duplicatas
          if (!allMatches.find((m: any) => m.id === n.id)) {
            allMatches.push({ ...n, _matchType: 'document' });
          }
        });

        if (invoices.length < 100) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    if (allMatches.length === 0) {
      return NextResponse.json({ found: false, message: 'Nenhuma nota fiscal encontrada para este cliente.' });
    }

    // Ordenar por número decrescente (mais recente primeiro)
    allMatches.sort((a: any, b: any) => Number(b.numero || 0) - Number(a.numero || 0));

    // Retornar lista simplificada (sem buscar detalhes de cada uma — evita rate limit)
    const lista = allMatches.map((inv: any) => ({
      id: inv.id,
      numero: inv.numero,
      valor: inv.valorNota || inv.total || inv.valor || 0,
      dataEmissao: inv.dataEmissao || inv.data || '',
      cliente: inv.contato?.nome || inv.nome || '',
      chaveAcesso: inv.chaveAcesso || '',
      situacao: inv.situacao?.valor || inv.situacao || '',
      _matchType: inv._matchType,
    }));

    console.log(\`[Bling API] Retornando \${lista.length} NF(s) para seleção.\`);
    return NextResponse.json({ found: true, lista });

  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch invoice' }, { status: 500 });
  }
}
`;

fs.writeFileSync(filePath, NEW_ROUTE, 'utf8');
console.log('OK: Rota get-invoice reescrita para retornar lista de NFs.');