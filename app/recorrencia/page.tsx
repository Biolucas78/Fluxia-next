'use client';

import React, { useMemo, useState } from 'react';
import { useOrders, useUser, useRecurrenceMessages, RecurrenceMessages } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Loader2, Calendar, MessageSquare, AlertCircle, Filter, Search, Edit2, X, Send, EyeOff, Save, CheckCircle2, RefreshCw, Settings } from 'lucide-react';
import Login from '@/components/Login';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface ClientRecurrence {
  identifier: string;
  clientName: string;
  phone: string;
  cpf: string;
  cnpj: string;
  origin: string;
  totalOrders: number;
  latestOrder: Order;
  daysSinceDelivered: number;
  daysSinceContact: number | null;
}

const normalizeString = (str?: string) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

export default function RecorrenciaPage() {
  const { allOrders, isLoaded, handleUpdateOrder } = useOrders();
  const { userProfile, loading: userLoading, effectiveRole } = useUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'need_contact' | 'contacted'>('need_contact');

  const [selectedClient, setSelectedClient] = useState<ClientRecurrence | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedContactName, setEditedContactName] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [isEditingData, setIsEditingData] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState('b2b_1');

  const { messages, updateMessages } = useRecurrenceMessages();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingMessages, setEditingMessages] = useState<RecurrenceMessages | null>(null);

  const handleOpenSettings = () => {
    setEditingMessages({ ...messages });
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (editingMessages) {
      await updateMessages(editingMessages);
      setIsSettingsOpen(false);
      toast.success('Frases atualizadas com sucesso!');
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setRefreshTrigger(prev => prev + 1);
      setIsRefreshing(false);
      toast.success('Dados atualizados!');
    }, 600);
  };

  const recurrenceData = useMemo(() => {
    if (!isLoaded) return [];

    const clientsMap = new Map<string, { orders: Order[] }>();

    const getIdentifier = (order: Order) => {
      if (order.cnpj) return order.cnpj.replace(/\D/g, '');
      if (order.cpf) return order.cpf.replace(/\D/g, '');
      if (order.phone) return order.phone.replace(/\D/g, '');
      return normalizeString(order.clientName);
    };

    allOrders.forEach(order => {
      const id = getIdentifier(order);
      if (!id) return;

      if (!clientsMap.has(id)) {
        clientsMap.set(id, { orders: [] });
      }
      clientsMap.get(id)!.orders.push(order);
    });

    const now = new Date();
    const result: ClientRecurrence[] = [];

    clientsMap.forEach((data, identifier) => {
      const sortedOrders = [...data.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const latestOrder = sortedOrders[0];

      if (latestOrder.status !== 'entregue') return;
      if (latestOrder.recurrenceRemoved) return;

      let deliveredAtStr = latestOrder.createdAt;
      
      if (latestOrder.deliveryDate) {
        deliveredAtStr = latestOrder.deliveryDate;
      } else {
        const deliveredHistory = latestOrder.statusHistory?.find(h => h.status === 'entregue');
        if (deliveredHistory) {
          deliveredAtStr = deliveredHistory.timestamp;
        }
      }

      const deliveredDate = new Date(deliveredAtStr);
      const daysSinceDelivered = Math.floor((now.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24));

      let daysSinceContact = null;
      if (latestOrder.lastRecurrenceContact) {
        const contactDate = new Date(latestOrder.lastRecurrenceContact);
        daysSinceContact = Math.floor((now.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      result.push({
        identifier,
        clientName: latestOrder.clientName,
        phone: latestOrder.phone || '',
        cpf: latestOrder.cpf || '',
        cnpj: latestOrder.cnpj || '',
        origin: latestOrder.origin || 'N/A',
        totalOrders: sortedOrders.length,
        latestOrder,
        daysSinceDelivered,
        daysSinceContact
      });
    });

    return result.sort((a, b) => b.daysSinceDelivered - a.daysSinceDelivered);
  }, [allOrders, isLoaded]);

  const filteredData = useMemo(() => {
    return recurrenceData.filter(client => {
      if (searchTerm) {
        const term = normalizeString(searchTerm);
        const matchesName = normalizeString(client.clientName).includes(term);
        const matchesPhone = client.phone?.includes(term);
        if (!matchesName && !matchesPhone) return false;
      }

      if (filterOrigin !== 'all' && client.origin !== filterOrigin) return false;

      if (filterStatus === 'contacted') {
        if (client.daysSinceContact === null || client.daysSinceContact >= 10) return false;
      } else if (filterStatus === 'need_contact') {
        if (client.daysSinceDelivered < 20) return false;
        if (client.daysSinceContact !== null && client.daysSinceContact < 10) return false;
      } else if (filterStatus === 'all') {
        if (client.daysSinceDelivered < 20) return false;
      }

      return true;
    });
  }, [recurrenceData, searchTerm, filterOrigin, filterStatus]);

  const handleOpenClient = (client: ClientRecurrence) => {
    setSelectedClient(client);
    setEditedName(client.clientName);
    setEditedContactName(client.latestOrder.contactName || '');
    setEditedPhone(client.phone || '');
    setIsEditingData(false);
    
    if (client.origin.toLowerCase().includes('pf') || client.origin.toLowerCase() === 'whatsapp' && !client.cnpj) {
      setSelectedMessage('pf_1');
    } else {
      setSelectedMessage('b2b_1');
    }
  };

  const handleUpdateData = async () => {
    if (!selectedClient) return;
    try {
      const orderToUpdate = { ...selectedClient.latestOrder };
      orderToUpdate.clientName = editedName;
      orderToUpdate.contactName = editedContactName;
      if (editedPhone) {
        orderToUpdate.phone = editedPhone;
      }
      orderToUpdate.statusHistory = [
        ...(orderToUpdate.statusHistory || []),
        {
          action: 'Dados atualizados na Recorrência',
          timestamp: new Date().toISOString()
        }
      ];
      await handleUpdateOrder(orderToUpdate);

      if (editedPhone) {
        try {
          const cleanPhone = editedPhone.replace(/\D/g, '');
          const cleanDoc = (selectedClient.cnpj || selectedClient.cpf || '').replace(/\D/g, '');
          const cleanName = normalizeString(selectedClient.clientName);

          const snapshot = await getDocs(collection(db, 'bling_customers'));
          const match = snapshot.docs.find(d => {
            const data = d.data();
            const docNum = (data.numeroDocumento || '').replace(/\D/g, '');
            const nome = normalizeString(data.nome || '');
            const fantasia = normalizeString(data.fantasia || '');

            if (cleanDoc && docNum && cleanDoc === docNum) return true;
            return nome === cleanName || fantasia === cleanName ||
                   nome.includes(cleanName) || fantasia.includes(cleanName);
          });

          if (match) {
            await updateDoc(doc(db, 'bling_customers', match.id), {
              celular: cleanPhone
            });
            toast.success('Dados atualizados e sincronizados com o cadastro de clientes!');
          } else {
            toast.success('Dados atualizados com sucesso!');
          }
        } catch (syncError) {
          console.warn('Não foi possível sincronizar com bling_customers:', syncError);
          toast.success('Dados atualizados! (Sincronização com clientes falhou silenciosamente)');
        }
      } else {
        toast.success('Dados atualizados com sucesso!');
      }

      setIsEditingData(false);
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + e.message);
    }
  };

  const handleDidNotBuy = async () => {
    if (!selectedClient) return;
    try {
      const orderToUpdate = { ...selectedClient.latestOrder };
      orderToUpdate.lastRecurrenceContact = new Date().toISOString();
      
      orderToUpdate.statusHistory = [
        ...(orderToUpdate.statusHistory || []),
        {
          action: 'Contato de Recorrência realizado (Não comprou)',
          timestamp: new Date().toISOString()
        }
      ];

      await handleUpdateOrder(orderToUpdate);
      toast.success('Contato registrado! O cliente retornará para a lista em 10 dias.');
      setSelectedClient(null);
    } catch (e: any) {
      toast.error('Erro ao registrar contato: ' + e.message);
    }
  };

  const [clientToRemove, setClientToRemove] = useState<typeof recurrenceData[0] | null>(null);

  const confirmRemove = async () => {
    if (!clientToRemove) return;
    try {
      const orderToUpdate = { ...clientToRemove.latestOrder };
      orderToUpdate.recurrenceRemoved = true;
      
      orderToUpdate.statusHistory = [
        ...(orderToUpdate.statusHistory || []),
        {
          action: 'Removido da Gestão de Recorrência',
          timestamp: new Date().toISOString()
        }
      ];

      await handleUpdateOrder(orderToUpdate);
      toast.success('Cliente removido da recorrência.');
      setClientToRemove(null);
      if (selectedClient?.identifier === clientToRemove.identifier) {
        setSelectedClient(null);
      }
    } catch (e: any) {
      toast.error('Erro ao remover: ' + e.message);
    }
  };

  const handleQuickRemove = (client: typeof recurrenceData[0]) => {
    setClientToRemove(client);
  };

  const handleRemoveFromRecurrence = () => {
    if (!selectedClient) return;
    setClientToRemove(selectedClient);
  };

  const generateWhatsappUrl = (tipo: 'pessoal' | 'business') => {
    if (!selectedClient) return '#';
    let phone = editedPhone || selectedClient.phone;
    if (!phone) return '#';
    phone = phone.replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const nameToUse = editedContactName || editedName;
    const firstName = nameToUse.split(' ')[0] || 'Cliente';
    const msg = (messages as any)[selectedMessage].replace('{Nome}', firstName);
    const encoded = encodeURIComponent(msg);
    if (tipo === 'business') {
      return `https://b.whatsapp.com/send?phone=${phone}&text=${encoded}`;
    }
    return `https://wa.me/${phone}?text=${encoded}`;
  };

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return <Login />;
  }

  if (effectiveRole === 'gestor_trafego') {
    return (
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <AlertCircle className="size-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito</h1>
          <p className="text-slate-500 text-center max-w-md">Sua função de Gestor de Tráfego não possui permissão para acessar a Gestão de Recorrência.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Header title="Gestão de Recorrência" />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Cabecalho e Filtros */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              
              <div className="relative flex-1 w-full max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar cliente ou celular..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3">
                  <Filter className="size-4 text-slate-400" />
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 outline-none"
                  >
                    <option value="need_contact">Exigem Contato</option>
                    <option value="contacted">Já Contatados (Pausa)</option>
                    <option value="all">Todos (&gt;20 dias entregues)</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3">
                  <select 
                    value={filterOrigin}
                    onChange={(e) => setFilterOrigin(e.target.value)}
                    className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 outline-none"
                  >
                    <option value="all">Todas as Origens</option>
                    <option value="whatsapp">Whatsapp</option>
                    <option value="Whatsapp PF">Whatsapp PF</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Meli">Mercado Livre</option>
                    <option value="Wix">Wix Site</option>
                    <option value="CRM">CRM Manual</option>
                  </select>
                </div>

                <button 
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Atualizar dados manualmente"
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Atualizar</span>
                </button>

                <button 
                  onClick={handleOpenSettings}
                  className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2 px-3 text-sm font-bold transition-all"
                  title="Configurar frases"
                >
                  <Settings className="size-4 text-slate-400" />
                </button>
              </div>

            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">Rotina de Abordagem Ativa</h3>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                  Estes clientes realizaram o último pedido há mais de 20 dias e estão aguardando contato (ou já faz 10 dias do último papo). Mantenha as abordagens em dia para garantir a reposição de estoque.
                </p>
              </div>
            </div>

            {!isLoaded ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin size-8 text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredData.map((client, index) => (
                  <motion.div
                    key={client.identifier}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 < 1 ? index * 0.05 : 0 }}
                    className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-between group hover:border-primary transition-all relative overflow-hidden ${
                      client.daysSinceContact && client.daysSinceContact < 10 
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {client.daysSinceContact === null && client.daysSinceDelivered > 30 && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 dark:bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                    )}

                    <div className="flex items-start gap-4">
                      <div className={`size-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                        client.daysSinceDelivered > 40 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                      }`}>
                        {client.clientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-900 dark:text-white truncate pr-2" title={client.clientName}>
                            {client.clientName}
                          </h4>
                          <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full shrink-0">
                            {client.origin}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {client.phone ? client.phone : <span className="text-slate-400 italic">Sem telefone</span>}
                          </span>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <Calendar className="size-3" />
                            {client.daysSinceDelivered} dias passados
                          </span>
                        </div>
                        
                        {client.daysSinceContact !== null && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-medium bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded inline-block">
                            Última abordagem há {client.daysSinceContact} dias
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex flex-col">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">LTV (Pedidos)</p>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-300">{client.totalOrders}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleQuickRemove(client); }}
                          className="flex items-center justify-center p-2 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                          title="Remover cliente da recorrência"
                        >
                          <EyeOff className="size-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenClient(client)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                          <MessageSquare className="size-4" />
                          Abordar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {filteredData.length === 0 && (
                  <div className="col-span-full text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <CheckCircle2 className="size-12 text-emerald-400 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Tudo atualizado por aqui!</p>
                    <p className="text-sm text-slate-500 mt-1">Nenhum cliente atende aos critérios do filtro de recorrência hoje.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal de Abordagem */}
        <AnimatePresence>
          {selectedClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="size-5 text-primary" />
                    Abordagem Ativa
                  </h3>
                  <button onClick={() => setSelectedClient(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="size-5 text-slate-500" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">

                  {/* Detalhes do Cliente com Edição */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informações de Contato</p>
                      <button 
                        onClick={() => setIsEditingData(!isEditingData)}
                        className="text-[10px] flex items-center gap-1 font-bold text-primary"
                      >
                        {isEditingData ? <X className="size-3" /> : <Edit2 className="size-3" />}
                        {isEditingData ? 'Cancelar' : 'Corrigir Cadastro'}
                      </button>
                    </div>

                    {isEditingData ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nome do Cliente (Empresa)</label>
                          <input 
                            type="text" 
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nome do Contato (Para o Whatsapp)</label>
                          <input 
                            type="text" 
                            value={editedContactName}
                            onChange={(e) => setEditedContactName(e.target.value)}
                            placeholder="Ex: João"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Telefone / WhatsApp</label>
                          <input 
                            type="text" 
                            value={editedPhone}
                            onChange={(e) => setEditedPhone(e.target.value)}
                            placeholder="Ex: 5543999999999"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
                          />
                        </div>
                        <button 
                          onClick={handleUpdateData}
                          className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 mt-2"
                        >
                          <Save className="size-4" /> Salvar Alterações
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {editedName} {editedContactName && <span className="font-normal text-slate-500 text-sm">(Contato: {editedContactName})</span>}
                        </span>
                        <span className="text-sm font-medium text-slate-500">{editedPhone || 'Sem telefone cadastrado'}</span>
                      </div>
                    )}
                  </div>

                  {/* Seleção de Mensagem */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Escolha a Abordagem</p>
                    <select 
                      value={selectedMessage}
                      onChange={(e) => setSelectedMessage(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:ring-primary outline-none transition-all shadow-sm"
                    >
                      <optgroup label="Revenda (B2B)">
                        <option value="b2b_1">Opção 1: Oferta Direta Reposição</option>
                        <option value="b2b_2">Opção 2: Oferta com Agendamento</option>
                        <option value="b2b_3">Opção 3: Relacionamento / Suporte</option>
                      </optgroup>
                      <optgroup label="Pessoa Física (Consumo)">
                        <option value="pf_1">Opção 1: Acabando o estoque</option>
                        <option value="pf_2">Opção 2: Torra Fresquinha</option>
                        <option value="pf_3">Opção 3: Renovar para casa</option>
                      </optgroup>
                    </select>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-400 italic">
                      &quot;{ (messages as any)[selectedMessage].replace('{Nome}', (editedContactName || editedName).split(' ')[0] || 'Cliente') }&quot;
                    </div>
                  </div>
                  
                </div>

                {/* Ações da Abordagem */}
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Iniciar conversa via</p>
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={generateWhatsappUrl('pessoal')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-colors shadow-lg shadow-emerald-500/20 text-center"
                    >
                      <Send className="size-4" />
                      <span className="text-xs">Pessoal</span>
                      <span className="text-[10px] opacity-75">DDD 31</span>
                    </a>
                    <a
                      href={generateWhatsappUrl('business')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-colors shadow-lg shadow-emerald-600/20 text-center"
                    >
                      <Send className="size-4" />
                      <span className="text-xs">Business</span>
                      <span className="text-[10px] opacity-75">DDD 11</span>
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button 
                      onClick={handleDidNotBuy}
                      className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                    >
                      Avisar em 10 dias
                    </button>
                    <button 
                      onClick={handleRemoveFromRecurrence}
                      className="py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <EyeOff className="size-4" /> Não Notificar
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal de Configuração de Frases */}
        <AnimatePresence>
          {isSettingsOpen && editingMessages && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="size-5 text-primary" />
                    Configurar Frases de Abordagem
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="size-5 text-slate-500" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">Revenda (B2B)</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 1: Oferta Direta Reposição</label>
                        <textarea
                          value={editingMessages.b2b_1}
                          onChange={(e) => setEditingMessages({ ...editingMessages, b2b_1: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 2: Oferta com Agendamento</label>
                        <textarea
                          value={editingMessages.b2b_2}
                          onChange={(e) => setEditingMessages({ ...editingMessages, b2b_2: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 3: Relacionamento / Suporte</label>
                        <textarea
                          value={editingMessages.b2b_3}
                          onChange={(e) => setEditingMessages({ ...editingMessages, b2b_3: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">Pessoa Física (Consumo)</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 1: Acabando o estoque</label>
                        <textarea
                          value={editingMessages.pf_1}
                          onChange={(e) => setEditingMessages({ ...editingMessages, pf_1: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 2: Torra Fresquinha</label>
                        <textarea
                          value={editingMessages.pf_2}
                          onChange={(e) => setEditingMessages({ ...editingMessages, pf_2: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Opção 3: Renovar para casa</label>
                        <textarea
                          value={editingMessages.pf_3}
                          onChange={(e) => setEditingMessages({ ...editingMessages, pf_3: e.target.value })}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">Dica:</h3>
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        Use <strong className="font-bold">{'{Nome}'}</strong> (com chaves e N maiúsculo) onde deseja que o nome do cliente seja exibido automaticamente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveSettings}
                    className="py-2.5 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                  >
                    <Save className="size-4" /> Salvar Frases
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {clientToRemove && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setClientToRemove(null)}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
              >
                <div className="p-6">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mb-4">
                    <AlertCircle className="size-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Remover da Recorrência</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Tem certeza que deseja ocultar o cliente <strong className="text-slate-700 dark:text-slate-300">{clientToRemove.clientName}</strong> da listagem de recorrência definitivamente?
                  </p>
                </div>
                
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex justify-end gap-3">
                  <button 
                    onClick={() => setClientToRemove(null)}
                    className="py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmRemove}
                    className="py-2.5 px-6 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
                  >
                    Sim, remover cliente
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
