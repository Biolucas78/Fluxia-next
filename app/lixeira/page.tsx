'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import { useOrders, useLeads, useUser } from '@/lib/hooks';
import { Trash2, RotateCcw, Search, Loader2, AlertTriangle, Package, User, Calendar, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function LixeiraPage() {
  const { deletedOrders, handleRestoreFromTrashOrder, handlePermanentDeleteOrder, isLoaded: ordersLoaded } = useOrders();
  const { deletedLeads, handleRestoreFromTrashLead, handlePermanentDeleteLead, isLoaded: leadsLoaded } = useLeads();
  const { userProfile, loading: userLoading } = useUser();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pedidos' | 'leads'>('pedidos');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredOrders = (deletedOrders || []).filter(o =>
    o.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLeads = (deletedLeads || []).filter(l =>
    l.nome?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRestore = async (id: string, type: 'pedido' | 'lead') => {
    setIsProcessing(id);
    try {
      if (type === 'pedido') {
        await handleRestoreFromTrashOrder(id);
        toast.success('Pedido restaurado com sucesso!');
      } else {
        await handleRestoreFromTrashLead(id);
        toast.success('Lead restaurado com sucesso!');
      }
    } catch {
      toast.error('Erro ao restaurar. Tente novamente.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handlePermanentDelete = async (id: string, type: 'pedido' | 'lead') => {
    setIsProcessing(id);
    try {
      if (type === 'pedido') {
        await handlePermanentDeleteOrder(id);
        toast.success('Pedido excluído permanentemente.');
      } else {
        await handlePermanentDeleteLead(id);
        toast.success('Lead excluído permanentemente.');
      }
    } catch {
      toast.error('Erro ao excluir. Tente novamente.');
    } finally {
      setIsProcessing(null);
      setConfirmDelete(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return '—';
    }
  };

  if (authLoading || userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!user) return <Login />;

  if (userProfile?.role !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <ShieldAlert className="size-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200">Acesso restrito</h2>
          <p className="text-slate-500 mt-2">A lixeira é exclusiva para administradores.</p>
        </div>
      </div>
    );
  }

  if (!ordersLoaded || !leadsLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <Trash2 className="size-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Lixeira</h1>
                <p className="text-sm text-slate-500">Itens excluídos podem ser restaurados ou removidos permanentemente</p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Itens na lixeira <strong>não aparecem no dashboard</strong> nem nas listas do app. A exclusão permanente não pode ser desfeita.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar na lixeira..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('pedidos')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'pedidos' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
                  >
                    Pedidos ({filteredOrders.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('leads')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'leads' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
                  >
                    Leads ({filteredLeads.length})
                  </button>
                </div>
              </div>

              {activeTab === 'pedidos' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.length === 0 ? (
                    <div className="py-16 text-center">
                      <Trash2 className="size-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-400">Nenhum pedido na lixeira</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {filteredOrders.map(order => (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0">
                              <Package className="size-4 text-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{order.clientName}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                <Calendar className="size-3" />
                                <span>Excluído em {formatDate(order.deletedAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleRestore(order.id, 'pedido')}
                              disabled={isProcessing === order.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-medium hover:bg-emerald-200 transition-colors disabled:opacity-50"
                            >
                              {isProcessing === order.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                              Restaurar
                            </button>
                            {confirmDelete === order.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handlePermanentDelete(order.id, 'pedido')}
                                  disabled={isProcessing === order.id}
                                  className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(order.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium hover:bg-red-200 transition-colors"
                              >
                                <Trash2 className="size-3" />
                                Excluir
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              )}

              {activeTab === 'leads' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLeads.length === 0 ? (
                    <div className="py-16 text-center">
                      <Trash2 className="size-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-400">Nenhum lead na lixeira</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {filteredLeads.map(lead => (
                        <motion.div
                          key={lead.id}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0">
                              <User className="size-4 text-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{lead.nome}</p>
                              <p className="text-xs text-slate-400 truncate">{lead.email || 'Sem e-mail'}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                <Calendar className="size-3" />
                                <span>Excluído em {formatDate(lead.deletedAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleRestore(lead.id, 'lead')}
                              disabled={isProcessing === lead.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-medium hover:bg-emerald-200 transition-colors disabled:opacity-50"
                            >
                              {isProcessing === lead.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                              Restaurar
                            </button>
                            {confirmDelete === lead.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handlePermanentDelete(lead.id, 'lead')}
                                  disabled={isProcessing === lead.id}
                                  className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(lead.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium hover:bg-red-200 transition-colors"
                              >
                                <Trash2 className="size-3" />
                                Excluir
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}