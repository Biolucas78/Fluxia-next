import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require('bwip-js') as {
  toBuffer(opts: Record<string, unknown>): Promise<Buffer>;
};

// 10 × 15 cm in points (72pt = 1 inch = 25.4 mm)
const W = (100 / 25.4) * 72; // ≈ 283.46 pt
const H = (150 / 25.4) * 72; // ≈ 425.20 pt
const M = 6;                  // horizontal margin in pt

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const LGRAY = rgb(0.88, 0.88, 0.88);

// Strip diacritics + non-printable-ASCII required by StandardFonts (WinAnsiEncoding)
const san = (s: string, max: number) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, max);

async function code128(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'code128', text, scale: 3, height: 18, includetext: false, padding: 2 });
}

async function dataMatrix(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'datamatrix', text, scale: 4, padding: 3 });
}

export interface TexLabelParams {
  awb: string;
  rota: string;
  serviceCode: string;   // 'EXP', 'STD', etc.
  orderNumber: string;
  destCep: string;
  senderName: string;
  senderCity: string;
  senderState: string;
  recipientName: string;
  recipientStreet: string;
  recipientNumber: string;
  recipientComplement: string;
  recipientDistrict: string;
  recipientCity: string;
  recipientState: string;
}

export async function generateTexLabelPdf(p: TexLabelParams): Promise<Buffer> {
  const pedidoText = san(p.orderNumber, 20) || 'PEDIDO';

  // ── 1. Generate all barcodes in parallel
  const [awbPng, cepPng, pedidoPng, dmPng] = await Promise.all([
    code128(p.awb),
    code128(p.destCep),
    code128(pedidoText),
    dataMatrix(p.awb),
  ]);

  // ── 2. Create PDF
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([W, H]);

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const awbImg    = await pdfDoc.embedPng(awbPng);
  const cepImg    = await pdfDoc.embedPng(cepPng);
  const pedidoImg = await pdfDoc.embedPng(pedidoPng);
  const dmImg     = await pdfDoc.embedPng(dmPng);

  const iW = W - 2 * M;

  // helpers
  const sep = (y: number, thick = 0.75) =>
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: thick, color: BLACK });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (s: string, x: number, y: number, sz: number, f = regular, col: any = BLACK) =>
    page.drawText(san(s, 200), { x, y, size: sz, font: f, color: col });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 4 — Código de Barras - Pedido (y: 0 → 80)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  page.drawImage(pedidoImg, { x: M, y: 14, width: iW, height: 56 });
  t(pedidoText, W / 2 - pedidoText.length * 2.5, 5, 7);

  sep(80);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 3 — Código de Barras - AWB (y: 80 → 165)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  page.drawImage(awbImg, { x: M, y: 92, width: iW, height: 60 });
  t(p.awb, W / 2 - p.awb.length * 3, 82, 8, bold);

  sep(165);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 2 — Código de Barras CEP + Data Matrix + Rota (y: 165 → 250)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const cepBW = iW * 0.54;
  const dmSz  = 52;

  page.drawImage(cepImg, { x: M, y: 192, width: cepBW, height: 50 });
  page.drawImage(dmImg,  { x: M + cepBW + 6, y: 187, width: dmSz, height: dmSz });

  const cepFmt = p.destCep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  t(cepFmt, M, 175, 8, bold);

  // Rota box
  const rX = W * 0.38;
  const rW = W - rX - M;
  page.drawRectangle({ x: rX, y: 171, width: rW, height: 16, borderColor: BLACK, borderWidth: 1 });
  t(p.rota, rX + 3, 175, 7, bold);

  sep(250);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 1 — Cabeçalho com remetente e destinatário (y: 250 → 425)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Recipient area (y: 250 → 375)
  t('Destinatario:', M, 363, 7, bold);

  let ry = 349;
  const ln = (s: string, f = regular) => {
    const clean = san(s, 40);
    if (!clean) return;
    t(clean, M, ry, 7.5, f);
    ry -= 11;
  };

  ln(p.recipientName, bold);
  ln([p.recipientStreet, p.recipientNumber].filter(Boolean).join(', '));
  ln(p.recipientComplement);
  ln(p.recipientDistrict);
  ln(`${cepFmt} ${san(p.recipientCity, 22).toUpperCase()} ${(p.recipientState || '').toUpperCase().slice(0, 2)}`, bold);

  sep(375, 0.5);

  // Sender area (y: 375 → 407)
  t(p.senderName, M, 395, 7.5, bold);
  t(`${san(p.senderCity, 22)} ${(p.senderState || '').toUpperCase().slice(0, 2)}`, M, 383, 7);

  // Service code box (right side)
  const scW = 55; const scH = 28; const scX = W - scW - M;
  page.drawRectangle({ x: scX, y: 376, width: scW, height: scH, borderColor: BLACK, borderWidth: 2 });
  t(p.serviceCode, scX + scW / 2 - p.serviceCode.length * 5, 384, 16, bold);

  sep(407, 0.5);

  // Top bar (y: 407 → 425)
  const splitX = W * 0.55;
  page.drawRectangle({ x: 0, y: 407, width: splitX, height: 18, color: LGRAY });
  t('REMETENTE', M, 412, 9, bold);

  page.drawRectangle({ x: splitX, y: 407, width: W - splitX, height: 18, color: BLACK });
  t('TOTAL EXPRESS', splitX + 6, 412, 8, bold, WHITE);

  // Outer border
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, borderColor: BLACK, borderWidth: 1 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
