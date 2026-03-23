'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Order } from '@/lib/types';
import { X, Save, Truck, Package, MapPin, User, FileText, Hash, Loader2 } from 'lucide-react';
import { parseAddressWithGemini } from '@/lib/gemini';

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
    
    const totalWeightG = order.products.reduce((acc, p) => {
      const w = parseFloat(p.weight);
      if (p.weight.toLowerCase().includes('kg')) return acc + w * 1000 * p.quantity;
      return acc + w * p.quantity;
    }, 0);
    
    return totalWeightG / 1000; // Convert to kg for the form
  };

  const [formData, setFormData] = useState({
    clientName: order.clientName || '',
    cnpj: order.cnpj || order.cpf || '',
    phone: order.phone || '',
    address: order.address || '',
    zip: order.addressDetails?.zip || '',
    street: order.addressDetails?.street || '',
    number: order.addressDetails?.number || order.number || '',
    complement: order.addressDetails?.complement || order.complement || '',
    district: order.addressDetails?.district || '',
    city: order.addressDetails?.city || '',
    state: order.addressDetails?.state || '',
    weight: calculateDefaultWeight(),
    width: order.boxDimensions?.width || 15,
    height: order.boxDimensions?.height || 15,
    length: order.boxDimensions?.length || 15,
    insuranceValue: order.insuranceValue || '',
    invoiceKey: order.invoiceKey || '',
    productDescription: order.productDescription || '',
  });

  const [isParsing, setIsParsing] = useState(false);
  const hasParsed = useRef(false);

  const fetchAddressByCep = async (cep: string) => {
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.erro) {
        return {
          street: data.logradouro,
          district: data.bairro,
          city: data.localidade,
          state: data.uf,
        };
      }
    } catch (e) {
      console.error('Erro ao buscar CEP:', e);
    }
    return null;
  };

  useEffect(() => {
    const parseAddress = async () => {
      if (isOpen && !hasParsed.current && formData.address) {
        // Only parse if we don't have street or city yet
        if (formData.street && formData.city) {
          hasParsed.current = true;
          return;
        }

        setIsParsing(true);
        hasParsed.current = true;

        try {
          // 1. Extract CEP from address string
          const cepMatch = formData.address.match(/\d{5}-?\d{3}/);
          const cep = cepMatch ? cepMatch[0].replace('-', '') : '';
          
          const [cepData, aiData] = await Promise.all([
            cep ? fetchAddressByCep(cep) : Promise.resolve(null),
            parseAddressWithGemini(formData.address)
          ]);

          setFormData(prev => ({
            ...prev,
            street: cepData?.street || prev.street,
            district: cepData?.district || prev.district,
            city: cepData?.city || prev.city,
            state: cepData?.state || prev.state,
            zip: cep || prev.zip,
            number: aiData?.number || prev.number,
            complement: aiData?.complement || prev.complement,
            phone: aiData?.phone || prev.phone,
            cnpj: aiData?.cnpj || aiData?.cpf || prev.cnpj,
          }));
        } catch (error) {
          console.error('Error parsing address:', error);
        } finally {
          setIsParsing(false);
        }
      }
    };

    parseAddress();
  }, [isOpen, formData.address, formData.street, formData.city]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
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
      productDescription: formData.productDescription,
    };
    onConfirm(updatedOrder);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revisar Dados de Envio</h3>
            {isParsing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full animate-pulse">
                <Loader2 className="size-3 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Preenchendo automaticamente...</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="size-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="space-y-8">
            {/* Destinatário */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <User className="size-4 text-slate-400" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Destinatário</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
                  <input 
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">CPF/CNPJ</label>
                  <input 
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Telefone</label>
                  <input 
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
            </section>

            {/* Endereço */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="size-4 text-slate-400" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Rua / Logradouro</label>
                  <input 
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Número</label>
                  <input 
                    name="number"
                    value={formData.number}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Complemento</label>
                  <input 
                    name="complement"
                    value={formData.complement}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Bairro</label>
                  <input 
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">CEP</label>
                  <input 
                    name="zip"
                    value={formData.zip}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Cidade</label>
                  <input 
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Estado (UF)</label>
                  <input 
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    maxLength={2}
                  />
                </div>
              </div>
            </section>

            {/* Carga */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Package className="size-4 text-slate-400" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Carga e Dimensões</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Peso (kg)</label>
                  <input 
                    type="number"
                    step="0.1"
                    name="weight"
                    value={formData.weight}
                    onChange={handleNumberChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Altura (cm)</label>
                  <input 
                    type="number"
                    name="height"
                    value={formData.height}
                    onChange={handleNumberChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Largura (cm)</label>
                  <input 
                    type="number"
                    name="width"
                    value={formData.width}
                    onChange={handleNumberChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Comprimento (cm)</label>
                  <input 
                    type="number"
                    name="length"
                    value={formData.length}
                    onChange={handleNumberChange}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
            </section>

            {/* Documentação */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="size-4 text-slate-400" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Documentação e Seguro</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Chave da NF-e</label>
                  <input 
                    name="invoiceKey"
                    value={formData.invoiceKey}
                    onChange={handleChange}
                    placeholder="44 dígitos da chave da nota fiscal"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Valor Segurado (R$)</label>
                  <input 
                    name="insuranceValue"
                    value={formData.insuranceValue}
                    onChange={handleChange}
                    placeholder="Ex: 150.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Descrição do Conteúdo</label>
                  <textarea 
                    name="productDescription"
                    value={formData.productDescription}
                    onChange={handleChange}
                    rows={2}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirm}
            className="flex-[2] py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Truck className="size-5" />
            Confirmar e Buscar Frete
          </button>
        </div>
      </div>
    </div>
  );
}
