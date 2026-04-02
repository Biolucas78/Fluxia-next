export type OrderStatus = 'pedidos' | 'embalagens_separadas' | 'embalagens_prontas' | 'caixa_montada' | 'enviado' | 'entregue';

export interface ProductItem {
  id: string;
  quantity: number;
  name: string;
  weight: string; // e.g., "250g", "1kg"
  grindType: 'moído' | 'grãos' | 'N/A';
  productionNotes?: string;
  checked: boolean;
}

export interface Order {
  id: string;
  clientName: string;
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
  trackingNumber?: string;
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
  insuranceValue?: string;
  invoiceKey?: string;
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
