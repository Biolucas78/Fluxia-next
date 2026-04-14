import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function handleLeadWebhook(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Webhook ${requestId}] Request received`);

  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error(`[Webhook ${requestId}] Failed to parse JSON body`);
      return NextResponse.json(
        { error: 'Corpo da requisição inválido (JSON esperado)' }, 
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[Webhook ${requestId}] Body:`, JSON.stringify(body));

    const now = new Date().toISOString();
    
    // Determine environment for collection
    const host = req.headers.get('host') || '';
    const forwardedHost = req.headers.get('x-forwarded-host') || '';
    const isDev = host.includes('ais-dev') || forwardedHost.includes('ais-dev') || host.includes('localhost') || host.includes('vercel.app') === false;
    const collectionName = isDev && !host.includes('vercel.app') ? 'leads_dev' : 'leads';

    console.log(`[Webhook ${requestId}] Env: host=${host}, isDev=${isDev}, collection=${collectionName}`);

    // Map incoming body to Lead interface exactly as requested
    const newLead = {
      nome: body.nome || body.name || 'Sem nome',
      email: body.email || '',
      whatsapp: body.whatsapp || body.telefone || body.phone || '',
      finalidade: body.finalidade || (body.mensagem && body.mensagem.toLowerCase().includes('revenda') ? 'revenda' : 'consumo'),
      notas: body.mensagem || body.notas || body.note || '',
      origem: body.origem || 'landing_page',
      utm: {
        source: body.utm_source || body.source || '',
        medium: body.utm_medium || body.medium || '',
        campaign: body.utm_campaign || body.campaign || '',
        term: body.utm_term || body.term || '',
        content: body.utm_content || body.content || ''
      },
      status: '1_mensagem',
      temperature: 'morno',
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    // Save to Firestore using Admin SDK
    try {
      const adminDb = getAdminDb();
      console.log(`[Webhook ${requestId}] Saving to Firestore...`);
      const docRef = await adminDb.collection(collectionName).add(newLead);
      console.log(`[Webhook ${requestId}] Success! ID: ${docRef.id}`);

      return NextResponse.json(
        { 
          success: true, 
          id: docRef.id,
          message: 'Lead criado com sucesso no funil de Tráfego (etapa NOVO LEAD)',
          stage: '1_mensagem',
          collection: collectionName
        }, 
        { status: 201, headers: corsHeaders }
      );
    } catch (dbError: any) {
      console.error(`[Webhook ${requestId}] DB Error:`, dbError);
      return NextResponse.json(
        { 
          error: 'Erro ao salvar no banco de dados',
          message: dbError.message,
          code: dbError.code,
          collection: collectionName
        }, 
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error(`[Webhook ${requestId}] Global Error:`, error);
    return NextResponse.json(
      { 
        error: 'Erro interno ao processar lead',
        details: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

export function handleWebhookOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
