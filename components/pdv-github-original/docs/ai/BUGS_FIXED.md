# OmniGestão Pro — Histórico de Bugs Resolvidos

> Referência para evitar regressões. Antes de alterar layout/tema/automações, consultar este arquivo.

---

## Layout e Overflow

### `sticky top-0` causando scrollbar interna no hub
- **Causa:** `sticky` cria um stacking context e ancora o elemento ao scroll container mais próximo com `overflow` definido. Dentro do AppShell, isso criava um segundo viewport scrollável, resultando em duas barras de rolagem.
- **Solução:** Remover `sticky top-0` do `<header>` do `OperacoesLayout`. O header passa a ser elemento de fluxo normal.
- **Arquivo:** `components/operacoes/lovable/components/operacoes/OperacoesLayout.tsx`

---

### `-my-6` cortando o topo do Operações HUB
- **Causa:** `-my-6` (`margin-top: -24px`) no wrapper da page subia o hub para cima do `padding-top: 24px` do AppShell, fazendo o header do hub sobrepor o header global do OmniGestão. O conteúdo do hub ficava parcialmente oculto atrás do header global.
- **Solução:** Remover `-my-6` do `page.tsx`. Manter apenas `-mx-*` para cancelar o padding lateral. O padding vertical do AppShell (`py-6`) é mantido.
- **Arquivo:** `app/dashboard/operacoes-v2/page.tsx`

---

### Ausência de `min-w-0` causando overflow lateral / faixa na direita
- **Causa:** Em layouts `flex`, itens têm `min-width: auto` por padrão. Elementos internos com largura fixa (ex: `w-64` no input de busca) forçavam o item flex a ser mais largo que o espaço disponível, criando overflow horizontal e a "faixa" lateral visível.
- **Solução:** Adicionar `min-w-0` em todos os wrappers principais da cadeia flex: `OperacoesHubIsolated`, root do `OperacoesLayout`, e `<main>` do `OperacoesLayout`.
- **Arquivos:** `OperacoesHubIsolated.tsx`, `OperacoesLayout.tsx`

---

### Kanban com overflow horizontal infinito
- **Causa:** Layout `flex + overflow-x-auto` com colunas de `w-[300px] shrink-0`. Em telas menores, as colunas ultrapassavam a largura disponível e criavam scrollbar horizontal em toda a aba Kanban.
- **Solução:** Substituir por `grid` responsivo: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`. Remover `w-[300px]` e `shrink-0` das colunas.
- **Arquivo:** `components/operacoes/lovable/components/operacoes/OSKanban.tsx`

---

### `min-h-screen` causando segunda barra de rolagem vertical
- **Causa:** `min-h-screen` no root do `OperacoesLayout` forçava o hub a ter `100vh` de altura mínima dentro do AppShell. Quando o conteúdo era mais alto que a tela, tanto o AppShell quanto o hub tentavam exibir scrollbar.
- **Solução:** Remover `min-h-screen` do root do `OperacoesLayout`.
- **Arquivo:** `components/operacoes/lovable/components/operacoes/OperacoesLayout.tsx`

---

### `max-w-7xl` comprimindo conteúdo do hub
- **Causa:** `max-w-7xl mx-auto` no `<header>` interno e no `<main>` do `OperacoesLayout` limitava o conteúdo a 1280px, fazendo o hub parecer menor que o original Lovable.
- **Solução:** Substituir por `w-full` sem `max-w-*` ou `mx-auto`.
- **Arquivo:** `components/operacoes/lovable/components/operacoes/OperacoesLayout.tsx`

---

### WhatsApp HUB com tema não aplicando full screen
- **Causa 1:** O Lovable Hub usava `data-theme` e `localStorage` com chave `omni-theme`, desconectados do sistema global de temas (`data-studio-theme`, `black-edition`, `omni-studio-dual-theme`).
- **Causa 2:** Margens negativas (`-mx-*`) sem compensação da largura criavam `overflow-x` no AppShell.
- **Solução:** Criar `applyHubTheme()` em `WhatsAppHub.tsx` que sincroniza ambos os sistemas. Remover `w-[calc(...)]` do wrapper da page.
- **Arquivo:** `components/whatsapp/lovable/components/whatsapp/WhatsAppHub.tsx`

---

## Automações WhatsApp

### `targetPhone` configurado no HUB sendo ignorado (mensagens indo para número demo)
- **Causa:** A função `ensureDefaultEventAutomations` sobrescrevia `actions.targetPhone` com o número demo `5511999990001` sempre que o servidor reiniciava, apagando o telefone configurado pelo usuário.
- **Solução:** Modificar `ensureDefaultEventAutomations` para fazer merge das actions, preservando `targetPhone` existente: `{ ...defaultActions, ...(existing.targetPhone ? { targetPhone: existing.targetPhone } : {}) }`.
- **Arquivo:** `lib/whatsapp/whatsapp-service.ts`

---

### Automação usando `phoneDigits` do payload em vez do `targetPhone` configurado
- **Causa:** A lógica de `effectivePhone` no engine priorizava `phoneDigits` do payload para TODOS os tipos de trigger, ignorando o `targetPhone` configurado para `system_event`.
- **Solução:** Diferenciar por `triggerType`: para `system_event` → `targetPhone || phoneDigits`; para inbound/keyword → `phoneDigits || targetPhone`.
- **Arquivo:** `lib/automation/automation-engine.ts`

---

## Navegação e Permissões

### Links do sidebar redirecionando para landing page ou `/dashboard/vendas`
- **Causa:** Links hardcoded incorretos e regras de `isCaixa` muito amplas no `proxy.ts` bloqueando usuários legítimos.
- **Solução:** Corrigir URLs nos menus, ajustar lógica de `isCaixa` para restringir apenas `VENDEDOR`/`OPERADOR`.
- **Arquivos:** `Sidebar.tsx`, `mobile-nav.tsx`, `lib/proxy.ts`

---

### "Forbidden" ao salvar configurações de PDV
- **Causa:** `PUT /api/stores/[id]/settings` usava `requireAdmin()` que exigia cookie `assistec_admin_session`, bloqueando proprietários de loja sem esse cookie específico.
- **Solução:** Criar `canManageStoreSettings()` que aceita `ADMIN`, `GERENTE` ou proprietário da loja autenticado.
- **Arquivo:** `app/api/stores/[id]/settings/route.ts`

---

## TypeScript

### Erros de tipos nos arquivos internos do Lovable (scaffolding)
- **Causa:** Hubs Lovable incluem cópias de `components/ui/`, `routes/`, `hooks/` com dependências internas incompatíveis (`react-router-dom` não instalado, `@testing-library` ausente, etc.).
- **Solução:** Adicionar as pastas problemáticas ao `exclude` do `tsconfig.json`. Os arquivos compilados de hub usam `@/components/ui/*` (raiz do projeto) e não as cópias internas.
- **Arquivo:** `tsconfig.json`

---

### Path aliases `@/types/*`, `@/api/*` não resolvendo para arquivos do hub Lovable
- **Causa:** `@/*` mapeava para a raiz do projeto, mas os tipos/APIs do Operações HUB estavam em `components/operacoes/lovable/types/` e `components/operacoes/lovable/api/`, não na raiz.
- **Solução:** Adicionar aliases específicos no `paths` do `tsconfig.json` apontando para as subpastas do Lovable, colocados ANTES do catch-all `@/*`.
- **Arquivo:** `tsconfig.json`
