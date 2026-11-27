# Sistema Visual Reutilizável — Omni Premium Enterprise

Documentação definitiva da fundação visual, arquitetura em duas colunas adaptativa, scrollbar nativo de 8px, hierarquia de navegação em dois níveis (L1 + L2), topbar refinada, calibração dos 10 temas oficiais + Alta Legibilidade, tokens locais (`--cfg-*`) e componentes reutilizáveis consolidados nos marcos **Piloto Configurações → Geral** (`Pilot-003` / `Final-004` / `Refinement-005` / `Final-007`), pronta para expansão às demais 13 abas de Configurações e aos demais HUBs do OmniGestão Pro sem duplicar motores de tema.

---

## 1. Arquitetura de Temas, Scrollbar 8px e Tokens

### 1.1 Fonte única de verdade (`app/globals.css` + `styles/legibility.css`)
- **Todos os 10 temas oficiais preservados:**
  - Claros (5): `light` (Vermelho), `soft-ice` (Azul), `neon-ice` (Verde), `violet-ice` (Roxo), `coffee-cream` (Creme/Bronze).
  - Escuros (5): `midnight` (Azul Escuro), `black-edition` (Preto/Verde), `quantum-violet` (Roxo Escuro), `coffee-gold` (Marrom/Dourado), `ruby-black` (Preto/Vermelho).
- **`color-scheme` nativo sincronizado:** cada tema define `color-scheme: light` ou `color-scheme: dark`, alinhando controles nativos (`<select>`, menus, scrollbars) à polaridade ativa.
- **Scrollbar Global Premium de 8px em CSS puro (`app/globals.css`):**
  - Tokens semânticos globais (`--omni-scrollbar-track`, `--omni-scrollbar-thumb`, `--omni-scrollbar-thumb-hover`, `--omni-scrollbar-thumb-active`) calibrados nos 10 temas + Alta Legibilidade (`Aa`), aplicados em `@layer base` a todos os containers roláveis (`*::-webkit-scrollbar` + `::-webkit-scrollbar-button { display: none; width: 0; height: 0; }`), eliminando barras brancas/cinzas nativas e setas de extremidade em Chromium/Edge/app Windows.
  - Compatível com Firefox via `@supports not selector(::-webkit-scrollbar)` (`scrollbar-width: thin; scrollbar-color`), sem desativar `::-webkit-scrollbar` no Chromium 121+.
  - Sem reserva artificial de `[scrollbar-gutter:stable]`: quando não há conteúdo excedente, nenhuma barra ou faixa lateral é exibida; quando há excedente, o padrão tematizado de `8px` aparece rente à borda.
  - **Dono único do scroll no shell compartilhado (`AppShell.tsx` + `DashboardClientLayout.tsx`):** telas de fluxo (`noPadding=false`, como Painel Inicial, Cadastros HUB, Financeiro HUB e Relatórios) rolam diretamente no `<main>` (`rightGap: 0px`) com o padding interno dentro da scrollport (`shrink-0`, preservando o espaçamento inferior ao final da rolagem) — eliminando scroll aninhado e a faixa lateral vazia de `32px`. Telas fixas (`Configurações`, `PDV`, `Operações V2`, `Operações V4`, `Vendas HUB`, `IA Mestre`, `WhatsApp`) preservam seus containers internos próprios com o mesmo acabamento global de `8px`.
- **Tokens `--sidebar*` completos em 10/10 temas** (incluindo `.soft-ice`, `.midnight`, além da calibração sutil do rail de `:root` e `.coffee-gold`).

### 1.2 Camada local de superfícies e tokens semânticos (`components/configuracoes-v3/configuracoes-v3.css`)
Estritamente escopada a `.configuracoes-v3-root` e baseada exclusivamente na classe do tema em `<html>` (sem seletores `[data-theme]` concorrentes):
- **Hierarquia de 4 degraus de superfície (+ recesso de inputs):**
  1. `L1 Global Sidebar`: `var(--sidebar)` (rail âncora mais profundo).
  2. `L2 Contextual Sidebar`: `--cfg-subnav` (superfície intermediária calma).
  3. `Canvas de trabalho`: `--cfg-canvas`.
  4. `Cards elevados` e `inputs/recessos`: `--cfg-surface` e `--cfg-input-bg` / `--cfg-inset`.
