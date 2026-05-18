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

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { blingOrderId, clientName, document } = await request.json();
    const headers = { 'Authorization': \`Bearer \${token}\` };
    const allMatches: any[] = [];
    const docClean = (document || '').replace(/\\D/g, '');

    // 1. Busca direta pelo ID do Pedido no Bling
    if (blingOrderId) {
      console.log(\`[Bling] Buscando NF por blingOrderId: \${blingOrderId}\`);
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

    // 2. Busca por CPF/CNPJ (prioritário — mais preciso que nome)
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

        const matched = invoices.filter((inv: any) => {
          const invDoc = (inv.contato?.numeroDocumento || '').replace(/\\D/g, '');
          return invDoc && invDoc === docClean;
        });

        matched.forEach((n: any) => {
          if (!allMatches.find((m: any) => m.id === n.id)) allMatches.push(n);
        });

        if (invoices.length < 100) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // 3. Fallback por nome APENAS se não tiver CPF/CNPJ e não achou nada
    if (allMatches.length === 0 && clientName && !docClean) {
      console.log(\`[Bling] Fallback por nome: \${clientName}\`);
      const res = await fetchWithRetry(
        \`https://api.bling.com.br/Api/v3/nfe?limite=100&pagina=1\`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const invoices: any[] = data.data || [];
        const searchName = clientName.toLowerCase().trim();
        invoices.filter((inv: any) => {
          const invName = (inv.contato?.nome || '').toLowerCase().trim();
          // Match exato ou muito próximo — não match parcial
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

    // Buscar detalhes das até 15 NFs mais recentes para pegar valorNota real
    const toDetail = allMatches.slice(0, 15);
    const lista: any[] = [];

    for (const inv of toDetail) {
      try {
        await new Promise(resolve => setTimeout(resolve, 150)); // evitar rate limit
        const res = await fetchWithRetry(
          \`https://api.bling.com.br/Api/v3/nfe/\${inv.id}\`,
          { headers }
        );
        if (res.ok) {
          const det = await res.json();
          const d = det.data || {};
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
          // fallback com dados da listagem
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

    console.log(\`[Bling] Retornando \${lista.length} NF(s) com detalhes.\`);
    return NextResponse.json({ found: true, lista });

  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch invoice' }, { status: 500 });
  }
}
`;

fs.writeFileSync(filePath, NEW_ROUTE, 'utf8');
console.log('OK: Rota get-invoice corrigida (filtro por CNPJ + valor real dos detalhes).');