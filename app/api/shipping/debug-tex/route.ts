import { NextResponse } from 'next/server';
import { getTotalExpressApiAuthHeader, TOTAL_EXPRESS_URL } from '@/lib/totalexpress';

// Endpoint temporário de diagnóstico — remover após resolver o rastreio TEX
export async function POST(req: Request) {
  const { awb } = await req.json();

  const results: Record<string, any> = {
    awb,
    url: `${TOTAL_EXPRESS_URL}/ics-tracking-encomenda-lv/v1/tracking`,
    authConfigured: false,
    authUser: null,
    httpStatus: null,
    responseBody: null,
    error: null,
  };

  try {
    const authHeader = getTotalExpressApiAuthHeader();
    results.authConfigured = true;
    // Mostra só o usuário (não a senha)
    results.authUser = process.env.TOTAL_EXPRESS_API_USER || null;

    const response = await fetch(`${TOTAL_EXPRESS_URL}/ics-tracking-encomenda-lv/v1/tracking`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)',
      },
      body: JSON.stringify({ awbs: [awb], comprovanteEntrega: false }),
    });

    results.httpStatus = response.status;
    const text = await response.text();
    results.responseBody = text.substring(0, 2000);

  } catch (e: any) {
    results.error = e.message;
  }

  return NextResponse.json(results);
}
