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
- Cotação: Melhor Envio + Superfrete + Correios + Frenet
- Emissão de etiqueta: Melhor Envio ✅ | Correios ✅ | Superfrete ✅ | Frenet ⚠️ (ver seção própria abaixo — emissão implementada mas travando com erro genérico, aguardando retorno do suporte Frenet)
- DACE (Declaração de Conteúdo Eletrônica): gerada automaticamente pelo Correios quando não há NF vinculada
  - Endpoint: `POST /prepostagem/v1/prepostagens/dce/dace/impressao`
  - Retorna base64 em `dados`, armazenado em `daceCache` (Map global em `app/api/shipping/label/route.ts`)
  - Servido via `app/api/shipping/label/download/route.ts?tipo=dce&token={prePostageId}`
  - Frenet tem equivalente: campo `declarationUrl` na resposta de `/orders/oneclick` (gerado quando o pedido não tem `Invoice`/NF) — já tratado no front-end igual ao `dceUrl`

### Recorrência (2ª reforma, 2026-10-25)
Página `app/recorrencia/page.tsx`; regras puras em `lib/recurrence.ts` (`buildRecurrenceClients`, `sortRecurrenceQueue`, `fillMessage`); card em `components/RecurrenceCard.tsx`. Não existe entidade "Cliente" própria — agrupa pedidos de `orders` por CNPJ/CPF/telefone/nome normalizado (`getOrderIdentifier`), pegando o pedido mais recente (`latestOrder`). Dados exibidos vêm primeiro do cadastro em `bling_customers` (join via `findCustomerEntry()`: doc.id → documento → telefone → nome) e caem no pedido como fallback.
- **Entrada**: TODO cliente com pedido no Fluxia, em qualquer fase do Kanban (inclui arquivados). Pedidos na Lixeira não contam. Pedido não entregue mostra selo "Em andamento".
- **Só amostras** (`isSample`): amostra não conta como compra. Cliente que só recebeu amostra aparece com `sampleOnly` (selo roxo "Amostra", filtro Tag → "Amostra") e começa na aba Fora; "Recolocar" grava `participaRecorrencia: true` e ele entra na fila. Ao comprar, deixa de ser `sampleOnly` sozinho. Se a amostra cair no mesmo cadastro de um cliente que já comprou (identificadores diferentes, ex: nome x CNPJ), a ficha "só amostra" é descartada.
- **Tempo real**: pedidos (`useOrders`) e `bling_customers` (onSnapshot na própria página) — cliente/pedido novo aparece sozinho.
- **Abas**: Todos · CNPJ (padrão) · CPF · Belo Horizonte · Fora da recorrência. As quatro primeiras só mostram quem participa. Filtros combináveis: Estado, Cidade, Mês do último pedido, Período, Tag, Origem e placar por cor.
- **Ordem**: por `latestOrder.createdAt`, botão Antigo (padrão)/Recente. Quem foi "movido para o fim" fica no final até o fim do dia OU até o próximo "Atualizar" — `Order.lastRecurrenceContact` > `max(início do dia, settings/recurrence_queue_{dev|prod}.resetAt)`. Pedido novo também anula o "fim da fila".
- **Cores** (dias desde a criação do último pedido): verde < 20, amarelo 20–30, vermelho > 30.
- **Participação** (fonte única): `bling_customers.participaRecorrencia`. Sem flag explícita: respeita o legado `Order.recurrenceRemoved` e depois o padrão por origem — Amazon/Meli/Mercado Livre começam fora; Wix começa DENTRO. "Remover" manda pra aba Fora; de lá "Recolocar" grava `true`. Toggle equivalente em Clientes.
- **Campos do cliente em `bling_customers`** (exclusivos do Fluxia, sobrevivem à sync do Bling porque ela usa merge): `contatoNome` (dono/comprador, usado no `{Nome}`), `tagsRecorrencia` (`Revendedor` | `Consumidor final`, lista em `RECURRENCE_TAGS`), `observacaoRecorrencia`. Cliente sem doc ganha um doc mínimo com id = identifier ao ser editado/removido.
- **Edição no card**: grava em `bling_customers` e, se o doc é um contato do Bling (`data.id === doc.id`) e mudou razão/fantasia/telefone/cidade/UF, envia PUT ao Bling — senão a próxima sincronização do Bling desfaria a correção. A Recorrência chama `PUT /api/bling/customers/[id]?create=false`: **nunca cria contato no Bling** — se não achar o contato (nem pelo documento), devolve 404 `notFound` e a edição fica só no Fluxia. A página de Clientes continua usando o fallback que cria (POST).
- **ID do Bling desatualizado** (vale pra Recorrência e Clientes): alguns docs de `bling_customers` apontam pra um contato apagado/duplicado no Bling, e o PUT volta 404 ou 400 "CNPJ já cadastrado no contato X". `PUT /api/bling/customers/[id]` então procura o contato verdadeiro (por `numeroDocumento`, depois pelo nome citado no erro, conferindo o documento), atualiza ele e devolve `resolvedId` + cadastro completo. O front chama `relinkBlingCustomer()` (`lib/bling-client.ts`): grava no doc certo levando os campos exclusivos do Fluxia e marca o doc antigo com `substituidoPor` (não apaga — pedidos podem ter `clientId` apontando pra ele). Recorrência e Clientes ignoram docs com `substituidoPor`.
- **Abordagem**: clicar em Pessoal/Business (ou compartilhar com anexo) grava no `latestOrder` `lastRecurrenceApproach`, `recurrenceApproachChannel` e `lastRecurrenceContact` (move pro fim do dia). Card mostra "Abordado há X dias" e o modal avisa se < `APPROACH_COOLDOWN_DAYS` (15). O botão do último canal usado fica destacado.
- **Anexo**: wa.me só aceita texto. PDF/PNG/JPG vai pela Web Share API (`navigator.share({ files, text })`, só Android/Chrome); o texto também é copiado pra área de transferência. O arquivo fica selecionado entre clientes.
- **Botão Atualizar**: grava `resetAt` (reorganiza a fila) e completa campos VAZIOS do cadastro (celular, cidade/UF, contatoNome, fantasia) com dados dos pedidos — nunca sobrescreve. Complemento desativado em localhost porque `bling_customers` é compartilhado entre dev e prod.
- **Variáveis das frases**: `{Nome}` (primeiro nome do contato) e `{Produto}` (até 2 produtos de maior quantidade do último pedido).
- **Ciclo de compra**: média de dias entre compras (pedidos com < 3 dias de diferença contam como uma compra); card avisa "passou do ciclo".
- **Link "Último pedido"**: abre `/producao?pedido={id}` em nova aba; `KanbanBoard` recebe `initialOpenOrder` (buscado em `allOrders`, então funciona com arquivados).

