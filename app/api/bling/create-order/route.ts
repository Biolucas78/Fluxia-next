import { NextResponse } from 'next/server';
import { adminDb, adminDbDefault } from '@/lib/firebase-admin';
import { getValidBlingTokenServer } from '@/lib/bling-server';

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
        console.log('[Bling API] Admin SDK permission denied for config, will use Client SDK fallback.');
      } else {
        console.warn('[Bling API] Admin SDK failed to fetch config:', adminError.message);
      }
    }

    if (!config.lojaId) {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: clientDb } = await import('@/lib/firebase');
        const clientConfigSnap = await getDoc(doc(clientDb, 'bling_config', 'main'));
        if (clientConfigSnap.exists()) {
          config = clientConfigSnap.data() || {};
          console.log('[Bling API] Config fetched via Client SDK (Public Read)');
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

/**
 * Helper to fetch with retry for 429 errors
 */
async function fetchWithRetry(url: string, options: any, retries = 5, backoff = 2000): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
      console.warn(`[Bling API] 429 Too Many Requests. Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`[Bling API] Fetch error. Retrying in ${backoff}ms... (${retries} retries left)`, error);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

async function findClient(token: string, order: any) {
  const document = (order.cnpj || order.cpf || '').replace(/\D/g, '');
  const { db: clientDb } = await import('@/lib/firebase');
  const { collection, query, where, getDocs, doc, setDoc } = await import('firebase/firestore');

  // 1. Tentar buscar no Firestore primeiro (Cache Local)
  try {
    console.log(`[Bling API] Checking local cache for client: ${order.clientName}`);
    const customersRef = collection(clientDb, 'bling_customers');
    let q;
    if (document) {
      q = query(customersRef, where('numeroDocumento', '==', document));
    } else {
      q = query(customersRef, where('nome', '==', order.clientName));
    }
    
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const cachedClient = querySnapshot.docs[0].data();
      console.log(`[Bling API] Client found in local cache: ${cachedClient.id}`);
      return cachedClient.id;
    }
  } catch (e) {
    console.warn('[Bling API] Error checking local cache:', e);
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
  try {
    const { db: clientDb } = await import('@/lib/firebase');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(clientDb, 'bling_customers', String(id)), {
      id: id,
      nome: name,
      numeroDocumento: document,
      updatedAt: Date.now()
    }, { merge: true });
    console.log(`[Bling API] Client ${id} saved to local cache.`);
  } catch (e) {
    console.warn('[Bling API] Failed to save client to cache:', e);
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
  const { db: clientDb } = await import('@/lib/firebase');
  const { collection, getDocs } = await import('firebase/firestore');

  console.log(`[Bling API] Mapping ${products.length} products...`);

  // 1. Fetch all mappings from Firestore
  let allMappings: any[] = [];
  try {
    const mappingRef = adminDb.collection('product_mapping');
    const snapshot = await mappingRef.get();
    if (!snapshot.empty) {
      allMappings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[Bling API] Fetched ${allMappings.length} mappings via Admin SDK (Named DB)`);
    } else {
      const defaultSnapshot = await adminDbDefault.collection('product_mapping').get();
      if (!defaultSnapshot.empty) {
        allMappings = defaultSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[Bling API] Fetched ${allMappings.length} mappings via Admin SDK (Default DB)`);
      }
    }
  } catch (adminError: any) {
    if (adminError.message.includes('PERMISSION_DENIED')) {
      console.log('[Bling API] Admin SDK permission denied for mappings, will use Client SDK fallback.');
    } else {
      console.warn('[Bling API] Admin SDK failed to fetch mappings, trying Client SDK:', adminError.message);
    }
    try {
      const clientMappingRef = collection(clientDb, 'product_mapping');
      const snapshot = await getDocs(clientMappingRef);
      allMappings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[Bling API] Fetched ${allMappings.length} mappings via Client SDK`);
    } catch (clientError: any) {
      console.error('[Bling API] Client SDK also failed to fetch mappings:', clientError.message);
    }
  }

  // 2. Fetch all products from Bling Catalog once (to get prices and IDs)
  let blingCatalog: Map<string, any> = new Map();
  try {
    console.log('[Bling API] Fetching Bling catalog for price synchronization...');
    const response = await fetchWithRetry('https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.status === 401) {
      throw new Error('Bling token expired (401) during catalog sync. Please re-authenticate in Settings.');
    }
    
    if (response.ok) {
      const data = await response.json();
      if (data.data) {
        data.data.forEach((p: any) => {
          if (p.codigo) blingCatalog.set(p.codigo, p);
        });
        console.log(`[Bling API] Synced ${blingCatalog.size} products from Bling catalog`);
      }
    }
  } catch (e) {
    console.error('[Bling API] Error syncing Bling catalog:', e);
  }

  const normalize = (str: string) => {
    if (!str) return '';
    // Remove accents, lowercase, trim, remove "cafe" prefix, and REMOVE ALL SPACES
    return str.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/cafe/g, '')
      .replace(/\s+/g, '')
      .trim();
  };

  if (allMappings.length === 0) {
    console.warn('[Bling API] No mappings found in Firestore. Product mapping will likely fail.');
  } else {
    console.log(`[Bling API] First 3 mappings for debug:`, JSON.stringify(allMappings.slice(0, 3)));
  }

  for (const product of products) {
    let mapping: any = null;
    const normName = normalize(product.name);
    const normWeight = normalize(product.weight);
    const normGrind = normalize(product.grindType);

    console.log(`[Bling API] Mapping product: "${product.name}" | "${product.weight}" | "${product.grindType}"`);
    console.log(`[Bling API] Normalized: "${normName}" | "${normWeight}" | "${normGrind}"`);

    // 1. Try to find mapping in memory
    if (product.blingSku) {
      mapping = allMappings.find(m => m.blingSku === product.blingSku);
      if (mapping) console.log(`[Bling API] Mapping found by SKU (${product.blingSku})`);
    }

    if (!mapping) {
      // Try exact match first
      mapping = allMappings.find(m => 
        normalize(m.appName) === normName && 
        normalize(m.appWeight) === normWeight && 
        normalize(m.appGrind) === normGrind
      );

      if (mapping) {
        console.log(`[Bling API] Mapping found by exact normalized match: ${mapping.blingSku}`);
      } else {
        // Try name and weight match
        mapping = allMappings.find(m => 
          normalize(m.appName) === normName && 
          normalize(m.appWeight) === normWeight
        );
        if (mapping) {
          console.log(`[Bling API] Mapping found by name and weight match: ${mapping.blingSku}`);
        } else {
          // Try name match only
          mapping = allMappings.find(m => normalize(m.appName) === normName);
          if (mapping) console.log(`[Bling API] Mapping found by name match only: ${mapping.blingSku}`);
        }
      }
    }

    // 1.5 Special fallback for DripCoffee if no mapping found
    if (!mapping && normalize(product.name).includes('dripcoffee')) {
      console.log(`[Bling API] Applying special fallback for DripCoffee -> SKU 100105`);
      mapping = { blingSku: '100105' };
    }

    // 2. Resolve Bling Data from Catalog using SKU
    const sku = mapping?.blingSku || product.blingSku;
    let catalogProduct = sku ? blingCatalog.get(sku) : null;

    // If not in catalog, try to fetch it directly by SKU to get price and ID
    if (sku && !catalogProduct) {
      try {
        // Delay before direct SKU fetch to avoid 429
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`[Bling API] SKU ${sku} not in initial catalog, fetching directly...`);
        const skuResponse = await fetchWithRetry(`https://api.bling.com.br/Api/v3/produtos?codigo=${sku}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (skuResponse.ok) {
          const skuData = await skuResponse.json();
          if (skuData.data && skuData.data.length > 0) {
            catalogProduct = skuData.data[0];
            console.log(`[Bling API] SKU ${sku} found via direct fetch`);
          }
        }
      } catch (e) {
        console.error(`[Bling API] Error fetching SKU ${sku} directly:`, e);
      }
    }
    
    let blingId = catalogProduct?.id || mapping?.blingId;
    let preco = catalogProduct?.preco || 0;
    let unidade = catalogProduct?.unidade || 'un';

    if (blingId) {
      console.log(`[Bling API] Using catalog product: ID ${blingId}, SKU ${sku}, Price ${preco}`);
      items.push({
        produto: { id: Number(blingId) },
        quantidade: Number(product.quantity) || 1,
        valor: Number(preco),
        unidade: unidade
      });
    } else if (sku) {
      console.log(`[Bling API] No product ID found in catalog, falling back to SKU: ${sku}`);
      items.push({
        codigo: sku,
        quantidade: Number(product.quantity) || 1,
        valor: 0,
        unidade: 'un'
      });
    } else {
      console.warn(`[Bling API] No mapping or SKU found for product: ${product.name}. Using generic description.`);
      items.push({
        descricao: `${product.name} ${product.weight} ${product.grindType}`,
        quantidade: Number(product.quantity) || 1,
        valor: 0,
        unidade: 'un'
      });
    }
  }
  return items;
}
