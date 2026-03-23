import customers from './customers.json';

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

/**
 * Busca um cliente na base de dados pelo nome, nome fantasia ou CNPJ/CPF.
 * A busca é case-insensitive, ignora acentos e prioriza correspondências exatas.
 */
export function findCustomerByName(name: string): Customer | null {
  if (!name) return null;
  
  const normalizedSearch = removeAccents(name.toLowerCase().trim());
  const onlyNumbers = name.replace(/\D/g, '');
  
  // 1. Tenta busca exata no Nome ou Nome Fantasia
  let match = customers.find(c => 
    removeAccents(c.name.toLowerCase()) === normalizedSearch || 
    (c.tradeName && removeAccents(c.tradeName.toLowerCase()) === normalizedSearch)
  );
  if (match) return match;

  // 2. Tenta busca por CNPJ/CPF se a busca contiver números
  if (onlyNumbers.length >= 11) {
    match = customers.find(c => {
      const customerCnpj = c.cnpj.replace(/\D/g, '');
      return customerCnpj === onlyNumbers;
    });
    if (match) return match;
  }
  
  // 3. Tenta busca por "contém" (parcial)
  match = customers.find(c => {
    const cName = removeAccents(c.name.toLowerCase());
    const cTradeName = c.tradeName ? removeAccents(c.tradeName.toLowerCase()) : '';
    
    return cName.includes(normalizedSearch) || 
           normalizedSearch.includes(cName) ||
           (cTradeName && (
             cTradeName.includes(normalizedSearch) || 
             normalizedSearch.includes(cTradeName)
           ));
  });
  
  return match || null;
}

/**
 * Enriquece um objeto de pedido com dados do cliente se eles estiverem faltando.
 */
export function enrichOrderWithCustomerData(order: any) {
  const customer = findCustomerByName(order.clientName);
  
  if (!customer) return order;
  
  const docNumbers = customer.cnpj.replace(/\D/g, '');
  const isCpf = docNumbers.length === 11;
  
  return {
    ...order,
    cnpj: order.cnpj || (isCpf ? '' : customer.cnpj),
    cpf: order.cpf || (isCpf ? customer.cnpj : ''),
    phone: order.phone || customer.phone,
    email: order.email || customer.email,
    // Se não houver endereço no pedido, usa o da base
    address: order.address || `${customer.street}, ${customer.number}${customer.complement ? ' - ' + customer.complement : ''}, ${customer.district}, ${customer.city} - ${customer.state}, ${customer.zip}`,
    cep: order.cep || customer.zip,
    number: order.number || customer.number,
    complement: order.complement || customer.complement,
    addressDetails: order.addressDetails || {
      street: customer.street,
      number: customer.number,
      complement: customer.complement,
      district: customer.district,
      city: customer.city,
      state: customer.state,
      zip: customer.zip
    }
  };
}
