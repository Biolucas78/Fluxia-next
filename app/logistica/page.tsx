'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import OrderForm from '@/components/OrderForm';
import Login from '@/components/Login';
import { useOrders } from '@/lib/hooks';
import { Truck, Package, MapPin, Search, Loader2, RefreshCw } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';

export default function LogisticaPage() {
  const { orders, handleOrderCreated, handleUpdateOrder, isLoaded } = useOrders();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [testTracking, setTestTracking] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [simulateTracking, setSimulateTracking] = useState('');
  const [simulateStatus, setSimulateStatus] = useState('posted');
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleTestTracking = async () => {
    if (!testTracking) return;
    setIsTesting(true);
    try {
      const response = await fetch('/api/shipping/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trackingNumber: testTracking, 
          shipmentId: testTracking, 
          shippingProvider: 'melhorenvio' 
        })
      });
      const data = await response.json();
      if (response.ok && !data.error) {
        toast.success(`Rastreio encontrado! Status: ${data.status}`);
        if (data.trackingUrl) {
          window.open(data.trackingUrl, '_blank');
        }
        console.log('Resultado do teste:', data);
      } else {
        toast.error(data.error || 'Não encontrado');
      }
    } catch (e) {
      toast.error('Erro ao testar');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSimulateWebhook = async () => {
    if (!simulateTracking) {
      toast.error('Digite um código de rastreio para simular');
      return;
    }
    
    setIsSimulating(true);
    try {
      const response = await fetch('/api/shipping/webhook-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking: simulateTracking, status: simulateStatus })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast.success(`Webhook simulado com sucesso! Status alterado para ${simulateStatus}`);
      } else {
        toast.error(data.error || 'Erro ao simular webhook');
      }
    } catch (error) {
      toast.error('Erro de conexão ao simular webhook');
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Logistics focus: orders in 'caixa_montada', 'enviado', 'entregue'
  const logisticsOrders = orders.filter(o => {
    const isLogisticsStatus = ['caixa_montada', 'enviado', 'entregue'].includes(o.status);
    if (!isLogisticsStatus) return false;

    if (filterStatus !== 'all' && o.status !== filterStatus) return false;

    const matchesSearch = o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (o.tradeName && o.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) || 
                          o.id.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (startDate) {
      // Find posting date (when it became 'enviado') or fallback to createdAt
      const postingHistory = o.statusHistory?.find(h => h.status === 'enviado');
      const dateToCompare = new Date(postingHistory ? postingHistory.timestamp : o.createdAt);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (dateToCompare < start) return false;
    }

    if (endDate) {
      const postingHistory = o.statusHistory?.find(h => h.status === 'enviado');
      const dateToCompare = new Date(postingHistory ? postingHistory.timestamp : o.createdAt);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (dateToCompare > end) return false;
    }

    return true;
  });

  const updateStatus = (order: any, newStatus: string) => {
    handleUpdateOrder({
      ...order,
      status: newStatus
    });
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Logística e Entregas" 
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Test Tool & Webhook Config */}
            <div className="flex flex-col gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <RefreshCw className={`size-4 text-primary ${isTesting ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Testar Rastreio</h4>
                    <p className="text-[10px] text-slate-500">Valide UUIDs ou códigos sem emitir etiquetas</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input 
                    type="text" 
                    placeholder="Cole o UUID ou Código aqui..." 
                    value={testTracking}
                    onChange={(e) => setTestTracking(e.target.value)}
                    className="flex-1 md:w-64 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs outline-none focus:border-primary transition-all"
                  />
                  <button 
                    onClick={handleTestTracking}
                    disabled={isTesting || !testTracking}
                    className="bg-primary text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    Testar
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4 border-l-4 border-l-blue-500">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                      <Truck className="size-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Atualização Automática (Webhooks)</h4>
                      <p className="text-[10px] text-slate-500">Para receber atualizações em tempo real, configure o Webhook no painel do Melhor Envio.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-400">
                  <p><strong>Passo a passo:</strong></p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Acesse o painel do Melhor Envio (Integrações &gt; Área Dev &gt; Seus Aplicativos).</li>
                    <li>Edite seu aplicativo e vá na aba <strong>Webhooks</strong>.</li>
                    <li>Clique em <strong>Novo Webhook</strong>.</li>
                    <li>Cole a URL abaixo e selecione os eventos de rastreamento:</li>
                  </ol>
                  <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
                    <code className="text-[10px] text-blue-600 dark:text-blue-400 select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/melhor-envio` : 'https://seu-app.com/api/webhook/melhor-envio'}
                    </code>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <RefreshCw className="size-3" /> Simulador de Webhook (Testes)
                  </h5>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Código de Rastreio (ex: LGI...)"
                      value={simulateTracking}
                      onChange={(e) => setSimulateTracking(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={simulateStatus}
                      onChange={(e) => setSimulateStatus(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="posted">Postado (Enviado)</option>
                      <option value="delivered">Entregue</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                    <button
                      onClick={handleSimulateWebhook}
                      disabled={isSimulating || !simulateTracking}
                      className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 dark:hover:bg-slate-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSimulating ? <Loader2 className="size-3 animate-spin" /> : 'Simular Evento'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase">Status:</span>
                <select 
                  value={filterStatus} 
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none w-full md:w-auto"
                >
                  <option value="all">Todos</option>
                  <option value="caixa_montada">Caixa Montada</option>
                  <option value="enviado">Enviado</option>
                  <option value="entregue">Entregue</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase">Postagem De:</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none w-full md:w-auto"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase">Até:</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none w-full md:w-auto"
                />
              </div>

              {(filterStatus !== 'all' || startDate || endDate) && (
                <button 
                  onClick={() => {
                    setFilterStatus('all');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs font-bold text-primary hover:underline ml-auto"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Package className="size-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aguardando Coleta</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'caixa_montada').length}
                    </h3>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Truck className="size-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Em Trânsito</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'enviado').length}
                    </h3>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                    <MapPin className="size-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Entregues</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                      {logisticsOrders.filter(o => o.status === 'entregue').length}
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {logisticsOrders.map((order) => (
                <div key={order.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                        #{order.id.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'caixa_montada' ? 'bg-amber-100 text-amber-600' :
                        order.status === 'enviado' ? 'bg-blue-100 text-blue-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {order.status === 'caixa_montada' ? 'Coleta' :
                         order.status === 'enviado' ? 'Trânsito' : 'Entregue'}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{order.clientName}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 italic">
                      <MapPin className="size-3" /> {order.address}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Postagem: {
                        order.statusHistory?.find(h => h.status === 'enviado')?.timestamp 
                          ? new Date(order.statusHistory.find(h => h.status === 'enviado')!.timestamp).toLocaleDateString('pt-BR')
                          : new Date(order.createdAt).toLocaleDateString('pt-BR')
                      }
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {order.carrier && (
                      <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {order.carrier}
                      </span>
                    )}
                    {order.trackingNumber && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-mono text-slate-500">
                          {order.trackingNumber}
                        </span>
                        <a 
                          href={`https://www.melhorrastreio.com.br/rastreio/${order.trackingNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-blue-500 hover:underline font-bold"
                        >
                          Ver no Melhor Rastreio
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {order.status === 'caixa_montada' && (
                      <button 
                        onClick={() => updateStatus(order, 'enviado')}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                      >
                        <Truck className="size-4" /> Marcar Enviado
                      </button>
                    )}
                    {order.status === 'enviado' && (
                      <button 
                        onClick={() => updateStatus(order, 'entregue')}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                      >
                        <MapPin className="size-4" /> Marcar Entregue
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
