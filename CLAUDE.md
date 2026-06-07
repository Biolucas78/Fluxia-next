# Fluxia — Contexto do Projeto para Claude Code

## Sobre o desenvolvedor
Lucas é o dono e operador do negócio (Café Fazenda Itaoca — torrefação de cafés especiais) e único desenvolvedor do Fluxia. Trabalha com IA conversacional para desenvolver, sem conhecimento prévio de programação. Explicações devem ser claras, sem jargões desnecessários.

## O App
**Fluxia** é um sistema de gestão empresarial para a Café Fazenda Itaoca. Está em produção em `https://fluxia-next.vercel.app`.

## Stack Tecnológica
- **Framework:** Next.js 15 (App Router)
- **Linguagem:** TypeScript
- **Estilo:** Tailwind CSS v4
- **Banco de dados:** Firebase Firestore (banco nomeado específico — ver `firebase-applet-config.json`)
- **Auth:** Firebase Authentication
- **Animações:** Framer Motion (`motion/react`)
- **Ícones:** Lucide React
- **Deploy:** Vercel (conectado ao GitHub)
- **Repositório:** `github.com/Biolucas78/Fluxia-next`

## Ambiente de Desenvolvimento
- **Editor:** VSCode com Claude Code
- **Fluxo:** VSCode → git push → Vercel (deploy automático)
- **Preview local:** `npm run dev`

## Arquitetura do Banco de Dados
O Firestore usa separação inteligente dev/prod pelo hostname:
- `localhost` → coleções `_dev` (ex: `orders_dev`)
- `vercel.app` → coleções de produção (ex: `orders`)

Sempre usar `adminDb` de `lib/firebase-admin.ts` nas rotas de API — nunca inicializar o Firebase Admin diretamente.

## Módulos do App

### Produção (Kanban)
- Fases: `pedidos → embalagens_separadas → embalagens_prontas → caixa_montada → enviado → entregue`
- Cards deletados vão para a Lixeira
- Cards arquivados continuam computando no dashboard

### CRM Leads
- Funis separados por papel (admin, gestor_vendas, gestor_trafego)
- Webhook em `/api/leads/webhook` recebe leads do Make.com

### Dashboard
- Métricas: Kg produzidos, unidades, clientes, vendas
- Arquivados computam; Lixeira não computa

### Logística
- Cotação: Melhor Envio + Superfrete + Correios
- Emissão de etiqueta: Melhor Envio ✅ | Correios ✅ | Superfrete ✅
- DACE (Declaração de Conteúdo Eletrônica): gerada automaticamente pelo Correios quando não há NF vinculada
  - Endpoint: `POST /prepostagem/v1/prepostagens/dce/dace/impressao`
  - Retorna base64 em `dados`, armazenado em `daceCache` (Map global em `app/api/shipping/label/route.ts`)
  - Servido via `app/api/shipping/label/download/route.ts?tipo=dce&token={prePostageId}`

## Integrações Ativas
- **Bling ERP** — sincronização de pedidos e clientes
- **Melhor Envio** — cotação e etiquetas (BH como origem)
- **Superfrete** — cotação e etiquetas (CRV como origem)
- **Correios** — cotação e etiquetas (CRV como origem)
- **Sicoob** — emissão de boletos, consulta e sincronização via webhook
- **Make.com** — automação de leads via webhook
- **Google Analytics (GA4)** — analytics
- **Gemini AI** — funcionalidades de IA no app

## Variáveis de Ambiente (no Vercel)
Principais:
- `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_URL`
- `SUPERFRETE_TOKEN`, `SUPERFRETE_URL`
- `CORREIOS_USER`, `CORREIOS_ACCESS_CODE`, `CORREIOS_CONTRACT`, `CORREIOS_POSTAGE_CARD`
- `ORIGIN_BH_JSON`, `ORIGIN_CRV_JSON` — endereços dos dois remetentes
- `FIREBASE_SERVICE_ACCOUNT_KEY` — Firebase Admin
- `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`
- `NEXT_PUBLIC_GEMINI_API_KEY`
- `SICOOB_CERT_PFX_BASE64`, `SICOOB_CERT_PASSWORD`, `SICOOB_CLIENT_ID`
- `SICOOB_NUMERO_CLIENTE`, `SICOOB_NUMERO_CONTA`, `SICOOB_NUMERO_CONTRATO`

