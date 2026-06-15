import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require('bwip-js') as {
  toBuffer(opts: Record<string, unknown>): Promise<Buffer>;
};

// ── Dimensões da etiqueta ──────────────────────────────────────────────────
// 10 × 15 cm em pontos (72 pt = 1 polegada = 25.4 mm)
const W    = (100 / 25.4) * 72;             // ≈ 283.46 pt
const H    = (150 / 25.4) * 72;             // ≈ 425.20 pt
const M    = Math.round((8 / 25.4) * 72);   // 8 mm margem horizontal/vertical ≈ 23 pt
const iW   = W - 2 * M;                     // largura interna ≈ 238 pt

// ── Separadores de seção (Y do fundo para cima) ───────────────────────────
const SEP1 = 70;   // abaixo da seção Pedido
const SEP2 = 158;  // abaixo da seção AWB
const SEP3 = 245;  // abaixo da seção CEP+DM+Rota

// ── Cores ─────────────────────────────────────────────────────────────────
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

// ── Meses em português ────────────────────────────────────────────────────
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── Sanitiza texto para StandardFonts (WinAnsiEncoding sem diacríticos) ───
const san = (s: string, max: number) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, max);

/** Retorna data de hoje no formato "12/Jun" */
export function todayShipDate(): string {
  const d = new Date();
  return `${d.getDate()}/${MESES[d.getMonth()]}`;
}

async function code128(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'code128', text, scale: 3, height: 18, includetext: false, padding: 2 });
}
async function dataMatrix(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'datamatrix', text, scale: 4, padding: 3 });
}

export interface TexLabelParams {
  awb: string;
  rota: string;
  serviceCode: string;    // 'EXP', 'STD', etc.
  orderNumber: string;    // NF / PED / TP — zeros à esquerda removidos no barcode
  destCep: string;
  // Remetente
  senderName: string;
  senderStreet: string;    // ex: "Rod BR 267, S/N Km 333"
  senderDistrict: string;  // ex: "Fazenda Itaoca - Zona Rural"
  senderCity: string;
  senderState: string;
  senderCep: string;
  senderCnpj: string;
  // Destinatário
  recipientName: string;
  recipientStreet: string;
  recipientNumber: string;
  recipientComplement: string;
  recipientDistrict: string;
  recipientCity: string;
  recipientState: string;
  // Tabela de informações
  volumes: number;
  weightKg: number;
  shipDate: string;  // ex: "12/Jun"
}

