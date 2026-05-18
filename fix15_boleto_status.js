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

const OLD = '                                  <div><p className="text-[9px] text-slate-400 uppercase">Vencimento</p><p className="text-xs">{(b.dataVencimento||"").split("-").reverse().join("/")}</p></div>\n                                </div>';

const NEW = [
  '                                  <div><p className="text-[9px] text-slate-400 uppercase">Vencimento</p><p className="text-xs">{(b.dataVencimento||"").split("-").reverse().join("/")}</p></div>',
  '                                  <div className="col-span-2">',
  '                                    <p className="text-[9px] text-slate-400 uppercase">Situação</p>',
  '                                    {(() => { const sit = b.situacao || ""; const cor = sit === "LIQUIDADO" ? "text-emerald-600" : sit === "VENCIDO" ? "text-red-500" : "text-amber-600"; const label = sit === "LIQUIDADO" ? "Pago" : sit === "VENCIDO" ? "Vencido" : sit === "ENTRADA NORMAL" ? "A Receber" : sit || "-"; return <p className={cor + " text-xs font-bold"}>{label}</p>; })()}',
  '                                  </div>',
  '                                </div>',
].join('\n');

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado.'); process.exit(1);
}
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Status adicionado na lista de parcelas.');