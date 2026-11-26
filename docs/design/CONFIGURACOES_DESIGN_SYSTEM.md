# Sistema Visual Reutilizável — Omni Premium (Conceito C)

Documentação definitiva da fundação visual, hierarquia de navegação em dois níveis, calibração dos 10 temas oficiais, tokens locais (`--cfg-*`) e componentes reutilizáveis estabelecidos nos marcos **Piloto Configurações → Geral** (`Pilot-003` / `Final-004` / `Refinement-005`), pronta para expansão às demais 13 abas de Configurações e aos demais HUBs do OmniGestão Pro sem duplicar motores de tema.

---

## 1. Arquitetura de Temas, Scrollbars e Tokens

### 1.1 Fonte única de verdade (`app/globals.css` + `styles/legibility.css`)
- **Todos os 10 temas oficiais preservados:**
  - Claros (5): `light` (Vermelho), `soft-ice` (Azul), `neon-ice` (Verde), `violet-ice` (Roxo), `coffee-cream` (Creme/Bronze).
  - Escuros (5): `midnight` (Azul Escuro), `black-edition` (Preto/Verde), `quantum-violet` (Roxo Escuro), `coffee-gold` (Marrom/Dourado), `ruby-black` (Preto/Vermelho).
- **`color-scheme` nativo sincronizado:** cada tema define `color-scheme: light` ou `color-scheme: dark`, alinhando controles nativos (`<select>`, menus, scrollbars) à polaridade ativa.
- **Scrollbars discretos e tematizados:** `.scroll-elegant` e os containers de navegação/conteúdo (`aside`, `nav`, `main`) usam trilho transparente, espessura fina (`6px`) e polegar derivado de `var(--muted-foreground)` via `color-mix`, eliminando barras claras intrusivas no Windows em temas escuros.
- **Tokens `--sidebar*` completos em 10/10 temas** (incluindo `.soft-ice` e `.midnight`).

### 1.2 Camada local de superfícies e calibração por família (`components/configuracoes-v3/configuracoes-v3.css`)
Estritamente escopada a `.configuracoes-v3-root` e baseada exclusivamente na classe do tema em `<html>` (sem seletores `[data-theme]` concorrentes):
- **Hierarquia de 4 degraus de superfície:**
  1. `L1 Global Sidebar`: `var(--sidebar)` (rail âncora mais profundo).
  2. `L2 Contextual Sidebar`: `--cfg-subnav` (superfície intermediária calma).
  3. `Canvas de trabalho`: `--cfg-canvas`.
  4. `Cards elevados` e `recessos`: `--cfg-surface` e `--cfg-inset`.
- **Calibração por família cromática:**
  - **Azuis (`soft-ice`, `midnight`):** `midnight` desdobra os 4 níveis que antes empatavam em `L=0.27`; `soft-ice` usa contornos frios nítidos.
  - **Verdes (`neon-ice`, `black-edition`):** contraste AA garantido em `--cfg-primary-text` no `neon-ice` e degraus de grafite precisos no `black-edition`.
  - **Roxos (`violet-ice`, `quantum-violet`):** profundidade tecnológica com saturação contida e hover neutro (`--cfg-hover`), evitando flashes magenta em botões secundários.
  - **Vermelhos (`light`, `ruby-black`):** vermelho reservado de forma controlada à marca, switches e acentos; tiles ativos nunca exibem borda vermelha de erro (`--cfg-tile-active-border` neutro-refinado), distinguindo claramente identidade da marca de alertas/erros (`--cfg-danger-*`).
  - **Marrons e dourados (`coffee-cream`, `coffee-gold`):** redução do peso visual com separação clara das superfícies e deslocamento semântico do aviso (`--cfg-warning-*` âmbar quente) para nunca se confundir com o dourado primário.
  - **Claros:** elevação arquitetural limpa (`--cfg-shadow-card` sutil sem halos cinzentos) e bordas nítidas (`--cfg-border` reforçada).
