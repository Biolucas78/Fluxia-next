'use client';

import React, { useState, useEffect } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Navegadores mobile e webviews embutidos (Instagram, Facebook, etc.) costumam bloquear ou
// falhar silenciosamente com signInWithPopup — usamos redirecionamento nesses casos.
function shouldUseRedirect() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|FBAN|FBAV|Instagram|Line\//i.test(ua);
}

function describeError(error: any): string {
  return `${error?.code || 'sem-codigo'} — ${error?.message || 'erro desconhecido'}`;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userAgent, setUserAgent] = useState('');

  useEffect(() => {
    setUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');

    // Se o login anterior foi por redirecionamento (mobile), captura o resultado/erro aqui.
    getRedirectResult(auth)
      .then((result) => {
        if (result) console.log('[Login] Redirect concluído:', result.user?.email);
        else console.log('[Login] getRedirectResult: nenhum redirecionamento pendente.');
      })
      .catch((error: any) => {
        console.error('Erro ao concluir login (redirect):', error);
        const msg = describeError(error);
        setErrorMsg(msg);
        toast.error('Erro ao fazer login: ' + msg, { duration: 10000 });
      });
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    const provider = new GoogleAuthProvider();
    try {
      if (shouldUseRedirect()) {
        console.log('[Login] Usando signInWithRedirect (mobile/webview detectado)');
        await signInWithRedirect(auth, provider);
        return;
      }
      console.log('[Login] Usando signInWithPopup (desktop)');
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Error logging in:', error);
      const msg = describeError(error);
      setErrorMsg(msg);
      toast.error('Erro ao fazer login: ' + msg, { duration: 10000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-center max-w-sm w-full">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Login</h2>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="px-6 py-3 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 mx-auto"
        >
          {loading ? <Loader2 className="animate-spin size-5" /> : null}
          Entrar com Google
        </button>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-left">
            <p className="text-xs font-bold text-red-600 dark:text-red-400">Erro no login:</p>
            <p className="text-xs text-red-500 dark:text-red-300 break-words mt-1">{errorMsg}</p>
          </div>
        )}

        {userAgent && (
          <p className="mt-4 text-[9px] text-slate-400 break-words select-all">{userAgent}</p>
        )}
      </div>
    </div>
  );
}
