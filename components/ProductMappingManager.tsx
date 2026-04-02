'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query } from 'firebase/firestore';
import { getValidBlingToken } from '@/lib/bling-client';
import { getFirebaseInstances } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firebase-errors';
import { Trash2, Plus, Package, Hash, Loader2 } from 'lucide-react';

interface ProductMapping {
  id: string;
  appName: string;
  blingSku: string;
}

interface BlingProduct {
  nome: string;
  codigo: string;
}

export default function ProductMappingManager() {
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [blingProducts, setBlingProducts] = useState<BlingProduct[]>([]);
  const [newMappings, setNewMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const { db } = getFirebaseInstances();
    const q = query(collection(db, 'product_mapping'));
    console.log('Setting up snapshot listener for product_mapping');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Snapshot received, docs count:', snapshot.docs.length);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductMapping[];
      setMappings(data);
    }, (error) => {
      console.error('Snapshot listener error:', error);
      handleFirestoreError(error, OperationType.LIST, 'product_mapping');
    });

    const fetchBlingProducts = async () => {
      try {
        const token = await getValidBlingToken();

        const response = await fetch('/api/bling/products', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Bling API response:', data);
        // Bling API usually returns { retornos: { produtos: [ { produto: { ... } } ] } }
        const products = data.retornos?.produtos?.map((p: any) => ({
          nome: p.produto.nome,
          codigo: p.produto.codigo
        })).filter((p: BlingProduct) => p.codigo) || [];
        console.log('Processed products:', products);
        setBlingProducts(products);
      } catch (error) {
        console.error('Error fetching Bling products:', error);
      } finally {
        setFetching(false);
      }
    };
    fetchBlingProducts();

    return () => unsubscribe();
  }, []);

  const handleAdd = async (blingSku: string) => {
    const appName = newMappings[blingSku];
    if (!appName) return;
    setLoading(true);
    try {
      const { db } = getFirebaseInstances();
      await addDoc(collection(db, 'product_mapping'), { appName, blingSku });
      setNewMappings(prev => ({ ...prev, [blingSku]: '' }));
    } catch (error) {
      console.error('Error adding mapping:', error);
      handleFirestoreError(error, OperationType.CREATE, 'product_mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { db } = getFirebaseInstances();
      await deleteDoc(doc(db, 'product_mapping', id));
    } catch (error) {
      console.error('Error deleting mapping:', error);
      handleFirestoreError(error, OperationType.DELETE, `product_mapping/${id}`);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mt-8">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Mapeamento de Produtos</h3>
      
      <div className="mb-8">
        <h4 className="text-sm font-bold text-slate-500 mb-4">Produtos Bling (SKU)</h4>
        {fetching ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin size-4" /> Carregando...</div>
        ) : (
          <div className="space-y-2">
            {blingProducts.map((p) => (
              <div key={p.codigo} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="flex-1 text-sm font-mono text-primary">{p.codigo}</span>
                <span className="flex-[2] text-sm text-slate-700 dark:text-slate-300">{p.nome}</span>
                <input
                  type="text"
                  placeholder="Nome no App"
                  value={newMappings[p.codigo] || ''}
                  onChange={(e) => setNewMappings(prev => ({ ...prev, [p.codigo]: e.target.value }))}
                  className="flex-[2] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                />
                <button 
                  onClick={() => handleAdd(p.codigo)}
                  disabled={loading || !newMappings[p.codigo]}
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-500 mb-4">Mapeamentos Atuais</h4>
        <div className="space-y-2">
          {mappings.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Package className="size-4 text-slate-400" /> {m.appName}
                </span>
                <span className="text-slate-400">→</span>
                <span className="flex items-center gap-2 font-mono text-primary">
                  <Hash className="size-4" /> {m.blingSku}
                </span>
              </div>
              <button 
                onClick={() => handleDelete(m.id)}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
