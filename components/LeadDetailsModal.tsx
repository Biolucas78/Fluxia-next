'use client';

import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Hash, 
  CheckCircle2, 
  History,
  ChevronRight,
  ChevronLeft,
  Calendar,
  User,
  Building2,
  MoreVertical,
  Trash2,
  Edit2,
  Check,
  Plus,
  Loader2,
  Phone,
  Mail,
  Thermometer,
  MessageSquare,
  Save,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, LeadTemperature, LeadHistory, UserRole, Order, ProductItem } from '@/lib/types';
import { toast } from 'react-hot-toast';
import { useOrders } from '@/lib/hooks';

interface LeadDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onUpdate: (leadId: string, updates: Partial<Lead>) => void;
  canEdit?: boolean;
  role?: UserRole;
  onNextLead?: () => void;
  hasNextLead?: boolean;
}

const COLUMNS = [
  { id: '1_mensagem', title: 'Novo Lead', color: 'bg-blue-500', textColor: 'text-white' },
  { id: 'em_conversa', title: 'Conexão', color: 'bg-indigo-500', textColor: 'text-white' },
  { id: 'pediu_amostra', title: 'Lead Qualificado', color: 'bg-violet-500', textColor: 'text-white' },
  { id: 'pos_amostra', title: 'Follow up', color: 'bg-amber-500', textColor: 'text-white' },
  { id: 'fez_pedido', title: 'Venda', color: 'bg-emerald-500', textColor: 'text-white' },
  { id: 'recorrencia', title: 'Recorrência/Fidelização', color: 'bg-rose-500', textColor: 'text-white' },
  { id: 'quarentena', title: 'Quarentena', color: 'bg-slate-500', textColor: 'text-white' }
];