export async function generateTexLabelPdf(p: TexLabelParams): Promise<Buffer> {
  // Remove zeros à esquerda do número do pedido (padrão TEX)
  const pedidoText = san(p.orderNumber, 20).replace(/^0+/, '') || san(p.orderNumber, 20);
  const cepFmt     = p.destCep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const sndCepFmt  = (p.senderCep || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const nfNum      = pedidoText;

  // 1. Gerar todos os barcodes em paralelo
  const [awbPng, cepPng, pedidoPng, dmPng] = await Promise.all([
    code128(p.awb),
    code128(p.destCep),
    code128(pedidoText),
    dataMatrix(p.awb),
  ]);

  // 2. Criar PDF
  const pdfDoc  = await PDFDocument.create();
  const page    = pdfDoc.addPage([W, H]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const awbImg    = await pdfDoc.embedPng(awbPng);
  const cepImg    = await pdfDoc.embedPng(cepPng);
  const pedidoImg = await pdfDoc.embedPng(pedidoPng);
  const dmImg     = await pdfDoc.embedPng(dmPng);

  // Helpers
  const sep = (y: number, thick = 0.75) =>
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: thick, color: BLACK });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (s: string, x: number, y: number, sz: number, f = regular, col: any = BLACK) =>
    page.drawText(san(s, 200), { x, y, size: sz, font: f, color: col });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEÇÃO 4 — Pedido (y: 0 → SEP1=70)
  // Barcode: 4 cm de largura, centralizado; texto sempre preto
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pedidoBW = Math.round((40 / 25.4) * 72);               // 4 cm ≈ 113 pt
  const pedidoX  = M + Math.round((iW - pedidoBW) / 2);        // centralizado
  page.drawImage(pedidoImg, { x: pedidoX, y: 30, width: pedidoBW, height: 32 });
  t(pedidoText, W / 2 - pedidoText.length * 2.5, M, 7, regular, BLACK);

  sep(SEP1);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEÇÃO 3 — AWB (y: SEP1=70 → SEP2=158)
  // Barcode: largura interna completa (iW ≈ 238 pt ≈ 8,4 cm)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  page.drawImage(awbImg, { x: M, y: 82, width: iW, height: 64 });
  t(p.awb, W / 2 - p.awb.length * 3, 73, 8, bold);

  sep(SEP2);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEÇÃO 2 — CEP barcode + Data Matrix + Rota (y: SEP2=158 → SEP3=245)
  //
  // Layout (y cresce para cima):
  //   [y 188-238] CEP barcode (5 cm, esq.)  [y 186-234] Data Matrix (dir.)
  //   [y 163-183] Rota box 6 cm (dir.)      [y 167] CEP texto (esq.)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const dmSz  = 48;
  const cepBW = Math.round((50 / 25.4) * 72);  // 5 cm ≈ 141 pt
  const dmX   = W - M - dmSz;                  // Data Matrix: canto direito

  // CEP barcode (esquerda)
  page.drawImage(cepImg, { x: M, y: 188, width: cepBW, height: 50 });
  // Data Matrix (direita)
  page.drawImage(dmImg,  { x: dmX, y: 186, width: dmSz, height: dmSz });

  // Rota: caixa 6 cm no lado direito, fonte 12 pt
  const rotaBoxW = Math.round((60 / 25.4) * 72);  // 6 cm ≈ 170 pt
  const rotaBoxX = W - M - rotaBoxW;               // alinhado à margem direita
  const rotaBoxY = 163;
  page.drawRectangle({ x: rotaBoxX, y: rotaBoxY, width: rotaBoxW, height: 20, borderColor: BLACK, borderWidth: 1.2 });
  const rotaClean = san(p.rota, 40);
  const rotaTxtX  = rotaBoxX + rotaBoxW / 2 - rotaClean.length * 3.5;
  t(p.rota, Math.max(rotaBoxX + 3, rotaTxtX), rotaBoxY + 4, 13, bold);

  // CEP em caixa preta alinhada com a caixa da Rota (mesma linha, lado esquerdo)
  const cepBoxW = 92;
  page.drawRectangle({ x: M, y: rotaBoxY, width: cepBoxW, height: 20, color: BLACK, borderColor: BLACK, borderWidth: 1.2 });
  t(cepFmt, M + 8, rotaBoxY + 5, 10, bold, WHITE);

  sep(SEP3);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEÇÃO 1 — Cabeçalho com informações (y: SEP3=245 → H=425)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const TOP_BAR_Y = Math.round(H - M - 18);  // respeita margem superior ≈ 384

  // ── Coluna direita: caixa EXP + tabela de informações ─────
  const rightColX  = Math.round(W - M - 80);  // ≈ 180
  const rightColW  = 80;
  const labelColW  = 32;
  const valueColW  = rightColW - labelColW;    // 48 pt

  // Caixa do código de serviço (EXP)
  const expBoxY = TOP_BAR_Y - 24;             // ≈ 383
  page.drawRectangle({ x: rightColX, y: expBoxY, width: rightColW, height: 24, borderColor: BLACK, borderWidth: 2 });
  const expTxtX = Math.max(rightColX + 3, rightColX + rightColW / 2 - p.serviceCode.length * 5.5);
  t(p.serviceCode, expTxtX, expBoxY + 6, 16, bold);

  // Tabela NF / PED / VOL / TP / DT / KG / PEÇA
  const tableRows = [
    { label: 'NF',   value: nfNum },
    { label: 'PED',  value: nfNum },
    { label: 'VOL',  value: String(p.volumes || 1) },
    { label: 'TP',   value: nfNum },
    { label: 'DT',   value: san(p.shipDate, 10) },
    { label: 'KG',   value: p.weightKg.toFixed(3) },
    { label: 'PECA', value: `1/${p.volumes || 1}` },
  ];
  const rowH = 13;

  tableRows.forEach((row, i) => {
    const rowY = expBoxY - (i + 1) * rowH;
    // Célula label: fundo preto
    page.drawRectangle({ x: rightColX, y: rowY, width: labelColW, height: rowH, color: BLACK, borderColor: BLACK, borderWidth: 0.3 });
    // Célula valor: borda somente
    page.drawRectangle({ x: rightColX + labelColW, y: rowY, width: valueColW, height: rowH, borderColor: BLACK, borderWidth: 0.3 });
    t(row.label, rightColX + 2, rowY + 2, 8, bold, WHITE);
    t(row.value, rightColX + labelColW + 3, rowY + 3, 7, regular); // valores mantêm 7 pt
  });

  // ── Coluna esquerda: remetente + destinatário ──────────────
  let ly = Math.round(H - M - 6);  // começa dentro da margem superior

  t('REMETENTE:', M, ly, 7, bold);
  ly -= 11;

  const sName = san(p.senderName, 33).toUpperCase();
  if (sName) { t(sName, M, ly, 7.5, bold); ly -= 10; }

  const sStreet = san(p.senderStreet, 36);
  if (sStreet) { t(sStreet, M, ly, 7, regular); ly -= 10; }

  const sDist = san(p.senderDistrict, 36);
  if (sDist) { t(sDist, M, ly, 7, regular); ly -= 10; }

  // "Conceicao do Rio Verde / MG  37430-000"
  const sCityLine = `${san(p.senderCity, 22)} / ${(p.senderState || '').toUpperCase().slice(0, 2)}  ${sndCepFmt}`;
  t(sCityLine, M, ly, 6.5, regular); ly -= 10;

  const sCnpj = san(p.senderCnpj, 20);
  if (sCnpj) { t(`CNPJ: ${sCnpj}`, M, ly, 7, regular); ly -= 10; }

  // Separador fino entre remetente e destinatário
  const innerSepY = ly - 4;
  page.drawLine({ start: { x: M, y: innerSepY }, end: { x: rightColX - 5, y: innerSepY }, thickness: 0.3, color: BLACK });
  ly = innerSepY - 9;

  t('DESTINATARIO:', M, ly, 8, bold);
  ly -= 12;

  // Destinatário nome: +1 pt (9 pt, era 8 pt)
  const rName = san(p.recipientName, 36).toUpperCase();
  t(rName, M, ly, 9, bold); ly -= 12;

  const rStreet = [san(p.recipientStreet, 28), san(p.recipientNumber, 8)].filter(Boolean).join(', ');
  if (rStreet) { t(rStreet, M, ly, 8, regular); ly -= 10; }

  const rComp = san(p.recipientComplement, 34);
  if (rComp) { t(rComp, M, ly, 8, regular); ly -= 10; }

  const rDist = san(p.recipientDistrict, 20);
  t(`Bairro: ${rDist}  CEP: ${cepFmt}`, M, ly, 8, regular); ly -= 10;

  const rCity  = san(p.recipientCity, 20);
  const rState = (p.recipientState || '').toUpperCase().slice(0, 2);
  t(`Cidade: ${rCity}   Estado: ${rState}`, M, ly, 8, regular);

  // ── Barra superior: sem "REMETENTE" (aparecia duplicado) ──
  // Lado esquerdo: vazio (branco)
  // Lado direito: fundo preto, "TOTAL EXPRESS" branco
  const splitX = rightColX;  // barra alinhada com a coluna direita
  page.drawRectangle({ x: splitX, y: TOP_BAR_Y, width: W - splitX, height: 18, color: BLACK });
  t('TOTAL EXPRESS', splitX + 6, TOP_BAR_Y + 4, 10, bold, WHITE);

  // Borda externa
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, borderColor: BLACK, borderWidth: 1 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
