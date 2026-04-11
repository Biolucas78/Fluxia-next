import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { tracking, status } = await req.json();
    
    if (!tracking || !status) {
      return NextResponse.json({ error: 'Tracking e status são obrigatórios' }, { status: 400 });
    }

    const payload = {
      event: "tracking",
      data: {
        id: "simulacao-" + Date.now(),
        tracking: tracking,
        status: status,
        history: [
          {
            status: status,
            date: new Date().toISOString()
          }
        ]
      }
    };

    const rawBody = JSON.stringify(payload);
    const appSecret = process.env.MELHOR_ENVIO_WEBHOOK_SECRET || '';
    
    const signature = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const webhookUrl = `${protocol}://${host}/api/webhook/melhor-envio`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-me-signature': signature
      },
      body: rawBody
    });

    const result = await response.json();
    return NextResponse.json({ success: true, webhookUrl, webhookResponse: result });
  } catch (error: any) {
    console.error('Erro ao simular webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
