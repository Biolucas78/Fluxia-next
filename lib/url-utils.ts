import { NextRequest } from 'next/server';

export function getBaseUrl(request: Request | NextRequest) {
  // 1. Try to get from environment variable first (if set and valid)
  const envUrl = process.env.APP_URL?.replace(/\/$/, '');
  
  // 2. Get from headers (most reliable for current request context)
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  
  if (!host) return envUrl || '';

  const detectedUrl = `${proto}://${host}`.replace(/\/$/, '');

  // If we are in AI Studio preview, we might want to prefer the detected one
  // but if the user explicitly set APP_URL and it matches the host, use it.
  if (envUrl && detectedUrl.includes(new URL(envUrl).host)) {
    return envUrl;
  }

  return detectedUrl;
}
