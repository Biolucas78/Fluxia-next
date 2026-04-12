'use client';

import { Search, Bell, Plus, MessageSquare, LogOut, User } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useUser } from '@/lib/hooks';

interface HeaderProps {
  title: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onImportWhatsApp?: () => void;
  onSeedOrder?: () => void;
  onNewOrder?: () => void;
  newOrderLabel?: string;
  children?: React.ReactNode;
}

export default function Header({ title, searchQuery, onSearchChange, onImportWhatsApp, onSeedOrder, onNewOrder, newOrderLabel = 'Novo Pedido', children }: HeaderProps) {
  const { userProfile } = useUser();

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live Updates</span>
          </div>
        </div>
        {children}
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
              <Plus className="size-4" /> {newOrderLabel}
            </button>
          )}
        </div>

        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:block text-right">
            <p className="text-xs font-bold text-slate-900 dark:text-white">{userProfile?.email}</p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{userProfile?.role.replace('_', ' ')}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
            title="Sair"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
