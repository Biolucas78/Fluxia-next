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
import { Lead, LeadTemperature, LeadHistory, UserRole } from '@/lib/types';
import { toast } from 'react-hot-toast';

interface LeadDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onUpdate: (leadId: string, updates: Partial<Lead>) => void;
  role?: UserRole;
}

const COLUMNS = [
  { id: 'lead', title: 'Lead', color: 'bg-slate-500', textColor: 'text-white' },
  { id: '1_mensagem', title: '1ª Mensagem', color: 'bg-blue-500', textColor: 'text-white' },
  { id: '2_mensagem', title: '2ª Mensagem', color: 'bg-blue-500', textColor: 'text-white' },
  { id: '3_mensagem', title: '3ª Mensagem', color: 'bg-blue-500', textColor: 'text-white' },
  { id: '4_mensagem', title: '4ª Mensagem', color: 'bg-blue-500', textColor: 'text-white' },
  { id: 'em_conversa', title: 'Em conversa', color: 'bg-indigo-500', textColor: 'text-white' },
  { id: 'pediu_amostra', title: 'Pediu Amostra', color: 'bg-violet-500', textColor: 'text-white' },
  { id: 'nao_responde', title: 'Não Responde', color: 'bg-rose-500', textColor: 'text-white' },
  { id: 'pos_amostra', title: 'Contato pós amostra', color: 'bg-amber-500', textColor: 'text-white' },
  { id: 'contato_futuro', title: 'Contato Futuro', color: 'bg-slate-500', textColor: 'text-white' },
  { id: 'negativo', title: 'Negativo', color: 'bg-red-500', textColor: 'text-white' },
  { id: 'fez_pedido', title: 'Fez Pedido', color: 'bg-emerald-500', textColor: 'text-white' }
];

export default function LeadDetailsModal({ lead, onClose, onUpdate, role }: LeadDetailsModalProps) {
  const isTraffic = role === 'gestor_trafego';
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
  const [editedAddress, setEditedAddress] = useState(lead.address || '');

  const [isEditingObservations, setIsEditingObservations] = useState(false);
  const [editedObservations, setEditedObservations] = useState(lead.notes || '');

  const [temperature, setTemperature] = useState<LeadTemperature>(lead.temperature || 'morno');
  const [finalidade, setFinalidade] = useState(lead.finalidade || '');

  const [newInteraction, setNewInteraction] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      await onUpdate(lead.id, { address: editedAddress });
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
      await onUpdate(lead.id, { notes: editedObservations });
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

  const handleAddInteraction = async () => {
    if (!newInteraction.trim()) return;
    
    setIsSaving(true);
    try {
      const historyItem: LeadHistory = {
        status: lead.status,
        timestamp: new Date().toISOString(),
        note: newInteraction
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
                {!isTraffic && (
                  <>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Origem:</span>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{lead.origem === 'landing_page' ? 'Google Ads' : lead.origem}</span>
                  </>
                )}
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Criado em:</span>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                  {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">CNPJ</label>
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
                  <textarea 
                    value={editedAddress}
                    onChange={(e) => setEditedAddress(e.target.value)}
                    rows={3}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                    placeholder="Endereço completo..."
                  />
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {lead.address || 'Nenhum endereço cadastrado.'}
                  </p>
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
                    {lead.notes || 'Nenhuma observação registrada.'}
                  </p>
                )}
              </div>
            </section>

          </div>

          {/* Right Side: History */}
          <div className="w-[400px] flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
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
                        onClick={handleAddInteraction}
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
                  <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center size-10 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {item.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(item.timestamp).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                        {item.note}
                      </p>
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
