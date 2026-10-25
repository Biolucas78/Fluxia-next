'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useOrders, useUser, useRecurrenceMessages, useRecurrenceQueueReset, RecurrenceMessages } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import RecurrenceCard, { RecurrenceEdits } from '@/components/RecurrenceCard';
import {
  Loader2, MessageSquare, AlertCircle, Filter, Search, X, Send, EyeOff, Save, CheckCircle2, RefreshCw,
  Settings, Clock, Users, ArrowUpDown, Paperclip, Share2, RotateCcw, AlertTriangle, FileText,
} from 'lucide-react';
import Login from '@/components/Login';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { getValidBlingToken } from '@/lib/bling-client';
import {
  ClientRecurrence, RecurrenceColor, RecurrenceTab, ApproachChannel, CustomerEntry, RECURRENCE_TAGS, APPROACH_COOLDOWN_DAYS,
  buildCustomersIndex, buildRecurrenceClients, sortRecurrenceQueue, fillMessage, isBeloHorizonte, normalizeString,
  getCustomerPhone, getCustomerCity, getCustomerState,
} from '@/lib/recurrence';

const TABS: { id: RecurrenceTab; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'cnpj', label: 'CNPJ' },
  { id: 'cpf', label: 'CPF' },
  { id: 'bh', label: 'Belo Horizonte' },
  { id: 'fora', label: 'Fora da recorrência' },
];

const COLOR_FILTERS: { id: RecurrenceColor; label: string; cls: string; activeCls: string }[] = [
  { id: 'red', label: '+30 dias', cls: 'text-red-600 dark:text-red-400', activeCls: 'bg-red-500 text-white border-red-500' },
  { id: 'yellow', label: '20–30 dias', cls: 'text-amber-600 dark:text-amber-400', activeCls: 'bg-amber-400 text-white border-amber-400' },
  { id: 'green', label: '-20 dias', cls: 'text-emerald-600 dark:text-emerald-400', activeCls: 'bg-emerald-500 text-white border-emerald-500' },
];

const MESSAGE_OPTIONS: { group: string; options: { key: keyof RecurrenceMessages; label: string }[] }[] = [
  { group: 'Revenda (B2B)', options: [
    { key: 'b2b_1', label: 'Opção 1: Oferta Direta Reposição' },
    { key: 'b2b_2', label: 'Opção 2: Oferta com Agendamento' },
    { key: 'b2b_3', label: 'Opção 3: Relacionamento / Suporte' },
  ]},
  { group: 'Pessoa Física (Consumo)', options: [
    { key: 'pf_1', label: 'Opção 1: Acabando o estoque' },
    { key: 'pf_2', label: 'Opção 2: Torra Fresquinha' },
    { key: 'pf_3', label: 'Opção 3: Renovar para casa' },
  ]},
];

const selectCls = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
const filterLabelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block';

const isDevHost = () => typeof window !== 'undefined'
  && (window.location.hostname.includes('localhost') || window.location.hostname.includes('ais-dev'));

const monthKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

function suggestMessage(client: ClientRecurrence): keyof RecurrenceMessages {
  if (client.tags.includes('Revendedor')) return 'b2b_1';
  if (client.tags.includes('Consumidor final')) return 'pf_1';
  if (client.docType === 'cnpj') return 'b2b_1';
  if (client.docType === 'cpf' || client.origin.toLowerCase().includes('pf')) return 'pf_1';
  return 'b2b_1';
}

