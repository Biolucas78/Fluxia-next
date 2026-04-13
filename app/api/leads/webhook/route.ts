import { handleLeadWebhook, handleWebhookOptions } from '@/lib/webhook-handler';

// This forces Next.js to not cache this route and handle it dynamically
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handleLeadWebhook(req);
}

export async function OPTIONS() {
  return handleWebhookOptions();
}
