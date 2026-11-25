# Sistema Visual Reutilizável — Área Configurações (Omni Premium · Conceito C)

Documentação da fundação visual, tokens locais e componentes reutilizáveis implementados no piloto **Configurações → Geral** (`GOAL=OMNI-CONFIGURACOES-PREMIUM-IMPLEMENTATION-PILOT-003`), pronta para escalar às demais 13 abas sem duplicar regras nem criar um segundo motor de temas.

---

## 1. Arquitetura de Temas e Tokens (`--cfg-*`)

Arquivo: `components/configuracoes-v3/configuracoes-v3.css`

- **Fonte única de verdade:** os 10 temas oficiais (`light`, `soft-ice`, `midnight`, `black-edition`, `quantum-violet`, `coffee-gold`, `ruby-black`, `neon-ice`, `violet-ice`, `coffee-cream`) e o modo **Alta Legibilidade** (`styles/legibility.css`) permanecem exclusivamente no sistema global (`app/globals.css`).
- **Tokens locais `--cfg-*`:** derivados via `color-mix(in srgb, ...)` a partir dos tokens globais (`--background`, `--surface`, `--card`, `--foreground`, `--primary`, `--border`, `--success`, `--warning`, `--destructive`, `--info`), complementando apenas elevação, densidade, contraste de superfícies e estados semânticos do módulo:
  - Superfícies: `--cfg-canvas`, `--cfg-surface`, `--cfg-inset`, `--cfg-hover`, `--cfg-input-bg`
  - Bordas e texto auxiliar: `--cfg-border`, `--cfg-border-strong`, `--cfg-fg`, `--cfg-fg-body`, `--cfg-muted`, `--cfg-subtle`
  - Estados semânticos: `--cfg-primary-{soft,border,text}`, `--cfg-success-{fg,dot,soft,border}`, `--cfg-warning-{fg,dot,soft,border}`, `--cfg-danger-{fg,soft,border}`, `--cfg-info-{fg,soft,border}`
  - Elevação e controles: `--cfg-shadow-sm`, `--cfg-shadow-card`, `--cfg-shadow-pop`, `--cfg-top-highlight`, `--cfg-switch-off`
- **Escopo de Portals:** `Sheet`, `Dialog`, `AlertDialog` e `ToastViewport` em `components/configuracoes-v3/components/ui/` carregam `.configuracoes-v3-root` diretamente no conteúdo renderizado no Portal, garantindo paridade completa nos 10 temas e em Alta Legibilidade.
- **Movimento reduzido:** `@media (prefers-reduced-motion: reduce)` desativa pulsos de foco e transições longas automaticamente.

---

## 2. Catálogo de Padrões e Componentes Reutilizáveis

Localização base: `components/configuracoes-v3/features/settings/components/`

| Padrão | Componente | Uso recomendado nas próximas abas |
| --- | --- | --- |
| **Cabeçalhos** | `SectionHeader` + padrão **Unit Identity Ribbon** (`GeralSection`) | Usar `SectionHeader` em abas simples e o padrão Ribbon (monograma + nome confirmado + status/progresso) em abas âncora com estado operacional. |
| **Cards e superfícies** | `SettingsCard` (`.cfg-card`) | Suporta `icon`, `title`, `description`, `headerExtra` (badges de status/dirty), `feedback` (banner ancorado acima do rodapé), `footerHint` e `footer`. Retrocompatível com todas as 13 abas existentes. |
| **Formulários** | `SettingsSubSection` + `.cfg-input` + `.cfg-select` | Divide formulários longos em subblocos com micro-eyebrow uppercase e separadores hairline (`divided`), em grids responsivos de 12 colunas. |
| **Controles de ativação** | `.cfg-switch` + `input.cfg-cb` + `.cfg-resource-tile` | Switch acessível sobre `<input type="checkbox" className="cfg-cb absolute inset-0 opacity-0" />` preservando hit-target nativo (touch/Playwright), teclado, foco visível, `forced-colors` e `aria-describedby`. |
| **Badges e estados** | `SettingsStatusBadge` + `SettingsSoonBadge` | Tons semânticos padronizados: `done`, `active`, `review`, `dirty`, `pending`, `inactive`, `not_verified`, `unavailable`, `readonly`, `soon`, `explicit`, `manual`, `preset`, `neutral`. |
| **Accordions** | `SettingsCollapsible` | Disclosure acessível (`aria-expanded`, `aria-controls`) com resumo fechado (`summary`) e conteúdo expandido (`expandedSummary` + `children`). |
| **Feedbacks** | `SettingsFeedbackBanner` + `Toaster` (`success` / `default` / `destructive`) | Banners ancorados dentro do card (`role="alert"` em erros, `role="status"` em avisos/sucesso/somente leitura) eliminando mensagens órfãs. |
| **Loading e empty states** | `SettingsCardSkeleton` (`variant="default" \| "form" \| "resources"`) + `UnidadeAtivaRequiredBanner` | Skeleton estrutural fiel à forma do card (com `role="status"` opcional) e banner unificado de ausência de unidade com CTA opcional para `Lojas`. |
| **Somente leitura / Em breve** | `SettingsReadonlySummary` | Substitui selects falsos desabilitados por resumo honesto de valores ativos + `SettingsSoonBadge`. |
| **Modais e drawers** | `Sheet`, `Dialog`, `AlertDialog` em `components/ui/` | Todos tematizados via `.configuracoes-v3-root`, com `SheetTitle` acessível e fechamento via `ESC`. |
| **Salvar e descartar** | Footer do `SettingsCard` + `SettingsDirtyDock` + guarda em `ConfiguracoesV3Page` | Desabilita `Descartar` e `Salvar` enquanto `!dirty`; exibe barra flutuante apenas quando há alterações pendentes; protege troca de aba com `AlertDialog` sem criar transação artificial entre blocos independentes. |

---

## 3. Regras de Ouro para Expandir às Demais Abas

1. **Baseline real:** calcular `dirty` comparando rascunho contra baseline confirmado pelo servidor; reverter manualmente ao valor original deve limpar `dirty`.
2. **Isolamento por unidade:** manter `storeScopeKey` e abortar requisições pendentes ao trocar de loja.
3. **Semântica acessível preservada:** rótulos de campos e caixas de seleção nunca devem embutir texto de ajuda longo no nome acessível — usar `aria-describedby` + `aria-hidden` na descrição visual dentro de `<label>`.
4. **Honestidade operacional:** distinguir sempre *Ativo*, *Inativo*, *Em preparação*, *Pendente*, *Não verificado*, *Indisponível* e *Sem permissão*.
5. **Escopo estrito:** nunca alterar estilos globais fora de `.configuracoes-v3-root`.
