import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Load config manually to avoid import issues in script
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = getApps().length === 0 ? initializeApp({ projectId: firebaseConfig.projectId }) : getApp();
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
const adminDb = getFirestore(app, databaseId);
const adminDbDefault = getFirestore(app);

const KNOWN_SKUS = [
  'CAN350P', '112501P', '152501P', '102501P', '145001', '130402', '110402', '100402', '140402', 'CGP040', '141002', '0014', 'CGP250', 'CGP500', '155000', '141000', '142502', '142501', '145002', '111001', '111002', '111201', '111202', '112501', '112502', '132501', '132502', '122501', '122502', '101001', '101002', '101201', '101201', '101202', '102501', '102502', '100105', '100102'
];

async function run() {
  console.log('Starting manual initial load...');
  
  // 1. Get Bling Token
  let token = '';
  try {
    const tokenDoc = await adminDb.collection('bling_config').doc('tokens').get();
    if (!tokenDoc.exists) {
      // Try default db
      const tokenDocDef = await adminDbDefault.collection('bling_config').doc('tokens').get();
      if (tokenDocDef.exists) {
        token = tokenDocDef.data()?.access_token;
      }
    } else {
      token = tokenDoc.data()?.access_token;
    }
  } catch (err) {
    console.error('Error reading token:', err);
  }

  if (!token) {
    console.error('No Bling token found in Firestore. Please configure Bling first.');
    return;
  }

  console.log('Bling token found. Fetching products...');

  // 2. Clear existing mappings
  let mappingRef = adminDb.collection('product_mapping');
  let snapshot;
  try {
    snapshot = await mappingRef.get();
  } catch (err: any) {
    if (err.message.includes('PERMISSION_DENIED') || err.message.includes('NOT_FOUND')) {
      mappingRef = adminDbDefault.collection('product_mapping');
      snapshot = await mappingRef.get();
    } else {
      throw err;
    }
  }

  const batch = mappingRef.firestore.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log('Cleared existing mappings.');

  // 3. Fetch from Bling
  let allBlingProducts: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    console.log(`Fetching page ${page}...`);
    const response = await fetch(`https://api.bling.com.br/Api/v3/produtos?pagina=${page}&limite=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Bling API error: ${response.status}`);
      break;
    }
    const data: any = await response.json();
    const products = data.data || [];
    if (products.length === 0) {
      hasMore = false;
    } else {
      allBlingProducts = [...allBlingProducts, ...products];
      page++;
    }
  }

  console.log(`Found ${allBlingProducts.length} products in Bling.`);

  // 4. Map and Save
  let mappedCount = 0;
  for (const sku of KNOWN_SKUS) {
    const product = allBlingProducts.find(p => p.codigo === sku);
    if (!product) continue;

    const name = product.nome || '';
    let appName = 'Especial';
    let appWeight = '250g';
    let appGrind = 'moído';

    const lowerName = name.toLowerCase();
    if (lowerName.includes('catuaí') || lowerName.includes('catuai')) appName = 'Catuaí';
    else if (lowerName.includes('bourbon')) appName = 'Bourbon';
    else if (lowerName.includes('yellow')) appName = 'Yellow';
    else if (lowerName.includes('gourmet')) appName = 'Gourmet';
    else if (lowerName.includes('drip')) appName = 'DripCoffee';
    else if (lowerName.includes('caneca')) appName = 'Caneca';

    const weightMatch = name.match(/(\d+g|\d+kg|\d+,\d+kg|\d+\.\d+kg)/i);
    if (weightMatch) appWeight = weightMatch[1].toLowerCase().replace(',', '.');

    if (lowerName.includes('grão') || lowerName.includes('grao')) appGrind = 'grãos';
    else if (lowerName.includes('moído') || lowerName.includes('moido')) appGrind = 'moído';

    await mappingRef.add({
      appName,
      appWeight,
      appGrind,
      blingSku: sku,
      blingId: product.id.toString(),
      blingName: name,
      createdAt: new Date().toISOString()
    });
    mappedCount++;
  }

  console.log(`Successfully mapped ${mappedCount} products.`);
  console.log('Initial load complete.');
}

run().catch(console.error);
