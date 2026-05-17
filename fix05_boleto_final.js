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
console.log('Arquivo:', filePath);

let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Corrigir match + updates + situacao ────────────────────────────────────
const OLD = [
  "                            let boleto = boletos[0];",
  "                            if (order.invoiceNumber) {",
  "                              const match = boletos.find((b: any) => String(b.seuNumero).trim() === String(order.invoiceNumber).trim());",
  "                              if (match) boleto = match;",
  "                            } else {",
  "                              boleto = boletos.sort((a: any, b: any) => new Date(b.dataEmissao || 0).getTime() - new Date(a.dataEmissao || 0).getTime())[0];",
  "                            }",
  "                            const updates: any = { hasBoleto: true };",
  "                            if (boleto.nossoNumero) updates.boletoNossoNumero = String(boleto.nossoNumero);",
  "                            if (boleto.valor) updates.invoiceValue = boleto.valor;",
  "                            if (boleto.dataVencimento) updates.paymentDueDate = boleto.dataVencimento;",
  "                            if (boleto.dataEmissao) updates.paymentDate = boleto.dataEmissao;",
  "                            if (boleto.situacaoBoleto === 'LIQUIDADO') updates.paymentStatus = 'pago';",
].join('\n');

const NEW = [
  "                            // Normalizar: remove zeros à esquerda e espaços para comparar",
  "                            const norm = (v: any) => String(v || '').trim().replace(/^0+/, '') || '0';",
  "                            const nfNorm = norm(order.invoiceNumber);",
  "                            // Prioridade 1: seuNumero normalizado === invoiceNumber normalizado",
  "                            let boleto = boletos.find((b: any) => nfNorm !== '0' && norm(b.seuNumero) === nfNorm);",
  "                            // Prioridade 2: valor mais próximo (diferença < R$0,01)",
  "                            if (!boleto && order.invoiceValue) {",
  "                              const byVal = [...boletos].sort((a: any, b: any) =>",
  "                                Math.abs((a.valor || 0) - order.invoiceValue!) - Math.abs((b.valor || 0) - order.invoiceValue!)",
  "                              );",
  "                              if (byVal[0] && Math.abs((byVal[0].valor || 0) - order.invoiceValue!) < 0.01) boleto = byVal[0];",
  "                            }",
  "                            // Prioridade 3: mais recente (fallback)",
  "                            if (!boleto) {",
  "                              boleto = [...boletos].sort((a: any, b: any) =>",
  "                                new Date(b.dataEmissao || 0).getTime() - new Date(a.dataEmissao || 0).getTime()",
  "                              )[0];",
  "                            }",
  "                            const updates: any = { hasBoleto: true };",
  "                            if (boleto.nossoNumero) updates.boletoNossoNumero = String(boleto.nossoNumero);",
  "                            if (boleto.seuNumero) updates.invoiceNumber = String(boleto.seuNumero);",
  "                            if (boleto.valor) updates.invoiceValue = boleto.valor;",
  "                            if (boleto.dataVencimento) updates.paymentDueDate = boleto.dataVencimento;",
  "                            if (boleto.dataEmissao) updates.paymentDate = boleto.dataEmissao;",
  "                            if (boleto.situacaoBoleto) updates.boletSituacao = boleto.situacaoBoleto;",
  "                            if (boleto.situacaoBoleto === 'LIQUIDADO') updates.paymentStatus = 'pago';",
].join('\n');

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho de match não encontrado.');
  process.exit(1);
}
content = content.replace(OLD, NEW);
console.log('OK: Match + updates corrigidos.');

// ── 2. Popular boletoData ao abrir o card ─────────────────────────────────────
const OLD_EFFECT = [
  "  React.useEffect(() => {",
  "    setEditedAddress(order.address || '');",
  "    setEditedObservations(order.observations || '');",
  "    setManualInvoiceKey(order.invoiceKey || '');",
  "    setManualInvoiceNumber(order.invoiceNumber || '');",
].join('\n');

const NEW_EFFECT = [
  "  React.useEffect(() => {",
  "    setEditedAddress(order.address || '');",
  "    setEditedObservations(order.observations || '');",
  "    setManualInvoiceKey(order.invoiceKey || '');",
  "    setManualInvoiceNumber(order.invoiceNumber || '');",
  "    // Popular boletoData com dados já salvos no pedido",
  "    if (order.hasBoleto && (order.boletoNossoNumero || order.paymentDueDate)) {",
  "      setBoletoData({",
  "        nossoNumero: order.boletoNossoNumero || '',",
  "        seuNumero: order.invoiceNumber || '',",
  "        valor: order.invoiceValue || 0,",
  "        dataEmissao: order.paymentDate || '',",
  "        dataVencimento: order.paymentDueDate || '',",
  "        situacao: (order as any).boletSituacao || '',",
  "      });",
  "    }",
].join('\n');

if (!content.includes(OLD_EFFECT)) {
  console.error('ERRO: useEffect não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_EFFECT, NEW_EFFECT);
console.log('OK: useEffect atualizado.');

// ── 3. Corrigir exibição da situação ─────────────────────────────────────────
const OLD_SIT = [
  "                            {boletoData?.situacao && (",
  "                              <div className=\"col-span-2\">",
  "                                <p className=\"text-[9px] text-slate-400 uppercase\">Situação</p>",
  "                                <p className={`text-xs font-bold ${boletoData.situacao === 'LIQUIDADO' ? 'text-emerald-600' : 'text-amber-600'}`}>{boletoData.situacao}</p>",
  "                              </div>",
  "                            )}",
].join('\n');

const NEW_SIT = [
  "                            {(boletoData?.situacao || (order as any).boletSituacao) && (",
  "                              <div className=\"col-span-2\">",
  "                                <p className=\"text-[9px] text-slate-400 uppercase\">Situação</p>",
  "                                {(() => {",
  "                                  const sit = boletoData?.situacao || (order as any).boletSituacao || '';",
  "                                  const cor = sit === 'LIQUIDADO' ? 'text-emerald-600' : sit === 'VENCIDO' ? 'text-red-500' : 'text-amber-600';",
  "                                  const label = sit === 'LIQUIDADO' ? 'Pago' : sit === 'VENCIDO' ? 'Vencido' : sit === 'ENTRADA NORMAL' ? 'A Receber' : sit;",
  "                                  return <p className={cor + ' text-xs font-bold'}>{label}</p>;",
  "                                })()}",
  "                              </div>",
  "                            )}",
].join('\n');

if (!content.includes(OLD_SIT)) {
  console.error('ERRO: Trecho de situação não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_SIT, NEW_SIT);
console.log('OK: Exibição da situação corrigida (ENTRADA NORMAL → A Receber).');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nArquivo salvo. Execute: npx tsc --noEmit');