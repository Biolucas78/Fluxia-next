# Como Trabalhamos — Guia de Desenvolvimento do Fluxia

Este documento descreve o fluxo de trabalho estabelecido entre Lucas e Claude para evoluir o código do Fluxia. Todo novo chat deve seguir exatamente este padrão.

---

## 🧠 Princípios Fundamentais

1. **Discutir antes de implementar** — Claude sempre apresenta o plano e aguarda aprovação de Lucas antes de gerar qualquer código
2. **Nunca alterar o que está funcionando** sem necessidade
3. **Investigar antes de modificar** — sempre ler o código atual antes de propor mudanças
4. **Testar no preview local** antes de subir ao Vercel
5. **Lucas decide** — Claude propõe, Lucas aprova

---

## 🔍 Como Investigar o Código

Antes de qualquer modificação, Claude investiga o código com comandos no terminal. Lucas cola os comandos e devolve o resultado.

### Localizar trechos
```bash
# Encontrar onde algo está definido
grep -n "nomeDaFuncao\|nomeDoComponente" components/Arquivo.tsx | head -20

# Ver linhas específicas
sed -n 'X,Yp' components/Arquivo.tsx

# Ver o arquivo completo
cat components/Arquivo.tsx

# Buscar em todos os arquivos
grep -rn "termo" app/ components/ --include="*.tsx" --include="*.ts" | head -20

# Encontrar arquivos que contêm um termo
grep -rn "termo" app/ components/ --include="*.tsx" -l
```

### Verificar caracteres exatos (para debugging de scripts)
```bash
sed -n 'X,Yp' components/Arquivo.tsx | cat -A
```

### Localizar número de linha de um trecho específico
```bash
grep -n "trecho exato" components/Arquivo.tsx
```

---

## 🛠️ Como Modificar o Código

### Método principal: Scripts Node.js em /tmp/

Para qualquer modificação no código, Claude cria um script `.js` que:
1. Localiza o arquivo correto automaticamente
2. Verifica que o trecho a ser modificado existe
3. Faz a substituição
4. Confirma o sucesso

**Por que scripts e não colar direto?**
- Evita erros de encoding e formatação
- Evita colar no lugar errado
- Permite verificação antes de salvar
- Fácil de depurar se algo der errado

### Fluxo padrão de um script

```javascript
const fs = require('fs');
const path = require('path');

// 1. Detectar o caminho correto automaticamente
const possiblePaths = [
  'components/Dashboard.tsx',
  path.join(process.env.HOME || '', 'Fluxia-next/components/Dashboard.tsx'),
];
let filePath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { filePath = p; break; }
}
if (!filePath) {
  console.error('ERRO: Arquivo não encontrado. Rode de dentro da pasta Fluxia-next.');
  process.exit(1);
}
console.log('Arquivo encontrado em:', filePath);
let content = fs.readFileSync(filePath, 'utf8');

// 2. Verificar que o trecho existe antes de modificar
const OLD = `trecho exato do código atual`;
const NEW = `trecho novo do código`;

if (!content.includes(OLD)) {
  console.error('ERRO: Trecho não encontrado. Me mande essa mensagem para investigar.');
  process.exit(1);
}

// 3. Fazer a substituição
content = content.replace(OLD, NEW);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: Modificação aplicada com sucesso.');
```

### Quando o trecho tem espaçamento diferente

Se o script retorna "ERRO: Trecho não encontrado", Claude investiga o trecho exato:

```bash
# Ver as linhas exatas
sed -n 'X,Yp' components/Arquivo.tsx

# Ver com caracteres especiais visíveis
sed -n 'X,Yp' components/Arquivo.tsx | cat -A
```

### Quando a substituição por texto falha: usar número de linha

```javascript
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Verificar que as linhas certas estão onde esperamos
if (!lines[150].includes('textoEsperado')) {
  console.error('ERRO: Linha 151 diferente do esperado: ' + lines[150]);
  process.exit(1);
}

// Substituir pelo novo bloco
const newBlock = `novo conteúdo aqui`.split('\n');
const before = lines.slice(0, 150);   // linhas antes
const after = lines.slice(200);        // linhas depois
const newLines = [...before, ...newBlock, ...after];
fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
```

### Substituições simples direto no terminal

Para mudanças de uma linha, usar `sed` diretamente:

```bash
# Substituir texto simples
sed -i 's/textoAntigo/textoNovo/g' components/Arquivo.tsx

# Substituir com URLs (usar | como separador)
sed -i 's|https://url-antiga.com|https://url-nova.com|g' components/Arquivo.tsx

# Deletar uma linha específica
sed -i '149d' components/Arquivo.tsx
```

---

## 📋 Fluxo Completo de uma Modificação

### 1. Lucas pede uma mudança
```
"Quero adicionar X no dashboard"
```

### 2. Claude investiga o código atual
```bash
grep -n "dashboard\|X" components/Dashboard.tsx | head -20
sed -n '100,150p' components/Dashboard.tsx
```

### 3. Claude propõe o plano
```
## 📋 Plano

O que vai mudar:
- Card Y vai receber o campo X
- Lógica de cálculo: ...

Aprova?
```

### 4. Lucas aprova e Claude gera o script
Claude cria o arquivo em `/tmp/fixNome.js` e usa `present_files` para Lucas baixar.

### 5. Lucas aplica
```bash
# Coloca o script na pasta Fluxia-next e roda
node fixNome.js
```

### 6. Verificar TypeScript
```bash
npx tsc --noEmit
```

### 7. Limpar e subir
```bash
rm fixNome.js
git add .
git commit -m "feat/fix: descrição clara do que foi feito"
git push
```

