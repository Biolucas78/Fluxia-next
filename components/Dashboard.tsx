'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { DashboardStats, Order, ShippingOption, ProductItem } from '@/lib/types';
import { Coffee, Package, Users, TrendingUp, Scale, CheckCircle, Calendar, Filter, Truck, AlertTriangle, ChevronRight, Info, ArrowRight, Beaker, Layers } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { calculateWeightInKg, extractCityState } from '@/lib/parser';
import { motion, AnimatePresence } from 'motion/react';
import ShippingQuote from '@/components/ShippingQuote';
import ProductMappingManager from '@/components/ProductMappingManager';
import { X, MapPin, Globe, TrendingDown } from 'lucide-react';

interface DashboardProps {
  stats: DashboardStats;
  orders: Order[];
  onSeedOrder?: () => void;
  onUpdateOrder?: (order: Order) => void;
}

type FilterType = 'day' | 'week' | 'month';

interface CoffeeNeed {
  type: string;
  neededKg: number;
  stockKg: number;
}

export default function Dashboard({ stats, orders: initialOrders, onSeedOrder, onUpdateOrder }: DashboardProps) {
  const [filter, setFilter] = useState<FilterType>('month');
  const [chartMetric, setChartMetric] = useState<'kg' | 'units' | 'clients'>('kg');
  const [showShippedModal, setShowShippedModal] = useState(false);
  const [selectedOrderForShipping, setSelectedOrderForShipping] = useState<Order | null>(null);
  
  // Global Date Filter
  const [globalStartDate, setGlobalStartDate] = useState<string>('');
  const [globalEndDate, setGlobalEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('custom');

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset === 'custom') return;

    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(now.getDate() - 1);
        end.setDate(now.getDate() - 1);
        break;
      case 'this_week':
        const dayOfWeek = now.getDay();
        const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start.setDate(diffToMonday);
        break;
      case 'last_week':
        const lastWeekDay = now.getDay();
        const lastWeekDiff = now.getDate() - lastWeekDay + (lastWeekDay === 0 ? -6 : 1) - 7;
        start.setDate(lastWeekDiff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'this_month':
        start.setDate(1);
        break;
      case 'last_month':
        start.setMonth(now.getMonth() - 1);
        start.setDate(1);
        end.setMonth(now.getMonth());
        end.setDate(0);
        break;
    }

    // Format to YYYY-MM-DD
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setGlobalStartDate(formatDate(start));
    setGlobalEndDate(formatDate(end));
  };

  const orders = useMemo(() => {
    return initialOrders.filter(o => {
      if (globalStartDate) {
        const orderDate = new Date(o.createdAt);
        const start = new Date(globalStartDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) return false;
      }
      if (globalEndDate) {
        const orderDate = new Date(o.createdAt);
        const end = new Date(globalEndDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) return false;
      }
      return true;
    });
  }, [initialOrders, globalStartDate, globalEndDate]);

  const [coffeeStocks, setCoffeeStocks] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('coffee_stocks');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse coffee stocks', e);
        }
      }
    }
    return {};
  });

  // Save stocks to localStorage when they change
  const updateStock = (type: string, value: number) => {
    const newStocks = { ...coffeeStocks, [type]: value };
    setCoffeeStocks(newStocks);
    localStorage.setItem('coffee_stocks', JSON.stringify(newStocks));
  };

  const roastPlanning = useMemo(() => {
    const needs: Record<string, number> = {};
    
    orders.forEach(order => {
      if (order.status === 'pedidos' || order.status === 'embalagens_separadas') {
        order.products.forEach(product => {
          const isNeeded = order.status === 'pedidos' || !product.checked;
          
          if (isNeeded) {
            let weight = calculateWeightInKg(product.weight, product.quantity);
            let type = product.name;

            // Rule: DripCoffee CX has 100g of Catuaí
            if (type.toLowerCase().includes('dripcoffee')) {
              weight = 0.1 * product.quantity; // 100g = 0.1kg
              type = 'Catuaí';
            }

            needs[type] = (needs[type] || 0) + weight;
          }
        });
      }
    });

    return Object.entries(needs).map(([type, neededKg]) => ({
      type,
      neededKg,
      stockKg: coffeeStocks[type] || 0,
      greenNeeded: Math.max(0, (neededKg - (coffeeStocks[type] || 0)) / 0.8)
    })).sort((a, b) => b.neededKg - a.neededKg);
  }, [orders, coffeeStocks]);

  const packagingDemand = useMemo(() => {
    const demand: Record<string, number> = {};
    
    orders.forEach(order => {
      if (order.status === 'pedidos') {
        order.products.forEach(product => {
          if (!product.checked) {
            const key = `${product.name} ${product.weight}`;
            demand[key] = (demand[key] || 0) + product.quantity;
          }
        });
      }
    });

    return Object.entries(demand).map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [orders]);

  const onShelf = useMemo(() => {
    const shelf: Record<string, number> = {};
    
    orders.forEach(order => {
      // 1. Marked in 'embalagens_separadas'
      if (order.status === 'embalagens_separadas') {
        order.products.forEach(p => {
          if (p.checked) {
            const key = `${p.name} ${p.weight}`;
            shelf[key] = (shelf[key] || 0) + p.quantity;
          }
        });
      }
      // 2. Unmarked in 'embalagens_prontas'
      if (order.status === 'embalagens_prontas') {
        order.products.forEach(p => {
          if (!p.checked) {
            const key = `${p.name} ${p.weight}`;
            shelf[key] = (shelf[key] || 0) + p.quantity;
          }
        });
      }
    });

    return Object.entries(shelf).map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [orders]);

  const productionFunnel = useMemo(() => {
    const counts = {
      pedidos: 0,
      embalagens_separadas: 0,
      embalagens_prontas: 0,
      caixa_montada: 0,
      enviado: 0,
      entregue: 0
    };

    orders.forEach(o => {
      if (counts.hasOwnProperty(o.status)) {
        counts[o.status as keyof typeof counts]++;
      }
    });

    return [
      { name: 'Pedidos', value: counts.pedidos, color: '#f43f5e' },
      { name: 'Separação', value: counts.embalagens_separadas, color: '#64748b' },
      { name: 'Prontas', value: counts.embalagens_prontas, color: '#3b82f6' },
      { name: 'Montagem', value: counts.caixa_montada, color: '#6366f1' },
      { name: 'Enviado', value: counts.enviado, color: '#8b5cf6' },
      { name: 'Entregue', value: counts.entregue, color: '#10b981' }
    ];
  }, [orders]);

  const delayedOrders = useMemo(() => {
    const now = new Date();
    return orders.filter(o => {
      if (o.status === 'entregue' || o.archived) return false;
      const createdAt = new Date(o.createdAt);
      const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays > 2; // More than 2 days
    }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders]);

  const geographyData = useMemo(() => {
    const states: Record<string, number> = {};
    const cities: Record<string, number> = {};

    orders.forEach(order => {
      const { city, state } = extractCityState(order.address || '');
      if (state !== 'N/A') states[state] = (states[state] || 0) + 1;
      if (city !== 'N/A') cities[`${city} (${state})`] = (cities[`${city} (${state})`] || 0) + 1;
    });

    const sortedStates = Object.entries(states).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const sortedCities = Object.entries(cities).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    return { states: sortedStates, cities: sortedCities };
  }, [orders]);

  const shippedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'enviado');
  }, [orders]);

  const chartData = useMemo(() => {
    const now = new Date();
    const data: { name: string; value: number }[] = [];

    const getMetricValue = (filteredOrders: Order[]) => {
      if (chartMetric === 'kg') {
        return filteredOrders.reduce((acc, o) => acc + o.products.reduce((pAcc, p) => pAcc + calculateWeightInKg(p.weight, p.quantity), 0), 0);
      } else if (chartMetric === 'units') {
        return filteredOrders.reduce((acc, o) => acc + o.products.reduce((pAcc, p) => pAcc + p.quantity, 0), 0);
      } else {
        // Clients (Unique client names in that period)
        return new Set(filteredOrders.map(o => o.clientName)).size;
      }
    };

    if (filter === 'day') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        const dayOrders = orders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate.toDateString() === d.toDateString() && 
                 ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
        });
        
        data.push({ name: dateStr, value: Number(getMetricValue(dayOrders).toFixed(2)) });
      }
    } else if (filter === 'week') {
      for (let i = 3; i >= 0; i--) {
        const start = new Date();
        start.setDate(now.getDate() - (i * 7 + now.getDay()));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const weekLabel = `Sem ${4-i}`;
        
        const weekOrders = orders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= start && orderDate <= end && 
                 ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
        });
        
        data.push({ name: weekLabel, value: Number(getMetricValue(weekOrders).toFixed(2)) });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
        
        const monthOrders = orders.filter(o => {
          const orderDate = new Date(o.createdAt);
          return orderDate.getMonth() === d.getMonth() && 
                 orderDate.getFullYear() === d.getFullYear() &&
                 ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(o.status);
        });
        
        data.push({ name: monthName, value: Number(getMetricValue(monthOrders).toFixed(2)) });
      }
    }

    return data;
  }, [orders, filter, chartMetric]);

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
    <div className="space-y-10 pb-10">
      {/* Global Date Filter */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="size-5 text-primary" />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Filtro Global:</span>
        </div>
        <div>
          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:border-primary transition-all text-slate-700 dark:text-slate-300"
          >
            <option value="custom">Personalizado</option>
            <option value="today">Dia Atual</option>
            <option value="yesterday">Dia Anterior</option>
            <option value="this_week">Semana Atual</option>
            <option value="last_week">Semana Anterior</option>
            <option value="this_month">Mês Atual</option>
            <option value="last_month">Mês Anterior</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">De:</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input 
              type="date" 
              value={globalStartDate}
              onChange={(e) => { setGlobalStartDate(e.target.value); setDatePreset('custom'); }}
              className="pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-primary transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Até:</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input 
              type="date" 
              value={globalEndDate}
              onChange={(e) => { setGlobalEndDate(e.target.value); setDatePreset('custom'); }}
              className="pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-primary transition-all"
            />
          </div>
        </div>
        {(globalStartDate || globalEndDate || datePreset !== 'custom') && (
          <button 
            onClick={() => { setGlobalStartDate(''); setGlobalEndDate(''); setDatePreset('custom'); }}
            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-red-500 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/20 rounded-lg transition-all"
          >
            Limpar
          </button>
        )}
      </div>

      {selectedOrderForShipping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <ShippingQuote 
            order={selectedOrderForShipping} 
            onSelectOption={handleSelectShippingOption}
            onClose={() => setSelectedOrderForShipping(null)}
          />
        </div>
      )}

      <AnimatePresence>
        {showShippedModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="bg-violet-100 dark:bg-violet-900/30 p-2 rounded-xl">
                    <Truck className="size-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pedidos Enviados</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Monitoramento de trânsito</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowShippedModal(false)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                  <X className="size-6 text-slate-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-4">
                  {shippedOrders.map(order => {
                    const diffDays = Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                    const isDelayed = diffDays > 5; // Example delay threshold for shipping
                    return (
                      <div key={order.id} className={`p-4 rounded-2xl border flex items-center justify-between ${
                        isDelayed ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700'
                      }`}>
                        <div className="flex items-center gap-4">
                          <div className={`size-12 rounded-xl flex items-center justify-center ${isDelayed ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-600'}`}>
                            <Package className="size-6" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{order.clientName}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">#{order.id.toUpperCase()} • Enviado em {new Date(order.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {isDelayed && (
                            <div className="flex items-center gap-1 text-amber-600 mb-1">
                              <AlertTriangle className="size-3" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Atraso Provável</span>
                            </div>
                          )}
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">{order.carrier || 'Transportadora N/A'}</p>
                        </div>
                      </div>
                    );
                  })}
                  {shippedOrders.length === 0 && (
                    <div className="py-20 text-center">
                      <p className="text-slate-500 font-bold uppercase tracking-widest">Nenhum pedido em trânsito no momento.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECTION: PLANEJAMENTO (O que tem que ser feito) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Planejamento de Torra */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl">
                <Beaker className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Planejamento de Torra</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Café Torrado vs Verde (Drip=100g Catuaí)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Perda: 20%</span>
            </div>
          </div>
          
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 dark:bg-slate-800/30">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Café</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Necessário (Kg)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estoque (Kg)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-primary uppercase tracking-widest text-right">Torrar Verde (Kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {roastPlanning.map((item) => (
                    <tr key={item.type} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{item.type}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-mono font-bold text-slate-600 dark:text-slate-400">
                          {item.neededKg.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="number"
                          step="0.1"
                          value={item.stockKg || ''}
                          onChange={(e) => updateStock(item.type, parseFloat(e.target.value) || 0)}
                          placeholder="0.0"
                          className="w-20 px-2 py-1 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-primary outline-none transition-all"
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-mono font-black ${item.greenNeeded > 0 ? 'text-primary' : 'text-emerald-500'}`}>
                          {item.greenNeeded.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Demanda de Embalagens */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[220px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl">
                  <Layers className="size-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Demanda de Embalagens</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Itens a separar (Fase: Pedidos)</p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {packagingDemand.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{item.name}</span>
                    <span className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg">
                      {item.qty} UN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Na Prateleira */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[220px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
                  <Package className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Na Prateleira</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Prontos aguardando caixa</p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {onShelf.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/20">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">{item.name}</span>
                    <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg">
                      {item.qty} UN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: MONITORAMENTO (O que está sendo feito) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fluxo de Produção */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo de Produção</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Distribuição atual por etapa</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {productionFunnel.map((step) => (
              <div key={step.name} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50 group hover:border-primary/30 transition-all">
                <div className="text-2xl font-black text-slate-900 dark:text-white group-hover:scale-110 transition-transform">
                  {step.value}
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-1000" 
                    style={{ width: `${(step.value / (orders.length || 1)) * 100}%`, backgroundColor: step.color }}
                  />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center leading-tight">
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Alertas</h3>
            </div>
          </div>
          <div className="space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
            {delayedOrders.map((order) => {
              const diffDays = Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={order.id} className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                    <p className="text-[9px] text-red-500 font-black uppercase tracking-widest">Parado há {diffDays} dias</p>
                  </div>
                  <span className="text-[8px] font-black bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30 text-slate-500 uppercase">
                    {order.status.split('_')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monitoramento de Envios */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-violet-100 dark:bg-violet-900/30 p-2 rounded-xl">
              <Truck className="size-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Monitoramento de Envios</h3>
          </div>
          <button 
            onClick={() => setShowShippedModal(true)}
            className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline"
          >
            Ver todos
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shippedOrders.slice(0, 3).map(order => (
            <div key={order.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{order.clientName}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">#{order.id.toUpperCase()}</p>
              </div>
              <span className="text-[9px] font-black text-violet-600 bg-violet-50 dark:bg-violet-900/20 px-2 py-1 rounded-lg uppercase tracking-widest">
                {order.carrier || 'Enviado'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION: RESULTADOS (Dados de Performance) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Produção Total */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Produção Total</p>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
            {stats.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
          </p>
        </div>
        {/* Volume de Itens */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Volume de Itens</p>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
            {stats.totalUnits} unid
          </p>
        </div>
        {/* Clientes Atendidos */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Clientes Atendidos</p>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
            {stats.totalClients}
          </p>
        </div>
      </div>

      {/* Histórico e Geografia */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Histórico Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Histórico de Performance</h3>
              <div className="flex items-center gap-2 mt-1">
                {(['kg', 'units', 'clients'] as const).map(m => (
                  <button 
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md transition-all ${
                      chartMetric === m ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {m === 'kg' ? 'Peso' : m === 'units' ? 'Itens' : 'Clientes'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-center">
              {(['day', 'week', 'month'] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    filter === t ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500'
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                <Tooltip cursor={{ fill: '#f1f5f9', radius: 8 }} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#8B4513' : '#D2B48C'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Geografia de Vendas */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
              <Globe className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Geografia</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Principais Estados</p>
              <div className="space-y-2">
                {geographyData.states.slice(0, 5).map(state => (
                  <div key={state.name} className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{state.name}</span>
                    <span className="text-xs font-black text-primary">{state.value} pedidos</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Principais Cidades</p>
              <div className="space-y-2">
                {geographyData.cities.map(city => (
                  <div key={city.name} className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate pr-2">{city.name}</span>
                    <span className="text-xs font-black text-emerald-500">{city.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
