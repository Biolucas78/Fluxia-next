'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import OrderCard from './OrderCard';
import OrderDetailsModal from './OrderDetailsModal';
import BulkCheckModal from './BulkCheckModal';
import BlingImportModal from './BlingImportModal';
import { LayoutDashboard, Trash2, CheckSquare, Square, X, RefreshCw, ArrowRight, ChevronDown, Layers, Calendar, Filter, RotateCcw, Download, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'react-hot-toast';

import { 
  DndContext, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS: { id: OrderStatus; title: string; color: string; textColor: string }[] = [
  { id: 'pedidos', title: 'Pedidos', color: 'bg-rose-500', textColor: 'text-white' },
  { id: 'embalagens_separadas', title: 'Emb. Separadas', color: 'bg-slate-500', textColor: 'text-white' },
  { id: 'embalagens_prontas', title: 'Emb. Prontas', color: 'bg-blue-500', textColor: 'text-white' },
  { id: 'caixa_montada', title: 'Caixa Montada', color: 'bg-indigo-500', textColor: 'text-white' },
  { id: 'enviado', title: 'Enviado', color: 'bg-violet-500', textColor: 'text-white' },
  { id: 'entregue', title: 'Entregue', color: 'bg-emerald-500', textColor: 'text-white' },
];

interface KanbanBoardProps {
  orders: Order[];
  onUpdateOrder: (order: Order) => void;
  onMoveOrder: (order: Order, direction: 'next' | 'prev') => void;
  onDeleteOrder: (orderId: string) => void;
  onArchiveOrder: (orderId: string) => void;
  onAddOrder?: (order: Order) => void;
  searchQuery: string;
}

interface SortableOrderCardProps {
  key?: React.Key;
  order: Order;
  onUpdateOrder: (order: Order) => void;
  onMoveOrder: (order: Order, direction: 'next' | 'prev') => void;
  onDeleteOrder: (orderId: string) => void;
  onArchiveOrder: (orderId: string) => void;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function SortableOrderCard(props: SortableOrderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.order.id,
    data: {
      type: 'Order',
      order: props.order,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3">
      <OrderCard {...props} />
    </div>
  );
}

export default function KanbanBoard({ orders, onUpdateOrder, onMoveOrder, onDeleteOrder, onArchiveOrder, onAddOrder, searchQuery }: KanbanBoardProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('');
  const [filterCarrier, setFilterCarrier] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isBlingImportOpen, setIsBlingImportOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = active.data.current?.order;
    if (order) setActiveOrder(order);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeOrder = active.data.current?.order;
    if (!activeOrder) return;

    // Check if we are over a column or another card
    const overData = over.data.current;
    let overColumnId: OrderStatus | null = null;

    if (overData?.type === 'Column') {
      overColumnId = overData.columnId;
    } else if (overData?.type === 'Order') {
      overColumnId = overData.order.status;
    }

    if (overColumnId && activeOrder.status !== overColumnId) {
      // Move between columns
      const currentIndex = COLUMNS.findIndex(c => c.id === activeOrder.status);
      const newIndex = COLUMNS.findIndex(c => c.id === overColumnId);
      const isMovingForward = newIndex > currentIndex;
      
      let updatedProducts = activeOrder.products;
      
      if (isMovingForward) {
        if (overColumnId === 'embalagens_separadas' || overColumnId === 'embalagens_prontas') {
          updatedProducts = activeOrder.products.map((p: any) => ({ ...p, checked: false }));
        }
      } else {
        updatedProducts = activeOrder.products.map((p: any) => ({ ...p, checked: false }));
      }

      const updatedOrder = { 
        ...activeOrder, 
        status: overColumnId, 
        products: updatedProducts,
        statusHistory: [
          ...(activeOrder.statusHistory || []),
          { status: overColumnId, timestamp: new Date().toISOString() }
        ]
      };
      onUpdateOrder(updatedOrder);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
  };

  useEffect(() => {
    const syncAllTracking = async () => {
      const ordersToSync = orders.filter(o => o.status === 'enviado' && o.trackingNumber);
      if (ordersToSync.length === 0) return;

      for (const order of ordersToSync) {
        // Skip if updated in the last hour
        const lastUpdate = order.lastTrackingUpdate ? new Date(order.lastTrackingUpdate).getTime() : 0;
        const now = new Date().getTime();
        if (now - lastUpdate < 3600000) continue; 

        try {
          const response = await fetch('/api/shipping/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              trackingNumber: order.trackingNumber, 
              shipmentId: order.shipmentId,
              shippingProvider: order.shippingProvider,
              carrier: order.carrier 
            })
          });
          if (response.ok) {
            const data = await response.json();
            const updatedOrder = {
              ...order,
              trackingStatus: data.status,
              trackingHistory: data.history,
              deliveryDate: data.deliveryDate,
              lastTrackingUpdate: new Date().toISOString()
            };
            if (data.delivered && order.status !== 'entregue') {
              updatedOrder.status = 'entregue';
            }
            onUpdateOrder(updatedOrder);
          }
        } catch (e) {
          console.error('Error syncing tracking for order', order.id, e);
        }
      }
    };

    syncAllTracking();
    const interval = setInterval(syncAllTracking, 3600000); // Every hour
    return () => clearInterval(interval);
  }, [orders, onUpdateOrder]);

  const handleManualSyncAll = async () => {
    setIsSyncingAll(true);
    const ordersToSync = orders.filter(o => o.status === 'enviado' && o.trackingNumber);
    
    for (const order of ordersToSync) {
      try {
        const response = await fetch('/api/shipping/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            trackingNumber: order.trackingNumber, 
            shipmentId: order.shipmentId,
            shippingProvider: order.shippingProvider,
            carrier: order.carrier 
          })
        });
        if (response.ok) {
          const data = await response.json();
          const updatedOrder = {
            ...order,
            trackingStatus: data.status,
            trackingHistory: data.history,
            deliveryDate: data.deliveryDate,
            lastTrackingUpdate: new Date().toISOString()
          };
          if (data.delivered && order.status !== 'entregue') {
            updatedOrder.status = 'entregue';
          }
          onUpdateOrder(updatedOrder);
        }
      } catch (e) {
        console.error('Error syncing tracking for order', order.id, e);
      }
    }
    setIsSyncingAll(false);
  };
  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        // Only show non-archived orders on the Kanban board
        if (o.archived) return false;

        const matchesSearch = o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             (o.tradeName && o.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                             o.id.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;

        if (filterTag !== 'all') {
          if (filterTag === 'amostra' && !o.isSample) return false;
          if (filterTag === 'hasInvoice' && !o.hasInvoice) return false;
          if (filterTag === 'hasBoleto' && !o.hasBoleto) return false;
          if (filterTag === 'custom' && (!o.tags || o.tags.length === 0)) return false; // Future use
        }

        if (filterOrigin !== 'all' && o.origin !== filterOrigin) return false;
        if (filterState !== 'all' && (o.addressDetails?.state?.toLowerCase() !== filterState.toLowerCase())) return false;
        if (filterCity && (!o.addressDetails?.city || !o.addressDetails.city.toLowerCase().includes(filterCity.toLowerCase()))) return false;
        if (filterCarrier !== 'all' && o.carrier !== filterCarrier) return false;

        if (startDate) {
          const orderDate = new Date(o.createdAt);
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (orderDate < start) return false;
        }

        if (endDate) {
          const orderDate = new Date(o.createdAt);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (orderDate > end) return false;
        }

        return true;
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName, 'pt-BR', { sensitivity: 'base' }));
  }, [orders, searchQuery, startDate, endDate, filterTag, filterOrigin, filterState, filterCity, filterCarrier]);

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [bulkCheckModal, setBulkCheckModal] = useState<{ open: boolean; type: 'separation' | 'production' }>({ open: false, type: 'separation' });

  const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
  const allSelectedInPedidos = selectedOrders.length > 0 && selectedOrders.every(o => o.status === 'pedidos');
  const allSelectedInSeparadas = selectedOrders.length > 0 && selectedOrders.every(o => o.status === 'embalagens_separadas');

  const handleToggleSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllInColumn = (columnId: OrderStatus) => {
    const columnOrders = filteredOrders.filter(o => o.status === columnId);
    const columnOrderIds = columnOrders.map(o => o.id);
    
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      const allSelected = columnOrderIds.every(id => next.has(id));
      
      if (allSelected) {
        columnOrderIds.forEach(id => next.delete(id));
      } else {
        columnOrderIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    console.log("Deleting selected orders:", Array.from(selectedOrderIds));
    selectedOrderIds.forEach(id => {
      console.log("Calling onDeleteOrder for:", id);
      onDeleteOrder(id);
    });
    setSelectedOrderIds(new Set());
    setIsConfirmingDelete(false);
  };

  const handleMoveSelected = (targetStatus: OrderStatus) => {
    selectedOrderIds.forEach(id => {
      const order = orders.find(o => o.id === id);
      if (order && order.status !== targetStatus) {
        const currentIndex = COLUMNS.findIndex(c => c.id === order.status);
        const newIndex = COLUMNS.findIndex(c => c.id === targetStatus);
        const isMovingForward = newIndex > currentIndex;
        
        let updatedProducts = order.products;
        if (isMovingForward) {
          if (targetStatus === 'embalagens_separadas' || targetStatus === 'embalagens_prontas') {
            updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
          }
        } else {
          updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
        }

        onUpdateOrder({
          ...order,
          status: targetStatus,
          products: updatedProducts,
          statusHistory: [
            ...(order.statusHistory || []),
            { status: targetStatus, timestamp: new Date().toISOString() }
          ]
        });
      }
    });
    setSelectedOrderIds(new Set());
  };

  const handleUpdateFromModal = (updatedOrder: Order) => {
    onUpdateOrder(updatedOrder);
    setSelectedOrder(updatedOrder);
  };

  const currentColumnOrders = selectedOrder ? filteredOrders.filter(o => o.status === selectedOrder.status) : [];
  const selectedOrderIndex = selectedOrder ? currentColumnOrders.findIndex(o => o.id === selectedOrder.id) : -1;
  const hasNextOrder = selectedOrderIndex !== -1 && selectedOrderIndex < currentColumnOrders.length - 1;

  const handleAdvanceAndNext = (updatedOrder: Order) => {
    onUpdateOrder(updatedOrder);
    
    if (selectedOrder) {
      if (hasNextOrder) {
        const nextOrder = currentColumnOrders[selectedOrderIndex + 1];
        setSelectedOrder(nextOrder);
      } else {
        setSelectedOrder(null);
      }
    }
  };

  const handleNextOrder = () => {
    if (selectedOrder && hasNextOrder) {
      const nextOrder = currentColumnOrders[selectedOrderIndex + 1];
      setSelectedOrder(nextOrder);
    }
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !scrollRef.current) return;
      e.preventDefault();
      const x = e.pageX;
      const walk = (x - startX.current) * 1.5; // scroll speed
      scrollRef.current.scrollLeft = scrollLeft.current - walk;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    
    // Check if the target is a card or a button
    const target = e.target as HTMLElement;
    if (target.closest('.order-card') || target.closest('button') || target.closest('input')) return;
    
    setIsDragging(true);
    startX.current = e.pageX;
    scrollLeft.current = scrollRef.current.scrollLeft;
  };

  const [archiveModal, setArchiveModal] = useState<{ open: boolean; availableMonths: string[] }>({ open: false, availableMonths: [] });
  const [selectedArchiveMonth, setSelectedArchiveMonth] = useState('');

  const handleArchiveOldOrders = () => {
    const months = Array.from(new Set(orders.filter(o => o.status === 'entregue' && !o.archived).map(o => {
      const d = new Date(o.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))).sort().reverse();

    if (months.length === 0) {
      toast.error('Nenhum pedido entregue para arquivar.');
      return;
    }

    setArchiveModal({ open: true, availableMonths: months });
    setSelectedArchiveMonth(months[0]);
  };

  const confirmArchive = () => {
    const ordersToArchive = orders.filter(o => {
      if (o.status !== 'entregue' || o.archived) return false;
      const d = new Date(o.createdAt);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return m === selectedArchiveMonth;
    });

    if (ordersToArchive.length === 0) {
      toast.error('Nenhum pedido encontrado para o mês selecionado.');
      return;
    }

    ordersToArchive.forEach(o => onArchiveOrder(o.id));
    toast.success(`${ordersToArchive.length} pedidos arquivados com sucesso!`);
    setArchiveModal({ open: false, availableMonths: [] });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsBlingImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg"
              >
                <Download className="size-4" />
                Importar Bling
              </button>

              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showFilters ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <Filter className="size-4" />
                {showFilters ? 'Ocultar Filtros' : 'Filtros'}
              </button>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {filteredOrders.length}
                </span>
              </div>
              {selectedOrderIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Selecionados:</span>
                  <span className="text-sm font-bold text-white bg-primary px-2 py-0.5 rounded-md shadow-sm">
                    {selectedOrderIds.size}
                  </span>
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-slate-100 dark:border-slate-800"
              >
                <div className="px-6 py-4 flex flex-wrap gap-4 items-end bg-slate-50/50 dark:bg-slate-900/50">
                  {/* Date Range */}
                  <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Postagem De:</span>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                        <input 
                          type="date" 
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-primary transition-all w-[130px]"
                        />
                      </div>
                    </div>
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Até:</span>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                        <input 
                          type="date" 
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-primary transition-all w-[130px]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dropdowns */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tags / Flags:</span>
                    <select
                      value={filterTag}
                      onChange={e => setFilterTag(e.target.value)}
                      className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-primary transition-all"
                    >
                      <option value="all">Todas as Tags</option>
                      <option value="amostra">Amostras</option>
                      <option value="hasInvoice">Com Nota Fiscal (NF-e)</option>
                      <option value="hasBoleto">Com Boleto</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Origem:</span>
                    <select
                      value={filterOrigin}
                      onChange={e => setFilterOrigin(e.target.value)}
                      className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-primary transition-all"
                    >
                      <option value="all">Todas as Origens</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="Wix">Wix</option>
                      <option value="Amazon">Amazon</option>
                      <option value="Meli">Mercado Livre</option>
                      <option value="CRM">CRM / Manual</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado (UF):</span>
                    <select
                      value={filterState}
                      onChange={e => setFilterState(e.target.value)}
                      className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-primary transition-all uppercase"
                    >
                      <option value="all">TODOS</option>
                      {/* Generates a brief list of unique states actually present in orders */}
                      {Array.from(new Set(orders.map(o => o.addressDetails?.state?.toUpperCase()).filter(Boolean))).sort().map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cidade:</span>
                    <input
                      type="text"
                      placeholder="Nome da cidade..."
                      value={filterCity}
                      onChange={e => setFilterCity(e.target.value)}
                      className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-primary transition-all w-32"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transportadora:</span>
                    <select
                      value={filterCarrier}
                      onChange={e => setFilterCarrier(e.target.value)}
                      className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-primary transition-all"
                    >
                      <option value="all">Todas</option>
                      {Array.from(new Set(orders.map(o => o.carrier).filter(Boolean))).sort().map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {(startDate || endDate || filterTag !== 'all' || filterOrigin !== 'all' || filterState !== 'all' || filterCity || filterCarrier !== 'all') && (
                    <button 
                      onClick={() => { 
                        setStartDate(''); 
                        setEndDate(''); 
                        setFilterTag('all');
                        setFilterOrigin('all');
                        setFilterState('all');
                        setFilterCity('');
                        setFilterCarrier('all');
                      }}
                      className="ml-auto p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                      title="Limpar Todos os Filtros"
                    >
                      <RotateCcw className="size-4" /> Limpar Filtros
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div 
          ref={scrollRef}
          onMouseDown={onMouseDown}
          className={`flex-1 w-full overflow-x-auto custom-scrollbar p-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
        <div className="flex gap-4 h-full min-w-max pb-4">
          {COLUMNS.map(column => (
            <KanbanColumn 
              key={column.id}
              column={column}
              orders={filteredOrders.filter(o => o.status === column.id)}
              onUpdateOrder={onUpdateOrder}
              onMoveOrder={onMoveOrder}
              onDeleteOrder={onDeleteOrder}
              onArchiveOrder={onArchiveOrder}
              onOrderClick={setSelectedOrder}
              selectedOrderIds={selectedOrderIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={() => handleSelectAllInColumn(column.id)}
              onManualSync={handleManualSyncAll}
              onArchiveOldOrders={column.id === 'entregue' ? handleArchiveOldOrders : undefined}
              isSyncingAll={isSyncingAll}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {selectedOrder && (
            <OrderDetailsModal 
              key={selectedOrder.id}
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onUpdateOrder={handleUpdateFromModal}
              onArchiveOrder={onArchiveOrder}
              hasNextOrder={hasNextOrder}
              onAdvanceAndNext={handleAdvanceAndNext}
              onNextOrder={handleNextOrder}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {bulkCheckModal.open && (
            <BulkCheckModal 
              selectedOrders={selectedOrders}
              onClose={() => setBulkCheckModal({ ...bulkCheckModal, open: false })}
              onUpdateOrder={onUpdateOrder}
              title={bulkCheckModal.type === 'separation' ? 'Separar Embalagens' : 'Marcar Produção'}
              subtitle={bulkCheckModal.type === 'separation' ? 'Separação em Lote' : 'Produção em Lote'}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isBlingImportOpen && (
            <BlingImportModal 
              onClose={() => setIsBlingImportOpen(false)}
              onImport={async (order) => {
                if (onAddOrder) {
                  await onAddOrder(order);
                }
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {archiveModal.open && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Trash2 className="size-5 text-primary" /> Arquivar Pedidos
                  </h3>
                  <button 
                    onClick={() => setArchiveModal({ open: false, availableMonths: [] })}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Selecione o mês para arquivar os pedidos entregues. Eles continuarão disponíveis nos relatórios e dashboards.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mês/Ano</label>
                    <select
                      value={selectedArchiveMonth}
                      onChange={(e) => setSelectedArchiveMonth(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      {archiveModal.availableMonths.map(m => {
                        const [year, month] = m.split('-');
                        const date = new Date(parseInt(year), parseInt(month) - 1);
                        return (
                          <option key={m} value={m}>
                            {date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                  <button
                    onClick={() => setArchiveModal({ open: false, availableMonths: [] })}
                    className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmArchive}
                    className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Arquivar Pedidos
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedOrderIds.size > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-slate-900 dark:bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-700"
            >
              <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
                <div className="size-8 rounded-xl bg-primary/20 flex items-center justify-center">
                  <CheckSquare className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">{selectedOrderIds.size} selecionados</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ações em lote</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {allSelectedInPedidos && (
                  <button 
                    onClick={() => setBulkCheckModal({ open: true, type: 'separation' })}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20"
                  >
                    <Layers className="size-4" /> Separar Embalagens
                  </button>
                )}

                {allSelectedInSeparadas && (
                  <button 
                    onClick={() => setBulkCheckModal({ open: true, type: 'production' })}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20"
                  >
                    <CheckSquare className="size-4" /> Marcar Produção
                  </button>
                )}

                <div className="relative group/move">
                  <button 
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    <ArrowRight className="size-4" /> Mover para... <ChevronDown className="size-3" />
                  </button>
                  <div className="absolute bottom-full mb-2 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 w-48 hidden group-hover/move:block animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {COLUMNS.map(col => (
                      <button
                        key={col.id}
                        onClick={() => handleMoveSelected(col.id)}
                        className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors flex items-center gap-2"
                      >
                        <div className={`size-2 rounded-full ${col.color}`} />
                        {col.title}
                      </button>
                    ))}
                  </div>
                </div>

                {!isConfirmingDelete ? (
                  <button 
                    onClick={() => setIsConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-xl text-xs font-bold transition-all"
                  >
                    <Trash2 className="size-4" /> Excluir Selecionados
                  </button>
                ) : (
                  <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                    <p className="text-[10px] font-bold text-red-400 uppercase mr-2">Confirmar?</p>
                    <button 
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold"
                    >
                      Não
                    </button>
                    <button 
                      onClick={handleDeleteSelected}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-[10px] font-bold"
                    >
                      Sim, Excluir
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => {
                    setSelectedOrderIds(new Set());
                    setIsConfirmingDelete(false);
                  }}
                  className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-all"
                  title="Limpar Seleção"
                >
                  <X className="size-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

    <DragOverlay adjustScale={false}>
        {activeOrder ? (
          <div className="w-72 opacity-80 rotate-3 cursor-grabbing">
            <OrderCard 
              order={activeOrder}
              onUpdateOrder={() => {}}
              onMoveOrder={() => {}}
              onDeleteOrder={() => {}}
              onArchiveOrder={() => {}}
              onClick={() => {}}
              selected={selectedOrderIds.has(activeOrder.id)}
              onToggleSelect={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanColumnProps {
  key?: React.Key;
  column: any;
  orders: Order[];
  onUpdateOrder: (order: Order) => void;
  onMoveOrder: (order: Order, direction: 'next' | 'prev') => void;
  onDeleteOrder: (orderId: string) => void;
  onArchiveOrder: (orderId: string) => void;
  onOrderClick: (order: Order) => void;
  selectedOrderIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onManualSync: () => void;
  onArchiveOldOrders?: () => void;
  isSyncingAll: boolean;
}

function KanbanColumn({ 
  column, 
  orders, 
  onUpdateOrder, 
  onMoveOrder, 
  onDeleteOrder, 
  onArchiveOrder, 
  onOrderClick,
  selectedOrderIds,
  onToggleSelect,
  onSelectAll,
  onManualSync,
  onArchiveOldOrders,
  isSyncingAll
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      columnId: column.id,
    },
  });

  return (
    <div ref={setNodeRef} className="w-72 flex flex-col gap-4 h-full shrink-0">
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl shadow-sm border border-white/10 ${column.color} ${column.textColor}`}>
        <div className="flex items-center gap-2">
          <h3 className="font-black text-[10px] uppercase tracking-[0.15em]">{column.title}</h3>
          <span className={`bg-white/20 text-[10px] px-2 py-0.5 rounded-full font-black ${column.textColor}`}>
            {orders.length}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          {column.id === 'enviado' && orders.length > 0 && (
            <button 
              onClick={onManualSync}
              disabled={isSyncingAll}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-all flex items-center gap-1 text-white"
              title="Sincronizar Todos os Rastreios"
            >
              <RefreshCw className={`size-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
            </button>
          )}
          {column.id === 'entregue' && orders.length > 0 && onArchiveOldOrders && (
            <button 
              onClick={onArchiveOldOrders}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-all flex items-center gap-1 text-white"
              title="Arquivar Meses Anteriores"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          {orders.length > 0 && (
            <button 
              onClick={onSelectAll}
              className={`flex items-center gap-1.5 px-2 py-1 hover:bg-white/20 rounded-lg transition-all ${column.textColor}`}
              title="Selecionar Todos"
            >
              {orders.every(o => selectedOrderIds.has(o.id)) ? (
                <CheckSquare className="size-4" />
              ) : (
                <Square className="size-4" />
              )}
              <span className="text-[9px] font-black uppercase tracking-wider">Tudo</span>
            </button>
          )}
        </div>
      </div>

      <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 bg-slate-100/50 dark:bg-slate-800/30 rounded-2xl p-2 overflow-y-auto custom-scrollbar border border-slate-200/50 dark:border-slate-700/50 min-h-[150px]">
          <AnimatePresence mode="popLayout">
            {orders.map(order => (
              <SortableOrderCard 
                key={order.id} 
                order={order} 
                onUpdateOrder={onUpdateOrder}
                onMoveOrder={onMoveOrder}
                onDeleteOrder={onDeleteOrder}
                onArchiveOrder={onArchiveOrder}
                onClick={() => onOrderClick(order)}
                selected={selectedOrderIds.has(order.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </AnimatePresence>
          
          {orders.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-12">
              <LayoutDashboard className="size-8 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Vazio</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
