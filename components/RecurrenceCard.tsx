'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar, Truck, Hourglass, Repeat, Edit2, Save, X, ExternalLink, EyeOff, Clock,
  MessageSquare, RotateCcw, Phone, MapPin, UserRound, Building2, User, StickyNote, AlertTriangle, Loader2,
} from 'lucide-react';
import { ClientRecurrence, RecurrenceColor, RECURRENCE_TAGS, APPROACH_COOLDOWN_DAYS } from '@/lib/recurrence';
import { OrderStatus } from '@/lib/types';

export interface RecurrenceEdits {
  fantasia: string;
  razaoSocial: string;
  contatoNome: string;
  phone: string;
  city: string;
  state: string;
  tags: string[];
  observacao: string;
}

interface RecurrenceCardProps {
  client: ClientRecurrence;
  index: number;
  selected: boolean;
  onToggleSelect: () => void;
  onApproach: () => void;
  onMoveToEnd: () => void;
  onRemove: () => void;
  onReinclude: () => void;
  onSave: (edits: RecurrenceEdits) => Promise<void>;
}

const COLOR_STYLES: Record<RecurrenceColor, { border: string; badge: string; avatar: string; glow: string }> = {
  red: {
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
    avatar: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    glow: 'bg-red-500/5 dark:bg-red-500/10',
  },
  yellow: {
    border: 'border-l-amber-400',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    avatar: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    glow: 'bg-amber-500/5 dark:bg-amber-500/10',
  },
  green: {
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    avatar: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    glow: 'bg-emerald-500/5 dark:bg-emerald-500/10',
  },
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pedidos: 'Pedido lançado',
  embalagens_separadas: 'Emb. separadas',
  embalagens_prontas: 'Emb. prontas',
  caixa_montada: 'Caixa montada',
  enviado: 'Enviado',
  entregue: 'Entregue',
};

