const fs = require('fs');
const path = require('path');

// ── 1. Criar a rota /api/check-lock ──────────────────────────────────────────
const routeDir = fs.existsSync('app/api') ? 'app/api/check-lock' :
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/check-lock');

fs.mkdirSync(routeDir, { recursive: true });

const routeContent = `import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { type, value, orderId } = await request.json();
    if (!type || !value) return NextResponse.json({ locked: false });

    const collection = 'orders';
    let snapshot;

    if (type === 'nf') {
      snapshot = await adminDb.collection(collection)
        .where('invoiceNumber', '==', String(value))
        .where('invoiceLinked', '==', true)
        .limit(5)
        .get();
    } else if (type === 'boleto') {
      snapshot = await adminDb.collection(collection)
        .where('boletoNossoNumero', '==', String(value))
        .where('boletoLinked', '==', true)
        .limit(5)
        .get();
    } else {
      return NextResponse.json({ locked: false });
    }

    if (snapshot.empty) return NextResponse.json({ locked: false });

    const others = snapshot.docs.filter((doc: any) => doc.id !== orderId);
    if (others.length === 0) return NextResponse.json({ locked: false });

    const other = others[0].data();
    return NextResponse.json({
      locked: true,
      lockedBy: {
        orderId: others[0].id,
        clientName: other.clientName || 'Cliente desconhecido',
        invoiceNumber: other.invoiceNumber || '',
      }
    });
  } catch (error: any) {
    console.error('[check-lock] Erro:', error);
    return NextResponse.json({ locked: false });
  }
}
`;

fs.writeFileSync(path.join(routeDir, 'route.ts'), routeContent, 'utf8');
console.log('OK: Rota /api/check-lock criada em', routeDir);

// ── 2. Modificar o modal — verificar lock antes de confirmar NF ───────────────
const modalPaths = [
  'components/OrderDetailsModal.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderDetailsModal.tsx'),
];
let modalPath = null;
for (const p of modalPaths) {
  if (fs.existsSync(p)) { modalPath = p; break; }
}
if (!modalPath) { console.error('ERRO: Modal não encontrado.'); process.exit(1); }

let content = fs.readFileSync(modalPath, 'utf8');

// Substituir o onClick de confirmar NF para verificar lock antes
const OLD_NF_CONFIRM = [
  '                              <button onClick={() => {',
  '                                onUpdateOrder({ ...order, hasInvoice: true, invoiceLinked: true, invoiceKey: pendingInvoice.invoiceKey||\'\',' +
  ' invoiceNumber: pendingInvoice.invoiceNumber||\'\',' +
  ' invoiceValue: pendingInvoice.invoiceValue,' +
  ' statusHistory: [...(order.statusHistory||[]), { action: \'Nota Fiscal vinculada e confirmada\',' +
  ' details: `NF: ${pendingInvoice.invoiceNumber} | Valor: ${pendingInvoice.invoiceValue}`, timestamp: new Date().toISOString() }] } as any);',
  '                                setManualInvoiceKey(pendingInvoice.invoiceKey||\'\''+
  '); setManualInvoiceNumber(pendingInvoice.invoiceNumber||\'\''+
  '); setManualInvoiceValue(pendingInvoice.invoiceValue||\'\');',
  '                                setPendingInvoice(null); setNfList([]);',
  '                                toast.success(\'Nota Fiscal vinculada com sucesso!\');',
  '                              }} className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1">',
  '                                <CheckCircle2 className="size-3" /> Confirmar',
  '                              </button>',
].join('\n');

const NEW_NF_CONFIRM = [
  '                              <button onClick={async () => {',
  '                                // Verificar se NF já está vinculada a outro pedido',
  '                                try {',
  '                                  const lockRes = await fetch(\'/api/check-lock\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ type: \'nf\', value: pendingInvoice.invoiceNumber, orderId: order.id }) });',
  '                                  const lockData = await lockRes.json();',
  '                                  if (lockData.locked) {',
  '                                    toast.error(`NF ${pendingInvoice.invoiceNumber} já está vinculada ao pedido de ${lockData.lockedBy?.clientName || \'outro cliente\'}.`);',
  '                                    return;',
  '                                  }',
  '                                } catch (e) { /* fail open */ }',
  '                                onUpdateOrder({ ...order, hasInvoice: true, invoiceLinked: true, invoiceKey: pendingInvoice.invoiceKey||\'\', invoiceNumber: pendingInvoice.invoiceNumber||\'\', invoiceValue: pendingInvoice.invoiceValue, statusHistory: [...(order.statusHistory||[]), { action: \'Nota Fiscal vinculada e confirmada\', details: `NF: ${pendingInvoice.invoiceNumber} | Valor: ${pendingInvoice.invoiceValue}`, timestamp: new Date().toISOString() }] } as any);',
  '                                setManualInvoiceKey(pendingInvoice.invoiceKey||\'\'); setManualInvoiceNumber(pendingInvoice.invoiceNumber||\'\'); setManualInvoiceValue(pendingInvoice.invoiceValue||\'\');',
  '                                setPendingInvoice(null); setNfList([]);',
  '                                toast.success(\'Nota Fiscal vinculada com sucesso!\');',
  '                              }} className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1">',
  '                                <CheckCircle2 className="size-3" /> Confirmar',
  '                              </button>',
].join('\n');