// Monta o payload do Bling a partir do cadastro salvo + edições (mesmo formato usado em Clientes)
function buildBlingPayload(data: any, edits: RecurrenceEdits) {
  const docNum = (data.numeroDocumento || '').replace(/\D/g, '');
  const indicadorIe = parseInt(data.indicadorIe || data.contribuinte || '9');
  return {
    nome: edits.razaoSocial || data.nome,
    fantasia: edits.fantasia,
    tipo: data.tipo || (docNum.length === 14 ? 'J' : 'F'),
    situacao: data.situacao || 'A',
    numeroDocumento: data.numeroDocumento || '',
    ie: indicadorIe === 9 ? '' : (data.ie || ''),
    indicadorIe,
    telefone: data.telefone || '',
    celular: edits.phone,
    telefones: { celular: edits.phone },
    email: data.email || '',
    endereco: {
      geral: {
        cep: data.endereco?.geral?.cep || data.endereco?.cep || '',
        uf: edits.state,
        municipio: edits.city,
        bairro: data.endereco?.geral?.bairro || data.endereco?.bairro || '',
        endereco: data.endereco?.geral?.endereco || data.endereco?.endereco || '',
        numero: data.endereco?.geral?.numero || data.endereco?.numero || '',
        complemento: data.endereco?.geral?.complemento || data.endereco?.complemento || '',
      },
    },
    dadosAdicionais: {
      codigoRegimeTributario: parseInt(data.dadosAdicionais?.codigoRegimeTributario || data.codigoRegimeTributario || '0'),
    },
  };
}

