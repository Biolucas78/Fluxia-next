'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Order } from '@/lib/types';
import { X, Truck, Package, MapPin, User, FileText, Loader2, Database, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ShippingDataReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onConfirm: (updatedOrder: Order) => void;
}

export default function ShippingDataReviewModal({
  isOpen,
  onClose,
  order,
  onConfirm
}: ShippingDataReviewModalProps) {

  const calculateDefaultWeight = () => {
    if (order.boxWeight) return order.boxWeight;
    return order.products.reduce((acc, p) => {
      const w = parseFloat(p.weight) || 0;
      if (p.weight.toLowerCase().includes('kg')) return acc + w * 1000 * p.quantity;
      return acc + w * p.quantity;
    }, 0);
  };

  const getSuggestedBox = () => {
    const totalUnits = order.products.reduce((acc, p) => {
      const name = p.name.toLowerCase();
      const weight = p.weight.toLowerCase();
      let units = 1;
      if (weight.includes('120g')) units = 0.5;
      else if (weight.includes('500g')) units = 1.5;
      else if (weight.includes('1kg') || weight.includes('1000g')) units = 3.5;
      else if (name.includes('drip')) units = 0.6;
      return acc + (units * p.quantity);
    }, 0);
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
  };

  const suggestedBox = getSuggestedBox();

  const [formData, setFormData] = useState({
    // Dados do cliente cadastrado (para cobrança/vínculo)
    clientName: order.clientName || '',
    cnpj: order.cnpj || order.cpf || '',
    phone: order.phone || '',
    // Dados do destinatário na etiqueta (pode ser outra pessoa)
    recipientName: (order as any).recipientName || order.tradeName || order.clientName || '',
    recipientDocument: (order as any).recipientDocument || order.cnpj || order.cpf || '',
    // Endereço
    address: order.address || '',
    zip: order.addressDetails?.zip || '',
    street: order.addressDetails?.street || '',
    number: order.addressDetails?.number || (order as any).number || '',
    complement: order.addressDetails?.complement || (order as any).complement || '',
    district: order.addressDetails?.district || '',
    city: order.addressDetails?.city || '',
    state: order.addressDetails?.state || '',
    // Carga
    weight: calculateDefaultWeight(),
    width: order.boxDimensions?.width || suggestedBox.w,
    height: order.boxDimensions?.height || suggestedBox.h,
    length: order.boxDimensions?.length || suggestedBox.l,
    // Documentação
    insuranceValue: order.insuranceValue || (order.invoiceValue ? String(order.invoiceValue) : ''),
    invoiceKey: order.invoiceKey || '',
    invoiceNumber: order.invoiceNumber || '',
    productDescription: order.productDescription || 'Café Torrado',
  });

  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [isSavingToBank, setIsSavingToBank] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const hasParsed = useRef(false);

  // Busca CEP via ViaCEP
  const fetchAddressByCep = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setIsFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          district: data.bairro || prev.district,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
        toast.success('Endereço preenchido pelo CEP!');
      } else {
        toast.error('CEP não encontrado.');
      }
    } catch (e) {
      console.error('Erro CEP:', e);
    } finally {
      setIsFetchingCep(false);
    }
  }, []);

  // Parse inicial do endereço (só ViaCEP — sem Gemini para melhor performance)
  useEffect(() => {
    const parseAddress = async () => {
      if (!isOpen || hasParsed.current) return;
      if (formData.street && formData.city) { hasParsed.current = true; return; }
      const cepMatch = formData.address.match(/\d{5}-?\d{3}/);
      if (!cepMatch) { hasParsed.current = true; return; }
      hasParsed.current = true;
      setIsParsing(true);
      try {
        await fetchAddressByCep(cepMatch[0]);
      } finally {
        setIsParsing(false);
      }
    };
    parseAddress();
  }, [isOpen]);

  // Salvar no banco de clientes
  const handleSaveToBank = async () => {
    if (!formData.clientName) { toast.error('Nome do cliente é obrigatório.'); return; }
    setIsSavingToBank(true);
    try {
      const res = await fetch('/api/clientes/atualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (order as any).clientId || undefined,
          clientData: {
            nome: formData.clientName,
            celular: formData.phone,
            numeroDocumento: formData.cnpj.replace(/\D/g, ''),
            endereco: {
              geral: {
                cep: formData.zip,
                uf: formData.state,
                municipio: formData.city,
                bairro: formData.district,
                endereco: formData.street,
                numero: formData.number,
                complemento: formData.complement,
              }
            }
          },
          propagate: false,
        }),
      });
      const data = await res.json();
      if (data.ok) toast.success('Dados salvos no banco!');
      else toast.error(data.error || 'Erro ao salvar.');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setIsSavingToBank(false);
    }
  };

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleCepBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    fetchAddressByCep(e.target.value);
  };

  const handleConfirm = () => {
    const updatedOrder: Order = {
      ...order,
      clientName: formData.clientName,
      cnpj: formData.cnpj,
      phone: formData.phone,
      address: formData.address,
      addressDetails: {
        zip: formData.zip,
        street: formData.street,
        number: formData.number,
        complement: formData.complement,
        district: formData.district,
        city: formData.city,
        state: formData.state,
      },
      boxWeight: formData.weight,
      boxDimensions: {
        width: formData.width,
        height: formData.height,
        length: formData.length,
      },
      insuranceValue: formData.insuranceValue,
      invoiceKey: formData.invoiceKey,
      invoiceNumber: formData.invoiceNumber,
      productDescription: formData.productDescription,
      // Campos do destinatário na etiqueta
      ...(formData.recipientName !== formData.clientName || formData.recipientDocument !== formData.cnpj ? {
        recipientName: formData.recipientName,
        recipientDocument: formData.recipientDocument,
      } : {}),
    } as Order;
    onConfirm(updatedOrder);
  };

  const inputCls = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all";
  const labelCls = "text-[10px] font-bold text-slate-500 uppercase ml-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revisar Dados de Envio</h3>
            {(isParsing || isFetchingCep) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                <Loader2 className="size-3 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Buscando...</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-6">

          {/* Cliente cadastrado */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User className="size-4 text-slate-400" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cliente Cadastrado</h4>
              </div>
              <button
                onClick={handleSaveToBank}
                disabled={isSavingToBank}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded-lg transition-all disabled:opacity-50"
              >
                {isSavingToBank ? <Loader2 className="size-3 animate-spin" /> : <Database className="size-3" />}
                Salvar no Banco
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1 md:col-span-2">
                <label className={labelCls}>Nome do Cliente</label>
                <input name="clientName" value={formData.clientName} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>CPF/CNPJ</label>
                <input name="cnpj" value={formData.cnpj} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Telefone</label>
                <input name="phone" value={formData.phone} onChange={handleChange} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Destinatário na etiqueta */}
          <section className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="size-4 text-amber-500" />
              <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Destinatário na Etiqueta</h4>
              <span className="text-[9px] text-amber-500 font-medium">(pode ser diferente do cliente)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Nome na Etiqueta</label>
                <input name="recipientName" value={formData.recipientName} onChange={handleChange} className={inputCls} placeholder="Nome fantasia ou pessoa que vai receber" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>CPF/CNPJ do Destinatário</label>
                <input name="recipientDocument" value={formData.recipientDocument} onChange={handleChange} className={inputCls} placeholder="CPF ou CNPJ de quem recebe" />
              </div>
            </div>
          </section>

          {/* Endereço */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="size-4 text-slate-400" />
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço de Entrega</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* CEP com busca */}
              <div className="space-y-1">
                <label className={labelCls}>CEP</label>
                <div className="relative">
                  <input
                    name="zip"
                    value={formData.zip}
                    onChange={handleChange}
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                    className={inputCls + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => fetchAddressByCep(formData.zip)}
                    disabled={isFetchingCep}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary transition-colors"
                    title="Buscar CEP"
                  >
                    {isFetchingCep ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className={labelCls}>Rua / Logradouro</label>
                <input name="street" value={formData.street} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Número</label>
                <input name="number" value={formData.number} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Complemento</label>
                <input name="complement" value={formData.complement} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Bairro</label>
                <input name="district" value={formData.district} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className={labelCls}>Cidade</label>
                <input name="city" value={formData.city} onChange={handleChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Estado (UF)</label>
                <input name="state" value={formData.state} onChange={handleChange} className={inputCls} maxLength={2} />
              </div>
            </div>
          </section>

          {/* Carga */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package className="size-4 text-slate-400" />
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Carga e Dimensões</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Peso (g)</label>
                <input type="number" name="weight" value={formData.weight} onChange={handleNumberChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Altura (cm)</label>
                <input type="number" name="height" value={formData.height} onChange={handleNumberChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Largura (cm)</label>
                <input type="number" name="width" value={formData.width} onChange={handleNumberChange} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Comprimento (cm)</label>
                <input type="number" name="length" value={formData.length} onChange={handleNumberChange} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Documentação */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="size-4 text-slate-400" />
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Documentação e Seguro</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Chave da NF-e</label>
                <input name="invoiceKey" value={formData.invoiceKey} onChange={handleChange} placeholder="44 dígitos" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Número da NF-e</label>
                <input name="invoiceNumber" value={formData.invoiceNumber} onChange={handleChange} placeholder="Ex: 1234" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Valor Segurado (R$)</label>
                <input name="insuranceValue" value={formData.insuranceValue} onChange={handleChange} placeholder="Ex: 150.00" className={inputCls} />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <label className={labelCls}>Descrição do Conteúdo</label>
              <textarea name="productDescription" value={formData.productDescription} onChange={handleChange} rows={2} className={inputCls + ' resize-none'} />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm">
            Cancelar
          </button>
          <button onClick={handleConfirm} className="flex-[2] py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-sm">
            <Truck className="size-4" />
            Confirmar e Buscar Frete
          </button>
        </div>
      </div>
    </div>
  );
}