- **Tokens semânticos de acabamento (Final-007):**
  - `--cfg-eyebrow`: cabeçalhos de subseção (dourado champagne no `coffee-gold`, grafite executivo no `light`).
  - `--cfg-card-icon-bg` / `--cfg-card-icon-border` / `--cfg-card-icon-fg`: bloco `32×32` do ícone do card (vermelho executivo sólido no `light`; bronze escuro com aro dourado no `coffee-gold`).
  - `--cfg-callout-accent`: filete lateral de painéis informativos (`Impacto do ramo`) em tom neutro nos temas vermelhos (`light`, `ruby-black`) para nunca ser confundido com erro.
  - `--cfg-nav-active-bg` / `--cfg-nav-active-border`: destaque do item ativo na sidebar contextual L2.
  - `--cfg-btn-primary-bg` / `--cfg-btn-primary-fg`: primário comercial calibrado (inclusive estado desabilitado contido sem tom rosado lavado no `light`).
  - `--cfg-input-icon`: ícones sutis internos em campos de contato/endereço.
- **Switches acessíveis (`.cfg-switch`):** `38×21px` com polegar branco com aro sutil de contraste em `coffee-gold`, `midnight` e `neon-ice`, preservando `--primary-foreground` escuro sobre verde luminoso no `black-edition` e em Alta Legibilidade (`Aa`), foco visível e suporte a `forced-colors`.
- **Calibração por família cromática:**
  - **Vermelhos (`light`, `ruby-black`):** vermelho reservado de forma controlada à marca, primários e switches; tiles ativos e caixas informativas usam bordas neutras refinadas, distinguindo identidade de alertas/erros (`--cfg-danger-*`).
  - **Marrons e dourados (`coffee-cream`, `coffee-gold`):** superfícies em camadas quentes sem glow excessivo e aviso semântico (`--cfg-warning-*`) separado do dourado primário.
  - **Azuis (`soft-ice`, `midnight`), Verdes (`neon-ice`, `black-edition`) e Roxos (`violet-ice`, `quantum-violet`):** personalidade própria preservada, 4 degraus tonais reais e hover neutro (`--cfg-hover`).
- **Alta Legibilidade (`html[data-legibility="high"]`):** reforça `--cfg-border-strong`, `--cfg-subtle`, `--cfg-switch-off`, pisos tipográficos e anéis de foco; contraste de texto auxiliar sobe para `9.15:1` (`light`) e `11.26:1` (`coffee-gold`).
- **Contraste WCAG 2.1 medido em sRGB real (10/10 temas):**
  - Textos principais / labels / inputs sobre card: `15.38:1` a `19.80:1` (AAA em 10/10).
  - Textos auxiliares (`muted`) sobre card: `5.49:1` a `7.00:1` (AA+ / AAA em 10/10).
- **Portals escopados:** `Sheet`, `Dialog`, `AlertDialog` e `ToastViewport` em `components/configuracoes-v3/components/ui/` carregam `.configuracoes-v3-root` (e `.cfg-card.cfg-dialog` em diálogos), garantindo paridade total em 10/10 temas e Alta Legibilidade.

---

## 2. Navegação Global (L1), Contextual (L2) e Topbar

Arquivos: `components/painel-inicial/Sidebar.tsx`, `components/painel-inicial/MobileNavSheet.tsx`, `components/painel-inicial/Topbar.tsx`, `components/painel-inicial/StoreSwitcher.tsx`, `components/ia-mestre/ThemeSwitcher.tsx`, `components/theme/LegibilityToggle.tsx`, `components/configuracoes-v3/ConfiguracoesV3Page.tsx`, `components/configuracoes-v3/features/settings/components/SettingsSidebar.tsx`.

