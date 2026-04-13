import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function handleLeadWebhook(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Webhook ${requestId}] Request received`);

  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error(`[Webhook ${requestId}] Failed to parse JSON body`);
      return NextResponse.json({ error: 'Corpo da requisição inválido (JSON esperado)' }, { status: 400 });
    }

    console.log(`[Webhook ${requestId}] Body:`, JSON.stringify(body));
    
    // Basic validation
    if (!body.nome) {
      console.error(`[Webhook ${requestId}] Missing "nome" field`);
      return NextResponse.json({ error: 'O campo "nome" é obrigatório' }, { status: 400 });
    }

    const now = new Date().toISOString();
    
    // Determine environment for collection
    const host = req.headers.get('host') || '';
    const forwardedHost = req.headers.get('x-forwarded-host') || '';
    const isDev = host.includes('ais-dev') || forwardedHost.includes('ais-dev') || host.includes('localhost');
    const collectionName = isDev ? 'leads_dev' : 'leads';

    console.log(`[Webhook ${requestId}] Env: host=${host}, isDev=${isDev}, collection=${collectionName}`);

    // Map incoming body to Lead interface
    const newLead = {
      nome: body.nome,
      companyName: body.companyName || body.empresa || '',
      whatsapp: body.whatsapp || body.telefone || body.phone || '',
      email: body.email || '',
      origem: 'landing_page', // Force landing_page for Traffic funnel visibility
      status: '1_mensagem',   // Stage "NOVO LEAD" in Traffic funnel
      notas: body.notas || body.mensagem || body.note || '',
      finalidade: body.finalidade || 'consumo',
      temperature: body.temperature || 'morno',
      createdAt: now,
      updatedAt: now,
      history: [
        { 
          status: '1_mensagem', 
          timestamp: now, 
          note: body.historyNote || 'Lead capturado via Webhook (Make.com)' 
        }
      ]
    };

    // Save to Firestore using Admin SDK
    try {
      const adminDb = getAdminDb();
      console.log(`[Webhook ${requestId}] Saving to Firestore...`);
      const docRef = await adminDb.collection(collectionName).add(newLead);
      console.log(`[Webhook ${requestId}] Success! ID: ${docRef.id}`);

      return NextResponse.json({ 
        success: true, 
        id: docRef.id,
        message: 'Lead criado com sucesso no funil de Tráfego (etapa NOVO LEAD)',
        stage: '1_mensagem',
        collection: collectionName
      });
    } catch (dbError: any) {
      console.error(`[Webhook ${requestId}] DB Error:`, dbError);
      return NextResponse.json({ 
        error: 'Erro ao salvar no banco de dados',
        message: dbError.message,
        code: dbError.code,
        collection: collectionName
      }, { status: 500 });
    }
  } catch (error) {
    console.error(`[Webhook ${requestId}] Global Error:`, error);
    return NextResponse.json({ 
      error: 'Erro interno ao processar lead',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export function handleWebhookOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
