const fs = require('fs');
const path = require('path');

// ─── Arquivo 1: route.ts ───────────────────────────────────────────────────

const routePaths = [
  'app/api/shipping/label/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/shipping/label/route.ts'),
];
let routePath = null;
for (const p of routePaths) {
  if (fs.existsSync(p)) { routePath = p; break; }
}
if (!routePath) {
  console.error('ERRO: route.ts não encontrado. Rode de dentro da pasta Fluxia-next.');
  process.exit(1);
}
console.log('route.ts encontrado em:', routePath);

let routeContent = fs.readFileSync(routePath, 'utf8');

// 1a. Adicionar Map global após os imports/consts do topo
const OLD_MAP = `async function generateCorreiosLabel(`;
const NEW_MAP = `// Map global para armazenar base64 da DACE temporariamente
const daceCache = new Map<string, string>();

async function generateCorreiosLabel(`;

if (!routeContent.includes('daceCache')) {
  if (!routeContent.includes(OLD_MAP)) {
    console.error('ERRO: Trecho do Map não encontrado. Me mande essa mensagem para investigar.');
    process.exit(1);
  }
  routeContent = routeContent.replace(OLD_MAP, NEW_MAP);
  console.log('OK: Map global daceCache adicionado.');
} else {
  console.log('OK: daceCache já existe, pulando.');
}

// 1b. Substituir o bloco DC-e antigo pelo novo
const OLD_DCE = `  const temNF = !!(order.invoiceKey && order.invoiceKey.length > 10);
  console.log("[DC-e] invoiceKey:", JSON.stringify(order.invoiceKey), "temNF:", temNF, "invoiceLinked:", order.invoiceLinked);
  if (!temNF) {
    console.log('Sem NF — gerando Declaracao de Conteudo...');
    try {
      const dceRequest = {
        idCorreios: CORREIOS_USER?.replace(/\\D/g, ''),
        numeroCartaoPostagem: CORREIOS_CARD?.replace(/\\D/g, ''),
        idsPrePostagem: [prePostageId],
        layoutImpressao: "PADRAO"
      };
      const dceResponse = await fetch(\`https://api.correios.com.br/prepostagem/v1/prepostagens/\${prePostageId}/declaracaoconteudo\`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
        },
        body: JSON.stringify({ layoutImpressao: 'PADRAO' })
      });
      if (dceResponse.ok) {
        const dceResult = await dceResponse.json();
        data.idReciboDce = dceResult.idRecibo;
        console.log('DC-e solicitada. Recibo: ' + data.idReciboDce);
      } else {
        const dceError = await dceResponse.text();
        console.error('Erro DC-e:', dceError);
      }
    } catch (dceErr) {
      console.error('Erro ao gerar DC-e:', dceErr);
    }
  }
  return data;`;

const NEW_DCE = `  const temNF = !!(order.invoiceKey && order.invoiceKey.length > 10);
  console.log("[DC-e] invoiceKey:", JSON.stringify(order.invoiceKey), "temNF:", temNF, "invoiceLinked:", order.invoiceLinked);
  if (!temNF) {
    console.log('Sem NF — gerando DACE (Declaracao de Conteudo Eletronica)...');
    try {
      const daceResponse = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens/dce/dace/impressao', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
        },
        body: JSON.stringify({
          idsPrePostagens: [prePostageId],
          tipoDace: "R"
        })
      });
      if (daceResponse.ok) {
        const daceResult = await daceResponse.json();
        const base64Dace = daceResult.dados;
        if (base64Dace) {
          // Armazenar base64 no cache com chave = prePostageId
          daceCache.set(prePostageId, base64Dace);
          // Limpar do cache após 10 minutos
          setTimeout(() => daceCache.delete(prePostageId), 10 * 60 * 1000);
          data.dceUrl = \`/api/shipping/label/download?tipo=dce&token=\${encodeURIComponent(prePostageId)}\`;
          console.log('DACE gerada com sucesso. dceUrl:', data.dceUrl);
        } else {
          console.warn('DACE retornou sem dados base64:', JSON.stringify(daceResult));
        }
      } else {
        const daceError = await daceResponse.text();
        console.error('Erro DACE:', daceError);
      }
    } catch (daceErr) {
      console.error('Erro ao gerar DACE:', daceErr);
    }
  }
  return data;`;

if (!routeContent.includes(OLD_DCE)) {
  console.error('ERRO: Bloco DC-e antigo não encontrado. Me mande essa mensagem para investigar.');
  process.exit(1);
}
routeContent = routeContent.replace(OLD_DCE, NEW_DCE);
console.log('OK: Bloco DC-e substituído pelo novo endpoint DACE.');

