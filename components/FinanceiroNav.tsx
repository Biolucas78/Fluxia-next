'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Wallet, CreditCard, TrendingUp, FileText, Receipt } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/financeiro/dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/financeiro/caixa',        label: 'Caixa',         icon: Wallet },
  { href: '/financeiro/contas-pagar', label: 'A Pagar',       icon: CreditCard },
  { href: '/financeiro',              label: 'A Receber',     icon: TrendingUp },
  { href: '/financeiro/ficha',        label: 'Ficha',         icon: Receipt },
  { href: '/financeiro/relatorios',   label: 'Relatórios',    icon: FileText },
];

export default function FinanceiroNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/financeiro') return pathname === '/financeiro';
    return pathname.startsWith(href);
  };

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
      <div className="flex overflow-x-auto no-scrollbar">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all shrink-0 ${
                active
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
