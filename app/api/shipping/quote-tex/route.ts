import { NextResponse } from 'next/server';

// ─── Tabela de fretes Total Express ───
// Faixas de peso em kg
const FAIXAS = [10, 20, 30, 50, 70, 100];

// Estrutura: { estado: { capital: { normal: [10,20,30,50,70,100], adicional: X }, remoto: {...} } }
// Valores extraídos da planilha do contrato
// "1.0" = não atendido

const TABELA_CAPITAL: Record<string, { normal: number[]; adicional: number; remoto: number[]; adicionalRemoto: number }> = {
  AL: { normal: [43.37, 77.57, 114.83, 189.47, 257.08, 357.88], adicional: 4.54, remoto: [88.27, 119.94, 152.50, 225.66, 303.01, 416.60], adicionalRemoto: 0 },
  BA: { normal: [36.17, 61.37, 89.16, 147.31, 200.43, 279.54], adicional: 3.51, remoto: [88.70, 120.81, 153.82, 227.86, 306.08, 420.98], adicionalRemoto: 5.83 },
  CE: { normal: [44.99, 81.23, 120.63, 199.00, 269.89, 375.58], adicional: 4.73, remoto: [90.15, 123.70, 158.16, 235.08, 316.20, 435.43], adicionalRemoto: 0 },
  DF: { normal: [29.15, 45.59, 64.17, 106.24, 145.26, 203.25], adicional: 5.59, remoto: [29.15, 45.59, 64.17, 106.24, 145.26, 203.25], adicionalRemoto: 5.59 },
  ES: { normal: [0, 45.28, 63.67, 105.42, 144.15, 201.72], adicional: 0, remoto: [80.43, 104.26, 128.98, 186.47, 248.13, 338.20], adicionalRemoto: 4.64 },
  GO: { normal: [28.71, 44.60, 62.59, 103.64, 141.77, 198.43], adicional: 0, remoto: [80.07, 103.56, 127.93, 184.71, 245.67, 334.69], adicionalRemoto: 4.86 },
  MA: { normal: [46.22, 83.99, 125.00, 206.17, 279.52, 388.90], adicional: 4.87, remoto: [91.57, 126.54, 162.41, 242.17, 326.11, 449.60], adicionalRemoto: 6.34 },
  MG: { normal: [25.43, 37.22, 50.90, 84.44, 115.98, 162.76], adicional: 1.61, remoto: [76.28, 95.97, 116.55, 165.74, 219.12, 296.75], adicionalRemoto: 2.71 },
  MS: { normal: [33.19, 54.67, 78.54, 129.85, 176.98, 247.12], adicional: 0, remoto: [85.25, 113.92, 143.47, 210.61, 281.94, 386.49], adicionalRemoto: 5.39 },
  MT: { normal: [34.52, 57.68, 83.31, 137.69, 187.52, 261.69], adicional: 4.49, remoto: [86.80, 117.02, 148.12, 218.36, 292.78, 401.99], adicionalRemoto: 8.56 },
  PB: { normal: [41.96, 74.42, 109.83, 181.26, 246.05, 342.62], adicional: 0, remoto: [95.41, 134.24, 173.95, 261.41, 353.05, 488.09], adicionalRemoto: 0 },
  PE: { normal: [40.07, 70.15, 103.08, 170.16, 231.14, 322.01], adicional: 4.16, remoto: [93.22, 129.85, 167.37, 250.45, 337.70, 466.16], adicionalRemoto: 6.51 },
  PI: { normal: [41.21, 72.71, 107.14, 176.83, 240.10, 334.39], adicional: 4.29, remoto: [94.54, 132.48, 171.33, 257.03, 346.93, 479.33], adicionalRemoto: 6.65 },
  PR: { normal: [0, 34.17, 46.08, 76.52, 105.33, 148.04], adicional: 1.74, remoto: [74.71, 92.83, 111.85, 157.91, 208.15, 281.08], adicionalRemoto: 0 },
  RJ: { normal: [0, 34.09, 45.94, 76.30, 105.03, 147.63], adicional: 1.71, remoto: [74.67, 92.75, 111.72, 157.69, 207.85, 280.65], adicionalRemoto: 0 },
  RN: { normal: [43.25, 77.32, 114.43, 188.81, 256.19, 356.64], adicional: 4.53, remoto: [96.91, 137.22, 178.43, 268.87, 363.49, 503.00], adicionalRemoto: 7.18 },
  RS: { normal: [30.15, 47.83, 67.71, 112.05, 153.07, 214.05], adicional: 3.32, remoto: [86.65, 116.71, 147.67, 217.61, 291.73, 400.48], adicionalRemoto: 0 },
  SC: { normal: [23.48, 32.83, 43.94, 73.01, 100.62, 141.53], adicional: 2.48, remoto: [79.15, 101.71, 125.16, 180.10, 239.21, 325.46], adicionalRemoto: 4.73 },
  SE: { normal: [42.99, 76.72, 113.48, 187.25, 254.10, 353.75], adicional: 4.82, remoto: [87.83, 119.06, 151.19, 223.47, 299.94, 412.21], adicionalRemoto: 0 },
  SP: { normal: [0, 0, 0, 0, 0, 0], adicional: 0, remoto: [0, 0, 0, 0, 0, 0], adicionalRemoto: 0 }, // SP não aparece na tabela
};