export function getOriginTag(origin: string): { label: string; cls: string } {
  const o = (origin || '').toLowerCase();
  if (o.includes('amazon'))   return { label: 'Amazon',      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800' };
  if (o.includes('meli') || o.includes('mercado')) return { label: 'Meli', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' };
  if (o.includes('wix'))      return { label: 'Wix',         cls: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border-pink-200 dark:border-pink-800' };
  if (o === 'whatsapp pf')    return { label: 'WhatsApp PF', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800' };
  if (o.includes('whatsapp')) return { label: 'WhatsApp',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800' };
  if (o.includes('crm'))      return { label: 'CRM',         cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
  return { label: origin || 'N/A', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
}

const formatDate = (iso: string | number) => new Date(iso).toLocaleDateString('pt-BR');

const inputCls = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary focus:border-primary outline-none';
const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block';

export default function RecurrenceCard({
  client, index, selected, onToggleSelect, onApproach, onMoveToEnd, onRemove, onReinclude, onSave,
}: RecurrenceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [edits, setEdits] = useState<RecurrenceEdits | null>(null);

  const style = COLOR_STYLES[client.color];
  const originTag = getOriginTag(client.origin);
  const title = client.fantasia || client.razaoSocial;
  const showRazao = client.razaoSocial && client.razaoSocial !== title;
  const recentlyApproached = client.daysSinceApproach !== null && client.daysSinceApproach < APPROACH_COOLDOWN_DAYS;
  const overCycle = client.cycleDays !== null && client.daysSinceLastOrder > client.cycleDays;

  const startEditing = () => {
    setEdits({
      fantasia: client.fantasia,
      razaoSocial: client.razaoSocial,
      contatoNome: client.contatoNome,
      phone: client.phone,
      city: client.city,
      state: client.state,
      tags: client.tags,
      observacao: client.observacao,
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!edits) return;
    setIsSaving(true);
    try {
      await onSave(edits);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (!edits) return;
    setEdits({ ...edits, tags: edits.tags.includes(tag) ? edits.tags.filter(t => t !== tag) : [...edits.tags, tag] });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 < 0.6 ? index * 0.03 : 0 }}
      className={`p-5 rounded-2xl shadow-sm border border-l-4 ${style.border} flex flex-col justify-between transition-all relative overflow-hidden ${
        selected
          ? 'bg-primary/5 dark:bg-primary/10 border-primary ring-1 ring-primary/30'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
      } ${client.participates ? '' : 'opacity-80'}`}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none ${style.glow}`} />

      {isEditing && edits ? (
        <div className="space-y-3 relative">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Edit2 className="size-3.5" /> Editar cadastro</p>
            <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
              <X className="size-4 text-slate-500" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nome Fantasia</label>
              <input className={inputCls} value={edits.fantasia} onChange={e => setEdits({ ...edits, fantasia: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Razão Social / Nome</label>
              <input className={inputCls} value={edits.razaoSocial} onChange={e => setEdits({ ...edits, razaoSocial: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Contato (dono ou comprador)</label>
              <input className={inputCls} value={edits.contatoNome} placeholder="Ex: João" onChange={e => setEdits({ ...edits, contatoNome: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Telefone / WhatsApp</label>
              <input className={inputCls} value={edits.phone} placeholder="Ex: 31999999999" onChange={e => setEdits({ ...edits, phone: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Cidade</label>
              <input className={inputCls} value={edits.city} onChange={e => setEdits({ ...edits, city: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Estado (UF)</label>
              <input className={inputCls} value={edits.state} maxLength={2} onChange={e => setEdits({ ...edits, state: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <div className="flex flex-wrap gap-2">
              {RECURRENCE_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    edits.tags.includes(tag)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={`${inputCls} min-h-[60px] resize-y`}
              value={edits.observacao}
              placeholder="Ex: prefere contato às terças"
              onChange={e => setEdits({ ...edits, observacao: e.target.value })}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar alterações
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-1 size-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary cursor-pointer shrink-0"
            />
            <div className={`size-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${style.avatar}`}>
              {title.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 dark:text-white truncate" title={title}>{title}</h4>
                  {showRazao && (
                    <p className="text-[11px] text-slate-400 truncate" title={client.razaoSocial}>{client.razaoSocial}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {client.docType && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center gap-1">
                      {client.docType === 'cnpj' ? <Building2 className="size-3" /> : <User className="size-3" />}
                      {client.docType.toUpperCase()}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${originTag.cls}`}>{originTag.label}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3 shrink-0" />
                  {client.contatoNome
                    ? <span className="font-semibold text-slate-700 dark:text-slate-300">{client.contatoNome}</span>
                    : <span className="text-amber-600 dark:text-amber-400 italic">Sem nome do contato</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3 shrink-0" />
                  {client.phone || <span className="text-slate-400 italic">Sem telefone</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3 shrink-0" />
                  {client.city ? `${client.city}${client.state ? ` / ${client.state}` : ''}` : <span className="text-slate-400 italic">Sem cidade</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${style.badge}`}>
              <Calendar className="size-3.5" />
              Último pedido {formatDate(client.lastOrderAt)} · há {client.daysSinceLastOrder} dia{client.daysSinceLastOrder !== 1 ? 's' : ''}
            </span>
            {client.inProgress ? (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
                <Hourglass className="size-3" /> Em andamento: {STATUS_LABELS[client.latestOrder.status] || client.latestOrder.status}
              </span>
            ) : client.deliveryDate ? (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Truck className="size-3" /> Entregue em {formatDate(client.deliveryDate)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Repeat className="size-3" />
              {client.cycleDays !== null
                ? <>Compra a cada ~{client.cycleDays} dias{overCycle && <strong className="text-red-600 dark:text-red-400 ml-1">· passou do ciclo</strong>}</>
                : 'Primeira compra'}
            </span>
            <span>{client.totalOrders} pedido{client.totalOrders !== 1 ? 's' : ''}</span>
          </div>

          {(client.tags.length > 0 || client.daysSinceApproach !== null || client.movedToEndAt) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {client.tags.map(tag => (
                <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-primary/20">{tag}</span>
              ))}
              {client.daysSinceApproach !== null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  recentlyApproached
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {recentlyApproached && <AlertTriangle className="size-3" />}
                  Abordado {client.daysSinceApproach === 0 ? 'hoje' : `há ${client.daysSinceApproach} dia${client.daysSinceApproach !== 1 ? 's' : ''}`}
                  {client.lastChannel && ` (${client.lastChannel === 'business' ? 'Business' : 'Pessoal'})`}
                </span>
              )}
              {client.movedToEndAt && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
                  <Clock className="size-3" /> No fim da fila hoje
                </span>
              )}
            </div>
          )}

          {client.observacao && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-2 flex items-start gap-1">
              <StickyNote className="size-3 shrink-0 mt-0.5" /> {client.observacao}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1">
              <a
                href={`/producao?pedido=${client.latestOrder.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 p-2 text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-[11px] font-bold transition-all"
                title="Abrir o último pedido no Kanban de Produção"
              >
                <ExternalLink className="size-4" /> <span className="hidden sm:inline">Último pedido</span>
              </a>
              <button
                onClick={startEditing}
                className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                title="Editar dados do cliente"
              >
                <Edit2 className="size-4" />
              </button>
            </div>

            {client.participates ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onRemove}
                  className="p-2 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                  title="Remover da recorrência"
                >
                  <EyeOff className="size-4" />
                </button>
                <button
                  onClick={onMoveToEnd}
                  className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-500 rounded-xl transition-all"
                  title="Mover para o fim da fila"
                >
                  <Clock className="size-4" />
                </button>
                <button
                  onClick={onApproach}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                >
                  <MessageSquare className="size-4" /> Abordar
                </button>
              </div>
            ) : (
              <button
                onClick={onReinclude}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all"
              >
                <RotateCcw className="size-4" /> Recolocar na recorrência
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
