'use client';

import React, { useState } from 'react';
import { useLeads, useUser, useAnalytics } from '@/lib/hooks';
import { Lead } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CRMDashboard from '@/components/CRMDashboard';
import CRMKanban from '@/components/CRMKanban';
import LeadImportModal from '@/components/LeadImportModal';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import { Loader2, LayoutDashboard, Kanban } from 'lucide-react';
import { subDays, format } from 'date-fns';
import Login from '@/components/Login';

export default function CRMPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subDays(new Date(), 30),
    end: new Date(),
    label: 'Últimos 30 dias'
  });

  const { leads, stats, isLoaded, handleCreateLead, handleUpdateLead, handleDeleteLead } = useLeads(dateRange);
  const { analytics, loading: analyticsLoading, error: analyticsError } = useAnalytics(
    format(dateRange.start, 'yyyy-MM-dd'),
    format(dateRange.end, 'yyyy-MM-dd')
  );
  const { userProfile, loading: userLoading, effectiveRole } = useUser();
  const [view, setView] = useState<'dashboard' | 'kanban'>('kanban');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Set default view based on role
  React.useEffect(() => {
    if (effectiveRole === 'gestor_trafego') {
      setView('dashboard');
    } else if (effectiveRole === 'gestor_vendas') {
      setView('kanban');
    }
  }, [effectiveRole]);

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return <Login />;
  }

  // Define columns based on role
  const salesColumns = [
    { id: 'lead', title: 'Lead' },
    { id: '1_mensagem', title: '1ª Mensagem' },
    { id: '2_mensagem', title: '2ª Mensagem' },
    { id: '3_mensagem', title: '3ª Mensagem' },
    { id: '4_mensagem', title: '4ª Mensagem' },
    { id: 'em_conversa', title: 'Em conversa' },
    { id: 'pediu_amostra', title: 'Pediu Amostra' },
    { id: 'nao_responde', title: 'Não Responde' },
    { id: 'pos_amostra', title: 'Contato pós amostra' },
    { id: 'contato_futuro', title: 'Contato Futuro' },
    { id: 'negativo', title: 'Negativo' },
    { id: 'fez_pedido', title: 'Fez Pedido' }
  ];

  const trafficColumns = [
    { id: 'lead', title: 'Lead de Entrada' },
    { id: '1_mensagem', title: 'Novo Lead' },
    { id: 'em_conversa', title: 'Conexão' },
    { id: 'pediu_amostra', title: 'Lead Qualificado' },
    { id: 'pos_amostra', title: 'Follow up' },
    { id: 'fez_pedido', title: 'Venda' },
    { id: 'recorrencia', title: 'Recorrência/Fidelização' }
  ];

  const columns = effectiveRole === 'gestor_trafego' ? trafficColumns : salesColumns;
  const isTraffic = effectiveRole === 'gestor_trafego';
  const showSidebar = effectiveRole !== 'gestor_trafego' || userProfile.role === 'admin';

  const handleCreate = () => {
    if (isTraffic) return;
    setIsImportModalOpen(true);
  };

  const handleImportLead = (leadData: Partial<Lead>) => {
    if (isTraffic) return;
    handleCreateLead(leadData);
  };

  const handleMoveLead = (lead: Lead, direction: 'next' | 'prev') => {
    if (isTraffic) return;
    const currentIndex = columns.findIndex(c => c.id === lead.status);
    if (currentIndex === -1) return;
    
    let newIndex = currentIndex;
    if (direction === 'next' && currentIndex < columns.length - 1) {
      newIndex = currentIndex + 1;
    } else if (direction === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    }
    
    if (newIndex !== currentIndex) {
      handleUpdateLead(lead.id, { status: columns[newIndex].id as any });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      {showSidebar && <Sidebar />}
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={isTraffic ? 'Dashboard CRM - Tráfego' : 'CRM de Vendas'} 
          onNewOrder={!isTraffic ? handleCreate : undefined}
          newOrderLabel="Novo Lead"
        >
          <div className="flex items-center gap-4">
            {view === 'dashboard' && (
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            )}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setView('kanban')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === 'kanban' 
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Kanban className="size-4" />
                Kanban
              </button>
              <button
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === 'dashboard' 
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <LayoutDashboard className="size-4" />
                Dashboard
              </button>
            </div>
          </div>
        </Header>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {!isLoaded ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin size-8 text-primary" />
            </div>
          ) : view === 'dashboard' ? (
            <CRMDashboard 
              stats={stats} 
              leads={leads} 
              role={effectiveRole || userProfile.role} 
              analytics={analytics}
              analyticsLoading={analyticsLoading}
              analyticsError={analyticsError}
            />
          ) : (
            <CRMKanban 
              leads={leads} 
              columns={columns} 
              onUpdateLead={handleUpdateLead}
              onMoveLead={handleMoveLead}
              onDeleteLead={handleDeleteLead}
              readOnly={isTraffic}
              role={effectiveRole || userProfile.role}
            />
          )}
        </div>
      </main>

      {isImportModalOpen && (
        <LeadImportModal 
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImportLead}
        />
      )}
    </div>
  );
}
