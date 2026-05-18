const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/OrderDetailsModal.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderDetailsModal.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: Arquivo não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Corrigir onUpdateOrder do boleto — não sobrescrever invoiceNumber/invoiceValue ──
const OLD_BOLETO_UPDATE = "              onUpdateOrder({ ...order, hasBoleto: true, boletoLinked: true, boletoNossoNumero: String(pendingBoleto.nossoNumero||''), invoiceNumber: String(pendingBoleto.seuNumero||''), invoiceValue: pendingBoleto.valor, paymentDueDate: pendingBoleto.dataVencimento||'', paymentDate: pendingBoleto.dataEmissao||'', boletSituacao: pendingBoleto.situacaoBoleto||'', statusHistory: [...(order.statusHistory||[]), { action: 'Boleto vinculado e confirmado', details: `NF: ${pendingBoleto.seuNumero} | NossoNumero: ${pendingBoleto.nossoNumero}`, timestamp: new Date().toISOString() }] });";

const NEW_BOLETO_UPDATE = [
  "              // Adicionar ao array de boletos (suporte a múltiplas parcelas)",
  "              const novoBoleto = { nossoNumero: String(pendingBoleto.nossoNumero||''), seuNumero: String(pendingBoleto.seuNumero||''), valor: pendingBoleto.valor||0, dataEmissao: pendingBoleto.dataEmissao||'', dataVencimento: pendingBoleto.dataVencimento||'', situacao: pendingBoleto.situacaoBoleto||'' };",
  "              const boletosAtuais = (order as any).boletos || [];",
  "              // Não duplicar boleto já vinculado",
  "              const boletosAtualizados = boletosAtuais.find((b: any) => b.nossoNumero === novoBoleto.nossoNumero) ? boletosAtuais : [...boletosAtuais, novoBoleto];",
  "              // Usar paymentDueDate do boleto mais recente (maior vencimento)",
  "              const maiorVencimento = boletosAtualizados.reduce((acc: string, b: any) => b.dataVencimento > acc ? b.dataVencimento : acc, '');",
  "              onUpdateOrder({ ...order, hasBoleto: true, boletoLinked: true,",
  "                boletoNossoNumero: String(pendingBoleto.nossoNumero||''),",
  "                boletos: boletosAtualizados,",
  "                boletSituacao: pendingBoleto.situacaoBoleto||'',",
  "                paymentDueDate: maiorVencimento || pendingBoleto.dataVencimento||'',",
  "                paymentDate: order.paymentDate || pendingBoleto.dataEmissao||'',",
  "                // NÃO sobrescrever invoiceNumber e invoiceValue da NF",
  "                statusHistory: [...(order.statusHistory||[]), { action: 'Boleto vinculado e confirmado', details: `NF: ${pendingBoleto.seuNumero} | NossoNumero: ${pendingBoleto.nossoNumero}`, timestamp: new Date().toISOString() }] } as any);",
].join('\n');

if (!content.includes(OLD_BOLETO_UPDATE)) {
  console.error('ERRO: Trecho onUpdateOrder do boleto não encontrado.'); process.exit(1);
}
content = content.replace(OLD_BOLETO_UPDATE, NEW_BOLETO_UPDATE);
console.log('OK: onUpdateOrder do boleto corrigido.');

// ── 2. Atualizar exibição — mostrar todos os boletos vinculados ───────────────
// Após os dados do boleto atual, adicionar lista de boletos vinculados
const OLD_BOLETO_DISPLAY = "                                            {(order.hasBoleto && (boletoData || order.boletoNossoNumero || order.paymentDueDate)) && (";
const NEW_BOLETO_DISPLAY = "                                            {(order.hasBoleto && ((order as any).boletos?.length > 0 || boletoData || order.boletoNossoNumero || order.paymentDueDate)) && (";

if (!content.includes(OLD_BOLETO_DISPLAY)) {
  console.error('ERRO: Condição de exibição do boleto não encontrada.'); process.exit(1);
}
content = content.replace(OLD_BOLETO_DISPLAY, NEW_BOLETO_DISPLAY);
console.log('OK: Condição de exibição atualizada.');

