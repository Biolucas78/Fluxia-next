const fs = require('fs');
const path = require('path');

const possibleRoots = ['.', path.join(process.env.HOME || '', 'Fluxia-next')];
let projectRoot = null;
for (const p of possibleRoots) {
  if (fs.existsSync(path.join(p, 'package.json'))) { projectRoot = p; break; }
}

const syncPath = path.join(projectRoot, 'app/api/sicoob/sincronizar/route.ts');
let content = fs.readFileSync(syncPath, 'utf8');

// Fix 1: adicionar codigoModalidade=1 na query
const OLD_PATH = `path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&nossoNumero=' + nossoNumero.trim(),`;
const NEW_PATH = `path: '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&codigoModalidade=1&nossoNumero=' + nossoNumero.trim(),`;
if (!content.includes(OLD_PATH)) { console.error('ERRO: path não encontrado.'); process.exit(1); }
content = content.replace(OLD_PATH, NEW_PATH);
console.log('OK: codigoModalidade adicionado.');

// Fix 2: corrigir verificação de status
const OLD_STATUS = `          const situacao = boleto.codigoSituacaoBoleto;
          if (situacao === 6 || situacao === 9) {`;
const NEW_STATUS = `          const situacao = boleto.situacaoBoleto;
          if (situacao === 'Liquidado' || situacao === 'Baixado' || situacao === 'Pago') {`;
if (!content.includes(OLD_STATUS)) { console.error('ERRO: status não encontrado.'); process.exit(1); }
content = content.replace(OLD_STATUS, NEW_STATUS);
console.log('OK: verificação de status corrigida.');

// Fix 3: corrigir acesso ao resultado (é objeto, não array)
const OLD_RESULT = `          const boleto = result.body?.resultado?.[0] || result.body?.resultado;`;
const NEW_RESULT = `          const boleto = result.body?.resultado;`;
if (!content.includes(OLD_RESULT)) { console.error('ERRO: resultado não encontrado.'); process.exit(1); }
content = content.replace(OLD_RESULT, NEW_RESULT);
console.log('OK: acesso ao resultado corrigido.');

fs.writeFileSync(syncPath, content, 'utf8');
console.log('OK: Rota sincronizar corrigida.');