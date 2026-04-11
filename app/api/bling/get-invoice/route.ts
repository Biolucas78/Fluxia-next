import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';

async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const wait = backoff * Math.pow(2, i);
      console.warn(`[Bling API] Rate limit (429) hit. Retrying in ${wait}ms...`);
      await new Promise(resolve => setTimeout(resolve, wait));
      continue;
    }
    return response;
  }
  return fetch(url, options); // Final attempt
}

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
    if (!invoiceFound && (document || clientName)) {
      console.log(`[Bling API] Fallback: Buscando nota fiscal por documento (${document}) ou nome (${clientName})`);
      
      const endpoints = [
        'nfe',   // Notas Fiscais Eletrônicas
        'nfce',  // Notas Fiscais de Consumidor Eletrônicas
        'nfse'   // Notas Fiscais de Serviço Eletrônicas
      ];

      foundEndpoint = 'nfe';

      for (const endpoint of endpoints) {
        if (invoiceFound) break;
        console.log(`[Bling API] Busca abrangente em ${endpoint}...`);
        
        // A API v3 ignora filtros inválidos, então buscamos as últimas 100 notas e filtramos localmente
        const listResponse = await fetchWithRetry(`https://api.bling.com.br/Api/v3/${endpoint}?limite=100`, { headers });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          const allInvoices = listData.data || [];
          
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
            foundEndpoint = endpoint;
            console.log(`[Bling API] Nota encontrada em ${endpoint}: ${invoiceFound.numero}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
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
