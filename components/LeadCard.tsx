'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Lead, UserRole } from '@/lib/types';
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Clock, 
  MoreVertical,
  MousePointer2,
  Target,
  User,
  Building2,
  Thermometer,
  X as CloseIcon,
  AlertCircle,
  Trash2,
  CheckCircle2,
  MapPin,
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
  onMoveLead?: (lead: Lead, direction: 'next' | 'prev') => void;
  onDeleteLead?: (leadId: string) => void;
  role?: UserRole;
}

export default function LeadCard({ lead, onClick, onUpdateLead, onMoveLead, onDeleteLead, role }: LeadCardProps) {
  const isTraffic = role === 'gestor_trafego';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 1200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsExpanded(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteLead) {
      onDeleteLead(lead.id);
    }
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const getOriginIcon = () => {
    switch (lead.origem) {
      case 'landing_page': return <MousePointer2 className="size-3 text-purple-500" />;
      case 'munddi': return <Target className="size-3 text-orange-500" />;
      default: return <User className="size-3 text-blue-500" />;
    }
  };

  const getOriginLabel = () => {
    switch (lead.origem) {
      case 'landing_page': return 'Google Ads';
      case 'munddi': return 'Munddi';
      default: return 'Manual';
    }
  };

  const getTempColor = () => {
    switch (lead.temperature) {
      case 'quente': return 'bg-red-500';
      case 'morno': return 'bg-amber-500';
      case 'gelado': return 'bg-blue-500';
      default: return 'bg-slate-300';
    }
  };

  return (
    <motion.div
      layout
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 hover:border-primary transition-all cursor-pointer group relative overflow-hidden"
    >
      {/* Temperature Bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${getTempColor()}`} />

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-red-500/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle className="size-8 text-white mb-2" />
            <p className="text-white text-xs font-bold mb-3">Excluir este lead?</p>
            <div className="flex gap-2 w-full">
              <button 
                onClick={cancelDelete}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 py-2 bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 py-2 bg-white text-red-600 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Trash2 className="size-3" />
                Confirmar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed View */}
      <div className="flex justify-between items-start gap-2 pl-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 truncate pr-6">
            <h4 className="font-bold text-slate-900 dark:text-white leading-tight truncate">{lead.nome}</h4>
          </div>
          <div className={`flex items-center justify-between mt-1 ${isExpanded ? 'hidden' : 'flex'}`}>
            <div className="flex items-center gap-2">
              {!isTraffic && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  {getOriginIcon()}
                  <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {getOriginLabel()}
                  </span>
                </div>
              )}
              {lead.finalidade && (
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  lead.finalidade === 'revenda' 
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {lead.finalidade}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded View */}
      <div className={`${isExpanded ? 'block' : 'hidden'} mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200 pl-2`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            {!isTraffic && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                {getOriginIcon()}
                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {getOriginLabel()}
                </span>
              </div>
            )}
            {lead.finalidade && (
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                lead.finalidade === 'revenda' 
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                  : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {lead.finalidade}
              </span>
            )}
            <button 
              onClick={handleDelete}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 rounded-lg transition-all"
              title="Excluir Lead"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block">{new Date(lead.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {lead.companyName && (
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mb-2">
            <Building2 className="size-3" /> {lead.companyName}
          </p>
        )}

        {lead.cnpj && (
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mb-2">
            <Hash className="size-3" /> {lead.cnpj}
          </p>
        )}

        {lead.address && (
          <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex gap-1 items-start">
              <MapPin className="size-3 mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{lead.address}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-3">
          {lead.whatsapp && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Phone className="size-3" />
              <span>{lead.whatsapp}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Mail className="size-3" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {onMoveLead && lead.status !== 'lead' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onMoveLead(lead, 'prev');
              }}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Voltar
            </button>
          )}
          {onMoveLead && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onMoveLead(lead, 'next');
              }}
              className="flex-[2] py-1.5 rounded-lg text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20"
            >
              Avançar
              <CheckCircle2 className="size-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
