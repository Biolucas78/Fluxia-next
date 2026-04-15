export type UserRole = 'admin' | 'user' | 'gestor_trafego' | 'gestor_vendas';

export interface UserPermissions {
  crm_read: boolean;
  crm_edit: boolean;
  crm_create: boolean;
  crm_delete: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  permissions?: UserPermissions;
}

export type LeadOrigin = 'landing_page' | 'munddi' | 'manual';
export type LeadTemperature = 'gelado' | 'morno' | 'quente';

export interface LeadHistory {
  id?: string;
  status: string;
  timestamp: string;
  note?: string;
}

export interface Lead {
  id: string;
  nome: string;
  companyName?: string;
  responsibleName?: string;
  cnpj?: string;
  address?: string;
  addressDetails?: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    zip: string;
  };
  whatsapp?: string;
  email?: string;
  finalidade?: 'consumo' | 'revenda';
  origem: LeadOrigin;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  status: string;
  temperature?: LeadTemperature;
  notas?: string;
  sampleType?: 'em grãos' | 'moído' | 'amostra mista';
  sampleSentAt?: string;
  shippingDate?: string;
  trackingStatus?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  history: LeadHistory[];
  activeActions?: string[];
}

export interface CRMStats {
  totalLeads: number;
  leadsByStatus: Record<string, number>;
  leadsByOrigin: Record<string, number>;
  conversionRate: number;
  // New metrics
  totalSalesValue: number;
  totalOrdersCount: number;
  formSubmissions: number;
  comparison?: {
    leadsChange: number;
    salesValueChange: number;
    ordersCountChange: number;
  };
}

export interface AnalyticsStats {
  sessions: number;
  sessionsChange: number;
  newVisitors: number;
  returningVisitors: number;
  newVisitorsPercent: number;
  returningVisitorsPercent: number;
  sessionsByDevice: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  sessionsByChannel: {
    organic: number;
    direct: number;
    other: number;
  };
  dailySessions: {
    date: string;
    sessions: number;
  }[];
}

export type OrderStatus = 'pedidos' | 'embalagens_separadas' | 'embalagens_prontas' | 'caixa_montada' | 'enviado' | 'entregue';

export type OrderOrigin = 'whatsapp' | 'Wix' | 'Amazon' | 'Meli' | 'CRM';

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
  origin?: OrderOrigin;
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

export interface AuthorizedEmail {
  id: string;
  email: string;
  role: UserRole;
  permissions?: UserPermissions;
  createdAt: string;
}

export interface DashboardStats {
  totalKg: number;
  totalUnits: number;
  totalClients: number;
}
