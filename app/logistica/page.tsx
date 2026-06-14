'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import ShippingQuoteModal from '@/components/ShippingQuoteModal';
import { useOrders } from '@/lib/hooks';
import { ShippingOption } from '@/lib/types';
import {
  Truck, Package, MapPin, Loader2, RefreshCw, Tag,
  MessageCircle, ExternalLink, CheckCircle2, Calculator
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';

function getTrackingLink(carrier: string | undefined, trackingNumber: string | undefined, shippingProvider?: string): string {
  if (!trackingNumber) return '#';
  const c = (carrier || shippingProvider || '').toLowerCase();
  if (c.includes('melhor') || c.includes('melhorenvio')) return `https://melhorrastreio.com.br/rastreio/${trackingNumber}`;
  if (c.includes('total') || c.includes('tex')) return `https://totalconecta.totalexpress.com.br/rastreamento`;
  if (c.includes('correio')) return `https://rastreamento.correios.com.br/app/index.php?objeto=${trackingNumber}`;
  if (c.includes('superfrete')) return `https://superfrete.com/rastreio/${trackingNumber}`;
  return `https://www.melhorrastreio.com.br/rastreio/${trackingNumber}`;
}

function getWhatsAppTrackingLink(
  carrier: string | undefined,
  trackingNumber: string | undefined,
  clientPhone: string | undefined,
  tipo: 'pessoal' | 'business'
): string | null {
  if (!trackingNumber || !clientPhone) return null;
  const cleanPhone = clientPhone.replace(/\D/g, '');
  if (!cleanPhone) return null;
  const c = (carrier || '').toLowerCase();
  let msg = '';
  if (c.includes('melhor') || c.includes('envio')) {
    msg = `https://melhorrastreio.com.br/rastreio/${trackingNumber}`;
  } else if (c.includes('total')) {
    msg = `https://totalconecta.totalexpress.com.br/rastreamento\nCódigo: ${trackingNumber}`;
  } else if (c.includes('correio')) {
    msg = `https://rastreamento.correios.com.br/app/index.php?objeto=${trackingNumber}`;
  } else {
    msg = `https://www.melhorrastreio.com.br/rastreio/${trackingNumber}`;
  }
  const encoded = encodeURIComponent(msg);
  if (tipo === 'business') {
    return `intent://send?phone=55${cleanPhone}&text=${encoded}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
  }
  return `https://wa.me/55${cleanPhone}?text=${encoded}`;
}

export default function LogisticaPage() {
  const { orders, handleUpdateOrder, isLoaded } = useOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [showWhatsAppMenuId, setShowWhatsAppMenuId] = useState<string | null>(null);

  // Quick tracking tool
  const [testTracking, setTestTracking] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [trackingResult, setTrackingResult] = useState<any>(null);

  // Quick quote tool
  const [quoteCep, setQuoteCep] = useState('');
  const [quoteHeight, setQuoteHeight] = useState(23);
  const [quoteWidth, setQuoteWidth] = useState(28);
  const [quoteLength, setQuoteLength] = useState(35);
  const [quoteWeightKg, setQuoteWeightKg] = useState(5.3);
  const [quoteValue, setQuoteValue] = useState(560);
  const [quoteOrigin, setQuoteOrigin] = useState<'CRV' | 'BH'>('CRV');
  const [quoteWithInsurance, setQuoteWithInsurance] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteResults, setQuoteResults] = useState<ShippingOption[]>([]);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logisticsOrders = orders.filter(o => {
    if (!['caixa_montada', 'enviado', 'entregue'].includes(o.status)) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    const matchesSearch =
      o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.tradeName && o.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((o as any).trackingNumber && (o as any).trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (startDate) {
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
      status: newStatus,
      statusHistory: [
        ...(order.statusHistory || []),
        { status: newStatus, timestamp: new Date().toISOString() }
      ]
    });
  };

  const handleSyncOrderTracking = async (order: any) => {
    if (!order.trackingNumber && !order.shipmentId) return;
    setSyncingOrderId(order.id);
    try {
      const response = await fetch('/api/shipping/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: order.trackingNumber,
          shipmentId: order.shipmentId,
          shippingProvider: order.shippingProvider,
          carrier: order.carrier,
        })
      });
      const data = await response.json();
      if (response.ok && !data.error) {
        const updatedOrder: any = {
          ...order,
          trackingStatus: data.status,
          trackingHistory: data.history,
          deliveryDate: data.deliveryDate,
          lastTrackingUpdate: new Date().toISOString(),
        };
        if (data.delivered && order.status !== 'entregue') {
          updatedOrder.status = 'entregue';
          updatedOrder.statusHistory = [
            ...(order.statusHistory || []),
            { status: 'entregue', timestamp: data.deliveryDate || new Date().toISOString() }
          ];
          toast.success('Pacote entregue! Status atualizado automaticamente.');
        } else {
          toast.success('Rastreio atualizado!');
        }
        handleUpdateOrder(updatedOrder);
      } else {
        if (data.directLink) {
          toast.error(
            <div className="flex flex-col gap-1">
              <p>{data.error}</p>
              <a href={data.directLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold text-xs">
                Ver na transportadora →
              </a>
            </div>,
            { duration: 6000 }
          );
        } else {
          toast.error(data.error || 'Rastreio não disponível no momento.');
        }
      }
    } catch {
      toast.error('Erro de conexão ao atualizar rastreio.');
    } finally {
      setSyncingOrderId(null);
    }
  };

  const handleQuickTracking = async () => {
    if (!testTracking) return;
    setIsTesting(true);
    setTrackingResult(null);
    try {
      const response = await fetch('/api/shipping/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: testTracking, shipmentId: testTracking })
      });
      const data = await response.json();
      if (response.ok && !data.error) {
        setTrackingResult(data);
      } else {
        setTrackingResult({ error: data.error || 'Código não encontrado.' });
        toast.error(data.error || 'Código não encontrado.');
      }
    } catch {
      toast.error('Erro ao rastrear.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleQuickQuote = async (insuranceOverride?: boolean) => {
    const cleanCep = quoteCep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      toast.error('Informe um CEP válido de 8 dígitos.');
      return;
    }
    const useInsurance = insuranceOverride ?? quoteWithInsurance;
    const weightG = Math.round(quoteWeightKg * 1000);
    const insuranceValue = useInsurance ? quoteValue.toString() : '0';

    setIsQuoting(true);
    setQuoteResults([]);
    setIsQuoteModalOpen(true);

    const quoteBody = JSON.stringify({
      destinationCep: cleanCep,
      weight: weightG,
      boxDimensions: { height: quoteHeight, width: quoteWidth, length: quoteLength },
      originType: quoteOrigin,
      insuranceValue,
    });

    try {
      const [response, texResponse, frenetResponse] = await Promise.all([
        fetch('/api/shipping/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinationCep: cleanCep,
            weight: weightG,
            boxDimensions: { height: quoteHeight, width: quoteWidth, length: quoteLength },
            originType: quoteOrigin,
            insuranceValue,
          })
        }),
        fetch('/api/shipping/quote-tex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: quoteBody }),
        fetch('/api/shipping/quote-frenet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: quoteBody }),
      ]);

      const quotes: ShippingOption[] = response.ok ? await response.json() : [];

      if (texResponse.ok) {
        try {
          const texQuotes = await texResponse.json();
          if (Array.isArray(texQuotes)) {
            texQuotes.forEach((q: any) => quotes.push({
              id: q.id, provider: 'Total Express', name: q.name, price: q.price,
              currency: 'BRL', deliveryTime: q.deliveryTime, delivery_time: q.delivery_time,
              error: null, company: q.company || { name: 'Total Express', picture: '/images/total-express-logo.svg' },
            } as any));
          }
        } catch (_) {}
      }

      if (frenetResponse.ok) {
        try {
          const frenetQuotes = await frenetResponse.json();
          if (Array.isArray(frenetQuotes)) {
            frenetQuotes.forEach((q: any) => quotes.push({
              id: q.id, provider: 'Frenet', name: q.name, price: q.price,
              currency: 'BRL', deliveryTime: q.deliveryTime, delivery_time: q.delivery_time,
              error: null, company: q.company || { name: q.frenetCarrier || 'Frenet', picture: '/images/frenet-logo.svg' },
            } as any));
          }
        } catch (_) {}
      }

      quotes.sort((a, b) => (a.price || 0) - (b.price || 0));
      setQuoteResults(quotes);

      if (quotes.length === 0) {
        toast.error('Nenhuma transportadora disponível para este CEP.');
        setIsQuoteModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cotar frete.');
      setIsQuoteModalOpen(false);
    } finally {
      setIsQuoting(false);
    }
  };

  const handleSetQuoteInsurance = (value: boolean) => {
    if (value === quoteWithInsurance) return;
    setQuoteWithInsurance(value);
    handleQuickQuote(value);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!user) return <Login />;
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

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4">
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
                <div className="flex items-center gap-4">
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
                <div className="flex items-center gap-4">
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
                  onClick={() => { setFilterStatus('all'); setStartDate(''); setEndDate(''); }}
                  className="text-xs font-bold text-primary hover:underline ml-auto"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            {/* Orders List */}
            <div className="space-y-4">
              {logisticsOrders.map((order) => {
                const o = order as any;
                const lastEvent = o.trackingHistory?.[0];
                const isSyncing = syncingOrderId === o.id;
                const waMenuOpen = showWhatsAppMenuId === o.id;
                const hasLabel = !!(o.trackingNumber || o.labelUrl);

                return (
                  <div key={o.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    {/* Top row */}
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                            #{o.id.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            o.status === 'caixa_montada'
                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                              : o.status === 'enviado'
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}>
                            {o.status === 'caixa_montada' ? 'Aguardando Coleta' :
                             o.status === 'enviado' ? 'Em Trânsito' : 'Entregue'}
                          </span>
                          {hasLabel && (
                            <span className="flex items-center gap-1 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded text-[10px] font-bold border border-violet-100 dark:border-violet-800">
                              <Tag className="size-3" /> Etiqueta Emitida
                            </span>
                          )}
                          {o.carrier && (
                            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg">
                              {o.carrier}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">{o.clientName}</h4>
                        <p className="text-xs text-slate-500 flex items-center gap-1 italic">
                          <MapPin className="size-3 shrink-0" /> {o.address}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Postagem:{' '}
                          {o.statusHistory?.find((h: any) => h.status === 'enviado')?.timestamp
                            ? new Date(o.statusHistory.find((h: any) => h.status === 'enviado').timestamp).toLocaleDateString('pt-BR')
                            : new Date(o.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 shrink-0">
                        {o.status === 'caixa_montada' && (
                          <button
                            onClick={() => updateStatus(o, 'enviado')}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                          >
                            <Truck className="size-4" /> Marcar Enviado
                          </button>
                        )}
                        {o.status === 'enviado' && (
                          <button
                            onClick={() => updateStatus(o, 'entregue')}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                          >
                            <MapPin className="size-4" /> Marcar Entregue
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tracking section */}
                    {o.trackingNumber ? (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Rastreio</p>
                            <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">{o.trackingNumber}</span>
                            <a
                              href={getTrackingLink(o.carrier, o.trackingNumber, o.shippingProvider)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-primary"
                              title="Ver rastreio"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                            {/* WhatsApp menu */}
                            <div className="relative">
                              <button
                                onClick={() => {
                                  if (!o.phone) {
                                    toast.error('Telefone do cliente não cadastrado.');
                                    return;
                                  }
                                  setShowWhatsAppMenuId(waMenuOpen ? null : o.id);
                                }}
                                className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded text-emerald-500"
                                title="Enviar rastreio por WhatsApp"
                              >
                                <MessageCircle className="size-3" />
                              </button>
                              {waMenuOpen && o.phone && (
                                <div className="absolute left-0 top-6 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-[140px]">
                                  <p className="text-[9px] font-black text-slate-400 uppercase px-2 pb-1">Enviar de:</p>
                                  <a
                                    href={getWhatsAppTrackingLink(o.carrier, o.trackingNumber, o.phone, 'pessoal')!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setShowWhatsAppMenuId(null)}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                                  >
                                    <MessageCircle className="size-3" /> Pessoal
                                  </a>
                                  <a
                                    href={getWhatsAppTrackingLink(o.carrier, o.trackingNumber, o.phone, 'business')!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setShowWhatsAppMenuId(null)}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold"
                                  >
                                    <MessageCircle className="size-3" /> Business
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Inline sync button */}
                          <button
                            onClick={() => handleSyncOrderTracking(o)}
                            disabled={isSyncing}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                          >
                            <RefreshCw className={`size-3 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Atualizando...' : 'Atualizar Rastreio'}
                          </button>
                        </div>

                        {/* Last tracking event */}
                        {(o.trackingStatus || lastEvent) && (
                          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-start gap-3">
                            <div className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              {o.trackingStatus && (
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  {o.trackingStatus}
                                  {o.deliveryDate && <CheckCircle2 className="size-3 text-emerald-500" />}
                                </p>
                              )}
                              {lastEvent && (
                                <div className="mt-0.5">
                                  <p className="text-[10px] text-slate-500 leading-snug">{lastEvent.message}</p>
                                  {lastEvent.location && (
                                    <p className="text-[10px] text-slate-400 italic">{lastEvent.location}</p>
                                  )}
                                  <p className="text-[9px] text-slate-400 mt-0.5">
                                    {new Date(lastEvent.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {o.lastTrackingUpdate && (
                          <p className="text-[9px] text-slate-400 italic">
                            Última sync: {new Date(o.lastTrackingUpdate).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    ) : o.status !== 'entregue' && (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          Sem código de rastreio. Emita a etiqueta pelo modal de detalhes do pedido.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {logisticsOrders.length === 0 && (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                  <Package className="size-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 italic">Nenhum pedido em logística no momento.</p>
                </div>
              )}
            </div>

            {/* Quick Tracking Tool */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <RefreshCw className="size-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Rastreio Rápido</h4>
                  <p className="text-[10px] text-slate-500">Cole um código de rastreio para verificar o status em qualquer transportadora</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Cole o código de rastreio..."
                  value={testTracking}
                  onChange={(e) => { setTestTracking(e.target.value); setTrackingResult(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickTracking()}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                />
                <button
                  onClick={handleQuickTracking}
                  disabled={isTesting || !testTracking}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isTesting ? <Loader2 className="size-4 animate-spin" /> : 'Rastrear'}
                </button>
              </div>

              {trackingResult && !trackingResult.error && (
                <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      {trackingResult.status}
                      {trackingResult.delivered && <CheckCircle2 className="size-4 text-emerald-500" />}
                    </p>
                    {trackingResult.trackingUrl && (
                      <a
                        href={trackingResult.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1"
                      >
                        Ver detalhes <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {trackingResult.history?.[0] && (
                    <div className="flex gap-2 mt-2">
                      <div className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{trackingResult.history[0].message}</p>
                        {trackingResult.history[0].location && (
                          <p className="text-[10px] text-slate-400 italic">{trackingResult.history[0].location}</p>
                        )}
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {new Date(trackingResult.history[0].date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {trackingResult?.error && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{trackingResult.error}</p>
                </div>
              )}
            </div>

            {/* Quick Quote Tool */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="size-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                  <Calculator className="size-4 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Cotação Rápida de Frete</h4>
                  <p className="text-[10px] text-slate-500">Simule um frete em todas as transportadoras rapidamente</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="col-span-2 md:col-span-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">CEP de Destino *</label>
                  <input
                    type="text"
                    placeholder="00000-000"
                    value={quoteCep}
                    onChange={e => setQuoteCep(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickQuote()}
                    maxLength={9}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Altura (cm)</label>
                  <input
                    type="number"
                    value={quoteHeight}
                    onChange={e => setQuoteHeight(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Largura (cm)</label>
                  <input
                    type="number"
                    value={quoteWidth}
                    onChange={e => setQuoteWidth(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Comprimento (cm)</label>
                  <input
                    type="number"
                    value={quoteLength}
                    onChange={e => setQuoteLength(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={quoteWeightKg}
                    onChange={e => setQuoteWeightKg(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Valor do Pedido (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={quoteValue}
                    onChange={e => setQuoteValue(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Origem</label>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 h-[42px]">
                    <button
                      onClick={() => setQuoteOrigin('CRV')}
                      className={`flex-1 h-full rounded-lg text-xs font-bold transition-all ${quoteOrigin === 'CRV' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
                    >
                      CRV
                    </button>
                    <button
                      onClick={() => setQuoteOrigin('BH')}
                      className={`flex-1 h-full rounded-lg text-xs font-bold transition-all ${quoteOrigin === 'BH' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
                    >
                      BH
                    </button>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => handleQuickQuote()}
                    disabled={isQuoting || !quoteCep}
                    className="w-full py-2.5 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 text-sm"
                  >
                    {isQuoting ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
                    {isQuoting ? 'Cotando...' : 'Cotar Frete'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <ShippingQuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        quotes={quoteResults}
        onSelect={() => {}}
        isQuoting={isQuoting}
        selectedQuote={null}
        withInsurance={quoteWithInsurance}
        onSetInsurance={handleSetQuoteInsurance}
      />
    </div>
  );
}
