import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require('bwip-js') as {
  toBuffer(opts: Record<string, unknown>): Promise<Buffer>;
};

// Label: 10 × 15 cm in points (72 pt = 1 inch = 25.4 mm)
const W  = (100 / 25.4) * 72;  // ≈ 283.46 pt
const H  = (150 / 25.4) * 72;  // ≈ 425.20 pt
const M  = Math.round((10 / 25.4) * 72);  // 10 mm margin ≈ 28 pt
const iW = W - 2 * M;          // ≈ 227 pt  ≈ 8 cm (exact TEX AWB spec)

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const BLUE  = rgb(0, 0, 0.7);  // for pedido text (matches TotalConecta style)

// Month abbreviations in Portuguese
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Strip diacritics + non-printable-ASCII — required for StandardFonts (WinAnsiEncoding)
const san = (s: string, max: number) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, max);

/** Returns today's date formatted as "12/Jun" */
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
  serviceCode: string;   // 'EXP', 'STD', etc.
  orderNumber: string;   // NF / PED / TP value; leading zeros stripped for barcode
  destCep: string;
  // Sender
  senderName: string;
  senderStreet: string;    // e.g. "Rod BR 267, S/N Km 333"
  senderDistrict: string;  // e.g. "Fazenda Itaoca - Zona Rural"
  senderCity: string;
  senderState: string;
  senderCep: string;
  senderCnpj: string;
  // Recipient
  recipientName: string;
  recipientStreet: string;
  recipientNumber: string;
  recipientComplement: string;
  recipientDistrict: string;
  recipientCity: string;
  recipientState: string;
  // Info table
  volumes: number;
  weightKg: number;
  shipDate: string;  // e.g. "12/Jun"
}