## Integrações Ativas
- **Bling ERP** — sincronização de pedidos e clientes
- **Melhor Envio** — cotação e etiquetas (BH como origem)
- **Superfrete** — cotação e etiquetas (CRV como origem)
- **Correios** — cotação e etiquetas (CRV como origem)
- **Frenet** — cotação (API legada) ✅ funcionando | emissão (API whitelabel/parceiro) ⚠️ implementada mas com erro genérico pendente de resposta do suporte — ver seção "Frenet — particularidades da API" abaixo antes de mexer em qualquer coisa relacionada
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
- `FRENET_TOKEN` (cotação legada + token do cliente na API whitelabel), `FRENET_PARTNER_TOKEN` (parceiro, obtido com parceiros@frenet.com.br), `FRENET_ORDERS_URL` (default `https://whitelabel.apifrenet.com.br/v1`)

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
│       │   ├── label/route.ts           # Emissão etiquetas (Correios, Superfrete, ME, Frenet)
│       │   ├── label/download/route.ts  # Download etiqueta/DACE
│       │   ├── quote/route.ts           # Cotação fretes (ME, Superfrete, Correios)
│       │   ├── quote-frenet/route.ts    # Cotação Frenet (API legada)
│       │   └── track/route.ts           # Rastreamento (inclui Frenet, pull-based)
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

### Frenet — particularidades da API (descobertas na integração, 2026-10)
A documentação oficial (docs.frenet.com.br) está **errada ou desatualizada** em vários pontos — confirmado testando a API diretamente. Antes de mexer em `app/api/shipping/label/route.ts` (bloco `selectedOption.provider === 'Frenet'`) ou `app/api/shipping/quote-frenet/route.ts`, leia isto:

