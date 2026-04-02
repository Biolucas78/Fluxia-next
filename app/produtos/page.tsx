'use client';

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  RefreshCw, 
  Edit2, 
  Trash2, 
  Check, 
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Login from '@/components/Login';
import { toast } from 'react-hot-toast';

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getValidBlingToken } from '@/lib/bling-client';

interface ProductMapping {
  id: string;
  appName: string;
  appWeight: string;
  appGrind: string;
  blingId?: number;
  blingSku: string;
  blingName?: string;
}

interface BlingProduct {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  unidade: string;
}

export default function ProdutosPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [blingProducts, setBlingProducts] = useState<BlingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [blingLoading, setBlingLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'appName' | 'appWeight', direction: 'asc' | 'desc' } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ProductMapping | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    appName: '',
    appWeight: '',
    appGrind: 'moído',
    blingSku: '',
    blingId: undefined as number | undefined,
    blingName: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'product_mapping'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductMapping[];
      setMappings(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching mappings:", error);
      toast.error("Erro ao carregar mapeamentos");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const fetchBlingProducts = async () => {
    setBlingLoading(true);
    try {
      const token = await getValidBlingToken();
      const response = await fetch('/api/bling/products', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch Bling products');
      const data = await response.json();
      setBlingProducts(data.data || []);
    } catch (error) {
      console.error("Error fetching Bling products:", error);
      toast.error("Erro ao buscar produtos do Bling");
    } finally {
      setBlingLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBlingProducts();
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.appName || !formData.blingSku) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    try {
      if (editingMapping) {
        await updateDoc(doc(db, 'product_mapping', editingMapping.id), formData);
        toast.success("Mapeamento atualizado");
      } else {
        await addDoc(collection(db, 'product_mapping'), formData);
        toast.success("Mapeamento criado");
      }
      setIsModalOpen(false);
      setEditingMapping(null);
      setFormData({
        appName: '',
        appWeight: '',
        appGrind: 'moído',
        blingSku: '',
        blingId: undefined,
        blingName: ''
      });
    } catch (error) {
      console.error("Error saving mapping:", error);
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleDelete = async (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Tem certeza que deseja excluir este mapeamento?</p>
        <div className="flex gap-2 justify-end">
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            Cancelar
          </button>
          <button 
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteDoc(doc(db, 'product_mapping', id));
                toast.success("Mapeamento excluído");
              } catch (error) {
                console.error("Error deleting mapping:", error);
                toast.error("Erro ao excluir mapeamento");
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
          >
            Excluir
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleAutoAssociate = async () => {
    if (blingProducts.length === 0) {
      toast.error("Nenhum produto do Bling carregado");
      return;
    }

    setBlingLoading(true);
    let associatedCount = 0;

    // Common names and weights from parser.ts
    const names = ['Catuaí', 'Bourbon', 'Yellow', 'Gourmet', 'DripCoffee', 'Especial'];
    const weights = ['250g', '500g', '1kg'];
    const grinds = ['moído', 'grãos'];

    try {
      for (const name of names) {
        for (const weight of weights) {
          for (const grind of grinds) {
            // Check if already mapped
            const exists = mappings.find(m => 
              m.appName === name && 
              m.appWeight === weight && 
              m.appGrind === grind
            );
            if (exists) continue;

            // Try to find in Bling
            const match = blingProducts.find(p => {
              const pName = p.nome.toLowerCase();
              return pName.includes(name.toLowerCase()) && 
                     pName.includes(weight.toLowerCase()) &&
                     (grind === 'grãos' ? pName.includes('grão') || pName.includes('grao') : pName.includes('moído') || pName.includes('moido'));
            });

            if (match) {
              await addDoc(collection(db, 'product_mapping'), {
                appName: name,
                appWeight: weight,
                appGrind: grind,
                blingId: match.id,
                blingSku: match.codigo,
                blingName: match.nome
              });
              associatedCount++;
            }
          }
        }
      }
      toast.success(`${associatedCount} produtos associados automaticamente`);
    } catch (error) {
      console.error("Error auto-associating:", error);
      toast.error("Erro na associação automática");
    } finally {
      setBlingLoading(false);
    }
  };

  const filteredMappings = mappings.filter(m => 
    m.appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.blingSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.blingName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedMappings = [...filteredMappings].sort((a, b) => {
    if (!sortConfig) return 0;
    
    if (sortConfig.key === 'appName') {
      return sortConfig.direction === 'asc' 
        ? a.appName.localeCompare(b.appName)
        : b.appName.localeCompare(a.appName);
    }
    
    if (sortConfig.key === 'appWeight') {
      // Extract numeric value for weight sorting
      const weightA = parseFloat(a.appWeight) * (a.appWeight.toLowerCase().includes('kg') ? 1000 : 1);
      const weightB = parseFloat(b.appWeight) * (b.appWeight.toLowerCase().includes('kg') ? 1000 : 1);
      
      return sortConfig.direction === 'asc' 
        ? weightA - weightB
        : weightB - weightA;
    }
    
    return 0;
  });

  const handleSort = (key: 'appName' | 'appWeight') => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null; // Reset sort
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Catálogo de Produtos" />
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <Package className="size-8 text-primary" />
                  Catálogo de Produtos
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Gerencie a associação entre produtos do WhatsApp e o Bling
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAutoAssociate}
                  disabled={blingLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 ${blingLoading ? 'animate-spin' : ''}`} />
                  Associação Automática
                </button>
                <button
                  onClick={() => {
                    setEditingMapping(null);
                    setFormData({
                      appName: '',
                      appWeight: '',
                      appGrind: 'moído',
                      blingSku: '',
                      blingId: undefined,
                      blingName: ''
                    });
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  <Plus className="size-4" />
                  Novo Produto
                </button>
              </div>
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome do app, SKU ou nome no Bling..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Package className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Mapeado</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{mappings.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Products List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-bottom border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        onClick={() => handleSort('appName')}
                      >
                        <div className="flex items-center gap-2">
                          Produto App
                          {sortConfig?.key === 'appName' && (
                            <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        onClick={() => handleSort('appWeight')}
                      >
                        <div className="flex items-center gap-2">
                          Peso / Moagem
                          {sortConfig?.key === 'appWeight' && (
                            <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Associação Bling</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center">
                          <Loader2 className="size-8 animate-spin text-primary mx-auto" />
                          <p className="text-slate-500 mt-2">Carregando catálogo...</p>
                        </td>
                      </tr>
                    ) : sortedMappings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center">
                          <div className="size-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Package className="size-8 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium">Nenhum produto encontrado</p>
                          <p className="text-sm text-slate-400">Tente ajustar sua busca ou crie um novo mapeamento.</p>
                        </td>
                      </tr>
                    ) : (
                      sortedMappings.map((mapping) => (
                        <tr key={mapping.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900 dark:text-white">{mapping.appName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{mapping.appWeight}</span>
                              <span className="text-xs text-slate-500 capitalize">{mapping.appGrind}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                <Package className="size-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  {mapping.blingSku}
                                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] rounded border border-slate-200 dark:border-slate-700">SKU</span>
                                </div>
                                <div className="text-xs text-slate-500 truncate max-w-[200px]">{mapping.blingName || 'Sem nome no Bling'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingMapping(mapping);
                                  setFormData({
                                    appName: mapping.appName,
                                    appWeight: mapping.appWeight,
                                    appGrind: mapping.appGrind,
                                    blingSku: mapping.blingSku,
                                    blingId: mapping.blingId,
                                    blingName: mapping.blingName || ''
                                  });
                                  setIsModalOpen(true);
                                }}
                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Edit2 className="size-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(mapping.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                title="Excluir"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal */}
            <AnimatePresence>
              {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsModalOpen(false)}
                    className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
                  >
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {editingMapping ? <Edit2 className="size-5 text-primary" /> : <Plus className="size-5 text-primary" />}
                        {editingMapping ? 'Editar Mapeamento' : 'Novo Mapeamento'}
                      </h2>
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
                      >
                        <X className="size-5" />
                      </button>
                    </div>

                    <form onSubmit={handleSave} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome no App</label>
                          <input
                            required
                            type="text"
                            value={formData.appName}
                            onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                            placeholder="Ex: Catuaí"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Peso</label>
                          <input
                            required
                            type="text"
                            value={formData.appWeight}
                            onChange={(e) => setFormData({ ...formData, appWeight: e.target.value })}
                            placeholder="Ex: 500g"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de Moagem</label>
                        <select
                          value={formData.appGrind}
                          onChange={(e) => setFormData({ ...formData, appGrind: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        >
                          <option value="moído">Moído</option>
                          <option value="grãos">Grãos</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>

                      <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Produto Bling (SKU)</label>
                        <div className="relative">
                          <input
                            required
                            type="text"
                            value={formData.blingSku}
                            onChange={(e) => {
                              const sku = e.target.value;
                              const product = blingProducts.find(p => p.codigo === sku);
                              setFormData({ 
                                ...formData, 
                                blingSku: sku,
                                blingId: product?.id,
                                blingName: product?.nome || ''
                              });
                            }}
                            placeholder="Busque pelo SKU do Bling"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            list="bling-products-list"
                          />
                          <datalist id="bling-products-list">
                            {blingProducts.map(p => (
                              <option key={p.id} value={p.codigo}>{p.nome}</option>
                            ))}
                          </datalist>
                        </div>
                        {formData.blingName && (
                          <p className="text-xs text-primary font-medium flex items-center gap-1">
                            <Check className="size-3" />
                            {formData.blingName}
                          </p>
                        )}
                      </div>

                      <div className="pt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(false)}
                          className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="flex-1 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                          {editingMapping ? 'Salvar Alterações' : 'Criar Mapeamento'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
