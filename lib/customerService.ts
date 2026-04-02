export interface Customer {
  name: string;
  tradeName?: string;
  cnpj: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  zip: string;
  city: string;
  state: string;
  phone: string;
  email: string;
}

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export interface Customer {
  name: string;
  tradeName?: string;
  cnpj: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  zip: string;
  city: string;
  state: string;
  phone: string;
  email: string;
}

/**
 * Remove acentos de uma string
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function enrichOrderDataAsync(order: any) {
  let enrichedOrder = { ...order };
  let foundInDb = false;

  // 1. Try Local Firestore Database first
  try {
    const customersRef = collection(db, 'bling_customers');
    
    // Fetch all customers for fuzzy matching (accent/case insensitive)
    // For larger databases, this should be optimized, but for ~1000 it's fine
    const querySnapshot = await getDocs(customersRef);
    const allCustomers = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const searchDoc = (order.cnpj || order.cpf || '').replace(/\D/g, '');
    const searchName = removeAccents(order.clientName.toLowerCase());

    // Try to find the best match
    const dbCustomer = allCustomers.find(c => {
      // Match by document
      if (searchDoc && c.numeroDocumento && c.numeroDocumento.replace(/\D/g, '') === searchDoc) return true;
      
      // Match by name or trade name (fantasia)
      const cNome = removeAccents((c.nome || '').toLowerCase());
      const cFantasia = removeAccents((c.fantasia || '').toLowerCase());
      
      return cNome === searchName || cFantasia === searchName || 
             cNome.includes(searchName) || cFantasia.includes(searchName) ||
             searchName.includes(cNome) || searchName.includes(cFantasia);
    });
    
    if (dbCustomer) {
      foundInDb = true;
      
      enrichedOrder = {
        ...enrichedOrder,
        cnpj: enrichedOrder.cnpj || dbCustomer.numeroDocumento || '',
        cpf: enrichedOrder.cpf || (dbCustomer.tipo === 'F' ? dbCustomer.numeroDocumento : ''),
        phone: enrichedOrder.phone || dbCustomer.celular || dbCustomer.telefones?.celular || '',
        email: enrichedOrder.email || dbCustomer.email || '',
        cep: enrichedOrder.cep || dbCustomer.endereco?.geral?.cep || dbCustomer.endereco?.cep || '',
        number: enrichedOrder.number || dbCustomer.endereco?.geral?.numero || dbCustomer.endereco?.numero || '',
        complement: enrichedOrder.complement || dbCustomer.endereco?.geral?.complemento || dbCustomer.endereco?.complemento || '',
        foundInDb: true,
        dbCustomerId: dbCustomer.id
      };

      if (dbCustomer.endereco) {
        // Try multiple paths for address data
        const addr = dbCustomer.endereco.geral || dbCustomer.endereco;
        enrichedOrder.addressDetails = {
          street: addr.endereco || addr.street || '',
          number: addr.numero || addr.number || '',
          complement: addr.complemento || addr.complement || '',
          district: addr.bairro || addr.district || '',
          city: addr.municipio || addr.city || '',
          state: addr.uf || addr.state || '',
          zip: addr.cep || addr.zip || '',
          warning: ''
        };
      }
    }
  } catch (error) {
    console.error("Erro ao buscar no Firestore:", error);
  }

  // 2. Try Bling if not found in DB
  if (!foundInDb && !enrichedOrder.cpf && !enrichedOrder.cnpj && !enrichedOrder.addressDetails?.street) {
    try {
      const { searchBlingCustomers } = await import('@/lib/bling-search');
      const data = await searchBlingCustomers(order.clientName);
      if (data && data.length > 0) {
        const blingCustomer = data[0]; // Take the first match
        const isJ = blingCustomer.tipo === 'J';
        
        enrichedOrder = {
          ...enrichedOrder,
          cnpj: enrichedOrder.cnpj || (isJ ? blingCustomer.numeroDocumento : ''),
          cpf: enrichedOrder.cpf || (!isJ ? blingCustomer.numeroDocumento : ''),
          phone: enrichedOrder.phone || blingCustomer.celular || blingCustomer.telefone || '',
          email: enrichedOrder.email || blingCustomer.email || '',
          cep: enrichedOrder.cep || blingCustomer.endereco?.cep || '',
          number: enrichedOrder.number || blingCustomer.endereco?.numero || '',
          complement: enrichedOrder.complement || blingCustomer.endereco?.complemento || '',
        };

        if (blingCustomer.endereco) {
          enrichedOrder.addressDetails = {
            street: blingCustomer.endereco.endereco || '',
            number: blingCustomer.endereco.numero || '',
            complement: blingCustomer.endereco.complemento || '',
            district: blingCustomer.endereco.bairro || '',
            city: blingCustomer.endereco.municipio || '',
            state: blingCustomer.endereco.uf || '',
            zip: blingCustomer.endereco.cep || '',
            warning: ''
          };
        }
      }
    } catch (error) {
      console.error("Erro ao buscar no Bling:", error);
    }
  }

  // 3. Extract CEP (only numbers)
  const cep = enrichedOrder.cep ? enrichedOrder.cep.replace(/\D/g, '') : null;

  if (cep && cep.length === 8) {
    try {
      // Fetch data from ViaCEP
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const viaCepData = await response.json();

      if (!viaCepData.erro) {
        // We have valid ViaCEP data
        const streetFromCep = viaCepData.logradouro;
        const rawAddress = enrichedOrder.address || '';

        // Check if the raw address contains the street name from ViaCEP
        // We normalize both strings to ignore accents and case, and remove common prefixes
        const removePrefixes = (str: string) => str.replace(/^(rua|r\.|r|avenida|av\.|av|travessa|tv\.|tv|praça|praca|pc\.|pc|rodovia|rod\.|rod|estrada|est\.|est)\s+/i, '');
        const normalizedStreet = removePrefixes(removeAccents(streetFromCep.toLowerCase()));
        const normalizedRawAddress = removePrefixes(removeAccents(rawAddress.toLowerCase()));

        let addressWarning = '';
        if (rawAddress && !normalizedRawAddress.includes(normalizedStreet)) {
          addressWarning = `Atenção: A rua do CEP (${streetFromCep}) parece diferente do endereço fornecido.`;
        }

        enrichedOrder.addressDetails = {
          street: streetFromCep || '',
          number: enrichedOrder.number || '',
          complement: enrichedOrder.complement || '',
          district: viaCepData.bairro || '',
          city: viaCepData.localidade || '',
          state: viaCepData.uf || '',
          zip: viaCepData.cep || '',
          warning: addressWarning || ''
        };
      } else {
        enrichedOrder.addressDetails = {
          ...enrichedOrder.addressDetails,
          warning: 'CEP não encontrado na base dos Correios.'
        };
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    }
  }

  return enrichedOrder;
}
