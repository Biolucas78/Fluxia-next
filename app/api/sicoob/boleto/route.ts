import { NextRequest, NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';

const NUMERO_CLIENTE = process.env.SICOOB_NUMERO_CLIENTE;
const NUMERO_CONTA = process.env.SICOOB_NUMERO_CONTA;

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

    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_inclusao');

    const boletosParaEmitir: { valor: number; dataVencimento: string }[] =
      parcelas && parcelas.length > 0 ? parcelas : [{ valor, dataVencimento }];

    const resultados = [];

    for (let i = 0; i < boletosParaEmitir.length; i++) {
      const parcela = boletosParaEmitir[i];
      const numeroParcela = boletosParaEmitir.length > 1 ? (i + 1) + '/' + boletosParaEmitir.length : '';
      const seuNumeroParcela = boletosParaEmitir.length > 1 ? seuNumero + '-' + (i + 1) : seuNumero;

      const boleto: Record<string, any> = {
        numeroCliente: parseInt(NUMERO_CLIENTE!),
        codigoModalidade: 1,
        numeroContaCorrente: parseInt(NUMERO_CONTA!),
        codigoEspecieDocumento: 'DM',
        dataEmissao: dataEmissao || new Date().toISOString().split('T')[0],
        seuNumero: seuNumeroParcela,
        identificacaoEmissaoBoleto: 1,
        identificacaoDistribuicaoBoleto: 1,
        valor: parseFloat(String(parcela.valor)),
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
      const result = await makeSicoobRequest(
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

    return NextResponse.json({ ok: true, boletos: resultados.map(r => r.body) });

  } catch (error: any) {
    console.error('Erro Sicoob emissao:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
