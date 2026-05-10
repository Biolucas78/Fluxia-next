// Script de diagnóstico — roda no terminal do Firebase Studio
// Mostra quais produtos estão sendo perdidos no ranking

const normalizeTipo = (name) => {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.includes('amostra')) return '';
    if (n.includes('caneca') || n.includes('filtro') || n.includes('copo') || n.includes('kit')) return '';
    if (n.includes('drip')) return 'DripCoffee';
    if (n.includes('gourmet') && (n.includes('personal') || n.includes('personaliz'))) return 'Gourmet Personalizado';
    if (n.includes('gourmet')) return 'Gourmet';
    if (n.includes('torra clara') || n.includes('torra cla') || (n.includes('clara') && !n.includes('bourbon'))) return 'Torra Clara';
    if (n.includes('torra inten') || n.includes('intensa') || n.includes('torra inte')) return 'Torra Intensa';
    if (n.includes('bourbon') || n.includes('bourbom')) return 'Bourbon';
    if (n.includes('yellow')) return 'Yellow';
    if (n.includes('catuai') || n.includes('vermelho') || n.includes('selecao') || n.includes('especial')) return 'Catuaí';
    return '';
  };
  
  const calculateWeightInKg = (weightStr, quantity) => {
    if (!weightStr || weightStr === 'N/A') return 0;
    const value = parseFloat(weightStr);
    if (isNaN(value)) return 0;
    if (weightStr.toLowerCase().includes('kg')) return value * quantity;
    if (weightStr.toLowerCase().includes('g')) return (value / 1000) * quantity;
    return 0;
  };
  
  // Conectar ao Firestore via Admin SDK
  const admin = require('firebase-admin');
  const fs = require('fs');
  
  // Carregar credenciais
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? null
    : 'service-account.json';
  
  let app;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      console.error('ERRO: Variavel FIREBASE_SERVICE_ACCOUNT_KEY nao encontrada.');
      console.log('Este script precisa ser rodado no Vercel ou com a variavel configurada.');
      console.log('');
      console.log('Alternativa: me mande o resultado de alguns cards do Kanban para eu analisar manualmente.');
      process.exit(1);
    }
  } catch(e) {
    console.error('Erro ao inicializar Firebase:', e.message);
    process.exit(1);
  }
  
  const db = admin.firestore();
  
  async function main() {
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    
    // Buscar orders (produção)
    const snap = await db.collection('orders').get();
    
    const perdidos = {}; // produtos que somem na produção total mas não no ranking
    let totalKgProd = 0;
    let totalKgRanking = 0;
  
    snap.forEach(doc => {
      const order = doc.data();
      if (!producedStatuses.includes(order.status)) return;
      if (order.isDeleted) return;
  
      (order.products || []).forEach(p => {
        const kgTotal = calculateWeightInKg(p.weight, p.quantity);
        totalKgProd += kgTotal;
  
        const tipo = normalizeTipo(p.name);
        if (!tipo) {
          // Este produto está sendo perdido no ranking
          const key = `"${p.name}" | peso: ${p.weight} | qty: ${p.quantity}`;
          if (!perdidos[key]) perdidos[key] = { kg: 0, count: 0 };
          perdidos[key].kg += kgTotal;
          perdidos[key].count += 1;
        } else {
          totalKgRanking += kgTotal;
        }
      });
    });
  
    console.log('=== DIAGNÓSTICO DE PRODUÇÃO ===');
    console.log(`Total KG (produção total): ${totalKgProd.toFixed(2)} kg`);
    console.log(`Total KG (ranking):        ${totalKgRanking.toFixed(2)} kg`);
    console.log(`Diferença:                 ${(totalKgProd - totalKgRanking).toFixed(2)} kg`);
    console.log('');
  
    const perdidosEntries = Object.entries(perdidos).sort((a,b) => b[1].kg - a[1].kg);
    if (perdidosEntries.length === 0) {
      console.log('Nenhum produto perdido encontrado.');
    } else {
      console.log(`=== PRODUTOS NAO RECONHECIDOS (${perdidosEntries.length} tipos) ===`);
      perdidosEntries.forEach(([key, val]) => {
        console.log(`  ${val.kg.toFixed(2)} kg | ${val.count}x | ${key}`);
      });
    }
  
    process.exit(0);
  }
  
  main().catch(e => { console.error(e); process.exit(1); });