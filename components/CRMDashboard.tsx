'use client';

import React from 'react';
import { CRMStats, Lead, UserRole, AnalyticsStats } from '@/lib/types';
import { 
  Users, 
  Target, 
  TrendingUp, 
  MousePointer2,
  BarChart3,
  PieChart as PieChartIcon,
  DollarSign,
  ShoppingBag,
  Smartphone,
  Monitor,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

interface CRMDashboardProps {
  stats: CRMStats;
  leads: Lead[];
  role?: UserRole;
  analytics?: AnalyticsStats | null;
  analyticsLoading?: boolean;
  analyticsError?: string | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function CRMDashboard({ stats, leads, role, analytics, analyticsLoading, analyticsError }: CRMDashboardProps) {
  const isTraffic = role === 'gestor_trafego';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const renderComparison = (value?: number) => {
    if (value === undefined || value === 0) return null;
    const isPositive = value > 0;
    return (
      <div className={`flex items-center gap-0.5 text-[10px] font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
        {isPositive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        {Math.abs(value).toFixed(1)}%
      </div>
    );
  };

  const statCards = [
    {
      title: 'Total de Leads',
      value: stats.totalLeads,
      icon: Users,
      color: 'bg-blue-500',
      change: stats.comparison?.leadsChange,
      description: 'Leads capturados'
    },
    {
      title: 'Vendas Totais',
      value: formatCurrency(stats.totalSalesValue),
      icon: DollarSign,
      color: 'bg-emerald-500',
      change: stats.comparison?.salesValueChange,
      description: 'Valor faturado'
    },
    {
      title: 'Pedidos',
      value: stats.totalOrdersCount,
      icon: ShoppingBag,
      color: 'bg-amber-500',
      change: stats.comparison?.ordersCountChange,
      description: 'Número de pedidos'
    },
    {
      title: 'Sessões Landing Page',
      value: analytics?.sessions || 0,
      icon: MousePointer2,
      color: 'bg-purple-500',
      change: analytics?.sessionsChange,
      description: 'Acessos únicos',
      loading: analyticsLoading
    }
  ];

  const deviceData = analytics ? [
    { name: 'Mobile', value: analytics.sessionsByDevice.mobile },
    { name: 'Desktop', value: analytics.sessionsByDevice.desktop },
    { name: 'Tablet', value: analytics.sessionsByDevice.tablet },
  ].filter(d => d.value > 0) : [];

  const visitorData = analytics ? [
    { name: 'Novos', value: analytics.newVisitors },
    { name: 'Recorrentes', value: analytics.returningVisitors },
  ] : [];

  const channelData = analytics ? [
    { name: 'Orgânico', value: analytics.sessionsByChannel.organic },
    { name: 'Direto', value: analytics.sessionsByChannel.direct },
    { name: 'Outros', value: analytics.sessionsByChannel.other },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-8 pb-10">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-xl ${stat.color} bg-opacity-10`}>
                <stat.icon className="size-5 text-primary" />
              </div>
              {stat.loading ? (
                <Loader2 className="size-3 animate-spin text-slate-300" />
              ) : (
                renderComparison(stat.change)
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stat.title}</p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {stat.loading ? '---' : stat.value}
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">{stat.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              <h3 className="font-semibold text-slate-900 dark:text-white">Tendência de Sessões</h3>
            </div>
            {analyticsLoading && <Loader2 className="size-4 animate-spin text-primary" />}
          </div>
          
          <div className="h-[300px] w-full">
            {analytics?.dailySessions && analytics.dailySessions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.dailySessions}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => val.slice(6, 8) + '/' + val.slice(4, 6)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(val) => `Data: ${val.slice(6, 8)}/${val.slice(4, 6)}/${val.slice(0, 4)}`}
                  />
                  <Area type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSessions)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-4 text-center">
                {analyticsLoading ? (
                  <Loader2 className="size-8 animate-spin" />
                ) : analyticsError ? (
                  <>
                    <AlertCircle className="size-8 text-rose-500 opacity-50" />
                    <p className="text-xs text-rose-500 font-medium">Erro no Google Analytics</p>
                    <p className="text-[10px] max-w-[200px]">{analyticsError}</p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="size-8 opacity-20" />
                    <p className="text-sm">Aguardando dados do Google Analytics...</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Device Distribution */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <Smartphone className="size-5 text-primary" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Dispositivos</h3>
          </div>
          <div className="h-[250px] w-full">
            {deviceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {deviceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <p className="text-xs">Sem dados de dispositivo</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visitors Type */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <Users className="size-5 text-primary" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Novos vs Recorrentes</h3>
          </div>
          <div className="h-[200px] w-full">
            {visitorData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visitorData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <p className="text-xs">Sem dados de visitantes</p>
              </div>
            )}
          </div>
          {analytics && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">Novos</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{analytics.newVisitorsPercent.toFixed(1)}%</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">Recorrentes</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{analytics.returningVisitorsPercent.toFixed(1)}%</p>
              </div>
            </div>
          )}
        </div>

        {/* Traffic Channels */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="size-5 text-primary" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Canais de Tráfego</h3>
          </div>
          <div className="space-y-4">
            {channelData.length > 0 ? channelData.map((channel, index) => (
              <div key={channel.name} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">{channel.name}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{channel.value} sessões</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(channel.value / (analytics?.sessions || 1)) * 100}%` }}
                    className="h-full bg-primary rounded-full" 
                  />
                </div>
              </div>
            )) : (
              <div className="h-[150px] flex items-center justify-center text-slate-400">
                <p className="text-xs">Sem dados de canais</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="size-5 text-primary" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Status dos Leads</h3>
          </div>
          <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
            {Object.entries(stats.leadsByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="text-xs capitalize text-slate-600 dark:text-slate-400">{status.replace(/_/g, ' ')}</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
