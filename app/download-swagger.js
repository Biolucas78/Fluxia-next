const https = require('https');
const fs = require('fs');

https.get('https://api.correios.com.br/prepostagem/v1/api-docs', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('/app/swagger.json', data);
    console.log('Saved to /app/swagger.json');
  });
}).on('error', (e) => {
  console.error(e);
});
