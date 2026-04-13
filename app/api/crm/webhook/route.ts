import { POST as leadsPost, OPTIONS as leadsOptions } from '../leads/webhook/route';
import { NextResponse } from 'next/server';

export const POST = leadsPost;
export const OPTIONS = leadsOptions;

export async function GET() {
  return NextResponse.json({ 
    status: 'CRM Webhook is active',
    endpoint: '/api/crm/webhook',
    alias_of: '/api/leads/webhook',
    method: 'POST only'
  });
}