- **Alta Legibilidade (`html[data-legibility="high"]`):** reforça `--cfg-border-strong`, `--cfg-subtle`, `--cfg-switch-off`, pisos tipográficos e anéis de foco sem quebrar o layout.
- **Portals escopados:** `Sheet`, `Dialog`, `AlertDialog` e `ToastViewport` em `components/configuracoes-v3/components/ui/` carregam `.configuracoes-v3-root` (e `.cfg-card.cfg-dialog` em diálogos) garantindo paridade total em 10/10 temas e Alta Legibilidade.
- **Botões `outline` e `ghost`:** usam `hover:bg-[var(--cfg-hover)] hover:text-[var(--cfg-fg)]` em vez de `hover:bg-accent`, impedindo hovers saturados inconsistentes entre temas.

---

## 2. Navegação Global (L1) e Harmonia Dual-Sidebar (L1 + L2)

Arquivos: `components/painel-inicial/Sidebar.tsx`, `components/painel-inicial/MobileNavSheet.tsx`, `lib/navigation/dashboard-nav-items.ts`, `components/configuracoes-v3/ConfiguracoesV3Page.tsx`, `components/configuracoes-v3/features/settings/components/SettingsSidebar.tsx`.

- **Alinhamento horizontal de topo (`56px`):** cabeçalho da sidebar global (`h-14`) alinhado rente à Topbar (`h-14`), formando uma única linha divisória contínua.
- **Iconografia limpa sem caixas:** ícones Lucide `15px` (`strokeWidth` `1.75` inativo / `2` ativo) sem quadrados/bordas em torno de cada item.
- **Micro-tags operacionais discretas:** `AI` (tint primário suave), `V3` / `V4` / `Beta` (neutro contido), `Legado` / `Preview` (contorno discreto) — preservando 100% dos indicadores sem blocos sólidos gritantes.
- **Zero truncamento na navegação:** `Compat` utiliza `subtitle: "Películas · Capinhas"` em linha auxiliar dedicada; `Operações V4` utiliza `badge: "Beta"` sem duplicar `"V4"`; subtítulo institucional compacto (`Admin · Plataforma` / `Acesso da loja` ou `StoreSwitcher`).
- **Transição suave expandir ↔ recolher:** coluna interna fixa (`w-[228px]`) dentro de `<aside>` com transição de largura/opacidade (`200ms ease-out`), sem quebra de texto durante o recolhimento.
- **Rodapé calmo:** ponto esmeralda estático com halo sutil (`Servidor Conectado` + versão mono), sem animações pulsantes decorativas.
- **Harmonia L1 + L2 em Configurações:**
  - `SettingsSidebar` (L2) usa cabeçalho contextual enxuto sem duplicar o monograma do *Unit Identity Ribbon*.
  - Largura proporcional dinâmica: `200px–208px` quando L1 está expandida; `218px` quando L1 está recolhida.
  - Divisórias hairline sutis entre grupos de domínio com o mesmo ritmo vertical da L1.

---

## 3. Aproveitamento Inteligente de Tela e Container Queries

- **Largura adaptativa real (`ConfiguracoesV3Page.tsx`):**
  - Sidebar global expandida: `max-w-[1220px]` com padding equilibrado (`px-4 sm:px-5 lg:px-6 xl:px-7`).
  - Sidebar global recolhida: `max-w-[1320px]`, eliminando margens laterais ociosas em `1650×927` e `1920×1080` sem esticar linhas em excesso.
- **Container Queries nativas (`.cfg-content-container` + `.cfg-contact-grid`):**
  - Adapta grades internas à largura efetiva do painel (`1 col` < `540px`, `2 cols` `540px–979px`, `4 cols` ≥ `980px` para Canais de contato), reduzindo a altura do formulário em desktops sem espremer notebooks `1366×768` ou zoom `120%`.

---

## 4. Catálogo de Componentes Reutilizáveis

Localização base: `components/configuracoes-v3/features/settings/components/`

