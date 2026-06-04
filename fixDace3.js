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
if (!routePath) { console.error('ERRO: route.ts nao encontrado.'); process.exit(1); }
console.log('route.ts encontrado em:', routePath);

let lines = fs.readFileSync(routePath, 'utf8').split('\n');

// 1a. Adicionar Map global antes de "async function generateCorreiosLabel"
const fnLine = lines.findIndex(l => l.startsWith('async function generateCorreiosLabel('));
if (fnLine === -1) { console.error('ERRO: generateCorreiosLabel nao encontrada.'); process.exit(1); }

if (!lines.some(l => l.includes('daceCache'))) {
  lines.splice(fnLine, 0,
    '// Map global para armazenar base64 da DACE temporariamente',
    'export const daceCache = new Map();',
    ''
  );
  console.log('OK: daceCache adicionado na linha', fnLine + 1);
} else {
  // Garantir que esta exportado
  const di = lines.findIndex(l => l.includes('daceCache = new Map'));
  if (di !== -1 && !lines[di].startsWith('export')) {
    lines[di] = lines[di].replace('const daceCache', 'export const daceCache');
    console.log('OK: daceCache exportado.');
  } else {
    console.log('OK: daceCache ja existe e esta exportado, pulando.');
  }
}

// 1b. Encontrar e substituir o bloco DC-e antigo
const anchorLine = lines.findIndex(l => l.includes('const temNF = !!(order.invoiceKey'));
if (anchorLine === -1) { console.error('ERRO: Linha temNF nao encontrada.'); process.exit(1); }
console.log('Ancora temNF na linha:', anchorLine + 1);

// Encontrar "return data;" apos a ancora
let endLine = -1;
for (let i = anchorLine; i < Math.min(anchorLine + 50, lines.length); i++) {
  if (lines[i].trim() === 'return data;') { endLine = i; break; }
}
if (endLine === -1) { console.error('ERRO: return data; nao encontrado.'); process.exit(1); }
console.log('return data; na linha:', endLine + 1);

// Verificar que e o bloco antigo
const bloco = lines.slice(anchorLine, endLine + 1).join('\n');
if (!bloco.includes('declaracaoconteudo') && bloco.includes('daceCache')) {
  console.log('OK: Bloco ja foi atualizado, pulando substituicao.');
} else if (!bloco.includes('declaracaoconteudo')) {
  console.error('ERRO: Endpoint antigo nao encontrado. Bloco atual:\n' + bloco);
  process.exit(1);
} else {
  // Substituir
  const novoBloco = [
    '  const temNF = !!(order.invoiceKey && order.invoiceKey.length > 10);',
    '  console.log("[DC-e] invoiceKey:", JSON.stringify(order.invoiceKey), "temNF:", temNF, "invoiceLinked:", order.invoiceLinked);',
    '  if (!temNF) {',
    "    console.log('Sem NF - gerando DACE (Declaracao de Conteudo Eletronica)...');",
    '    try {',
    "      const daceResponse = await fetch('https://api.correios.com.br/prepostagem/v1/prepostagens/dce/dace/impressao', {",
    "        method: 'POST',",
    '        headers: {',
    "          'Authorization': 'Bearer ' + token,",
    "          'Content-Type': 'application/json',",
    "          'Accept': 'application/json',",
    "          'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'",
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
    "          console.log('DACE gerada com sucesso. dceUrl:', data.dceUrl);",
    '        } else {',
    "          console.warn('DACE retornou sem dados base64:', JSON.stringify(daceResult));",
    '        }',
    '      } else {',
    '        const daceError = await daceResponse.text();',
    "        console.error('Erro DACE:', daceError);",
    '      }',
    '    } catch (daceErr) {',
    "      console.error('Erro ao gerar DACE:', daceErr);",
    '    }',
    '  }',
    '  return data;',
  ];
  lines.splice(anchorLine, endLine - anchorLine + 1, ...novoBloco);
  console.log('OK: Bloco DC-e substituido pelo novo endpoint DACE.');
}

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
if (!downloadPath) { console.error('ERRO: download/route.ts nao encontrado.'); process.exit(1); }
console.log('download/route.ts encontrado em:', downloadPath);

let dlLines = fs.readFileSync(downloadPath, 'utf8').split('\n');

// 2a. Adicionar import do daceCache
if (!dlLines.some(l => l.includes('daceCache'))) {
  const importLine = dlLines.findIndex(l => l.includes('getCorreiosToken'));
  if (importLine === -1) { console.error('ERRO: Import getCorreiosToken nao encontrado.'); process.exit(1); }
  dlLines.splice(importLine + 1, 0, "import { daceCache } from '../route';");
  console.log('OK: Import do daceCache adicionado.');
} else {
  console.log('OK: daceCache ja importado, pulando.');
}

// 2b. Adicionar handler DACE antes de "if (!idRecibo)"
if (!dlLines.some(l => l.includes('Handler especial para DACE'))) {
  const idReciboLine = dlLines.findIndex(l => l.trim() === 'if (!idRecibo) {');
  if (idReciboLine === -1) { console.error('ERRO: if (!idRecibo) nao encontrado.'); process.exit(1); }

  const daceHandler = [
    "  // Handler especial para DACE - base64 ja em memoria",
    "  if (tipo === 'dce') {",
    "    const token = searchParams.get('token');",
    '    if (!token) {',
    "      return NextResponse.json({ error: 'Token da DACE nao informado.' }, { status: 400 });",
    '    }',
    '    const base64Dace = daceCache.get(token);',
    '    if (!base64Dace) {',
    "      return NextResponse.json({ error: 'DACE nao encontrada ou expirada.' }, { status: 404 });",
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
  console.log('OK: Handler DACE adicionado no download/route.ts.');
} else {
  console.log('OK: Handler DACE ja existe, pulando.');
}

fs.writeFileSync(downloadPath, dlLines.join('\n'), 'utf8');
console.log('OK: download/route.ts salvo.');

console.log('\nTudo pronto! Rode agora: npx tsc --noEmit');