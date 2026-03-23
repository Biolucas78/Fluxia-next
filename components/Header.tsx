'use client';

import React from 'react';
import { Search, Bell, Plus, MessageSquare } from 'lucide-react';

interface HeaderProps {
  title: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onNewOrder?: () => void;
  onImportWhatsApp?: () => void;
  onSeedOrder?: () => void;
}

export default function Header({ title, searchQuery, onSearchChange, onNewOrder, onImportWhatsApp, onSeedOrder }: HeaderProps) {
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live Updates</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {onSearchChange && (
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar pedidos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary w-64 transition-all"
            />
          </div>
        )}
        <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl relative transition-colors">
          <Bell className="size-5" />
          <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
        </button>
        
        <div className="flex items-center gap-2">
          {onImportWhatsApp && (
            <button 
              onClick={onImportWhatsApp}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <MessageSquare className="size-4" /> WhatsApp
            </button>
          )}
          {onSeedOrder && (
            <button 
              onClick={onSeedOrder}
              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
            >
              <Plus className="size-4" /> Testar Frete
            </button>
          )}
          {onNewOrder && (
            <button 
              onClick={onNewOrder}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="size-4" /> Novo Pedido
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
