import { handleLeadWebhook, handleWebhookOptions } from '@/lib/webhook-handler';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleLeadWebhook(req);
}

export async function OPTIONS() {
  return handleWebhookOptions();
}

export async function GET() {
  return NextResponse.json({ 
    status: 'CRM Webhook is active',
    endpoint: '/api/crm/webhook',
    alias_of: '/api/leads/webhook',
    method: 'POST only'
  });
}
