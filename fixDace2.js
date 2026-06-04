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
  console.error('ERRO: route.ts nao encontrado. Rode de dentro da pasta Fluxia-next.');
  process.exit(1);
}
console.log('route.ts encontrado em:', routePath);

let lines = fs.readFileSync(routePath, 'utf8').split('\n');

// 1a. Adicionar export ao daceCache se necessario
const daceLine = lines.findIndex(l => l.includes('const daceCache = new Map'));
if (daceLine === -1) {
  console.error('ERRO: daceCache nao encontrado. Rode o fixDace.js primeiro.');
  process.exit(1);
}
if (!lines[daceLine].startsWith('export')) {
  lines[daceLine] = lines[daceLine].replace('const daceCache', 'export const daceCache');
  console.log('OK: daceCache exportado na linha', daceLine + 1);
} else {
  console.log('OK: daceCache ja exportado, pulando.');
}

// 1b. Encontrar o bloco DC-e antigo por linha ancora
const anchorLine = lines.findIndex(l => l.includes('const temNF = !!(order.invoiceKey'));
if (anchorLine === -1) {
  console.error('ERRO: Linha ancora temNF nao encontrada.');
  process.exit(1);
}
console.log('Linha ancora temNF encontrada na linha:', anchorLine + 1);

// Encontrar o fim do bloco (return data; antes do fechamento da funcao)
let endLine = -1;
for (let i = anchorLine; i < lines.length; i++) {
  if (lines[i].trim() === 'return data;') {
    endLine = i;
    break;
  }
}
if (endLine === -1) {
  console.error('ERRO: return data; nao encontrado apos o bloco DC-e.');
  process.exit(1);
}
console.log('Fim do bloco encontrado na linha:', endLine + 1);

// Verificar que o bloco contem o endpoint antigo
const blocoAtual = lines.slice(anchorLine, endLine + 1).join('\n');
if (!blocoAtual.includes('declaracaoconteudo')) {
  console.error('ERRO: Endpoint antigo nao encontrado no bloco. Bloco atual:\n', blocoAtual);
  process.exit(1);
}

// Novo bloco
const novoBloco = [
  '  const temNF = !!(order.invoiceKey && order.invoiceKey.length > 10);',
  '  console.log("[DC-e] invoiceKey:", JSON.stringify(order.invoiceKey), "temNF:", temNF, "invoiceLinked:", order.invoiceLinked);',
  '  if (!temNF) {',
  '    console.log(\'Sem NF \u2014 gerando DACE (Declaracao de Conteudo Eletronica)...\');',
  '    try {',
  '      const daceResponse = await fetch(\'https://api.correios.com.br/prepostagem/v1/prepostagens/dce/dace/impressao\', {',
  '        method: \'POST\',',
  '        headers: {',
  '          \'Authorization\': \'Bearer \' + token,',
  '          \'Content-Type\': \'application/json\',',
  '          \'Accept\': \'application/json\',',
  '          \'User-Agent\': \'CoffeeCRM (biolucas@gmail.com)\'',
  '        },',
  '        body: JSON.stringify({',
  '          idsPrePostagens: [prePostageId],',
  '          tipoDace: "R"',
  '        })',
  '      });',
  '      if (daceResponse.ok) {',
  '        const daceResult = await daceResponse.json();',
  '        const base64Dace = daceResult.dados;',
  '        if (base64Dace) {',
  '          daceCache.set(prePostageId, base64Dace);',
  '          setTimeout(() => daceCache.delete(prePostageId), 10 * 60 * 1000);',
  '          data.dceUrl = `/api/shipping/label/download?tipo=dce&token=${encodeURIComponent(prePostageId)}`;',
  '          console.log(\'DACE gerada com sucesso. dceUrl:\', data.dceUrl);',
  '        } else {',
  '          console.warn(\'DACE retornou sem dados base64:\', JSON.stringify(daceResult));',
  '        }',
  '      } else {',
  '        const daceError = await daceResponse.text();',
  '        console.error(\'Erro DACE:\', daceError);',
  '      }',
  '    } catch (daceErr) {',
  '      console.error(\'Erro ao gerar DACE:\', daceErr);',
  '    }',
  '  }',
  '  return data;',
];

// Substituir as linhas
lines.splice(anchorLine, endLine - anchorLine + 1, ...novoBloco);
console.log('OK: Bloco DC-e substituido pelo novo endpoint DACE.');

fs.writeFileSync(routePath, lines.join('\n'), 'utf8');
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
  console.error('ERRO: download/route.ts nao encontrado.');
  process.exit(1);
}
console.log('download/route.ts encontrado em:', downloadPath);

let dlLines = fs.readFileSync(downloadPath, 'utf8').split('\n');

// 2a. Adicionar import do daceCache apos o import do getCorreiosToken
if (!dlLines.some(l => l.includes('daceCache'))) {
  const importLine = dlLines.findIndex(l => l.includes('getCorreiosToken'));
  if (importLine === -1) {
    console.error('ERRO: Import getCorreiosToken nao encontrado no download/route.ts.');
    process.exit(1);
  }
  dlLines.splice(importLine + 1, 0, "import { daceCache } from '../route';");
  console.log('OK: Import do daceCache adicionado no download/route.ts.');
} else {
  console.log('OK: daceCache ja importado, pulando.');
}

// 2b. Adicionar handler especial da DACE antes do bloco "if (!idRecibo)"
if (!dlLines.some(l => l.includes('Handler especial para DACE'))) {
  const idReciboLine = dlLines.findIndex(l => l.trim() === 'if (!idRecibo) {');
  if (idReciboLine === -1) {
    console.error('ERRO: Linha "if (!idRecibo)" nao encontrada no download/route.ts.');
    process.exit(1);
  }

  const daceHandler = [
    '  // Handler especial para DACE \u2014 base64 ja em memoria, nao precisa de polling',
    "  if (tipo === 'dce') {",
    "    const token = searchParams.get('token');",
    '    if (!token) {',
    "      return NextResponse.json({ error: 'Token da DACE nao informado.' }, { status: 400 });",
    '    }',
    '    const base64Dace = daceCache.get(token);',
    '    if (!base64Dace) {',
    "      return NextResponse.json({ error: 'DACE nao encontrada ou expirada. Gere a etiqueta novamente.' }, { status: 404 });",
    '    }',
    "    const pdfBuffer = Buffer.from(base64Dace, 'base64');",
    '    return new Response(pdfBuffer, {',
    '      headers: {',
    "        'Content-Type': 'application/pdf',",
    '        \'Content-Disposition\': `attachment; filename="dace-${token}.pdf"`',
    '      }',
    '    });',
    '  }',
    '',
  ];

  dlLines.splice(idReciboLine, 0, ...daceHandler);
  console.log('OK: Handler especial da DACE adicionado no download/route.ts.');
} else {
  console.log('OK: Handler da DACE ja existe, pulando.');
}

fs.writeFileSync(downloadPath, dlLines.join('\n'), 'utf8');
console.log('OK: download/route.ts salvo.');

console.log('\nTudo pronto! Rode agora: npx tsc --noEmit');