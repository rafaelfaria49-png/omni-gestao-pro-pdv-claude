# Operações HUB V2 — Check-in técnico (estado atual)

Data: 2026-05-07  
Escopo: análise **somente leitura** do Operações HUB V2 (Lovable) dentro do OmniGestão Pro.

## 1) Arquitetura e estrutura atual

### 1.1 Entrada no Next.js (App Router)

- **Rota**: `/dashboard/operacoes-v2`
- **Arquivo**: `app/dashboard/operacoes-v2/page.tsx`
  - Carrega o hub via `dynamic(..., { ssr:false })`
  - Wrapper usa `-mx-4 sm:-mx-6 lg:-mx-8` para “encaixar” o hub no AppShell sem sobrepor header global.

### 1.2 Isolamento do Hub Lovable

- **Wrapper**: `components/operacoes/lovable/OperacoesHubIsolated.tsx`
  - Usa `MemoryRouter` (React Router) com rotas internas:
    - `/operacoes`
    - `/operacoes/dashboard`
    - `/operacoes/os`
    - `/operacoes/os/:id`
    - `/operacoes/tecnicos`
    - `/operacoes/historico`
    - `/operacoes/garantias`
    - `/operacoes/servicos`
    - `/operacoes/notificacoes`
  - `OSProvider` (Context API) encapsula estado/dados do módulo.

**Risco**: o Hub é um “sub-app” dentro do Next (roteamento interno isolado). Integrações baseadas em URL/App Router não reaproveitam automaticamente estado/navegação do hub.

### 1.3 Provider/Store local (dados e ações)

- **Store principal**: `components/operacoes/lovable/store/osStore.tsx`
  - **Não usa Zustand global**; usa **Context API** com `OSProvider` + `useOS()`
  - Carrega dados via `refresh()` com `Promise.all(...)`
  - Mantém um “mix” de fontes reais e mocks (detalhado na seção 4).

### 1.4 “API layer” do módulo (abstrações)

Arquivos relevantes:
- `components/operacoes/lovable/api/os.ts`
- `components/operacoes/lovable/api/clientes.ts`
- `components/operacoes/lovable/api/servicos.ts`
- `components/operacoes/lovable/api/estoque.ts`
- `components/operacoes/lovable/api/vendas.ts`
- `components/operacoes/lovable/api/atendimentos.ts`
- `components/operacoes/lovable/api/lojas.ts`
- `components/operacoes/lovable/api/_db.ts` (**DB em memória** / seeds)

### 1.5 Tipos, utils e seeds

- **Domínio OS do HUB**: `components/operacoes/lovable/types/os.ts`
- Seeds mock:
  - `components/operacoes/lovable/data/osSeed.ts`
  - `components/operacoes/lovable/data/estoqueSeed.ts`
  - `components/operacoes/lovable/data/vendasSeed.ts` (seed vazio)
  - `components/operacoes/lovable/data/atendimentosSeed.ts`
  - `components/operacoes/lovable/data/lojasSeed.ts`
  - `components/operacoes/lovable/data/clientesSeed.ts`

### 1.6 CSS / tema do módulo

- `components/operacoes/lovable/index.css`
  - Tokens HSL e temas “scoped” via `[data-hub-theme="..."]`
  - Também contém bloco `.dark { ... }` (padrão shadcn) — coexistência de abordagens.

## 2) Estado visual (layout/escala/overflow/responsividade/tema)

### 2.1 Layout / padding / overflow

- **Encaixe no AppShell**: `app/dashboard/operacoes-v2/page.tsx` remove só padding lateral.
- **Layout interno**: `components/operacoes/lovable/components/operacoes/OperacoesLayout.tsx`
  - `main` usa `px-4 py-6 sm:px-6 lg:px-8`
  - Kanban/Detalhe usam `overflow-x-auto` onde necessário

### 2.2 Responsividade

Achados:
- Navegação do header do hub é `hidden md:flex`
- Busca do header é `hidden md:block`
- Grids responsivos por breakpoints (`sm`, `lg`, `2xl`)

### 2.3 Sincronização de tema

- **Hub theme**: aplicado localmente via `data-hub-theme` (light/soft-ice/midnight/black)
- **Sincronia com tema global**: `OperacoesLayout.tsx` lê/salva em `localStorage` (`omni-studio-dual-theme`) e **muta classes/atributos no `document.documentElement`**
  - classes globais: `light`, `soft-ice`, `midnight`, `black-edition`
  - atributo `data-studio-theme`