const TABELA_INTERIOR: Record<string, { normal: number[]; adicional: number; remoto: number[]; adicionalRemoto: number }> = {
  AL: { normal: [57.05, 91.91, 130.05, 211.99, 279.95, 387.81], adicional: 5.62, remoto: [88.27, 119.94, 152.50, 225.66, 303.01, 416.60], adicionalRemoto: 0 },
  BA: { normal: [56.48, 91.18, 129.18, 210.62, 277.78, 384.60], adicional: 5.86, remoto: [88.70, 120.81, 153.82, 227.86, 306.08, 420.98], adicionalRemoto: 5.83 },
  CE: { normal: [58.04, 94.30, 133.95, 218.57, 288.20, 399.05], adicional: 0, remoto: [90.15, 123.70, 158.16, 235.08, 316.20, 435.43], adicionalRemoto: 0 },
  DF: { normal: [38.24, 54.70, 73.45, 117.73, 156.02, 215.72], adicional: 5.59, remoto: [38.24, 54.70, 73.45, 117.73, 156.02, 215.72], adicionalRemoto: 5.59 },
  ES: { normal: [47.54, 73.30, 101.86, 165.09, 218.10, 301.81], adicional: 4.42, remoto: [80.43, 104.26, 128.98, 186.47, 248.13, 338.20], adicionalRemoto: 4.64 },
  GO: { normal: [47.16, 72.54, 100.70, 163.16, 215.57, 298.30], adicional: 4.63, remoto: [80.07, 103.56, 127.93, 184.71, 245.67, 334.69], adicionalRemoto: 4.86 },
  MA: { normal: [59.57, 97.36, 138.62, 226.36, 298.42, 413.22], adicional: 5.86, remoto: [91.57, 126.54, 162.41, 242.17, 326.11, 449.60], adicionalRemoto: 6.34 },
  MG: { normal: [42.50, 63.21, 86.44, 139.40, 184.42, 255.10], adicional: 2.53, remoto: [76.28, 95.97, 116.55, 165.74, 219.12, 296.75], adicionalRemoto: 2.71 },
  MS: { normal: [52.76, 83.73, 117.80, 191.65, 252.92, 350.11], adicional: 5.14, remoto: [85.25, 113.92, 143.47, 210.61, 281.94, 386.49], adicionalRemoto: 5.39 },
  MT: { normal: [54.43, 87.08, 122.91, 200.17, 264.09, 365.60], adicional: 8.16, remoto: [86.80, 117.02, 148.12, 218.36, 292.78, 401.99], adicionalRemoto: 8.56 },
  PB: { normal: [63.73, 105.68, 151.32, 247.53, 326.17, 451.70], adicional: 5.91, remoto: [95.41, 134.24, 173.95, 261.41, 353.05, 488.09], adicionalRemoto: 0 },
  PE: { normal: [61.36, 100.94, 144.09, 235.47, 310.36, 429.77], adicional: 5.48, remoto: [93.22, 129.85, 167.37, 250.45, 337.70, 466.16], adicionalRemoto: 6.51 },
  PI: { normal: [62.79, 103.79, 148.43, 242.71, 319.86, 442.95], adicional: 6.33, remoto: [94.54, 132.48, 171.33, 257.03, 346.93, 479.33], adicionalRemoto: 6.65 },
  PR: { normal: [36.97, 52.16, 69.55, 111.25, 147.52, 203.92], adicional: 2.73, remoto: [74.71, 92.83, 111.85, 157.91, 208.15, 281.08], adicionalRemoto: 0 },
  RJ: { normal: [43.99, 66.20, 91.01, 147.01, 194.40, 268.95], adicional: 0, remoto: [74.67, 92.75, 111.72, 157.69, 207.85, 280.65], adicionalRemoto: 0 },
  RN: { normal: [65.34, 108.90, 156.24, 255.73, 336.92, 466.61], adicional: 0, remoto: [96.91, 137.22, 178.43, 268.87, 363.49, 503.00], adicionalRemoto: 7.18 },
  RS: { normal: [54.20, 86.62, 122.21, 199.01, 262.56, 363.49], adicional: 5.62, remoto: [86.65, 116.71, 147.67, 217.61, 291.73, 400.48], adicionalRemoto: 0 },
  SC: { normal: [41.28, 60.77, 82.71, 133.17, 176.26, 243.78], adicional: 0, remoto: [79.15, 101.71, 125.16, 180.10, 239.21, 325.46], adicionalRemoto: 4.73 },
  SE: { normal: [57.59, 92.59, 130.87, 213.28, 282.00, 390.86], adicional: 4.82, remoto: [87.83, 119.06, 151.19, 223.47, 299.94, 412.21], adicionalRemoto: 0 },
};

