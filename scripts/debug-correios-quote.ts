
import { getCorreiosToken } from '../lib/correios';

async function test() {
  const CORREIOS_USER = process.env.CORREIOS_USER;
  const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
  const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;
  const CORREIOS_CONTRACT = process.env.CORREIOS_CONTRACT;
  const CORREIOS_DR = process.env.CORREIOS_DR;

  if (!CORREIOS_USER || !CORREIOS_TOKEN) {
    console.log('Credenciais ausentes');
    return;
  }

  try {
    const bearerToken = await getCorreiosToken();
    const serviceId = "03220"; // SEDEX
    const originCep = "37470000"; // Exemplo
    const destinationCep = "01001000"; // Exemplo
    
    const queryParams = new URLSearchParams({
      cepOrigem: originCep,
      cepDestino: destinationCep,
      psObjeto: "500",
      tpObjeto: "2",
      comprimento: "20",
      largura: "20",
      altura: "20"
    });

    if (CORREIOS_CONTRACT && CORREIOS_DR) {
      queryParams.append('nuContrato', CORREIOS_CONTRACT.replace(/\D/g, ''));
      queryParams.append('nuDR', CORREIOS_DR.replace(/\D/g, ''));
    }

    const url = `https://api.correios.com.br/preco/v1/nacional/${serviceId}?${queryParams.toString()}`;
    console.log('URL Preço:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Resposta Preço:', JSON.stringify(data, null, 2));

    // Testar Prazo
    const urlPrazo = `https://api.correios.com.br/prazo/v1/nacional/${serviceId}?${queryParams.toString()}`;
    console.log('URL Prazo:', urlPrazo);
    const responsePrazo = await fetch(urlPrazo, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json'
      }
    });
    const dataPrazo = await responsePrazo.json();
    console.log('Resposta Prazo:', JSON.stringify(dataPrazo, null, 2));
  } catch (e) {
    console.error('Erro:', e);
  }
}

test();
