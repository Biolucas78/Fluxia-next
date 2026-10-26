import { Order } from './types';

// ─── Regras da Recorrência ────────────────────────────────────────────────────
// Não existe entidade "Cliente" própria: os pedidos são agrupados por CNPJ/CPF/telefone/nome
// e o cadastro em bling_customers (quando existe) é a fonte da verdade dos dados do cliente.

export type RecurrenceColor = 'red' | 'yellow' | 'green';
export type RecurrenceTab = 'todos' | 'cnpj' | 'cpf' | 'bh' | 'fora';
export type ApproachChannel = 'pessoal' | 'business';

export const RECURRENCE_TAGS = ['Revendedor', 'Consumidor final'];

// Abordar de novo antes desse prazo gera um aviso (evita ser invasivo)
export const APPROACH_COOLDOWN_DAYS = 15;

// Origens que começam fora da recorrência (o toggle ainda pode religar manualmente)
const EXCLUDED_ORIGINS = ['amazon', 'meli', 'mercado'];

// Pedidos com menos desses dias de diferença contam como uma única compra no cálculo do ciclo
const SAME_PURCHASE_WINDOW_DAYS = 3;

const DAY_MS = 1000 * 60 * 60 * 24;

export interface CustomerEntry {
  id: string;
  data: any;
}

export interface ClientRecurrence {
  identifier: string;
  customer: CustomerEntry | null;
  latestOrder: Order;
  totalOrders: number;
  fantasia: string;
  razaoSocial: string;
  contatoNome: string;
  phone: string;
  city: string;
  state: string;
  docType: 'cnpj' | 'cpf' | null;
  origin: string;
  tags: string[];
  observacao: string;
  lastOrderAt: number;
  daysSinceLastOrder: number;
  color: RecurrenceColor;
  // Data de entrega do último pedido (null enquanto o pedido não foi entregue)
  deliveryDate: string | null;
  inProgress: boolean;
  // Preenchido só enquanto o "mover para o fim" estiver valendo (até o fim do dia ou até o próximo "Atualizar")
  movedToEndAt: number | null;
  lastApproachAt: string | null;
  daysSinceApproach: number | null;
  lastChannel: ApproachChannel | null;
  // Intervalo médio entre compras, em dias (null com menos de duas compras)
  cycleDays: number | null;
  participates: boolean;
  productSummary: string;
}

export const normalizeString = (str?: string) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
};

const onlyDigits = (str?: string) => (str || '').replace(/\D/g, '');

export function isExcludedOrigin(origin?: string): boolean {
  const o = (origin || '').toLowerCase();
  return EXCLUDED_ORIGINS.some(k => o.includes(k));
}

export function getRecurrenceColor(days: number): RecurrenceColor {
  if (days < 20) return 'green';
  if (days <= 30) return 'yellow';
  return 'red';
}

export function isBeloHorizonte(city: string): boolean {
  return normalizeString(city) === 'belo horizonte';
}

export function getOrderIdentifier(order: Order): string {
  if (order.cnpj) return onlyDigits(order.cnpj);
  if (order.cpf) return onlyDigits(order.cpf);
  if (order.phone) return onlyDigits(order.phone);
  return normalizeString(order.clientName);
}

// Indexa bling_customers por: doc.id, documento, telefone e nome/fantasia normalizados
export function buildCustomersIndex(docs: { id: string; data: any }[]): Map<string, CustomerEntry> {
  const idx = new Map<string, CustomerEntry>();
  docs.forEach(({ id, data }) => {
    // Doc antigo cujo ID do Bling estava desatualizado — o cadastro válido está em `substituidoPor`
    if (data.substituidoPor) return;
    const entry: CustomerEntry = { id, data };
    idx.set(id, entry);
    const docNum = onlyDigits(data.numeroDocumento);
    if (docNum) idx.set(docNum, entry);
    const phone = onlyDigits(getCustomerPhone(data));
    if (phone.length >= 10) idx.set('tel:' + phone, entry);
    const nome = normalizeString(data.nome);
    if (nome) idx.set('nome:' + nome, entry);
    const fantasia = normalizeString(data.fantasia);
    if (fantasia) idx.set('nome:' + fantasia, entry);
  });
  return idx;
}