// CEPs de capitais por estado
const CEPS_CAPITAL: Record<string, [number, number][]> = {
  AL: [[57000000, 57099999]],
  BA: [[40000000, 42999999]],
  CE: [[60000000, 60999999]],
  DF: [[70000000, 72799999]],
  ES: [[29000000, 29099999]],
  GO: [[74000000, 74899999]],
  MA: [[65000000, 65099999]],
  MG: [[30000000, 31999999]],
  MS: [[79000000, 79199999]],
  MT: [[78000000, 78199999]],
  PB: [[58000000, 58099999]],
  PE: [[50000000, 52999999]],
  PI: [[64000000, 64099999]],
  PR: [[80000000, 82999999]],
  RJ: [[20000000, 23999999]],
  RN: [[59000000, 59099999]],
  RS: [[90000000, 91999999]],
  SC: [[88000000, 88099999]],
  SE: [[49000000, 49099999]],
  SP: [[1000000, 5999999]],
  AM: [[69000000, 69299999]],
  PA: [[66000000, 66999999]],
};

// UF por faixa de CEP
const CEP_UF: [number, number, string][] = [
  [1000000, 19999999, 'SP'],
  [20000000, 28999999, 'RJ'],
  [29000000, 29999999, 'ES'],
  [30000000, 39999999, 'MG'],
  [40000000, 48999999, 'BA'],
  [49000000, 49999999, 'SE'],
  [50000000, 56999999, 'PE'],
  [57000000, 57999999, 'AL'],
  [58000000, 58999999, 'PB'],
  [59000000, 59999999, 'RN'],
  [60000000, 63999999, 'CE'],
  [64000000, 64999999, 'PI'],
  [65000000, 65999999, 'MA'],
  [66000000, 68999999, 'PA'],
  [69000000, 69999999, 'AM'],
  [70000000, 72999999, 'DF'],
  [73000000, 73699999, 'GO'],
  [73700000, 73999999, 'DF'],
  [74000000, 76799999, 'GO'],
  [76800000, 76999999, 'RO'],
  [77000000, 77999999, 'TO'],
  [78000000, 78999999, 'MT'],
  [79000000, 79999999, 'MS'],
  [80000000, 87999999, 'PR'],
  [88000000, 89999999, 'SC'],
  [90000000, 99999999, 'RS'],
];

function getUFbyCep(cep: number): string {
  for (const [min, max, uf] of CEP_UF) {
    if (cep >= min && cep <= max) return uf;
  }
  return '';
}

function isCapital(cep: number, uf: string): boolean {
  const ranges = CEPS_CAPITAL[uf];
  if (!ranges) return false;
  return ranges.some(([min, max]) => cep >= min && cep <= max);
}

