import { NextResponse } from 'next/server';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { adminDb, adminDbDefault, projectId, databaseId } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

export async function POST(request: Request) {
  try {
    // 1. Try to get token from Authorization header first
    const authHeader = request.headers.get('Authorization');
    let token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    // 2. Fallback to server-side fetch if not provided in header
    if (!token) {
      console.log('[Bling API] Token not in header, attempting server-side fetch...');
      token = await getValidBlingTokenServer();
    }

    console.log(`[Bling API] Using Firebase Project: ${projectId}, DB: ${databaseId}`);

    if (!token) {
      return NextResponse.json({ 
        error: 'Bling token not found or expired. Please re-authenticate in Settings.',
        details: 'O servidor não conseguiu recuperar o token do Bling. Tente reautenticar na página de Configurações.'
      }, { status: 401 });
    }

    const order = await request.json();

    // 1. Find or Create Client
    let clientId = await findClient(token, order);
    if (!clientId) {
      console.log(`[Bling API] Client not found, creating: ${order.clientName}`);
      // Increased delay before creating client
      await new Promise(resolve => setTimeout(resolve, 1000));
      clientId = await createClient(token, order);
    }

    // Increased delay before next major operation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Map Products to SKUs
    const items = await mapProductsToBling(token, order.products);
    if (items.length === 0) {
      throw new Error('Nenhum produto mapeado para o Bling. Verifique os mapeamentos de produtos.');
    }

    // 3. Create Order
    // Fetch lojaId from config if available using Admin SDK with Client SDK fallback
    let config: any = {};
    try {
      const configSnap = await adminDb.collection('bling_config').doc('main').get();
      if (configSnap.exists) {
        config = configSnap.data() || {};
        console.log('[Bling API] Config fetched via Admin SDK (Named DB)');
      } else {
        const defaultSnap = await adminDbDefault.collection('bling_config').doc('main').get();
        if (defaultSnap.exists) {
          config = defaultSnap.data() || {};
          console.log('[Bling API] Config fetched via Admin SDK (Default DB)');
        }
      }
    } catch (adminError: any) {
      if (adminError.message.includes('PERMISSION_DENIED')) {
        console.log('[Bling API] Admin SDK access restricted. Using fallbacks...');
      } else {
        console.log(`[Bling API] Admin SDK fetch info: ${adminError.message}`);
      }
    }

    if (!config.lojaId) {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: clientDb } = await import('@/lib/firebase');
        // @ts-ignore - accessing internal options for debugging
        const clientProj = clientDb.app?.options?.projectId;
        // @ts-ignore
        const clientDbId = clientDb.databaseId || '(default)';
        
        console.log(`[Bling API] Attempting Client SDK fallback. Project: ${clientProj}, DB: ${clientDbId}`);
        
        const clientConfigSnap = await getDoc(doc(clientDb, 'bling_config', 'main'));
        if (clientConfigSnap.exists()) {
          config = clientConfigSnap.data() || {};
          console.log('[Bling API] Config fetched via Client SDK (Public Read)');
        } else {
          console.log('[Bling API] Config NOT FOUND via Client SDK');
        }
      } catch (clientError: any) {
        console.error('[Bling API] Client SDK also failed to fetch config:', clientError.message);
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const totalValue = items.reduce((sum, item) => sum + (item.valor * item.quantidade), 0);
    const paymentCondition = order.paymentCondition || 'A vista';
    console.log(`[Bling API] Processing payment condition: "${paymentCondition}" for total value: ${totalValue}`);
    
    // Fetch payment methods to get a valid ID for installments
    let defaultPaymentMethodId = null;
    try {
      const pmResponse = await fetch('https://api.bling.com.br/Api/v3/formas-pagamento?pagina=1&limite=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pmResponse.status === 401) {
        throw new Error('Bling token expired (401) during payment methods fetch. Please re-authenticate in Settings.');
      }
      if (pmResponse.ok) {
        const contentType = pmResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const pmData = await pmResponse.json();
          if (pmData.data && pmData.data.length > 0) {
            // Try to find "Contas a receber" or something starting with "1" as requested by user
            // Also consider the new 'finalidade' field (2 = Recebimentos, 3 = Ambos)
            const specific = pmData.data.find((pm: any) => 
              pm.descricao.toLowerCase().includes('contas a receber') || 
              pm.descricao.toLowerCase().startsWith('1') ||
              pm.descricao.toLowerCase().includes('contas a pagar') ||
              (pm.finalidade === 2 || pm.finalidade === 3)
            );
            
            const generic = pmData.data.find((pm: any) => 
              pm.descricao.toLowerCase().includes('dinheiro') || 
              pm.descricao.toLowerCase().includes('boleto') ||
              pm.descricao.toLowerCase().includes('pix')
            );
            
            defaultPaymentMethodId = specific ? specific.id : (generic ? generic.id : pmData.data[0].id);
            console.log(`[Bling API] Using payment method: ${specific?.descricao || generic?.descricao || pmData.data[0].descricao} (ID: ${defaultPaymentMethodId})`);
          }
        } else {
          console.warn('[Bling API] Non-JSON response from payment methods API');
        }
      }
    } catch (e) {
      console.error('[Bling API] Error fetching payment methods:', e);
    }

    // Determine the condition string to send to Bling
    let blingCondicao = paymentCondition;
    if (paymentCondition === '30 dias') {
      blingCondicao = '30';
    } else if (paymentCondition === '15 dias') {
      blingCondicao = '15';
    } else if (paymentCondition === '21 dias') {
      blingCondicao = '21';
    } else if (paymentCondition === 'A vista') {
      blingCondicao = '0';
    }

    // Calculate installments (parcelas)
    const parcelas = [];
    const saleDate = new Date();
    
    const createParcela = (days: number, value: number) => {
      const dueDate = new Date(saleDate);
      dueDate.setDate(dueDate.getDate() + days);
      const parcela: any = {
        dataVencimento: dueDate.toISOString().split('T')[0],
        valor: Number(value.toFixed(2))
      };
      if (defaultPaymentMethodId) {
        parcela.formaPagamento = { id: Number(defaultPaymentMethodId) };
      }
      return parcela;
    };

    if (paymentCondition === '30 dias') {
      parcelas.push(createParcela(30, totalValue));
    } else if (paymentCondition === '15 dias') {
      parcelas.push(createParcela(15, totalValue));
    } else if (paymentCondition === '21 dias') {
      parcelas.push(createParcela(21, totalValue));
    } else if (paymentCondition === '2x') {
      const half = Number((totalValue / 2).toFixed(2));
      parcelas.push(createParcela(30, half));
      parcelas.push(createParcela(60, totalValue - half));
    } else {
      // Default to A vista (today)
      parcelas.push(createParcela(0, totalValue));
    }

    console.log(`[Bling API] Generated ${parcelas.length} installments:`, JSON.stringify(parcelas, null, 2));

    const orderPayload: any = {
      contato: { id: Number(clientId) },
      itens: items,
      data: today,
      dataSaida: today,
      dataPrevista: today,
      numeroLoja: order.id ? String(order.id) : undefined,
      observacoes: order.observations || '',
      parcelas: parcelas
    };

    if (config.lojaId) {
      orderPayload.loja = { id: Number(config.lojaId) };
    }

    console.log('Sending order to Bling:', JSON.stringify(orderPayload, null, 2));

    // Add a 2-second delay to avoid 429 TOO_MANY_REQUESTS
    // We've likely made several requests already (findClient, catalog fetch, etc.)
    // Bling limit is 3 requests per second.
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetchWithRetry('https://api.bling.com.br/Api/v3/pedidos/vendas', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });
    
    if (response.status === 401) {
      throw new Error('Bling token expired (401) during order creation. Please re-authenticate in Settings.');
    }
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData: any = {};
      
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
      } else {
        const errorText = await response.text();
        console.error('Non-JSON error response from Bling creating order:', errorText);
        errorData = { error: { description: `Erro na API do Bling (${response.status}): Resposta não-JSON recebida.` } };
      }
      
      console.error('Bling API error creating order:', JSON.stringify(errorData, null, 2));
      
      // Extract more detailed error information
      let errorMessage = 'Erro ao criar pedido no Bling';
      if (errorData.error) {
        if (errorData.error.description) {
          errorMessage = errorData.error.description;
        } else if (errorData.error.fields && errorData.error.fields.length > 0) {
          errorMessage = errorData.error.fields.map((f: any) => `${f.msg} (${f.field})`).join(', ');
        } else if (errorData.error.message) {
          errorMessage = errorData.error.message;
        }
      }
      
      return NextResponse.json({ 
        error: errorMessage, 
        details: errorData,
        payloadSent: orderPayload 
      }, { status: response.status });
    }

    const data = await response.json();
    const blingOrderId = data.data?.id;

    return NextResponse.json({ 
      message: 'Order created successfully',
      blingOrderId: blingOrderId
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    const message = error.message || 'Failed to create order';
    const status = message.includes('401') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function findClient(token: string, order: any) {
  const document = (order.cnpj || order.cpf || '').replace(/\D/g, '');

  // 1. Tentar buscar no Firestore primeiro (Cache Local)
  try {
    console.log(`[Bling API] Checking local cache for client: ${order.clientName}`);
    let snapshot;
    
    // Try Admin DB first
    try {
      if (document) {
        snapshot = await adminDb.collection('bling_customers').where('numeroDocumento', '==', document).get();
      } else {
        snapshot = await adminDb.collection('bling_customers').where('nome', '==', order.clientName).get();
      }
      
      if (snapshot && !snapshot.empty) {
        const cachedClient = snapshot.docs[0].data();
        console.log(`[Bling API] Client found in local cache (Admin): ${cachedClient.id}`);
        return cachedClient.id;
      }
    } catch (adminErr: any) {
      console.log(`[Bling API] Admin cache check info: ${adminErr.message}`);
    }
  } catch (e: any) {
    console.log(`[Bling API] Cache lookup info: ${e.message}`);
  }

  // 2. Se não estiver no cache, buscar no Bling
  if (document) {
    console.log(`[Bling API] Searching client by document in Bling: ${document}`);
    const docResponse = await fetchWithRetry(`https://api.bling.com.br/Api/v3/contatos?numeroDocumento=${document}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (docResponse.ok) {
      const docData = await docResponse.json();
      if (docData.data && docData.data.length > 0) {
        const blingId = docData.data[0].id;
        console.log(`[Bling API] Client found by document in Bling: ${blingId}`);
        // Salvar no cache para a próxima vez
        saveClientToCache(blingId, order.clientName, document);
        return blingId;
      }
    } else if (docResponse.status === 401) {
      throw new Error('Bling token expired (401). Please re-authenticate in Settings.');
    }
  }

  // Delay extra para evitar 429 entre buscas
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log(`[Bling API] Searching client by name in Bling: ${order.clientName}`);
  const response = await fetchWithRetry(`https://api.bling.com.br/Api/v3/contatos?nome=${encodeURIComponent(order.clientName)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Bling token expired (401). Please re-authenticate in Settings.');
    }
    console.error('Bling API error finding client by name:', response.status);
    return null;
  }
  
  const data = await response.json();
  if (data.data && data.data.length > 0) {
    const exactMatch = data.data.find((c: any) => c.nome.toLowerCase() === order.clientName.toLowerCase());
    const id = exactMatch ? exactMatch.id : data.data[0].id;
    console.log(`[Bling API] Client found by name in Bling: ${id}`);
    saveClientToCache(id, order.clientName, document);
    return id;
  }
  
  return null;
}

/**
 * Helper to save client to Firestore cache
 */
async function saveClientToCache(id: number, name: string, document: string) {
  const data = {
    id: id,
    nome: name,
    numeroDocumento: document,
    updatedAt: Date.now()
  };

  try {
    // Try named DB
    try {
      await adminDb.collection('bling_customers').doc(String(id)).set(data, { merge: true });
      console.log(`[Bling API] Client ${id} saved to cache (Named DB).`);
    } catch (e: any) {
      console.log(`[Bling API] Named DB cache save info: ${e.message}`);
    }

    // Also try default DB as backup
    try {
      await adminDbDefault.collection('bling_customers').doc(String(id)).set(data, { merge: true });
      console.log(`[Bling API] Client ${id} saved to cache (Default DB).`);
    } catch (e: any) {
      // Only log if it's not a permission error we expect
      if (!e.message.includes('PERMISSION_DENIED')) {
        console.log(`[Bling API] Default DB cache save info: ${e.message}`);
      }
    }
  } catch (e) {
    // General catch for unexpected errors
  }
}

async function createClient(token: string, order: any) {
  const response = await fetchWithRetry('https://api.bling.com.br/Api/v3/contatos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nome: order.clientName,
      tipo: order.cnpj ? 'J' : 'F',
      numeroDocumento: order.cnpj || order.cpf || '',
      telefone: order.phone || '',
      endereco: {
        geral: {
          endereco: order.addressDetails?.street || '',
          numero: order.addressDetails?.number || '',
          complemento: order.addressDetails?.complement || '',
          bairro: order.addressDetails?.district || '',
          cep: (order.addressDetails?.zip || '').replace(/\D/g, ''),
          municipio: order.addressDetails?.city || '',
          uf: order.addressDetails?.state || ''
        }
      }
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Bling token expired (401). Please re-authenticate in Settings.');
    }
    console.error('Bling API error creating client:', response.status, JSON.stringify(errorData, null, 2));
    throw new Error(`Failed to create client in Bling: ${response.status}`);
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.error('Non-JSON response from Bling API creating client');
    throw new Error('Non-JSON response from Bling API creating client');
  }
  const data = await response.json();
  const blingId = data.data.id;
  // Salvar no cache após criar
  saveClientToCache(blingId, order.clientName, (order.cnpj || order.cpf || '').replace(/\D/g, ''));
  return blingId;
}

async function mapProductsToBling(token: string, products: any[]) {
  const items = [];
  
  console.log(`[Bling API] Mapping ${products.length} products...`);

  // 1. Fetch all mappings from Firestore
  let allMappings: any[] = [];
  try {
    // Try named database first
    try {
      const snapshot = await adminDb.collection('product_mapping').get();
      if (!snapshot.empty) {
        allMappings = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ id: doc.id, ...doc.data() }));
        console.log(`[Bling API] Fetched ${allMappings.length} mappings from Named DB`);
      }
    } catch (e: any) {
      if (e.message.includes('PERMISSION_DENIED')) {
        console.log('[Bling API] Named DB access restricted, trying fallbacks...');
      } else {
        console.log(`[Bling API] Named DB fetch info: ${e.message}`);
      }
    }

    if (allMappings.length === 0) {
      // Fallback to default database
      try {
        const defaultSnapshot = await adminDbDefault.collection('product_mapping').get();
        if (!defaultSnapshot.empty) {
          allMappings = defaultSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ id: doc.id, ...doc.data() }));
          console.log(`[Bling API] Fetched ${allMappings.length} mappings from Default DB`);
        }
      } catch (e: any) {
        console.log(`[Bling API] Default DB fetch info: ${e.message}`);
      }
    }
    
    if (allMappings.length === 0) {
      console.warn('[Bling API] NO MAPPINGS FOUND in Firestore! Using hardcoded fallback.');
      // 1.1 Hardcoded Fallback (Last Resort)
      allMappings = [
        { appName: 'Catuaí', appWeight: '250g', appGrind: 'moído', blingSku: '112501', blingName: 'Café Catuaí 250g Moído' },
        { appName: 'Catuaí', appWeight: '250g', appGrind: 'grãos', blingSku: '112502', blingName: 'Café Catuaí 250g Grãos' },
        { appName: 'Catuaí', appWeight: '500g', appGrind: 'moído', blingSku: '115001', blingName: 'Café Catuaí 500g Moído' },
        { appName: 'Catuaí', appWeight: '500g', appGrind: 'grãos', blingSku: '115002', blingName: 'Café Catuaí 500g Grãos' },
        { appName: 'Catuaí', appWeight: '1kg', appGrind: 'moído', blingSku: '111001', blingName: 'Café Catuaí 1kg Moído' },
        { appName: 'Catuaí', appWeight: '1kg', appGrind: 'grãos', blingSku: '111002', blingName: 'Café Catuaí 1kg Grãos' },
        { appName: 'Bourbon', appWeight: '250g', appGrind: 'moído', blingSku: '102501', blingName: 'Café Bourbon 250g Moído' },
        { appName: 'Bourbon', appWeight: '250g', appGrind: 'grãos', blingSku: '102502', blingName: 'Café Bourbon 250g Grãos' },
        { appName: 'Gourmet', appWeight: '250g', appGrind: 'moído', blingSku: '132501', blingName: 'Café Gourmet 250g Moído' },
        { appName: 'Gourmet', appWeight: '250g', appGrind: 'grãos', blingSku: '132502', blingName: 'Café Gourmet 250g Grãos' },
        { appName: 'Gourmet', appWeight: '1kg', appGrind: 'moído', blingSku: '141002', blingName: 'Café Gourmet 1kg Moído' },
        { appName: 'Gourmet', appWeight: '1kg', appGrind: 'grãos', blingSku: '141000', blingName: 'Café Gourmet 1kg Grãos' },
        { appName: 'DripCoffee', appWeight: '100g', appGrind: 'moído', blingSku: 'CGP040', blingName: 'Drip Coffee' },
      ];
    }
  } catch (error: any) {
    console.log(`[Bling API] Mapping fetch info: ${error.message}`);
  }

  // 2. Fetch Bling Catalog for prices
  let blingCatalog: Map<string, any> = new Map();
  try {
    const response = await fetchWithRetry('https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.data) {
        data.data.forEach((p: any) => {
          if (p.codigo) blingCatalog.set(p.codigo, p);
        });
      }
    }
  } catch (e) {
    console.error('[Bling API] Error syncing catalog:', e);
  }

  const normalize = (str: string) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  for (const product of products) {
    let mapping: any = null;
    const normName = normalize(product.name);
    const normWeight = normalize(product.weight);
    const normGrind = normalize(product.grindType);

    console.log(`[Bling API] Mapping product: "${product.name}" (${product.weight}, ${product.grindType})`);
    console.log(`[Bling API] Normalized: "${normName}" | "${normWeight}" | "${normGrind}"`);

    // Try SKU first
    if (product.blingSku) {
      mapping = allMappings.find((m: any) => m.blingSku === product.blingSku);
      if (mapping) console.log(`[Bling API] Found mapping by SKU: ${product.blingSku}`);
    }

    // 1. Try exact match (Name + Weight + Grind)
    if (!mapping) {
      mapping = allMappings.find((m: any) => 
        normalize(m.appName) === normName && 
        normalize(m.appWeight) === normWeight && 
        normalize(m.appGrind) === normGrind
      );
      if (mapping) console.log(`[Bling API] Found exact mapping: ${mapping.blingSku}`);
    }

    // 2. Try Name + Weight
    if (!mapping) {
      mapping = allMappings.find((m: any) => 
        normalize(m.appName) === normName && 
        normalize(m.appWeight) === normWeight
      );
      if (mapping) console.log(`[Bling API] Found name+weight mapping: ${mapping.blingSku}`);
    }

    // 3. Try Name only (Fuzzy/Contains)
    if (!mapping) {
      mapping = allMappings.find((m: any) => {
        const mName = normalize(m.appName);
        return mName === normName || mName.includes(normName) || normName.includes(mName);
      });
      if (mapping) console.log(`[Bling API] Found name-based mapping: ${mapping.blingSku}`);
    }

    // 4. Last resort: If the mapping in DB has the full string in appName
    if (!mapping) {
      const fullSearch = `${normName} ${normWeight} ${normGrind}`.trim();
      mapping = allMappings.find((m: any) => {
        const mName = normalize(m.appName);
        return mName === fullSearch || fullSearch.includes(mName) || mName.includes(fullSearch);
      });
      if (mapping) console.log(`[Bling API] Found full-string mapping: ${mapping.blingSku}`);
    }

    const sku = mapping?.blingSku || product.blingSku;
    let catalogProduct = sku ? blingCatalog.get(sku) : null;

    console.log(`[Bling API] Product "${product.name}" -> SKU: ${sku || 'NOT FOUND'} (Source: ${mapping ? 'Firestore/Fallback Mapping' : 'Direct SKU from Order'})`);

    // Fallback direct SKU fetch
    if (sku && !catalogProduct) {
      try {
        console.log(`[Bling API] SKU ${sku} not in initial catalog sync, fetching directly...`);
        await new Promise(r => setTimeout(r, 400));
        const res = await fetchWithRetry(`https://api.bling.com.br/Api/v3/produtos?codigo=${sku}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          if (d.data && d.data.length > 0) {
            catalogProduct = d.data[0];
            console.log(`[Bling API] Successfully fetched product details for SKU ${sku} from Bling API`);
          } else {
            console.log(`[Bling API] SKU ${sku} not found in Bling API catalog.`);
          }
        }
      } catch (e: any) {
        console.error(`[Bling API] Error fetching SKU ${sku} directly:`, e.message);
      }
    }

    const blingId = catalogProduct?.id || mapping?.blingId;
    const preco = catalogProduct?.preco || 0;
    
    // Use the official Bling name if available, otherwise use the mapping name or app description
    // We NO LONGER concatenate SKU and Name as it interferes with Bling's search
    const descricao = catalogProduct?.nome || mapping?.blingName || `${product.name} ${product.weight} ${product.grindType}`;

    if (blingId) {
      console.log(`[Bling API] Item linked to Bling ID: ${blingId} (SKU: ${sku})`);
      items.push({
        produto: { id: Number(blingId) },
        codigo: sku,
        descricao: descricao,
        quantidade: Number(product.quantity) || 1,
        valor: Number(preco),
        unidade: catalogProduct?.unidade || 'un'
      });
    } else if (sku) {
      console.log(`[Bling API] Item linked by SKU only: ${sku}`);
      items.push({
        codigo: sku,
        descricao: descricao,
        quantidade: Number(product.quantity) || 1,
        valor: 0,
        unidade: 'un'
      });
    } else {
      console.log(`[Bling API] Item not linked, sending as generic description: ${descricao}`);
      items.push({
        descricao: descricao,
        quantidade: Number(product.quantity) || 1,
        valor: 0,
        unidade: 'un'
      });
    }
  }
  return items;
}
