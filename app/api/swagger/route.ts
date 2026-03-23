import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tokenRes = await fetch('https://api.correios.com.br/token/v1/autentica/cartaopostagem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.CORREIOS_USER?.replace(/\D/g, '')}:${process.env.CORREIOS_ACCESS_CODE}`).toString('base64')
    },
    body: JSON.stringify({ numero: process.env.CORREIOS_POSTAGE_CARD?.replace(/\D/g, '') })
  });
  const tokenData = await tokenRes.json();

  const testBody = {
    codigoServico: "03220",
    remetente: {
      nome: "CAFE FAZENDA ITAOCA",
      email: "CAFEFITAOCA@GMAIL.COM",
      cpfCnpj: "16795729000131",
      dddCelular: "11",
      celular: "915889584",
      endereco: {
        logradouro: "AV. PREFEITO DILERMANDO OLIVEIRA",
        numero: "876",
        complemento: "LOJA",
        bairro: "CENTRO",
        cidade: "CONCEICAO DO RIO VERDE",
        uf: "MG",
        cep: "37430000"
      }
    },
    destinatario: {
      nome: "TESTE",
      email: "teste@teste.com",
      cpfCnpj: "00000000000",
      dddCelular: "11",
      celular: "999999999",
      endereco: {
        logradouro: "Rua Teste",
        numero: "123",
        complemento: "",
        bairro: "Centro",
        cidade: "São Paulo",
        uf: "SP",
        cep: "01001000"
      }
    },
    pesoInformado: "1000",
    codigoFormatoObjetoInformado: "2",
    comprimentoInformado: "16",
    larguraInformada: "11",
    alturaInformada: "2",
    diametroInformado: "0",
    itensDeclaracaoConteudo: [
      {
        conteudo: "Cafe",
        quantidade: "1",
        valor: "100.00"
      }
    ],
    cienteObjetoNaoProibido: "1"
  };

  const swaggerRes = await fetch('https://api.correios.com.br/prepostagem/v3/api-docs', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + tokenData.token,
      'Accept': 'application/json'
    }
  });
  const swaggerData = await swaggerRes.json();

  fs.writeFileSync(path.join(process.cwd(), 'swagger-docs.json'), JSON.stringify(swaggerData, null, 2));

  return NextResponse.json({ success: true });
}