| Padrão | Componente | Uso recomendado nas próximas abas e HUBs |
| --- | --- | --- |
| **Cabeçalhos & Ribbon** | `SectionHeader` + **Unit Identity Ribbon** (`GeralSection`) | Monograma `40×40`, título + unidade confirmada, metadados (CNPJ + chip de ramo e recursos ativos), barra de prontidão e gatilho retrátil do checklist. |
| **Cards** | `SettingsCard` (`.cfg-card`) | Cabeçalho compacto (`py-3`) com ícone `28×28` tematizado, `headerExtra`, corpo (`py-3.5`), `feedback` ancorado e rodapé `footerHint` + ações. |
| **Formulários** | `SettingsSubSection` + `.cfg-input` + `.cfg-select` + `.cfg-contact-grid` | Subblocos com micro-eyebrow `10.5px` uppercase, divisórias hairline, labels de alto contraste (`--cfg-fg`) e grids responsivos por container. |
| **Matriz de recursos** | `.cfg-resource-tile` + `.cfg-switch` + `input.cfg-cb` | Tile compacto (`p-3`) com ícone semântico individual (`28×28`), indicador de ativo, badges discretos de origem/preparação e switch acessível (`aria-describedby` + `forced-colors`). |
| **Painel contextual** | Bloco **Impacto do ramo** (`BusinessResourcesCard`) | Card inset com filete lateral primário (`border-l-2`), eyebrow + chip do ramo, resumo principal e nota operacional separada por hairline. |
| **Checklist operacional** | `GoLiveChecklistRafaCell` | Embutido no Ribbon, recolhido após setup inicial, filtros acessíveis (`Todos`, `Para revisar`, `Concluídos`), links contextuais e `Observações técnicas` retráteis. |
| **Badges semânticos** | `SettingsStatusBadge` + `SettingsSoonBadge` | Tons: `done`, `active`, `review`, `dirty`, `pending`, `inactive`, `not_verified`, `unavailable`, `readonly`, `soon`, `explicit`, `manual`, `preset`, `neutral`. |
| **Accordions** | `SettingsCollapsible` | Disclosure acessível (`aria-expanded`, `aria-controls`) com prévia fechada e conteúdo expandido. |
| **Feedbacks & Toasts** | `SettingsFeedbackBanner` + `Toaster` | `info`, `readonly`, `warning`, `error` (`role="alert"`), `success` (`role="status"`). |
| **Loading & Empty** | `SettingsCardSkeleton` (`default` \| `form` \| `resources`) + `UnidadeAtivaRequiredBanner` | Skeletons fiéis à geometria real do card e banner unificado sem unidade ativa. |
| **Somente leitura** | `SettingsReadonlySummary` | Resumo compacto e honesto com `SettingsSoonBadge`, substituindo selects desabilitados falsos. |
| **Dirty Dock & Guardas** | `SettingsDirtyDock` + `ConfiguracoesV3Page` (`AlertDialog`) | Protege troca de aba, links do shell global, Command Menu (`⌘K`), troca de unidade (`StoreSwitcher`), `beforeunload` e salvamento em andamento. |

---

## 5. Regras de Ouro para Expansão às Demais Abas e HUBs

1. **Baseline real e releitura segura:** calcular `dirty` contra o estado confirmado pelo servidor; nunca anunciar sucesso definitivo se a releitura pós-gravação falhar, preservando recuperação sem duplicidade.
2. **Isolamento multiloja absoluto:** manter escopo por `storeScopeKey`, limpar estados pendentes na troca confirmada e abortar corridas de loja anterior.
3. **Semântica acessível preservada:** rótulos de inputs e checkboxes devem permanecer limpos; descrições visuais dentro de `<label>` usam `aria-hidden="true"` + `aria-describedby`.
4. **Honestidade operacional:** distinguir sempre *Ativo*, *Inativo*, *Em preparação*, *Pendente*, *Não verificado*, *Indisponível* e *Sem permissão*.
5. **Contenção visual:** evitar excesso de badges, sombras pesadas, gradientes decorativos ou animações contínuas; preservar o sistema global de temas como única fonte de verdade.