**Riscos**
- O hub não é totalmente “side-effect free”: mexe no `<html>` para sincronizar tema.
- Existem cores fixas pontuais (ex.: swatch hex no `ThemeSwitcher`).

## 3) Funcionalidades existentes (por área)

### 3.1 Hub (home)
- `components/operacoes/lovable/pages/OperacoesHub.tsx`
- Cards de navegação e stats derivadas de `useOS()`

### 3.2 Kanban de OS
- `components/operacoes/lovable/pages/OrdensServico.tsx`
- `components/operacoes/lovable/components/operacoes/OSKanban.tsx`
- Drag & drop muda status via `moveStatus(...)`
- Filtros existem no Kanban, mas o botão “Filtros” na página é placeholder (`toast("em breve")`)

### 3.3 Detalhe da OS
Arquivos principais:
- `components/operacoes/lovable/pages/OSDetalhe.tsx`
- Timeline: `components/operacoes/lovable/components/operacoes/Timeline.tsx`
- Orçamento editor: `components/operacoes/lovable/components/operacoes/OrcamentoPanel.tsx`
- Observações/Anexos: `ObservacoesPanel.tsx`, `AnexosPanel.tsx`
- Modais: IA, Portal do Cliente, Impressão, Etiqueta, Modo bancada, Retorno de garantia etc.

Observação: ações de WhatsApp/integrações aparecem como UI com `toast` (integração futura).

### 3.4 Dashboard operacional
- `components/operacoes/lovable/pages/DashboardOperacional.tsx`
- KPIs derivados localmente do estado do hub

### 3.5 Técnicos
- `components/operacoes/lovable/pages/Tecnicos.tsx`
- KPIs por técnico, com campos explicitamente “simulados” (tempo médio)

### 3.6 Histórico de clientes
- `components/operacoes/lovable/pages/HistoricoClientes.tsx`
- Busca local em clientes + lista de OS por cliente

### 3.7 Garantias
- `components/operacoes/lovable/pages/Garantias.tsx`
- Segmenta garantias por status (ativa/vencendo/expirada) e abre modal de retorno

### 3.8 Serviços
- `components/operacoes/lovable/pages/Servicos.tsx`
- CRUD visual existe, mas persistência do “upsert” é bloqueada (ver seção 4)

### 3.9 Notificações
- `components/operacoes/lovable/pages/Notificacoes.tsx`
- Switches locais; texto explícito que é mock.

## 4) Estado operacional: o que é real vs mock vs incompleto

### 4.1 Fluxos “reais” (com Prisma / server actions)

**OS (Ordem de Serviço)**
- `components/operacoes/lovable/api/os.ts` chama **Server Actions**:
  - `app/actions/operacoes.ts` (`use server`, Prisma)
  - Persiste `status` e `payload` (JSONB) em `OrdemServico`
  - Revalida `/dashboard/operacoes-v2`

**Cadastros usados pelo hub (leitura)**
- Clientes, técnicos, serviços, produtos, modelos (via `app/actions/cadastros`)

### 4.2 Mock ativo (DB em memória + seeds)

Dados/mutações em memória (não Prisma):
- **Estoque/peças**: `components/operacoes/lovable/api/estoque.ts` → `api/_db.ts` + `data/estoqueSeed.ts`
- **Vendas/faturamento do hub**: `components/operacoes/lovable/api/vendas.ts` (cria “venda” em memória)
- **Atendimentos rápidos**: `api/atendimentos.ts` (seed em memória)
- **Lojas**: `api/lojas.ts` (seed em memória)

### 4.3 UI/placeholder (sem integração real)

Exemplos:
- Botões com `toast("integração futura")` no detalhe (WhatsApp)
- Notificações: switches locais (mock)
- Botão “Filtros” na página Kanban: placeholder

### 4.4 Parcialmente conectado (risco de “parece real”)

**Serviços**
- `components/operacoes/lovable/api/servicos.ts`:
  - listagem vem do Cadastros HUB (real)
  - `upsertServico`: retorna input sem persistência (escrita “travada”)

## 5) Integração com o sistema (Event Bus, automations, etc.)

### 5.1 Dentro do Operações HUB Lovable

