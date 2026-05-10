const fs = require('fs');
const path = require('path');

const dir = 'app/api/diagnostico';
const possibleBases = [
  '',
  path.join(process.env.HOME || '', 'Fluxia-next/'),
];

let base = null;
for (const b of possibleBases) {
  if (fs.existsSync(path.join(b, 'app/api'))) { base = b; break; }
}
if (base === null) {
  console.error('ERRO: pasta app/api nao encontrada.');
  process.exit(1);
}

const fullDir = path.join(base, dir);
fs.mkdirSync(fullDir, { recursive: true });

const route = `import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

const normalizeTipo = (name: string): string => {
  const n = name.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
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

const calcKg = (weightStr: string, quantity: number): number => {
  if (!weightStr || weightStr === 'N/A') return 0;
  const value = parseFloat(weightStr);
  if (isNaN(value)) return 0;
  if (weightStr.toLowerCase().includes('kg')) return value * quantity;
  if (weightStr.toLowerCase().includes('g')) return (value / 1000) * quantity;
  return 0;
};

export async function GET() {
  try {
    if (!getApps().length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
      initializeApp({ credential: cert(serviceAccount) });
    }
    const db = getFirestore();
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];

    const snap = await db.collection('orders').get();

    const perdidos: Record<string, { kg: number; count: number }> = {};
    let totalKgProd = 0;
    let totalKgRanking = 0;

    snap.forEach(doc => {
      const order = doc.data();
      if (!producedStatuses.includes(order.status)) return;
      if (order.isDeleted) return;

      (order.products || []).forEach((p: any) => {
        const kgTotal = calcKg(p.weight, p.quantity);
        totalKgProd += kgTotal;

        const tipo = normalizeTipo(p.name || '');
        if (!tipo) {
          const key = p.name || '(sem nome)';
          if (!perdidos[key]) perdidos[key] = { kg: 0, count: 0 };
          perdidos[key].kg += kgTotal;
          perdidos[key].count += p.quantity;
        } else {
          totalKgRanking += kgTotal;
        }
      });
    });

    const perdidosOrdenados = Object.entries(perdidos)
      .map(([nome, v]) => ({ nome, kg: parseFloat(v.kg.toFixed(3)), unidades: v.count }))
      .sort((a, b) => b.kg - a.kg);

    return NextResponse.json({
      totalKgProducao: parseFloat(totalKgProd.toFixed(2)),
      totalKgRanking: parseFloat(totalKgRanking.toFixed(2)),
      diferenca: parseFloat((totalKgProd - totalKgRanking).toFixed(2)),
      produtosNaoReconhecidos: perdidosOrdenados,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
`;

fs.writeFileSync(path.join(fullDir, 'route.ts'), route, 'utf8');
console.log('OK: Rota criada em app/api/diagnostico/route.ts');