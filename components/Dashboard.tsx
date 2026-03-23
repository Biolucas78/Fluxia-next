'use client';

import React, { useState, useMemo } from 'react';
import { DashboardStats, Order, ShippingOption } from '@/lib/types';
import { Coffee, Package, Users, TrendingUp, Scale, CheckCircle, Calendar, Filter, Truck } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { calculateWeightInKg } from '@/lib/parser';
import ShippingTest from '@/components/ShippingTest';
import ShippingQuote from '@/components/ShippingQuote';
import ProductMappingManager from '@/components/ProductMappingManager';

interface DashboardProps {
  stats: DashboardStats;
  orders: Order[];
  onSeedOrder?: () => void;
  onUpdateOrder?: (order: Order) => void;
}

type FilterType = 'day' | 'week' | 'month';

export default function Dashboard({ stats, orders, onSeedOrder, onUpdateOrder }: DashboardProps) {
  const [filter, setFilter] = useState<FilterType>('month');
  const [selectedOrderForShipping, setSelectedOrderForShipping] = useState<Order | null>(null);

  const chartData = useMemo(() => {
    const now = new Date();
    const data: { name: string; value: number }[] = [];

    if (filter === 'day') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        const dayWeight = orders
          .filter(o => {
            const orderDate = new Date(o.createdAt);
            return orderDate.toDateString() === d.toDateString() && 
                   ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
          })
          .reduce((acc, o) => acc + o.products.reduce((pAcc, p) => pAcc + calculateWeightInKg(p.weight, p.quantity), 0), 0);
        
        data.push({ name: dateStr, value: Number(dayWeight.toFixed(2)) });
      }
    } else if (filter === 'week') {
      // Last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const start = new Date();
        start.setDate(now.getDate() - (i * 7 + now.getDay()));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        
        const weekLabel = `Sem ${4-i}`;
        
        const weekWeight = orders
          .filter(o => {
            const orderDate = new Date(o.createdAt);
            return orderDate >= start && orderDate <= end && 
                   ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
          })
          .reduce((acc, o) => acc + o.products.reduce((pAcc, p) => pAcc + calculateWeightInKg(p.weight, p.quantity), 0), 0);
        
        data.push({ name: weekLabel, value: Number(weekWeight.toFixed(2)) });
      }
    } else {
      // Monthly (Last 6 months)
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
        
        const monthWeight = orders
          .filter(o => {
            const orderDate = new Date(o.createdAt);
            return orderDate.getMonth() === d.getMonth() && 
                   orderDate.getFullYear() === d.getFullYear() &&
                   ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
          })
          .reduce((acc, o) => acc + o.products.reduce((pAcc, p) => pAcc + calculateWeightInKg(p.weight, p.quantity), 0), 0);
        
        data.push({ name: monthName, value: Number(monthWeight.toFixed(2)) });
      }
    }

    return data;
  }, [orders, filter]);

  const recentOrders = useMemo(() => {
    return [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  }, [orders]);

  const handleSelectShippingOption = (option: ShippingOption) => {
    if (selectedOrderForShipping && onUpdateOrder) {
      onUpdateOrder({
        ...selectedOrderForShipping,
        selectedShippingOption: option,
        carrier: option.name,
        shippingQuote: [option] // Store the selected one as the quote for now
      });
      setSelectedOrderForShipping(null);
    }
  };

  return (
    <div className="space-y-8">
      {selectedOrderForShipping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <ShippingQuote 
            order={selectedOrderForShipping} 
            onSelectOption={handleSelectShippingOption}
            onClose={() => setSelectedOrderForShipping(null)}
          />
        </div>
      )}
      <ShippingTest />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Total Café Produzido */}
        <div className="flex flex-col gap-2 rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="text-slate-500 text-sm font-medium">Total de Café Produzido</p>
            <div className="bg-primary/10 p-2 rounded-xl">
              <Scale className="size-5 text-primary" />
            </div>
          </div>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-3xl font-bold">
            {stats.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} 
            <span className="text-lg font-medium text-slate-400 ml-1">kg</span>
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="size-3 text-emerald-500" />
            <p className="text-emerald-500 text-xs font-semibold">Produção em tempo real</p>
          </div>
        </div>

        {/* Total de Produtos Produzidos */}
        <div className="flex flex-col gap-2 rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="text-slate-500 text-sm font-medium">Produtos Produzidos</p>
            <div className="bg-amber-500/10 p-2 rounded-xl">
              <Package className="size-5 text-amber-500" />
            </div>
          </div>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-3xl font-bold">
            {stats.totalUnits} 
            <span className="text-lg font-medium text-slate-400 ml-1">unid</span>
          </p>
          <div className="flex items-center gap-1 mt-2">
            <CheckCircle className="size-3 text-emerald-500" />
            <p className="text-emerald-500 text-xs font-semibold">Meta diária ativa</p>
          </div>
        </div>

        {/* Clientes Atendidos */}
        <div className="flex flex-col gap-2 rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="text-slate-500 text-sm font-medium">Clientes Atendidos</p>
            <div className="bg-emerald-500/10 p-2 rounded-xl">
              <Users className="size-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-3xl font-bold">
            {stats.totalClients}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <Coffee className="size-3 text-emerald-500" />
            <p className="text-emerald-500 text-xs font-semibold">Fidelização em alta</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Produção de Café</h3>
              <p className="text-sm text-slate-500">Volume produzido por período</p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {(['day', 'week', 'month'] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    filter === t 
                      ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t === 'day' ? 'Dia' : t === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#64748b' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(val) => `${val}kg`}
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#8B4513' : '#D2B48C'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Monitoring */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Monitoramento</h3>
            <button className="text-primary text-xs font-bold hover:underline">Ver todos</button>
          </div>

          <div className="space-y-4">
            {/* Table Header */}
            <div className="flex items-center gap-4 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800 pb-2">
              <div className="size-10 shrink-0"></div>
              <div className="flex-1 min-w-0">Cliente</div>
              <div className="w-32 hidden md:block text-center">Transportadora</div>
              <div className="w-24 text-right shrink-0">Status</div>
            </div>

            {recentOrders.map((order) => {
              const getCarrierColor = (carrier: string) => {
                const c = carrier.toLowerCase();
                if (c.includes('correio')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
                if (c.includes('total')) return 'bg-red-100 text-red-700 border-red-200';
                if (c.includes('braspress')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
                if (c.includes('melhorenvio') || c.includes('melhor envio')) return 'bg-blue-100 text-blue-700 border-blue-200';
                if (c.includes('lalamove')) return 'bg-orange-100 text-orange-700 border-orange-200';
                return 'bg-slate-100 text-slate-600 border-slate-200';
              };

              const city = (() => {
                if (!order.address) return null;
                const matchUF = order.address.match(/,\s*([^,]+)\s*-\s*[A-Z]{2}/);
                if (matchUF) return matchUF[1].trim();
                const parts = order.address.split(',');
                if (parts.length >= 2) {
                  const cityPart = parts[parts.length - 2];
                  if (cityPart && !cityPart.match(/\d{5}/)) return cityPart.trim();
                }
                return null;
              })();

              return (
                <div key={order.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                  <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                    order.status === 'entregue' ? 'bg-emerald-100 text-emerald-600' :
                    order.status === 'enviado' ? 'bg-violet-100 text-violet-600' :
                    order.status === 'pedidos' ? 'bg-rose-100 text-rose-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <Package className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                      {city && (
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">
                          {city}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-slate-500 font-medium">#{order.id.toUpperCase()} • {new Date(order.createdAt).toLocaleDateString()}</p>
                      {order.trackingNumber && (
                        <span className="text-[9px] text-primary font-mono bg-primary/5 px-1 rounded border border-primary/10">
                          {order.trackingNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="w-32 hidden md:flex justify-center shrink-0">
                    {order.carrier ? (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${getCarrierColor(order.carrier)}`}>
                        {order.carrier}
                      </span>
                    ) : (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderForShipping(order);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-[9px] font-bold rounded-md hover:bg-primary/20 transition-all border border-primary/20"
                      >
                        <Truck className="size-3" />
                        COTAR FRETE
                      </button>
                    )}
                  </div>

                  <div className="w-24 text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                      order.status === 'entregue' ? 'bg-emerald-50 text-emerald-600' :
                      order.status === 'enviado' ? 'bg-blue-50 text-blue-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>
                      {order.status.split('_').join(' ')}
                    </span>
                  </div>
                </div>
              );
            })}

            {recentOrders.length === 0 && (
              <div className="py-12 text-center space-y-4">
                <p className="text-sm text-slate-500 font-medium">Nenhum pedido recente</p>
                {onSeedOrder && (
                  <button 
                    onClick={onSeedOrder}
                    className="px-4 py-2 bg-primary/10 text-primary text-xs font-bold rounded-xl hover:bg-primary/20 transition-all"
                  >
                    Gerar Pedido de Teste
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* <ProductMappingManager /> */}
    </div>
  );
}
