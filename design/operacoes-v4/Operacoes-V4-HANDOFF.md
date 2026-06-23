# Operações V4 — HANDOFF de implementação

> Fonte de verdade **visual** do redesign Operações V4 do OmniGestão Pro.
> Este material **NÃO está integrado** ao sistema. É um protótipo visual.
> Toda a integração (rotas, componentes React, hooks, dados, regras) ficará para o Claude Code.

O artefato visual completo é o arquivo **`Operacoes-V4-Standalone.html`** (HTML único,
self-contained — todo o CSS e JS estão embutidos, sem dependência externa). Abra direto no
navegador para inspecionar qualquer estado.

---

## 1. Estrutura (blocos visuais)

Layout em coluna de altura cheia (`100vh`), sem rolagem horizontal. Hierarquia:

```
┌─ TopBar (40px) ───────────────────────────────────────────────┐
│  logo · busca global (⌘K) · Mode Switcher · unidade · Nova OS  │
├─ IconRail (62px) ─┬─ Conteúdo (workspace | módulo | auditoria) ─┤
│  Visão geral      │                                             │
│  Fila             │   ┌ Context Column (272px, recolhível)      │
│  OS  ◀ ativo      │   ├ Center Work Surface                     │
│  Bancada          │   │   ├ Command Header (46px)               │
│  SLA              │   │   ├ Pipeline Spine (52px)               │
│  PDV              │   │   └ Stage Panel (etapa atual)           │
│  Config (rodapé)  │   └ Activity Column (recolhível)            │
└───────────────────┴─────────────────────────────────────────────┘
```

- **TopBar** — marca, busca global mock (`⌘K`), **Mode Switcher** (Recepção/Bancada/Auditoria), seletor de unidade, "Auditoria de UX", "+ Nova OS".
- **IconRail** — navegação por ícones: Visão geral, Fila, OS (workspace), Bancada, SLA, PDV + Config no rodapé. Cada um troca a tela central.
- **Context Column** (esquerda, 272px) — dados do cliente e do aparelho da OS aberta: avatar, contatos, IMEI/série, senha, acessórios, defeito relatado, prioridade, SLA, técnico. Recolhível (vira faixa vertical de 32px).
- **Center Work Surface** — núcleo do cockpit:
  - **Command Header** — código da OS, status, status de pagamento, SLA, total/saldo, botão de documentos, ação primária do fluxo, menu "⋯".
  - **Pipeline Spine** — trilha horizontal das etapas (Entrada → Diagnóstico → Orçamento → Execução → Financeiro → Entrega → Pós-venda → Histórico) com estados concluído/atual/pendente.
  - **Stage Panel** — conteúdo da etapa selecionada (Entrada mostra identificação, estado físico, checklist, fotos, segurança/acesso, assinatura, acessórios).
- **Activity Column** (direita) — linha do tempo da OS, comunicação (WhatsApp), anexos, observações. Recolhível.
- **Telas de módulo** (acessadas pelo rail): Fila (kanban 5 colunas), Bancada (cards por técnico), SLA (tabela), PDV (caixa + contas a receber), Dashboard (distribuição + fila do dia). Cada uma com linha de KPIs.
- **Página Auditoria de UX** — documento de revisão do redesign.
- **Modais** — Nova OS (buscar/cadastrar cliente + equipamento), Recibo de pagamento.
- **Toast** — feedback efêmero no rodapé central.

---

## 2. Componentização sugerida