function calcularFrete(pesoKg: number, tabela: { normal: number[]; adicional: number; remoto: number[]; adicionalRemoto: number }, modalidade: 'normal' | 'remoto') {
  const valores = modalidade === 'normal' ? tabela.normal : tabela.remoto;
  const adicional = modalidade === 'normal' ? tabela.adicional : tabela.adicionalRemoto;

  // Verifica se não atendido (todos zeros ou não existe)
  if (valores.every(v => v === 0)) return null;

  // Peso mínimo é 10kg
  const pesoFinal = Math.max(pesoKg, 10);

  // Faixa exata
  const idx = FAIXAS.indexOf(pesoFinal);
  if (idx !== -1) return valores[idx];

  // Abaixo de 10kg — usa faixa de 10kg
  if (pesoFinal <= 10) return valores[0];

  // Acima de 100kg — usa 100kg + adicional por kg excedente
  if (pesoFinal > 100) {
    const excedente = pesoFinal - 100;
    return valores[5] + (adicional * excedente);
  }

  // Interpola entre faixas
  let faixaInferior = 0;
  let faixaSuperior = 1;
  for (let i = 0; i < FAIXAS.length - 1; i++) {
    if (pesoFinal > FAIXAS[i] && pesoFinal < FAIXAS[i + 1]) {
      faixaInferior = i;
      faixaSuperior = i + 1;
      break;
    }
  }

  const pesoInf = FAIXAS[faixaInferior];
  const pesoSup = FAIXAS[faixaSuperior];
  const valInf = valores[faixaInferior];
  const valSup = valores[faixaSuperior];

  if (valInf === 0 || valSup === 0) return null;

  // Interpolação linear
  const ratio = (pesoFinal - pesoInf) / (pesoSup - pesoInf);
  return valInf + ratio * (valSup - valInf);
}

export async function POST(req: Request) {
  try {
    const { destinationCep, weight, boxDimensions } = await req.json();

    if (!destinationCep || !weight) {
      return NextResponse.json({ error: 'CEP e peso são obrigatórios.' }, { status: 400 });
    }

    const cepNum = parseInt(destinationCep.replace(/\D/g, ''));
    const uf = getUFbyCep(cepNum);

    if (!uf) {
      return NextResponse.json({ error: 'CEP inválido ou estado não identificado.' }, { status: 400 });
    }

    // Peso real em kg (recebemos em gramas)
    const pesoRealKg = weight / 1000;

    // Peso cubado em kg
    let pesoCubadoKg = 0;
    if (boxDimensions?.width && boxDimensions?.height && boxDimensions?.length) {
      pesoCubadoKg = (boxDimensions.width * boxDimensions.height * boxDimensions.length) / 167;
    }

    // Peso taxável
    const pesoTaxavelKg = Math.max(pesoRealKg, pesoCubadoKg);

    const capital = isCapital(cepNum, uf);
    const tabela = capital ? TABELA_CAPITAL[uf] : TABELA_INTERIOR[uf];

    if (!tabela) {
      return NextResponse.json({
        error: `Total Express não atende o estado ${uf}.`,
        uf,
        capital,
      }, { status: 404 });
    }

    const precoNormal = calcularFrete(pesoTaxavelKg, tabela, 'normal');
    const precoRemoto = calcularFrete(pesoTaxavelKg, tabela, 'remoto');

    const results = [];

    if (precoNormal && precoNormal > 0) {
      results.push({
        id: 'tex-normal',
        provider: 'Total Express',
        name: capital ? 'TEX Capital' : 'TEX Interior',
        price: parseFloat(precoNormal.toFixed(2)),
        currency: 'BRL',
        deliveryTime: capital ? '3-5 dias úteis' : '5-8 dias úteis',
        pesoTaxavel: parseFloat(pesoTaxavelKg.toFixed(2)),
        pesoReal: parseFloat(pesoRealKg.toFixed(2)),
        pesoCubado: parseFloat(pesoCubadoKg.toFixed(2)),
        uf,
        capital,
      });
    }

    if (precoRemoto && precoRemoto > 0 && precoRemoto !== precoNormal) {
      results.push({
        id: 'tex-remoto',
        provider: 'Total Express',
        name: 'TEX Região Remota',
        price: parseFloat(precoRemoto.toFixed(2)),
        currency: 'BRL',
        deliveryTime: '7-12 dias úteis',
        pesoTaxavel: parseFloat(pesoTaxavelKg.toFixed(2)),
        pesoReal: parseFloat(pesoRealKg.toFixed(2)),
        pesoCubado: parseFloat(pesoCubadoKg.toFixed(2)),
        uf,
        capital,
      });
    }

    if (results.length === 0) {
      return NextResponse.json({
        error: `Total Express não atende ${capital ? 'a capital' : 'o interior'} de ${uf}.`,
      }, { status: 404 });
    }

    return NextResponse.json(results);

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro interno.' }, { status: 500 });
  }
}
