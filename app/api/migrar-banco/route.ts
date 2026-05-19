import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = [
  'orders', 'leads', 'clientes', 'bling_customers', 'products',
  'inventory', 'recurrence_messages', 'bling_config', 'product_mapping',
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== 'fluxia-migrate-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccount) return NextResponse.json({ error: 'Service account não encontrada' }, { status: 500 });

    const certParsed = JSON.parse(serviceAccount);
    const projectId = 'gen-lang-client-0290158370';
    const OLD_DB = 'ai-studio-d74be468-e8d3-4407-a553-fd13540cc142';
    const NEW_DB = 'fluxia-prod';

    let oldApp: any = getApps().find((a: any) => a.name === 'old-db');
    if (!oldApp) oldApp = initializeApp({ credential: cert(certParsed), projectId }, 'old-db');
    const oldDb = getFirestore(oldApp, OLD_DB);

    let newApp: any = getApps().find((a: any) => a.name === 'new-db');
    if (!newApp) newApp = initializeApp({ credential: cert(certParsed), projectId }, 'new-db');
    const newDb = getFirestore(newApp, NEW_DB);

    const results: any = {};
    let totalCopied = 0;

    for (const collName of COLLECTIONS) {
      try {
        const snapshot = await oldDb.collection(collName).get();
        if (snapshot.empty) { results[collName] = { copied: 0, status: 'vazio' }; continue; }

        const docs = snapshot.docs;
        let copied = 0;

        // Processar em lotes de 499
        for (let i = 0; i < docs.length; i += 499) {
          const batch = newDb.batch();
          const chunk = docs.slice(i, i + 499);
          chunk.forEach((doc: any) => {
            batch.set(newDb.collection(collName).doc(doc.id), doc.data());
          });
          await batch.commit();
          copied += chunk.length;
        }

        results[collName] = { copied, status: 'ok' };
        totalCopied += copied;
        console.log(`[Migração] ${collName}: ${copied} docs`);
      } catch (e: any) {
        results[collName] = { status: 'erro', error: e.message };
      }
    }

    return NextResponse.json({ success: true, totalCopied, results, newDatabase: NEW_DB });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
