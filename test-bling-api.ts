import { getValidBlingTokenServer } from './lib/bling-server';

async function test() {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    // Let's get the list first to get a valid ID
    const listRes = await fetch('https://api.bling.com.br/Api/v3/nfe?limite=5', { headers });
    const listData = await listRes.json();
    const firstId = listData.data?.[0]?.id;
    
    console.log('First ID:', firstId);

    if (firstId) {
      console.log(`Testing details endpoint: https://api.bling.com.br/Api/v3/nfe/${firstId}`);
      const detailRes = await fetch(`https://api.bling.com.br/Api/v3/nfe/${firstId}`, { headers });
      console.log('Detail Status:', detailRes.status);
      console.log('Detail Body:', await detailRes.text().then(t => t.substring(0, 300)));
    }

  } catch (e) {
    console.error(e);
  }
}

test();
