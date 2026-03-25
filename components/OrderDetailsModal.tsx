'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Order, OrderStatus } from '@/lib/types';
import { 
  X, 
  MapPin, 
  Hash, 
  CheckCircle2, 
  Truck, 
  Package, 
  FileText, 
  Receipt,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Calendar,
  User,
  Building2,
  Box,
  MoreVertical,
  Trash2,
  Edit2,
  Check,
  RotateCcw,
  Plus,
  Calculator,
  Loader2,
  Printer,
  ExternalLink,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductItem, ShippingOption } from '@/lib/types';
import ShippingQuoteModal from './ShippingQuoteModal';
import LabelGenerationModal from './LabelGenerationModal';
import ShippingDataReviewModal from './ShippingDataReviewModal';

interface OrderDetailsModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
  onArchiveOrder: (orderId: string) => void;
  hasNextOrder?: boolean;
  onAdvanceAndNext?: (order: Order) => void;
}

const COLUMNS: { id: OrderStatus; title: string; color: string; textColor: string }[] = [
  { id: 'pedidos', title: 'Pedidos', color: 'bg-rose-500', textColor: 'text-white' },
  { id: 'embalagens_separadas', title: 'Emb. Separadas', color: 'bg-slate-500', textColor: 'text-white' },
  { id: 'embalagens_prontas', title: 'Emb. Prontas', color: 'bg-blue-500', textColor: 'text-white' },
  { id: 'caixa_montada', title: 'Caixa Montada', color: 'bg-indigo-500', textColor: 'text-white' },
  { id: 'enviado', title: 'Enviado', color: 'bg-violet-500', textColor: 'text-white' },
  { id: 'entregue', title: 'Entregue', color: 'bg-emerald-500', textColor: 'text-white' },
];

const CARRIERS = ['Correio', 'Total', 'Braspress', 'MelhorEnvio', 'Lalamove'];