- **Identidade oficial na Sidebar Global (L1):**
  - Logotipo oficial `/omni-gestao-pro-icon.svg` preservado em `32×32` (`28×28` no modo foco) com aro hairline (`ring-1 ring-sidebar-border/80`), sem recortes ou caixas artificiais.
  - Alinhamento horizontal de topo (`h-14` = `56px`) contínuo com a Topbar.
  - Item ativo com lavagem direcional (`bg-gradient-to-r from-primary/[0.15] via-primary/[0.09] to-primary/[0.03]`), borda hairline `border-primary/25` e barra vertical primária de `3px`.
  - Micro-tags operacionais discretas (`AI`, `V3`, `V4`, `Beta`, `Legado`, `Preview`), `Compat` sem truncamento (`subtitle: "Películas · Capinhas"`), rodapé calmo (`Servidor Conectado` + `v1.2.4`) e transição suave expandida ↔ recolhida (`228px` → `0px`).
- **Harmonia Dual-Sidebar (L1 + L2):**
  - `SettingsSidebar` (L2) diferencia-se da L1 por superfície mais clara/elevada (`--cfg-subnav`), ícone `Settings` limpo no cabeçalho (sem caixa redundante), divisórias sutis e largura proporcional (`204px`–`214px` com L1 expandida; `222px` com L1 recolhida).
- **Topbar unificada:**
  - Controles com altura e raio consistentes (`h-8 rounded-lg`), breadcrumb com separador `ChevronRight`, busca global (`⌘K`) dedicada em desktop amplo (`hidden xl:flex xl:w-56 2xl:w-72`) e botão-ícone compacto (`inline-flex xl:hidden`) em larguras intermediárias, tablet e mobile para impedir compressão do cabeçalho.
  - Pílula de créditos acalmada (superfície neutra + indicador âmbar discreto + ação `Comprar`), reduzindo competição visual com `+ Novo`.
  - Popover do `ThemeSwitcher` ampliado para `w-72`, eliminando truncamento nos nomes dos 10 temas.

---

## 3. Composição Adaptativa em Duas Colunas e Container Queries

- **Área útil expandida (`ConfiguracoesV3Page.tsx`):**
  - Sidebar global expandida: `max-w-[1440px]` com padding proporcional (`px-4 sm:px-5 lg:px-6 xl:px-7`).
  - Sidebar global recolhida: `max-w-[1520px]`.
- **Grid adaptativo principal (`.cfg-content-container` / `container-name: cfg-page`):**
  - Avalia a **largura útil real após as duas sidebars**, não apenas a resolução do monitor.
  - Em `@container cfg-page (min-width: 1000px)` com card de ramo presente (`data-has-ramo="true"`): ativa composição em **duas colunas `1.3fr / 1fr` (≈ 57/43)**:
    - Coluna esquerda (linha 1): **Dados da empresa**.
    - Coluna direita (linhas 1–2): **Ramo e recursos**.
    - Coluna esquerda (linha 2): **Preferências regionais**.
  - Abaixo de `1000px` úteis (ex.: `1366×768` com L1 expandida, Zoom 120%, Tablet `820px`, Mobile `390px`), retorna naturalmente à composição vertical em 1 coluna, sem forçar colunas estreitas nem esconder campos.
- **Container Queries internos por card:**
  - `.cfg-empresa-card` (`cfg-empresa`): `Canais de contato` adapta para grade equilibrada `2×2` a partir de `440px`.
  - `.cfg-business-card` (`cfg-ramo`): `Ramo e recursos` mantém leitura fluida em 1 coluna no modo lateral (direita) e expande para 2/3 colunas quando em fluxo vertical largo (≥ `720px`).
  - `.cfg-regional-card` (`cfg-regional`): resumo empilha cabeçalho + pílulas abaixo de `760px` para eliminar quebras apertadas na coluna esquerda.

---

## 4. Catálogo de Componentes Reutilizáveis

Localização base: `components/configuracoes-v3/features/settings/components/`

