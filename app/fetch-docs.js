const https = require('https');
https.get('https://api.correios.com.br/prepostagem/v1/api-docs', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const doc = JSON.parse(data);
      console.log(Object.keys(doc));
      if (doc.definitions) console.log(Object.keys(doc.definitions));
      if (doc.components) console.log(Object.keys(doc.components));
    } catch (e) {
      console.log(e.message);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
