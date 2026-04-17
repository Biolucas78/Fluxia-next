'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ClientMapProps {
  customers: any[];
  isPublic?: boolean;
}

export default function ClientMap({ customers, isPublic = false }: ClientMapProps) {
  const [isActive, setIsActive] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Filters
  const [filterCity, setFilterCity] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDocType, setFilterDocType] = useState('ALL'); // 'ALL', 'CNPJ', 'CPF'

  const mapCustomers = React.useMemo(() => {
    return customers.filter(c => {
      if (isPublic) {
        // Public map rules: only CNPJ, and not explicitly hidden
        if (c.tipo !== 'J') return false;
        if (c.mostrarNoMapa === false) return false;
      } else {
        // Private map rules: respect filters
        if (filterDocType === 'CNPJ' && c.tipo !== 'J') return false;
        if (filterDocType === 'CPF' && c.tipo !== 'F') return false;
        if (c.mostrarNoMapa === false) return false; 
      }

      const city = c.endereco?.geral?.municipio || c.endereco?.municipio || '';
      const state = c.endereco?.geral?.uf || c.endereco?.uf || '';

      if (filterCity && city.toLowerCase() !== filterCity.toLowerCase()) return false;
      if (filterState && state.toLowerCase() !== filterState.toLowerCase()) return false;

      return true;
    });
  }, [customers, filterCity, filterState, filterDocType, isPublic]);

  // Extract unique cities and states for filters
  const cities = Array.from(new Set(customers.map(c => c.endereco?.geral?.municipio || c.endereco?.municipio).filter(Boolean))).sort();
  const states = Array.from(new Set(customers.map(c => c.endereco?.geral?.uf || c.endereco?.uf).filter(Boolean))).sort();

  const geocodeAddress = async (customer: any) => {
    const addressParts = [
      customer.endereco?.geral?.endereco || customer.endereco?.endereco,
      customer.endereco?.geral?.numero || customer.endereco?.numero,
      customer.endereco?.geral?.municipio || customer.endereco?.municipio,
      customer.endereco?.geral?.uf || customer.endereco?.uf,
      'Brasil'
    ].filter(Boolean);

    const addressString = addressParts.join(', ');
    if (!addressString) return null;

    try {
      const response = await fetch(`/api/geocode?address=${encodeURIComponent(addressString)}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.lat && data.lng) {
        return {
          lat: data.lat,
          lng: data.lng
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  const syncCoordinates = async () => {
    if (isGeocoding) return;
    setIsGeocoding(true);
    let updatedCount = 0;

    const customersToUpdate = mapCustomers.filter(c => !c.coordenadas);
    
    if (customersToUpdate.length === 0) {
      toast.success('Todos os clientes visíveis já possuem coordenadas!');
      setIsGeocoding(false);
      return;
    }

    toast.loading(`Sincronizando coordenadas de ${customersToUpdate.length} clientes... Isso pode levar alguns minutos.`, { id: 'geocoding' });

    for (const customer of customersToUpdate) {
      const coords = await geocodeAddress(customer);
      if (coords && customer.id) {
        try {
          await updateDoc(doc(db, 'bling_customers', String(customer.id)), {
            coordenadas: coords
          });
          updatedCount++;
        } catch (e) {
          console.error('Error updating customer coords:', e);
        }
      }
      // Nominatim requires 1 request per second max
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    toast.success(`Coordenadas sincronizadas para ${updatedCount} clientes!`, { id: 'geocoding' });
    setIsGeocoding(false);
  };

  if (!isActive && !isPublic) {
    return (
      <div className="mt-8 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => setIsActive(true)}>
        <MapPin className="size-12 text-primary mb-4 opacity-50" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Mapa de Clientes</h3>
        <p className="text-sm text-slate-500 text-center max-w-md">
          Clique aqui para carregar o mapa interativo com a localização dos seus clientes.
        </p>
      </div>
    );
  }

  const customersWithCoords = mapCustomers.filter(c => c.coordenadas?.lat && c.coordenadas?.lng);

  return (
    <div className={`${isPublic ? '' : 'mt-8'} space-y-4`}>
      {!isPublic && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Estado:</span>
            <select 
              value={filterState} 
              onChange={e => setFilterState(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none"
            >
              <option value="">Todos</option>
              {states.map((s: any) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Cidade:</span>
            <select 
              value={filterCity} 
              onChange={e => setFilterCity(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none"
            >
              <option value="">Todas</option>
              {cities.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Tipo:</span>
            <select 
              value={filterDocType} 
              onChange={e => setFilterDocType(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none"
            >
              <option value="ALL">Todos</option>
              <option value="CNPJ">Apenas CNPJ</option>
              <option value="CPF">Apenas CPF</option>
            </select>
          </div>

          <div className="flex-1"></div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
              <MapPin className="size-4 text-primary" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {customersWithCoords.length} no mapa
              </span>
            </div>

            <button 
              onClick={syncCoordinates}
              disabled={isGeocoding}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {isGeocoding ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Sincronizar Coordenadas ({mapCustomers.length - customersWithCoords.length} pendentes)
            </button>
          </div>
        </div>
      )}

      <div className={`${isPublic ? 'h-screen rounded-none border-none' : 'h-[600px] rounded-3xl border border-slate-200 dark:border-slate-800'} w-full overflow-hidden relative z-0`}>
        {isPublic && (
          <div className="absolute top-4 right-4 z-[1000] bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-2 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {customersWithCoords.length} parceiros
            </span>
          </div>
        )}
        <MapContainer 
          center={[-14.235004, -51.92528]} 
          zoom={4} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {customersWithCoords.map((customer) => (
            <Marker 
              key={customer.id} 
              position={[customer.coordenadas.lat, customer.coordenadas.lng]}
            >
              <Popup>
                <div className="p-1">
                  <h4 className="font-bold text-sm mb-1">{customer.fantasia || customer.nome}</h4>
                  <p className="text-xs text-slate-600 mb-1">
                    {customer.endereco?.geral?.endereco || customer.endereco?.endereco}, {customer.endereco?.geral?.numero || customer.endereco?.numero}
                  </p>
                  <p className="text-xs text-slate-500">
                    {customer.endereco?.geral?.municipio || customer.endereco?.municipio} - {customer.endereco?.geral?.uf || customer.endereco?.uf}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
