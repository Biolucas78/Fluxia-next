const fs = require('fs');
const path = require('path');

// Criar diretório e arquivo da rota
const routeDir = fs.existsSync('app/api/bling/get-order') ? 'app/api/bling/get-order' :
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/bling/get-order');

fs.mkdirSync(routeDir, { recursive: true });

const routeContent = `import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return NextResponse.json({ error: 'Token Bling não encontrado.' }, { status: 401 });

    const { blingOrderId, clientName, document } = await request.json();
    const headers = { 'Authorization': \`Bearer \${token}\` };

    // Busca direta pelo ID do pedido
    if (blingOrderId) {
      const res = await fetchWithRetry(
        \`https://api.bling.com.br/Api/v3/pedidos/vendas/\${blingOrderId}\`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const p = data.data;
        if (p) {
          return NextResponse.json({ found: true, order: {
            id: p.id, numero: p.numero,
            valor: p.totalProdutos || p.total || p.valor || 0,
            data: p.data || '',
            cliente: p.contato?.nome || clientName || '',
          }});
        }
      }
    }

    // Busca por CPF/CNPJ
    const docClean = (document || '').replace(/\\D/g, '');
    if (docClean) {
      const res = await fetchWithRetry(
        \`https://api.bling.com.br/Api/v3/pedidos/vendas?limite=50&pagina=1\`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const match = (data.data || []).find((p: any) => {
          const pDoc = (p.contato?.numeroDocumento || '').replace(/\\D/g, '');
          return pDoc && pDoc === docClean;
        });
        if (match) {
          return NextResponse.json({ found: true, order: {
            id: match.id, numero: match.numero,
            valor: match.totalProdutos || match.total || match.valor || 0,
            data: match.data || '',
            cliente: match.contato?.nome || '',
          }});
        }
      }
    }

    return NextResponse.json({ found: false, message: 'Pedido não encontrado no Bling.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`;

fs.writeFileSync(path.join(routeDir, 'route.ts'), routeContent, 'utf8');
console.log('OK: Rota /api/bling/get-order criada.');