```
OperacoesV4Shell
├─ TopBar
│   ├─ GlobalSearch (⌘K)
│   └─ ModeSwitcher          (recepcao | bancada | auditoria)
├─ IconRail                  (itens + Config)
├─ WorkspaceView
│   ├─ ContextColumn  (colapsável)
│   │   ├─ ClienteCard
│   │   ├─ AparelhoCard
│   │   └─ PrioridadeBox
│   ├─ WorkSurface
│   │   ├─ CommandHeader
│   │   │   ├─ StatusBadge / PagamentoBadge / SlaBadge
│   │   │   ├─ PrimaryAction
│   │   │   ├─ DocumentosMenu
│   │   │   └─ MoreMenu
│   │   ├─ PipelineSpine → PipelineNode[]
│   │   └─ StagePanel
│   │       ├─ EntradaStage (Identificacao, EstadoFisico, Checklist, Fotos, SegurancaAcesso, Assinatura, Acessorios)
│   │       ├─ DiagnosticoStage / OrcamentoStage / ExecucaoStage
│   │       ├─ FinanceiroStage / EntregaStage / PosVendaStage / HistoricoStage
│   └─ ActivityColumn (colapsável)
│       ├─ Timeline → TimelineStep[]
│       ├─ Comunicacao
│       └─ Anexos
├─ ModuleView
│   ├─ KpiRow → KpiCard[]
│   ├─ FilaKanban → KanbanColumn[] → OsCard[]
│   ├─ BancadaTecnicos → TecnicoCard[]
│   ├─ SlaTable → SlaRow[]
│   ├─ PdvPanel (CaixaDoDia + ContasReceber)
│   └─ DashboardView (DistribuicaoEtapa + FilaDoDia)
├─ AuditoriaPage
├─ NovaOSModal
├─ ReciboModal
└─ Toast
```

Estado global sugerido (hoje vive no protótipo): `view`, `module`, `stage`, `status`, `left/right` (colunas), `menu`, `prioridade`, `secTipo`, e os arrays de checklist/estado/acessórios.

---

## 3. Fluxos (comportamento esperado)

- **Recepção** — Context Column + Activity abertas. Abrir OS, conferir dados, dar baixa de entrada no balcão.
- **Bancada** — ambas as colunas recolhidas, workspace máximo. Foco na execução do reparo, sem rolagem horizontal.
- **Auditoria** — cliente recolhido, atividade aberta. Revisar timeline/histórico.
- **Fila** — kanban por etapa (Aberta → Diagnóstico → Aprovação → Execução → Pronta). Clicar num card abre o workspace daquela OS.
- **Pesquisa** — busca global (`⌘K`) por OS, cliente ou IMEI. (mock no protótipo)
- **Filtros** — segmented controls e chips (estado físico, checklist OK/RUIM/N/T, tipo de segurança, equipamento, origem).
- **Dashboard** — distribuição por etapa (barras) + fila do dia; atalhos para fila e workspace.
- **Pipeline / ação primária** — cada status tem uma ação primária que avança o fluxo (Iniciar diagnóstico → Enviar orçamento → Registrar aprovação → Iniciar serviço → Marcar pronta → Receber pagamento). A máquina de status única governa as transições.

---

## 4. Estados visuais

**Status da OS** (badge com cor própria): `aberta`, `diagnostico`, `aguardando_aprovacao`, `aprovado`, `aguardando_peca`, `em_execucao`, `pronta`, `entregue`, `cancelada`.

**Prioridade**: `baixa` (verde), `normal` (azul), `alta` (âmbar), `urgente` (vermelho).

**Pagamento**: pago / parcial / pendente (badge âmbar) + saldo.

**Pipeline node**: `done` (✓ verde), `current` (● indigo com halo), `pending` (anel cinza), `ref` (≡ histórico).

**Itens de checklist / estado físico**: `OK` (verde), `RUIM`/`Avaria` (vermelho), `N/T`/`Ausente` (azul).

**Estados de aplicação a implementar** (não há lógica no protótipo, documentar para o build):
`loading` (skeletons nos cards/listas), `empty` (fila/coluna sem OS), `success` (toast verde), `warning` (SLA estourando / pagamento parcial), `error` (falha de carga/transição inválida), `offline` / `sincronizando` (banner de conexão). Use a paleta de tokens abaixo para cada um.

---

## 5. Tokens