1. **Dois sistemas de cotação, podem divergir**: a tela de cotação (`ShippingQuoteModal`) usa a API **legada** (`api.frenet.com.br/shipping/quote`, só com `FRENET_TOKEN`). A emissão precisa de uma **pós-cotação separada** (`POST /v1/quotes` na API whitelabel, com `token`+`x-partner-token`) feita na hora de emitir — o `SessionId` da cotação legada NÃO é válido pra emissão. **As transportadoras disponíveis podem ser diferentes entre os dois sistemas, e variam pela origem**: CEP de origem CRV (37430-000) só oferece Correios+Jadlog; BH (30575-110) oferece Optimus/J&T/Loggi/Total Express+Jadlog (sem Correios). Confirmado testando ambas origens direto na API.
2. **Domínio mudou**: a doc e o código antigo usavam `whitelabel.frenet.com.br` — o domínio real de produção é **`whitelabel.apifrenet.com.br`** (confirmado pelo suporte Frenet). Não existe mais ambiente de homologação, só produção.
3. **API responde em camelCase, aceita request em PascalCase**: toda resposta JSON da Frenet (whitelabel) vem em camelCase (`sessionId`, `quotations`, `shippingServiceCode`...), mas a doc OpenAPI mostra PascalCase (`SessionId`, `Quotations`...) e a API aceita o request nesse formato (deserialização case-insensitive do lado deles). O código usa um helper `pick(obj, 'camelCase', 'PascalCase')` pra ler respostas sem depender de qual formato vier.
4. **`Order.Volumes` é objeto único, não array** — apesar do nome no plural e de alguns exemplos sugerirem lista, o schema real (`ShipmentBase.Volumes: $ref Volume`) é um único objeto. Enviar como array causa erro de deserialização .NET (`"The JSON value could not be converted to ...Models.Volume"`). Já corrigido no código.
5. **Dois tokens**: `FRENET_TOKEN` (token do cliente, da conta normal) + `FRENET_PARTNER_TOKEN` (token de parceiro, só obtido contatando `parceiros@frenet.com.br`, com processo de homologação/apresentação). Sem os dois, `/orders/oneclick` falha com 401/credenciais.
6. **Endpoint de emissão**: `POST /orders/oneclick` (existe um equivalente `POST /shipments/oneclick` com schema idêntico — não está claro qual é "oficial", usamos `/orders/oneclick` e o suporte confirmou que está certo).
7. **Saldo insuficiente**: `/orders/oneclick` retorna erro com `Code: 3000` ou `StatusBatch: 2`, incluindo `TransactionUrl` pra recarregar. O código já tem fallback: tenta `POST /orders` (sem oneclick, não paga) pra pelo menos criar o pedido pendente — equivalente ao "carrinho" do Melhor Envio, mas a finalização (pagamento + impressão) só pode ser feita no painel da Frenet, não há confirmação de endpoint pra pagar de volta via API nesse caso específico. **Existe `POST /shipments/checkout`** (array de ShipmentIds) que parece servir pra isso — ainda não implementado/testado.
8. **Rastreio não precisa de webhook**: `app/api/shipping/track/route.ts` já tem `trackFrenet()` plugada no mesmo sistema "pull" (botão Atualizar) que os outros transportadores, usando a API legada de tracking (`api.frenet.com.br/tracking/trackinginfo`). O `trackingNumber` salvo na emissão precisa ser o código real da transportadora (ex: `PY943133131BR`), extraído do final da `TrackingUrl` — não o `ShipmentId` interno da Frenet.
9. **`Order.Created` é obrigatório** (ISO 8601, ex: `new Date().toISOString()`), apesar de a doc OpenAPI mostrar como campo opcional. Sem ele, o oneclick recusa o pedido ANTES de validar o resto, retornando só o erro genérico `código 2999 "Erro ao processar o envio"` com um trace ID opaco — foi preciso o suporte Frenet olhar os logs internos pra identificar isso (não dava pra descobrir só pela doc). Já corrigido no código — se o 2999 voltar a aparecer, não é mais esse campo (já investigar outra causa).
10. **Diagnóstico direto**: dá pra testar chamadas de **cotação** (`/v1/quotes`, `/v1/carriers/services`) direto via `node -e` usando as credenciais de `.env.local` sem custo. **NUNCA testar `/orders/oneclick` fora do fluxo real do app** — é uma transação real que paga de verdade e consome o saldo/limite de etiquetas.
11. **Formato da etiqueta (A4/A6)**: não é campo do corpo da requisição — é o header opcional `x-printing-format` em `/orders/oneclick` (e também em `/orders`, `/shipments/oneclick`, `GET /shipments/{id}/label`). Sem o header, a Frenet gera em A4. Código já envia `'x-printing-format': 'A6'` nas duas chamadas (`/orders/oneclick` e o fallback `/orders`). A doc não lista os valores aceitos (sem enum) — confirmar com o usuário se a etiqueta saiu mesmo em A6 após o deploy.

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
noInvoiceBlingOrderId?: string
blingOrderId?: number
blingOrderNumero?: number       // número sequencial do pedido no Bling (não o ID interno)
paymentConfirmedManually?: boolean
isSample?: boolean
trackingNumber?: string
shipmentId?: string
shippingProvider?: string       // 'melhorenvio' | 'correios' | 'superfrete' — tipo desatualizado, falta 'frenet'/'totalexpress' (não quebra pq é atribuído via `any`)
dceUrl?: string                 // Correios/ME — ver também `declarationUrl` da Frenet (mesmo propósito, campo diferente na resposta da API)
lastRecurrenceContact?: string  // ISO timestamp — "movido para o fim" da fila da Recorrência (vale até o fim do dia / próximo Atualizar)
lastRecurrenceApproach?: string // ISO timestamp da última abordagem via WhatsApp na Recorrência
recurrenceApproachChannel?: 'pessoal' | 'business'
recurrenceRemoved?: boolean     // legado — exclusão da recorrência agora é via bling_customers.participaRecorrencia
```

**Campos `participaRecorrencia`, `contatoNome`, `tagsRecorrencia`, `observacaoRecorrencia`** vivem na coleção **`bling_customers`**, não no `Order` — `participaRecorrencia` é a fonte única de verdade de quem participa da Recorrência (ver seção "Recorrência" acima e padrão `mostrarNoMapa`).

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
