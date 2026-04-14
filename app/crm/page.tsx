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

  // Define unified columns for all roles
  const columns = [
    { id: '1_mensagem', title: 'Novo Lead' },
    { id: 'em_conversa', title: 'Conexão' },
    { id: 'pediu_amostra', title: 'Lead Qualificado' },
    { id: 'pos_amostra', title: 'Follow up' },
    { id: 'fez_pedido', title: 'Venda' },
    { id: 'recorrencia', title: 'Recorrência/Fidelização' },
    { id: 'quarentena', title: 'Quarentena' }
  ];

  const permissions = userProfile.permissions || {} as any;

  const canEdit = permissions.crm_edit ?? true;
  const canCreate = permissions.crm_create ?? true;
  const canDelete = permissions.crm_delete ?? (userProfile.role === 'admin');
  const canRead = permissions.crm_read ?? true;

  const handleCreate = () => {
    if (!canCreate) return;
    setIsImportModalOpen(true);
  };

  const handleImportLead = (leadData: Partial<Lead>) => {
    if (!canCreate) return;
    handleCreateLead(leadData);
  };

  const handleMoveLead = (lead: Lead, direction: 'next' | 'prev') => {
    if (!canEdit) return;
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

  if (!canRead) {
    return (
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito</h1>
          <p className="text-slate-500 text-center max-w-md">Você não tem permissão para visualizar o CRM.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={'CRM de Vendas'} 
          onNewOrder={canCreate ? handleCreate : undefined}
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
              readOnly={!canEdit}
              canDelete={canDelete}
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