// ── 3. Adicionar exibição de múltiplos boletos após os dados do boleto atual ──
// Inserir antes do bloco "Enviar cobrança via"
const OLD_SEND_COBRANCA = '                          <div className="space-y-1 mt-1">\n                            <p className="text-[9px] text-slate-400 font-bold uppercase text-center">Enviar cobrança via</p>';

const NEW_SEND_COBRANCA = [
  '                          {/* Lista de todos os boletos vinculados */}',
  '                          {(order as any).boletos && (order as any).boletos.length > 1 && (',
  '                            <div className="space-y-1 mt-2">',
  '                              <p className="text-[9px] text-slate-400 font-bold uppercase">Boletos Vinculados ({(order as any).boletos.length} parcelas)</p>',
  '                              {(order as any).boletos.map((b: any, i: number) => (',
  '                                <div key={i} className="grid grid-cols-2 gap-x-4 gap-y-1 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">',
  '                                  <div><p className="text-[9px] text-slate-400 uppercase">NF/Parcela</p><p className="text-xs font-bold">{b.seuNumero}</p></div>',
  '                                  <div><p className="text-[9px] text-slate-400 uppercase">Valor</p><p className="text-xs font-bold text-primary">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(b.valor||0)}</p></div>',
  '                                  <div><p className="text-[9px] text-slate-400 uppercase">Emissão</p><p className="text-xs">{(b.dataEmissao||"").split("-").reverse().join("/")}</p></div>',
  '                                  <div><p className="text-[9px] text-slate-400 uppercase">Vencimento</p><p className="text-xs">{(b.dataVencimento||"").split("-").reverse().join("/")}</p></div>',
  '                                </div>',
  '                              ))}',
  '                            </div>',
  '                          )}',
  '                          <div className="space-y-1 mt-1">',
  '                            <p className="text-[9px] text-slate-400 font-bold uppercase text-center">Enviar cobrança via</p>',
].join('\n');

if (!content.includes(OLD_SEND_COBRANCA)) {
  console.error('ERRO: Bloco enviar cobrança não encontrado.'); process.exit(1);
}
content = content.replace(OLD_SEND_COBRANCA, NEW_SEND_COBRANCA);
console.log('OK: Exibição de múltiplos boletos adicionada.');

// ── 4. Corrigir desvincular — limpar array boletos também ────────────────────
const OLD_DESVINCULAR = [
  "                              onUpdateOrder({",
  "                                ...order,",
  "                                hasBoleto: false,",
  "                                boletoLinked: false,",
  "                                boletoNossoNumero: '',",
  "                                paymentDueDate: '',",
  "                                paymentDate: '',",
  "                                boletSituacao: '',",
  "                                statusHistory: [...(order.statusHistory || []), { action: 'Boleto desvinculado manualmente', timestamp: new Date().toISOString() }]",
  "                              } as any);",
  "                              setBoletoData(null);",
  "                              setPendingBoleto(null);",
  "                              setBoletosList([]);",
].join('\n');

const NEW_DESVINCULAR = [
  "                              onUpdateOrder({",
  "                                ...order,",
  "                                hasBoleto: false,",
  "                                boletoLinked: false,",
  "                                boletoNossoNumero: '',",
  "                                boletos: [],",
  "                                paymentDueDate: '',",
  "                                paymentDate: '',",
  "                                boletSituacao: '',",
  "                                statusHistory: [...(order.statusHistory || []), { action: 'Boleto desvinculado manualmente', timestamp: new Date().toISOString() }]",
  "                              } as any);",
  "                              setBoletoData(null);",
  "                              setPendingBoleto(null);",
  "                              setBoletosList([]);",
].join('\n');

if (!content.includes(OLD_DESVINCULAR)) {
  console.error('ERRO: Trecho desvincular boleto não encontrado.'); process.exit(1);
}
content = content.replace(OLD_DESVINCULAR, NEW_DESVINCULAR);
console.log('OK: Desvincular limpa array boletos.');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');