export default function OrderDetailsModal({ order, onClose, onUpdateOrder, onArchiveOrder, hasNextOrder, onAdvanceAndNext }: OrderDetailsModalProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProductItem>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editedAddress, setEditedAddress] = useState(order.address || '');
  const [editedAddressDetails, setEditedAddressDetails] = useState(order.addressDetails || {
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    zip: ''
  });
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editedCustomer, setEditedCustomer] = useState({
    clientName: order.clientName,
    cnpj: order.cnpj || '',
    cpf: order.cpf || '',
    phone: order.phone || ''
  });
  const [isEditingObservations, setIsEditingObservations] = useState(false);
  const [editedObservations, setEditedObservations] = useState(order.observations || '');
  const [isSyncingTracking, setIsSyncingTracking] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<ShippingOption | null>(order.selectedShippingOption || null);

  const handleSyncTracking = async () => {
    if (!order.trackingNumber) return;
    setIsSyncingTracking(true);
    try {
      const response = await fetch('/api/shipping/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trackingNumber: order.trackingNumber,
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

        // Auto move to delivered if status is delivered
        if (data.delivered && order.status !== 'entregue') {
          updatedOrder.status = 'entregue';
        }

        onUpdateOrder(updatedOrder);
      }
    } catch (error) {
      console.error('Error syncing tracking:', error);
    } finally {
      setIsSyncingTracking(false);
    }
  };

  React.useEffect(() => {
    setEditedAddress(order.address || '');
    setEditedObservations(order.observations || '');
  }, [order.address, order.observations]);

  const totalWeightG = useMemo(() => {
    return order.products.reduce((acc, p) => {
      const w = parseFloat(p.weight);
      if (p.weight.toLowerCase().includes('kg')) return acc + w * 1000 * p.quantity;
      return acc + w * p.quantity;
    }, 0);
  }, [order.products]);

  const getCarrierColor = (carrier: string) => {
    const c = carrier.toLowerCase();
    if (c.includes('correio')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (c.includes('total')) return 'bg-red-100 text-red-700 border-red-200';
    if (c.includes('braspress')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (c.includes('melhorenvio') || c.includes('melhor envio')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (c.includes('lalamove')) return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const toggleProduct = (productId: string) => {
    const updatedProducts = order.products.map(p => 
      p.id === productId ? { ...p, checked: !p.checked } : p
    );
    onUpdateOrder({ ...order, products: updatedProducts });
  };

  const handleDeleteProduct = (productId: string) => {
    const updatedProducts = order.products.filter(p => p.id !== productId);
    onUpdateOrder({ ...order, products: updatedProducts });
    setActiveMenuId(null);
  };

  const handleStartEdit = (product: ProductItem) => {
    setEditingProductId(product.id);
    setEditForm({ ...product });
    setActiveMenuId(null);
  };

  const handleSaveEdit = () => {
    if (!editingProductId) return;
    const updatedProducts = order.products.map(p => 
      p.id === editingProductId ? { ...p, ...editForm } as ProductItem : p
    );
    onUpdateOrder({ ...order, products: updatedProducts });
    setEditingProductId(null);
    setEditForm({});
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setEditForm({});
  };

  const handleAddProduct = () => {
    const newProduct: ProductItem = {
      id: Math.random().toString(36).substr(2, 9),
      quantity: 1,
      name: 'Novo Produto',
      weight: '250g',
      grindType: 'grãos',
      checked: false,
    };
    const updatedProducts = [...order.products, newProduct];
    onUpdateOrder({ ...order, products: updatedProducts });
    
    // Start editing the new product immediately
    setEditingProductId(newProduct.id);
    setEditForm({ ...newProduct });
  };

  const currentIndex = COLUMNS.findIndex(c => c.id === order.status);
  const nextPhase = currentIndex < COLUMNS.length - 1 ? COLUMNS[currentIndex + 1] : null;
  const prevPhase = currentIndex > 0 ? COLUMNS[currentIndex - 1] : null;

  const isReadyToMove = useMemo(() => {
    const productsReady = order.products.every(p => p.checked);
    
    // Requirements per stage
    if (order.status === 'embalagens_prontas') {
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

  const handleStatusChange = (newStatus: OrderStatus, callback?: (updatedOrder: Order) => void) => {
    let updatedProducts = order.products;
    
    const newIndex = COLUMNS.findIndex(c => c.id === newStatus);
    const isMovingForward = newIndex > currentIndex;
    
    if (isMovingForward) {
      // Reset checks when moving to these specific phases as requested
      if (newStatus === 'embalagens_separadas' || newStatus === 'embalagens_prontas') {
        updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
      }
      // Note: When moving to 'caixa_montada', products remain checked
    } else {
      // Reset checks when moving backward for re-validation safety
      updatedProducts = order.products.map((p: any) => ({ ...p, checked: false }));
    }

    const updatedOrder = {
      ...order,
      status: newStatus,
      products: updatedProducts
    };

    if (callback) {
      callback(updatedOrder);
    } else {
      onUpdateOrder(updatedOrder);
    }
    setIsDropdownOpen(false);
  };

  const handleAdvance = () => {
    if (nextPhase && isReadyToMove) {
      handleStatusChange(nextPhase.id);
    }
  };

  const handleAdvanceAndNext = () => {
    if (nextPhase && isReadyToMove && onAdvanceAndNext) {
      handleStatusChange(nextPhase.id, onAdvanceAndNext);
    }
  };

  const handleBack = () => {
    if (prevPhase) {
      handleStatusChange(prevPhase.id);
    } else {
      onClose();
    }
  };

  const handleFetchQuotes = async (updatedOrder?: Order) => {
    setIsQuoting(true);
    setQuoteError(null);
    setIsQuoteModalOpen(true);
    setIsReviewModalOpen(false);

    const targetOrder = updatedOrder || order;

    try {
      let destinationCep = '';
      if (targetOrder.addressDetails?.zip) {
        destinationCep = targetOrder.addressDetails.zip.toString().replace(/\D/g, '');
      } else {
        const cepMatch = targetOrder.address?.match(/\d{5}-?\d{3}/);
        if (cepMatch) {
          destinationCep = cepMatch[0].replace(/\D/g, '');
        }
      }

      if (!destinationCep) {
        throw new Error('CEP não encontrado no endereço.');
      }

      const totalWeightG = targetOrder.boxWeight 
        ? targetOrder.boxWeight * 1000 
        : targetOrder.products.reduce((acc, p) => {
            const w = parseFloat(p.weight);
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
    handleFetchQuotes(updatedOrder);
  };

  const handleSelectQuote = (quote: ShippingOption) => {
    if (quote.error) return;
    onUpdateOrder({ 
      ...order, 
      carrier: quote.provider ? `${quote.provider} - ${quote.name}` : quote.company.name,
      selectedShippingOption: quote
    });
    setSelectedQuote(quote);
  };

  const handleGenerateLabel = async () => {
    if (!order.selectedShippingOption) return;
    
    setIsGeneratingLabel(true);
    setQuoteError(null);
    try {
      const response = await fetch('/api/shipping/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, selectedOption: order.selectedShippingOption })
      });
      
      const data = await response.json();
      if (data.success) {
        onUpdateOrder({ 
          ...order, 
          trackingNumber: data.trackingNumber,
          carrier: data.provider === 'Manual' ? order.carrier : data.provider
        });
        
        // Open label in new tab if URL is available
        if (data.labelUrl) {
          window.open(data.labelUrl, '_blank');
        } else {
          // If labelUrl is missing, it means the async request failed or is still pending
          setQuoteError('Pré-postagem criada com sucesso, mas a etiqueta ainda está sendo gerada pelos Correios. Tente novamente em alguns instantes.');
        }
      } else {
        setQuoteError(data.error || 'Erro ao gerar etiqueta');
      }
    } catch (e) {
      setQuoteError('Erro de conexão ao gerar etiqueta');
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border transition-all ${
          order.status === 'entregue' 
            ? 'border-emerald-200 dark:border-emerald-900/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]' 
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-50">
          <div className="flex-1 flex items-center gap-6">
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBack();
              }}
              className="group p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 text-xs font-bold shrink-0"
            >
              <ChevronLeft className="size-5 transition-transform group-hover:-translate-x-1" />
              {order.status === 'pedidos' ? 'Fechar' : 'Voltar'}
            </button>

            <div className="h-10 w-px bg-slate-100 dark:bg-slate-800 shrink-0" />

            <div className="flex-1">
              <div className="flex items-center gap-4 mb-1">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {order.clientName}
                  {order.isSample && (
                    <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-amber-200 dark:border-amber-800/50">
                      Amostra
                    </span>
                  )}
                </h2>
                <div className={`${COLUMNS.find(c => c.id === order.status)?.color || 'bg-primary'} text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 border border-white/10`}>
                  <div className="size-1.5 rounded-full bg-white animate-pulse" />
                  {COLUMNS.find(c => c.id === order.status)?.title}
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                Pedido #{order.id.toUpperCase()}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors shrink-0"
          >
            <X className="size-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Info & Address */}
            <div className="space-y-6">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="size-4" /> Dados do Cliente
                  </h3>
                  {!isEditingCustomer ? (
                    <button 
                      onClick={() => {
                        setEditedCustomer({
                          clientName: order.clientName,
                          cnpj: order.cnpj || '',
                          cpf: order.cpf || '',
                          phone: order.phone || ''
                        });
                        setIsEditingCustomer(true);
                      }}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit2 className="size-3" /> Editar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsEditingCustomer(false)}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => {
                          onUpdateOrder({ ...order, ...editedCustomer });
                          setIsEditingCustomer(false);
                        }}
                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600"
                      >
                        Salvar
                      </button>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-2">
                  {isEditingCustomer ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nome</label>
                        <input 
                          type="text" 
                          value={editedCustomer.clientName} 
                          onChange={e => setEditedCustomer({...editedCustomer, clientName: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">CNPJ</label>
                          <input 
                            type="text" 
                            value={editedCustomer.cnpj} 
                            onChange={e => setEditedCustomer({...editedCustomer, cnpj: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">CPF</label>
                          <input 
                            type="text" 
                            value={editedCustomer.cpf} 
                            onChange={e => setEditedCustomer({...editedCustomer, cpf: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Telefone</label>
                        <input 
                          type="text" 
                          value={editedCustomer.phone} 
                          onChange={e => setEditedCustomer({...editedCustomer, phone: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Nome:</span>
                        <span className="text-slate-900 dark:text-white font-bold">{order.clientName}</span>
                      </div>
                      {(order.cnpj || order.cpf) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">{order.cnpj ? 'CNPJ' : 'CPF'}:</span>
                          <span className="text-slate-900 dark:text-white font-bold">{order.cnpj || order.cpf}</span>
                        </div>
                      )}
                      {order.phone && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Telefone:</span>
                          <span className="text-slate-900 dark:text-white font-bold">{order.phone}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="size-4" /> Endereço de Entrega
                  </h3>
                  {!isEditingAddress ? (
                    <button 
                      onClick={() => {
                        setEditedAddress(order.address || '');
                        setEditedAddressDetails(order.addressDetails || {
                          street: '', number: '', complement: '', district: '', city: '', state: '', zip: ''
                        });
                        setIsEditingAddress(true);
                      }}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit2 className="size-3" /> Editar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsEditingAddress(false)}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => {
                          onUpdateOrder({ 
                            ...order, 
                            address: editedAddress,
                            addressDetails: editedAddressDetails
                          });
                          setIsEditingAddress(false);
                        }}
                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600"
                      >
                        Salvar
                      </button>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-3">
                  {isEditingAddress ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Endereço Completo (Texto)</label>
                        <textarea 
                          value={editedAddress}
                          onChange={(e) => setEditedAddress(e.target.value)}
                          className="w-full h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none resize-none focus:border-primary"
                        />
                      </div>
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Logradouro</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.street} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, street: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Número</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.number} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, number: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Complemento</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.complement} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, complement: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bairro</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.district} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, district: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">CEP</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.zip} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, zip: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cidade</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.city} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, city: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Estado</label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.state} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, state: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                        {order.address || 'Endereço não informado'}
                      </p>
                      {order.addressDetails?.warning && (
                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
                          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                          <span>{order.addressDetails.warning}</span>
                        </div>
                      )}
                      {order.addressDetails && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="col-span-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Logradouro</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {order.addressDetails.street}{order.addressDetails.number ? `, ${order.addressDetails.number}` : ''}
                              {order.addressDetails.complement ? ` - ${order.addressDetails.complement}` : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Bairro</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{order.addressDetails.district || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">CEP</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{order.addressDetails.zip || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Cidade</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{order.addressDetails.city || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Estado</span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{order.addressDetails.state || '-'}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="size-4" /> Observações
                  </h3>
                  {!isEditingObservations ? (
                    <button 
                      onClick={() => setIsEditingObservations(true)}
                      className="text-[10px] font-bold text-primary hover:text-primary/80"
                    >
                      Editar
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        onUpdateOrder({ ...order, observations: editedObservations });
                        setIsEditingObservations(false);
                      }}
                      className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600"
                    >
                      Salvar
                    </button>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                  {isEditingObservations ? (
                    <textarea 
                      value={editedObservations}
                      onChange={(e) => setEditedObservations(e.target.value)}
                      className="w-full h-24 bg-transparent text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic outline-none resize-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                      {order.observations || 'Sem observações'}
                    </p>
                  )}
                </div>
              </section>

              {order.status === 'embalagens_prontas' && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="size-4" /> Documentação
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasInvoice ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                        <input 
                          type="checkbox"
                          checked={order.hasInvoice}
                          onChange={() => onUpdateOrder({ ...order, hasInvoice: !order.hasInvoice })}
                          className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                        />
                        <span className={`text-sm font-medium ${order.hasInvoice ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Nota Fiscal</span>
                      </label>
                      <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasBoleto ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                        <input 
                          type="checkbox"
                          checked={order.hasBoleto}
                          onChange={() => onUpdateOrder({ ...order, hasBoleto: !order.hasBoleto })}
                          className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                        />
                        <span className={`text-sm font-medium ${order.hasBoleto ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Boleto</span>
                      </label>
                      <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasOrderDocument ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                        <input 
                          type="checkbox"
                          checked={order.hasOrderDocument}
                          onChange={() => onUpdateOrder({ ...order, hasOrderDocument: !order.hasOrderDocument })}
                          className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                        />
                        <span className={`text-sm font-medium ${order.hasOrderDocument ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Pedido</span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Package className="size-4" /> Dimensões da Caixa (cm)
                    </h3>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Largura</p>
                        <input 
                          type="number"
                          value={order.boxDimensions?.width || 15}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: 15, height: 15, length: 15 }), width: parseInt(e.target.value) } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Altura</p>
                        <input 
                          type="number"
                          value={order.boxDimensions?.height || 15}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: 15, height: 15, length: 15 }), height: parseInt(e.target.value) } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Comprimento</p>
                        <input 
                          type="number"
                          value={order.boxDimensions?.length || 15}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: 15, height: 15, length: 15 }), length: parseInt(e.target.value) } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Peso (g)</p>
                        <input 
                          type="number"
                          value={order.boxWeight || totalWeightG}
                          onChange={(e) => onUpdateOrder({ ...order, boxWeight: parseInt(e.target.value) })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {(order.status === 'enviado' || order.status === 'entregue') && (
                <section className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Truck className="size-4" /> {order.status === 'entregue' ? 'Informações de Entrega' : 'Rastreamento em Tempo Real'}
                      </h3>
                      {order.status === 'enviado' && (
                        <button 
                          onClick={handleSyncTracking}
                          disabled={isSyncingTracking || !order.trackingNumber}
                          className="flex items-center gap-2 text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                          <RefreshCw className={`size-3 ${isSyncingTracking ? 'animate-spin' : ''}`} />
                          Sincronizar Agora
                        </button>
                      )}
                    </div>

                    {order.status === 'entregue' && order.deliveryDate && (
                      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl flex items-center gap-3">
                        <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                          <CheckCircle2 className="size-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-400">Pedido Entregue</p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-500">Entregue em: {new Date(order.deliveryDate).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    )}

                    {!order.trackingNumber ? (
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                          Código de rastreio não informado. Adicione o código para monitorar o envio.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Status Atual</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              {order.trackingStatus || 'Aguardando sincronização...'}
                              {order.deliveryDate && <CheckCircle2 className="size-4 text-emerald-500" />}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Código</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{order.trackingNumber}</p>
                              <a 
                                href={order.carrier?.toLowerCase().includes('correios') 
                                  ? `https://rastreamento.correios.com.br/app/index.php?objeto=${order.trackingNumber}`
                                  : `https://www.linkcorreios.com.br/?id=${order.trackingNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-primary"
                              >
                                <ExternalLink className="size-3" />
                              </a>
                            </div>
                          </div>
                        </div>

                        {order.trackingHistory && order.trackingHistory.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Histórico de Movimentação</p>
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                              {order.trackingHistory.map((step, idx) => (
                                <div key={idx} className="flex gap-3 relative">
                                  {idx !== order.trackingHistory!.length - 1 && (
                                    <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                                  )}
                                  <div className={`size-4 rounded-full border-2 bg-white dark:bg-slate-900 z-10 shrink-0 mt-1 ${idx === 0 ? 'border-primary' : 'border-slate-300 dark:border-slate-600'}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className={`text-xs font-bold ${idx === 0 ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {step.status}
                                      </p>
                                      <p className="text-[9px] text-slate-400 shrink-0">
                                        {new Date(step.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                      {step.message}
                                      {step.location && <span className="block italic opacity-80">{step.location}</span>}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {order.lastTrackingUpdate && (
                          <p className="text-[9px] text-slate-400 italic text-center">
                            Última atualização: {new Date(order.lastTrackingUpdate).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {order.status === 'embalagens_prontas' && (
                <section className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Truck className="size-4" /> Frete e Envio
                        </h3>
                        <button 
                          onClick={() => setIsReviewModalOpen(true)}
                          disabled={isQuoting}
                          className="px-6 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/30 flex items-center gap-2 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {isQuoting ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
                          {order.shippingQuote ? 'Recalcular Cotação' : 'Adicionar ao Carrinho'}
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Transportadora Preferencial</label>
                        <select 
                          value={order.carrier || ''}
                          onChange={(e) => onUpdateOrder({ ...order, carrier: e.target.value })}
                          className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
                        >
                          <option value="">Selecionar Manualmente...</option>
                          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    {order.shippingQuote && (
                      <div className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={handleGenerateLabel}
                            disabled={isGeneratingLabel || !order.selectedShippingOption}
                            className={`py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                              !order.selectedShippingOption 
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
                            }`}
                          >
                            {isGeneratingLabel ? (
                              <>
                                <Loader2 className="size-5 animate-spin" />
                                Gerando...
                              </>
                            ) : (
                              <>
                                <Printer className="size-5" />
                                Gerar Etiqueta
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              try {
                                localStorage.setItem('last_declaration_order', JSON.stringify(order));
                                const orderData = btoa(encodeURIComponent(JSON.stringify(order)));
                                window.open(`/declaracao/${order.id}?format=10x15`, '_blank');
                              } catch (e) {
                                console.error("Erro ao abrir declaração", e);
                                window.open(`/declaracao/${order.id}?format=10x15`, '_blank');
                              }
                            }}
                            className="py-4 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-all"
                          >
                            <FileText className="size-5" />
                            Declaração
                          </button>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Opções Disponíveis (Ordenadas por Preço)</p>
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                            {[...(order.shippingQuote || [])].sort((a, b) => a.price - b.price).map((quote) => {
                              const isSelected = order.selectedShippingOption?.id === quote.id;
                              return (
                                <div 
                                  key={quote.id}
                                  onClick={() => handleSelectQuote(quote)}
                                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                                    isSelected
                                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                                  }`}
                                >
                                  <div className="size-12 rounded-xl bg-white p-2 border border-slate-100 flex items-center justify-center relative overflow-hidden shrink-0">
                                    <Image 
                                      src={quote.company.picture} 
                                      alt={quote.company.name} 
                                      fill
                                      className="object-contain p-2"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className={`text-sm font-bold truncate ${quote.error ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                        {quote.name}
                                      </p>
                                      {isSelected && (
                                        <span className="text-[8px] px-1.5 py-0.5 bg-primary text-white rounded font-bold uppercase tracking-wider">
                                          Selecionado
                                        </span>
                                      )}
                                    </div>
                                    {quote.error ? (
                                      <p className="text-[10px] text-red-400 font-medium">{quote.error}</p>
                                    ) : (
                                      <p className="text-xs text-slate-500">{quote.delivery_time} dias úteis</p>
                                    )}
                                  </div>
                                  {!quote.error && (
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-primary">R$ {quote.price.toFixed(2)}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {quoteError && (
                      <p className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-800/50">
                        {quoteError}
                      </p>
                    )}
                  </div>
                </section>
              )}

                  {order.carrier && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Hash className="size-4" /> Código de Rastreio
                      </h3>
                      <input 
                        type="text"
                        value={order.trackingNumber || ''}
                        onChange={(e) => onUpdateOrder({ ...order, trackingNumber: e.target.value })}
                        placeholder="Ex: BR123456789"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-primary focus:border-primary outline-none transition-all"
                      />
                    </div>
                  )}

              {['enviado', 'entregue'].includes(order.status) && order.carrier && (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Truck className="size-4" /> Transportadora
                    </h3>
                    <span className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border inline-block ${getCarrierColor(order.carrier)}`}>
                      {order.carrier}
                    </span>
                  </div>
                  {order.trackingNumber && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Hash className="size-4" /> Código de Rastreio
                      </h3>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 select-all">
                        {order.trackingNumber}
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* Right Column: Products Checklist */}
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Package className="size-4" /> Itens do Pedido
                </h3>
                <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500">
                  {order.products.filter(p => p.checked).length} / {order.products.length}
                </span>
              </div>
              <div className="space-y-3">
                {order.products.map((product) => (
                  <div key={product.id} className="relative group">
                    {editingProductId === product.id ? (
                      <div className="p-4 rounded-2xl border border-primary bg-primary/5 space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                          <input 
                            type="number"
                            value={editForm.quantity ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm font-bold"
                            placeholder="Qtd"
                          />
                          <input 
                            type="text"
                            value={editForm.name ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="col-span-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm"
                            placeholder="Nome"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text"
                            value={editForm.weight ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm"
                            placeholder="Peso"
                          />
                          <select 
                            value={editForm.grindType ?? 'moído'}
                            onChange={(e) => setEditForm({ ...editForm, grindType: e.target.value as any })}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm"
                          >
                            <option value="moído">Moído</option>
                            <option value="grãos">Grãos</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </div>
                        <input 
                          type="text"
                          value={editForm.productionNotes || ''}
                          onChange={(e) => setEditForm({ ...editForm, productionNotes: e.target.value })}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm italic"
                          placeholder="Notas de produção"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={handleCancelEdit} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                            <RotateCcw className="size-4" />
                          </button>
                          <button onClick={handleSaveEdit} className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                            <Check className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label 
                          className={`flex-1 flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                            product.checked 
                              ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30' 
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-primary/30'
                          }`}
                        >
                          <div className="relative flex items-center justify-center">
                            <input 
                              type="checkbox"
                              checked={product.checked}
                              onChange={() => toggleProduct(product.id)}
                              disabled={['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(order.status) && product.checked}
                              className={`rounded-lg border-slate-300 text-primary focus:ring-primary size-6 transition-all ${
                                ['embalagens_prontas', 'caixa_montada', 'enviado', 'entregue'].includes(order.status) && product.checked ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            />
                            {product.checked && (
                              <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute pointer-events-none"
                              >
                                <CheckCircle2 className="size-4 text-white" />
                              </motion.div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm font-bold transition-all ${product.checked ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                              {product.quantity}X {product.name}
                              {product.name.toLowerCase() !== 'dripcoffee' && (
                                <> {product.weight} ({product.grindType})</>
                              )}
                              {product.productionNotes && (
                                <span className="ml-2 text-xs text-primary italic font-normal">
                                  {product.productionNotes}
                                </span>
                              )}
                            </p>
                          </div>
                        </label>
                        
                        <div className="relative">
                          <button 
                            onClick={() => setActiveMenuId(activeMenuId === product.id ? null : product.id)}
                            className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                          >
                            <MoreVertical className="size-5" />
                          </button>
                          
                          <AnimatePresence>
                            {activeMenuId === product.id && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-[70]"
                              >
                                <button 
                                  onClick={() => handleStartEdit(product)}
                                  className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                >
                                  <Edit2 className="size-3" /> Editar
                                </button>
                                <button 
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                >
                                  <Trash2 className="size-3" /> Excluir
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                <button 
                  onClick={handleAddProduct}
                  className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 text-sm font-bold"
                >
                  <Plus className="size-4" /> Adicionar Produto
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Status Atual:</span>
            <span className={`${COLUMNS.find(c => c.id === order.status)?.color || 'bg-slate-200'} text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase shadow-sm`}>
              {COLUMNS.find(c => c.id === order.status)?.title}
            </span>
          </div>

          <ShippingDataReviewModal
            key={`review-modal-${order.id}-${isReviewModalOpen}`}
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
            selectedQuote={order.selectedShippingOption}
            onGenerateLabel={handleGenerateLabel}
            isGeneratingLabel={isGeneratingLabel}
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

          <div className="flex gap-2 relative">
            {nextPhase && (
              <button
                onClick={handleAdvanceAndNext}
                disabled={!isReadyToMove}
                className={`px-6 py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-2 shadow-lg ${
                  !isReadyToMove 
                    ? 'bg-slate-400 cursor-not-allowed shadow-none' 
                    : 'bg-primary hover:bg-primary/90 shadow-primary/20'
                }`}
              >
                {hasNextOrder ? 'Próximo Pedido' : 'Avançar e Fechar'}
                <ChevronRight className="size-4" />
              </button>
            )}
            <div className="flex rounded-xl overflow-hidden shadow-lg shadow-primary/20">
              <button 
                onClick={() => {
                  if (order.status === 'entregue') {
                    onArchiveOrder(order.id);
                    onClose();
                  } else {
                    setIsDropdownOpen(!isDropdownOpen);
                  }
                }}
                className={`px-6 py-3 text-sm font-bold text-white transition-all flex items-center gap-2 ${
                  !isReadyToMove && order.status !== 'entregue'
                    ? 'bg-slate-400 cursor-not-allowed' 
                    : order.status === 'entregue'
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {order.status === 'entregue' ? 'Finalizado' : `Avançar para: ${nextPhase?.title || '...'}`}
                <ChevronDown className={`size-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {nextPhase && (
                <button 
                  onClick={handleAdvance}
                  disabled={!isReadyToMove}
                  title={`Ir para ${nextPhase.title}`}
                  className={`px-6 py-3 border-l border-white/20 transition-all ${
                    !isReadyToMove 
                      ? 'bg-slate-400 cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  <ChevronRight className="size-6 text-white" />
                </button>
              )}
            </div>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: -8, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full right-0 mb-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden z-[60]"
                >
                  <div className="p-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase p-2 tracking-widest">Mudar para fase:</p>
                    {COLUMNS.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => handleStatusChange(col.id)}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-between group ${
                          order.status === col.id 
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`size-2 rounded-full ${col.color}`} />
                          {col.title}
                        </div>
                        {order.status === col.id && <CheckCircle2 className="size-3 text-emerald-500" />}
                        {nextPhase?.id === col.id && <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </button>
                    ))}
                    <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                    <button
                      onClick={() => {
                        if (confirm('Deseja arquivar este pedido?')) {
                          onArchiveOrder(order.id);
                          onClose();
                        }
                      }}
                      className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"
                    >
                      <Package className="size-3" /> Arquivar Pedido
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
