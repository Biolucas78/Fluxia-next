'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { useInventory } from '@/lib/hooks';
import { motion, AnimatePresence } from 'motion/react';
import ShippingQuote from '@/components/ShippingQuote';
import BulkCheckModal from '@/components/BulkCheckModal';
import ProductMappingManager from '@/components/ProductMappingManager';
import { X, Loader2, MapPin, Globe, TrendingDown, RotateCcw } from 'lucide-react';

interface DashboardProps {
  stats: DashboardStats;
  orders: Order[];
  onUpdateOrder?: (order: Order) => void;
}

type FilterType = 'day' | 'week' | 'month';

interface CoffeeNeed {
  type: string;
  neededKg: number;
  stockKg: number;
  greenNeeded: number;
  roastOutput: number;
  greenInput: number;
}

export default function Dashboard({ stats, orders: initialOrders, onUpdateOrder }: DashboardProps) {
  const [filter, setFilter] = useState<FilterType>('month');
  const [chartMetric, setChartMetric] = useState<'kg' | 'units' | 'clients'>('kg');
  const [showShippedModal, setShowShippedModal] = useState(false);
  const [showSeparationModal, setShowSeparationModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [separationHistory, setSeparationHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [selectedPackagingItem, setSelectedPackagingItem] = useState<{name: string; matchKey: string; qty: number; clientes?: string[]} | null>(null);
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
      case 'this_year':
        start.setMonth(0, 1);
        break;
      case 'last_year':
        start.setFullYear(now.getFullYear() - 1, 0, 1);
        end.setFullYear(now.getFullYear() - 1, 11, 31);
        break;
      default:
        // Mês específico: formato "month_YYYY_MM"
        if (preset.startsWith('month_')) {
          const parts = preset.split('_');
          const year = parseInt(parts[1]);
          const month = parseInt(parts[2]) - 1; // 0-based
          start = new Date(year, month, 1);
          end = new Date(year, month + 1, 0); // último dia do mês
        }
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

  const filteredStats = useMemo(() => {
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    let totalKg = 0;
    let totalUnits = 0;
    const clients = new Set<string>();
    let totalOrders = 0;
    orders.forEach(o => {
      // Kg e unidades: apenas fases de produção concluída
      if (producedStatuses.includes(o.status)) {
        o.products.forEach(p => {
          totalKg += calculateWeightInKg(p.weight, p.quantity);
          totalUnits += p.quantity;
        });
      }
      // Clientes e pedidos: entregue ou arquivado
      if (o.status === 'entregue' || o.archived) {
        clients.add(o.clientName);
        totalOrders += 1;
      }
    });
    return {
      totalKg,
      totalUnits,
      totalClients: clients.size,
      totalOrders,
    };
  }, [orders]);

  // ─── Funções de normalização de produtos ───
  const normalizeTipo = (name: string): string => {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.includes('amostra')) return '';
    if (n.includes('caneca') || n.includes('filtro') || n.includes('copo') || n.includes('kit')) return '';
    if (n.includes('drip')) return 'DripCoffee';
    if (n.includes('gourmet') && (n.includes('personal') || n.includes('personaliz'))) return 'Gourmet Personalizado';
    if (n.includes('gourmet')) return 'Gourmet';
    if (n.includes('torra clara') || n.includes('torra cla') || (n.includes('clara') && !n.includes('bourbon'))) return 'Torra Clara';
    if (n.includes('torra inten') || n.includes('intensa') || n.includes('torra inte')) return 'Torra Intensa';
    if (n.includes('bourbon') || n.includes('bourbom')) return 'Bourbon';
    if (n.includes('yellow')) return 'Yellow';
    if (n.includes('catuai') || n.includes('vermelho') || n.includes('selecao') || n.includes('especial')) return 'Catuaí';
    return '';
  };

  const normalizePeso = (weight: string): string => {
    const w = weight.toLowerCase().trim().replace(/\s/g, '');
    if (w === '40g' || w === '40') return '40g';
    if (w === '100g' || w === '100') return '100g';
    if (w === '120g' || w === '120') return '120g';
    if (w === '250g' || w === '250') return '250g';
    if (w === '500g' || w === '500') return '500g';
    if (w === '1kg' || w === '1000g') return '1kg';
    if (w === '5kg' || w === '5000g') return '5kg';
    return weight;
  };

  const normalizeMoagem = (grindType: string): string => {
    const g = (grindType || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (g.includes('grao') || g === 'graos') return 'Grãos';
    if (g.includes('moido')) return 'Moído';
    return '';
  };

  // Ranking de cafés produzidos (com normalização completa)
  const coffeeRanking = useMemo(() => {
    // Apenas os 6 tipos canônicos — Gourmet Personalizado e DripCoffee somam nos pais
    const totals: Record<string, number> = {
      'Catuaí': 0,
      'Torra Clara': 0,
      'Torra Intensa': 0,
      'Bourbon': 0,
      'Yellow': 0,
      'Gourmet': 0,
    };
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    orders.forEach(order => {
      if (!producedStatuses.includes(order.status)) return;
      order.products.forEach(product => {
        const tipo = normalizeTipo(product.name);
        if (!tipo) return;
        let kg = 0;
        // DripCoffee → Catuaí (0,1kg por unidade)
        if (tipo === 'DripCoffee') {
          kg = 0.1 * product.quantity;
          totals['Catuaí'] += kg;
          return;
        }
        // Gourmet Personalizado → Gourmet
        const tipoCanônico = tipo === 'Gourmet Personalizado' ? 'Gourmet' : tipo;
        if (totals[tipoCanônico] === undefined) return;
        const weightMatch = product.weight.match(/(\d+)\s*(g|kg)/i);
        if (!weightMatch) return;
        const value = parseInt(weightMatch[1]);
        const unit = weightMatch[2].toLowerCase();
        kg = (unit === 'kg' ? value : value / 1000) * product.quantity;
        if (kg > 0) totals[tipoCanônico] += kg;
      });
    });
    const sorted = Object.entries(totals)
      .map(([name, kg]) => ({ name, kg }))
      .filter(item => item.kg > 0)
      .sort((a, b) => b.kg - a.kg);
    const base = sorted.length > 0 ? sorted : Object.keys(totals).map(name => ({ name, kg: 0 }));
    const maxKg = base[0]?.kg || 1;
    return base.map((item, index) => ({
      ...item,
      sacas: item.kg / 48,
      percent: (item.kg / maxKg) * 100,
      rank: index + 1,
    }));
  }, [orders]);

  // Ranking de embalagens produzidas (volume por produto, normalizado)
  const packagingRanking = useMemo(() => {
    const totals: Record<string, number> = {};
    const producedStatuses = ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'];
    orders.forEach(order => {
      if (!producedStatuses.includes(order.status)) return;
      order.products.forEach(product => {
        const tipo = normalizeTipo(product.name);
        if (!tipo) return;
        let key = '';
        if (tipo === 'DripCoffee') {
          key = 'DripCoffee 100g Moído';
        } else {
          const peso = normalizePeso(product.weight);
          const moagem = normalizeMoagem(product.grindType || '');
          key = moagem ? `${tipo} ${peso} ${moagem}` : `${tipo} ${peso}`;
        }
        totals[key] = (totals[key] || 0) + product.quantity;
      });
    });
    const sorted = Object.entries(totals)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
    const maxQty = sorted[0]?.qty || 1;
    return sorted.map((item, index) => ({
      ...item,
      percent: (item.qty / maxQty) * 100,
      rank: index + 1,
    }));
  }, [orders]);

  const { stocks: coffeeStocks, updateStock } = useInventory();

  const ROAST_LOTS = {
    'Catuai':        { greenInput: 10, roastOutput: 8 },
    'Bourbon':       { greenInput: 10, roastOutput: 8 },
    'Gourmet':       { greenInput: 10, roastOutput: 8 },
    'Torra Clara':   { greenInput: 8,  roastOutput: 6.4 },
    'Torra Intensa': { greenInput: 8,  roastOutput: 6.4 },
    'Yellow':        { greenInput: 8,  roastOutput: 6.4 },
  };
  const getLot = (type: string) => (ROAST_LOTS as Record<string, {greenInput: number; roastOutput: number}>)[type] || { greenInput: 10, roastOutput: 8 };
  const mapType = (n: string): string | null => {
    if (n.includes('catuai') || n.includes('catuaí')) return 'Catuaí';
    if (n.includes('clara')) return 'Torra Clara';
    if (n.includes('intensa')) return 'Torra Intensa';
    if (n.includes('bourbon') || n.includes('bourbon')) return 'Bourbon';
    if (n.includes('yellow')) return 'Yellow';
    if (n.includes('gourmet')) return 'Gourmet';
    if (n.includes('drip')) return 'Catuaí';
    return null;
  };
  const roastPlanning = useMemo(() => {
    const needed: Record<string, number> = { 'Catuaí': 0, 'Torra Clara': 0, 'Torra Intensa': 0, 'Bourbon': 0, 'Yellow': 0, 'Gourmet': 0 };
    const used: Record<string, number> = { 'Catuaí': 0, 'Torra Clara': 0, 'Torra Intensa': 0, 'Bourbon': 0, 'Yellow': 0, 'Gourmet': 0 };
    orders.forEach(order => {
      const isEmb = order.status === 'embalagens_separadas';
      const isPed = order.status === 'pedidos';
      if (!isPed && !isEmb) return;
      order.products.forEach(product => {
        const ln = product.name.toLowerCase();
        const checked = product.checked === true;
        if (ln.includes('caneca') || ln.includes('filtro') || ln.includes('copo')) return;
        if (ln.includes('amostra')) {
          const t = (isEmb && checked) ? used : needed;
          t['Catuaí'] += 0.25 * product.quantity;
          t['Torra Clara'] += 0.04 * product.quantity;
          t['Torra Intensa'] += 0.04 * product.quantity;
          t['Bourbon'] += 0.04 * product.quantity;
          t['Yellow'] += 0.04 * product.quantity;
          t['Gourmet'] += 0.04 * product.quantity;
          return;
        }
        const type = mapType(ln);
        if (!type) return;
        const weight = ln.includes('drip') ? 0.1 * product.quantity : calculateWeightInKg(product.weight, product.quantity);
        if (weight === 0) return;
        if (isEmb && checked) { used[type] = (used[type]||0) + weight; }
        else if (isPed || (isEmb && !checked)) { needed[type] = (needed[type]||0) + weight; }
      });
    });
    return Object.entries(needed).map(([type, neededKg]) => {
      const lot = getLot(type);
      const rawStock = coffeeStocks[type] || 0;
      const stockKg = Math.max(0, rawStock - ((used as Record<string, number>)[type]||0));
      const greenNeeded = Math.max(0, (neededKg - stockKg) / 0.8);
      return { type, neededKg, stockKg, greenNeeded, roastOutput: lot.roastOutput, greenInput: lot.greenInput };
    }).sort((a, b) => b.neededKg - a.neededKg);
  }, [orders, coffeeStocks]);

  // Normaliza moagem para agrupamento — moagens especiais ficam separadas
  const normalizeGrindForKey = (grindType: string): string => {
    const g = (grindType || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!g || g === 'n/a') return '';
    const especiais = ['prensa', 'espresso', 'aeropress', 'chemex', 'coado', 'moka', 'turco'];
    if (especiais.some(e => g.includes(e))) return grindType.trim();
    if (g.includes('moido') || g.includes('moida') || g.includes('moidos')) return 'Moido';
    if (g.includes('grao') || g.includes('graos')) return 'Graos';
    return grindType.trim();
  };

  const packagingDemand = useMemo(() => {
    const demand: Record<string, { displayName: string; matchKey: string; qty: number; clientes: string[] }> = {};
    orders.forEach(order => {
      if (order.status === 'pedidos') {
        order.products.forEach(product => {
          if (!product.checked) {
            const isPersonalizado = ((product as any).productionNotes || '').toLowerCase().includes('personaliz') || (product.name || '').toLowerCase().includes('personaliz');
            const grindNorm = normalizeGrindForKey(product.grindType || '');
            const grindSuffix = grindNorm ? ` (${grindNorm})` : '';
            const keyBase = (product.name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' ' + (product.weight || '').trim().toLowerCase();
            const key = isPersonalizado ? keyBase + grindSuffix + '_pers' : keyBase + grindSuffix.toLowerCase();
            if (!demand[key]) {
              const grindOrig = grindNorm ? ` (${grindNorm})` : '';
              demand[key] = {
                displayName: `${product.name.trim()} ${(product.weight || '').trim()}${grindOrig}${isPersonalizado ? ' · Personalizado' : ''}`,
                matchKey: `${product.name.trim()} ${(product.weight || '').trim()}${grindOrig}`,
                qty: 0,
                clientes: [],
              };
            }
            demand[key].qty += product.quantity;
            const clientName = (order as any).tradeName || order.clientName || '';
            if (clientName && !demand[key].clientes.includes(clientName)) {
              demand[key].clientes.push(clientName);
            }
          }
        });
      }
    });
    return Object.values(demand).sort((a, b) => b.qty - a.qty);
  }, [orders]);

  const onShelf = useMemo(() => {
    const shelf: Record<string, number> = {};
    
    orders.forEach(order => {
      // Somente as que os pedidos estiverem na fase "Embalagens prontas"
      if (order.status === 'embalagens_prontas') {
        order.products.forEach(p => {
          if (p.checked) return; // Saiu da prateleira para a caixa
          const grind = p.grindType !== 'N/A' ? ` (${p.grindType})` : '';
          const key = `${p.name} ${p.weight}${grind}`;
          shelf[key] = (shelf[key] || 0) + p.quantity;
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
    const states: Record<string, { kg: number; orders: number }> = {};
    const cities: Record<string, { kg: number; orders: number }> = {};
    orders.forEach(order => {
      if (order.status !== 'entregue' && !order.archived) return;
      // Prioriza addressDetails estruturado; fallback para extração do texto
      let city = 'N/A';
      let state = 'N/A';
      if (order.addressDetails?.city && order.addressDetails?.state) {
        city = order.addressDetails.city.trim();
        state = order.addressDetails.state.trim();
      } else {
        const extracted = extractCityState(order.address || '');
        city = extracted.city;
        state = extracted.state;
      }
      let kg = 0;
      order.products.forEach(p => {
        kg += calculateWeightInKg(p.weight, p.quantity);
      });
      if (state !== 'N/A') {
        if (!states[state]) states[state] = { kg: 0, orders: 0 };
        states[state].kg += kg;
        states[state].orders += 1;
      }
      if (city !== 'N/A') {
        const cityKey = `${city} (${state})`;
        if (!cities[cityKey]) cities[cityKey] = { kg: 0, orders: 0 };
        cities[cityKey].kg += kg;
        cities[cityKey].orders += 1;
      }
    });
    const sortedStates = Object.entries(states)
      .map(([name, data]) => ({ name, kg: data.kg, orders: data.orders }))
      .sort((a, b) => b.orders - a.orders);
    const sortedCities = Object.entries(cities)
      .map(([name, data]) => ({ name, kg: data.kg, orders: data.orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 6);
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

  const getCoffeeCardStyle = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('drip')) return 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30';
    if (n.includes('catuai') || n.includes('catuaí')) return 'bg-rose-100 dark:bg-rose-900/20 border-rose-300 dark:border-rose-900/40';
    if (n.includes('bourbom') || n.includes('bourbon')) return 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-900/40';
    if (n.includes('gourmet')) return 'bg-stone-200 dark:bg-stone-900/30 border-stone-300 dark:border-stone-700';
    if (n.includes('clara')) return 'bg-fuchsia-50 dark:bg-fuchsia-900/10 border-fuchsia-300 dark:border-fuchsia-900/40';
    if (n.includes('intensa')) return 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700';
    if (n.includes('yellow')) return 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
    return 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700';
  };
  const getCoffeeQtyColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('drip')) return 'text-green-600 dark:text-green-400';
    if (n.includes('catuai') || n.includes('catuaí')) return 'text-rose-700 dark:text-rose-400';
    if (n.includes('bourbom') || n.includes('bourbon')) return 'text-yellow-600 dark:text-yellow-500';
    if (n.includes('gourmet')) return 'text-stone-600 dark:text-stone-400';
    if (n.includes('clara')) return 'text-fuchsia-600 dark:text-fuchsia-400';
    if (n.includes('intensa')) return 'text-slate-500 dark:text-slate-400';
    if (n.includes('yellow')) return 'text-blue-500 dark:text-blue-400';
    return 'text-slate-700 dark:text-white';
  };
  // Salvar snapshot no historico antes de separar
  const saveToHistory = useCallback(async (tipo: string, descricao: string, affectedOrders: any[]) => {
    const snapshot = affectedOrders.map(o => ({
      id: o.id,
      status: o.status,
      products: JSON.parse(JSON.stringify(o.products)),
      statusHistory: JSON.parse(JSON.stringify(o.statusHistory || [])),
    }));
    try {
      await fetch('/api/separation-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, descricao, snapshot }),
      });
    } catch (e) {
      console.warn('[history] Erro ao salvar:', e);
    }
  }, []);

  // Carregar historico
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/separation-history');
      const data = await res.json();
      if (data.ok) setSeparationHistory(data.entries);
    } catch (e) {
      console.warn('[history] Erro ao carregar:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Desfazer separacao
  const handleUndo = useCallback(async (entry: any) => {
    if (!onUpdateOrder) return;
    setIsUndoing(true);
    try {
      for (const snap of entry.snapshot) {
        await onUpdateOrder({
          ...snap,
          statusHistory: [
            ...(snap.statusHistory || []),
            { action: 'Separacao desfeita via historico', timestamp: new Date().toISOString() }
          ]
        } as any);
      }
      // Remover entrada do historico apos desfazer
      await fetch('/api/separation-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      });
      setSeparationHistory(prev => prev.filter(e => e.id !== entry.id));
    } catch (e: any) {
      console.error('[history] Erro ao desfazer:', e);
    } finally {
      setIsUndoing(false);
    }
  }, [onUpdateOrder]);

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
            <option value="this_year">Ano Atual</option>
            <option value="last_year">Ano Anterior</option>
          </select>
          {/* Select de mês específico */}
          <select
            onChange={(e) => { if (e.target.value) handlePresetChange(e.target.value); }}
            value={datePreset.startsWith('month_') ? datePreset : ''}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:border-primary transition-all text-slate-700 dark:text-slate-300"
          >
            <option value="">Mês específico...</option>
            <optgroup label="2024">
              <option value="month_2024_01">Janeiro 2024</option>
              <option value="month_2024_02">Fevereiro 2024</option>
              <option value="month_2024_03">Março 2024</option>
              <option value="month_2024_04">Abril 2024</option>
              <option value="month_2024_05">Maio 2024</option>
              <option value="month_2024_06">Junho 2024</option>
              <option value="month_2024_07">Julho 2024</option>
              <option value="month_2024_08">Agosto 2024</option>
              <option value="month_2024_09">Setembro 2024</option>
              <option value="month_2024_10">Outubro 2024</option>
              <option value="month_2024_11">Novembro 2024</option>
              <option value="month_2024_12">Dezembro 2024</option>
            </optgroup>
            <optgroup label="2025">
              <option value="month_2025_01">Janeiro 2025</option>
              <option value="month_2025_02">Fevereiro 2025</option>
              <option value="month_2025_03">Março 2025</option>
              <option value="month_2025_04">Abril 2025</option>
              <option value="month_2025_05">Maio 2025</option>
              <option value="month_2025_06">Junho 2025</option>
              <option value="month_2025_07">Julho 2025</option>
              <option value="month_2025_08">Agosto 2025</option>
              <option value="month_2025_09">Setembro 2025</option>
              <option value="month_2025_10">Outubro 2025</option>
              <option value="month_2025_11">Novembro 2025</option>
              <option value="month_2025_12">Dezembro 2025</option>
            </optgroup>
            <optgroup label="2026">
              <option value="month_2026_01">Janeiro 2026</option>
              <option value="month_2026_02">Fevereiro 2026</option>
              <option value="month_2026_03">Março 2026</option>
              <option value="month_2026_04">Abril 2026</option>
              <option value="month_2026_05">Maio 2026</option>
            </optgroup>
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
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 xl:items-stretch">
        {/* Planejamento de Torra */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl">
                <Beaker className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Planejamento de Torra</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Estoque vivo · Verde p/ torrar · Drip=100g Catuaí</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Perda: 20%</span>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {roastPlanning.filter(item => item.neededKg > 0).map((item) => {
              const ok = item.stockKg >= item.neededKg;
              const torras = item.greenNeeded > 0 ? Math.ceil(item.greenNeeded / item.greenInput) : 0;
              const rawStock = coffeeStocks[item.type] || 0;
              const pct = item.neededKg > 0 ? Math.min(100, (item.stockKg / item.neededKg) * 100) : 100;
              return (
                <div key={item.type} className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${ok ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{item.type}</span>
                    {ok
                      ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">✓ OK</span>
                      : <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">Torrar</span>
                    }
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Necessário</p>
                      <p className="text-base font-black text-slate-800 dark:text-white">{item.neededKg.toFixed(1)}<span className="text-[10px] font-bold text-slate-400 ml-0.5">kg</span></p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estoque</p>
                      <input type="number" step="0.1" min="0" value={rawStock ? Math.round(rawStock * 100) / 100 : ''} onChange={(e) => updateStock(item.type, Math.round((parseFloat(e.target.value) || 0) * 100) / 100)} placeholder="0.0" className="w-full bg-transparent text-base font-black text-center text-primary focus:outline-none border-none p-0" />
                      <p className="text-[9px] text-slate-400 -mt-0.5">kg</p>
                    </div>
                  </div>
                  {item.greenNeeded > 0 ? (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2 text-center border border-amber-100 dark:border-amber-800/50">
                      <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Verde p/ Torrar</p>
                      <p className="text-lg font-black text-amber-700 dark:text-amber-400">{item.greenNeeded.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">kg</span></p>
                      <p className="text-[9px] text-amber-600 mt-0.5">~{torras} torra{torras !== 1 ? 's' : ''} de {item.greenInput}kg verde</p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2 text-center border border-emerald-100 dark:border-emerald-800/50">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Sobra no Estoque</p>
                      <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{(item.stockKg - item.neededKg).toFixed(1)}<span className="text-[10px] font-bold ml-0.5">kg</span></p>
                      <p className="text-[9px] text-emerald-600 mt-0.5">disponivel para novos pedidos</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => updateStock(item.type, Math.round(Math.max(0, rawStock - item.roastOutput) * 100) / 100)} className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black transition-all">
                      − 1 torra ({item.roastOutput}kg)
                    </button>
                    <button onClick={() => updateStock(item.type, Math.round((rawStock + item.roastOutput) * 100) / 100)} className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black transition-all shadow-sm shadow-amber-500/20">
                      + 1 torra ({item.roastOutput}kg)
                    </button>
                  </div>
                </div>
              );
            })}
            {roastPlanning.filter(item => item.neededKg > 0).length === 0 && (
              <div className="col-span-full text-center py-10 text-slate-400">
                <CheckCircle className="size-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-bold">Nenhum pedido pendente de torra!</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 h-full">
          {/* Demanda de Embalagens */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-xl">
                  <Layers className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Demanda de Embalagens</h3>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Itens a separar (Pedidos)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setShowHistoryModal(true); loadHistory(); }}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-black rounded-lg transition-all"
                  title="Histórico de separações"
                >
                  <RotateCcw className="size-3" />
                  Retornar
                </button>
                {packagingDemand.length > 0 && (
                  <button
                    onClick={() => setShowSeparationModal(true)}
                    className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 text-white text-[9px] font-black rounded-lg transition-all"
                  >
                    <Layers className="size-3" />
                    Separar
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-3 gap-1.5">
                {[...packagingDemand].sort((a, b) => b.qty - a.qty).map((item) => {
                  const parts = item.displayName.split(' ');
                  const grind = item.displayName.includes('(') ? item.displayName.match(/\(([^)]+)\)/)?.[1] || '' : '';
                  const cleanName = item.displayName.replace(/\s*\([^)]*\)/, '').trim();
                  const weightMatch = cleanName.match(/(\d+g|\d+kg)/i);
                  const weight = weightMatch ? weightMatch[0] : '';
                  const coffeeName = cleanName.replace(weight, '').trim();
                  return (
                    <button
                      key={item.displayName}
                      onClick={() => setSelectedPackagingItem({ name: item.displayName, matchKey: item.matchKey, qty: item.qty, clientes: item.clientes })}
                      className={`flex flex-col items-center justify-center px-1 py-2 rounded-xl border text-center min-h-[80px] transition-all hover:scale-105 hover:shadow-md active:scale-95 cursor-pointer ${getCoffeeCardStyle(coffeeName || cleanName)}`}
                    >
                      <span className={`text-lg font-black leading-none ${getCoffeeQtyColor(coffeeName || cleanName)}`}>{item.qty}</span>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">un</span>
                      <span className="text-[10px] font-black text-slate-900 dark:text-white leading-tight">{coffeeName || cleanName} {weight}</span>
                      {grind && <span className="text-[9px] font-bold text-primary uppercase">{grind}</span>}
                    </button>
                  );
                })}
                {packagingDemand.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-slate-400">
                    <Package className="size-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold">Nenhuma embalagem pendente</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Na Prateleira */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-xl">
                  <Package className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Na Prateleira</h3>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Prontos aguardando caixa</p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-3 gap-1.5">
                {[...onShelf].sort((a, b) => b.qty - a.qty).map((item) => {
                  const grind = item.name.includes('(') ? item.name.match(/\(([^)]+)\)/)?.[1] || '' : '';
                  const cleanName = item.name.replace(/\s*\([^)]*\)/, '').trim();
                  const weightMatch = cleanName.match(/(\d+g|\d+kg)/i);
                  const weight = weightMatch ? weightMatch[0] : '';
                  const coffeeName = cleanName.replace(weight, '').trim();
                  return (
                    <div key={item.name} className={`flex flex-col items-center justify-center px-1 py-2 rounded-xl border text-center min-h-[80px] ${getCoffeeCardStyle(coffeeName || cleanName)}`}>
                      <span className={`text-lg font-black leading-none ${getCoffeeQtyColor(coffeeName || cleanName)}`}>{item.qty}</span>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">un</span>
                      <span className="text-[10px] font-black text-slate-900 dark:text-white leading-tight">{coffeeName || cleanName} {weight}</span>
                      {grind && <span className="text-[9px] font-bold text-primary uppercase">{grind}</span>}
                    </div>
                  );
                })}
                {onShelf.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-slate-400">
                    <Package className="size-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold">Nenhum item na prateleira</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Confirmação Minicard Embalagem */}
        {selectedPackagingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Layers className="size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Confirmar separação</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Demanda de Embalagens</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Marcar como separadas:
                </p>
                <p className="text-base font-black text-slate-900 dark:text-white mb-6">
                  {selectedPackagingItem.qty}× {selectedPackagingItem.name}
                {selectedPackagingItem.clientes && selectedPackagingItem.clientes.length > 0 && (
                  <div className="mb-4 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pedidos de</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedPackagingItem.clientes.map((cliente, i) => (
                        <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                          {cliente}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedPackagingItem(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      const item = selectedPackagingItem;
                      const pedidos = orders.filter(o => o.status === 'pedidos');
                      // Salvar snapshot antes de modificar
                      const keyToMatch = item.matchKey;
                      const affected = pedidos.filter(order => order.products.some(p => {
                        const grindNorm = normalizeGrindForKey(p.grindType || '');
                        const grind = grindNorm ? ` (${grindNorm})` : '';
                        return `${p.name.trim()} ${(p.weight || '').trim()}${grind}` === keyToMatch && !p.checked;
                      }));
                      if (affected.length > 0) {
                        await saveToHistory('minicard', `Separou: ${item.qty}x ${item.name}`, affected);
                      }
                      pedidos.forEach(order => {
                        let hasChange = false;
                        const updatedProducts = order.products.map(p => {
                          const grindNorm = normalizeGrindForKey(p.grindType || '');
                          const grind = grindNorm ? ` (${grindNorm})` : '';
                          const productKey = `${p.name.trim()} ${(p.weight || '').trim()}${grind}`;
                          if (productKey === keyToMatch && !p.checked) {
                            hasChange = true;
                            return { ...p, checked: true };
                          }
                          return p;
                        });
                        if (hasChange) {
                          // Verificar se todos os produtos ficaram marcados
                          const allChecked = updatedProducts.every(p => p.checked);
                          if (allChecked) {
                            // Avança para embalagens_separadas e desmarca tudo
                            onUpdateOrder!({
                              ...order,
                              status: 'embalagens_separadas',
                              products: updatedProducts.map(p => ({ ...p, checked: false })),
                              statusHistory: [
                                ...(order.statusHistory || []),
                                { status: 'embalagens_separadas', timestamp: new Date().toISOString() }
                              ]
                            });
                          } else {
                            // Nem todos marcados — só atualiza os produtos
                            onUpdateOrder!({ ...order, products: updatedProducts });
                          }
                        }
                      });
                      setSelectedPackagingItem(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black transition-colors"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal Histórico de Separações */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <RotateCcw className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">Histórico de Separações</h2>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Últimas 10 ações — clique para desfazer</p>
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {isLoadingHistory && (
                  <div className="py-8 text-center"><Loader2 className="size-6 animate-spin text-primary mx-auto" /></div>
                )}
                {!isLoadingHistory && separationHistory.length === 0 && (
                  <div className="py-10 text-center text-slate-400">
                    <RotateCcw className="size-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold">Nenhuma separação registrada ainda</p>
                  </div>
                )}
                {!isLoadingHistory && separationHistory.map((entry) => {
                  const ts = new Date(entry.timestamp);
                  const dateStr = ts.toLocaleDateString('pt-BR');
                  const timeStr = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={entry.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">{entry.descricao}</p>
                        <p className="text-[9px] text-slate-400 font-bold">{dateStr} às {timeStr} · {entry.snapshot?.length || 0} pedido(s)</p>
                      </div>
                      <button
                        onClick={() => handleUndo(entry)}
                        disabled={isUndoing}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-[10px] font-black rounded-xl transition-all disabled:opacity-50"
                      >
                        {isUndoing ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                        Desfazer
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <p className="text-[9px] text-slate-400 text-center font-bold">Desfazer restaura o estado anterior dos pedidos afetados</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal Separar Embalagens */}
        {showSeparationModal && (
          <BulkCheckModal
            selectedOrders={orders.filter(o => o.status === 'pedidos')}
            onClose={() => setShowSeparationModal(false)}
            onUpdateOrder={onUpdateOrder!}
            title="Separar Embalagens"
            subtitle="Separação em Lote — Dashboard"
          />
        )}
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

      {/* LINHA 1: 3 cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        {/* Produção Total */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Produção Total</p>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
            {filteredStats.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
          </p>
          <p className="text-amber-600 dark:text-amber-400 text-sm font-black uppercase tracking-widest">
            ☕ {(filteredStats.totalKg / 48).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sacas torradas
          </p>
          {(globalStartDate || globalEndDate || datePreset !== 'custom') && (
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Total Geral: {stats.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg · {(stats.totalKg / 48).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sacas
            </p>
          )}
        </div>
        {/* Volume de Itens */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Volume de Itens</p>
          <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
            {filteredStats.totalUnits} unid
          </p>
          {(globalStartDate || globalEndDate || datePreset !== 'custom') && (
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Total Geral: {stats.totalUnits} unid
            </p>
          )}
        </div>
        {/* Clientes Atendidos */}
        <div className="flex flex-col gap-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Clientes Atendidos</p>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-slate-900 dark:text-slate-100 tracking-tight text-4xl font-black">
                {filteredStats.totalClients}
              </p>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">clientes únicos</p>
            </div>
            <div className="text-right">
              <p className="text-primary tracking-tight text-4xl font-black">
                {filteredStats.totalOrders}
              </p>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">pedidos entregues</p>
            </div>
          </div>
          {(globalStartDate || globalEndDate || datePreset !== 'custom') && (
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Total Geral: {stats.totalClients} clientes
            </p>
          )}
        </div>
      </div>

      {/* LINHA 2: Ranking Cafés | Volume Embalagens | Geografia — mesma altura */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* 🏆 Ranking de Cafés */}
        <div className="flex flex-col gap-3 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm h-[500px]">
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">🏆 Ranking de Cafés</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">kg · sacas</p>
          </div>
          <div className="flex flex-col gap-2">
            {coffeeRanking.map((item) => {
              const color =
                item.rank <= 2
                  ? { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', rankBg: 'bg-emerald-500' }
                  : item.rank <= 4
                  ? { bar: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', rankBg: 'bg-amber-400' }
                  : { bar: 'bg-rose-400', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', rankBg: 'bg-rose-400' };
              return (
                <div key={item.name} className={`flex flex-col gap-1.5 p-3 rounded-2xl ${color.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`${color.rankBg} text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0`}>
                        {item.rank}
                      </span>
                      <span className={`text-xs font-black ${color.text}`}>{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-900 dark:text-slate-100 text-xs font-black">
                        {item.kg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
                      </p>
                      <p className={`text-[10px] font-bold ${color.text}`}>
                        ☕ {item.sacas.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sacas
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-white/50 dark:bg-slate-700/50 rounded-full h-1">
                    <div className={`${color.bar} h-1 rounded-full transition-all duration-500`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 📦 Volume por Embalagem */}
        <div className="flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-[500px]">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">📦 Volume por Embalagem</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">unidades</p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            <div className="grid grid-cols-2 gap-2">
              {packagingRanking.map((item) => {
                const color =
                  item.rank <= Math.ceil(packagingRanking.length * 0.33)
                    ? { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-500' }
                    : item.rank <= Math.ceil(packagingRanking.length * 0.66)
                    ? { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-400' }
                    : { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-300', badge: 'bg-rose-400' };
                return (
                  <div key={item.name} className={`flex flex-col gap-1 p-2.5 rounded-xl ${color.bg}`}>
                    <p className={`text-[10px] font-black uppercase tracking-wide ${color.text} leading-tight`}>{item.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="flex-1 bg-white/60 dark:bg-slate-700/40 rounded-full h-1 mr-2">
                        <div className={`${color.badge} h-1 rounded-full`} style={{ width: `${item.percent}%` }} />
                      </div>
                      <span className={`${color.badge} text-white text-[9px] font-black px-1.5 py-0.5 rounded-lg flex-shrink-0`}>
                        {item.qty}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 🌍 Geografia */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm h-[500px] flex flex-col">
          <div className="flex items-center gap-3 mb-4 flex-shrink-0">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl">
              <Globe className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Geografia</h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5">
            <div>
              <div className="grid grid-cols-3 mb-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Pedidos</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Kg</p>
              </div>
              <div className="space-y-1.5">
                {geographyData.states.slice(0, 8).map(state => (
                  <div key={state.name} className="grid grid-cols-3 items-center py-1.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{state.name}</span>
                    <span className="text-xs font-black text-primary text-center">{state.orders} ped</span>
                    <span className="text-xs font-black text-emerald-500 text-right">{state.kg.toFixed(2)} kg</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="grid grid-cols-3 mb-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cidade</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Pedidos</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Kg</p>
              </div>
              <div className="space-y-1.5">
                {geographyData.cities.map(city => (
                  <div key={city.name} className="grid grid-cols-3 items-center py-1.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{city.name}</span>
                    <span className="text-xs font-black text-primary text-center">{city.orders} ped</span>
                    <span className="text-xs font-black text-emerald-500 text-right">{city.kg.toFixed(2)} kg</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LINHA 3: Histórico de Performance — largura total */}
      <div className="grid grid-cols-1 gap-6">
        {/* Histórico Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
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

      </div>
    </div>
  );
}