if (!content.includes(OLD_NF_CONFIRM)) {
  console.error('ERRO: Botão confirmar NF não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_NF_CONFIRM, NEW_NF_CONFIRM);
console.log('OK: Verificação de lock adicionada ao confirmar NF.');

// ── 3. Verificar lock antes de confirmar Boleto ───────────────────────────────
const OLD_BOLETO_CONFIRM = [
  '                            <button onClick={() => {',
  '                              onUpdateOrder({ ...order, hasBoleto: true, boletoLinked: true, boletoNossoNumero: String(pendingBoleto.nossoNumero||\'\'), invoiceNumber: String(pendingBoleto.seuNumero||\'\'), invoiceValue: pendingBoleto.valor, paymentDueDate: pendingBoleto.dataVencimento||\'\', paymentDate: pendingBoleto.dataEmissao||\'\', boletSituacao: pendingBoleto.situacaoBoleto||\'\', statusHistory: [...(order.statusHistory||[]), { action: \'Boleto vinculado e confirmado\', details: `NF: ${pendingBoleto.seuNumero} | NossoNumero: ${pendingBoleto.nossoNumero}`, timestamp: new Date().toISOString() }] } as any);',
  '                              setBoletoData({ nossoNumero: String(pendingBoleto.nossoNumero||\'\'), seuNumero: String(pendingBoleto.seuNumero||\'\'), valor: pendingBoleto.valor||0, dataEmissao: pendingBoleto.dataEmissao||\'\', dataVencimento: pendingBoleto.dataVencimento||\'\', situacao: pendingBoleto.situacaoBoleto||\'\' });',
  '                              setPendingBoleto(null); setBoletosList([]);',
  '                              toast.success(\'Boleto vinculado com sucesso!\');',
  '                            }} className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1">',
  '                              <CheckCircle2 className="size-3" /> Confirmar',
  '                            </button>',
].join('\n');

const NEW_BOLETO_CONFIRM = [
  '                            <button onClick={async () => {',
  '                              // Verificar se boleto já está vinculado a outro pedido',
  '                              try {',
  '                                const lockRes = await fetch(\'/api/check-lock\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ type: \'boleto\', value: String(pendingBoleto.nossoNumero||\'\'), orderId: order.id }) });',
  '                                const lockData = await lockRes.json();',
  '                                if (lockData.locked) {',
  '                                  toast.error(`Boleto NF ${pendingBoleto.seuNumero} já está vinculado ao pedido de ${lockData.lockedBy?.clientName || \'outro cliente\'}.`);',
  '                                  return;',
  '                                }',
  '                              } catch (e) { /* fail open */ }',
  '                              onUpdateOrder({ ...order, hasBoleto: true, boletoLinked: true, boletoNossoNumero: String(pendingBoleto.nossoNumero||\'\'), invoiceNumber: String(pendingBoleto.seuNumero||\'\'), invoiceValue: pendingBoleto.valor, paymentDueDate: pendingBoleto.dataVencimento||\'\', paymentDate: pendingBoleto.dataEmissao||\'\', boletSituacao: pendingBoleto.situacaoBoleto||\'\', statusHistory: [...(order.statusHistory||[]), { action: \'Boleto vinculado e confirmado\', details: `NF: ${pendingBoleto.seuNumero} | NossoNumero: ${pendingBoleto.nossoNumero}`, timestamp: new Date().toISOString() }] } as any);',
  '                              setBoletoData({ nossoNumero: String(pendingBoleto.nossoNumero||\'\'), seuNumero: String(pendingBoleto.seuNumero||\'\'), valor: pendingBoleto.valor||0, dataEmissao: pendingBoleto.dataEmissao||\'\', dataVencimento: pendingBoleto.dataVencimento||\'\', situacao: pendingBoleto.situacaoBoleto||\'\' });',
  '                              setPendingBoleto(null); setBoletosList([]);',
  '                              toast.success(\'Boleto vinculado com sucesso!\');',
  '                            }} className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1">',
  '                              <CheckCircle2 className="size-3" /> Confirmar',
  '                            </button>',
].join('\n');

if (!content.includes(OLD_BOLETO_CONFIRM)) {
  console.error('ERRO: Botão confirmar Boleto não encontrado.');
  process.exit(1);
}
content = content.replace(OLD_BOLETO_CONFIRM, NEW_BOLETO_CONFIRM);
console.log('OK: Verificação de lock adicionada ao confirmar Boleto.');

fs.writeFileSync(modalPath, content, 'utf8');
console.log('\nArquivos salvos. Execute: npx tsc --noEmit');