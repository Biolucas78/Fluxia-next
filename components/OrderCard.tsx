'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Order, ProductItem, ShippingOption } from '@/lib/types';
import { MapPin, Hash, CheckCircle2, Truck, Package, FileText, Receipt, X as CloseIcon, AlertCircle, Trash2, Calculator, Loader2, Calendar } from 'lucide-react';
import ShippingQuoteModal from './ShippingQuoteModal';
import LabelGenerationModal from './LabelGenerationModal';
import ShippingDataReviewModal from './ShippingDataReviewModal';
import { motion, AnimatePresence } from 'motion/react';
import { calculateWeightInKg } from '@/lib/parser';

interface OrderCardProps {
  order: Order;
  onUpdateOrder: (order: Order) => void;
  onMoveOrder: (order: Order, direction: 'next' | 'prev') => void;
  onDeleteOrder?: (orderId: string) => void;
  onArchiveOrder?: (orderId: string) => void;
  onClick?: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const CARRIERS = ['Correio', 'Braspress', 'MelhorEnvio', 'Lalamove'];

export default function OrderCard({ 
  order, 
  onUpdateOrder, 
  onMoveOrder, 
  onDeleteOrder, 
  onArchiveOrder, 
  onClick,
  selected = false,
  onToggleSelect
}: OrderCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<ShippingOption | null>(null);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // Clear any existing timeout just in case
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 1200); // 1.2 seconds delay as requested
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsExpanded(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const getCarrierColor = (carrier: string) => {
    const c = carrier.toLowerCase();
    if (c.includes('correio')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (c.includes('total')) return 'bg-red-100 text-red-700 border-red-200';
    if (c.includes('braspress')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (c.includes('melhorenvio') || c.includes('melhor envio')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (c.includes('lalamove')) return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const handleDelete = (e: React.MouseEvent) => {
    console.log("handleDelete clicked");
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    console.log("Confirming delete for order:", order.id);
    e.stopPropagation();
    if (onDeleteOrder) {
      console.log("Calling onDeleteOrder prop");
      onDeleteOrder(order.id);
    } else {
      console.warn("onDeleteOrder prop is missing");
    }
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const isReadyToMove = useMemo(() => {
    const productsReady = order.products.every(p => p.checked);
    
    // Requirements per stage
    if (order.status === 'embalagens_prontas') {
      // At least one document must be checked
      return productsReady && (order.hasInvoice || order.hasBoleto || order.hasOrderDocument);
    }
    if (order.status === 'caixa_montada') {
      return productsReady;
    }
    if (order.status === 'enviado' || order.status === 'entregue') {
      return true;
    }
    
    return productsReady;
  }, [order]);

  const handleFetchQuotes = async (e?: React.MouseEvent, updatedOrder?: Order) => {
    if (e) e.stopPropagation();
    const targetOrder = updatedOrder || order;
    
    setIsQuoting(true);
    setQuoteError(null);
    setIsQuoteModalOpen(true);
    setIsReviewModalOpen(false);

    try {
      // Extract CEP from address (8 digits, potentially with dash)
      const cepMatch = targetOrder.addressDetails?.zip || targetOrder.address?.match(/\d{5}-?\d{3}/)?.[0];
      if (!cepMatch) {
        throw new Error('CEP não encontrado no endereço.');
      }
      const destinationCep = cepMatch.replace(/\D/g, '');

      // Use box weight if available, otherwise calculate from products
      const totalWeightG = targetOrder.boxWeight 
        ? targetOrder.boxWeight 
        : targetOrder.products.reduce((acc, p) => {
            const w = parseFloat(p.weight) || 0;
            if (p.weight.toLowerCase().includes('kg')) return acc + w * 1000 * p.quantity;
            return acc + w * p.quantity;
          }, 0);

      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep,
          weight: totalWeightG,
          products: targetOrder.products,
          boxDimensions: targetOrder.boxDimensions
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao buscar cotação.');
      }

      const quotes: ShippingOption[] = await response.json();
      onUpdateOrder({ ...order, shippingQuote: quotes });
    } catch (err: any) {
      setQuoteError(err.message);
    } finally {
      setIsQuoting(false);
    }
  };

  const handleConfirmCarrierData = (updatedOrder: Order) => {
    onUpdateOrder(updatedOrder);
    handleFetchQuotes(undefined, updatedOrder);
  };

  const handleSelectQuote = (quote: ShippingOption) => {
    setSelectedQuote(quote);
    setIsQuoteModalOpen(false);
    setIsLabelModalOpen(true);
  };

  const handleGenerateLabel = async () => {
    setIsGeneratingLabel(true);
    try {
      // Call label API
      const response = await fetch('/api/shipping/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, quote: selectedQuote }),
      });
      if (!response.ok) throw new Error('Falha ao gerar etiqueta.');
      // Handle success (e.g., download label)
      setIsLabelModalOpen(false);
      onUpdateOrder({ ...order, selectedShippingOption: selectedQuote || undefined });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  const getStatusBadge = () => {
    switch (order.status) {
      case 'pedidos': return <span className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Novo</span>;
      case 'embalagens_separadas': return <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Separado</span>;
      case 'embalagens_prontas': return <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Pronto</span>;
      case 'caixa_montada': return <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Montado</span>;
      case 'enviado': return <span className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Enviado</span>;
      case 'entregue': return <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Entregue</span>;
    }
  };

  const abbreviateCity = (city: string) => {
    const c = city.trim();
    const lower = c.toLowerCase();
    
    // Specific requested mappings
    if (lower === 'belo horizonte') return 'BH';
    if (lower === 'são josé do rio preto') return 'SJ Rio Preto';
    if (lower === 'rio de janeiro') return 'RJ';
    if (lower === 'são paulo') return 'SP';
    
    // Dictionary of common title abbreviations in Portuguese
    const titles: Record<string, string> = {
      'coronel': 'Cel.',
      'prefeito': 'Pref.',
      'presidente': 'Pres.',
      'governador': 'Gov.',
      'general': 'Gen.',
      'doutor': 'Dr.',
      'doutora': 'Dra.',
      'professor': 'Prof.',
      'professora': 'Profa.',
      'engenheiro': 'Eng.',
      'engenheira': 'Enga.',
      'marechal': 'Mal.',
      'almirante': 'Alm.',
      'tenente': 'Ten.',
      'capitão': 'Cap.',
      'major': 'Maj.',
      'sargento': 'Sgt.',
      'cabo': 'Cb.',
      'soldado': 'Sd.',
      'senador': 'Sen.',
      'deputado': 'Dep.',
      'vereador': 'Ver.',
      'bispo': 'Bp.',
      'padre': 'Pe.',
      'frei': 'Fr.',
      'irmã': 'Ir.',
      'dom': 'D.',
      'dona': 'Dna.',
      'senhor': 'Sr.',
      'senhora': 'Sra.',
      'mestre': 'Me.',
      'santo': 'Sto.',
      'santa': 'Sta.',
      'são': 'S.',
    };

    // Special case for São José
    if (lower.startsWith('são josé ')) {
      return 'SJ ' + c.substring(9);
    }

    // Split and replace words
    const words = c.split(' ');
    const abbreviatedWords = words.map(word => {
      const wordLower = word.toLowerCase();
      return titles[wordLower] || word;
    });

    return abbreviatedWords.join(' ');
  };

  const locationInfo = useMemo(() => {
    let city = '';
    let state = '';

    if (order.addressDetails?.city && order.addressDetails?.state) {
      city = order.addressDetails.city;
      state = order.addressDetails.state;
    } else if (order.address) {
      // Try to match "Cidade - UF"
      const matchUF = order.address.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})/);
      if (matchUF) {
        city = matchUF[1].trim();
        state = matchUF[2];
      } else {
        // Fallback: try to find the part before the CEP or at the end
        const parts = order.address.split(',');
        if (parts.length >= 2) {
          const cityPart = parts[parts.length - 2];
          if (cityPart && !cityPart.match(/\d{5}/)) {
            city = cityPart.trim();
          }
        }
      }
    }

    if (!city) return null;
    
    const abbrCity = abbreviateCity(city);
    return state ? `${abbrCity} - ${state.toUpperCase()}` : abbrCity;
  }, [order.address, order.addressDetails]);

  return (
    <motion.div 
      layout
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`order-card bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border transition-all cursor-pointer relative group ${
        selected ? 'ring-2 ring-primary border-primary' : ''
      } ${
        order.status === 'entregue' 
          ? 'border-emerald-200 dark:border-emerald-900/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
          : 'border-slate-200 dark:border-slate-800 hover:border-primary'
      }`}
    >
      {locationInfo && (
        <div className="absolute top-2 right-2 z-10">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700">
            {locationInfo}
          </span>
        </div>
      )}
      {onToggleSelect && (
        <div 
          className={`absolute -left-2 -top-2 z-10 size-6 rounded-full bg-white dark:bg-slate-800 border-2 flex items-center justify-center transition-all ${
            selected ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(order.id);
          }}
        >
          <div className={`size-2 rounded-full ${selected ? 'bg-white' : 'bg-slate-200 dark:bg-slate-700'}`} />
        </div>
      )}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-red-500/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle className="size-8 text-white mb-2" />
            <p className="text-white text-xs font-bold mb-3">Excluir este pedido?</p>
            <div className="flex gap-2 w-full">
              <button 
                onClick={cancelDelete}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 py-2 bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 py-2 bg-white text-red-600 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Trash2 className="size-3" />
                Confirmar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed View (Always visible) */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 truncate pr-16">
            <h4 className="font-bold text-slate-900 dark:text-white leading-tight truncate">{order.tradeName || order.clientName}</h4>
            {order.isSample && (
              <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shrink-0">
                Amostra
              </span>
            )}
          </div>
          <div className={`flex items-center justify-between mt-1 ${isExpanded ? 'hidden' : 'flex'}`}>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {order.carrier && (
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border ${getCarrierColor(order.carrier)}`}>
                  {order.carrier}
                </span>
              )}
              {order.deliveryDate ? (
                <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter flex items-center gap-0.5">
                  <Calendar className="size-2" /> {new Date(order.deliveryDate).toLocaleDateString('pt-BR')}
                </span>
              ) : order.trackingStatus && (
                <span className="text-[8px] font-bold text-primary uppercase tracking-tighter truncate max-w-[80px]">
                  {order.trackingStatus}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-400">
                {order.products.filter(p => p.checked).length}/{order.products.length}
              </span>
              {order.products.every(p => p.checked) && <CheckCircle2 className="size-3 text-emerald-500" />}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded View (Visible on hover with delay) */}
      <div className={`${isExpanded ? 'block' : 'hidden'} mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {order.isSample && (
              <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter">
                Amostra
              </span>
            )}
            {order.carrier && (
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border ${getCarrierColor(order.carrier)}`}>
                {order.carrier}
              </span>
            )}
            <button 
              onClick={handleDelete}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 rounded-lg transition-all"
              title="Excluir Pedido"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">#{order.id.toUpperCase()}</span>
            <span className="text-[9px] text-slate-400 block">{new Date(order.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {order.cnpj && (
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mb-2">
            <Hash className="size-3" /> {order.cnpj}
          </p>
        )}

        {order.address && (
          <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex gap-1 items-start">
              <MapPin className="size-3 mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{order.address}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
            <span>Produtos</span>
          </p>
          <div className="space-y-1.5">
            {order.products.map((product) => (
              <label 
                key={product.id} 
                className="flex items-center gap-2 group/item cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  type="checkbox"
                  checked={product.checked}
                  onChange={(e) => {
                    const updatedProducts = order.products.map(p => 
                      p.id === product.id ? { ...p, checked: !p.checked } : p
                    );
                    onUpdateOrder({ ...order, products: updatedProducts });
                  }}
                  className={`rounded border-slate-300 text-primary focus:ring-primary size-3.5 transition-all`}
                />
                <span className={`text-xs transition-all ${product.checked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                  {product.quantity}X {product.name}
                  {product.name.toLowerCase() !== 'dripcoffee' && (
                    <> {product.weight} ({product.grindType})</>
                  )}
                  {product.productionNotes && <span className="ml-1 text-[9px] text-primary italic"> {product.productionNotes}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        {order.status === 'embalagens_prontas' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documentação</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label 
                className="flex items-center gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  type="checkbox"
                  checked={order.hasInvoice}
                  onChange={() => onUpdateOrder({ ...order, hasInvoice: !order.hasInvoice })}
                  className="rounded border-slate-300 text-primary focus:ring-primary size-3.5"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="size-3" /> NF
                </span>
              </label>
              <label 
                className="flex items-center gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  type="checkbox"
                  checked={order.hasBoleto}
                  onChange={() => onUpdateOrder({ ...order, hasBoleto: !order.hasBoleto })}
                  className="rounded border-slate-300 text-primary focus:ring-primary size-3.5"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Receipt className="size-3" /> Boleto
                </span>
              </label>
              <label 
                className="flex items-center gap-2 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  type="checkbox"
                  checked={order.hasOrderDocument}
                  onChange={() => onUpdateOrder({ ...order, hasOrderDocument: !order.hasOrderDocument })}
                  className="rounded border-slate-300 text-primary focus:ring-primary size-3.5"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Package className="size-3" /> Pedido
                </span>
              </label>
            </div>
          </div>
        )}

        {order.status === 'caixa_montada' && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsReviewModalOpen(true);
            }}
            className="w-full mt-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Truck className="size-3" />
            Adicionar ao Carrinho
          </button>
        )}

        <ShippingDataReviewModal
          key={`review-${order.id}-${isReviewModalOpen}`}
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          order={order}
          onConfirm={handleConfirmCarrierData}
        />

        <ShippingQuoteModal
          isOpen={isQuoteModalOpen}
          onClose={() => setIsQuoteModalOpen(false)}
          quotes={order.shippingQuote || []}
          onSelect={handleSelectQuote}
          isQuoting={isQuoting}
        />

        <LabelGenerationModal
          isOpen={isLabelModalOpen}
          onClose={() => setIsLabelModalOpen(false)}
          quote={selectedQuote}
          onGenerate={handleGenerateLabel}
          isGenerating={isGeneratingLabel}
          order={order}
          onUpdateOrder={onUpdateOrder}
        />

        {['enviado', 'entregue'].includes(order.status) && order.carrier && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Transportadora</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border inline-block ${getCarrierColor(order.carrier)}`}>
                {order.carrier}
              </span>
            </div>
            {order.trackingNumber && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rastreio</p>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400 select-all">{order.trackingNumber}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {order.status !== 'pedidos' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onMoveOrder(order, 'prev');
              }}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Voltar
            </button>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (order.status === 'entregue' && onArchiveOrder) {
                onArchiveOrder(order.id);
              } else {
                onMoveOrder(order, 'next');
              }
            }}
            disabled={!isReadyToMove}
            className={`flex-[2] py-1.5 rounded-lg text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 ${
              !isReadyToMove
                ? 'bg-slate-300 cursor-not-allowed' 
                : order.status === 'entregue'
                  ? 'bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-200/50'
                  : 'bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20'
            }`}
          >
            {order.status === 'entregue' ? 'Finalizado' : 'Avançar'}
            <CheckCircle2 className="size-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
