'use client';

import React, { useState } from 'react';
import { X, Loader2, Sparkles, MessageSquare, AlertCircle, CheckCircle2, User, Building2, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Lead } from '@/lib/types';
import { toast } from 'react-hot-toast';

interface LeadImportModalProps {
  onClose: () => void;
  onImport: (lead: Partial<Lead>) => void;
}

export default function LeadImportModal({ onClose, onImport }: LeadImportModalProps) {
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedLead, setParsedLead] = useState<Partial<Lead> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise o texto abaixo e extraia os dados do lead para um formato JSON estruturado. 
        O texto pode ser uma mensagem de WhatsApp, um e-mail ou anotações manuais.
        
        Campos a extrair:
        - nome: Nome da pessoa ou empresa (obrigatório)
        - companyName: Nome da empresa/fantasia
        - responsibleName: Nome do contato/responsável
        - whatsapp: Telefone de contato (formato limpo: 11999999999)
        - email: E-mail de contato
        - cnpj: CNPJ da empresa
        - address: Endereço completo (Rua, número, bairro, cidade, estado)
        - finalidade: "consumo" ou "revenda" (tente inferir pelo contexto)
        - notas: Resumo das intenções ou observações extras
        
        Texto do Lead:
        """
        ${text}
        """`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nome: { type: Type.STRING },
              companyName: { type: Type.STRING },
              responsibleName: { type: Type.STRING },
              whatsapp: { type: Type.STRING },
              email: { type: Type.STRING },
              cnpj: { type: Type.STRING },
              address: { type: Type.STRING },
              finalidade: { type: Type.STRING, enum: ["consumo", "revenda"] },
              notas: { type: Type.STRING }
            },
            required: ["nome"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      if (!result.nome) {
        throw new Error("Não foi possível identificar o nome do lead.");
      }

      setParsedLead({
        ...result,
        origem: 'manual',
        status: '1_mensagem',
        temperature: 'morno'
      });
      
    } catch (error: any) {
      console.error('Error parsing lead with Gemini:', error);
      setError(error.message || 'Erro ao interpretar lead. Tente novamente.');
      toast.error('Erro na interpretação do lead.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (!parsedLead) return;
    onImport(parsedLead);
    toast.success('Lead criado com sucesso!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <MessageSquare className="size-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Importar Lead Manual</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Cole os dados do WhatsApp ou anotações</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-all"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {!parsedLead ? (
            <>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-3">
                <Sparkles className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium leading-relaxed">
                  Nossa IA irá identificar automaticamente o <strong>nome, telefone, empresa, CNPJ e endereço</strong>. 
                  O telefone é essencial para iniciarmos o contato via WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Dados do Lead
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ex: Olá, meu nome é João da Empresa Café Bom, CNPJ 12.345.678/0001-00. Meu zap é 11 99999-9999. Endereço: Rua das Flores, 123, SP. Tenho interesse em revenda."
                  className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none custom-scrollbar"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                  <AlertCircle className="size-4 shrink-0" />
                  <p className="text-xs font-bold">{error}</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">Lead Identificado</h3>
                <button 
                  onClick={() => setParsedLead(null)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Editar texto original
                </button>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{parsedLead.nome}</p>
                      {parsedLead.responsibleName && (
                        <p className="text-xs text-slate-500">Resp: {parsedLead.responsibleName}</p>
                      )}
                    </div>
                  </div>
                  <CheckCircle2 className="size-5 text-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {parsedLead.whatsapp && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Phone className="size-4 text-slate-400" />
                      <span>{parsedLead.whatsapp}</span>
                    </div>
                  )}
                  {parsedLead.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Mail className="size-4 text-slate-400" />
                      <span className="truncate">{parsedLead.email}</span>
                    </div>
                  )}
                  {parsedLead.companyName && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Building2 className="size-4 text-slate-400" />
                      <span className="truncate">{parsedLead.companyName}</span>
                    </div>
                  )}
                  {parsedLead.cnpj && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <FileText className="size-4 text-slate-400" />
                      <span>{parsedLead.cnpj}</span>
                    </div>
                  )}
                </div>

                {parsedLead.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <MapPin className="size-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{parsedLead.address}</span>
                  </div>
                )}

                {parsedLead.notas && (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas Extraídas</p>
                    <p>{parsedLead.notas}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition-all"
          >
            Cancelar
          </button>
          {!parsedLead ? (
            <button
              onClick={handleParse}
              disabled={isProcessing || !text.trim()}
              className="flex-[2] py-3 bg-primary text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  Analisar Texto
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="flex-[2] py-3 bg-emerald-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="size-4" />
              Confirmar e Criar Lead
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