## Estrutura de Arquivos Importantes
```
Fluxia-next/
├── app/
│   ├── page.tsx                         # Dashboard principal
│   ├── financeiro/page.tsx              # Página financeiro
│   ├── logistica/page.tsx               # Página logística
│   ├── recorrencia/page.tsx             # Página recorrência
│   └── api/
│       ├── shipping/
│       │   ├── label/route.ts           # Emissão etiquetas (Correios, Superfrete, ME)
│       │   ├── label/download/route.ts  # Download etiqueta/DACE
│       │   ├── quote/route.ts           # Cotação fretes
│       │   └── track/route.ts           # Rastreamento
│       ├── bling/                       # Integração Bling ERP
│       ├── sicoob/                      # Integração Sicoob banco
│       └── leads/webhook/               # Webhook Make.com
├── components/
│   ├── Dashboard.tsx                    # Dashboard com demanda de embalagens
│   ├── KanbanBoard.tsx                  # Kanban de produção
│   ├── OrderDetailsModal.tsx            # Modal principal de pedidos
│   ├── OrderCard.tsx                    # Card do kanban
│   └── ShippingQuoteModal.tsx           # Modal de cotação de frete
├── lib/
│   ├── firebase-admin.ts                # Firebase Admin (usa banco nomeado)
│   ├── parser.ts                        # Funções de parsing
│   ├── hooks.ts                         # Hooks (useOrders, useUser)
│   ├── types.ts                         # Tipos TypeScript
│   ├── correios.ts                      # Token e helpers Correios
│   └── sicoob.ts                        # Funções Sicoob
└── public/images/
```

## Lógicas Importantes

### `isPaid()` — verificação de pagamento
1. Checa `paymentConfirmedManually` primeiro
2. Depois `boletSituacao` para pedidos com boleto vinculado
3. Por último `paymentStatus` para os demais

### `isExcluded()` — exclusão do Financeiro
- Filtra pedidos com `isSample: true`

### Rota de merge de clientes (`/api/clientes/atualizar`)
- Dados do Fluxia têm prioridade
- Nunca sobrescreve campos existentes
- Propaga mudanças a todos os pedidos do mesmo cliente
- Usa `clientId` direto para evitar duplicatas

### Demanda de embalagens (Dashboard)
- Usa `normalizeGrindForKey()` para normalizar `grindType` antes de agrupar e comparar
- Variações como "moído", "Moido", "moido" são normalizadas para "Moido"
- "Graos", "grãos", "graos" → "Graos"

### Tipos canônicos de produto (Dashboard)
Os 6 tipos canônicos para ranking de kg: `Catuaí`, `Torra Clara`, `Torra Intensa`, `Bourbon`, `Yellow`, `Gourmet`
- DripCoffee → Catuaí (100g)
- Gourmet Personalizado → Gourmet

## Campos Chave do tipo `Order` (lib/types.ts)
```typescript
boletoLinked?: boolean
invoiceLinked?: boolean
invoiceKey?: string
invoiceNumber?: string
noInvoiceLinked?: boolean
paymentConfirmedManually?: boolean
isSample?: boolean
trackingNumber?: string
shipmentId?: string
shippingProvider?: string
dceUrl?: string
```

## Convenções do Projeto (AGENTS.md)
- Leads usam `notas` (português), não `notes`
- Orders usam `observations` para notas
- Sempre rodar `npx tsc --noEmit` antes de commitar
- Dark/light mode com prefixo `dark:` do Tailwind
- Tailwind v4: classes dinâmicas com template literals precisam de backtick + `${}`

## Como Trabalhamos
1. **Investigar antes de modificar** — sempre ler o código atual antes de propor mudanças
2. **Propor plano antes de implementar** — apresentar o que vai mudar e aguardar aprovação
3. **Nunca alterar o que está funcionando** sem necessidade
4. **Rodar `npx tsc --noEmit`** antes de qualquer commit
5. **Commits separados** para facilitar cópia:

```bash
git add .
git commit -m "feat/fix: descrição clara"
git push
```

## URLs Importantes
- **Produção:** `https://fluxia-next.vercel.app`
- **Preview local:** `npm run dev` → `http://localhost:3000`
- **Testar API:** `curl -X POST https://fluxia-next.vercel.app/api/rota -H "Content-Type: application/json" -d '{}'`

## Dicas de Debugging
- **Build falhou no Vercel:** `npx tsc --noEmit` localmente primeiro
- **Erro 405 em rota de API:** normal ao acessar via GET no navegador; usar curl com POST
- **Variáveis de ambiente:** só existem no Vercel, não localmente; testes de API externos via `https://fluxia-next.vercel.app/api/...`
