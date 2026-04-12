import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('[CRM Webhook] Received lead:', body);

    // Basic validation
    if (!body.nome) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const now = new Date().toISOString();
    
    // Determine environment for collection
    const isDev = process.env.NODE_ENV === 'development' || 
                 req.headers.get('host')?.includes('ais-dev') || 
                 req.headers.get('host')?.includes('localhost');
    
    const collectionName = isDev ? 'leads_dev' : 'leads';

    const newLead = {
      nome: body.nome,
      whatsapp: body.whatsapp || body.telefone || '',
      email: body.email || '',
      finalidade: body.finalidade || 'consumo',
      origem: 'landing_page',
      status: 'lead',
      notas: body.mensagem || '',
      createdAt: now,
      updatedAt: now,
      history: [
        { 
          status: 'lead', 
          timestamp: now, 
          note: 'Lead capturado via Landing Page' 
        }
      ]
    };

    const docRef = await addDoc(collection(db, collectionName), newLead);
    console.log('[CRM Webhook] Lead saved with ID:', docRef.id);

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: 'Lead capturado com sucesso' 
    });
  } catch (error) {
    console.error('[CRM Webhook] Error processing lead:', error);
    return NextResponse.json({ 
      error: 'Erro interno ao processar lead',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'CRM Webhook is active',
    endpoint: '/api/crm/webhook',
    method: 'POST only'
  });
}
