import { NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = getFirestore();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Basic validation
    const { nome, email, whatsapp, origem, mensagem } = body;
    
    if (!nome || (!email && !whatsapp)) {
      return NextResponse.json({ error: 'Nome e Email/WhatsApp são obrigatórios' }, { status: 400 });
    }

    const newLead = {
      nome,
      email: email || '',
      whatsapp: whatsapp || '',
      origem: origem || 'landing_page',
      mensagem: mensagem || '',
      status: 'novo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      historico: [
        {
          data: new Date().toISOString(),
          mensagem: 'Lead capturado via Webhook (Landing Page)',
          usuario: 'Sistema'
        }
      ]
    };

    // Save to Firestore
    const docRef = await db.collection('leads').add(newLead);

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: 'Lead capturado com sucesso' 
    });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Erro interno ao processar lead' }, { status: 500 });
  }
}

// Handle CORS for external requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
