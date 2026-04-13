'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            errorMessage = `Erro de Permissão no Banco de Dados: ${parsed.error}`;
          }
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6">
            <div className="size-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="size-10 text-red-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Ops! Algo deu errado.</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                {errorMessage}
              </p>
            </div>

            {isFirestoreError && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800 text-left">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Dica de Segurança</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Isso geralmente acontece quando você tenta acessar dados que não pertencem ao seu cargo ou se sua sessão expirou.
                </p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
            >
              <RefreshCcw className="size-5" />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
