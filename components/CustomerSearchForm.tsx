'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, User, MapPin, Phone, Mail, Database, UserPlus, CheckCircle2, Loader2, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface CustomerSearchFormProps {
  initialData: {
    clientName: string;
    cnpj?: string;
    cpf?: string;
    phone?: string;
    email?: string;
    address?: string;
    addressDetails?: any;
  };
  onConfirm: (customerData: any) => void;
}

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

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function CustomerSearchForm({ initialData, onConfirm }: CustomerSearchFormProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialData.clientName || '');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const autoSearchDone = useRef<string | null>(null);
  const [isSearching, setIsSearching] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<any>(initialCustomerState);

  // Fetch all customers once
  useEffect(() => {
    const q = query(collection(db, 'bling_customers'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          ...docData,
          id: String(docData.id || doc.id)
        };
      });
      setCustomers(data);
      setIsSearching(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter logic
  const filteredCustomers = customers.filter(c => {
    const search = removeAccents(searchTerm.toLowerCase());
    if (!search) return false;
    return (
      removeAccents((c.nome || '').toLowerCase()).includes(search) ||
      removeAccents((c.fantasia || '').toLowerCase()).includes(search) ||
      (c.numeroDocumento || '').toLowerCase().includes(search)
    );
  });

  const handleSelectCustomer = useCallback((customer: any) => {
    const mapped = {
      id: customer.id || '',
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
    };
    setCurrentCustomer(mapped);
    setSelectedCustomer(customer);
    setShowResults(false);
    onConfirm(mapped);
  }, [onConfirm]);

  const handleNewCustomer = useCallback(() => {
    const mapped = {
      ...initialCustomerState,
      nome: initialData.clientName || '',
      numeroDocumento: initialData.cnpj || initialData.cpf || '',
      tipo: initialData.cnpj ? 'J' : 'F',
      celular: initialData.phone || '',
      email: initialData.email || '',
      endereco: {
        geral: {
          ...initialCustomerState.endereco.geral,
          cep: initialData.addressDetails?.zip || '',
          uf: initialData.addressDetails?.state || '',
          municipio: initialData.addressDetails?.city || '',
          bairro: initialData.addressDetails?.district || '',
          endereco: initialData.addressDetails?.street || initialData.address || '',
          numero: initialData.addressDetails?.number || '',
          complemento: initialData.addressDetails?.complement || ''
        }
      }
    };
    setCurrentCustomer(mapped);
    setSelectedCustomer({ id: 'new' });
    setShowResults(false);
    onConfirm(mapped);
  }, [initialData, onConfirm]);

  // Auto-search logic
  useEffect(() => {
    if (!isSearching && customers.length > 0 && initialData.clientName && autoSearchDone.current !== initialData.clientName) {
      autoSearchDone.current = initialData.clientName;
      
      const search = removeAccents(initialData.clientName.toLowerCase());
      const matches = customers.filter(c => 
        removeAccents((c.nome || '').toLowerCase()).includes(search) ||
        removeAccents((c.fantasia || '').toLowerCase()).includes(search)
      );

      if (matches.length === 1) {
        setTimeout(() => handleSelectCustomer(matches[0]), 0);
      } else if (matches.length > 1) {
        setTimeout(() => setShowResults(true), 0);
      } else {
        // No match, pre-fill with AI data
        setTimeout(() => handleNewCustomer(), 0);
      }
    }
  }, [isSearching, customers, initialData.clientName, handleSelectCustomer, handleNewCustomer]);

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

      const updated = {
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
      };
      setCurrentCustomer(updated);
      onConfirm(updated);
      toast.success('Endereço preenchido!');
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
    }
  };

  const updateField = (field: string, value: any) => {
    const updated = { ...currentCustomer, [field]: value };
    setCurrentCustomer(updated);
    onConfirm(updated);
  };

  const updateAddressField = (field: string, value: any) => {
    const updated = {
      ...currentCustomer,
      endereco: {
        geral: { ...currentCustomer.endereco.geral, [field]: value }
      }
    };
    setCurrentCustomer(updated);
    onConfirm(updated);
  };

  if (isSearching) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Pesquisar cliente na base..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowResults(true);
          }}
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
        
        {showResults && filteredCustomers.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c)}
                className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between border-b border-slate-50 dark:border-slate-700 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{c.nome}</span>
                  <span className="text-[10px] text-slate-400">{c.numeroDocumento || 'Sem documento'}</span>
                </div>
                <Database className="size-3 text-emerald-500" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Identical Form to Clientes Page */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedCustomer?.id === 'new' ? (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                <UserPlus className="size-3" />
                Novo Cliente
              </span>
            ) : selectedCustomer ? (
              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                <Database className="size-3" />
                Cliente na Base
              </span>
            ) : null}
          </div>
          <button 
            onClick={handleNewCustomer}
            className="text-[10px] font-bold text-primary hover:underline"
          >
            Limpar e criar novo
          </button>
        </div>

        {/* Form Sections */}
        <div className="space-y-6">
          {/* 1. Informações Básicas */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-2">1. Informações Básicas</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Nome / Razão Social *</label>
                <input 
                  type="text" 
                  value={currentCustomer.nome}
                  onChange={(e) => updateField('nome', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Nome Fantasia</label>
                <input 
                  type="text" 
                  value={currentCustomer.fantasia}
                  onChange={(e) => updateField('fantasia', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Tipo de Pessoa</label>
                <div className="flex gap-1">
                  <button 
                    type="button"
                    onClick={() => updateField('tipo', 'F')}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${currentCustomer.tipo === 'F' ? 'bg-primary border-primary text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    Física
                  </button>
                  <button 
                    type="button"
                    onClick={() => updateField('tipo', 'J')}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${currentCustomer.tipo === 'J' ? 'bg-primary border-primary text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    Jurídica
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {currentCustomer.tipo === 'J' ? 'CNPJ' : 'CPF'}
                </label>
                <input 
                  type="text" 
                  value={currentCustomer.numeroDocumento}
                  onChange={(e) => updateField('numeroDocumento', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Inscrição Estadual (IE)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    value={currentCustomer.isentoIE ? 'ISENTO' : currentCustomer.ie}
                    disabled={currentCustomer.isentoIE}
                    onChange={(e) => updateField('ie', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {currentCustomer.tipo === 'F' && (
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer whitespace-nowrap">
                      <input 
                        type="checkbox" 
                        checked={currentCustomer.isentoIE}
                        onChange={(e) => {
                          const updated = {
                            ...currentCustomer,
                            isentoIE: e.target.checked,
                            ie: e.target.checked ? 'ISENTO' : ''
                          };
                          setCurrentCustomer(updated);
                          onConfirm(updated);
                        }}
                        className="rounded text-primary focus:ring-primary size-3"
                      />
                      Isento
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Contato */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-2">2. Contato</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Celular</label>
                <input 
                  type="text" 
                  value={currentCustomer.celular}
                  onChange={(e) => updateField('celular', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">E-mail</label>
                <input 
                  type="email" 
                  value={currentCustomer.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* 3. Endereço */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-2">3. Endereço</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">CEP</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.cep}
                  onChange={(e) => updateAddressField('cep', e.target.value)}
                  onBlur={handleCepBlur}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Cidade</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.municipio}
                  onChange={(e) => updateAddressField('municipio', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">UF</label>
                <input 
                  type="text" 
                  maxLength={2}
                  value={currentCustomer.endereco.geral.uf}
                  onChange={(e) => updateAddressField('uf', e.target.value.toUpperCase())}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                  placeholder="EX: MG"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Bairro</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.bairro}
                  onChange={(e) => updateAddressField('bairro', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Logradouro</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.endereco}
                  onChange={(e) => updateAddressField('endereco', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Número</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.numero}
                  onChange={(e) => updateAddressField('numero', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Complemento</label>
                <input 
                  type="text" 
                  value={currentCustomer.endereco.geral.complemento}
                  onChange={(e) => updateAddressField('complemento', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
