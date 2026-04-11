import { Order, ProductItem, OrderStatus } from './types';
import { KNOWN_SKUS } from './skus';

function parseAddress(addressString: string) {
  // Simple regex-based parser
  const zipMatch = addressString.match(/(\d{5}-\d{3})/);
  const zip = zipMatch ? zipMatch[1] : '';
  
  // This is a very basic parser, in production you'd use a real address API
  return {
    street: addressString.split(',')[0] || '',
    number: '', // Hard to extract without better data
    complement: '',
    district: '',
    city: '',
    state: '',
    zip: zip
  };
}

export function parseWhatsAppOrder(text: string): Partial<Order> {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l !== '');
  
  if (lines.length === 0) return {};

  const clientName = lines[0];
  const products: ProductItem[] = [];
  let cnpj = '';
  const addressParts: string[] = [];
  const observationsParts: string[] = [];

  const productKeywords = [
    'Catuaí', 'Catuai', 'Torra Clara', 'Torra intensa', 'Bourbon', 'Yellow', 'Gourmet', 
    'DripCoffee', 'Arábica', 'Arabica', 'Robusta', 'Conilon', 'Mundo Novo', 'Icatu', 
    'Topázio', 'Topazio', 'Obatã', 'Obata', 'Acaiá', 'Acaia', 'Especial', 'Torra Media', 'Torra Média'
  ];
  const weightKeywords = ['40g', '120g', '250g', '500g', '1kg'];
  const grindKeywords = ['moído', 'moídos', 'grão', 'grãos', 'moido', 'moidos', 'grao', 'graos'];
  const qtyDecorators = ['pacotes', 'pacote', 'unidades', 'unidade', 'un', 'cx', 'caixas', 'caixa'];
  const genericKeywords = ['Café', 'Cafe', 'de'];
  const addressKeywords = ['rua', 'av', 'avenida', 'cep', 'bairro', 'nº', 'número', 'apto', 'bloco', 'casa'];
  const paymentKeywords = ['A vista', '15 dias', '21 dias', '30 dias', '2x'];
  
  let phone = '';
  let email = '';
  let paymentCondition: 'A vista' | '15 dias' | '21 dias' | '30 dias' | '2x' = 'A vista';

  for (let i = 1; i < lines.length; i++) {
    let line = lines[i].replace(/^-/, '').trim(); // Remove leading dash
    
    // Check for payment condition
    for (const condition of paymentKeywords) {
      if (line.toLowerCase().includes(condition.toLowerCase())) {
        paymentCondition = condition as any;
        break;
      }
    }

    // Check if it's a CNPJ/CPF (11 or 14 digits)
    const cleanDigits = line.replace(/\D/g, '');
    if ((cleanDigits.length === 11 || cleanDigits.length === 14) && /^\d+$/.test(cleanDigits)) {
      if (!cnpj) {
        cnpj = line;
        continue;
      }
    }

    // Check for phone
    const phoneMatch = line.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0];
      continue;
    }

    // Check for email
    const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch && !email) {
      email = emailMatch[0];
      continue;
    }

    // Check for known SKUs
    let foundSku: string | undefined;
    for (const sku of KNOWN_SKUS) {
      if (line.includes(sku)) {
        foundSku = sku;
        break;
      }
    }

    // Identify if a line is likely a product
    const qtyMatch = line.match(/^(\d+)/) || line.match(/(\d+)\s*(?:pacotes?|unidades?|un|cx|caixas?)/i);
    const hasQty = !!qtyMatch;
    const hasWeight = new RegExp(`\\b(${weightKeywords.join('|')})\\b`, 'i').test(line);
    const hasKeyword = new RegExp(`\\b(${productKeywords.concat(genericKeywords).join('|')})\\b`, 'i').test(line);
    const hasGrind = new RegExp(`\\b(${grindKeywords.join('|')})\\b`, 'i').test(line);

    const isProduct = foundSku || (hasQty && (hasWeight || hasKeyword || hasGrind)) || (hasKeyword && (hasWeight || hasGrind));

    if (isProduct) {
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      
      let remaining = line;
      if (qtyMatch) {
        remaining = line.replace(qtyMatch[0], '').trim();
      }
      
      if (foundSku) {
        remaining = remaining.replace(foundSku, '').trim();
      }

      for (const dec of qtyDecorators) {
        remaining = remaining.replace(new RegExp(`\\b${dec}\\b`, 'i'), '').trim();
      }

      for (const gen of genericKeywords) {
        remaining = remaining.replace(new RegExp(`\\b${gen}\\b`, 'i'), '').trim();
      }

      const weightMatch = remaining.match(new RegExp(`\\b(${weightKeywords.join('|')})\\b`, 'i'));
      let weight = weightMatch ? weightMatch[1].toLowerCase() : '250g';
      if (weightMatch) remaining = remaining.replace(weightMatch[0], '').trim();

      const grindMatch = remaining.match(new RegExp(`\\b(${grindKeywords.join('|')})\\b`, 'i'));
      let grind: 'moído' | 'grãos' | 'N/A' = 'moído';
      if (grindMatch) {
        grind = grindMatch[1].toLowerCase().includes('mo') ? 'moído' : 'grãos';
        remaining = remaining.replace(grindMatch[0], '').trim();
      }

      const nameMatch = remaining.match(new RegExp(`\\b(${productKeywords.join('|')})\\b`, 'i'));
      let name = '';
      if (nameMatch) {
        name = nameMatch[1];
        remaining = remaining.replace(nameMatch[0], '').trim();
      } else {
        const anyKeywordMatch = line.match(new RegExp(`\\b(${productKeywords.join('|')})\\b`, 'i'));
        if (anyKeywordMatch) {
          name = anyKeywordMatch[1];
        } else {
          const firstWordMatch = remaining.match(/^([a-zà-ú]+)/i);
          if (firstWordMatch) {
            name = firstWordMatch[1];
            remaining = remaining.replace(firstWordMatch[0], '').trim();
          } else {
            name = foundSku ? `Produto ${foundSku}` : 'Especial';
          }
        }
      }

      if (name.toLowerCase().includes('torra media') || name.toLowerCase().includes('torra média')) {
        name = 'Catuaí';
      }
      if (name.toLowerCase() === 'bourbom') {
        name = 'Bourbon';
      }

      name = name.replace(/Café|Cafe/gi, '').trim();
      if (!name) name = foundSku ? `Produto ${foundSku}` : 'Especial';

      if (name.toLowerCase() === 'dripcoffee') {
        weight = '100g';
        grind = 'moído';
      }

      const notes = remaining.replace(/\s+/g, ' ').trim() || undefined;

      products.push({
        id: Math.random().toString(36).substring(2, 9),
        quantity: qty,
        name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
        weight: weight,
        grindType: grind,
        productionNotes: notes,
        checked: false,
        blingSku: foundSku
      });
      continue;
    }

    // Fallback: Identify Address vs Observations
    const isAddress = new RegExp(`\\b(${addressKeywords.join('|')})\\b`, 'i').test(line) || /\d{5}-\d{3}/.test(line);
    if (isAddress) {
      addressParts.push(line);
    } else {
      observationsParts.push(line);
    }
  }

  const address = addressParts.join(', ');
  return {
    clientName,
    cnpj,
    phone,
    email,
    address: address,
    addressDetails: parseAddress(address),
    observations: observationsParts.join('\n'),
    paymentCondition,
    products,
    status: 'pedidos' as OrderStatus,
    hasInvoice: false,
    hasBoleto: false,
    createdAt: new Date().toISOString(),
  };
}

