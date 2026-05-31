# OmniGestão Pro — MASTER CONTEXT (manual persistente para IA)

> **Propósito:** contexto único, detalhado e auditável para **Claude Projects**, **Cursor** (upload de arquivo / instruções) e chats futuros.  
> **Manutenção:** atualizar quando schema, rotas, integrações ou narrativa real/mock mudarem.  
> **Referência de data:** Maio de 2026 (alinhado a `docs/ai/CURRENT_STATUS.md`, `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`, `docs/roadmap/ROADMAP.md`).

---

## Índice

1. [Como usar este documento](#1-como-usar-este-documento)  
2. [Visão de produto](#2-visão-de-produto)  
3. [Stack técnica (fonte: `package.json` + repositório)](#3-stack-técnica-fonte-packagejson--repositório)  
4. [Arquitetura de aplicação](#4-arquitetura-de-aplicação)  
5. [Módulos, rotas e matriz real / mock / híbrido](#5-módulos-rotas-e-matriz-real--mock--híbrido)  
6. [Sistema de temas e tokens](#6-sistema-de-temas-e-tokens)  
7. [Arquitetura do PDV](#7-arquitetura-do-pdv)  
8. [Regras obrigatórias de engenharia e UX](#8-regras-obrigatórias-de-engenharia-e-ux)  
9. [Integrações existentes (alto nível)](#9-integrações-existentes-alto-nível)  
10. [Roadmap e direções de produto](#10-roadmap-e-direções-de-produto)  
11. [Estrutura de pastas relevante](#11-estrutura-de-pastas-relevante)  
12. [Convenções operacionais](#12-convenções-operacionais)  
13. [Autenticação e multi-loja](#13-autenticação-e-multi-loja)  
14. [Documentação correlata (não duplicar sem necessidade)](#14-documentação-correlata-não-duplicar-sem-necessidade)

---

## 1. Como usar este documento

- **Upload em “Arquivos”** do projeto Claude ou anexo no Cursor: mantém vocabulário, rotas e regras alinhados ao repositório.  
- **Instruções resumidas:** copiar apenas §§ **Regras obrigatórias**, **Multi-loja**, **Temas** e **Matriz real/mock**.  
- **Fonte de verdade para detalhes finos:** código (`app/`, `lib/`, `components/`, `prisma/schema.prisma`) e relatórios em `docs/modules/reports/`. Este arquivo prioriza **mapa mental** e **decisões de arquitetura**; números de linha mudam com o tempo.

---

## 2. Visão de produto

### 2.1 O que é o OmniGestão Pro

Plataforma **ERP / SaaS omnichannel** voltada a **PMEs** (pequenas e médias empresas) com foco em **assistência técnica**, **varejo** e **serviços**. Módulos centrais: **Ordens de Serviço (Operações)**, **Financeiro**, **PDV**, **Estoque**, **WhatsApp HUB**, **Marketing IA**, **Marketplace** (planejado), **Cadastros**, **Configurações**, **Omni Agent** (IA operacional em evolução), **Billing / planos** (Stripe).

### 2.2 Objetivo de negócio

Unificar operação diária (vendas, OS, estoque, caixa, comunicação com cliente e finanças) num **único painel web**, com **multi-loja** (`storeId`), trilhas de auditoria onde aplicável (ex.: payload JSONB + histórico em títulos financeiros) e caminho claro para **integrações reais** (Meta WhatsApp, Prisma/Supabase, automações).

### 2.3 Público-alvo

- Lojas de assistência e reparo.  
- Varejo com PDV e necessidade de estoque.  
- Equipes que precisam de **dashboard**, **cadastros** e **financeiro** sem dispersar em várias ferramentas.

### 2.4 Diferenciais técnicos e de produto

- **UI premium** com sub-aplicações **Lovable** isoladas (`MemoryRouter`) para evitar conflito com o App Router do Next.js.  
- **Camada de serviços** em `lib/operacoes/services/` e `lib/financeiro/services/` consumida por **Server Actions** e APIs — padrão explícito de integração gradual.  
- **Temas enterprise** múltiplos com tokens CSS (`globals.css`) e persistência em `localStorage`.  
- **Multi-loja** enraizado em headers/cookies e em todo acesso Prisma.  
- **PWA** e deploy na **Vercel** (`@ducanh2912/next-pwa` no projeto).

---

## 3. Stack técnica (fonte: `package.json` + repositório)

| Camada | Tecnologia / versão (referência) |
|--------|-----------------------------------|
| Framework | **Next.js 16** (App Router; scripts usam `--webpack`) |
| UI | **React 19** |
| Linguagem | **TypeScript 5** (strict) |
| ORM / DB | **Prisma 6** + **PostgreSQL** (Supabase: pooler `DATABASE_URL`, direto `DIRECT_URL` para migrations) |
| Estilo | **Tailwind CSS 4** + **shadcn/ui** (estilo New York, base zinc) |
| Formulários / validação | **React Hook Form** + **Zod** |
| Estado global (ex.: operações/PDV) | **Zustand** (`lib/operations-store.tsx`) |
| Auth (gate externo) | **NextAuth v5** (JWT; `auth.ts`, `auth.config.ts`, `proxy.ts`) |
| Auth interna legada | **AccessGate / PIN** (cookies staff; quando há sessão NextAuth, fluxo diferente — ver layout dashboard) |
| Testes | **Vitest**; E2E **Playwright** (scripts no `package.json`) |
| Pagamentos SaaS | **Stripe** (webhook, prices por plano — variáveis em `CLAUDE.md`) |
| WhatsApp | **Meta Cloud API** (Graph; envio e webhook documentados em `CLAUDE.md` / `CURRENT_STATUS.md`) |

---

## 4. Arquitetura de aplicação

### 4.1 App Router (`app/`)

- Rotas públicas: marketing, login `(auth)/login`, etc.  
- **Dashboard autenticado:** tudo sob `app/dashboard/*` (protegido por `proxy.ts` + NextAuth).  
- **Server Actions** preferidos para mutações internas: `app/actions/` (operacoes, cadastros, whatsapp, omni-agent, auth, …).  
- **API Routes** (`app/api/`): integrações externas, webhooks, painéis legados que consomem REST, probes de health.

### 4.2 Padrão “Lovable HUB”

1. Código gerado/estruturado no Lovable vive em `components/<domínio>/lovable/`.  
2. Wrapper **`*Isolated.tsx`** monta **`MemoryRouter`** para não colidir com a URL do Next.js.  
3. Providers locais (ex.: `OSProvider`, `FinanceiroProvider`) ficam **escopados ao HUB**.  
4. **TypeScript:** pastas Lovable de UI interna podem estar **excluídas** do `tsc` (ver `tsconfig.json`) para evitar poluição de tipos; o shell Next importa apenas wrappers e tipos necessários.  
5. **Tema:** hubs devem alinhar com o tema global via `data-studio-theme` / classes no `documentElement` e funções como `applyGlobalTheme()` (ex.: `components/whatsapp/lovable/.../WhatsAppHub.tsx` documenta sincronização).

### 4.3 Layout global

- **`AppShell`** (`components/painel-inicial/AppShell.tsx`) é o **único dono do scroll** principal da aplicação.  
- **Proibido** em wrappers de HUB/PDV (salvo exceções muito locais): `h-screen` + `overflow-auto` que criem “scroll duplo”.  
- **`min-w-0`** obrigatório em cadeias flex/grid para evitar overflow horizontal oculto.  
- Hubs “full bleed” cancelam padding do shell com margens negativas **apenas onde** o padrão do projeto já aprova (ver relatórios PDV: margens negativas + `main { overflow-hidden }` podem causar recorte; há histórico de correção em `docs/modules/reports/PDV_*`).

### 4.4 Camada de domínio

- **`lib/operacoes/services/`** — hidratação OS, payload, timeline, status, políticas de orçamento, sync financeiro.  
- **`lib/operacoes/adapters/`** — OS → Estoque (consumo/restauração); OS → Contas a receber.  
- **`lib/financeiro/services/`** — contas a receber/pagar, saldo, movimentos, ledger lógico.  
- **`lib/financeiro/contracts/`** — enums, origens, **`localKey`** idempotente (área sensível; não alterar prefixos sem análise).  
- **`lib/financeiro/adapters/`** — ex.: materialização de recebível a partir de faturamento de OS.

### 4.5 Modelo de dados (conceito)

- **`payload` (JSONB)** em várias entidades: fonte rica de estado operacional; enums Prisma podem ser “vista colapsada”.  
- **`localKey`** único por `storeId` para idempotência financeira.  
- **Multi-store:** todas as queries devem filtrar por **`storeId`**.

---

## 5. Módulos, rotas e matriz real / mock / híbrido

Legenda: **Real** = Prisma/API como fluxo principal · **Mock** = demonstração / sem persistência de negócio · **Híbrido** = misto ou backend pronto sem UI única.

| Módulo | Rotas / entrada principal | Status |
|--------|---------------------------|--------|
| Painel inicial | `/dashboard` | **Mock / demo** honestizado (KPIs neutros); ainda não é BI real agregado |
| Operações HUB V2 | `/dashboard/operacoes-v2` | **Híbrido** — **OS Prisma** + Server Actions + adapters (receber, estoque na entrega, anexos IndexedDB); UI Lovable; conviver com doc legada que citava “tudo mock” |
| OS legado | `/dashboard/os` | **Real** — fluxo completo alternativo; **risco P0:** duplicidade com HUB V2 |
| Financeiro HUB V2 | `/dashboard/financeiro-v2` | **Dados reais** via FinanceiroRealProvider (header de loja); núcleo **Real** em serviços/APIs. DRE/Fluxo = evolução de UI (R0-L5) |
| Financeiro (guarda-chuva APIs + painéis) | `/api/ops/*`, `/api/financeiro/*`, painéis em `components/dashboard/financeiro/` | **Híbrido** — serviços reais; algumas rotas dashboard stub; pagar com caminho **server-first** + fallback histórico |
| PDV / Vendas | `/dashboard/vendas`, alias `/dashboard/pdv` | **Híbrido** — `finalizeSaleTransaction` real; caixa em **localStorage** por loja |
| Estoque | `/dashboard/estoque`, alias `/dashboard/produtos` | **Híbrido** — dados reais; validar telas vs seed |
| Cadastros HUB | `/dashboard/cadastros-v2`, alias `/dashboard/cadastros` | **Híbrido** — **Server Actions** + Prisma para núcleo |
| Clientes / APIs | `/dashboard/clientes`, `/api/clientes` | **Híbrido** |
| WhatsApp HUB | `/dashboard/whatsapp` | **Híbrido** — Prisma + **Meta Cloud API** (envio/webhook); automações de **evento de sistema** ainda em grande parte simuladas; métricas parcialmente ilustrativas |
| Marketing IA | `/dashboard/marketing-ia`, `/dashboard/marketing` | **Híbrido** — APIs em `app/api/marketing/*`; partes mock/calendário |
| Omni Agent / IA Mestre | `/dashboard/ia-mestre`, componentes `components/omni-agent/` | **Híbrido** — ver `docs/ai/AGENT_HUB.md`: inbox e executor **reais** (Fase 1+); várias abas ainda demonstração |
| Marketplace | `/dashboard/marketplace` (se exposto) | **Não iniciado / placeholder** |
| Configurações | `/dashboard/configuracoes`, v2, v3 | **Híbrido** — múltiplas superfícies; permissões citadas em `CURRENT_STATUS.md` |
| Master Console | rota dedicada (master-console) | **Mock** — KPIs fixos até ligação Prisma |
| Billing / planos | `/meu-plano`, `/api/credits/*`, Stripe | **Híbrido** |
| Relatórios | `/dashboard/relatorios` | Placeholder honesto (`ModuleEmDesenvolvimento`) onde aplicável |
| Dev health | `/dashboard/dev-health` | **Real** com guard (`ENABLE_DEV_HEALTH` em produção) |

Para decisões de **prioridade P0/P1** e riscos de lançamento**, usar a auditoria:** `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`.

---

## 6. Sistema de temas e tokens

### 6.1 Fontes de verdade

- **Variáveis CSS** definidas em `app/globals.css` (`:root`, classes `.soft-ice`, `.midnight`, `.black-edition` e bloco reforçado de Black Edition).  
- **Provider React:** `components/theme/ThemeProvider.tsx` — `StudioThemeProvider` persiste em **`localStorage`** chave **`omni-studio-dual-theme`**, aplica classe no `<html>` e atributo **`data-studio-theme`**.  
- **next-themes** no `app/layout.tsx` lista `themes={["light", "soft-ice", "midnight", "black-edition"]}` com default configurável.  
- **Hubs Lovable** podem manter `data-hub-theme` interno; a regra de produto é **sincronizar** com o global quando o HUB altera tema (ex.: WhatsApp / Operações / Cadastros).

### 6.2 Os quatro temas oficiais (comportamento)

| Tema | Classe no `<html>` | `data-studio-theme` ( típico ) | Identidade |
|------|-------------------|-------------------------------|--------------|
| **Light** | `light` | `light` ou `classic` (modo “classic” do studio mapeia para light) | Marca **vermelha**; fundos claros; contraste reforçado em `html.light[data-studio-theme="classic"]` para `--muted-foreground` |
| **Soft Ice** | `soft-ice` | `soft-ice` | Neutro **azul gelo**; superfícies frias; primário azul oklch |
| **Midnight** | `midnight` | `midnight` | **Enterprise escuro** azul profundo; foreground claros |
| **Black Edition** | `black-edition` | `black` (hub pode gravar `black` enquanto classe real é `black-edition`) | **Preto premium** + acento **verde** (terminal / alto contraste); bloco extra em `.black-edition` força preto absoluto oklch(0 0 0) em vários tokens |

**Nota de implementação:** existe duplicação histórica de regras `.black-edition` em `globals.css` (bloco base + bloco “v0”); ambos visam a mesma identidade visual. IAs não devem introduzir terceiro esquema sem alinhar variáveis.

### 6.3 Tailwind v4 — variantes custom

Em `globals.css`:

```text
@custom-variant soft-ice (&:is(.soft-ice *));
@custom-variant midnight (&:is(.midnight *));
@custom-variant black-edition (&:is(.black-edition *));
```

Permitem estilos condicionais por tema sem espalhar `dark:` apenas.

### 6.4 Tokens semânticos (obrigatório na aplicação principal)

Usar classes Tailwind mapeadas a variáveis shadcn:

- **Superfície:** `bg-background`, `text-foreground`, `border-border`  
- **Hierarquia:** `bg-card`, `text-card-foreground`, `bg-muted`, `text-muted-foreground`  
- **Marca / ação:** `bg-primary`, `text-primary`, `text-primary-foreground`  
- **Perigo:** `text-destructive`, `bg-destructive` (com foreground correspondente)  
- **Sidebar (shell):** `bg-sidebar`, `text-sidebar-foreground`, etc.

### 6.5 Tokens específicos PDV (“Omni Classic”)

Em `:root` de `globals.css` há família **`--pos-*`** (HSL) para superfície do PDV, linhas, cabeçalho, inputs, sombras (`--shadow-pos`). O shell **`pdv-omni-classic-shell.tsx`** usa `hsl(var(--pos-input))` etc. no modo clássico e um ramo **`tone="black"`** para campos no Black Edition com **preto absoluto** intencional (`#000000`, bordas `white/xx`) — é **exceção localizada** ao guideline global de “sem hardcode”, justificada pela fidelidade visual POS.

### 6.6 Regras de contraste e acessibilidade

- **`text-foreground` sobre `bg-background`** deve permanecer legível em **todos** os temas; ajustes finos usam `muted-foreground` para hierarquia, não cinza arbitrário.  
- **Light + `classic`:** ajuste explícito de `--muted-foreground` para leitura de labels secundários.  
- **Black Edition:** alto contraste com primário verde; cuidado ao misturar `opacity` baixa com texto pequeno.

### 6.7 O que evitar (temas)

- **`bg-white` / `text-black` / `text-white`** como padrão de layout (só permitido em ilustrações ou exceções POS documentadas).  
- **Hex livres** para superfícies grandes (`#1a1a1a` espalhado) — preferir tokens.  
- **`dark:` único** como substituto do sistema de quatro temas — pode quebrar Soft Ice / Midnight.

### 6.8 Padrões visuais atuais

- **New York / zinc** como base shadcn.  
- **Inter** + display **Space Grotesk** (variáveis `--font-*` em `:root`).  
- **Sombras** elegantes via `--shadow-card`, `--shadow-elegant`, `--shadow-glow` por tema.  
- **Bordas** arredondadas com `--radius`.

---

## 7. Arquitetura do PDV

### 7.1 Entrada e roteamento

- **Rota principal:** `app/dashboard/vendas/page.tsx` → **`VendasPageClient`** (`vendas-page-client.tsx`).  
- **Alias:** `/dashboard/pdv` → vendas (documentado em `CURRENT_STATUS.md`).  
- **Modo rápido:** query **`?modo=rapido`** persiste preferência via `lib/omnigestao-pdv-modo.ts`; se usuário preferiu rápido, redireciona de volta para `?modo=rapido`.  
- **`data-theme`** no `documentElement` é espelhado a partir de `useStudioTheme().mode` para compatibilidade com trechos legados (`classic` → `light`).

### 7.2 Seleção de layout macro (`VendasPDV`)

Arquivo: `components/dashboard/vendas/vendas-pdv.tsx`.

1. **`PdvLayout`:** `classic` vs **`supermercado`** (chave localStorage `@omnigestao:pdv-layout`).  
2. **Inferência inicial:** perfil da loja (`usePerfilLoja`), ramo de atuação por loja (`@omnigestao:ramo-atuacao:<storeId>`) — se não for `assistencia`, tende a **supermercado**.  
3. **Classic** renderiza **`PdvClassic`** com `uiShell="omni-smart"` e `classicLayoutKind` vindo de `readPdvClassicLayout()` / settings `pdvParams.pdvClassicLayout` (**`lovable`** vs **`services`**).  
4. **Supermercado** renderiza **`PdvSupermercado`**.

### 7.3 PDV Assistência (enterprise)

- Implementação principal: **`pdv-assistencia-enterprise.tsx`** (usada no ramo “services” / assistência técnica do classic).  
- Catálogo mesclado: **`PDV_PRODUCTS_BASE`**, `mergePdvCatalogWithInventory`, busca unificada **`filterPdvCatalogBySearch`** (`lib/pdv-product-search.ts`), scan **`findPdvProductByScan`**.  
- **Finalização:** `useOperationsStore().finalizeSaleTransaction` — transação de venda real conforme store.  
- **Caixa:** **`CaixaStatusBar`** compartilhada; persistência de sessão/caixa documentada como **localStorage por `storeId`** (ver `CURRENT_STATUS.md`).  
- **Operador:** `getOrCreatePdvOperatorId` para auditoria.

### 7.4 PDV Clássico / “Omni” shell e PDV Rápido

- **`pdv-classic.tsx`:** dois mundos — `uiShell === "default"` (layout “Services” legado) vs **`omni-smart`** (shell Lovable com `PdvOmniClassicShell`).  
- **Modo rápido** altera UX (foco bipe, Escape remove último item no smart shell, etc.).  
- **`pdv-omni-classic-shell.tsx`:** barra de atalhos visível; integração com tema studio (`useStudioTheme`).

### 7.5 Venda completa

- Em **`pdv-classic.tsx`**, modo de venda **`saleMode === "completa"`** exige **cliente selecionado** antes de finalizar (`disabled` no botão se não houver cliente) e opção de **emitir nota** (NFC-e ainda **não** implementada de ponta a ponta — ver §7.7).  
- Campos e fluxo de pagamento passam por **`PaymentModal`** e estado de carrinho compartilhado com o store de operações.

### 7.6 Atalhos de teclado (F1–F12 e afins)

Os atalhos **não são idênticos** entre `uiShell === "default"` e **`omni-smart`**, e o **PDV Assistência** tem matriz própria.

**A) Layout legado Services (`uiShell === "default"`)** — trecho em `pdv-classic.tsx`:

- **F1:** ajuda de teclado.  
- **F2 / Alt+P:** abrir pagamento (com intenção instantânea resetada no F2).  
- **F3:** foco busca produto.  
- **F4:** foco quantidade ou busca se carrinho vazio.  
- **Alt+D:** pagamento.  
- **F10** e **Espaço** (fora de input): finalizar / abrir pagamento.  
- **Escape:** fecha modais / em modo rápido pode remover último item se condições.

**B) Shell omni-smart (`PdvOmniClassicShell`)** — função `openShellShortcut`:

- **F1:** finalizar (abre pagamento).  
- **F2:** busca cliente.  
- **F3:** busca produto.  
- **F4:** editar quantidade do item selecionado.  
- **F5:** remove item selecionado.  
- **F6:** cancelar venda.  
- **F7 / F8:** voltar ao bipe.  
- **F9:** contas a receber (modal).  
- **CTRL** solto após pressionar Control: funções avançadas.

A barra visual em `pdv-omni-classic-shell.tsx` lista F1–F9 + CTRL (marketing de atalhos); o código do classic estende F10–F12 apenas onde implementado no assistência.

**C) PDV Assistência Enterprise** — `keydown` global:

- **F1:** pagamento modo **dinheiro** (abre modal).  
- **F2 / F3:** foco cliente / bipe.  
- **F4:** toast “em breve” (alterar quantidade).  
- **F5:** remove último item (fora de input).  
- **F6:** confirma limpeza de venda.  
- **F7:** desconto (modo não rápido) ou toast.  
- **F8:** trocas.  
- **F9 / F10:** toast “em breve” (receber / menu caixa).  
- **F11:** fullscreen.  
- **F12:** pagamento **múltiplo**.  
- **End:** alterna help.  
- **Delete:** remove último item (regras de contexto).

Sempre que uma IA documentar “F1 = X”, deve **qualificar o arquivo e o shell**.

### 7.7 NFC-e (futura)

- **Estado atual:** UI e copy podem mencionar emissão ou preparação; **não há** pipeline fiscal completo documentado como produção neste repositório.  
- **Direção:** integração futura com provedor fiscal / SEFAZ / certificado A1, geração de XML, contingência, cancelamento — exige módulo dedicado, fila e persistência legal. Tratar como **roadmap**, não como feature entregue.

### 7.8 Caixa

- **Status visual:** `CaixaStatusBar`.  
- **Persistência:** principalmente **client-side por loja** (localStorage); **implicação:** multi-terminal sem sync server é limitação conhecida (P1 na auditoria).  
- **Operações de sangria/reforço:** fluxo HTTP em `pdv-classic` com header `x-assistec-loja-id` para registrar no backend quando aplicável.

### 7.9 Múltiplos layouts (resumo)

| Dimensão | Opções |
|----------|--------|
| Macro | **Classic** vs **Supermercado** |
| Classic interno | **lovable** vs **services** (assistência enterprise) |
| Fluxo de venda | Simples vs **completa** (cliente obrigatório) |
| Velocidade | Normal vs **rápido** (`?modo=rapido`) |

---

## 8. Regras obrigatórias de engenharia e UX

1. **Cores:** não usar **`bg-white` / `text-black`** como base; usar **`bg-background`**, **`text-foreground`**, tokens shadcn.  
2. **Exceções** apenas com comentário e escopo fechado (ex.: POS Black Edition).  
3. **Scroll:** respeitar **AppShell**; não criar segundo scroll de página nos HUBs.  
4. **`min-w-0`** em flex/grid children com conteúdo desconhecido.  
5. **Multi-loja:** toda leitura/escrita Prisma com **`storeId`** válido.  
6. **Mutações:** preferir **Server Actions** → serviço → Prisma; não chamar Prisma de componente cliente.  
7. **Commits pequenos** e mensagens claras (uma intenção por commit quando possível).  
8. **Módulos isolados:** não acoplar imports de um HOV Lovable em outro domínio sem wrapper.  
9. **Mocks:** não introduzir **dados fictícios** como se fossem produção; usar badges **Preview/Demo** ou empty states honestos (`ModuleEmDesenvolvimento`, etc.).  
10. **Fluxos reais:** priorizar integração com Prisma e APIs já existentes antes de expandir UI mock.  
11. **Typecheck:** `npx tsc --noEmit` antes de merge/deploy crítico.  
12. **Arquivos sensíveis:** ver tabela em `.claude/skills/omnigestao-master/SKILL.md` (auth, proxy, schema, contratos financeiros, AppShell).

---

## 9. Integrações existentes (alto nível)

- **Supabase Postgres** via Prisma.  
- **NextAuth v5** — email/senha admin, JWT.  
- **Stripe** — billing (prices, webhook).  
- **Meta WhatsApp Cloud API** — envio (`/api/whatsapp/send`, `lib/whatsapp.ts`), webhook (`/api/webhooks/whatsapp`), serviço `lib/whatsapp/whatsapp-service.ts`.  
- **OpenRouter / OpenAI** — variáveis em `CLAUDE.md` para IA.  
- **Automações** — engine + rota simulação `/api/automation/handle-event`; event bus `lib/events/event-bus.ts`.  
- **Omni Agent** — comandos persistidos `OmniAgentCommand`, executor com Prisma (ver `AGENT_HUB.md`).

---

## 10. Roadmap e direções de produto

Macro fases em `docs/roadmap/ROADMAP.md`:

- **Fase A:** fundação (OS persistida, adapters, núcleo financeiro server-side, PDV, temas).  
- **Fase B:** MVP comercial (produto único OS, auth real, financeiro percebido como real, deploy checklist).  
- **Fase C:** consolidação multi-módulo (Vendas HUB, WhatsApp produção, reduzir duplicidade localStorage).  
- **Fase D:** expansão (Marketplace, Omni Agent auditável, ledger definitivo).

Itens explícitos alinhados ao pedido de produto / auditoria:

| Iniciativa | Notas |
|------------|--------|
| **PDV Enterprise** | Consolidar layouts, caixa multi-terminal, observabilidade, atalhos completos F9/F10, relatórios de turno |
| **Venda completa** | Já existe ramo de UI; evoluir regras fiscais, vínculo a NF, logística |
| **WhatsApp IA** | Templates, automações fora da simulação, governança de custo |
| **Automação** | Ligar eventos reais ao motor sem `runAutomationSimulation` como caminho principal |
| **Marketplace real** | P3; modelo de sync com canais externos ainda não definido |
| **NFC-e futura** | Módulo fiscal dedicado; dependências legais e certificado |

---

## 11. Estrutura de pastas relevante

```text
app/                      # App Router: páginas, layouts, API routes, actions não devem ficar espalhadas fora de padrão
app/actions/              # Server Actions (orquestração)
app/api/                  # REST, webhooks, integrações
app/dashboard/            # Rotas autenticadas do produto
components/
  painel-inicial/         # AppShell, shell dashboard
  dashboard/              # UI “nativa” Next (PDV, financeiro legado, …)
  operacoes/lovable/      # Operações HUB
  financeiro/lovable/     # Financeiro HUB
  whatsapp/lovable/       # WhatsApp HUB
  cadastros/lovable/      # Cadastros HUB
  vendas-hub/             # Vendas HUB (TanStack Router SPA)
  omni-agent/             # Omni Agent
  theme/                  # StudioThemeProvider
  ui/                     # shadcn + estados (Empty, Loading, Error)
lib/
  operacoes/              # services + adapters OS
  financeiro/             # services + adapters + contracts + types
  whatsapp/               # cliente Cloud API + serviço de domínio
  omni-agent/             # interpretador + executor
  prisma.ts               # singleton Prisma
  operations-store.tsx    # Zustand: inventário, vendas, finalizeSaleTransaction
  store-id-from-request.ts# Resolução storeId em APIs
prisma/schema.prisma      # Modelo multi-store
docs/                     # Memória técnica, relatórios, roadmap
```

**Aliases TypeScript** importantes estão em `tsconfig.json` (ex.: `@/components/operacoes` → Lovable).

---

## 12. Convenções operacionais

### 12.1 `storeId` e multi-loja

- Header HTTP: **`x-assistec-loja-id`** (`ASSISTEC_LOJA_HEADER` em `lib/assistec-headers.ts`).  
- Leituras: `storeIdFromAssistecRequestForRead` — header → query `storeId`/`lojaId` → cookie loja ativa → fallback legado.  
- Escritas: `storeIdFromAssistecRequestForWrite` — **exige** header ou query explícita (cookie sozinho não basta — mitigação CSRF).

### 12.2 Context providers

- Providers globais no layout raiz ou dashboard (tema, loja ativa, settings).  
- Providers de HUB **dentro** do `*Isolated.tsx`.  
- Não exportar estado de um HUB para o app inteiro sem necessidade.

### 12.3 Services e Actions

- **Action fina** + **serviço grosso** (reutilizável em API route).  
- Contratos e idempotência em **`lib/financeiro/contracts/`**.

### 12.4 APIs vs Server Actions

- **Actions:** mesmo processo Next, menos overhead para UI dashboard.  
- **APIs:** webhooks, clientes externos, painéis que já usam `fetch` REST, mobile futuro.

---

## 13. Autenticação e multi-loja

- **Camada 1 — NextAuth v5:** protege `/dashboard/*` (`proxy.ts`); sessão JWT; roles `SUPER_ADMIN | ADMIN | GERENTE | OPERADOR`.  
- **Camada 2 — AccessGate / PIN:** legado staff em cookie/localStorage quando não há sessão NextAuth — **inadequado para B2B pago** sem endurecimento (P0 auditoria).  
- **Seeds admin:** `npm run db:seed-admin` (ver `CLAUDE.md`).

---

## 14. Documentação correlata (não duplicar sem necessidade)

| Documento | Uso |
|-----------|-----|
| `CLAUDE.md` | Comandos, ENV, arquivos-chave |
| `docs/ai/CURRENT_STATUS.md` | Estado vivo detalhado por feature |
| `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md` | Matriz P0/P1 e riscos |
| `docs/roadmap/ROADMAP.md` | Fases macro |
| `docs/architecture/BACKEND.md` | Camada backend |
| `docs/modules/FINANCEIRO.md` / `OPERACOES.md` | Profundidade por domínio |
| `docs/ai/AGENT_HUB.md` | Omni Agent real vs mock |
| `docs/ai/UI_RULES.md` | Regras UI adicionais se existirem |
| `docs/themes/THEMES.md` | Placeholder no repo; **este MASTER_CONTEXT** substitui para IA até o THEMES.md ser preenchido |

---

*Fim do MASTER CONTEXT — OmniGestão Pro.*
