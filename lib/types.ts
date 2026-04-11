export type OrderStatus = 'pedidos' | 'embalagens_separadas' | 'embalagens_prontas' | 'caixa_montada' | 'enviado' | 'entregue';

export interface ProductItem {
  id: string;
  quantity: number;
  name: string;
  weight: string; // e.g., "250g", "1kg"
  grindType: 'moído' | 'grãos' | 'N/A';
  productionNotes?: string;
  checked: boolean;
  blingSku?: string;
  blingId?: number;
}

export interface Order {
  id: string;
  clientName: string;
  tradeName?: string;
  cnpj?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  address?: string;
  number?: string;
  complement?: string;
  addressDetails?: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    zip: string;
    warning?: string;
  };
  products: ProductItem[];
  status: OrderStatus;
  carrier?: string;
  shippingProvider?: 'melhorenvio' | 'correios' | 'superfrete';
  shipmentId?: string; // UUID do Melhor Envio
  trackingNumber?: string;
  blingOrderId?: number;
  hasInvoice: boolean;
  hasBoleto: boolean;
  hasOrderDocument: boolean;
  createdAt: string;
  archived?: boolean;
  archivedAt?: string;
  isSample?: boolean;
  originType?: 'BH' | 'CRV';
  shippingQuote?: ShippingOption[];
  selectedShippingOption?: ShippingOption;
  boxDimensions?: {
    width: number;
    height: number;
    length: number;
  };
  boxWeight?: number;
  observations?: string;
  paymentCondition?: 'A vista' | '15 dias' | '21 dias' | '30 dias' | '2x';
  insuranceValue?: string;
  invoiceKey?: string;
  invoiceNumber?: string;
  invoiceValue?: number;
  productDescription?: string;
  trackingStatus?: string;
  trackingHistory?: {
    status: string;
    message: string;
    date: string;
    location?: string;
  }[];
  deliveryDate?: string;
  lastTrackingUpdate?: string;
  statusHistory?: {
    status: OrderStatus;
    timestamp: string;
  }[];
}

export interface ShippingOption {
  id: string | number;
  provider?: string;
  name: string;
  price: number;
  currency: string;
  delivery_time: number;
  company: {
    id: number;
    name: string;
    picture: string;
  };
  error?: string;
}

export interface DashboardStats {
  totalKg: number;
  totalUnits: number;
  totalClients: number;
}