| Padrão | Componente | Uso recomendado nas próximas abas e HUBs |
| --- | --- | --- |
| **Cabeçalho & Ribbon** | Header `Configurações` + **Unit Identity Ribbon** (`GeralSection`) | Cabeçalho de página desktop + Ribbon de largura total com monograma `40×40`, unidade confirmada, CNPJ, ramo/recursos ativos, barra de prontidão `w-32` e gatilho retrátil do checklist. |
| **Cards** | `SettingsCard` (`.cfg-card`) | Cabeçalho com ícone `32×32` (`--cfg-card-icon-*`), título `15px`, `headerExtra`, corpo, `feedback` ancorado e rodapé `footerHint` + ações (`Descartar` outline + primário com ícone `Save`). |
| **Formulários** | `SettingsSubSection` + `.cfg-input` + `.cfg-select` + `.cfg-contact-grid` | Subblocos com eyebrow `--cfg-eyebrow`, divisórias hairline, ícones sutis em campos de contato e CEP (`--cfg-input-icon`) e grids adaptativos por container. |
| **Matriz de recursos** | `.cfg-resource-tile` + `.cfg-switch` + `input.cfg-cb` | Tile compacto com ícone individual, badge inline de origem/preparação (`Sugestão do ramo`, `Ativação manual`, `Em preparação`, `Indisponível`), distinção tracejada para preparo de cadastro e switch acessível (`aria-describedby`). |
| **Painel contextual** | Bloco **Impacto do ramo** (`BusinessResourcesCard`) | Card inset com filete lateral `--cfg-callout-accent`, ícone contextual do ramo no `<select>`, resumo operacional e nota de impacto. |
| **Checklist operacional** | `GoLiveChecklistRafaCell` | Embutido no Ribbon, recolhido após setup inicial, filtros acessíveis (`Todos`, `Para revisar`, `Concluídos`), links contextuais e `Observações técnicas` retráteis. |
| **Badges semânticos** | `SettingsStatusBadge` + `SettingsSoonBadge` | Tons: `done`, `active`, `review`, `dirty`, `pending`, `inactive`, `not_verified`, `unavailable`, `readonly`, `soon`, `explicit`, `manual`, `preset`, `neutral`. |
| **Accordions** | `SettingsCollapsible` | Disclosure acessível (`aria-expanded`, `aria-controls`) com prévia fechada e conteúdo expandido (`Padrões de apresentação do cadastro`). |
| **Feedbacks & Toasts** | `SettingsFeedbackBanner` + `Toaster` | `info`, `readonly`, `warning`, `error` (`role="alert"`), `success` (`role="status"`). |
| **Loading & Empty** | `SettingsCardSkeleton` (`default` \| `form` \| `resources`) + `UnidadeAtivaRequiredBanner` | Skeletons alinhados à geometria do grid em duas colunas e banner unificado sem unidade ativa. |
| **Somente leitura** | `SettingsReadonlySummary` | Resumo adaptativo (`.cfg-regional-card`) com `SettingsSoonBadge`, substituindo selects desabilitados falsos. |
| **Dirty Dock & Guardas** | `SettingsDirtyDock` + `ConfiguracoesV3Page` (`AlertDialog`) | Preserva contratos independentes por formulário e protege troca de aba, links do shell global, Command Menu (`⌘K`), troca de unidade (`StoreSwitcher`), `beforeunload` e salvamento em andamento. |

---

## 5. Regras de Ouro para Expansão às Demais Abas e HUBs

1. **Baseline real e releitura segura:** calcular `dirty` contra o estado confirmado pelo servidor; nunca anunciar sucesso definitivo se a releitura pós-gravação falhar, preservando recuperação sem duplicidade.
2. **Isolamento multiloja absoluto:** manter escopo por `storeScopeKey`, limpar estados pendentes na troca confirmada e abortar corridas de loja anterior.
3. **Semântica acessível preservada:** rótulos de inputs e checkboxes devem permanecer limpos; descrições visuais dentro de `<label>` usam `aria-hidden="true"` + `aria-describedby`.
4. **Honestidade operacional:** distinguir sempre *Ativo*, *Inativo*, *Em preparação*, *Pendente*, *Não verificado*, *Indisponível* e *Sem permissão*.
5. **Proximidade entre configuração e consequência:** aplicar container queries orientadas à área útil real, manter explicação de impacto ao lado do controle e reduzir rolagem sem omitir informações reais.
6. **Contenção visual:** evitar excesso de badges, sombras pesadas, gradientes decorativos ou animações contínuas; preservar o sistema global de temas como única fonte de verdade.
