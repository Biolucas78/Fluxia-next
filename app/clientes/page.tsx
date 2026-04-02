'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Login from '@/components/Login';
import { getValidBlingToken } from '@/lib/bling-client';
import { 
  User, 
  Search, 
  Plus, 
  MapPin, 
  Phone, 
  Mail, 
  Loader2, 
  X,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Save,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';

const initialCustomerState = {
  id: '',
  nome: '',
  fantasia: '',
  tipo: 'F',
  numeroDocumento: '',
  codigoRegimeTributario: '0',
  contribuinte: '9',
  ie: '',
  isentoIE: false,
  celular: '',
  email: '',
  endereco: {
    geral: {
      cep: '',
      uf: '',
      municipio: '',
      bairro: '',
      endereco: '',
      numero: '',
      complemento: ''
    }
  }
};

/**
 * Remove acentos de uma string
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [currentCustomer, setCurrentCustomer] = useState(initialCustomerState);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Order alphabetically by nome
    const q = query(collection(db, 'bling_customers'), orderBy('nome', 'asc'), limit(1000));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCustomers(docs);
      setIsLoading(false);
    }, (error) => {
      console.error('Error fetching customers:', error);
      toast.error('Erro ao carregar clientes.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const filteredCustomers = customers.filter(c => {
    const search = removeAccents(searchTerm.toLowerCase());
    return (
      removeAccents((c.nome || '').toLowerCase()).includes(search) ||
      removeAccents((c.fantasia || '').toLowerCase()).includes(search) ||
      (c.numeroDocumento || '').toLowerCase().includes(search)
    );
  });

  const handleOpenModal = (customer?: any) => {
    if (customer) {
      setCurrentCustomer({
        id: customer.id ? String(customer.id) : '',
        nome: customer.nome || '',
        fantasia: customer.fantasia || '',
        tipo: customer.tipo || 'F',
        numeroDocumento: customer.numeroDocumento || '',
        codigoRegimeTributario: String(customer.dadosAdicionais?.codigoRegimeTributario || customer.codigoRegimeTributario || '0'),
        contribuinte: String(customer.indicadorIe || customer.contribuinte || '9'),
        ie: customer.ie || '',
        isentoIE: customer.ie === 'ISENTO',
        celular: customer.telefones?.celular || customer.celular || '',
        email: customer.email || '',
        endereco: {
          geral: {
            cep: customer.endereco?.geral?.cep || customer.endereco?.cep || '',
            uf: customer.endereco?.geral?.uf || customer.endereco?.uf || '',
            municipio: customer.endereco?.geral?.municipio || customer.endereco?.municipio || '',
            bairro: customer.endereco?.geral?.bairro || customer.endereco?.bairro || '',
            endereco: customer.endereco?.geral?.endereco || customer.endereco?.endereco || '',
            numero: customer.endereco?.geral?.numero || customer.endereco?.numero || '',
            complemento: customer.endereco?.geral?.complemento || customer.endereco?.complemento || ''
          }
        }
      });
    } else {
      setCurrentCustomer(initialCustomerState);
    }
    setShowDeleteConfirm(false);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCustomer.nome) {
      toast.error('O nome é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getValidBlingToken();
      if (!token) {
        toast.error('Você precisa conectar o Bling primeiro!');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        nome: currentCustomer.nome,
        fantasia: currentCustomer.fantasia,
        tipo: currentCustomer.tipo,
        situacao: 'A',
        numeroDocumento: currentCustomer.numeroDocumento,
        ie: parseInt(currentCustomer.contribuinte) === 9 ? '' : (currentCustomer.isentoIE ? 'ISENTO' : currentCustomer.ie),
        indicadorIe: parseInt(currentCustomer.contribuinte),
        telefones: {
          celular: currentCustomer.celular
        },
        email: currentCustomer.email,
        endereco: {
          geral: currentCustomer.endereco.geral
        },
        dadosAdicionais: {
          codigoRegimeTributario: parseInt(currentCustomer.codigoRegimeTributario)
        }
      };

      const isEditing = !!currentCustomer.id;
      const url = isEditing ? `/api/bling/customers/${currentCustomer.id}` : '/api/bling/customers';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao salvar cliente no Bling');
      }

      // Atualiza localmente para feedback imediato na UI
      if (result.data && result.data.id) {
        await setDoc(doc(db, 'bling_customers', String(result.data.id)), {
          ...result.data,
          updatedAt: Date.now()
        }, { merge: true });
      }

      toast.success(`Cliente ${isEditing ? 'atualizado' : 'criado'} com sucesso no Bling!`);
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Error saving customer:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveToLocalDb = async () => {
    if (!currentCustomer.nome) {
      toast.error('O nome é obrigatório.');
      return;
    }

    setIsSubmittingLocal(true);
    try {
      const customerId = String(currentCustomer.id || `local_${Date.now()}`);
      
      const dataToSave = {
        id: customerId,
        nome: currentCustomer.nome,
        fantasia: currentCustomer.fantasia,
        tipo: currentCustomer.tipo,
        numeroDocumento: currentCustomer.numeroDocumento,
        ie: currentCustomer.isentoIE ? 'ISENTO' : currentCustomer.ie,
        indicadorIe: parseInt(currentCustomer.contribuinte),
        celular: currentCustomer.celular,
        email: currentCustomer.email,
        endereco: currentCustomer.endereco,
        codigoRegimeTributario: parseInt(currentCustomer.codigoRegimeTributario),
        updatedAt: Date.now()
      };

      await setDoc(doc(db, 'bling_customers', customerId), dataToSave, { merge: true });
      
      toast.success('Cliente salvo no banco de dados local!');
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Error saving to local DB:', error);
      toast.error(`Erro ao salvar localmente: ${error.message}`);
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const handleCepBlur = async () => {
    const cep = currentCustomer.endereco.geral.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast.error('CEP não encontrado.');
        return;
      }

      setCurrentCustomer({
        ...currentCustomer,
        endereco: {
          geral: {
            ...currentCustomer.endereco.geral,
            municipio: data.localidade,
            uf: data.uf,
            bairro: data.bairro,
            endereco: data.logradouro,
            complemento: data.complemento || currentCustomer.endereco.geral.complemento
          }
        }
      });
      toast.success('Endereço preenchido!');
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!currentCustomer.id) return;
    
    setIsDeleting(true);
    try {
      const token = await getValidBlingToken();
      if (!token) {
        toast.error('Você precisa conectar o Bling primeiro!');
        setIsDeleting(false);
        return;
      }

      const response = await fetch(`/api/bling/customers/${currentCustomer.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao excluir cliente no Bling');
      }

      // Remove localmente também para feedback imediato
      await deleteDoc(doc(db, 'bling_customers', currentCustomer.id));

      toast.success('Cliente excluído com sucesso!');
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Cadastro de Clientes (Bling)" />
        
        <div className="flex-1 overflow-hidden flex flex-col p-8">
          <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
            
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Pesquisar por nome, fantasia ou documento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none shadow-sm"
                />
              </div>
              <button 
                onClick={() => handleOpenModal()}
                className="w-full md:w-auto px-6 py-3 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                <Plus className="size-5" />
                Incluir Cadastro
              </button>
            </div>

            {/* Customers List */}
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl flex flex-col">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contato</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Localização</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <Loader2 className="size-8 animate-spin text-primary mx-auto mb-4" />
                          <p className="text-slate-500 text-sm">Carregando clientes...</p>
                        </td>
                      </tr>
                    ) : filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <User className="size-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                          <p className="text-slate-500 text-sm">Nenhum cliente encontrado.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <tr 
                          key={customer.id} 
                          onClick={() => handleOpenModal(customer)}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 dark:text-white text-sm">
                                {customer.nome}
                              </span>
                              {customer.fantasia && customer.fantasia !== customer.nome && (
                                <span className="text-[10px] text-slate-400 italic">
                                  Fantasia: {customer.fantasia}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                                customer.tipo === 'J' 
                                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                              }`}>
                                {customer.tipo === 'J' ? 'CNPJ' : 'CPF'}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                                {customer.numeroDocumento || '---'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {customer.celular && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                  <Phone className="size-3 text-slate-400" />
                                  {customer.celular}
                                </div>
                              )}
                              {customer.email && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                  <Mail className="size-3 text-slate-400" />
                                  {customer.email}
                                </div>
                              )}
                              {!customer.celular && !customer.email && (
                                <span className="text-xs text-slate-400 italic">Sem contato</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                              <MapPin className="size-3 text-slate-400" />
                              {customer.endereco?.geral?.municipio || customer.endereco?.municipio ? (
                                `${customer.endereco?.geral?.municipio || customer.endereco?.municipio} - ${customer.endereco?.geral?.uf || customer.endereco?.uf}`
                              ) : (
                                <span className="text-slate-400 italic">Não informado</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <a 
                              href={`https://www.bling.com.br/contatos.php#edit/${customer.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-primary transition-all inline-block"
                              title="Ver no Bling"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl">
                      <User className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {currentCustomer.id ? 'Detalhes do Cliente' : 'Incluir Novo Cadastro'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {currentCustomer.id ? `ID Bling: ${currentCustomer.id}` : 'Os dados serão enviados diretamente para o Bling'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentCustomer.id && (
                      <a 
                        href={`https://www.bling.com.br/contatos.php#edit/${currentCustomer.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 hover:text-primary"
                        title="Abrir no Bling"
                      >
                        <ExternalLink className="size-5" />
                      </a>
                    )}
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                      <X className="size-5 text-slate-500" />
                    </button>
                  </div>
                </div>

                <form id="customer-form" onSubmit={handleSaveCustomer} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">1. Informações Básicas</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nome / Razão Social *</label>
                        <input 
                          type="text" 
                          required
                          value={currentCustomer.nome}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, nome: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nome Fantasia</label>
                        <input 
                          type="text" 
                          value={currentCustomer.fantasia}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, fantasia: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tipo de Pessoa</label>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => setCurrentCustomer({...currentCustomer, tipo: 'F'})}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border ${currentCustomer.tipo === 'F' ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                          >
                            Física
                          </button>
                          <button 
                            type="button"
                            onClick={() => setCurrentCustomer({...currentCustomer, tipo: 'J'})}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border ${currentCustomer.tipo === 'J' ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                          >
                            Jurídica
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {currentCustomer.tipo === 'J' ? 'CNPJ' : 'CPF'}
                        </label>
                        <input 
                          type="text" 
                          value={currentCustomer.numeroDocumento}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, numeroDocumento: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Inscrição Estadual (IE)</label>
                        <div className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={currentCustomer.isentoIE ? 'ISENTO' : currentCustomer.ie}
                            disabled={currentCustomer.isentoIE}
                            onChange={(e) => setCurrentCustomer({...currentCustomer, ie: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all disabled:opacity-50"
                          />
                          {currentCustomer.tipo === 'F' && (
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer whitespace-nowrap">
                              <input 
                                type="checkbox" 
                                checked={currentCustomer.isentoIE}
                                onChange={(e) => setCurrentCustomer({
                                  ...currentCustomer, 
                                  isentoIE: e.target.checked,
                                  ie: e.target.checked ? 'ISENTO' : ''
                                })}
                                className="rounded text-primary focus:ring-primary"
                              />
                              Isento
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Código de Regime Tributário</label>
                        <select 
                          value={currentCustomer.codigoRegimeTributario}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, codigoRegimeTributario: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        >
                          <option value="0">Não definido</option>
                          <option value="1">Simples Nacional</option>
                          <option value="2">Regime normal</option>
                          <option value="3">MEI</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Contribuinte</label>
                        <select 
                          value={currentCustomer.contribuinte}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, contribuinte: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        >
                          <option value="1">1 - Contribuinte de ICMS</option>
                          <option value="2">2 - Contribuinte isento de cadastro</option>
                          <option value="9">9 - Não contribuinte</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">2. Contato</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Celular</label>
                        <input 
                          type="text" 
                          value={currentCustomer.celular}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, celular: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">E-mail para envio da Nota Fiscal</label>
                        <input 
                          type="email" 
                          value={currentCustomer.email}
                          onChange={(e) => setCurrentCustomer({...currentCustomer, email: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address Info */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">3. Endereço</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">CEP</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.cep}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, cep: e.target.value} }
                          })}
                          onBlur={handleCepBlur}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Cidade</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.municipio}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, municipio: e.target.value} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">UF</label>
                        <input 
                          type="text" 
                          maxLength={2}
                          value={currentCustomer.endereco.geral.uf}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, uf: e.target.value.toUpperCase()} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-400"
                          placeholder="EX: MG"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bairro</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.bairro}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, bairro: e.target.value} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Endereço (Logradouro)</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.endereco}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, endereco: e.target.value} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Número</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.numero}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, numero: e.target.value} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Complemento</label>
                        <input 
                          type="text" 
                          value={currentCustomer.endereco.geral.complemento}
                          onChange={(e) => setCurrentCustomer({
                            ...currentCustomer, 
                            endereco: { geral: {...currentCustomer.endereco.geral, complemento: e.target.value} }
                          })}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm focus:ring-primary focus:border-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </form>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                  <div>
                    {currentCustomer.id && (
                      !showDeleteConfirm ? (
                        <button 
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="size-4" />
                          Excluir Cliente
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">Tem certeza?</span>
                          <button 
                            type="button"
                            onClick={handleDeleteCustomer}
                            disabled={isDeleting}
                            className="px-3 py-1.5 bg-red-500 text-white rounded-lg font-bold text-xs hover:bg-red-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                            Sim, excluir
                          </button>
                          <button 
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isDeleting}
                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      )
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      onClick={handleSaveToLocalDb}
                      disabled={isSubmittingLocal || isSubmitting}
                      className="px-6 py-3 border border-primary/20 text-primary font-bold rounded-2xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmittingLocal ? <Loader2 className="size-5 animate-spin" /> : <Database className="size-5" />}
                      Salvar no Banco
                    </button>
                    <button 
                      type="submit"
                      form="customer-form"
                      disabled={isSubmitting || isSubmittingLocal}
                      className="px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
                      Salvar no Bling
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