export default function RecorrenciaPage() {
  const { allOrders, isLoaded, handleUpdateOrder } = useOrders();
  const { userProfile, loading: userLoading, effectiveRole } = useUser();
  const { messages, updateMessages } = useRecurrenceMessages();
  const { resetAt, resetQueue } = useRecurrenceQueueReset();

  // ── Cadastro de clientes (bling_customers) em tempo real ────────────────────
  const [customersIndex, setCustomersIndex] = useState<Map<string, CustomerEntry>>(new Map());
  const [customersLoaded, setCustomersLoaded] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    const unsub = onSnapshot(collection(db, 'bling_customers'), (snap) => {
      setCustomersIndex(buildCustomersIndex(snap.docs.map(d => ({ id: d.id, data: d.data() }))));
      setCustomersLoaded(true);
    }, (e) => {
      console.warn('Não foi possível carregar bling_customers para a recorrência:', e);
      setCustomersLoaded(true);
    });
    return unsub;
  }, [userProfile]);

  // Recalcula as contagens de dias quando a página fica aberta de um dia pro outro
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const allClients = useMemo(() => {
    if (!isLoaded || !customersLoaded) return [];
    return buildRecurrenceClients(allOrders, customersIndex, resetAt, now);
  }, [allOrders, isLoaded, customersIndex, customersLoaded, resetAt, now]);

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<RecurrenceTab>('cnpj');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterState, setFilterState] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterTag, setFilterTag] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterColor, setFilterColor] = useState<RecurrenceColor | 'all'>('all');

  const stateOptions = useMemo(
    () => [...new Set(allClients.map(c => c.state).filter(Boolean))].sort(),
    [allClients]
  );
  const cityOptions = useMemo(
    () => [...new Set(allClients.filter(c => filterState === 'all' || c.state === filterState).map(c => c.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [allClients, filterState]
  );
  const monthOptions = useMemo(
    () => [...new Set(allClients.map(c => monthKey(c.lastOrderAt)))].sort().reverse(),
    [allClients]
  );
  const originOptions = useMemo(
    () => [...new Set(allClients.map(c => c.origin))].sort(),
    [allClients]
  );

  const activeFilterCount = [filterState !== 'all', filterCity !== 'all', filterMonth !== 'all', !!startDate || !!endDate, filterTag !== 'all', filterOrigin !== 'all']
    .filter(Boolean).length;

  const clearFilters = () => {
    setFilterState('all'); setFilterCity('all'); setFilterMonth('all');
    setStartDate(''); setEndDate(''); setFilterTag('all'); setFilterOrigin('all'); setFilterColor('all');
  };

  // Filtros secundários (combinam com qualquer aba)
  const secondaryFiltered = useMemo(() => {
    const term = normalizeString(searchTerm);
    const termDigits = searchTerm.replace(/\D/g, '');
    const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : null;
    const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;
    return allClients.filter(c => {
      if (term) {
        const matchesText = [c.fantasia, c.razaoSocial, c.contatoNome, c.city].some(v => normalizeString(v).includes(term));
        const matchesPhone = termDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(termDigits);
        if (!matchesText && !matchesPhone) return false;
      }
      if (filterState !== 'all' && c.state !== filterState) return false;
      if (filterCity !== 'all' && c.city !== filterCity) return false;
      if (filterMonth !== 'all' && monthKey(c.lastOrderAt) !== filterMonth) return false;
      if (start !== null && c.lastOrderAt < start) return false;
      if (end !== null && c.lastOrderAt > end) return false;
      if (filterTag === 'none' && c.tags.length > 0) return false;
      if (filterTag !== 'all' && filterTag !== 'none' && !c.tags.includes(filterTag)) return false;
      if (filterOrigin !== 'all' && c.origin !== filterOrigin) return false;
      return true;
    });
  }, [allClients, searchTerm, filterState, filterCity, filterMonth, startDate, endDate, filterTag, filterOrigin]);

  const matchesTab = (c: ClientRecurrence, t: RecurrenceTab) => {
    if (t === 'fora') return !c.participates;
    if (!c.participates) return false;
    if (t === 'cnpj') return c.docType === 'cnpj';
    if (t === 'cpf') return c.docType === 'cpf';
    if (t === 'bh') return isBeloHorizonte(c.city);
    return true;
  };

  const tabCounts = useMemo(() => {
    const counts = {} as Record<RecurrenceTab, number>;
    TABS.forEach(t => { counts[t.id] = secondaryFiltered.filter(c => matchesTab(c, t.id)).length; });
    return counts;
  }, [secondaryFiltered]);

  const tabFiltered = useMemo(() => secondaryFiltered.filter(c => matchesTab(c, tab)), [secondaryFiltered, tab]);

  const colorCounts = useMemo(() => ({
    red: tabFiltered.filter(c => c.color === 'red').length,
    yellow: tabFiltered.filter(c => c.color === 'yellow').length,
    green: tabFiltered.filter(c => c.color === 'green').length,
  }), [tabFiltered]);

  const filteredData = useMemo(() => sortRecurrenceQueue(
    tabFiltered.filter(c => filterColor === 'all' || c.color === filterColor),
    sortDir
  ), [tabFiltered, filterColor, sortDir]);

  // ── Seleção em massa ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);

  useEffect(() => { setSelectedIds(new Set()); },
    [tab, searchTerm, filterState, filterCity, filterMonth, startDate, endDate, filterTag, filterOrigin, filterColor]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(selectedIds.size === filteredData.length ? new Set() : new Set(filteredData.map(c => c.identifier)));
  };

  const selectedClients = () => filteredData.filter(c => selectedIds.has(c.identifier));

  // ── Escritas ────────────────────────────────────────────────────────────────
  // Grava no cadastro do cliente (bling_customers). Se o cliente ainda não existir lá,
  // cria um doc mínimo usando o identifier, igual ao padrão já usado pela flag de participação.
  const writeCustomer = async (client: ClientRecurrence, fields: Record<string, any>) => {
    const docId = client.customer?.id || client.identifier;
    await setDoc(doc(db, 'bling_customers', docId), {
      ...fields,
      ...(client.customer ? {} : {
        nome: client.razaoSocial,
        numeroDocumento: (client.latestOrder.cnpj || client.latestOrder.cpf || '').replace(/\D/g, ''),
      }),
    }, { merge: true });
  };

  const setParticipaRecorrencia = (client: ClientRecurrence, value: boolean) =>
    writeCustomer(client, { participaRecorrencia: value });

  // "Mover para o fim" vale até o fim do dia ou até o próximo "Atualizar"
  const moveToEnd = async (client: ClientRecurrence) => {
    const nowIso = new Date().toISOString();
    await handleUpdateOrder({
      ...client.latestOrder,
      lastRecurrenceContact: nowIso,
      statusHistory: [
        ...(client.latestOrder.statusHistory || []),
        { action: 'Recorrência — movido para o fim da fila', timestamp: nowIso },
      ],
    });
  };

  // Abordagem registrada ao abrir o WhatsApp: também move o cliente pro fim da fila do dia
  const recordApproach = async (client: ClientRecurrence, channel?: ApproachChannel) => {
    const nowIso = new Date().toISOString();
    await handleUpdateOrder({
      ...client.latestOrder,
      lastRecurrenceContact: nowIso,
      lastRecurrenceApproach: nowIso,
      ...(channel ? { recurrenceApproachChannel: channel } : {}),
      statusHistory: [
        ...(client.latestOrder.statusHistory || []),
        { action: `Recorrência — abordagem via WhatsApp${channel ? (channel === 'business' ? ' Business' : ' Pessoal') : ' (com anexo)'}`, timestamp: nowIso },
      ],
    });
  };

  const handleMoveToEnd = async (client: ClientRecurrence) => {
    try {
      await moveToEnd(client);
      toast.success('Cliente movido para o fim da fila (até o fim do dia).');
    } catch (e: any) {
      toast.error('Erro ao mover: ' + e.message);
    }
  };

  const handleReinclude = async (client: ClientRecurrence) => {
    try {
      await setParticipaRecorrencia(client, true);
      toast.success('Cliente recolocado na recorrência.');
    } catch (e: any) {
      toast.error('Erro ao recolocar: ' + e.message);
    }
  };

  const handleSaveEdits = async (client: ClientRecurrence, edits: RecurrenceEdits) => {
    try {
      await writeCustomer(client, {
        ...(edits.razaoSocial.trim() ? { nome: edits.razaoSocial.trim() } : {}),
        fantasia: edits.fantasia.trim(),
        celular: edits.phone.trim(),
        contatoNome: edits.contatoNome.trim(),
        endereco: { geral: { municipio: edits.city.trim(), uf: edits.state.trim().toUpperCase() } },
        tagsRecorrencia: edits.tags,
        observacaoRecorrencia: edits.observacao.trim(),
        updatedAt: Date.now(),
      });

      // Mantém o pedido mais recente coerente (o modal do pedido mostra o contato)
      if (edits.contatoNome.trim() !== (client.latestOrder.contactName || '')) {
        await handleUpdateOrder({ ...client.latestOrder, contactName: edits.contatoNome.trim() });
      }

      // Envia ao Bling os campos que ele também guarda — senão a próxima sincronização desfaz a correção
      const data = client.customer?.data;
      const isBlingContact = !!data && String(data.id) === client.customer!.id;
      const blingFieldsChanged = edits.razaoSocial !== client.razaoSocial || edits.fantasia !== client.fantasia
        || edits.phone !== client.phone || edits.city !== client.city || edits.state !== client.state;

      if (isBlingContact && blingFieldsChanged) {
        const token = await getValidBlingToken();
        if (!token) {
          toast('Salvo no Fluxia. Conecte o Bling em Configurações para enviar a correção ao Bling.', { icon: '⚠️' });
          return;
        }
        const res = await fetch(`/api/bling/customers/${client.customer!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(buildBlingPayload(data, edits)),
        });
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          toast.error('Salvo no Fluxia, mas o Bling recusou: ' + (result.error || res.status), { duration: 6000 });
          return;
        }
        toast.success('Cadastro atualizado no Fluxia e no Bling!');
      } else {
        toast.success('Cadastro atualizado!');
      }
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
      throw e;
    }
  };

  // ── Atualizar ───────────────────────────────────────────────────────────────
  // Pedidos e cadastro já chegam em tempo real. O botão: (1) devolve à posição normal quem foi
  // movido pro fim, (2) preenche campos VAZIOS do cadastro com os dados dos pedidos (nunca sobrescreve).
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await resetQueue();

      // bling_customers é compartilhado entre dev e prod — não completar cadastro com pedidos de teste
      if (isDevHost()) {
        toast.success('Fila reorganizada pela data do pedido. (Complemento de cadastro desativado em localhost.)');
        return;
      }

      const updates: { id: string; fields: Record<string, any> }[] = [];
      allClients.forEach(c => {
        if (!c.customer) return;
        const data = c.customer.data;
        const fields: Record<string, any> = {};
        if (!getCustomerPhone(data) && c.phone) fields.celular = c.phone;
        if (!data.contatoNome && c.contatoNome) fields.contatoNome = c.contatoNome;
        if (!data.fantasia && c.fantasia) fields.fantasia = c.fantasia;
        const geral: Record<string, string> = {};
        if (!getCustomerCity(data) && c.city) geral.municipio = c.city;
        if (!getCustomerState(data) && c.state) geral.uf = c.state;
        if (Object.keys(geral).length) fields.endereco = { geral };
        if (Object.keys(fields).length) updates.push({ id: c.customer.id, fields });
      });

      for (let i = 0; i < updates.length; i += 400) {
        const batch = writeBatch(db);
        updates.slice(i, i + 400).forEach(u => batch.set(doc(db, 'bling_customers', u.id), u.fields, { merge: true }));
        await batch.commit();
      }

      toast.success(updates.length
        ? `Fila reorganizada e ${updates.length} cadastro(s) completado(s) com dados dos pedidos.`
        : 'Fila reorganizada pela data do pedido. Cadastros já estavam completos.');
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + e.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── Remoção ─────────────────────────────────────────────────────────────────
  const [clientToRemove, setClientToRemove] = useState<ClientRecurrence | null>(null);

  const confirmRemove = async () => {
    if (!clientToRemove) return;
    try {
      await setParticipaRecorrencia(clientToRemove, false);
      toast.success('Cliente movido para "Fora da recorrência".');
      if (selectedClientId === clientToRemove.identifier) setSelectedClientId(null);
      setClientToRemove(null);
    } catch (e: any) {
      toast.error('Erro ao remover: ' + e.message);
    }
  };

  const handleBulkSnooze = async () => {
    const clients = selectedClients();
    await Promise.all(clients.map(moveToEnd));
    setSelectedIds(new Set());
    toast.success(`${clients.length} clientes movidos para o fim da fila.`);
  };

  const handleBulkRemove = async () => {
    const clients = selectedClients();
    await Promise.all(clients.map(c => setParticipaRecorrencia(c, false)));
    setSelectedIds(new Set());
    setBulkRemoveConfirm(false);
    toast.success(`${clients.length} clientes movidos para "Fora da recorrência".`);
  };

  const handleBulkReinclude = async () => {
    const clients = selectedClients();
    await Promise.all(clients.map(c => setParticipaRecorrencia(c, true)));
    setSelectedIds(new Set());
    toast.success(`${clients.length} clientes recolocados na recorrência.`);
  };

  // ── Modal de abordagem ──────────────────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<keyof RecurrenceMessages>('b2b_1');
  // O anexo continua selecionado entre clientes, pra mandar a mesma promoção pra vários seguidos
  const [attachment, setAttachment] = useState<File | null>(null);

  const selectedClient = useMemo(
    () => (selectedClientId ? allClients.find(c => c.identifier === selectedClientId) || null : null),
    [allClients, selectedClientId]
  );

  const handleOpenClient = (client: ClientRecurrence) => {
    setSelectedClientId(client.identifier);
    setSelectedMessage(suggestMessage(client));
  };

  const messageText = selectedClient ? fillMessage(messages[selectedMessage], selectedClient) : '';

  const generateWhatsappUrl = (tipo: ApproachChannel) => {
    if (!selectedClient?.phone) return '#';
    let phone = selectedClient.phone.replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const encoded = encodeURIComponent(messageText);
    if (tipo === 'business') {
      return `intent://send?phone=${phone}&text=${encoded}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
    }
    return `https://wa.me/${phone}?text=${encoded}`;
  };

  const handleWhatsappClick = (channel: ApproachChannel) => {
    if (!selectedClient?.phone) {
      toast.error('Cliente sem telefone. Cadastre pelo lápis no card.');
      return;
    }
    recordApproach(selectedClient, channel).then(() => toast.success('Abordagem registrada.'));
  };

  // O link do WhatsApp só leva texto — arquivo só vai pela tela de compartilhar do Android
  const handleShareWithFile = async () => {
    if (!selectedClient || !attachment) return;
    if (!navigator.canShare || !navigator.canShare({ files: [attachment] })) {
      toast.error('Este navegador não compartilha arquivos. Use o Chrome no celular Android.');
      return;
    }
    // Copia o texto também: alguns envios de PDF descartam a legenda, aí é só colar
    navigator.clipboard?.writeText(messageText).catch(() => {});
    try {
      await navigator.share({ files: [attachment], text: messageText });
      await recordApproach(selectedClient);
      toast.success('Abordagem registrada. Se o texto não foi junto, é só colar — ele está copiado.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Não foi possível compartilhar: ' + e.message);
    }
  };

  // ── Frases ──────────────────────────────────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingMessages, setEditingMessages] = useState<RecurrenceMessages | null>(null);

  const handleOpenSettings = () => {
    setEditingMessages({ ...messages });
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (editingMessages) {
      await updateMessages(editingMessages);
      setIsSettingsOpen(false);
      toast.success('Frases atualizadas com sucesso!');
    }
  };

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return <Login />;
  }

  if (effectiveRole === 'gestor_trafego') {
    return (
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <AlertCircle className="size-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito</h1>
          <p className="text-slate-500 text-center max-w-md">Sua função de Gestor de Tráfego não possui permissão para acessar a Gestão de Recorrência.</p>
        </main>
      </div>
    );
  }

  const recentlyApproached = selectedClient?.daysSinceApproach !== null && selectedClient?.daysSinceApproach !== undefined
    && selectedClient.daysSinceApproach < APPROACH_COOLDOWN_DAYS;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Header title="Gestão de Recorrência" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-4">

            {/* Busca + ações */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 w-full md:max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar nome, contato, cidade ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowFilters(f => !f)}
                  className={`flex items-center gap-2 border rounded-xl py-2 px-3 text-sm font-bold transition-all ${
                    showFilters || activeFilterCount > 0
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Filter className="size-4" />
                  Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
                </button>

                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  title={sortDir === 'asc' ? 'Pedido mais antigo primeiro' : 'Pedido mais recente primeiro'}
                  className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-sm font-bold text-slate-700 dark:text-slate-300 transition-all"
                >
                  <ArrowUpDown className="size-4 text-slate-400" />
                  {sortDir === 'asc' ? 'Antigo' : 'Recente'}
                </button>

                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Reorganiza a fila pela data do pedido e completa cadastros vazios com dados dos pedidos"
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Atualizar</span>
                </button>

                <button
                  onClick={handleOpenSettings}
                  className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2 px-3 text-sm font-bold transition-all"
                  title="Configurar frases"
                >
                  <Settings className="size-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Abas */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    tab === t.id
                      ? (t.id === 'fora' ? 'bg-slate-700 text-white border-slate-700' : 'bg-primary text-white border-primary shadow-lg shadow-primary/20')
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary'
                  }`}
                >
                  {t.label}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${tab === t.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {tabCounts[t.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Painel de filtros */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className={filterLabelCls}>Estado</label>
                      <select value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity('all'); }} className={selectCls}>
                        <option value="all">Todos</option>
                        {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={filterLabelCls}>Cidade</label>
                      <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className={selectCls}>
                        <option value="all">Todas</option>
                        {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={filterLabelCls}>Mês do último pedido</label>
                      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={selectCls}>
                        <option value="all">Todos</option>
                        {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={filterLabelCls}>Origem</label>
                      <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)} className={selectCls}>
                        <option value="all">Todas</option>
                        {originOptions.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={filterLabelCls}>Pedido de</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={selectCls} />
                    </div>
                    <div>
                      <label className={filterLabelCls}>Pedido até</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={selectCls} />
                    </div>
                    <div>
                      <label className={filterLabelCls}>Tag</label>
                      <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className={selectCls}>
                        <option value="all">Todas</option>
                        {RECURRENCE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="none">Sem tag</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={clearFilters}
                        className="w-full py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-red-500 border border-slate-200 dark:border-slate-800 hover:border-red-200 transition-all"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Placar por cor */}
            <div className="grid grid-cols-3 gap-2">
              {COLOR_FILTERS.map(cf => (
                <button
                  key={cf.id}
                  onClick={() => setFilterColor(prev => prev === cf.id ? 'all' : cf.id)}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                    filterColor === cf.id ? cf.activeCls : `bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${cf.cls}`
                  }`}
                  title="Clique para filtrar por essa cor"
                >
                  <span className="text-lg font-black">{colorCounts[cf.id]}</span>
                  <span className="text-[11px] uppercase tracking-wider">{cf.label}</span>
                </button>
              ))}
            </div>

            {/* Contagem + Selecionar todos + Ações em massa */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                  <Users className="size-4 text-slate-400" />
                  {filteredData.length} cliente{filteredData.length !== 1 ? 's' : ''}
                </span>
                {filteredData.length > 0 && (
                  <button onClick={handleSelectAll} className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                    {selectedIds.size === filteredData.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                )}
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 font-medium">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                  {tab === 'fora' ? (
                    <button onClick={handleBulkReinclude} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                      <RotateCcw className="size-3.5" /> Recolocar selecionados
                    </button>
                  ) : (
                    <>
                      <button onClick={handleBulkSnooze} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                        <Clock className="size-3.5" /> Mover para o fim
                      </button>
                      <button onClick={() => setBulkRemoveConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                        <EyeOff className="size-3.5" /> Remover selecionados
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {!isLoaded || !customersLoaded ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin size-8 text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredData.map((client, index) => (
                  <RecurrenceCard
                    key={client.identifier}
                    client={client}
                    index={index}
                    selected={selectedIds.has(client.identifier)}
                    onToggleSelect={() => handleToggleSelect(client.identifier)}
                    onApproach={() => handleOpenClient(client)}
                    onMoveToEnd={() => handleMoveToEnd(client)}
                    onRemove={() => setClientToRemove(client)}
                    onReinclude={() => handleReinclude(client)}
                    onSave={(edits) => handleSaveEdits(client, edits)}
                  />
                ))}

                {filteredData.length === 0 && (
                  <div className="col-span-full text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <CheckCircle2 className="size-12 text-emerald-400 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Nenhum cliente aqui</p>
                    <p className="text-sm text-slate-500 mt-1">Troque de aba ou ajuste os filtros.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal de Abordagem */}
        <AnimatePresence>
          {selectedClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="size-5 text-primary" />
                    Abordagem Ativa
                  </h3>
                  <button onClick={() => setSelectedClientId(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="size-5 text-slate-500" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-5">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                    <p className="font-bold text-slate-800 dark:text-slate-200">{selectedClient.fantasia || selectedClient.razaoSocial}</p>
                    {selectedClient.contatoNome && <p className="text-sm text-slate-500">Contato: {selectedClient.contatoNome}</p>}
                    <p className="text-sm font-medium text-slate-500">{selectedClient.phone || 'Sem telefone cadastrado'}</p>
                  </div>

                  {!selectedClient.contatoNome && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      Sem nome do contato: a mensagem vai usar &quot;{(selectedClient.fantasia || selectedClient.razaoSocial).split(' ')[0]}&quot;. Cadastre o contato pelo lápis no card para personalizar.
                    </div>
                  )}
                  {recentlyApproached && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      Este cliente foi abordado {selectedClient.daysSinceApproach === 0 ? 'hoje' : `há ${selectedClient.daysSinceApproach} dia(s)`}. Mensagens muito próximas podem soar invasivas.
                    </div>
                  )}
                  {selectedClient.inProgress && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
                      <AlertCircle className="size-4 shrink-0" />
                      Este cliente tem um pedido em andamento.
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Escolha a Abordagem</p>
                    <select
                      value={selectedMessage}
                      onChange={(e) => setSelectedMessage(e.target.value as keyof RecurrenceMessages)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:ring-primary outline-none transition-all shadow-sm"
                    >
                      {MESSAGE_OPTIONS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-400 italic whitespace-pre-line">
                      &quot;{messageText}&quot;
                    </div>
                  </div>

                  {/* Anexo */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anexo (promoção)</p>
                    {attachment ? (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                        <FileText className="size-4 text-primary shrink-0" />
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">{attachment.name}</span>
                        <button onClick={() => setAttachment(null)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full" title="Remover anexo">
                          <X className="size-4 text-slate-500" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:border-primary hover:text-primary cursor-pointer transition-all">
                        <Paperclip className="size-4" /> Escolher PDF, PNG ou JPG
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          className="hidden"
                          onChange={e => setAttachment(e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                    {attachment && (
                      <p className="text-[11px] text-slate-500">
                        O anexo fica selecionado para os próximos clientes. Na tela de compartilhar, escolha WhatsApp ou WhatsApp Business e depois o contato.
                      </p>
                    )}
                  </div>
                </div>

                {/* Ações da Abordagem */}
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex flex-col gap-3">
                  {attachment ? (
                    <button
                      onClick={handleShareWithFile}
                      className="py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      <Share2 className="size-4" /> Enviar mensagem com anexo
                    </button>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Iniciar conversa via</p>
                      <div className="grid grid-cols-2 gap-3">
                        {(['pessoal', 'business'] as ApproachChannel[]).map(channel => (
                          <a
                            key={channel}
                            href={generateWhatsappUrl(channel)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleWhatsappClick(channel)}
                            className={`relative py-3 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-colors shadow-lg text-center ${
                              channel === 'pessoal'
                                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                            } ${selectedClient.lastChannel === channel ? 'ring-2 ring-offset-2 ring-emerald-400 dark:ring-offset-slate-900' : ''}`}
                          >
                            {selectedClient.lastChannel === channel && (
                              <span className="absolute -top-2 right-2 text-[9px] font-black uppercase bg-white text-emerald-700 px-1.5 py-0.5 rounded-md shadow">Último usado</span>
                            )}
                            <Send className="size-4" />
                            <span className="text-xs">{channel === 'pessoal' ? 'Pessoal' : 'Business'}</span>
                            <span className="text-[10px] opacity-75">{channel === 'pessoal' ? 'DDD 31' : 'DDD 11'}</span>
                          </a>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={async () => { await handleMoveToEnd(selectedClient); setSelectedClientId(null); }}
                      className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                    >
                      Mover para o fim da fila
                    </button>
                    <button
                      onClick={() => setClientToRemove(selectedClient)}
                      className="py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <EyeOff className="size-4" /> Não Notificar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal de Configuração de Frases */}
        <AnimatePresence>
          {isSettingsOpen && editingMessages && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="size-5 text-primary" />
                    Configurar Frases de Abordagem
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="size-5 text-slate-500" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                  {MESSAGE_OPTIONS.map(g => (
                    <div key={g.group}>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3">{g.group}</h4>
                      <div className="space-y-4">
                        {g.options.map(o => (
                          <div key={o.key}>
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">{o.label}</label>
                            <textarea
                              value={editingMessages[o.key]}
                              onChange={(e) => setEditingMessages({ ...editingMessages, [o.key]: e.target.value })}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm focus:ring-primary outline-none min-h-[80px] resize-y"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">Dica:</h3>
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        Use <strong className="font-bold">{'{Nome}'}</strong> para o primeiro nome do contato e <strong className="font-bold">{'{Produto}'}</strong> para os cafés do último pedido (ex: &quot;como está o estoque do {'{Produto}'}?&quot;). Escreva com chaves e a primeira letra maiúscula.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex justify-end gap-3">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="py-2.5 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                  >
                    <Save className="size-4" /> Salvar Frases
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmação de remoção */}
        <AnimatePresence>
          {clientToRemove && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setClientToRemove(null)}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
              >
                <div className="p-6">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mb-4">
                    <AlertCircle className="size-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Remover da Recorrência</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">{clientToRemove.fantasia || clientToRemove.razaoSocial}</strong> vai para a aba &quot;Fora da recorrência&quot;, mesmo que faça pedidos novos. Você pode recolocá-lo de lá quando quiser.
                  </p>
                </div>

                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex justify-end gap-3">
                  <button
                    onClick={() => setClientToRemove(null)}
                    className="py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmRemove}
                    className="py-2.5 px-6 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
                  >
                    Sim, remover
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmação de remoção em massa */}
        <AnimatePresence>
          {bulkRemoveConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setBulkRemoveConfirm(false)}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="p-6">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mb-4">
                    <EyeOff className="size-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Remover {selectedIds.size} cliente{selectedIds.size !== 1 ? 's' : ''} da Recorrência</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Eles vão para a aba &quot;Fora da recorrência&quot;, mesmo que façam pedidos novos. Você pode recolocá-los de lá quando quiser.</p>
                </div>
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 flex justify-end gap-3">
                  <button onClick={() => setBulkRemoveConfirm(false)} className="py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-all">
                    Cancelar
                  </button>
                  <button onClick={handleBulkRemove} className="py-2.5 px-6 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20">
                    Sim, remover todos
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