### 8. Testar
- No preview local: `npm run dev` e `echo "https://3000-${WEB_HOST}"`
- Em produção: `https://fluxia-next.vercel.app`

---

## 🚨 Regras de Segurança dos Scripts

### Nunca colar código diretamente no terminal quando for grande
Usar sempre arquivo `/tmp/fixNome.js` — evita problemas de encoding e limite de cola.

### Comandos com `!` no bash causam erro
Usar unicode `\u0021` ou reescrever sem `!`.

### Sempre verificar antes de modificar
Todo script deve verificar que o trecho existe antes de fazer qualquer alteração.

### Se aparecer "NAO encontrado"
Verificar o trecho exato com `sed` antes de tentar novamente — o espaçamento pode ser diferente do esperado.

### Scripts não poluem o código
Os arquivos `.js` de script ficam na raiz do projeto e são deletados após uso. O Next.js os ignora completamente. Mas sempre limpar com `rm fixNome.js` após uso bem-sucedido.

---

## 🗂️ Estrutura de Arquivos Importantes

```
Fluxia-next/
├── app/
│   ├── page.tsx                    # Dashboard principal (home)
│   ├── api/
│   │   ├── shipping/
│   │   │   ├── quote/route.ts      # Cotação Melhor Envio + Correios + Superfrete
│   │   │   ├── quote-tex/route.ts  # Cotação Total Express (tabela contrato)
│   │   │   └── track/route.ts      # Rastreamento (Wonca/SiteRastreio)
│   │   ├── bling/                  # Integração Bling ERP
│   │   └── leads/webhook/          # Webhook Make.com
│   ├── logistica/page.tsx          # Página de logística
│   └── recorrencia/page.tsx        # Página de recorrência (WhatsApp)
├── components/
│   ├── Dashboard.tsx               # Dashboard com rankings e métricas
│   ├── KanbanBoard.tsx             # Kanban de produção
│   ├── OrderDetailsModal.tsx       # Modal principal de pedidos
│   ├── ShippingQuoteModal.tsx      # Modal de cotação de frete
│   └── OrderDetailsModal.tsx       # Modal com botão WhatsApp rastreio
├── lib/
│   ├── firebase-admin.ts           # Firebase Admin (usa banco nomeado)
│   ├── parser.ts                   # Funções de parsing (extractCityState, etc)
│   ├── hooks.ts                    # Hooks (useOrders, useUser)
│   └── types.ts                    # Tipos TypeScript
└── public/
    └── images/                     # Imagens estáticas
```

---

## 🔧 Comandos Git (sempre separados para fácil cópia)

```bash
git add .
```

```bash
git commit -m "feat: descrição"
```

```bash
git push
```

---

## 🌐 URLs Importantes

- **Produção:** `https://fluxia-next.vercel.app`
- **Preview local:** `echo "https://3000-${WEB_HOST}"` (após `npm run dev`)
- **Testar API em produção:** `curl -X POST https://fluxia-next.vercel.app/api/rota -H "Content-Type: application/json" -d '{}'`

---

## 📦 Banco de Dados

O Firestore usa separação dev/prod pelo hostname:
- `localhost` / `ais-dev` → coleções `_dev` (ex: `leads_dev`)
- `vercel.app` → coleções de produção (ex: `leads`)

O banco tem um ID específico configurado em `firebase-applet-config.json`. Sempre usar `adminDb` de `lib/firebase-admin.ts` nas rotas de API — nunca inicializar o Firebase Admin diretamente.

---

## ⚠️ Atenções Especiais

### Tailwind v4
Classes dinâmicas com template literals precisam de backtick + `${}` no JSX.

### Variáveis de ambiente
Só existem no Vercel, não no Firebase Studio local. Testes de API externos devem ser feitos via `https://fluxia-next.vercel.app/api/...`

### Firebase Studio
Tem instabilidade — sempre fazer `git push` após mudanças funcionando.

### WhatsApp
- **Pessoal (wa.me):** abre WhatsApp normal no Android
- **Business (intent://):** abre WhatsApp Business no Android via Chrome
- O número de destino é sempre o do **cliente** (`order.phone`)
- Meus números: Pessoal `5531987988629`, Business `5511915889584`

### Rastreamento
- **Wonca/SiteRastreio:** token em `SITERASTREIO_TOKEN` no Vercel. Tem limite de créditos — **não usar auto-sync**. Rastreio só manual via botão "Sincronizar Agora"
- **Melhor Envio:** rastreio via UUID do shipment
- **Total Express:** rastreio manual no site `https://totalconecta.totalexpress.com.br/rastreamento`

### Normalização de produtos
O `normalizeTipo()` em `Dashboard.tsx` mapeia variações de nomes para tipos canônicos:
- DripCoffee → Catuaí (no ranking de kg)
- Gourmet Personalizado → Gourmet (no ranking de kg)
- Os 6 tipos canônicos: Catuaí, Torra Clara, Torra Intensa, Bourbon, Yellow, Gourmet

---

## 💡 Dicas de Debugging

### Build falhou no Vercel
```bash
npx tsc --noEmit  # Verificar erros de TypeScript localmente antes de subir
```

### Script retornou "ERRO: Trecho não encontrado"
```bash
# 1. Verificar número de linha atual
grep -n "parte do trecho" components/Arquivo.tsx

# 2. Ver o conteúdo exato
sed -n 'X,Yp' components/Arquivo.tsx

# 3. Reportar para Claude atualizar o script
```

### Erro 405 em rota de API
Normal ao acessar via GET no navegador. Usar curl com POST para testar.

### "insufficient credit balance" no rastreio
Créditos da API Wonca esgotados. Recarregar em `https://labs.wonca.com.br`.