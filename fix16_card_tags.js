const fs = require('fs');
const path = require('path');

const possiblePaths = [
  'components/OrderCard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/OrderCard.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) { console.error('ERRO: OrderCard.tsx não encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = [
  '          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700 truncate w-full text-right" title={locationInfo}>',
  '            {locationInfo}',
  '          </span>',
  '        </div>',
  '      )}',
].join('\n');

const NEW = [
  '          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700 truncate w-full text-right" title={locationInfo}>',
  '            {locationInfo}',
  '          </span>',
  '          {((order as any).invoiceLinked || (order as any).boletoLinked) && (',
  '            <div className="flex gap-0.5 justify-end">',
  '              {(order as any).invoiceLinked && (',
  '                <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-1 py-0.5 rounded-md" title="Nota Fiscal vinculada">N</span>',
  '              )}',
  '              {(order as any).boletoLinked && (',
  '                <span className="text-[8px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-md" title="Boleto vinculado">B</span>',
  '              )}',
  '            </div>',
  '          )}',
  '        </div>',
  '      )}',
].join('\n');

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado.'); process.exit(1);
}
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Tags N e B adicionadas no card do Kanban.');