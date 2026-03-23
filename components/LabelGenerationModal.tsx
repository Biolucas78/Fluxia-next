'use client';

import React from 'react';
import { ShippingOption, Order } from '@/lib/types';
import { X, Printer, Loader2 } from 'lucide-react';
import { parseAddressWithGemini } from '@/lib/gemini';

interface LabelGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: ShippingOption | null;
  onGenerate: () => void;
  isGenerating: boolean;
  order: Order;
  onUpdateOrder: (order: Order) => void;
}

export default function LabelGenerationModal({ isOpen, onClose, quote, onGenerate, isGenerating, order, onUpdateOrder }: LabelGenerationModalProps) {
  const [shippingData, setShippingData] = React.useState({
    clientName: (order as any)?.clientName || '',
    address: (order as any)?.address || '',
    street: (order as any)?.addressDetails?.street || '',
    number: (order as any)?.addressDetails?.number || '',
    complement: (order as any)?.addressDetails?.complement || '',
    district: (order as any)?.addressDetails?.district || '',
    city: (order as any)?.addressDetails?.city || '',
    state: (order as any)?.addressDetails?.state || '',
    zip: (order as any)?.addressDetails?.zip || '',
    phone: (order as any)?.phone || '',
    cnpj: (order as any)?.cnpj || '',
    observations: (order as any)?.observations || '',
    insuranceValue: (order as any)?.insuranceValue || '',
    invoiceKey: (order as any)?.invoiceKey || '',
    productDescription: (order as any)?.productDescription || '',
  });

  const hasParsed = React.useRef(false);

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

  React.useEffect(() => {
    if (isOpen && !hasParsed.current && shippingData.address) {
      hasParsed.current = true;
      
      // 1. Extract CEP from address string (more robust regex)
      const cepMatch = shippingData.address.match(/\d{5}-?\d{3}/);
      const cep = cepMatch ? cepMatch[0].replace('-', '') : '';
      console.log('CEP extraído:', cep);

      Promise.all([
        cep ? fetchAddressByCep(cep) : Promise.resolve(null),
        parseAddressWithGemini(shippingData.address)
      ]).then(([cepData, aiData]) => {
        const newData = {
          ...shippingData,
          street: cepData?.street || shippingData.street,
          district: cepData?.district || shippingData.district,
          city: cepData?.city || shippingData.city,
          state: cepData?.state || shippingData.state,
          zip: cep || shippingData.zip,
          number: aiData?.number || shippingData.number,
          complement: aiData?.complement || shippingData.complement,
          phone: aiData?.phone || shippingData.phone,
          cnpj: aiData?.document || shippingData.cnpj,
        };
        setShippingData(newData);
        onUpdateOrder({
          ...order,
          phone: newData.phone,
          cnpj: newData.cnpj,
          addressDetails: {
            street: newData.street,
            number: newData.number,
            complement: newData.complement,
            district: newData.district,
            city: newData.city,
            state: newData.state,
            zip: newData.zip
          }
        });
      });
    }
  }, [isOpen, shippingData, order, onUpdateOrder]);

  if (!isOpen || !quote || !order) return null;

  const handleUpdate = (field: string, value: string) => {
    const newData = { ...shippingData, [field]: value };
    setShippingData(newData);
    onUpdateOrder({ 
      ...order, 
      clientName: newData.clientName,
      address: newData.address,
      phone: newData.phone,
      cnpj: newData.cnpj,
      observations: newData.observations,
      insuranceValue: newData.insuranceValue,
      invoiceKey: newData.invoiceKey,
      productDescription: newData.productDescription,
      addressDetails: {
        street: newData.street,
        number: newData.number,
        complement: newData.complement,
        district: newData.district,
        city: newData.city,
        state: newData.state,
        zip: newData.zip
      }
    } as any);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Gerar Etiqueta</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Transportadora</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{quote.company.name} - {quote.name}</p>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase font-bold">Nome do Destinatário</p>
              <input type="text" value={shippingData.clientName} onChange={(e) => handleUpdate('clientName', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase font-bold">Endereço de Entrega</p>
              <textarea 
                value={shippingData.address}
                onChange={(e) => handleUpdate('address', e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Telefone</p>
                <input type="text" value={shippingData.phone} onChange={(e) => handleUpdate('phone', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">CPF/CNPJ</p>
                <input type="text" value={shippingData.cnpj} onChange={(e) => handleUpdate('cnpj', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Valor Assegurado (R$)</p>
                <input type="number" step="0.01" value={shippingData.insuranceValue} onChange={(e) => handleUpdate('insuranceValue', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Chave da Nota Fiscal</p>
                <input type="text" value={shippingData.invoiceKey} onChange={(e) => handleUpdate('invoiceKey', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase font-bold">Descrição dos Produtos</p>
              <textarea 
                value={shippingData.productDescription}
                onChange={(e) => handleUpdate('productDescription', e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Rua</p>
                <input type="text" value={shippingData.street} onChange={(e) => handleUpdate('street', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Número</p>
                <input type="text" value={shippingData.number} onChange={(e) => handleUpdate('number', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Complemento</p>
                <input type="text" value={shippingData.complement} onChange={(e) => handleUpdate('complement', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Bairro</p>
                <input type="text" value={shippingData.district} onChange={(e) => handleUpdate('district', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">CEP</p>
                <input type="text" value={shippingData.zip} onChange={(e) => handleUpdate('zip', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Cidade</p>
                <input type="text" value={shippingData.city} onChange={(e) => handleUpdate('city', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase font-bold">Estado</p>
                <input type="text" value={shippingData.state} onChange={(e) => handleUpdate('state', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase font-bold">Observações</p>
              <textarea 
                value={shippingData.observations}
                onChange={(e) => handleUpdate('observations', e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-primary/20"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800">
          <button 
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="size-5 animate-spin" /> : <Printer className="size-5" />}
            {isGenerating ? 'Gerando...' : 'Gerar Etiqueta'}
          </button>
        </div>
      </div>
    </div>
  );
}
