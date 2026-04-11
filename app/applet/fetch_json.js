const https = require('https');
https.get('https://prepostagem.correios.com.br/public-resources/manuais/9_JSON_arquivo_obj_registrado_sem_codigo_registro_exemplo.json', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});
