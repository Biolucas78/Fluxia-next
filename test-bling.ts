import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf-8'));
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

const app = initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  const tokenDoc = await db.collection('bling_config').doc('tokens').get();
  const token = tokenDoc.data()?.access_token;
  
  const res = await fetch('https://api.bling.com.br/Api/v3/contatos?limite=1', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
