'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Plus, Factory, Truck, Settings, User, Package, Kanban, RefreshCcw, Loader2, Archive, Trash2, X, Sun, Moon, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks';
import { AnimatePresence, motion } from 'motion/react';

interface SidebarProps {
  onNewOrder?: () => void;
}

export default function Sidebar({ onNewOrder }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, loading, viewMode, changeViewMode, effectiveRole } = useUser();
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('fluxia-theme');
    setIsDark(saved === 'dark');
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('fluxia-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('fluxia-theme', 'light');
    }
  };

  useEffect(() => {
    const handleToggle = () => setIsOpenMobile((prev) => !prev);
    window.addEventListener('toggleSidebar', handleToggle);
    return () => window.removeEventListener('toggleSidebar', handleToggle);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => setIsOpenMobile(false), 0);
    return () => clearTimeout(timeoutId);
  }, [pathname]);

  const navItems = [
    { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/', roles: ['admin', 'user', 'operador'] },
    { id: 'producao', title: 'Produção', icon: Factory, href: '/producao', roles: ['admin', 'user', 'operador'] },
    { id: 'crm', title: 'CRM Leads', icon: Kanban, href: '/crm', roles: ['admin', 'gestor_vendas', 'gestor_trafego'] },
    { id: 'recorrencia', title: 'Recorrência', icon: RefreshCcw, href: '/recorrencia', roles: ['admin', 'gestor_vendas'] },
    { id: 'financeiro', title: 'Financeiro', icon: DollarSign, href: '/financeiro', roles: ['admin'] },
    { id: 'logistica', title: 'Logística', icon: Truck, href: '/logistica', roles: ['admin', 'user'] },
    { id: 'clientes', title: 'Clientes', icon: User, href: '/clientes', roles: ['admin', 'user'] },
    { id: 'produtos', title: 'Produtos', icon: Package, href: '/produtos', roles: ['admin', 'user'] },
    { id: 'arquivados', title: 'Arquivados', icon: Archive, href: '/arquivados', roles: ['admin', 'user'] },
    { id: 'lixeira', title: 'Lixeira', icon: Trash2, href: '/lixeira', roles: ['admin'] },
    { id: 'configuracoes', title: 'Configurações', icon: Settings, href: '/configuracoes', roles: ['admin', 'user'] },
  ];

  if (loading) return null;
  if (!userProfile) return null;

  const currentRole = effectiveRole || userProfile.role;
  const filteredItems = navItems.filter(item => item.roles.includes(currentRole));

  const sidebarContent = (
    <>
      <div className="p-6 flex items-center gap-3">
        <div className="size-10 rounded-xl flex items-center justify-center text-white bg-primary shadow-lg shadow-primary/20">
          <LayoutDashboard className="size-6" />
        </div>
        <div>
          <h1 className="text-slate-900 dark:text-slate-100 text-sm font-bold leading-tight">Produção Café</h1>
          <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">Unidade Industrial</p>
        </div>
      </div>

      {userProfile.role === 'admin' && (
        <div className="px-4 mb-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Modo de Visualização</p>
            <select 
              value={viewMode || 'admin'} 
              onChange={(e) => {
                const newRole = e.target.value === 'admin' ? null : e.target.value as any;
                changeViewMode(newRole);
                if (newRole === 'gestor_trafego' || newRole === 'gestor_vendas') {
                  router.push('/crm');
                } else {
                  router.push('/');
                }
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs p-1.5 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="admin">Administrador (Eu)</option>
              <option value="gestor_trafego">Gestor de Tráfego</option>
              <option value="gestor_vendas">Gestora de Vendas</option>
            </select>
          </div>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.id} 
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive 
                  ? 'bg-primary text-white shadow-md shadow-primary/20' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <item.icon className="size-5" />
              <span className="text-sm font-semibold">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pb-3 pt-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
        >
          <div className="flex items-center gap-2">
            {isDark ? <Moon className="size-4 text-primary" /> : <Sun className="size-4 text-amber-500" />}
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {isDark ? 'Modo Escuro' : 'Modo Claro'}
            </span>
          </div>
          <div className={`w-8 h-4 rounded-full transition-all ${isDark ? 'bg-primary' : 'bg-slate-300'}`}>
            <div className={`size-4 rounded-full bg-white shadow transition-all ${isDark ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
        </button>
      </div>
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
        <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800">
          <Image 
            src="/logo.png" 
            alt="Fazenda Itaoca Logo" 
            fill
            unoptimized
            className="object-contain"
          />
        </div>
        <div className="text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Produzido por <span className="text-slate-600 dark:text-slate-300">Biolucas Tech</span>
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-screen shrink-0 relative z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isOpenMobile && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpenMobile(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-screen z-50 md:hidden shadow-2xl"
            >
              <button 
                onClick={() => setIsOpenMobile(false)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              >
                <X className="size-5" />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}