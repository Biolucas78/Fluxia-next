'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { 
  Settings, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ExternalLink, 
  Search, 
  User, 
  Hash, 
  MapPin, 
  Loader2,
  AlertTriangle,
  Key,
  Trash2,
  Save,
  Package,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, getDoc, collection, query, getDocs, writeBatch } from 'firebase/firestore';
import { getValidBlingToken } from '@/lib/bling-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import ShippingTest from '@/components/ShippingTest';
import { useOrders } from '@/lib/hooks';
import firebaseConfig from '@/firebase-applet-config.json';

function SettingsContent() {
  const router = useRouter();
  const { syncFromDev, collectionName } = useOrders();
  const searchParams = useSearchParams();
  const [blingStatus, setBlingStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [appUrlConfig, setAppUrlConfig] = useState<string>('');
  const [lojaId, setLojaId] = useState('');
  const [isSavingLojaId, setIsSavingLojaId] = useState(false);

  const checkBlingStatus = async () => {
    setIsLoadingStatus(true);
    try {
      // Buscar a URL configurada no servidor para mostrar ao usuário
      const configRes = await fetch('/api/bling/status');
      const configData = await configRes.json();
      if (configData.appUrl) {
        setAppUrlConfig(configData.appUrl);
      }

      const token = await getValidBlingToken();
      
      if (!token) {
        setBlingStatus({ 
          status: 'error', 
          message: 'Tokens não encontrados no Firestore ou falha ao renovar. É necessário autenticar o Bling primeiro.',
          authenticated: false
        });
        setIsLoadingStatus(false);
        return;
      }

      // Get token details for UI
      const docSnap = await getDoc(doc(db, 'bling_config', 'tokens'));
      const tokenData = docSnap.exists() ? docSnap.data() : null;

      const response = await fetch('/api/bling/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const contentType = response.headers.get('content-type');
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response from status API:', text.substring(0, 200));
        setBlingStatus({ 
          status: 'error', 
          message: `Erro do servidor (${response.status}). Verifique os logs.` 
        });
        return;
      }

      const data = await response.json();
      if (data.status === 'error' && data.debug) {
        console.error('Bling Status Debug Info:', data.debug);
      }
      
      // Inject token info into status
      if (tokenData) {
        data.expiresAt = new Date(tokenData.expires_at).toISOString();
        data.isExpired = Date.now() >= tokenData.expires_at;
      }
      
      setBlingStatus(data);

      // Load lojaId from config
      const configSnap = await getDoc(doc(db, 'bling_config', 'main'));
      if (configSnap.exists()) {
        setLojaId(configSnap.data().lojaId || '');
      }
    } catch (error) {
      console.error('Error checking Bling status:', error);
      setBlingStatus({ status: 'error', message: 'Erro ao conectar com o servidor' });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleTestSearch = async () => {
    if (!searchName) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const { searchBlingCustomers } = await import('@/lib/bling-search');
      const data = await searchBlingCustomers(searchName);
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching Bling:', error);
      setSearchError('Erro de conexão ao buscar no Bling');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Validate origin is from AI Studio preview or localhost
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'BLING_AUTH_SUCCESS') {
        const { access_token, refresh_token, expires_in } = event.data.tokens;
        setIsLoadingStatus(true);
        try {
          await setDoc(doc(db, 'bling_config', 'tokens'), {
            access_token,
            refresh_token,
            expires_at: Date.now() + (expires_in * 1000),
            updated_at: Date.now()
          });
          console.log('Tokens saved to Firestore successfully from popup.');
          checkBlingStatus();
        } catch (error) {
          console.error('Error saving tokens to Firestore:', error);
          alert('Erro ao salvar tokens de autenticação.');
          setIsLoadingStatus(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const saveTokensFromUrl = async () => {
      const blingToken = searchParams.get('bling_token');
      const blingRefresh = searchParams.get('bling_refresh');
      const expiresIn = searchParams.get('expires_in');

      if (blingToken && blingRefresh && expiresIn) {
        setIsLoadingStatus(true);
        try {
          await setDoc(doc(db, 'bling_config', 'tokens'), {
            access_token: blingToken,
            refresh_token: blingRefresh,
            expires_at: Date.now() + (parseInt(expiresIn) * 1000),
            updated_at: Date.now()
          });
          console.log('Tokens saved to Firestore successfully from URL.');
          // Remove tokens from URL
          router.replace('/configuracoes');
          // Check status after saving
          checkBlingStatus();
        } catch (error) {
          console.error('Error saving tokens to Firestore:', error);
          alert('Erro ao salvar tokens de autenticação.');
          setIsLoadingStatus(false);
        }
      } else {
        checkBlingStatus();
      }
    };

    saveTokensFromUrl();
  }, [searchParams, router]);

  const handleAuthBling = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const authWindow = window.open(
      '/api/bling/auth', 
      'bling_oauth', 
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    if (!authWindow) {
      toast.error('Por favor, permita popups para este site para conectar sua conta.');
    }
  };

  const handleResetBling = async () => {
    toast((t) => (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Tem certeza que deseja limpar a conexão com o Bling? Você precisará reautenticar.</p>
        <div className="flex gap-2 justify-end">
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            Cancelar
          </button>
          <button 
            onClick={async () => {
              toast.dismiss(t.id);
              setIsLoadingStatus(true);
              try {
                await deleteDoc(doc(db, 'bling_config', 'tokens'));
                toast.success('Conexão limpa com sucesso!');
                checkBlingStatus();
              } catch (error) {
                console.error('Error resetting Bling:', error);
                toast.error('Erro ao limpar conexão.');
              } finally {
                setIsLoadingStatus(false);
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-rose-500 rounded-md hover:bg-rose-600"
          >
            Confirmar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleSaveLojaId = async () => {
    setIsSavingLojaId(true);
    try {
      await setDoc(doc(db, 'bling_config', 'main'), { lojaId }, { merge: true });
      toast.success('ID da Loja salvo com sucesso!');
    } catch (error) {
      console.error('Error saving lojaId:', error);
      toast.error('Erro ao salvar ID da Loja.');
    } finally {
      setIsSavingLojaId(false);
    }
  };

  const displayRedirectUri = appUrlConfig 
    ? `${appUrlConfig}/api/bling/callback`
    : typeof window !== 'undefined' 
      ? `${window.location.origin}/api/bling/callback` 
      : 'https://.../api/bling/callback';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Configurações e Integrações" />
        
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-8 pb-20">
            
            {/* Bling Integration Card */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Settings className="size-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Integração Bling</h2>
                    <p className="text-xs text-slate-500">Gerencie a conexão com seu ERP Bling</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleResetBling}
                    disabled={isLoadingStatus}
                    className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-xl transition-all text-rose-500"
                    title="Limpar Conexão"
                  >
                    <XCircle className="size-5" />
                  </button>
                  <button 
                    onClick={checkBlingStatus}
                    disabled={isLoadingStatus}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all text-slate-500"
                    title="Atualizar Status"
                  >
                    <RefreshCw className={`size-5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-8">
                {/* Step-by-Step Guide */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="flex items-center justify-center size-5 rounded-full bg-primary text-white text-[10px]">1</span>
                      Configuração no Bling
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3">
                      <p>1. Acesse o <a href="https://www.bling.com.br/configuracoes.integracoes.lojas.virtuais.php" target="_blank" className="text-primary hover:underline font-bold">Painel de Integrações</a>.</p>
                      <p>2. Clique em <b>Incluir Integração</b> e procure por <b>Bling API</b>.</p>
                      <p>3. No campo <b>URL de Callback</b>, insira exatamente a URL abaixo:</p>
                      
                      <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <code className="text-[10px] font-mono text-primary break-all flex-1">
                          {displayRedirectUri}
                        </code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(displayRedirectUri);
                            toast.success('URL copiada!');
                          }}
                          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <RefreshCw className="size-4 text-slate-500" />
                        </button>
                      </div>
                      <p className="text-[10px] text-amber-600 font-medium bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-100 dark:border-amber-900/30">
                        ⚠️ Importante: Se a URL no Bling for diferente desta, a integração falhará com &quot;invalid_client&quot;.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="flex items-center justify-center size-5 rounded-full bg-primary text-white text-[10px]">2</span>
                      Variáveis de Ambiente
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3">
                      <p>No menu <b>Settings</b> do AI Studio, configure as seguintes variáveis:</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                          <span className="font-mono font-bold">BLING_CLIENT_ID</span>
                          <span className="text-slate-400">Obtido no Bling</span>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                          <span className="font-mono font-bold">BLING_CLIENT_SECRET</span>
                          <span className="text-slate-400">Obtido no Bling</span>
                        </div>
                      </div>
                      <p className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/30">
                        Dica: Certifique-se de que não há espaços em branco no início ou fim das chaves.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="flex items-center justify-center size-5 rounded-full bg-primary text-white text-[10px]">3</span>
                      ID da Loja (Bling API)
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3">
                      <p>Insira o ID da Loja gerado na Central de Extensões do Bling para vincular seus pedidos.</p>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={lojaId}
                          onChange={(e) => setLojaId(e.target.value)}
                          placeholder="Ex: 12345678"
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <button 
                          onClick={handleSaveLojaId}
                          disabled={isSavingLojaId}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-[10px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSavingLojaId ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                          Salvar
                        </button>
                      </div>
                      <p className="text-[9px] text-slate-400 italic">
                        Dica: Central de Extensões &gt; Vendas Presenciais &gt; Filial e Loja Física.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex flex-col gap-4">
                  {typeof window !== 'undefined' && blingStatus?.appUrl && !window.location.origin.includes(new URL(blingStatus.appUrl).host) && (
                    <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 flex items-start gap-3">
                      <AlertTriangle className="size-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-rose-800 dark:text-rose-300">Divergência de URL Detectada!</p>
                        <p className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">
                          O servidor está detectando o endereço <code className="bg-rose-100 dark:bg-rose-900/40 px-1 rounded">{blingStatus.appUrl}</code>, 
                          mas você está acessando por <code className="bg-rose-100 dark:bg-rose-900/40 px-1 rounded">{window.location.origin}</code>. 
                          Isso causará erro no Bling. Verifique se a variável <code className="bg-rose-100 dark:bg-rose-900/40 px-1 rounded">APP_URL</code> no Vercel está correta ou remova-a para detecção automática.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <div className="flex-1 w-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status da Conexão:</span>
                      {isLoadingStatus ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : blingStatus?.status === 'success' ? (
                        <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold uppercase">
                          <CheckCircle2 className="size-3" /> Conectado
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-rose-500 text-[10px] font-bold uppercase">
                          <XCircle className="size-3" /> Desconectado
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {isLoadingStatus ? 'Verificando status...' : blingStatus?.message}
                    </p>
                  </div>
                  <button 
                    onClick={handleAuthBling}
                    className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Key className="size-4" /> 
                    {blingStatus?.status === 'success' ? 'Reautenticar Bling' : 'CONECTAR AGORA'}
                  </button>
                </div>
              </div>

                {/* Diagnostic Info */}
                {!isLoadingStatus && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">URL de Redirecionamento (Callback)</p>
                        <button 
                          onClick={() => {
                            if (blingStatus?.expectedRedirectUri) {
                              navigator.clipboard.writeText(blingStatus.expectedRedirectUri);
                              toast.success('URL copiada!');
                            }
                          }}
                          className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1"
                        >
                          <Copy className="size-3" /> Copiar Link
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                        {blingStatus?.expectedRedirectUri || 'Carregando...'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-2 italic">
                        * Este é o link que deve estar no campo &quot;Link de redirecionamento&quot; no Bling.
                      </p>
                    </div>

                    {blingStatus?.authenticated && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Expiração do Token</p>
                          <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                            {blingStatus.expiresAt ? new Date(blingStatus.expiresAt).toLocaleString('pt-BR') : 'N/A'}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status do Token</p>
                          <p className={`text-sm font-bold uppercase ${blingStatus.isExpired ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {blingStatus.isExpired ? 'Expirado' : 'Válido'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Test Search Section */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Teste de Busca de Clientes</h3>
                    <button
                      onClick={async () => {
                        console.log('[Bling Sync] Botão clicado!');
                        if (isLoadingStatus) return;
                        if (!blingStatus?.authenticated) {
                          toast.error('Você precisa conectar o Bling primeiro!');
                          return;
                        }
                        setIsLoadingStatus(true);
                        const loadingToast = toast.loading('Sincronizando clientes... Isso pode levar alguns minutos.');
                        console.log('[Bling Sync] Toast loading exibido:', loadingToast);
                        try {
                          const token = await getValidBlingToken();
                          console.log('[Bling Sync] Token obtido:', !!token);
                          
                          let page = 1;
                          let hasMore = true;
                          let totalSynced = 0;
                          
                          const { db } = await import('@/lib/firebase');
                          const { writeBatch, doc, collection } = await import('firebase/firestore');
                          
                          const normalizeString = (str: string) => {
                            return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                          };
                          
                          while (hasMore && page <= 200) {
                            const res = await fetch(`/api/bling/customers/sync?page=${page}`, {
                              method: 'GET',
                              headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                            });
                            
                            const data = await res.json();
                            
                            if (!res.ok) {
                              throw new Error(data.error || 'Erro ao buscar clientes do Bling');
                            }
                            
                            const contacts = data.contacts || [];
                            if (contacts.length === 0) {
                              hasMore = false;
                              break;
                            }
                            
                            const batch = writeBatch(db);
                            const customersRef = collection(db, 'bling_customers');
                            
                            for (const c of contacts) {
                              try {
                                const detailRes = await fetch(`/api/bling/customers/${c.id}`, {
                                  headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                                });
                                if (detailRes.ok) {
                                  const contentType = detailRes.headers.get('content-type');
                                  if (contentType && contentType.includes('application/json')) {
                                    const detailData = await detailRes.json();
                                    if (detailData.success && detailData.data) {
                                      const fullContact = detailData.data;
                                      const docRef = doc(customersRef, String(c.id));
                                      batch.set(docRef, {
                                        ...fullContact,
                                        updatedAt: Date.now()
                                      }, { merge: true });
                                    }
                                  } else {
                                    const text = await detailRes.text();
                                    console.error(`Resposta não-JSON para o cliente ${c.id}:`, text.substring(0, 200));
                                  }
                                } else {
                                  const errorText = await detailRes.text();
                                  console.error(`Erro ao buscar detalhes do cliente ${c.id}: ${detailRes.status} ${errorText}`);
                                }
                                // Delay to respect Bling API rate limit (3 req/s)
                                await new Promise(resolve => setTimeout(resolve, 350));
                              } catch (err) {
                                console.error(`Erro ao buscar detalhes do cliente ${c.id}:`, err);
                              }
                            }
                            
                            await batch.commit();
                            totalSynced += contacts.length;
                            page++;
                            
                            toast.loading(`Sincronizando detalhes... ${totalSynced} clientes atualizados.`, { id: loadingToast });
                          }

                          toast.success(`Sincronização concluída! ${totalSynced} clientes atualizados.`, { id: loadingToast });
                        } catch (e: any) {
                          console.error('[Bling Sync] Erro no catch:', e);
                          toast.error(`Erro ao sincronizar clientes: ${e.message}`, { id: loadingToast });
                        } finally {
                          setIsLoadingStatus(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                        isLoadingStatus || !blingStatus?.authenticated
                          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                      }`}
                    >
                      <RefreshCw className={`size-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                      Sincronizar Clientes
                    </button>
                    {!showDeleteConfirm ? (
                      <button 
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        <Trash2 className="size-3" />
                        Limpar Dados Locais
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button 
                          onClick={async () => {
                            setIsDeleting(true);
                            const deleteToast = toast.loading('Calculando documentos...');
                            try {
                              const q = query(collection(db, 'bling_customers'));
                              const snapshot = await getDocs(q);
                              
                              if (snapshot.empty) {
                                toast.success('Não há clientes para limpar.', { id: deleteToast });
                                setShowDeleteConfirm(false);
                                return;
                              }

                              const total = snapshot.docs.length;
                              let deleted = 0;
                              
                              for (let i = 0; i < snapshot.docs.length; i += 500) {
                                const batch = writeBatch(db);
                                const chunk = snapshot.docs.slice(i, i + 500);
                                chunk.forEach(doc => batch.delete(doc.ref));
                                await batch.commit();
                                deleted += chunk.length;
                                toast.loading(`Limpando... ${deleted}/${total}`, { id: deleteToast });
                              }
                              
                              toast.success('Dados locais limpos com sucesso.', { id: deleteToast });
                            } catch (error: any) {
                              toast.error(`Erro ao limpar dados: ${error.message}`, { id: deleteToast });
                            } finally {
                              setIsDeleting(false);
                              setShowDeleteConfirm(false);
                            }
                          }}
                          disabled={isDeleting}
                          className="px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          Confirmar Exclusão
                        </button>
                        <button 
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                          className="px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        placeholder="Digite um nome para testar a busca..."
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
                      />
                    </div>
                    <button 
                      onClick={handleTestSearch}
                      disabled={isSearching || !searchName}
                      className="px-6 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                      Testar Busca
                    </button>
                  </div>

                  {/* Search Results */}
                  <AnimatePresence mode="wait">
                    {searchError && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm"
                      >
                        <AlertTriangle className="size-5 shrink-0" />
                        {searchError}
                      </motion.div>
                    )}

                    {searchResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2"
                      >
                        {searchResults.map((customer) => (
                          <div 
                            key={customer.id}
                            className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center hover:border-primary/30 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white text-sm">
                                  {customer.nome}
                                </span>
                                {customer.tipo === 'J' ? (
                                  <span className="text-[9px] font-black bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">CNPJ</span>
                                ) : (
                                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">CPF</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex gap-3 mt-1">
                                <span className="flex items-center gap-1"><Hash className="size-3" /> {customer.numeroDocumento || 'Sem doc'}</span>
                                <span className="flex items-center gap-1"><MapPin className="size-3" /> {customer.endereco?.municipio || 'Sem cidade'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}

                    {!isSearching && searchName && searchResults.length === 0 && !searchError && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-8 text-slate-400"
                      >
                        <User className="size-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm italic">Nenhum cliente encontrado com este nome no Bling.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>

            <ShippingTest />

            {/* Data Recovery Card */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-2xl">
                  <RefreshCw className="size-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recuperação de Dados</h2>
                  <p className="text-xs text-slate-500">Recupere pedidos entre ambientes (Dev/Prod)</p>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Atenção!</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        Se você criou pedidos no ambiente de teste (AI Studio) e eles não aparecem no site oficial (Vercel), 
                        use este botão para migrar os dados.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ambiente Atual:</p>
                    <p className="text-sm font-mono font-bold text-primary">{collectionName === 'orders_dev' ? 'Desenvolvimento (Teste)' : 'Produção (Oficial)'}</p>
                  </div>
                  <button 
                    onClick={async () => {
                      const loadingToast = toast.loading('Verificando dados de teste...');
                      const result = await syncFromDev();
                      if (result.success) {
                        toast.success(result.message, { id: loadingToast });
                      } else {
                        toast.error(result.message, { id: loadingToast });
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="size-4" />
                    Migrar Pedidos do Teste
                  </button>
                </div>
              </div>
            </section>

            {/* Firebase Config Debug Card */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-2xl">
                  <Package className="size-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Informações do Banco de Dados</h2>
                  <p className="text-xs text-slate-500">Verifique se o projeto atual coincide com o antigo</p>
                </div>
              </div>
              <div className="p-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Project ID</p>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">
                      {firebaseConfig.projectId}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Database ID</p>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">
                      {firebaseConfig.firestoreDatabaseId}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  * Compare estes IDs com o arquivo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">firebase-applet-config.json</code> do seu código antigo. Se forem diferentes, o sistema está olhando para um banco de dados novo e vazio.
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
      <SettingsContent />
    </React.Suspense>
  );
}
