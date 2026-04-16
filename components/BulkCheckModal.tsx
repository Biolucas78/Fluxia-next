'use client';

import React, { useMemo, useState } from 'react';
import { X, CheckSquare, Square, Package, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Order, ProductItem, OrderStatus } from '@/lib/types';

interface BulkCheckModalProps {
  selectedOrders: Order[];
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
  title: string;
  subtitle: string;
}

interface AggregatedProduct {
  key: string;
  name: string;
  weight: string;
  grindType: string;
  totalQuantity: number;
  allChecked: boolean;
}

export default function BulkCheckModal({ 
  selectedOrders, 
  onClose, 
  onUpdateOrder,
  title,
  subtitle
}: BulkCheckModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  // Aggregate products from all selected orders
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, AggregatedProduct>();

    selectedOrders.forEach(order => {
      order.products.forEach(product => {
        // Only compute products that are NOT checked
        if (product.checked) return;

        const key = `${product.name}-${product.weight}-${product.grindType}`;
        const existing = map.get(key);

        if (existing) {
          existing.totalQuantity += product.quantity;
        } else {
          map.set(key, {
            key,
            name: product.name,
            weight: product.weight,
            grindType: product.grindType,
            totalQuantity: product.quantity,
            allChecked: false
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const getWeightPriority = (weight: string) => {
        const w = weight.toLowerCase();
        if (w.includes('40g')) return 1;
        if (w.includes('120g')) return 2;
        if (w.includes('250g')) return 3;
        if (w.includes('500g')) return 4;
        if (w.includes('1kg') || w.includes('1000g')) return 5;
        if (w.includes('5kg')) return 6;
        if (w.includes('drip')) return 7;
        return 99;
      };

      const priorityA = getWeightPriority(a.weight);
      const priorityB = getWeightPriority(b.weight);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [selectedOrders]);

  const handleToggleProduct = async (productKey: string, targetChecked: boolean) => {
    setIsUpdating(true);
    
    // We need to update each order that contains this product
    for (const order of selectedOrders) {
      let hasChange = false;
      const updatedProducts = order.products.map(p => {
        const key = `${p.name}-${p.weight}-${p.grindType}`;
        if (key === productKey && p.checked !== targetChecked) {
          hasChange = true;
          return { ...p, checked: targetChecked };
        }
        return p;
      });

      if (hasChange) {
        onUpdateOrder({
          ...order,
          products: updatedProducts
        });
      }
    }
    
    setIsUpdating(false);
  };

  const handleFinish = () => {
    // Check each selected order
    selectedOrders.forEach(order => {
      const allChecked = order.products.every(p => p.checked);
      
      if (allChecked) {
        let nextStatus: OrderStatus | null = null;
        
        if (order.status === 'pedidos') {
          nextStatus = 'embalagens_separadas';
        } else if (order.status === 'embalagens_separadas') {
          nextStatus = 'embalagens_prontas';
        }

        if (nextStatus) {
          onUpdateOrder({
            ...order,
            status: nextStatus,
            statusHistory: [
              ...(order.statusHistory || []),
              { status: nextStatus, timestamp: new Date().toISOString() }
            ]
          });
        }
      }
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CheckSquare className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{title}</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X className="size-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {aggregatedProducts.map((product) => (
            <button
              key={product.key}
              onClick={() => handleToggleProduct(product.key, !product.allChecked)}
              disabled={isUpdating}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                product.allChecked 
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100' 
                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`size-10 rounded-xl flex items-center justify-center transition-colors ${
                  product.allChecked ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Package className="size-5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black">{product.totalQuantity}x</span>
                    <span className="text-sm font-bold">{product.name}</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {product.weight} • {product.grindType}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isUpdating ? (
                  <Loader2 className="size-5 animate-spin text-slate-400" />
                ) : product.allChecked ? (
                  <CheckSquare className="size-6 text-emerald-500" />
                ) : (
                  <Square className="size-6 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </button>
          ))}

          {aggregatedProducts.length === 0 && (
            <div className="py-12 text-center opacity-30">
              <Package className="size-12 mx-auto mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">Nenhum produto encontrado</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <button
            onClick={handleFinish}
            className="w-full bg-slate-900 dark:bg-slate-800 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg"
          >
            Concluir e Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
