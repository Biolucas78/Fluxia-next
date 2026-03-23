const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val.trim();
  return acc;
}, {});
process.env = { ...process.env, ...env };

function getToken() {
  return new Promise((resolve) => {
    const authHeader = Buffer.from(`${process.env.CORREIOS_USER.replace(/\D/g, '')}:${process.env.CORREIOS_ACCESS_CODE}`).toString('base64');
    const req = https.request('https://api.correios.com.br/token/v1/autentica/cartaopostagem', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(JSON.parse(data).token);
      });
    });
    req.write(JSON.stringify({ numero: process.env.CORREIOS_POSTAGE_CARD.replace(/\D/g, '') }));
    req.end();
  });
}

function test(body, token) {
  return new Promise((resolve) => {
    const req = https.request('https://api.correios.com.br/prepostagem/v1/prepostagens', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const token = await getToken();
  console.log('Token:', token ? 'OK' : 'FAIL');
  
  const base = {
    cartaoPostagem: process.env.CORREIOS_POSTAGE_CARD.replace(/\D/g, ''),
    remetente: {
      nome: "CAFE FAZENDA ITAOCA",
      email: "CAFEFITAOCA@GMAIL.COM",
      cpfCnpj: "00738747602",
      telefone: "11915889584",
      endereco: {
        logradouro: "Rua",
        numero: "1",
        bairro: "Bairro",
        cidade: "Cidade",
        uf: "MG",
        cep: "31260280"
      }
    },
    destinatario: {
      nome: "Helen Aragão",
      email: "cliente@email.com",
      cpfCnpj: "00000000000",
      telefone: "11915889584",
      endereco: {
        logradouro: "Rua",
        numero: "1",
        bairro: "Bairro",
        cidade: "Cidade",
        uf: "MG",
        cep: "31260280"
      }
    },
    objetoPostal: {
      peso: 500,
      formato: "1",
      comprimento: 16,
      largura: 11,
      altura: 2,
      diametro: 0
    },
    declaracaoConteudo: {
      itens: [
        {
          descricao: "Bourbon",
          quantidade: 1,
          valor: 500,
          peso: 250
        }
      ]
    },
    caracteristicasRisco: false,
    declaracaoNaoProibido: true
  };

  const tests = [
    { ...base, servico: "03220" },
    { ...base, codigoServico: "03220" },
    { ...base, servico: { codigo: "03220" } },
    { ...base, servico: [{ codigo: "03220" }] },
    { ...base, encomendas: [{ servico: "03220", objetoPostal: base.objetoPostal, declaracaoConteudo: base.declaracaoConteudo }] }
  ];

  for (let i = 0; i < tests.length; i++) {
    console.log(`Test ${i}:`);
    const res = await test(tests[i], token);
    console.log(res.status, res.body);
  }
}

run();