- Store local: `useOS()` via `OSProvider`
- Integração mais concreta: **Cadastros** + **Server Actions de OS**
- Não há evidência forte de Event Bus direto no hub Lovable (o que existe é majoritariamente mock/placeholder).

### 5.2 Fora do hub (linha paralela de “Operações” no sistema)

Há uma stack separada baseada em API routes + automations/event bus:
- `lib/operations-store.tsx` (`useOperationsStore`)
- `app/api/ordens-servico/route.ts` e `app/api/ordens-servico/[id]/route.ts`
  - Prisma + validações + gatilhos de automations (ex.: `handleEvent(...)`)

**Risco principal**: coexistem **duas linhas** para “OS/Operações”:
- HUB Lovable (server actions + payload rico)
- API routes + `useOperationsStore` (event bus/automations)

## 6) Duplicações e conflitos

### 6.1 Duas OS (modelos e estados diferentes) — alto risco

- **OS do HUB (Lovable)**: `components/operacoes/lovable/types/os.ts` (payload rico, timeline, orçamento, SLA, garantia etc.)
- **OS “clássica” do dashboard**: `components/dashboard/os/ordens-servico.tsx`
  - contém `INITIAL_ORDENS` hardcoded e interface `OrdemServico` própria

Impacto:
- status e modelos divergentes
- risco de regras de negócio duplicadas e integração fragmentada

### 6.2 Tema/tokens em camadas

- Tokens por `[data-hub-theme]` + bloco `.dark` + alteração do `<html>` via `applyGlobalTheme`
- Presença pontual de cores fixas Tailwind/hex (quebra consistência em temas)

## 7) Backend atual (o que existe)

### 7.1 Server Actions (usadas pelo HUB)
- `app/actions/operacoes.ts` (Prisma)
  - listagem/criação/atualização de status e payload

### 7.2 API routes (paralelas)
- `app/api/ordens-servico/*` (Prisma + automations)

### 7.3 Prisma
- `prisma/schema.prisma` possui `OrdemServico` com `payload JsonB` e `status` (enum), além de itens etc.

## 8) Tema e tokens (compatibilidade)

Compatibilidade declarada no hub:
- Hub: `light`, `soft-ice`, `midnight`, `black`
- Global: `light`, `soft-ice`, `midnight`, `black-edition` (mapeamento explícito)

Achados:
- uso predominante de tokens (`bg-background`, `text-foreground`, `border-border` etc.)
- exceções: classes de cor fixa e um hex fixo no ThemeSwitcher (risco para consistência visual).

## 9) Build / validação (executado)

- **`npm run lint`**: OK (warnings remanescentes do repo; sem erros)
- **`npx tsc --noEmit`**: OK
- **`npx next build --webpack`**: OK

## 10) O que já está pronto vs o que falta (prioridades)

### Pronto (alto valor, já operacional)
- OS com persistência (status + payload) via Server Actions/Prisma
- Kanban com movimentação de status
- Detalhe da OS com timeline e painéis (orçamento/observações/anexos)
- Integração de leitura com Cadastros (clientes/técnicos/serviços/produtos/modelos)

### Parcial / mock (importante explicitar)
- Estoque/peças (DB em memória)
- Vendas/faturamento do hub (DB em memória)
- Atendimentos rápidos (DB em memória)
- Lojas (DB em memória)
- Notificações (UI mock)
- WhatsApp/automations/event bus (no hub: majoritariamente placeholder)

### Riscos prioritários
- **Duplicidade de OS** (HUB vs dashboard clássico) e divergência de status/modelo
- **Duas vias de backend** para OS (Server Actions vs API routes com automations)
- **Tema**: sincronização via `<html>` pode gerar side effects; presença de cores fixas quebra compatibilidade temática
- Cobertura de tipos reduzida por `tsconfig.json` excluir partes do hub Lovable (UI/hooks/test)

## 11) Sugestões (sem executar mudanças)

### Modularização segura
- Consolidar “linhas” de OS para evitar modelos paralelos
- Definir uma única “fonte de verdade” para eventos/automations (Server Actions ou API routes), com adaptação para o hub

### Integração futura (premium)
- Substituir mocks de estoque/vendas/atendimentos/lojas por integrações reais gradualmente
- Conectar o hub ao event bus/automations de forma isolada (adapter layer), evitando espalhar dependências

