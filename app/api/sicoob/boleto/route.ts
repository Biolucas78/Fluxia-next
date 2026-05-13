import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getSicoobToken } from '@/app/api/sicoob/token/route';

const NUMERO_CLIENTE = process.env.SICOOB_NUMERO_CLIENTE;
const NUMERO_CONTA = process.env.SICOOB_NUMERO_CONTA;

function makeHttpsRequest(options: https.RequestOptions, body: string, pfxBuffer: Buffer, certPassword: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      ...options,
      pfx: pfxBuffer,
      passphrase: certPassword,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    const {
      cpfCnpj,
      nomePagador,
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      email,
      valor,
      dataVencimento,
      seuNumero,
      dataEmissao,
      parcelas,
      dataPedido,
      numeroNF,
    } = await request.json();

    const certBase64 = process.env.SICOOB_CERT_PFX_BASE64!;
    const certPassword = process.env.SICOOB_CERT_PASSWORD!;
    const pfxBuffer = Buffer.from(certBase64, 'base64');

    const token = await getSicoobToken('boletos_inclusao');

    const boletosParaEmitir = parcelas && parcelas.length > 0
      ? parcelas
      : [{ valor, dataVencimento }];

    const resultados = [];

    for (let i = 0; i < boletosParaEmitir.length; i++) {
      const parcela = boletosParaEmitir[i];
      const numeroParcela = boletosParaEmitir.length > 1 ? (i + 1) + '/' + boletosParaEmitir.length : '';
      const seuNumeroParcela = boletosParaEmitir.length > 1 ? seuNumero + '-' + (i + 1) : seuNumero;

      const boleto: any = {
        numeroCliente: parseInt(NUMERO_CLIENTE!),
        codigoModalidade: 1,
        numeroContaCorrente: parseInt(NUMERO_CONTA!),
        codigoEspecieDocumento: 'DM',
        dataEmissao: dataEmissao || new Date().toISOString().split('T')[0],
        seuNumero: seuNumeroParcela,
        identificacaoEmissaoBoleto: 1,
        identificacaoDistribuicaoBoleto: 1,
        valor: parseFloat(parcela.valor),
        dataVencimento: parcela.dataVencimento,
        codigoTipoJuro: 2,
        taxaJuro: 1.0,
        codigoTipoMulta: 2,
        taxaMulta: 2.0,
        mensagemInstrucaoCaixa: [
          'Nao cobrar encargos por atraso.',
          'Nao conceder desconto.',
          'Pedido faturado em ' + (dataPedido || new Date().toLocaleDateString('pt-BR')),
          'Referente a Nota Fiscal ' + (numeroNF || seuNumero) + (numeroParcela ? ' - Parcela ' + numeroParcela : ''),
        ].join(' | '),
        pagador: {
          numeroCpfCnpj: cpfCnpj.replace(/\D/g, ''),
          nome: nomePagador,
          endereco: logradouro,
          numero: numero || 'S/N',
          bairro,
          cidade,
          uf,
          cep: cep.replace(/\D/g, ''),
          ...(email ? { email } : {}),
        },
      };

      const bodyStr = JSON.stringify(boleto);
      const result = await makeHttpsRequest(
        {
          hostname: 'api.sicoob.com.br',
          port: 443,
          path: '/cobranca-bancaria/v3/boletos',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        },
        bodyStr,
        pfxBuffer,
        certPassword
      );

      resultados.push(result);
    }

    const erros = resultados.filter(r => r.status !== 200 && r.status !== 201);
    if (erros.length > 0) {
      return NextResponse.json({
        ok: false,
        error: 'Erro ao emitir boleto(s)',
        detalhes: erros.map((e: any) => e.body),
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      boletos: resultados.map(r => r.body),
    });

  } catch (error: any) {
    console.error('Erro Sicoob emissao:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