export function findCustomerEntry(index: Map<string, CustomerEntry>, order: Order, identifier: string): CustomerEntry | null {
  if (index.has(identifier)) return index.get(identifier)!;
  const docNum = onlyDigits(order.cnpj || order.cpf);
  if (docNum && index.has(docNum)) return index.get(docNum)!;
  const phone = onlyDigits(order.phone);
  if (phone.length >= 10 && index.has('tel:' + phone)) return index.get('tel:' + phone)!;
  const nome = normalizeString(order.clientName);
  if (nome && index.has('nome:' + nome)) return index.get('nome:' + nome)!;
  return null;
}

export function getCustomerPhone(data: any): string {
  return data?.celular || data?.telefones?.celular || data?.telefone || '';
}

export function getCustomerCity(data: any): string {
  return data?.endereco?.geral?.municipio || data?.endereco?.municipio || '';
}

export function getCustomerState(data: any): string {
  return data?.endereco?.geral?.uf || data?.endereco?.uf || '';
}

function getDocType(order: Order, customerData: any): 'cnpj' | 'cpf' | null {
  const digits = onlyDigits(order.cnpj) || onlyDigits(order.cpf) || onlyDigits(customerData?.numeroDocumento);
  if (digits.length === 14) return 'cnpj';
  if (digits.length === 11) return 'cpf';
  if (order.cnpj) return 'cnpj';
  if (order.cpf) return 'cpf';
  return null;
}

function computeCycleDays(ordersDesc: Order[]): number | null {
  const times = ordersDesc.map(o => new Date(o.createdAt).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b);
  const purchases: number[] = [];
  times.forEach(t => {
    if (purchases.length === 0 || t - purchases[purchases.length - 1] > SAME_PURCHASE_WINDOW_DAYS * DAY_MS) {
      purchases.push(t);
    }
  });
  if (purchases.length < 2) return null;
  const totalDays = (purchases[purchases.length - 1] - purchases[0]) / DAY_MS;
  return Math.round(totalDays / (purchases.length - 1));
}

// Até dois produtos do último pedido, os de maior quantidade — usado na variável {Produto}
function summarizeProducts(order: Order): string {
  const qtyByName = new Map<string, number>();
  (order.products || []).forEach(p => {
    if (!p.name) return;
    qtyByName.set(p.name, (qtyByName.get(p.name) || 0) + (p.quantity || 0));
  });
  return [...qtyByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name)
    .join(' e ');
}

