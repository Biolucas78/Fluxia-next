const fs = require('fs');

const paths = [
  'app/api/shipping/label/route.ts',
  require('path').join(process.env.HOME || '', 'Fluxia-next/app/api/shipping/label/route.ts'),
];
let filePath = null;
for (const p of paths) { if (fs.existsSync(p)) { filePath = p; break; } }
if (!filePath) { console.error('ERRO: arquivo nao encontrado.'); process.exit(1); }

let content = fs.readFileSync(filePath, 'utf8');

const OLD = `      return NextResponse.json({ 
          success: true, 
          labelUrl: labelUrl,
          trackingNumber: labelData.codigoObjeto,
          idRecibo: labelData.idRecibo
      });`;

const NEW = `      return NextResponse.json({ 
          success: true, 
          labelUrl: labelUrl,
          dceUrl: labelData.dceUrl || null,
          trackingNumber: labelData.codigoObjeto,
          idRecibo: labelData.idRecibo
      });`;

if (!content.includes(OLD)) {
  console.error('ERRO: trecho nao encontrado. Me mande essa mensagem.');
  process.exit(1);
}

content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: dceUrl adicionado no return do Correios.');