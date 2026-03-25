import { GoogleGenAI, Type } from "@google/genai";
import { enrichOrderWithCustomerData } from "./customerService";

export async function parseOrderWithGemini(text: string) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  console.log("Using API Key (first 4 chars):", apiKey ? apiKey.substring(0, 4) : "None");
  if (!apiKey) {
    throw new Error("Chave de API do Gemini não configurada.");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey as string });
  
  // Limit input text to 15,000 characters for batch processing
  const sanitizedText = text.trim().slice(0, 15000);
  
  if (!sanitizedText) return null;

  try {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise o seguinte texto contendo um ou mais pedidos de café e extraia as informações estruturadas em uma lista de pedidos.
    
    REGRAS DE INTERPRETAÇÃO (CRÍTICO):
    1. MÚLTIPLOS PEDIDOS: O texto pode conter vários pedidos de clientes diferentes. Identifique cada um separadamente.
    2. AMOSTRAS (GATILHO "AMOSTRA"):
       - Se a palavra "amostra" (ou "amostras") estiver presente, marque o pedido como "isSample": true.
       - Extraia: "Nome da Empresa", "Nome do responsável", "CNPJ", "Endereço com CEP".
       - Formate o "clientName" como: "(Empresa) - (Responsável)".
       - Identifique se a amostra é "moído" ou "grãos".
       - PROIBIDO: Não repita o nome da empresa ou do responsável no campo "address".
       - Se for amostra, gere AUTOMATICAMENTE estes 6 produtos com a moagem identificada:
         * 1x Catuaí 250g
         * 1x Bourbon 40g
         * 1x Torra Clara 40g
         * 1x Torra Intensa 40g
         * 1x Yellow 40g
         * 1x Gourmet 40g
    3. CAMPO ENDEREÇO (CATCH-ALL):
       - O campo "address" deve conter APENAS informações que não foram mapeadas para "clientName", "cnpj" ou "products".
       - PROIBIDO: Não repita o nome do cliente ou o CNPJ dentro do campo "address".
       - Se o texto NÃO contiver informações de endereço (como rua, CEP, cidade, ponto de referência), deixe o campo "address" como uma string vazia "".
       - Use este campo para: CEP, logradouro, bairro, cidade, pontos de referência, horários de entrega, telefones extras ou observações que sobraram do texto.
       - REGRA: Se após identificar cliente, cnpj e produtos não sobrar nenhuma informação relevante no texto, "address" deve ser "".
    4. PEDIDOS NORMAIS:
       - Para cada item, identifique (Quantidade), (Tipo/Variedade), (Peso), (Moagem) e (Notas Adicionais).
       - Se não mencionado, assuma "250g".
       - Se for "DripCoffee", peso = "100g", moagem = "moído".
    5. MAPEAMENTO DE TIPOS:
       - "Torra media" ou "Torra média" -> "Catuaí".
       - "Bourbom" ou "Bourbon" -> "Bourbon".
       - "Torra intensa" -> "Torra Intensa".
    6. MOAGEM: Identifique "moído" ou "grãos".
    7. NOME DO PRODUTO: Não inclua a palavra "Café".
    8. TELEFONE: O campo "phone" deve conter APENAS o número de telefone. Se o texto for longo e não parecer um telefone, deixe vazio ou extraia apenas os dígitos do telefone.
    9. FLEXIBILIDADE (CRÍTICO): Se o formato da mensagem for incomum ou bagunçado, use o contexto para identificar o que é o nome do cliente, o que é o endereço e o que são os produtos. Priorize a extração correta dos produtos mesmo que o endereço esteja incompleto ou misturado. Se houver dúvidas sobre o que é o nome do cliente, use a primeira linha ou a identificação mais clara de pessoa/empresa.
    
    Texto do pedido:
    ${sanitizedText}
    
    Retorne APENAS um objeto JSON válido com uma lista de pedidos, sem explicações adicionais:
    {
      "orders": [
        {
          "clientName": "Nome do Cliente",
          "cnpj": "CNPJ (se houver)",
          "cpf": "CPF (se houver)",
          "phone": "Telefone (se houver)",
          "address": "Endereço (se houver, sem o nome do cliente e sem o CNPJ/CPF)",
          "cep": "CEP (se houver, apenas números)",
          "number": "Número da residência (se houver)",
          "complement": "Complemento (se houver)",
          "isSample": true/false,
          "products": [
            {
              "quantity": 10,
              "name": "Bourbon",
              "weight": "250g",
              "grindType": "grãos",
              "productionNotes": "Notas"
            }
          ]
        }
      ]
    }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            orders: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clientName: { type: Type.STRING },
                  cnpj: { type: Type.STRING },
                  cpf: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  address: { type: Type.STRING },
                  cep: { type: Type.STRING },
                  number: { type: Type.STRING },
                  complement: { type: Type.STRING },
                  isSample: { type: Type.BOOLEAN },
                  products: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        quantity: { type: Type.NUMBER },
                        name: { type: Type.STRING },
                        weight: { type: Type.STRING },
                        grindType: { type: Type.STRING },
                        productionNotes: { type: Type.STRING }
                      },
                      required: ["quantity", "name", "weight", "grindType"]
                    }
                  }
                },
                required: ["clientName", "products"]
              }
            }
          },
          required: ["orders"]
        }
      }
    });

    const response = await model;
    console.log("Gemini response text:", response.text);
    let rawText = response.text || '';
    
    // Handle potential markdown wrapping
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    if (!rawText) {
      console.error("Gemini returned empty response");
      throw new Error("A IA não retornou nenhum conteúdo.");
    }
    
    let parsed;
    try {
      parsed = JSON.parse(rawText);
      console.log("Parsed JSON:", parsed);
    } catch (e) {
      console.error("Failed to parse JSON:", rawText);
      throw new Error("Falha ao processar a resposta da IA. O formato não é um JSON válido.");
    }
    
    // Sanitize phone numbers to prevent malformed data and enrich with customer database
    if (parsed.orders) {
      parsed.orders = parsed.orders.map((order: any) => {
        const sanitized = {
          ...order,
          phone: order.phone ? order.phone.toString().slice(0, 50) : ''
        };
        // Enrich with customer database if fields are missing
        return enrichOrderWithCustomerData(sanitized);
      });
    }
    
    return parsed;
  } catch (e: any) {
    console.error("Erro ao parsear JSON do Gemini:", e);
    throw new Error(e.message || "Erro desconhecido ao processar pedidos.");
  }
}

export async function parseAddressWithGemini(addressString: string) {
  if (!addressString) return null;

  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chave de API do Gemini não configurada.");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey as string });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise o seguinte endereço e extraia as informações estruturadas. Procure também por CPF ou CNPJ se estiverem presentes no texto do endereço.
      "${addressString}"
      
      REGRAS:
      1. TELEFONE: Extraia apenas o número de telefone. Se houver muito texto, ignore o que não for telefone.
      2. CPF/CNPJ: Remova formatação se possível, mas mantenha os dígitos.
      
      Retorne um objeto JSON:
      {
        "number": "...",
        "complement": "...",
        "phone": "...",
        "cnpj": "...",
        "cpf": "...",
        "cep": "..."
      }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.STRING },
            complement: { type: Type.STRING },
            phone: { type: Type.STRING },
            cnpj: { type: Type.STRING },
            cpf: { type: Type.STRING },
            cep: { type: Type.STRING }
          },
          required: ["number", "complement", "phone", "cnpj", "cpf", "cep"]
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.phone) {
      parsed.phone = parsed.phone.toString().slice(0, 50);
    }
    return parsed;
  } catch (e) {
    console.error("Erro ao parsear endereço com Gemini:", e);
    return null;
  }
}