const https = require('https');
const fs = require('fs');

function getToken() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      numero: process.env.CORREIOS_USER
    });

    const options = {
      hostname: 'api.correios.com.br',
      port: 443,
      path: '/token/v1/autentica/cartaopostagem',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CORREIOS_USER}:${process.env.CORREIOS_ACCESS_CODE}`).toString('base64'),
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(JSON.parse(body).token);
      });
    });
    req.write(data);
    req.end();
  });
}

getToken().then(token => {
  https.get('https://api.correios.com.br/prepostagem/v1/api-docs', {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      fs.writeFileSync('swagger.json', data);
      console.log('Saved to swagger.json');
    });
  }).on('error', (e) => {
    console.error(e);
  });
});
