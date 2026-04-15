'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
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
  History,
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
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductItem, ShippingOption } from '@/lib/types';
import { getValidBlingToken } from '@/lib/bling-client';
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

const CARRIERS = ['Correio', 'Braspress', 'MelhorEnvio', 'Lalamove'];

const STATUS_INSTRUCTIONS: Record<OrderStatus, string> = {
  pedidos: 'Separar as embalagens para produção',
  embalagens_separadas: 'Produzir as embalagens separadas',
  embalagens_prontas: 'Montar as caixas com produtos, nota fiscal, boleto e etiqueta de envio',
  caixa_montada: 'Enviar ou entregar ao cliente',
  enviado: 'Monitorar a entrega',
  entregue: 'Fluxo finalizado',
};

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
    tradeName: order.tradeName || '',
    cnpj: order.cnpj || '',
    cpf: order.cpf || '',
    phone: order.phone || ''
  });
  const [editedObservations, setEditedObservations] = useState(order.observations || '');
  const [paymentCondition, setPaymentCondition] = useState(order.paymentCondition || 'A vista');
  const [originType, setOriginType] = useState(order.originType || 'CRV');
  const [isSyncingTracking, setIsSyncingTracking] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<ShippingOption | null>(order.selectedShippingOption || null);
  const [isSearchingBling, setIsSearchingBling] = useState(false);
  const [isCreatingBlingOrder, setIsCreatingBlingOrder] = useState(false);
  const [isCheckingInvoice, setIsCheckingInvoice] = useState(false);
  const [isEditingInvoiceManually, setIsEditingInvoiceManually] = useState(false);
  const [manualInvoiceKey, setManualInvoiceKey] = useState(order.invoiceKey || '');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState(order.invoiceNumber || '');
  const [manualInvoiceValue, setManualInvoiceValue] = useState<number | ''>(order.invoiceValue || '');
  const [blingSearchResults, setBlingSearchResults] = useState<any[]>([]);
  const [showBlingResults, setShowBlingResults] = useState(false);

  const handleSearchBling = async () => {
    if (!editedCustomer.clientName) return;
    setIsSearchingBling(true);
    console.log(`[Bling] Iniciando busca para: ${editedCustomer.clientName}`);
    try {
      const { searchBlingCustomers } = await import('@/lib/bling-search');
      const data = await searchBlingCustomers(editedCustomer.clientName);
      console.log('[Bling] Resultados:', data);
      
      if (data && data.length > 0) {
        setBlingSearchResults(data);
        setShowBlingResults(true);
      } else {
        toast.error('Nenhum cliente encontrado no Bling com este nome exato. Tente um nome mais curto ou diferente.');
      }
    } catch (error: any) {
      console.error('[Bling] Erro de conexão:', error);
      toast.error(`Erro de conexão ao buscar no Bling: ${error.message}`);
    } finally {
      setIsSearchingBling(false);
    }
  };

  const handleSelectBlingCustomer = (blingCustomer: any) => {
    // Prioriza Nome Fantasia conforme solicitado pelo usuário
    const clientName = blingCustomer.fantasia && blingCustomer.fantasia !== blingCustomer.nome 
      ? `${blingCustomer.fantasia} (${blingCustomer.nome})` 
      : blingCustomer.nome;

    setEditedCustomer({
      clientName,
      tradeName: blingCustomer.fantasia || '',
      cnpj: blingCustomer.tipo === 'J' ? blingCustomer.numeroDocumento : '',
      cpf: blingCustomer.tipo === 'F' ? blingCustomer.numeroDocumento : '',
      phone: blingCustomer.celular || blingCustomer.telefone || ''
    });
    
    // Also update address if available
    if (blingCustomer.endereco) {
      setEditedAddressDetails({
        street: blingCustomer.endereco.endereco || '',
        number: blingCustomer.endereco.numero || '',
        complement: blingCustomer.endereco.complemento || '',
        district: blingCustomer.endereco.bairro || '',
        city: blingCustomer.endereco.municipio || '',
        state: blingCustomer.endereco.uf || '',
        zip: blingCustomer.endereco.cep || ''
      });
    }
    
    setShowBlingResults(false);
  };
  
  const handleCreateBlingOrder = async () => {
    if (isCreatingBlingOrder) return;
    setIsCreatingBlingOrder(true);
    
    try {
      console.log('[Bling] Iniciando criação de pedido para:', order.clientName);
      
      // Get valid token from client side (which has Firebase Auth context)
      const token = await getValidBlingToken();
      if (!token) {
        throw new Error('Bling não autenticado. Por favor, conecte o Bling nas Configurações.');
      }

      const response = await fetch('/api/bling/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(order)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('[Bling] Erro retornado pela API:', data);
        const errorMessage = data.error || 'Erro ao criar pedido no Bling';
        const details = data.details ? `\nDetalhes: ${JSON.stringify(data.details)}` : '';
        throw new Error(`${errorMessage}${details}`);
      }
      
      toast.success('Pedido criado no Bling com sucesso!');
      
      // Update order with blingOrderId if returned
      const updatedOrder = { 
        ...order, 
        hasOrderDocument: true 
      };
      if (data.blingOrderId) {
        updatedOrder.blingOrderId = data.blingOrderId;
      }
      onUpdateOrder(updatedOrder);
    } catch (error: any) {
      console.error('[Bling] Erro ao criar pedido:', error);
      toast.error(`Erro ao criar pedido no Bling: ${error.message}`, {
        duration: 8000 // Show for longer to allow reading details
      });
    } finally {
      setIsCreatingBlingOrder(false);
    }
  };

  const handleCheckInvoice = async () => {
    if (isCheckingInvoice) return;

    setIsCheckingInvoice(true);
    try {
      const response = await fetch('/api/bling/get-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          blingOrderId: order.blingOrderId,
          clientName: order.clientName,
          document: order.cnpj || order.cpf
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao buscar nota fiscal.');
      }

      const data = await response.json();
      if (data.found) {
        onUpdateOrder({ 
          ...order, 
          hasInvoice: true, 
          invoiceKey: data.invoiceKey,
          invoiceNumber: data.invoiceNumber,
          invoiceValue: data.invoiceValue
        });
        setManualInvoiceKey(data.invoiceKey || '');
        setManualInvoiceNumber(data.invoiceNumber || '');
        setManualInvoiceValue(data.invoiceValue || '');
        toast.success('Nota fiscal encontrada e vinculada!');
      } else {
        toast(data.message || 'Nenhuma nota fiscal encontrada para este pedido no Bling.');
      }
    } catch (error: any) {
      console.error('Erro ao buscar nota fiscal:', error);
      toast.error(error.message || 'Erro ao buscar nota fiscal');
    } finally {
      setIsCheckingInvoice(false);
    }
  };

  const handleSyncTracking = async () => {
    if (!order.trackingNumber && !order.shipmentId) return;
    setIsSyncingTracking(true);
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
        
        if (data.error) {
          if (data.directLink) {
            toast.error(
              <div className="flex flex-col gap-2">
                <p>{data.error}</p>
                <a 
                  href={data.directLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-white underline font-bold"
                >
                  Clique aqui para rastrear no LinkCorreios
                </a>
              </div>,
              { duration: 6000 }
            );
          } else {
            toast.error(data.error);
          }
          return;
        }

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
        toast.success('Rastreio sincronizado com sucesso!');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Rastreio não encontrado ou indisponível no momento.');
      }
    } catch (error) {
      console.error('Error syncing tracking:', error);
      toast.error('Erro de conexão ao sincronizar rastreio.');
    } finally {
      setIsSyncingTracking(false);
    }
  };

  React.useEffect(() => {
    setEditedAddress(order.address || '');
    setEditedObservations(order.observations || '');
    setManualInvoiceKey(order.invoiceKey || '');
    setManualInvoiceNumber(order.invoiceNumber || '');
    
    // Auto-check invoice when entering "embalagens_prontas"
    if (order.status === 'embalagens_prontas' && order.blingOrderId && !order.hasInvoice && !order.hasOrderDocument) {
      handleCheckInvoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.address, order.observations, order.status]);

  const totalWeightG = useMemo(() => {
    return order.products.reduce((acc, p) => {
      const w = parseFloat(p.weight) || 0;
      if (p.weight.toLowerCase().includes('kg')) return acc + w * 1000 * p.quantity;
      return acc + w * p.quantity;
    }, 0);
  }, [order.products]);

  const suggestedBox = useMemo(() => {
    const totalUnits = order.products.reduce((acc, p) => {
      const name = p.name.toLowerCase();
      const weight = p.weight.toLowerCase();
      
      let units = 1; // Default 250g
      if (weight.includes('120g')) units = 0.5;
      else if (weight.includes('500g')) units = 1.5;
      else if (weight.includes('1kg') || weight.includes('1000g')) units = 3.5;
      else if (name.includes('drip')) units = 0.6;
      
      return acc + (units * p.quantity);
    }, 0);

    // Boxes provided by user (H x W x L)
    const boxes = [
      { h: 11, w: 16, l: 25, cap: 3 },
      { h: 12, w: 21, l: 28, cap: 8 },
      { h: 13, w: 22, l: 28, cap: 10 },
      { h: 16, w: 26, l: 30, cap: 12 },
      { h: 23, w: 28, l: 35, cap: 20 },
      { h: 21, w: 26, l: 40, cap: 24 },
      { h: 23, w: 23, l: 50, cap: 35 },
      { h: 31, w: 31, l: 42, cap: 40 },
      { h: 30, w: 40, l: 50, cap: 55 },
    ].sort((a, b) => a.cap - b.cap);

    return boxes.find(b => b.cap >= totalUnits) || boxes[boxes.length - 1];
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
    console.log("Toggling product:", productId);
    const updatedProducts = order.products.map(p => 
      p.id === productId ? { ...p, checked: !p.checked } : p
    );
    console.log("Updated products for order:", order.id, updatedProducts);
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
      products: updatedProducts,
      statusHistory: [
        ...(order.statusHistory || []),
        { status: newStatus, timestamp: new Date().toISOString() }
      ]
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
          boxDimensions: targetOrder.boxDimensions,
          originType: originType, // Use local state
          insuranceValue: targetOrder.insuranceValue || targetOrder.invoiceValue
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
          shipmentId: data.shipmentId,
          shippingProvider: data.shippingProvider,
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
                  {order.tradeName || order.clientName}
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
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                  Pedido #{order.id.toUpperCase()}
                </p>
                <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  {STATUS_INSTRUCTIONS[order.status]}
                </p>
              </div>
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
                          tradeName: order.tradeName || '',
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
                          onUpdateOrder({ 
                            ...order, 
                            clientName: editedCustomer.clientName,
                            tradeName: editedCustomer.tradeName,
                            cnpj: editedCustomer.cnpj,
                            cpf: editedCustomer.cpf,
                            phone: editedCustomer.phone,
                            addressDetails: editedAddressDetails
                          });
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
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">
                            Nome <span className="text-red-500">*</span>
                          </label>
                          <button 
                            onClick={handleSearchBling}
                            disabled={isSearchingBling || !editedCustomer.clientName}
                            className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSearchingBling ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            BUSCAR NO BLING
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={editedCustomer.clientName} 
                          onChange={e => setEditedCustomer({...editedCustomer, clientName: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Nome Fantasia
                        </label>
                        <input 
                          type="text" 
                          value={editedCustomer.tradeName} 
                          onChange={e => setEditedCustomer({...editedCustomer, tradeName: e.target.value})}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            CNPJ <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedCustomer.cnpj} 
                            onChange={e => setEditedCustomer({...editedCustomer, cnpj: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            CPF <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedCustomer.cpf} 
                            onChange={e => setEditedCustomer({...editedCustomer, cpf: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Telefone <span className="text-red-500">*</span>
                        </label>
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
                      {order.tradeName && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Fantasia:</span>
                          <span className="text-slate-900 dark:text-white font-bold">{order.tradeName}</span>
                        </div>
                      )}
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
                    <MapPin className="size-4" /> Informações
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
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Logradouro <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.street} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, street: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Número <span className="text-red-500">*</span>
                          </label>
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
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Bairro <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.district} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, district: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            CEP <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.zip} 
                            onChange={async (e) => {
                              const newZip = e.target.value.replace(/\D/g, '');
                              setEditedAddressDetails({...editedAddressDetails, zip: newZip});
                              if (newZip.length === 8) {
                                try {
                                  const response = await fetch(`https://viacep.com.br/ws/${newZip}/json/`);
                                  const data = await response.json();
                                  if (!data.erro) {
                                    setEditedAddressDetails(prev => ({
                                      ...prev,
                                      street: data.logradouro || prev.street,
                                      district: data.bairro || prev.district,
                                      city: data.localidade || prev.city,
                                      state: data.uf || prev.state
                                    }));
                                  } else {
                                    toast.error('CEP não encontrado.');
                                  }
                                } catch (error) {
                                  console.error('Erro ao buscar CEP:', error);
                                  toast.error('Erro ao buscar CEP.');
                                }
                              }
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Cidade <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={editedAddressDetails.city} 
                            onChange={e => setEditedAddressDetails({...editedAddressDetails, city: e.target.value})}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Estado <span className="text-red-500">*</span>
                          </label>
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
                    <Receipt className="size-4" /> Condições de Pagamento
                  </h3>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {(['A vista', '15 dias', '21 dias', '30 dias', '2x'] as const).map((condition) => (
                    <button
                      key={condition}
                      onClick={() => {
                        setPaymentCondition(condition);
                        onUpdateOrder({ ...order, paymentCondition: condition });
                      }}
                      className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                        paymentCondition === condition
                          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary/50'
                      }`}
                    >
                      {condition}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="size-4" /> Origem do Pedido
                  </h3>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {(['whatsapp', 'Wix', 'Amazon', 'Meli', 'CRM'] as const).map((originOption) => (
                    <button
                      key={originOption}
                      onClick={() => {
                        onUpdateOrder({ ...order, origin: originOption });
                      }}
                      className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                        (order.origin || 'whatsapp') === originOption
                          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary/50'
                      }`}
                    >
                      {originOption}
                    </button>
                  ))}
                </div>
              </section>

              {order.status === 'embalagens_prontas' && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="size-4" /> Documentação
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasInvoice ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                          <input 
                            type="checkbox"
                            checked={order.hasInvoice}
                            onChange={() => onUpdateOrder({ ...order, hasInvoice: !order.hasInvoice })}
                            className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                          />
                          <span className={`text-sm font-medium ${order.hasInvoice ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Nota Fiscal</span>
                        </label>
                        {!order.hasInvoice && (
                          <button
                            onClick={handleCheckInvoice}
                            disabled={isCheckingInvoice}
                            className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-3"
                          >
                            {isCheckingInvoice ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            Buscar Nota Fiscal no Bling
                          </button>
                        )}
                        {order.hasInvoice && (
                          <div className="px-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <p className="text-[9px] text-slate-400 font-bold uppercase">Dados da NF-e</p>
                              <button 
                                onClick={() => {
                                  if (isEditingInvoiceManually) {
                                    onUpdateOrder({
                                      ...order,
                                      invoiceKey: manualInvoiceKey,
                                      invoiceNumber: manualInvoiceNumber,
                                      invoiceValue: manualInvoiceValue === '' ? undefined : Number(manualInvoiceValue)
                                    });
                                  }
                                  setIsEditingInvoiceManually(!isEditingInvoiceManually);
                                }}
                                className="text-[9px] font-bold text-primary hover:underline"
                              >
                                {isEditingInvoiceManually ? 'Salvar' : 'Editar Manual'}
                              </button>
                            </div>
                            
                            {isEditingInvoiceManually ? (
                              <div className="space-y-2">
                                <div>
                                  <label className="text-[8px] text-slate-400 uppercase">Chave de Acesso</label>
                                  <input 
                                    type="text"
                                    value={manualInvoiceKey}
                                    onChange={(e) => setManualInvoiceKey(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[10px] outline-none focus:border-primary"
                                    placeholder="44 dígitos"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase">Número da Nota</label>
                                    <input 
                                      type="text"
                                      value={manualInvoiceNumber}
                                      onChange={(e) => setManualInvoiceNumber(e.target.value)}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[10px] outline-none focus:border-primary"
                                      placeholder="Ex: 1234"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase">Valor da Nota (R$)</label>
                                    <input 
                                      type="number"
                                      step="0.01"
                                      value={manualInvoiceValue}
                                      onChange={(e) => setManualInvoiceValue(e.target.value ? Number(e.target.value) : '')}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[10px] outline-none focus:border-primary"
                                      placeholder="Ex: 150.00"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">Chave NF-e</p>
                                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono break-all">{order.invoiceKey || 'Não informada'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {order.invoiceNumber && (
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase">Número</p>
                                      <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">{order.invoiceNumber}</p>
                                    </div>
                                  )}
                                  {order.invoiceValue && (
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase">Valor</p>
                                      <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.invoiceValue)}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {!order.hasInvoice && order.status === 'embalagens_prontas' && (
                          <p className="text-[9px] text-amber-600 dark:text-amber-400 px-3 italic flex items-center gap-1">
                            <AlertCircle className="size-3" /> NF-e não detectada.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasOrderDocument ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                          <input 
                            type="checkbox"
                            checked={order.hasOrderDocument}
                            onChange={() => onUpdateOrder({ ...order, hasOrderDocument: !order.hasOrderDocument })}
                            className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                          />
                          <span className={`text-sm font-medium ${order.hasOrderDocument ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Declaração de Conteúdo</span>
                        </label>
                        {!order.hasInvoice && !order.hasOrderDocument && (
                          <button
                            onClick={() => {
                              onUpdateOrder({ ...order, hasOrderDocument: true });
                              toast.success('DC-e selecionada para este envio.');
                            }}
                            className="text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 px-3"
                          >
                            <FileText className="size-3" /> Emitir DC-e (Melhor Envio)
                          </button>
                        )}
                        {order.hasOrderDocument && (
                          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 px-3 italic">
                            Será gerada DC-e automática pelo Melhor Envio.
                          </p>
                        )}
                      </div>

                      <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${order.hasBoleto ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                        <input 
                          type="checkbox"
                          checked={order.hasBoleto}
                          onChange={() => onUpdateOrder({ ...order, hasBoleto: !order.hasBoleto })}
                          className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                        />
                        <span className={`text-sm font-medium ${order.hasBoleto ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>Boleto</span>
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
                          value={order.boxDimensions?.width || suggestedBox.w}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: suggestedBox.w, height: suggestedBox.h, length: suggestedBox.l }), width: parseInt(e.target.value) || 0 } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Altura</p>
                        <input 
                          type="number"
                          value={order.boxDimensions?.height || suggestedBox.h}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: suggestedBox.w, height: suggestedBox.h, length: suggestedBox.l }), height: parseInt(e.target.value) || 0 } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Comprimento</p>
                        <input 
                          type="number"
                          value={order.boxDimensions?.length || suggestedBox.l}
                          onChange={(e) => onUpdateOrder({ ...order, boxDimensions: { ... (order.boxDimensions || { width: suggestedBox.w, height: suggestedBox.h, length: suggestedBox.l }), length: parseInt(e.target.value) || 0 } })}
                          className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Peso (g)</p>
                        <input 
                          type="number"
                          value={order.boxWeight || totalWeightG}
                          onChange={(e) => onUpdateOrder({ ...order, boxWeight: parseInt(e.target.value) || 0 })}
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
                                  ? `https://linkcorreios.com.br/${order.trackingNumber}`
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

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Remetente</label>
                            <select 
                              value={originType}
                              onChange={(e) => setOriginType(e.target.value as 'BH' | 'CRV')}
                              className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
                            >
                              <option value="CRV">Remetente CRV</option>
                              <option value="BH">Remetente BH</option>
                            </select>
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

              {order.statusHistory && order.statusHistory.length > 0 && (
                <section className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="size-4" /> Histórico de Status
                  </h3>
                  <div className="space-y-3">
                    {order.statusHistory.map((entry, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {COLUMNS.find(c => c.id === entry.status)?.title || entry.status}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(entry.timestamp).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
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

                {/* Observações do Pedido */}
                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="size-4" /> Observações do Pedido
                    </h3>
                    <button 
                      onClick={() => {
                        setEditedObservations('');
                        onUpdateOrder({ ...order, observations: '' });
                      }}
                      className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="size-3" /> Limpar
                    </button>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 focus-within:border-primary/50 transition-all">
                    <textarea 
                      value={editedObservations}
                      onChange={(e) => {
                        setEditedObservations(e.target.value);
                        onUpdateOrder({ ...order, observations: e.target.value });
                      }}
                      placeholder="Adicione observações importantes sobre este pedido..."
                      className="w-full h-32 bg-transparent text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic outline-none resize-none custom-scrollbar"
                    />
                  </div>
                </div>
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
            <button
              onClick={handleCreateBlingOrder}
              disabled={isCreatingBlingOrder}
              className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isCreatingBlingOrder ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Enviar para o Bling
            </button>

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
                        toast((t) => (
                          <div className="flex flex-col gap-3">
                            <p className="text-sm font-medium">Deseja arquivar este pedido?</p>
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => toast.dismiss(t.id)}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => {
                                  toast.dismiss(t.id);
                                  onArchiveOrder(order.id);
                                  onClose();
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600"
                              >
                                Arquivar
                              </button>
                            </div>
                          </div>
                        ), { duration: Infinity });
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

      {/* Bling Search Results Modal */}
      <AnimatePresence>
        {showBlingResults && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Clientes no Bling</h3>
                  <p className="text-xs text-slate-500">Selecione o cliente para preencher os dados</p>
                </div>
                <button onClick={() => setShowBlingResults(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <X className="size-5 text-slate-500" />
                </button>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
                {blingSearchResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectBlingCustomer(customer)}
                    className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
                        <User className="size-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                          {customer.fantasia && customer.fantasia !== customer.nome ? (
                            <>
                              <span className="text-primary">{customer.fantasia}</span>
                              <span className="text-xs text-slate-400 font-normal ml-2">({customer.nome})</span>
                            </>
                          ) : (
                            customer.nome
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          {customer.numeroDocumento && (
                            <span className="flex items-center gap-1">
                              <Hash className="size-3" /> {customer.numeroDocumento}
                            </span>
                          )}
                          {(customer.celular || customer.telefone) && (
                            <span className="flex items-center gap-1">
                              <User className="size-3" /> {customer.celular || customer.telefone}
                            </span>
                          )}
                        </div>
                        {customer.endereco && (
                          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin className="size-3" />
                            {customer.endereco.municipio} - {customer.endereco.uf}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => setShowBlingResults(false)}
                  className="w-full py-3 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
