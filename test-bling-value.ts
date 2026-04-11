import { getValidBlingTokenServer } from './lib/bling-server';

async function test() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const listRes = await fetch('https://api.bling.com.br/Api/v3/nfe?limite=1', { headers });
    const listData = await listRes.json();
    console.log('Invoice List Data:', JSON.stringify(listData.data?.[0], null, 2));

  } catch (e) {
    console.error(e);
  }
}

test();