export default function LeadDetailsModal({ lead, onClose, onUpdate, canEdit = true, role, onNextLead, hasNextLead }: LeadDetailsModalProps) {
  const { handleOrderCreated } = useOrders();
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editedCustomer, setEditedCustomer] = useState({
    nome: lead.nome,
    companyName: lead.companyName || '',
    cnpj: lead.cnpj || '',
    whatsapp: lead.whatsapp || '',
    email: lead.email || '',
    responsibleName: lead.responsibleName || ''
  });

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editedAddressDetails, setEditedAddressDetails] = useState(lead.addressDetails || {
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    zip: ''
  });
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsFetchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setEditedAddressDetails(prev => ({
          ...prev,
          street: data.logradouro,
          district: data.bairro,
          city: data.localidade,
          state: data.uf,
          zip: data.cep
        }));
        toast.success('CEP encontrado!');
      } else {
        toast.error('CEP não encontrado');
      }
    } catch (error) {
      toast.error('Erro ao buscar CEP');
    } finally {
      setIsFetchingCep(false);
    }
  };

  const [isEditingObservations, setIsEditingObservations] = useState(false);
  const [editedObservations, setEditedObservations] = useState(lead.notas || '');

  const [temperature, setTemperature] = useState<LeadTemperature>(lead.temperature || 'morno');
  const [finalidade, setFinalidade] = useState(lead.finalidade || '');

  const [newInteraction, setNewInteraction] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editedHistoryNote, setEditedHistoryNote] = useState('');

  const handleAddInteraction = async (note: string = newInteraction) => {
    if (!note.trim()) return;
    
    setIsSaving(true);
    try {
      const historyItem: LeadHistory = {
        id: Math.random().toString(36).substring(2, 9),
        status: lead.status,
        timestamp: new Date().toISOString(),
        note: note
      };
      
      await onUpdate(lead.id, {
        history: [...(lead.history || []), historyItem]
      });
      
      setNewInteraction('');
      toast.success('Interação registrada!');
    } catch (error) {
      toast.error('Erro ao registrar interação');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditHistory = async (historyId: string) => {
    if (!editedHistoryNote.trim()) return;
    setIsSaving(true);
    try {
      const updatedHistory = lead.history.map(h => 
        h.id === historyId ? { ...h, note: editedHistoryNote } : h
      );
      await onUpdate(lead.id, { history: updatedHistory });
      setEditingHistoryId(null);
      toast.success('Interação atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar interação');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHistory = async (historyId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta interação?')) return;
    setIsSaving(true);
    try {
      const updatedHistory = lead.history.filter(h => h.id !== historyId);
      await onUpdate(lead.id, { history: updatedHistory });
      toast.success('Interação excluída!');
    } catch (error) {
      toast.error('Erro ao excluir interação');
    } finally {
      setIsSaving(false);
    }
  };

  const currentColumnIndex = COLUMNS.findIndex(c => c.id === lead.status);
  const currentColumn = COLUMNS[currentColumnIndex] || COLUMNS[0];
  const nextColumn = COLUMNS[currentColumnIndex + 1];
  const prevColumn = COLUMNS[currentColumnIndex - 1];

  const handleSaveCustomer = async () => {
    setIsSaving(true);
    try {
      await onUpdate(lead.id, { ...editedCustomer });
      setIsEditingCustomer(false);
      toast.success('Dados do cliente atualizados!');
    } catch (error) {
      toast.error('Erro ao atualizar dados');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAddress = async () => {
    setIsSaving(true);
    try {
      await onUpdate(lead.id, { addressDetails: editedAddressDetails });
      setIsEditingAddress(false);
      toast.success('Endereço atualizado!');
    } catch (error) {
      toast.error('Erro ao atualizar endereço');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveObservations = async () => {
    setIsSaving(true);
    try {
      await onUpdate(lead.id, { notas: editedObservations });
      setIsEditingObservations(false);
      toast.success('Observações atualizadas!');
    } catch (error) {
      toast.error('Erro ao atualizar observações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateInfo = async (field: string, value: string) => {
    try {
      await onUpdate(lead.id, { [field]: value });
      if (field === 'temperature') setTemperature(value as LeadTemperature);
      if (field === 'finalidade') setFinalidade(value);
      toast.success('Informação atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar informação');
    }
  };

  const handleMoveStatus = async (direction: 'next' | 'prev') => {
    const newStatus = direction === 'next' ? nextColumn?.id : prevColumn?.id;
    if (newStatus) {
      await onUpdate(lead.id, { status: newStatus as any });
      toast.success(`Lead movido para ${direction === 'next' ? nextColumn.title : prevColumn.title}`);
    }
  };

  const getTemperatureColor = (temp: LeadTemperature) => {
    switch (temp) {
      case 'quente': return 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800';
      case 'morno': return 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800';
      case 'gelado': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800';
      default: return 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800';
    }
  };

  const [orderNotes, setOrderNotes] = useState('');

  const handleSendSampleToProduction = async () => {
    if (!lead.sampleType) return;
    setIsSaving(true);
    try {
      let products: ProductItem[] = [];
      
      if (lead.sampleType === 'amostra mista') {
        products = [
          { id: Math.random().toString(36).substring(2, 9), name: 'Catuai', quantity: 1, weight: '250g', grindType: 'moído', checked: false },
          { id: Math.random().toString(36).substring(2, 9), name: 'Bourbon', quantity: 1, weight: '40g', grindType: 'grãos', checked: false },
          { id: Math.random().toString(36).substring(2, 9), name: 'Torra Clara', quantity: 1, weight: '40g', grindType: 'grãos', checked: false },
          { id: Math.random().toString(36).substring(2, 9), name: 'Torra Intensa', quantity: 1, weight: '40g', grindType: 'moído', checked: false },
          { id: Math.random().toString(36).substring(2, 9), name: 'Gourmet', quantity: 1, weight: '40g', grindType: 'moído', checked: false },
          { id: Math.random().toString(36).substring(2, 9), name: 'Yellow', quantity: 1, weight: '40g', grindType: 'grãos', checked: false },
        ];
      } else {
        products = [
          { id: Math.random().toString(36).substring(2, 9), name: 'Amostra de Café', quantity: 1, weight: '250g', grindType: lead.sampleType === 'moído' ? 'moído' : 'grãos', checked: false }
        ];
      }

      const newOrder: Order = {
        id: `amostra-${Date.now()}`,
        clientName: lead.nome,
        tradeName: lead.companyName,
        cnpj: lead.cnpj,
        phone: lead.whatsapp,
        email: lead.email,
        addressDetails: lead.addressDetails,
        products,
        status: 'pedidos',
        hasInvoice: false,
        hasBoleto: false,
        hasOrderDocument: false,
        createdAt: new Date().toISOString(),
        isSample: true,
        observations: 'Amostra solicitada via CRM'
      };

      await handleOrderCreated(newOrder);
      await onUpdate(lead.id, { status: 'pos_amostra' });
      toast.success('Amostra enviada para produção e lead movido para Follow Up!');
    } catch (error) {
      toast.error('Erro ao enviar amostra');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendOrderToProduction = async () => {
    if (!orderNotes.trim()) return;
    setIsSaving(true);
    try {
      const newOrder: Order = {
        id: `pedido-${Date.now()}`,
        clientName: lead.nome,
        tradeName: lead.companyName,
        cnpj: lead.cnpj,
        phone: lead.whatsapp,
        email: lead.email,
        addressDetails: lead.addressDetails,
        products: [], // Products would need to be structured, for now we can put the notes in observations
        status: 'pedidos',
        hasInvoice: false,
        hasBoleto: false,
        hasOrderDocument: false,
        createdAt: new Date().toISOString(),
        observations: orderNotes
      };

      await handleOrderCreated(newOrder);
      toast.success('Pedido enviado para produção!');
      setOrderNotes('');
    } catch (error) {
      toast.error('Erro ao enviar pedido');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAction = async (action: string) => {
    const currentActions = lead.activeActions || [];
    const isActive = currentActions.includes(action);
    const newActions = isActive
      ? currentActions.filter(a => a !== action)
      : [...currentActions, action];

    const historyItem: LeadHistory = {
      id: Math.random().toString(36).substring(2, 9),
      status: lead.status,
      timestamp: new Date().toISOString(),
      note: isActive ? `[Ação] ${action} retirada` : `[Ação] ${action}`
    };

    setIsSaving(true);
    try {
      await onUpdate(lead.id, {
        activeActions: newActions,
        history: [...(lead.history || []), historyItem]
      });
      toast.success(isActive ? 'Ação retirada' : 'Ação registrada');
    } catch (error) {
      toast.error('Erro ao registrar ação');
    } finally {
      setIsSaving(false);
    }
  };

  const renderColumnActions = () => {
    switch (lead.status) {
      case 'em_conversa':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ações Rápidas - Conexão</h4>
            <div className="flex flex-wrap gap-2">
              {['1ª Mensagem', '2ª Mensagem', '3ª Mensagem', '4ª Mensagem', 'Encerramento', 'Em conversa', 'Sem Conexão'].map(action => {
                const isActive = (lead.activeActions || []).includes(action);
                return (
                  <button
                    key={action}
                    onClick={() => handleToggleAction(action)}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-blue-500 text-white hover:bg-blue-600' 
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {action}
                  </button>
                );
              })}
            </div>
          </div>
        );
      case 'quarentena':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ações Rápidas - Quarentena</h4>
            <div className="flex flex-wrap gap-2">
              {['Não responde', 'Rejeitou', 'Pediu contato futuro'].map(action => (
                <button
                  key={action}
                  onClick={() => handleAddInteraction(`[Ação] ${action}`)}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        );
      case 'pediu_amostra':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Amostra</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de Amostra</label>
                <select
                  value={lead.sampleType || ''}
                  onChange={(e) => handleUpdateInfo('sampleType', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  <option value="">Selecione...</option>
                  <option value="em grãos">Em grãos</option>
                  <option value="moído">Moído</option>
                  <option value="amostra mista">Amostra Mista</option>
                </select>
              </div>
              <button
                onClick={handleSendSampleToProduction}
                disabled={!lead.sampleType || isSaving}
                className="w-full py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Enviar Amostra para Produção
              </button>
            </div>
          </div>
        );
      case 'pos_amostra':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ações Rápidas - Follow Up</h4>
            <div className="flex flex-wrap gap-2">
              {['1ª Mensagem amostra', '2ª Mensagem amostra', '3ª Mensagem amostra', 'Encerramento', 'Em conversa'].map(action => (
                <button
                  key={action}
                  onClick={() => handleAddInteraction(`[Ação] ${action}`)}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        );
      case 'fez_pedido':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Venda</h4>
            <div className="space-y-4">
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Detalhes do pedido (produtos, quantidades, etc)..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                rows={3}
              />
              <button
                onClick={handleSendOrderToProduction}
                disabled={!orderNotes.trim() || isSaving}
                className="w-full py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                Enviar Pedido para Produção
              </button>
            </div>
          </div>
        );
      case 'recorrencia':
        return (
          <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ações Rápidas - Recorrência/Fidelização</h4>
            <div className="flex flex-wrap gap-2">
              {['Contato de Pós-venda', 'Oferecer novo pedido', 'Feedback do produto', 'Cliente inativo'].map(action => (
                <button
                  key={action}
                  onClick={() => handleAddInteraction(`[Ação] ${action}`)}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className={`size-12 rounded-2xl flex items-center justify-center font-bold text-xl border ${getTemperatureColor(temperature)}`}>
              {lead.nome.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{lead.nome}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${currentColumn.color} ${currentColumn.textColor}`}>
                  {currentColumn.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getTemperatureColor(temperature)}`}>
                  {temperature}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID:</span>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{lead.id.slice(0, 8)}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Origem:</span>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{lead.origem === 'landing_page' ? 'Google Ads' : lead.origem}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Criado em:</span>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                  {new Date(lead.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              {lead.utm && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {lead.utm.source && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">src: {lead.utm.source}</span>}
                  {lead.utm.medium && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">med: {lead.utm.medium}</span>}
                  {lead.utm.campaign && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">cmp: {lead.utm.campaign}</span>}
                  {lead.utm.term && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">trm: {lead.utm.term}</span>}
                  {lead.utm.content && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">cnt: {lead.utm.content}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasNextLead && (
              <button
                onClick={onNextLead}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                Próximo Lead <ChevronRight className="size-4" />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-all"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Left Side: Info & Notes */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar border-r border-slate-100 dark:border-slate-800">
            
            {/* Dados do Cliente */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <User className="size-3" /> Dados do Cliente
                </h4>
                {!isEditingCustomer ? (
                  <button 
                    onClick={() => setIsEditingCustomer(true)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Edit2 className="size-3" /> Editar
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditingCustomer(false)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSaveCustomer}
                      disabled={isSaving}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Check className="size-3" /> Salvar
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome / Contato</label>
                    {isEditingCustomer ? (
                      <input 
                        type="text" 
                        value={editedCustomer.nome}
                        onChange={(e) => setEditedCustomer({...editedCustomer, nome: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{lead.nome}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Empresa</label>
                    {isEditingCustomer ? (
                      <input 
                        type="text" 
                        value={editedCustomer.companyName}
                        onChange={(e) => setEditedCustomer({...editedCustomer, companyName: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.companyName || '-'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">WhatsApp</label>
                    {isEditingCustomer ? (
                      <input 
                        type="text" 
                        value={editedCustomer.whatsapp}
                        onChange={(e) => setEditedCustomer({...editedCustomer, whatsapp: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.whatsapp || '-'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">E-mail</label>
                    {isEditingCustomer ? (
                      <input 
                        type="email" 
                        value={editedCustomer.email}
                        onChange={(e) => setEditedCustomer({...editedCustomer, email: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.email || '-'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">CPF/CNPJ</label>
                    {isEditingCustomer ? (
                      <input 
                        type="text" 
                        value={editedCustomer.cnpj}
                        onChange={(e) => setEditedCustomer({...editedCustomer, cnpj: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.cnpj || '-'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Responsável</label>
                    {isEditingCustomer ? (
                      <input 
                        type="text" 
                        value={editedCustomer.responsibleName}
                        onChange={(e) => setEditedCustomer({...editedCustomer, responsibleName: e.target.value})}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lead.responsibleName || '-'}</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Endereço */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="size-3" /> Endereço
                </h4>
                {!isEditingAddress ? (
                  <button 
                    onClick={() => setIsEditingAddress(true)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Edit2 className="size-3" /> Editar
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditingAddress(false)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSaveAddress}
                      disabled={isSaving}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Check className="size-3" /> Salvar
                    </button>
                  </div>
                )}
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                {isEditingAddress ? (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">CEP</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={editedAddressDetails.zip}
                            onChange={(e) => setEditedAddressDetails({...editedAddressDetails, zip: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            placeholder="00000-000"
                          />
                          <button
                            onClick={() => fetchCep(editedAddressDetails.zip)}
                            disabled={isFetchingCep || editedAddressDetails.zip.length < 8}
                            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {isFetchingCep ? <Loader2 className="size-4 animate-spin" /> : 'Buscar'}
                          </button>
                        </div>
                      </div>
                      <div className="flex-[2]">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Rua/Logradouro</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.street}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, street: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-1/3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Número</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.number}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, number: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Complemento</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.complement}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, complement: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bairro</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.district}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, district: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cidade</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.city}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, city: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">UF</label>
                        <input 
                          type="text" 
                          value={editedAddressDetails.state}
                          onChange={(e) => setEditedAddressDetails({...editedAddressDetails, state: e.target.value})}
                          maxLength={2}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all uppercase"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {lead.addressDetails ? (
                      <>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {lead.addressDetails.street}{lead.addressDetails.number ? `, ${lead.addressDetails.number}` : ''}
                          {lead.addressDetails.complement ? ` - ${lead.addressDetails.complement}` : ''}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {lead.addressDetails.district}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {lead.addressDetails.city} - {lead.addressDetails.state}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          CEP: {lead.addressDetails.zip}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {lead.address || 'Nenhum endereço cadastrado.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Informações */}
            <section>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Hash className="size-3" /> Informações
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Temperatura</label>
                  <select 
                    value={temperature}
                    onChange={(e) => handleUpdateInfo('temperature', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="quente">Quente</option>
                    <option value="morno">Morno</option>
                    <option value="gelado">Gelado</option>
                  </select>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Finalidade</label>
                  <select 
                    value={finalidade}
                    onChange={(e) => handleUpdateInfo('finalidade', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="">Selecione...</option>
                    <option value="revenda">Revenda</option>
                    <option value="consumo">Consumo Próprio</option>
                    <option value="brinde">Brinde Corporativo</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Observações */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare className="size-3" /> Observações
                </h4>
                {!isEditingObservations ? (
                  <button 
                    onClick={() => setIsEditingObservations(true)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Edit2 className="size-3" /> Editar
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditingObservations(false)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSaveObservations}
                      disabled={isSaving}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Check className="size-3" /> Salvar
                    </button>
                  </div>
                )}
              </div>
              
              <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-100/50 dark:border-amber-900/30">
                {isEditingObservations ? (
                  <textarea 
                    value={editedObservations}
                    onChange={(e) => setEditedObservations(e.target.value)}
                    rows={4}
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none"
                    placeholder="Adicione observações importantes sobre este lead..."
                  />
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {lead.notas || 'Nenhuma observação registrada.'}
                  </p>
                )}
              </div>
            </section>

          </div>

          {/* Right Side: History */}
          <div className="w-[500px] flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
            {/* Action Buttons */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex gap-2">
                <button 
                  onClick={() => handleMoveStatus('prev')}
                  disabled={!prevColumn}
                  className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ChevronLeft className="size-4" />
                  Voltar Fase
                </button>
                <button 
                  onClick={() => handleMoveStatus('next')}
                  disabled={!nextColumn}
                  className="flex-[2] py-3 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Avançar Fase
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* History Timeline */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {renderColumnActions()}
              
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                <History className="size-3" /> Histórico de Status
              </h4>
              
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-800 before:to-transparent">
                {/* Add new interaction */}
                <div className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center size-10 rounded-full border-4 border-white dark:border-slate-900 bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Plus className="size-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <textarea
                      value={newInteraction}
                      onChange={(e) => setNewInteraction(e.target.value)}
                      placeholder="Registrar nova interação..."
                      className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                      rows={2}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleAddInteraction()}
                        disabled={!newInteraction.trim() || isSaving}
                        className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <Send className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* History Items */}
                {lead.history?.slice().reverse().map((item, index) => (
                  <div key={item.id || index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center size-10 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative group/item">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {item.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(item.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      
                      {editingHistoryId === item.id ? (
                        <div className="mt-2">
                          <textarea
                            value={editedHistoryNote}
                            onChange={(e) => setEditedHistoryNote(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                            rows={3}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => setEditingHistoryId(null)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleEditHistory(item.id!)}
                              disabled={isSaving}
                              className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-wrap">
                            {item.note}
                          </p>
                          {item.id && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 p-1">
                              <button
                                onClick={() => {
                                  setEditingHistoryId(item.id!);
                                  setEditedHistoryNote(item.note || '');
                                }}
                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md transition-colors"
                              >
                                <Edit2 className="size-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteHistory(item.id!)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