### Cores
| Papel | Hex |
|---|---|
| App background | `#f5f6f8`, `#e7e8ec` |
| Superfícies | `#ffffff`, `#fbfbfc`, `#fafbfc` |
| Bordas | `#e9eaee`, `#ebedf0`, `#f0f1f4`, `#e2e4e8` |
| Texto título | `#11131a` |
| Texto corpo | `#1a1d23` |
| Texto muted | `#6b7280` |
| Texto subtle | `#9aa0ab`, `#c2c6cd` |
| **Primary (indigo)** | `#4f46e5` · hover `#4338ca` · bg `#eef0fe` · borda `#c7ccfa` |
| Success (verde) | `#16a34a`, `#15803d` · bg `#e7f6ec`/`#f1f6f2` · borda `#bfe6cc` |
| Warning (âmbar) | `#d97706`, `#b45309` · bg `#fbf1e3` |
| Danger (vermelho) | `#dc2626`, `#b91c1c` · bg `#fbeaea` · borda `#f3cccc` |
| Info (azul) | `#2563eb`, `#1d4ed8` · bg `#eaf1fe` · borda `#cfe0fb` |

### Tipografia
- Família: stack do sistema — `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- Mono (IMEI, senha, valores técnicos): `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Escala observada: 9–11px (labels/uppercase), 12–13.5px (corpo/UI), 15–16px (títulos de OS), 24px (KPIs), 30px (título de auditoria).
- Pesos: 500 (médio), 600 (semibold), 700 (bold). Labels uppercase com `letter-spacing: .03–.08em`.

### Ícones
- Lucide (no app real: `Activity`, etc.) + glifos inline no protótipo. SVGs com `stroke-width: 2`, `currentColor`.

### Bordas, raios e sombras
- Bordas: 1px sólidas nas cores acima; tracejadas (`1px dashed`) em dropzones/placeholder.
- Raios: `5–6px` (botões pequenos/tags), `7–9px` (botões/inputs), `10–12px` (cards), `14px` (modais), `999px` (pills/badges), `50%` (avatares/dots).
- Sombras: `0 1px 2px rgba(79,70,229,.3)` (botão primário), `0 12px 32px rgba(17,19,26,.16)` (menus), `0 24px 60px rgba(17,19,26,.3)` (modais), halo `0 0 0 3px #eef0fe` (nó atual).

### Espaçamento
- Grid base ~`4px`. Gaps comuns: `6–12px` entre cards, padding de card `11–15px`.
- Alturas fixas: TopBar `40px`, Command Header / Module header `46px`, Pipeline `52px`, Rail `62px`, colunas laterais `272px` (abertas) / `32px` (recolhidas).

---

## 6. Responsividade

- **Desktop (≥1440px)** — layout completo: ambas as colunas + workspace amplo. Stage de Entrada em 3 colunas; KPIs em 4; kanban em 5.
- **Notebook (1024–1440px)** — recolher uma das colunas laterais (modo Recepção→Bancada). Grids de stage caem para 2 colunas; KPIs para 2; kanban com scroll horizontal interno apenas no kanban.
- **Tablet (768–1024px)** — colunas laterais viram overlays/drawers sobre o workspace; pipeline ganha scroll horizontal próprio; módulos empilham em 1–2 colunas.
- Regra firme: **sem rolagem horizontal da página** — todos os grids usam `minmax(0, …)` para permitir encolher. Manter no port.

---

## 7. Observações

- Este material **NÃO está integrado** ao OmniGestão Pro — é apenas protótipo visual.
- **Nenhuma** lógica de negócio, dado real, hook, rota ou componente React acompanha este pacote.
- Os botões/menus do `Operacoes-V4-Standalone.html` são interativos apenas dentro do próprio protótipo (estado local volátil).
- Toda a integração (rotas, componentes, hooks, Prisma, Supabase, server actions) é responsabilidade do **Claude Code**, usando este HTML como referência visual canônica.
- A pasta é independente: o HTML é self-contained e não puxa nada de `assets/`, `css/` ou `images/` (essas pastas existem só para anexos futuros, ver README).
