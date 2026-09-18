// ─── Tipos Financeiros ─────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense';
export type TransactionOrigin = 'manual' | 'order_sync' | 'ofx_import' | 'bill_payment';
export type BillStatus = 'pending' | 'paid' | 'overdue';
export type BillRecurrence = 'once' | 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'annual';
export type BankAccount = 'sicoob' | 'caixa_fisico';

// ─── Categorias ────────────────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  'Vendas Diretas',
  'Vendas Online (Wix)',
  'Vendas Marketplace (Amazon/ML)',
  'Cursos e Treinamentos',
  'Outras Entradas',
] as const;

export const EXPENSE_CATEGORIES = [
  'Matéria-Prima',
  'Embalagens',
  'Logística e Frete',
  'Marketing e Publicidade',
  'Pessoal',
  'Impostos e Taxas',
  'Contador',
  'Combustível e Transporte',
  'Infraestrutura',
  'Equipamentos e Manutenção',
  'Bancário',
  'Cursos e Capacitação',
  'Certificações',
  'Outros',
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// CMV = Custo de Mercadoria Vendida (usado para margem bruta)
export const CMV_CATEGORIES = ['Matéria-Prima', 'Embalagens', 'Logística e Frete'] as const;

// Custos fixos (para ponto de equilíbrio)
export const FIXED_COST_CATEGORIES = ['Pessoal', 'Impostos e Taxas', 'Contador', 'Infraestrutura', 'Bancário'] as const;

// ─── Rótulos ───────────────────────────────────────────────────────────────

export const RECURRENCE_LABELS: Record<BillRecurrence, string> = {
  once:       'Única',
  weekly:     'Semanal',
  monthly:    'Mensal',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  annual:     'Anual',
};

export const PAYMENT_METHODS_FINANCEIRO = [
  { value: 'pix',           label: 'PIX',           icon: '⚡' },
  { value: 'boleto',        label: 'Boleto',         icon: '🏦' },
  { value: 'cartao',        label: 'Cartão',         icon: '💳' },
  { value: 'transferencia', label: 'Transferência',  icon: '🔄' },
  { value: 'dinheiro',      label: 'Dinheiro',       icon: '💵' },
  { value: 'debito',        label: 'Débito Auto.',   icon: '🔁' },
  { value: 'outros',        label: 'Outros',         icon: '💰' },
];

export const BANK_ACCOUNTS: { value: BankAccount; label: string; icon: string }[] = [
  { value: 'sicoob',       label: 'Sicoob',       icon: '🏛️' },
  { value: 'caixa_fisico', label: 'Caixa Físico', icon: '💵' },
];

// Cores para gráficos de pizza (uma por categoria de despesa)
export const EXPENSE_COLORS: Record<string, string> = {
  'Matéria-Prima':           '#6366f1',
  'Embalagens':              '#8b5cf6',
  'Logística e Frete':       '#a78bfa',
  'Marketing e Publicidade': '#ec4899',
  'Pessoal':                 '#f59e0b',
  'Impostos e Taxas':        '#ef4444',
  'Contador':                '#3b82f6',
  'Combustível e Transporte':'#10b981',
  'Infraestrutura':          '#06b6d4',
  'Equipamentos e Manutenção':'#84cc16',
  'Bancário':                '#f97316',
  'Cursos e Capacitação':    '#14b8a6',
  'Certificações':           '#64748b',
  'Outros':                  '#94a3b8',
};

export const INCOME_COLORS: Record<string, string> = {
  'Vendas Diretas':                   '#10b981',
  'Vendas Online (Wix)':              '#6366f1',
  'Vendas Marketplace (Amazon/ML)':   '#f59e0b',
  'Cursos e Treinamentos':            '#3b82f6',
  'Outras Entradas':                  '#94a3b8',
};

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  description: string;
  value: number;
  date: string; // YYYY-MM-DD
  paymentMethod?: string;
  account?: BankAccount;
  origin: TransactionOrigin;
  referenceOrderId?: string;
  referenceBillId?: string;
  notes?: string;
  isEdited?: boolean;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export interface Bill {
  id: string;
  supplier: string;
  description: string;
  category: string;
  value: number;
  issueDate?: string;
  dueDate: string;
  competenceDate?: string;
  paymentMethod?: string;
  account?: BankAccount;
  status: BillStatus;
  paidDate?: string;
  paidValue?: number;
  interest?: number;
  fine?: number;
  observation?: string;
  recurrence: BillRecurrence;
  parentBillId?: string;
  history: { action: string; timestamp: string; user?: string }[];
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export interface CaixaConfig {
  id: string;
  month: string; // 'YYYY-MM'
  saldoInicial: number;
}

export interface FinanceiroDashboardData {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  grossMargin: number;
  operationalCost: number;
  profitability: number;
  breakeven: number;
  averageTicket: number;
  totalOrders: number;
  expensesByCategory: { name: string; value: number }[];
  incomeByCategory: { name: string; value: number }[];
  monthlyData: { month: string; receita: number; despesas: number; lucro: number }[];
}

// ─── Helpers de coleção (dev/prod) ─────────────────────────────────────────

export function getFinanceiroCollections() {
  const isDev = typeof window !== 'undefined' &&
    (window.location.hostname.includes('localhost') || window.location.hostname.includes('ais-dev'));
  return {
    transactions: isDev ? 'financeiro_transactions_dev' : 'financeiro_transactions',
    bills:        isDev ? 'financeiro_bills_dev'        : 'financeiro_bills',
    config:       isDev ? 'financeiro_config_dev'       : 'financeiro_config',
  };
}
