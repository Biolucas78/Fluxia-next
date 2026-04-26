'use client';

import React from 'react';
import Image from 'next/image';
import { LayoutDashboard, Plus, Factory, Truck, Settings, User, Package, Kanban, RefreshCcw, Loader2, Archive } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks';

interface SidebarProps {
  onNewOrder?: () => void;
}

export default function Sidebar({ onNewOrder }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, loading, viewMode, changeViewMode, effectiveRole } = useUser();

  const navItems = [
    { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/', roles: ['admin', 'user'] },
    { id: 'producao', title: 'Produção', icon: Factory, href: '/producao', roles: ['admin', 'user'] },
    { id: 'crm', title: 'CRM Leads', icon: Kanban, href: '/crm', roles: ['admin', 'gestor_vendas', 'gestor_trafego'] },
    { id: 'recorrencia', title: 'Recorrência', icon: RefreshCcw, href: '/recorrencia', roles: ['admin', 'gestor_vendas'] },
    { id: 'logistica', title: 'Logística', icon: Truck, href: '/logistica', roles: ['admin', 'user'] },
    { id: 'clientes', title: 'Clientes', icon: User, href: '/clientes', roles: ['admin', 'user'] },
    { id: 'produtos', title: 'Produtos', icon: Package, href: '/produtos', roles: ['admin', 'user'] },
    { id: 'arquivados', title: 'Arquivados', icon: Archive, href: '/arquivados', roles: ['admin', 'user'] },
    { id: 'configuracoes', title: 'Configurações', icon: Settings, href: '/configuracoes', roles: ['admin', 'user'] },
  ];

  if (loading) return null;
  if (!userProfile) return null;

  const currentRole = effectiveRole || userProfile.role;

  const filteredItems = navItems.filter(item => item.roles.includes(currentRole));

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-screen shrink-0">
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
    </aside>
  );
}
