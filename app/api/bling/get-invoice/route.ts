import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function POST(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { blingOrderId, clientName, document } = await request.json();
    
    let invoiceFound = null;
    let foundEndpoint = 'notas/vendas';
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Tentar buscar pelo ID do Pedido (se existir)
    if (blingOrderId) {
      console.log(`[Bling API] Buscando nota fiscal pelo ID do pedido: ${blingOrderId}`);
      // Na API v3, não há filtro direto por pedido na listagem de NFe.
      // Vamos buscar as últimas notas e filtrar localmente, ou usar o endpoint correto se existir.
      // Mas como fallback, vamos direto para a busca abrangente.
    }

    // 2. Fallback: Buscar pelo Documento (CPF/CNPJ) ou Nome do Cliente
    // Busca paginada: até 5 páginas × 100 notas = 500 notas mais recentes
    if (!invoiceFound && (document || clientName)) {
      console.log(`[Bling API] Fallback: Buscando nota fiscal por documento (${document}) ou nome (${clientName})`);

      foundEndpoint = 'nfe';
      const MAX_PAGES = 5;

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (invoiceFound) break;
        console.log(`[Bling API] Buscando em nfe — página ${page}/${MAX_PAGES}...`);

        const listResponse = await fetchWithRetry(
          `https://api.bling.com.br/Api/v3/nfe?limite=100&pagina=${page}`,
          { headers }
        );

        if (!listResponse.ok) {
          console.log(`[Bling API] Página ${page} retornou status ${listResponse.status}, parando.`);
          break;
        }

        const listData = await listResponse.json();
        const allInvoices = listData.data || [];

        if (allInvoices.length === 0) {
          console.log(`[Bling API] Página ${page} vazia, parando.`);
          break;
        }

        // Filtrar localmente
        invoiceFound = allInvoices.find((inv: any) => {
          // 1. Tentar por ID do Pedido
          if (blingOrderId && inv.pedido?.id == blingOrderId) return true;

          // 2. Tentar por Documento
          if (document) {
            const docClean = document.replace(/\D/g, '');
            const invDoc = inv.contato?.numeroDocumento?.replace(/\D/g, '');
            if (docClean && invDoc && docClean === invDoc) return true;
          }

          // 3. Tentar por Nome
          if (clientName) {
            const searchName = clientName.toLowerCase().trim();
            const invName = (inv.contato?.nome || inv.cliente?.nome || inv.nome)?.toLowerCase().trim();
            if (invName && (invName.includes(searchName) || searchName.includes(invName))) return true;
          }

          return false;
        });

        if (invoiceFound) {
          console.log(`[Bling API] Nota encontrada na página ${page}: ${invoiceFound.numero}`);
        } else {
          // Delay entre páginas para não tomar 429
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    }

    if (invoiceFound) {
      // Pequeno delay antes de buscar detalhes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Buscar detalhes da nota para pegar a chave de acesso e o valor (valorNota)
      const detailUrl = `https://api.bling.com.br/Api/v3/${foundEndpoint}/${invoiceFound.id}`;
      console.log(`[Bling API] Buscando detalhes da nota em: ${detailUrl}`);
      const detailResponse = await fetchWithRetry(detailUrl, { headers });
      
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        
        // Na API v3 do Bling, o valor da nota geralmente fica em data.valorNota ou data.total
        const invoiceValue = detailData.data.valorNota || detailData.data.total || detailData.data.valor || detailData.data.valor_nota || (detailData.data.totais && detailData.data.totais.totalNota) || 0;

        return NextResponse.json({ 
          found: true,
          invoiceId: detailData.data.id,
          invoiceKey: detailData.data.chaveAcesso,
          invoiceNumber: detailData.data.numero,
          invoiceValue: invoiceValue,
          status: detailData.data.situacao,
          clientNameMatch: detailData.data.contato?.nome
        });
      } else {
        const errorText = await detailResponse.text();
        console.error(`[Bling API] Erro ao buscar detalhes da nota: ${detailResponse.status} - ${errorText}`);
        
        // Se falhou ao buscar detalhes mas temos os dados básicos, retornamos o que temos
        if (invoiceFound.numero) {
           console.log(`[Bling API] Retornando dados básicos da listagem como fallback.`);
           const fallbackValue = invoiceFound.valorNota || invoiceFound.total || invoiceFound.valor || 0;
           return NextResponse.json({ 
            found: true,
            invoiceId: invoiceFound.id,
            invoiceKey: invoiceFound.chaveAcesso || '',
            invoiceNumber: invoiceFound.numero,
            invoiceValue: fallbackValue,
            status: invoiceFound.situacao,
            clientNameMatch: invoiceFound.contato?.nome || invoiceFound.cliente?.nome || invoiceFound.nome
          });
        }
      }
    }

    return NextResponse.json({ found: false, message: 'Nenhuma nota fiscal encontrada para este pedido ou cliente.' });
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch invoice' }, { status: 500 });
  }
}
