'use client';

import React from 'react';
import Image from 'next/image';
import { LayoutDashboard, Plus, Factory, Truck, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  onNewOrder?: () => void;
}

export default function Sidebar({ onNewOrder }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/' },
    { id: 'producao', title: 'Produção', icon: Factory, href: '/producao' },
    { id: 'logistica', title: 'Logística', icon: Truck, href: '/logistica' },
    { id: 'arquivados', title: 'Arquivados', icon: Settings, href: '/arquivados' },
  ];

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

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {navItems.map((item) => {
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
        
        {onNewOrder && (
          <button 
            onClick={onNewOrder}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left"
          >
            <Plus className="size-5" />
            <span className="text-sm font-semibold">Novo Pedido</span>
          </button>
        )}
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
