'use client';

import React, { useEffect, useRef, useState } from 'react';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

// IMPORTANTE: este fluxo usa o Google Identity Services (accounts.google.com) direto,
// em vez de signInWithPopup/signInWithRedirect — que dependem da página /__/auth/handler
// hospedada no Firebase Hosting. Essa infraestrutura do Firebase Hosting roda num IP
// compartilhado (199.36.158.x) que ficou inacessível em algumas redes (ex: Starlink),
// causando timeout de conexão. O Identity Services + signInWithCredential fala
// diretamente com accounts.google.com e com a API do Firebase, contornando esse IP.
const GOOGLE_CLIENT_ID = '508871393897-q6cn4bioqhlqtsarlq4nfvdrb4bm4q73.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
  }
}

function describeError(error: any): string {
  return `${error?.code || 'sem-codigo'} — ${error?.message || 'erro desconhecido'}`;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Carrega o script do Google Identity Services
  useEffect(() => {
    if (document.getElementById('google-identity-script')) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-identity-script';
    script.onload = () => setScriptReady(true);
    script.onerror = () => setErrorMsg('Não foi possível carregar o script de login do Google.');
    document.head.appendChild(script);
  }, []);

  const handleCredentialResponse = async (response: any) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const credential = GoogleAuthProvider.credential(response.credential);
      await signInWithCredential(auth, credential);
    } catch (error: any) {
      console.error('Error logging in:', error);
      const msg = describeError(error);
      setErrorMsg(msg);
      toast.error('Erro ao fazer login: ' + msg, { duration: 10000 });
    } finally {
      setLoading(false);
    }
  };

  // Inicializa o botão do Google assim que o script estiver pronto
  useEffect(() => {
    if (!scriptReady || !window.google || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 280,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-center max-w-sm w-full">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Login</h2>

        <div className="flex justify-center min-h-[44px] items-center">
          {!scriptReady && !errorMsg && <Loader2 className="animate-spin size-5 text-primary" />}
          <div ref={buttonRef} />
        </div>

        {loading && (
          <div className="mt-4 flex justify-center">
            <Loader2 className="animate-spin size-5 text-primary" />
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-left">
            <p className="text-xs font-bold text-red-600 dark:text-red-400">Erro no login:</p>
            <p className="text-xs text-red-500 dark:text-red-300 break-words mt-1">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