fs.writeFileSync(routePath, routeContent, 'utf8');
console.log('OK: route.ts salvo.');

// ─── Arquivo 2: download/route.ts ─────────────────────────────────────────

const downloadPaths = [
  'app/api/shipping/label/download/route.ts',
  path.join(process.env.HOME || '', 'Fluxia-next/app/api/shipping/label/download/route.ts'),
];
let downloadPath = null;
for (const p of downloadPaths) {
  if (fs.existsSync(p)) { downloadPath = p; break; }
}
if (!downloadPath) {
  console.error('ERRO: download/route.ts não encontrado.');
  process.exit(1);
}
console.log('download/route.ts encontrado em:', downloadPath);

let downloadContent = fs.readFileSync(downloadPath, 'utf8');

// Substituir o import e adicionar import do daceCache + handler especial
const OLD_IMPORT = `import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';`;

const NEW_IMPORT = `import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';
// Importar o cache de DACE do route principal
import { daceCache } from '../route';`;

// Verificar se daceCache não é exportado ainda — precisamos exportar do route.ts
// Vamos checar e ajustar

// Primeiro: exportar daceCache no route.ts
let routeContent2 = fs.readFileSync(routePath, 'utf8');
const OLD_EXPORT = `// Map global para armazenar base64 da DACE temporariamente
const daceCache = new Map<string, string>();`;
const NEW_EXPORT = `// Map global para armazenar base64 da DACE temporariamente
export const daceCache = new Map<string, string>();`;

if (routeContent2.includes(OLD_EXPORT)) {
  routeContent2 = routeContent2.replace(OLD_EXPORT, NEW_EXPORT);
  fs.writeFileSync(routePath, routeContent2, 'utf8');
  console.log('OK: daceCache exportado no route.ts.');
} else if (routeContent2.includes(NEW_EXPORT)) {
  console.log('OK: daceCache já exportado.');
} else {
  console.error('ERRO: Não encontrei o Map daceCache para exportar. Me mande essa mensagem.');
  process.exit(1);
}

// Agora adicionar import e handler no download/route.ts
const OLD_DOWNLOAD_IMPORT = `import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';`;

const NEW_DOWNLOAD_IMPORT = `import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';
import { daceCache } from '../route';`;

if (!downloadContent.includes('daceCache')) {
  if (!downloadContent.includes(OLD_DOWNLOAD_IMPORT)) {
    console.error('ERRO: Import do download/route.ts diferente do esperado. Me mande essa mensagem.');
    process.exit(1);
  }
  downloadContent = downloadContent.replace(OLD_DOWNLOAD_IMPORT, NEW_DOWNLOAD_IMPORT);
  console.log('OK: Import do daceCache adicionado no download/route.ts.');
} else {
  console.log('OK: daceCache já importado no download/route.ts, pulando.');
}

// Adicionar handler especial para DACE antes do try principal
const OLD_HANDLER_START = `  if (!idRecibo) {
    return NextResponse.json({ error: 'ID do recibo não informado.' }, { status: 400 });
  }

  try {`;

const NEW_HANDLER_START = `  // Handler especial para DACE — base64 já em memória, não precisa de polling
  if (tipo === 'dce') {
    const token = searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token da DACE não informado.' }, { status: 400 });
    }
    const base64Dace = daceCache.get(token);
    if (!base64Dace) {
      return NextResponse.json({ error: 'DACE não encontrada ou expirada. Gere a etiqueta novamente.' }, { status: 404 });
    }
    const pdfBuffer = Buffer.from(base64Dace, 'base64');
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': \`attachment; filename="dace-\${token}.pdf"\`
      }
    });
  }

  if (!idRecibo) {
    return NextResponse.json({ error: 'ID do recibo não informado.' }, { status: 400 });
  }

  try {`;

if (!downloadContent.includes('Handler especial para DACE')) {
  if (!downloadContent.includes(OLD_HANDLER_START)) {
    console.error('ERRO: Trecho do handler não encontrado no download/route.ts. Me mande essa mensagem.');
    process.exit(1);
  }
  downloadContent = downloadContent.replace(OLD_HANDLER_START, NEW_HANDLER_START);
  console.log('OK: Handler especial da DACE adicionado no download/route.ts.');
} else {
  console.log('OK: Handler da DACE já existe, pulando.');
}

fs.writeFileSync(downloadPath, downloadContent, 'utf8');
console.log('OK: download/route.ts salvo.');

console.log('\n✅ Tudo pronto! Rode agora: npx tsc --noEmit');