export function buildRecurrenceClients(
  allOrders: Order[],
  customersIndex: Map<string, CustomerEntry>,
  queueResetAt: string | null,
  now: Date = new Date()
): ClientRecurrence[] {
  const groups = new Map<string, Order[]>();
  allOrders.forEach(order => {
    const id = getOrderIdentifier(order);
    if (!id) return;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(order);
  });

  // "Mover para o fim" vale até o fim do dia ou até o último "Atualizar", o que for mais recente
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const effectiveReset = Math.max(startOfToday.getTime(), queueResetAt ? new Date(queueResetAt).getTime() : 0);

  const result: ClientRecurrence[] = [];

  groups.forEach((orders, identifier) => {
    // Amostras ficam de fora — clientes só em prospecção são tratados no CRM
    const realOrders = orders
      .filter(o => !o.isSample)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (realOrders.length === 0) return;

    const latestOrder = realOrders[0];
    const customer = findCustomerEntry(customersIndex, latestOrder, identifier);
    const data = customer?.data || {};

    const origin = latestOrder.origin || 'N/A';
    // Flag explícita no cadastro manda; sem ela, respeita o campo legado e depois o padrão por origem
    const participates = data.participaRecorrencia !== undefined
      ? data.participaRecorrencia !== false
      : !latestOrder.recurrenceRemoved && !isExcludedOrigin(origin);

    const lastOrderAt = new Date(latestOrder.createdAt).getTime();
    const daysSinceLastOrder = Math.max(0, Math.floor((now.getTime() - lastOrderAt) / DAY_MS));

    const inProgress = latestOrder.status !== 'entregue';
    let deliveryDate: string | null = null;
    if (!inProgress) {
      deliveryDate = latestOrder.deliveryDate
        || latestOrder.statusHistory?.find(h => h.status === 'entregue')?.timestamp
        || null;
    }

    const contactTime = latestOrder.lastRecurrenceContact ? new Date(latestOrder.lastRecurrenceContact).getTime() : 0;
    const movedToEndAt = contactTime > effectiveReset && contactTime > lastOrderAt ? contactTime : null;

    let lastApproachAt: string | null = null;
    let lastChannel: ApproachChannel | null = null;
    for (const o of realOrders) {
      if (o.lastRecurrenceApproach && (!lastApproachAt || o.lastRecurrenceApproach > lastApproachAt)) {
        lastApproachAt = o.lastRecurrenceApproach;
        if (o.recurrenceApproachChannel) lastChannel = o.recurrenceApproachChannel;
      }
    }
    if (!lastChannel) lastChannel = realOrders.find(o => o.recurrenceApproachChannel)?.recurrenceApproachChannel || null;
    const daysSinceApproach = lastApproachAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastApproachAt).getTime()) / DAY_MS))
      : null;

    result.push({
      identifier,
      customer,
      latestOrder,
      totalOrders: realOrders.length,
      fantasia: data.fantasia || latestOrder.tradeName || '',
      razaoSocial: data.nome || latestOrder.clientName || '',
      contatoNome: data.contatoNome || realOrders.find(o => o.contactName)?.contactName || '',
      phone: getCustomerPhone(data) || latestOrder.phone || '',
      city: getCustomerCity(data) || latestOrder.addressDetails?.city || '',
      state: (getCustomerState(data) || latestOrder.addressDetails?.state || '').toUpperCase(),
      docType: getDocType(latestOrder, data),
      origin,
      tags: Array.isArray(data.tagsRecorrencia) ? data.tagsRecorrencia : [],
      observacao: data.observacaoRecorrencia || '',
      lastOrderAt,
      daysSinceLastOrder,
      color: getRecurrenceColor(daysSinceLastOrder),
      deliveryDate,
      inProgress,
      movedToEndAt,
      lastApproachAt,
      daysSinceApproach,
      lastChannel,
      cycleDays: computeCycleDays(realOrders),
      participates,
      productSummary: summarizeProducts(latestOrder),
    });
  });

  return result;
}

// Ordem da fila: por data do último pedido; quem foi "movido para o fim" fica sempre no final
export function sortRecurrenceQueue(clients: ClientRecurrence[], direction: 'asc' | 'desc'): ClientRecurrence[] {
  return [...clients].sort((a, b) => {
    if (!!a.movedToEndAt !== !!b.movedToEndAt) return a.movedToEndAt ? 1 : -1;
    if (a.movedToEndAt && b.movedToEndAt) return a.movedToEndAt - b.movedToEndAt;
    return direction === 'asc' ? a.lastOrderAt - b.lastOrderAt : b.lastOrderAt - a.lastOrderAt;
  });
}

export function fillMessage(template: string, client: ClientRecurrence): string {
  const firstName = (client.contatoNome || client.fantasia || client.razaoSocial).split(' ')[0] || 'Cliente';
  return template
    .replace(/\{Nome\}/g, firstName)
    .replace(/\{Produto\}/g, client.productSummary || 'nosso café');
}