export async function generateTexLabelPdf(p: TexLabelParams): Promise<Buffer> {
  // Strip leading zeros from pedido for barcode (TEX uses clean numbers, e.g. "1406" not "001406")
  const pedidoText = san(p.orderNumber, 20).replace(/^0+/, '') || san(p.orderNumber, 20);
  const cepFmt     = p.destCep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const senderCepFmt = (p.senderCep || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const nfNum      = pedidoText;

  // 1. Generate all barcodes in parallel
  const [awbPng, cepPng, pedidoPng, dmPng] = await Promise.all([
    code128(p.awb),
    code128(p.destCep),
    code128(pedidoText),
    dataMatrix(p.awb),
  ]);

  // 2. Create PDF
  const pdfDoc  = await PDFDocument.create();
  const page    = pdfDoc.addPage([W, H]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const awbImg    = await pdfDoc.embedPng(awbPng);
  const cepImg    = await pdfDoc.embedPng(cepPng);
  const pedidoImg = await pdfDoc.embedPng(pedidoPng);
  const dmImg     = await pdfDoc.embedPng(dmPng);

  // helpers
  const sep = (y: number, thick = 0.75) =>
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: thick, color: BLACK });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (s: string, x: number, y: number, sz: number, f = regular, col: any = BLACK) =>
    page.drawText(san(s, 200), { x, y, size: sz, font: f, color: col });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 4 — Pedido (y: 0 → 55)
  // Barcode: max 5 cm = 141 pt, centered; text in blue
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pedidoBW = Math.round((50 / 25.4) * 72);  // 5 cm ≈ 141 pt
  const pedidoX  = M + Math.round((iW - pedidoBW) / 2);
  page.drawImage(pedidoImg, { x: pedidoX, y: 12, width: pedidoBW, height: 35 });
  t(pedidoText, W / 2 - pedidoText.length * 2.5, 4, 7, regular, BLUE);

  sep(55);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 3 — AWB (y: 55 → 143)
  // Barcode: full inner width = 8 cm (iW ≈ 227 pt)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  page.drawImage(awbImg, { x: M, y: 68, width: iW, height: 62 });
  t(p.awb, W / 2 - p.awb.length * 3, 59, 8, bold);

  sep(143);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 2 — CEP barcode + DataMatrix (far right) + Rota (y: 143 → 230)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const dmSz      = 48;
  const cepBW     = iW - dmSz - 8;  // ≈ 171 pt, leaves room for DM on far right

  // CEP barcode (left)
  page.drawImage(cepImg, { x: M, y: 184, width: cepBW, height: 42 });
  // DataMatrix (far right)
  page.drawImage(dmImg, { x: W - M - dmSz, y: 180, width: dmSz, height: dmSz });

  // CEP formatted text
  t(cepFmt, M, 171, 8, bold);

  // Rota box — full inner width, bigger font (prominent)
  const rotaBoxY = 148;
  page.drawRectangle({ x: M, y: rotaBoxY, width: iW, height: 20, borderColor: BLACK, borderWidth: 1 });
  const rotaClean = san(p.rota, 40);
  const rotaX = M + iW / 2 - rotaClean.length * 4;
  t(p.rota, Math.max(M + 3, rotaX), rotaBoxY + 5, 11, bold);

  sep(230);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 1 — Header info (y: 230 → 425)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const TOP_BAR_Y = Math.round(H - 18);  // ≈ 407

  // ── Right column: EXP box + info table
  const rightColX  = Math.round(W - M - 80);  // ≈ 175 pt from left
  const rightColW  = 80;
  const labelColW  = 32;
  const valueColW  = rightColW - labelColW;    // 48 pt

  // EXP service code box (top of right column)
  const expBoxH = 24;
  const expBoxY = TOP_BAR_Y - expBoxH;  // ≈ 383
  page.drawRectangle({ x: rightColX, y: expBoxY, width: rightColW, height: expBoxH, borderColor: BLACK, borderWidth: 2 });
  const expTxtX = rightColX + rightColW / 2 - (p.serviceCode.length * 5.5);
  t(p.serviceCode, Math.max(rightColX + 3, expTxtX), expBoxY + 6, 16, bold);

  // Info table (7 rows × 13 pt below EXP box)
  const tableRows = [
    { label: 'NF',   value: nfNum },
    { label: 'PED',  value: nfNum },
    { label: 'VOL',  value: String(p.volumes || 1) },
    { label: 'TP',   value: nfNum },
    { label: 'DT',   value: san(p.shipDate, 10) },
    { label: 'KG',   value: p.weightKg.toFixed(3) },
    { label: 'PECA', value: '1/1' },
  ];
  const rowH = 13;

  tableRows.forEach((row, i) => {
    const rowY = expBoxY - (i + 1) * rowH;
    // Label cell: black bg
    page.drawRectangle({ x: rightColX, y: rowY, width: labelColW, height: rowH, color: BLACK, borderColor: BLACK, borderWidth: 0.3 });
    // Value cell: white with border
    page.drawRectangle({ x: rightColX + labelColW, y: rowY, width: valueColW, height: rowH, borderColor: BLACK, borderWidth: 0.3 });
    t(row.label, rightColX + 2, rowY + 3, 6.5, bold, WHITE);
    t(row.value, rightColX + labelColW + 3, rowY + 3, 7, regular);
  });

  // ── Left column: sender + recipient info
  const leftMaxX = rightColX - 5;  // avoid overlapping right column

  let ly = TOP_BAR_Y - 12;

  // REMETENTE section
  t('REMETENTE:', M, ly, 7, bold);
  ly -= 11;

  const sName = san(p.senderName, 33).toUpperCase();
  if (sName) { t(sName, M, ly, 7.5, bold); ly -= 10; }

  const sStreet = san(p.senderStreet, 36);
  if (sStreet) { t(sStreet, M, ly, 7, regular); ly -= 10; }

  const sDist = san(p.senderDistrict, 36);
  if (sDist) { t(sDist, M, ly, 7, regular); ly -= 10; }

  // "Conceicao do Rio Verde / MG  37430-000"
  const sCityState = `${san(p.senderCity, 22)} / ${(p.senderState || '').toUpperCase().slice(0, 2)}  ${senderCepFmt}`;
  t(sCityState, M, ly, 6.5, regular); ly -= 10;

  const sCnpj = san(p.senderCnpj, 20);
  if (sCnpj) { t(`CNPJ: ${sCnpj}`, M, ly, 7, regular); ly -= 10; }

  // Thin inner separator between sender and recipient
  const innerSepY = ly - 4;
  page.drawLine({ start: { x: M, y: innerSepY }, end: { x: leftMaxX, y: innerSepY }, thickness: 0.3, color: BLACK });
  ly = innerSepY - 9;

  // DESTINATARIO section
  t('DESTINATARIO:', M, ly, 7, bold);
  ly -= 11;

  const rName = san(p.recipientName, 36).toUpperCase();
  t(rName, M, ly, 8, bold); ly -= 11;

  const rStreet = [san(p.recipientStreet, 28), san(p.recipientNumber, 8)].filter(Boolean).join(', ');
  if (rStreet) { t(rStreet, M, ly, 7, regular); ly -= 10; }

  const rComp = san(p.recipientComplement, 34);
  if (rComp) { t(rComp, M, ly, 7, regular); ly -= 10; }

  // "Bairro: Centro  CEP: 37270-000"
  const rDist = san(p.recipientDistrict, 20);
  t(`Bairro: ${rDist}  CEP: ${cepFmt}`, M, ly, 7, regular); ly -= 10;

  // "Cidade: Campo Belo   Estado: MG"
  const rCity  = san(p.recipientCity, 20);
  const rState = (p.recipientState || '').toUpperCase().slice(0, 2);
  t(`Cidade: ${rCity}   Estado: ${rState}`, M, ly, 7, regular);

  // ── Top bar (y: TOP_BAR_Y → H)
  // Left side: no background (user request), "REMETENTE" in reduced font (8pt was 9pt)
  t('REMETENTE', M, TOP_BAR_Y + 5, 8, bold);

  // Right side: black background, "TOTAL EXPRESS" white
  const splitX = W * 0.5;
  page.drawRectangle({ x: splitX, y: TOP_BAR_Y, width: W - splitX, height: 18, color: BLACK });
  t('TOTAL EXPRESS', splitX + 6, TOP_BAR_Y + 5, 8, bold, WHITE);

  // Outer border
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, borderColor: BLACK, borderWidth: 1 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
