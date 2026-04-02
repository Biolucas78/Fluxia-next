'use client';

import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import OrderCard from './OrderCard';
import OrderDetailsModal from './OrderDetailsModal';
import { LayoutDashboard, Trash2, CheckSquare, Square, X, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

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
  searchQuery: string;
}

interface SortableOrderCardProps {
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

export default function KanbanBoard({ orders, onUpdateOrder, onMoveOrder, onDeleteOrder, onArchiveOrder, searchQuery }: KanbanBoardProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

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

      const updatedOrder = { ...activeOrder, status: overColumnId, products: updatedProducts };
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
            body: JSON.stringify({ trackingNumber: order.trackingNumber, carrier: order.carrier })
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
          body: JSON.stringify({ trackingNumber: order.trackingNumber, carrier: order.carrier })
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
  const filteredOrders = orders.filter(o => 
    o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div 
        ref={scrollRef}
        onMouseDown={onMouseDown}
        className={`h-full w-full overflow-x-auto custom-scrollbar p-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
            />
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
          {orders.length > 0 && (
            <button 
              onClick={onSelectAll}
              className={`p-1 hover:bg-white/20 rounded-lg transition-all flex items-center gap-1 ${column.textColor}`}
              title="Selecionar Todos"
            >
              {orders.every(o => selectedOrderIds.has(o.id)) ? (
                <CheckSquare className="size-4" />
              ) : (
                <Square className="size-4" />
              )}
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
