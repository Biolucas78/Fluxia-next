const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'app/api/sicoob/boleto/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/sicoob/boleto/route.ts'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: Arquivo não encontrado.'); process.exit(1); }
let content = fs.readFileSync(filePath, 'utf8');

const OLD = `        codigoTipoJuro: 2,
        taxaJuro: 1.0,
        codigoTipoMulta: 2,
        taxaMulta: 2.0,
        mensagemInstrucaoCaixa: [
          'Nao cobrar encargos por atraso.',
          'Nao conceder desconto.',
          'Pedido faturado em ' + (dataPedido || new Date().toLocaleDateString('pt-BR')),
          'Referente a Nota Fiscal ' + (numeroNF || seuNumero) + (numeroParcela ? ' - Parcela ' + numeroParcela : ''),
        ].join(' | '),
        gerarPdf: true,`;

const NEW = `        tipoJurosMora: 2,
        valorJurosMora: 1.0,
        dataJurosMora: parcela.dataVencimento,
        tipoMulta: 2,
        valorMulta: 2.0,
        dataMulta: parcela.dataVencimento,
        mensagensInstrucao: [
          'Nao cobrar encargos por atraso.',
          'Nao conceder desconto.',
          'Pedido faturado em ' + (dataPedido || new Date().toLocaleDateString('pt-BR')),
          'Referente a Nota Fiscal ' + (numeroNF || seuNumero) + (numeroParcela ? ' - Parcela ' + numeroParcela : ''),
        ],
        gerarPdf: true,`;

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado.');
  process.exit(1);
}
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Campos de juros, multa e instruções corrigidos.');