export function extractCityState(address: string | undefined | null) {
  if (!address) return { city: 'N/A', state: 'N/A' };
  
  // Try to match "City - UF" or "City, UF" or "City - State"
  // Common format: "Rua ..., Bairro, Cidade - UF, CEP"
  const parts = address.split(',').map(p => p.trim());
  
  // Look for the part that contains the state (usually 2 uppercase letters after a dash or space)
  const stateMatch = address.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})/);
  if (stateMatch) {
    return { city: stateMatch[1].trim(), state: stateMatch[2].trim() };
  }

  // Fallback: try to find the last part before CEP
  const cepIndex = parts.findIndex(p => /\d{5}-\d{3}/.test(p));
  if (cepIndex > 0) {
    const cityStatePart = parts[cepIndex - 1];
    const cityStateMatch = cityStatePart.match(/(.+)\s*-\s*([A-Z]{2})/);
    if (cityStateMatch) {
      return { city: cityStateMatch[1].trim(), state: cityStateMatch[2].trim() };
    }
  }

  return { city: 'N/A', state: 'N/A' };
}

export function calculateWeightInKg(weightStr: string, quantity: number): number {
  if (!weightStr || weightStr === 'N/A') return 0;
  const value = parseFloat(weightStr);
  if (isNaN(value)) return 0;

  if (weightStr.toLowerCase().includes('kg')) {
    return value * quantity;
  } else if (weightStr.toLowerCase().includes('g')) {
    return (value / 1000) * quantity;
  }
  return 0;
}
