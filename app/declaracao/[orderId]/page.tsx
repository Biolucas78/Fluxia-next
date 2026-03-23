'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Order } from '@/lib/types';

function DeclarationContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const format = searchParams.get('format') || 'a4'; // 'a4' or '10x15'

  useEffect(() => {
    if (order) return;
    
    // Fallback manual para o ID se o Next.js demorar a resolver params
    const pathId = window.location.pathname.split('/').pop();
    const orderId = (params?.orderId as string) || pathId;
    
    if (!orderId) {
      const timer = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(timer);
    }

    console.log("Iniciando busca do pedido:", orderId);

    const loadOrder = () => {
      try {
        // 1. Tentar ler os dados codificados na URL (Plano B - Instantâneo)
        const urlData = searchParams.get('data');
        if (urlData) {
          try {
            const decoded = JSON.parse(decodeURIComponent(atob(urlData)));
            console.log("Pedido carregado da URL!");
            setOrder(decoded);
            setLoading(false);
            setNotFound(false);
            return true;
          } catch (e) {
            console.error("Erro ao decodificar dados da URL", e);
          }
        }

        // 2. Tentar ler a chave dedicada (Plano A)
        try {
          const lastOrderJson = localStorage.getItem('last_declaration_order');
          if (lastOrderJson) {
            const lastOrder: Order = JSON.parse(lastOrderJson);
            if (String(lastOrder.id).toLowerCase() === String(orderId).toLowerCase() || 
                String(lastOrder.id).toLowerCase() === String(decodeURIComponent(orderId)).toLowerCase()) {
              console.log("Pedido carregado da chave dedicada!");
              setOrder(lastOrder);
              setLoading(false);
              setNotFound(false);
              return true;
            }
          }
        } catch (e) {
          console.error("Erro ao ler last_declaration_order", e);
        }

        // 3. Tentar ler da lista geral
        try {
          const saved = localStorage.getItem('coffee_crm_orders');
          if (saved) {
            const orders: Order[] = JSON.parse(saved);
            const found = orders.find(o => 
              String(o.id).toLowerCase() === String(orderId).toLowerCase() || 
              String(o.id).toLowerCase() === String(decodeURIComponent(orderId)).toLowerCase()
            );
            
            if (found) {
              console.log("Pedido carregado da lista geral!");
              setOrder(found);
              setLoading(false);
              setNotFound(false);
              return true;
            }
          }
        } catch (e) {
          console.error("Erro ao ler coffee_crm_orders", e);
        }
      } catch (e) {
        console.error("Erro ao carregar dados:", e);
      }
      return false;
    };

    // Tentar carregar imediatamente
    if (loadOrder()) return;

    // Se não encontrar, tentar repetidamente por 7.5 segundos
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (loadOrder() || attempts > 30) {
        clearInterval(interval);
        if (attempts > 30 && !order) {
          setLoading(false);
          setNotFound(true);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [params, order, searchParams]);

  useEffect(() => {
    if (order) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [order]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-6">
        <div className="relative">
          <div className="size-16 border-4 border-slate-100 rounded-full"></div>
          <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0"></div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-slate-800">Gerando Documento Oficial</h2>
          <p className="text-slate-500 animate-pulse">Sincronizando dados do pedido #{params?.orderId}...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-md w-full text-center space-y-8">
          <div className="size-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <svg className="size-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900">Ops! Pedido não encontrado</h2>
            <p className="text-slate-500 leading-relaxed">
              Não conseguimos recuperar as informações deste pedido. Isso pode acontecer se a aba foi aberta manualmente ou se os dados expiraram.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              Tentar Novamente
            </button>
            <button 
              onClick={() => window.close()}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
            >
              Fechar Janela
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const sender = {
    name: "CAFE FAZENDA ITAOCA",
    document: "16.795.729/0001-31",
    address: "AV. PREFEITO DILERMANDO OLIVEIRA, 876, LOJA, CENTRO, CONCEICAO DO RIO VERDE - MG, 37430-000"
  };

  const insuranceValue = parseFloat(order.insuranceValue || '50.00');
  const totalValue = insuranceValue;

  const isThermal = format === '10x15';

  // Formatar endereço do destinatário
  const recipientAddress = order.addressDetails 
    ? `${order.addressDetails.street}, ${order.addressDetails.number}${order.addressDetails.complement ? ', ' + order.addressDetails.complement : ''}, ${order.addressDetails.district}, ${order.addressDetails.city} - ${order.addressDetails.state}, ${order.addressDetails.zip}`
    : order.address;

  const totalWeight = order.boxWeight || order.products.reduce((acc, p) => {
    const w = p.weight.toLowerCase();
    const val = parseFloat(w.replace(/[^\d.]/g, '')) || 0;
    const factor = w.includes('kg') ? 1 : 0.001;
    return acc + (val * factor * p.quantity);
  }, 0);

  return (
    <div className={`bg-white text-black font-sans ${isThermal ? 'w-[100mm] p-2 text-[9px]' : 'w-[210mm] p-8 mx-auto min-h-[297mm] text-xs'} border border-slate-200`}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none; }
          @page {
            size: ${isThermal ? '100mm 150mm' : 'A4'};
            margin: 0;
          }
          .print-border { border: 1px solid black !important; }
        }
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        th, td { border: 1px solid black; padding: 4px 6px; text-align: left; }
        .section-title { font-weight: bold; background: #f0f0f0; padding: 4px 6px; border: 1px solid black; margin-top: 8px; font-size: ${isThermal ? '8px' : '11px'}; }
        .content-box { border: 1px solid black; border-top: 0; padding: 6px; }
        .label-text { font-weight: bold; text-transform: uppercase; font-size: 0.85em; color: #444; margin-right: 4px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
        .border-r { border-right: 1px solid black; }
      `}} />

      <div className="no-print mb-6 p-4 bg-slate-100 flex justify-between items-center rounded-2xl border border-slate-200 sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/80">
        <div className="flex gap-3">
          <button 
            onClick={() => {
              const sp = new URLSearchParams(window.location.search);
              sp.set('format', 'a4');
              window.location.search = sp.toString();
            }}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${format === 'a4' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Papel A4
          </button>
          <button 
            onClick={() => {
              const sp = new URLSearchParams(window.location.search);
              sp.set('format', '10x15');
              window.location.search = sp.toString();
            }}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${format === '10x15' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
            </svg>
            Térmica 10x15
          </button>
        </div>
        
        <div className="hidden lg:block text-center">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Dica: No destino da impressão, selecione &quot;Salvar como PDF&quot;</p>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => window.close()}
            className="px-5 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
          >
            Fechar
          </button>
          <button 
            onClick={() => window.print()}
            className="px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir Agora
          </button>
        </div>
      </div>

      <div className="text-center border border-black p-2 font-bold text-sm uppercase bg-slate-50">
        Declaração de Conteúdo
      </div>

      <div className="grid-2">
        <div className="border-r">
          <div className="section-title">1. REMETENTE</div>
          <div className="content-box space-y-1 min-h-[80px]">
            <p><span className="label-text">NOME:</span> {sender.name}</p>
            <p><span className="label-text">CPF/CNPJ:</span> {sender.document}</p>
            <p><span className="label-text">ENDEREÇO:</span> {sender.address}</p>
          </div>
        </div>
        <div>
          <div className="section-title">2. DESTINATÁRIO</div>
          <div className="content-box space-y-1 min-h-[80px]">
            <p><span className="label-text">NOME:</span> {order.clientName}</p>
            <p><span className="label-text">CPF/CNPJ:</span> {order.cnpj || order.cpf || 'N/A'}</p>
            <p><span className="label-text">ENDEREÇO:</span> {recipientAddress}</p>
          </div>
        </div>
      </div>

      <div className="section-title">3. IDENTIFICAÇÃO DOS BENS</div>
      <table>
        <thead>
          <tr className="bg-slate-50">
            <th className="w-10 text-center">ITEM</th>
            <th>DESCRIÇÃO DO CONTEÚDO</th>
            <th className="w-16 text-center">QTD</th>
            <th className="w-24 text-right">VALOR (R$)</th>
          </tr>
        </thead>
        <tbody>
          {order.products.map((p, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>{p.name} {p.weight} {p.grindType !== 'N/A' ? `(${p.grindType})` : ''}</td>
              <td className="text-center">{p.quantity}</td>
              <td className="text-right">{(totalValue / order.products.length).toFixed(2)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td colSpan={2} className="text-right font-bold uppercase">Totais</td>
            <td className="text-center font-bold">{order.products.reduce((acc, p) => acc + p.quantity, 0)}</td>
            <td className="text-right font-bold">R$ {totalValue.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2 border border-black p-2 flex justify-between items-center bg-slate-50/30">
        <p><span className="label-text">PESO TOTAL (KG):</span> {totalWeight.toFixed(3)}</p>
        <p><span className="label-text">VALOR SEGURADO:</span> R$ {insuranceValue.toFixed(2)}</p>
      </div>

      <div className="section-title">4. DECLARAÇÃO</div>
      <div className={`content-box ${isThermal ? 'text-[7.5px]' : 'text-[10px]'} leading-relaxed text-justify italic`}>
        Declaro que não sou contribuinte do Imposto sobre Operações Relativas à Circulação de Mercadorias e sobre Prestações de Serviços de Transporte Interestadual e Intermunicipal e de Comunicação - ICMS, por não realizar, com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria e prestações de serviços de transporte interestadual e intermunicipal e de comunicação, ainda que se iniciem no exterior, conforme o disposto no art. 4º da Lei Complementar nº 87/1996.
        <br /><br />
        Afirmo ainda que o conteúdo desta remessa não constitui objeto de comércio e que os bens declarados são de minha propriedade.
      </div>

      <div className={`${isThermal ? 'mt-6' : 'mt-16'} flex flex-col items-center gap-2`}>
        <div className={`${isThermal ? 'w-56' : 'w-80'} border-t border-black text-center pt-2 font-bold`}>
          Assinatura do Remetente
        </div>
        <p className={`${isThermal ? 'text-[9px]' : 'text-[11px]'} font-medium`}>
          Conceição do Rio Verde - MG, {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>

      <div className={`${isThermal ? 'mt-4' : 'mt-10'} p-2 border border-dashed border-black ${isThermal ? 'text-[6.5px]' : 'text-[9px]'} leading-tight italic opacity-80 bg-slate-50`}>
        <span className="font-bold">OBSERVAÇÃO:</span> Constitui crime contra a ordem tributária suprimir ou reduzir tributo, ou contribuição social e qualquer acessório, mediante as condutas de fazer declaração falsa ou omitir declaração sobre rendimentos, bens ou fatos, ou empregar outra fraude, para eximir-se, total ou parcialmente, de pagamento de tributo (Lei nº 8.137/1990, art. 1º, inciso I).
      </div>
    </div>
  );
}

export default function ContentDeclarationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <DeclarationContent />
    </Suspense>
  );
}
