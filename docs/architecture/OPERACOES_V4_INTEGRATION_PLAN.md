# Plano de Integração — Operações V3 ↔ Design Freeze V4

> **Status:** documento de planejamento (somente leitura para a IA).
> Nenhum código alterado nesta etapa.
> Baseado em: `Operacoes-V3-Redesign-v4-standalone.html` + `Operacoes-V3-Redesign-v4-HANDOFF.md` + auditoria completa de `components/operacoes-v3/` e `lib/operacoes-v3/`.
> Data: 2026-06-22

---

## 1. Diagnóstico: V3 real vs Design Freeze V4

### 1.1 Arquitetura visual atual (V3 real)

```
┌─ OperacoesV3Shell (div.flex.flex-col, h-full)
│  ├─ <header> top chrome (40px aprox.)
│  │     logo · badge · Atualizar · Nova OS
│  ├─ <div.flex.flex-row>
│  │  ├─ OperacoesV3Nav (sidebar vertical, ~200px)
│  │  └─ <main> overflow-y-auto flex-1
│  │        max-w-6xl / max-w-7xl (wide screens)
│  │        <ActiveScreen />       ← muda por ScreenId (19 telas)
│  └─ toast stack (fixed, bottom)
└─ <NovaOSEnterpriseModalV3>
```

**Workspace interno (OSWorkspaceV3):**
```
<div.space-y-4>             ← scroll linear de seções empilhadas
  OSHeaderV3
  OSCommandBarV3
  OSTimelineV3
  <grid lg:grid-cols-[1fr_320px]>
    coluna principal (esquerda)   ← TODAS as seções em scroll
      OSSectionV3 Identificação
      ProvaEntradaV3
      HistoricoAparelhoV3
      ProducaoTecnicoV3
      ChecklistEntradaV3
      DiagnosticoTecnicoV3
      OrcamentoPanelV3
      ServicosExecutadosV3
      OSSectionV3 Financeiro
      OSSectionV3 Execução
      OSSectionV3 Entrega
      GarantiaOSV3
      PosVendaV3
      OSHistoricoV3
    OSContextRailV3 (direita, 320px fixo)
      timeline · comunicação · anexos · observações
```

### 1.2 Arquitetura visual alvo (V4 Design Freeze)

```
┌─ top bar (40px, fixed)
│     logo · ⌘K · [Recepção|Bancada|Auditoria] · Unidade · +Nova OS
├─ icon rail (62px, fixed left)
│     7 ícones: Visão geral · Fila · OS · Bancada · SLA · PDV · Config
└─ workspace (100vw × restante)
   ├─ Coluna Cliente (272px, recolhível → trilho 32px)
   │     cliente · aparelho · IMEI/cor · defeito · prioridade · SLA
   ├─ Centro (flex-1, ÚNICO que rola)
   │  ├─ command header (46px)
   │  │     código · status-badge · forma-pgto · SLA · total · Documentos▾ · ação-primária · ⋯
   │  ├─ pipeline spine (52px)
   │  │     8 etapas clicáveis: Entrada·Diagnóstico·Orçamento·Execução·Financeiro·Entrega·Pós-venda·Histórico
   │  └─ stage panel (flex-1, overflow-y-auto)
   │        ← conteúdo da etapa selecionada
   └─ Coluna Atividade (288px, recolhível → trilho 32px)
         timeline · comunicação · anexos · observações
```

### 1.3 Delta de layout resumido

| Elemento | V3 atual | V4 Design Freeze | Natureza |
|---|---|---|---|
| Top bar | `<header>` com badge, 2 btns | 40px denso c/ 3 modos + ⌘K | Refactor |
| Navegação lateral | Sidebar 200px c/ texto | Icon rail 62px c/ ícones | Refactor |
| Workspace padrão | Scroll linear, 2-col (1fr+320px) | Cockpit 3-col, somente centro rola | Novo padrão |
| Coluna esquerda | — | Coluna Cliente 272px (recolhível) | Novo componente |
| Coluna direita | `OSContextRailV3` 320px fixo | Coluna Atividade 288px (recolhível) | Refactor |
| Conteúdo do workspace | Todas seções em scroll | Stage panel por etapa ativa | Novo padrão |
| Pipeline | `OSTimelineV3` (linha do tempo) | Spine horizontal de 8 etapas clicáveis | Novo componente |
| Modos de uso | — | Recepção / Bancada / Auditoria | Novo componente |

---

## 2. Mapa de componentes

### 2.1 Componentes reaproveitáveis sem alteração

| Componente / arquivo | Uso na V4 | Observação |
|---|---|---|
| `lib/operacoes-v3/status-machine.ts` | Intocável — fonte única de verdade | |
| `lib/operacoes-v3/orcamento-model.ts` | Intocável — math Cobrado/Brinde/Interno | V4 chama "Desconto" mas a lógica é "interno" |
| `lib/operacoes-v3/payment-model.ts` | Intocável — PDV-only payment | |
| `lib/operacoes-v3/workspace-model.ts` | Intocável | |
| `lib/operacoes-v3/prova-entrada-model.ts` | Intocável | |
| `lib/operacoes-v3/print-model.ts` | Intocável — mascaramento de credenciais | |
| `lib/operacoes-v3/nova-os-model.ts` | Intocável | |
| `lib/operacoes-v3/nova-os-actions.ts` | Intocável | |
| `lib/operacoes-v3/status-actions.ts` | Intocável | |
| `lib/operacoes-v3/garantia-*.ts` | Intocável | |
| `lib/operacoes-v3/orcamento-actions.ts` | Intocável | |
| `lib/operacoes-v3/entrega-actions.ts` | Intocável | |
| `lib/operacoes-v3/retorno-actions.ts` | Intocável | |
| `lib/operacoes-v3/pdv-servico-actions.ts` | Intocável | |
| `context/OperacoesV3Context.tsx` | Intocável — contratos dos hooks | Apenas state visual novo fora dele |
| `hooks/use-ordens-v3.ts` | Reaproveitado | |
| `hooks/use-ordem-v3.ts` | Reaproveitado | |
| `hooks/use-workspace-v3.ts` | Reaproveitado | |
| `hooks/use-garantia-v3.ts` | Reaproveitado | |
| `hooks/use-orcamento-v3.ts` | Reaproveitado | |
| `hooks/use-prova-entrada-v3.ts` | Reaproveitado | |
| `hooks/use-pos-venda-v3.ts` | Reaproveitado | |
| `hooks/use-producao-v3.ts` | Reaproveitado | |
| `components/NovaOSEnterpriseModalV3.tsx` | Reaproveitado — integrar ao novo top bar | Modal completo, intocável |
| `components/OrcamentoPanelV3.tsx` | Stage panel "Orçamento" | Ligeiramente envolto, sem refactor de lógica |
| `components/ProvaEntradaV3.tsx` | Stage panel "Entrada" (parte) | PatternPadV3 + SignaturePadV3 intactos |
| `components/ChecklistEntradaV3.tsx` | Stage panel "Entrada" (parte) | |
| `components/DiagnosticoTecnicoV3.tsx` | Stage panel "Diagnóstico" | |
| `components/ProducaoTecnicoV3.tsx` | Stage panel "Execução" (parte) | |
| `components/GarantiaOSV3.tsx` | Stage panel "Entrega" (parte) | |
| `components/PosVendaV3.tsx` | Stage panel "Pós-venda" | |
| `components/HistoricoAparelhoV3.tsx` | Stage panel "Diagnóstico" (parte) | |
| `components/ServicosExecutadosV3.tsx` | Stage panel "Execução" (parte) | |
| `components/PatternPadV3.tsx` | Intocável | |
| `components/SignaturePadV3.tsx` | Intocável | |
| `components/ProductPickerV3.tsx` | Intocável | |
| `components/UiV3.tsx` (`ButtonV3`, etc.) | Intocável | |
| `components/print/PrintPreviewV3.tsx` | Intocável | |
| `components/print/*.tsx` | Intocável | |
| `data/screen-copy.ts` | Intocável | |
| `data/navigation.ts` | Atualizar ícones rail se necessário | |
| `lib/format.ts` | Intocável | |
| `lib/os-derive.ts` | Intocável | |
| `pages/DashboardV3.tsx` | Reaproveitado como tela de rail | |
| `pages/FilaOSV3.tsx` | Reaproveitado como tela de rail | |
| `pages/BancadaV3.tsx` | Reaproveitado como tela de rail | |
| `pages/SlaAtrasosV3.tsx` | Reaproveitado como tela de rail | |
| `pages/PdvServicoV3.tsx` | Reaproveitado como tela de rail | |
| `app/dashboard/operacoes-v3/page.tsx` | Intocável — Server Component fino | |

### 2.2 Componentes que precisam de refatoração (visual / layout)

| Componente | O que muda | Risco |
|---|---|---|
| `OperacoesV3Shell.tsx` | Layout raiz: de sidebar+main → cockpit 3-col + icon rail + modos. Novo state: `leftOpen`, `rightOpen`, `modo`. Remover `WIDE_SCREENS` (o cockpit é sempre fluido). | Médio — lógica de contexto intacta, só layout muda |
| `OperacoesV3Nav.tsx` | De sidebar com texto → icon rail vertical 62px. Ícones only (tooltip hover). Os IDs de ScreenId permanecem; só a apresentação visual muda. | Baixo — nenhuma lógica alterada |
| `OSHeaderV3.tsx` | Compactar para 40px; mover "ações rápidas" para o command header do cockpit. | Baixo |
| `OSCommandBarV3.tsx` | Tornar command header (46px) inline com status-badge, SLA, total, Documentos▾, ação primária, ⋯. Lógica de `acaoPrimariaV3`/`proximasTransicoesV3` INTACTA. | Baixo — só CSS/layout |
| `OSContextRailV3.tsx` | Passa a ser a Coluna Atividade (288px, recolhível). Conteúdo idêntico. Adicionar lógica de colapso (32px trilho). | Baixo |
| `OSHistoricoV3.tsx` | Adicionar barra de filtro: Tudo / Status / Financeiro / Comunicação / Técnico. Filtro é client-side (já tem os `tipo` em `TIPO_TONE`). | Baixo — só adicionar `filter state` e `Array.filter` |
| `OSWorkspaceV3.tsx` | Maior refactor: de scroll-linear → staged panel. A coluna "esquerda" vira `OSClienteColV3`. O conteúdo de cada etapa usa os componentes existentes. O `<Picker>` (seletor de OS) pode ser mantido. | Alto — requer nova estrutura interna; conteúdo preservado |
| `pages/OrcamentosV3.tsx` | Lista de orçamentos existente — rever se o rail precisa dela ou só o workspace. | Baixo |

### 2.3 Componentes novos (a criar)

| Componente novo | Descrição | Dependências |
|---|---|---|
| `OSStagePipelineV3.tsx` | Spine horizontal 52px com 8 etapas clicáveis. Deriva `ativa` do status da OS via `statusV3FromOS`. Props: `etapaAtiva`, `onEtapa(e)`. | `status-machine`, nenhuma I/O |
| `OSClienteColV3.tsx` | Coluna esquerda 272px (recolhível para trilho de 32px). Resume: nome, aparelho, IMEI, defeito, prioridade, SLA. Leitura de `os` prop. | `os: OrdemServico` — somente leitura |
| `OSModeToggleV3.tsx` | Botão 3-estados no top bar (Recepção / Bancada / Auditoria). Seta `leftOpen` + `rightOpen` automaticamente. State de UI puro. | State no Shell |
| `OSFinanceiroStageV3.tsx` | Stage panel completo: KPIs totais/recebido/saldo, plano de pagamento, histórico de recebimentos, CTA "Receber no PDV de Serviço". Conteúdo atual do `OSSectionV3 Financeiro` expandido. | `payment-model`, `lerPagamentoV3` |
| `OSEntregaStageV3.tsx` | Stage panel: "retirado por", documento, assinatura de saída, checklist final, acessórios devolvidos, garantia. Consolida `GarantiaOSV3` + dados de retirada. | `entrega-actions`, `garantia-actions` |
| `OSReciboPanelV3.tsx` | Modal/drawer de recibo pós-pagamento com saldo devedor. Lê de `lerPagamentoV3`. Somente leitura (impressão). | `print-model`, `payment-model` |

---

## 3. Funcionalidades reais V3 que DEVEM ser preservadas integralmente

| Funcionalidade | Arquivo(s) protegido(s) | Por que não tocar |
|---|---|---|
| **Máquina única de status** | `lib/operacoes-v3/status-machine.ts` | Toda decisão de transição nasce aqui; cliente e servidor compartilham exatamente a mesma função |
| **Transição de status (write real)** | `lib/operacoes-v3/status-actions.ts` | Persiste no Prisma via Server Action; `mudarStatus` no contexto não muda |
| **Orçamento: kinds cobrado/brinde/interno** | `orcamento-model.ts`, `OrcamentoPanelV3.tsx` | Math: brinde sem valor ao cliente; interno (UI chama "Desconto") sem valor ao cliente; desconto geral em R$ no rodapé. Reimplementar quebraria o cálculo |
| **Baixa financeira APENAS via PDV de Serviço** | `payment-model.ts`, `pdv-servico-actions.ts` | Regra de negócio: recebimento real exige caixa aberto; botão no stage Financeiro navega para `pdv-servico`, NÃO recebe inline |
| **Mascaramento de credenciais na impressão** | `print-model.ts`, `ProvaEntradaV3.tsx` | Dados de PIN/senha NÃO aparecem na OS entregue ao cliente |
| **Criação real de OS** | `nova-os-actions.ts`, `NovaOSEnterpriseModalV3.tsx` | Auto-save de rascunho, validação de campos, criação via `criarOSEnterpriseV3` + redirect para workspace |
| **Draft storage da Nova OS** | `nova-os-draft-storage.ts` | Anti-perda de dados na abertura de OS; intocável |
| **ProvaEntradaV3 completa** | `ProvaEntradaV3.tsx`, `prova-entrada-model.ts` | Estado físico estruturado + avarias + credenciais + fotos (upload comprimido) + assinatura do cliente — tudo persistido |
| **Garantia por serviço** | `garantia-templates.ts`, `GarantiaOSV3.tsx` | Prazo sugerido por serviço + termo editável |
| **Múltiplas lojas** | `OperacoesV3Shell` (linha 68: `lojaAtivaId`) | `storeId` sempre vem de `useLojaAtiva()`; nunca hardcoded |
| **Histórico de eventos** | `workspace-model.ts` → `lerHistoricoV3` | Fonte de verdade para auditoria; apenas o filtro será adicionado por cima |

---

## 4. Partes do protótipo V4 que são apenas visuais (não implementar ainda)

| Feature | No protótipo V4 | Situação real |
|---|---|---|
| **Busca ⌘K no top bar** | Lista filtrada mockada | Placeholder — não conectar nesta integração |
| **Unidade no top bar** | Dropdown fixo | Usar `lojaAtivaId` de `useLojaAtiva()` (já existe), sem dropdown de troca interna |
| **Timer de bancada** | Cronômetro ilustrativo | Não implementar — não há model/action |
| **Apontamentos de bancada** | Caixas de texto sem persistência | Não implementar |
| **NPS/satisfação** | Estrelinhas visuais | Não implementar — sem model |
| **Follow-up WhatsApp** | Botão que fecha modal | Não implementar — integração futura |
| **KPIs do Dashboard** | Dados estáticos no protótipo | V3 real já tem `DashboardV3.tsx` com dados derivados de `ordens` |
| **Kanban do Fila** | 5 colunas mockadas | `FilaOSV3.tsx` já existe mas pode ser enriquecida gradualmente |
| **Barras de progresso Bancada** | Carga por técnico mockada | `BancadaV3.tsx` já existe |
| **Tags SLA (No prazo/Em risco/Estourado)** | Cálculo no front com datas mockadas | `SlaAtrasosV3.tsx` já existe; as tags podem ser computadas com dados reais |
| **Caixa do dia no PDV** | Mock local | `PdvServicoV3.tsx` conectado ao `pdv-servico-actions` já existe |
| **Página Auditoria de UX** | Documentação do redesign embutida no protótipo | **NÃO adicionar ao app** — é artefato de design |
| **Impressão / PDF / Documentos** | `toast("em breve")` no protótipo | `PrintPreviewV3` já existe e funciona; só integrar ao novo Documentos ▾ dropdown |
| **Modo Bancada auto-colapsa laterais** | Demonstração no protótipo | Comportamento real: state puro de UI, implementar na Fase 1 |

---

## 5. Dependências entre fases

```
Fase 0 (Preparação)
  └─→ Fase 1 (Shell + Icon Rail + Modos)
        └─→ Fase 2 (Command Header + Pipeline Spine)
              ├─→ Fase 3 (Orçamento Enterprise)    ← após Fase 2
              ├─→ Fase 4 (Financeiro / Recibo)      ← após Fase 2
              ├─→ Fase 5 (Auditoria filtrável)      ← após Fase 2 (independente de 3 e 4)
              └─→ Fase 6 (Rail modules ao vivo)     ← após Fase 1 (independente de 2-5)
                    └─→ Fase 7 (Responsividade < 1280px)  ← após todas
```

Regra: **nenhuma fase de dados depende de outra fase de dados**. A dependência crítica é o cockpit shell (Fase 1) porque ele define onde cada stage panel vive. Fase 2 (pipeline spine) desbloqueia as Fases 3-5 porque os stage panels só fazem sentido quando a navegação por etapa existe.

---

## 6. Plano de integração em fases

---

### FASE 0 — Preparação (sem código de UI)

**Objetivo:** alinhar fundação antes de qualquer mudança visual.

**Atividades:**
1. Mapear as 8 etapas V4 → seções V3 existentes:

| Etapa V4 | Seções V3 existentes que alimentam o stage panel |
|---|---|
| Entrada | `ProvaEntradaV3`, `ChecklistEntradaV3`, `SenhaAcessoriosV3` (credenciais) |
| Diagnóstico | `DiagnosticoTecnicoV3`, `HistoricoAparelhoV3` |
| Orçamento | `OrcamentoPanelV3` |
| Execução | `ProducaoTecnicoV3`, `ServicosExecutadosV3`, checklist técnico |
| Financeiro | `OSSectionV3 Financeiro` → expandir para `OSFinanceiroStageV3` |
| Entrega | `OSSectionV3 Entrega` + `GarantiaOSV3` → `OSEntregaStageV3` |
| Pós-venda | `PosVendaV3` |
| Histórico | `OSHistoricoV3` + filtro |

2. Confirmar que `OrcamentoLinhaKindV3 = "cobrado" | "brinde" | "interno"` se mantém intocada — o rótulo "Desconto" que o protótipo usa equivale ao "interno" do model atual. **Não renomear o enum** — renomear causaria migration de dados no JSONB ou inconsistência.

3. Confirmar que `OSContextRailV3` vai se tornar a Coluna Atividade sem modificação de conteúdo.

4. Confirmar breakpoints de colapso: `leftOpen: boolean`, `rightOpen: boolean`, derivados de `modo: "recepcao" | "bancada" | "auditoria"`:
   - Recepção → `leftOpen: true`, `rightOpen: true`
   - Bancada → `leftOpen: false`, `rightOpen: false`
   - Auditoria → `leftOpen: false`, `rightOpen: true`

**Não há arquivos alterados nesta fase.**

---

### FASE 1 — Shell, Icon Rail e Modos de Uso

**Objetivo:** novo layout cockpit fluido sem tocar em dados ou lógica de status.

**Escopo preciso:**
- Refatorar `OperacoesV3Shell.tsx` para o layout cockpit 3-colunas
- Refatorar `OperacoesV3Nav.tsx` para icon rail 62px
- Criar `OSModeToggleV3.tsx` (Recepção/Bancada/Auditoria)
- Criar `OSClienteColV3.tsx` (coluna esquerda, somente leitura)
- Adaptar `OSContextRailV3.tsx` para recolhível (32px trilho)
- Atualizar top bar: 40px, incluir `OSModeToggleV3`, manter `abrirNovaOS`

**Arquivos alterados:**
```
components/operacoes-v3/OperacoesV3Shell.tsx     ← refatorado (layout)
components/operacoes-v3/OperacoesV3Nav.tsx       ← refatorado (icon rail)
components/operacoes-v3/components/OSContextRailV3.tsx  ← adição: colapso
components/operacoes-v3/components/OSModeToggleV3.tsx   ← NOVO
components/operacoes-v3/components/OSClienteColV3.tsx   ← NOVO
```

**NÃO muda:**
- `OperacoesV3Context` (contratos dos hooks preservados)
- Conteúdo de qualquer page (DashboardV3, FilaOSV3, etc.)
- Qualquer lógica de status, orçamento, financeiro
- `OSWorkspaceV3` (o layout interno do workspace fica para Fase 2)

**Novo state do Shell:**
```typescript
const [modo, setModo] = useState<"recepcao" | "bancada" | "auditoria">("recepcao");
const [leftOpen, setLeftOpen] = useState(true);
const [rightOpen, setRightOpen] = useState(true);

// Modo auto-controla as colunas
const handleModo = (m: typeof modo) => {
  setModo(m);
  setLeftOpen(m === "recepcao");
  setRightOpen(m !== "bancada");
};
```

**Risco:** Baixo. Estado puro de UI. Nenhuma escrita de dado. Regressão possível: overflow horizontal se `min-w-0` não for propagado em todas as colunas.

**Mitigação:** testar com OS aberta nos 3 modos em viewport 1280px, 1440px, 1920px.

---

### FASE 2 — Command Header + Pipeline Spine

**Objetivo:** transformar o workspace interno de scroll linear para cockpit staged.

**Escopo preciso:**
- Criar `OSStagePipelineV3.tsx` (spine 52px, 8 etapas clicáveis)
- Refatorar `OSCommandBarV3.tsx` para command header inline (46px):
  - Manter toda lógica de `acaoPrimariaV3` / `proximasTransicoesV3` intacta
  - Adicionar: SLA badge, total badge, `Documentos ▾` dropdown (PrintPreviewV3), ⋯ menu
- Refatorar `OSWorkspaceV3` interno:
  - Stage panel por etapa (switch por `etapaAtiva`)
  - Left: `OSClienteColV3` (já criado na Fase 1)
  - Center: `OSCommandBarV3` (novo) + `OSStagePipelineV3` + stage panel
  - Right: `OSContextRailV3` (Coluna Atividade, já recolhível da Fase 1)
- Preservar `<Picker>` (seletor de OS quando nenhuma está aberta)

**Mapeamento pipeline → stage panels (usando componentes existentes):**

| Etapa | `etapaAtiva` | Stage panel |
|---|---|---|
| Entrada | `"entrada"` | `<ProvaEntradaV3>` + `<ChecklistEntradaV3>` |
| Diagnóstico | `"diagnostico"` | `<DiagnosticoTecnicoV3>` + `<HistoricoAparelhoV3>` |
| Orçamento | `"orcamento"` | `<OrcamentoPanelV3>` |
| Execução | `"execucao"` | `<ProducaoTecnicoV3>` + `<ServicosExecutadosV3>` + checklist técnico |
| Financeiro | `"financeiro"` | `<OSSectionV3 Financeiro>` (expandida → Fase 4) |
| Entrega | `"entrega"` | `<OSSectionV3 Entrega>` + `<GarantiaOSV3>` (expandida → Fase 4) |
| Pós-venda | `"pos-venda"` | `<PosVendaV3>` |
| Histórico | `"historico"` | `<OSHistoricoV3>` (filtro → Fase 5) |

**Arquivos alterados:**
```
components/operacoes-v3/components/OSCommandBarV3.tsx   ← refatorado (visual)
components/operacoes-v3/components/OSStagePipelineV3.tsx ← NOVO
components/operacoes-v3/pages/OSWorkspaceV3.tsx         ← refatorado (estrutura)
```

**NÃO muda:**
- Lógica de `handle()` e `pendingTo` no `OSCommandBarV3`
- Todos os stage panel components (ProvaEntradaV3, OrcamentoPanelV3, etc.)
- `OperacoesV3Context`

**Risco:** Alto no workspace. Mitigation: manter o layout antigo sob feature flag temporária (`?v=3`) durante desenvolvimento. Testar cada etapa isolada.

**Critério de saída:** todas as 8 etapas navegáveis; conteúdo de cada etapa idêntico ao V3 atual; transições de status funcionando igual.

---

### FASE 3 — Orçamento Enterprise

**Objetivo:** alinhar o OrcamentoPanelV3 ao stage panel de orçamento da V4, sem tocar no model.

**Delta V3 → V4 no orçamento:**
- V4 exibe "Cobrado / Brinde / Desconto" como rótulos de linha
- V3 real tem kinds `cobrado | brinde | interno`
- **Decisão:** renomear o rótulo UI de "Interno" → "Desconto" nos `KindSelect` e `KindBadge` sem alterar o enum. O model e o JSONB persistem `"interno"`.
- V4 mostra: subtotal, desconto (global), brinde total (R$), total, custo, lucro
  - V3 atual mostra: subtotal, desconto, total, custo, lucro (em grid 3-col)
  - Adicionar: linha "Brindes" no grid de totais (computed de `linhas.filter(k === 'brinde').reduce(custo)`)
- V4 mostra disponibilidade de peças
  - V3 atual tem badge "Estoque" / "Manual" — manter; disponibilidade de quantidade real exige Fase 6+

**Arquivos alterados:**
```
components/operacoes-v3/components/OrcamentoPanelV3.tsx  ← rótulo UI + totais
```

**NÃO muda:**
- `orcamento-model.ts` (enum e math intocados)
- Ações de salvar/enviar/aprovar/recusar
- ProductPickerV3

**Risco:** Muito baixo. Apenas label strings e adição de uma linha no grid de totais.

---

### FASE 4 — Financeiro / Recibo / Saldo

**Objetivo:** stage panel Financeiro completo e stage panel Entrega completo, mais modal de Recibo.

**Sub-bloco 4A — Stage Financeiro:**
- Criar `OSFinanceiroStageV3.tsx` a partir do `OSSectionV3 Financeiro` existente
- Adicionar: KPIs em cards (total / recebido / saldo / status), histórico de recebimentos (de `lerPagamentoV3`), plano de parcelamento se existir
- Manter CTA "Receber no PDV de Serviço" (navega para `pdv-servico`) — regra de negócio intocável
- **NÃO** implementar recebimento inline no stage

**Sub-bloco 4B — Stage Entrega:**
- Criar `OSEntregaStageV3.tsx` consolidando:
  - `OSSectionV3 Entrega` (dados de retirada existentes)
  - `GarantiaOSV3` (já existe)
  - Checklist final de entrega (visual — ação em construção honesta)
  - Acessórios devolvidos (checar vs `ProvaEntradaV3.acessorios`)

**Sub-bloco 4C — Recibo:**
- Criar `OSReciboPanelV3.tsx` (modal/drawer)
  - Lê dados de `lerPagamentoV3(os)` — saldo, recebidos, total
  - Botão "Imprimir recibo" → `setPrintTipo("recibo")` no `PrintPreviewV3`
  - Se `PrintPreviewV3` não tem "recibo" como tipo, adicionar o tipo ao `documentos.ts` e ao `print-model`
- Integrar no command header: botão Recibo aparece quando `pagV3.status !== "sem_cobranca"`

**Arquivos alterados:**
```
components/operacoes-v3/components/OSFinanceiroStageV3.tsx  ← NOVO
components/operacoes-v3/components/OSEntregaStageV3.tsx     ← NOVO
components/operacoes-v3/components/OSReciboPanelV3.tsx      ← NOVO
lib/operacoes-v3/documentos.ts         ← APENAS se tipo "recibo" não existir (verificar antes)
components/operacoes-v3/components/print/PrintPreviewV3.tsx ← APENAS se tipo "recibo" faltar
```

**NÃO muda:**
- `payment-model.ts`
- `pdv-servico-actions.ts`
- `entrega-actions.ts`

**Risco:** Baixo. Todo o backend já existe. Risco residual: se `documentos.ts` e `print-model.ts` não suportarem o tipo "recibo", a adição é cirúrgica (+1 case no switch).

---

### FASE 5 — Timeline + Auditoria Filtrável

**Objetivo:** OSHistoricoV3 com filtro de categorias.

**Delta V3 → V4:**
- V3 atual: paginação simples (12 por página, "Ver todos")
- V4: barra de filtro — Tudo / Status / Financeiro / Comunicação / Técnico

**Implementação (baixo risco):**
- Adicionar `useState<FiltroAuditoria>` local em `OSHistoricoV3`
- Mapeamento de `EventoTipo` → categoria:
  ```
  Status      → mudanca_status, servico_iniciado, servico_concluido, entrega_cliente, os_cancelada
  Financeiro  → (qualquer tipo relacionado a pagamento/financeiro — verificar lerHistoricoV3)
  Comunicação → (WhatsApp, notificação — maioria ainda placeholder)
  Técnico     → diagnostico_registrado, checklist_finalizado, orcamento_*, garantia_*
  Tudo        → sem filtro
  ```
- O `lerHistoricoV3` de `workspace-model.ts` retorna `EventoTipo[]` — intocável
- O filtro é client-side puro sobre o array resultante

**Arquivos alterados:**
```
components/operacoes-v3/components/OSHistoricoV3.tsx  ← adição filtro client-side
```

**NÃO muda:**
- `workspace-model.ts`
- `lerHistoricoV3`

**Risco:** Mínimo. Adição de state local e `.filter()`.

---

### FASE 6 — Rail Modules ao Vivo

**Objetivo:** garantir que cada ícone do icon rail abre a tela correta com dados reais.

**Mapeamento icon rail (V4) → ScreenId (V3):**

| Ícone V4 | ScreenId V3 | Status atual |
|---|---|---|
| Visão geral | `dashboard` | `DashboardV3.tsx` — dados derivados de `ordens` |
| Fila | `fila` | `FilaOSV3.tsx` — kanban real |
| OS (Workspace) | `workspace` | `OSWorkspaceV3` — real |
| Bancada | `bancada` | `BancadaV3.tsx` — parcialmente real |
| SLA & atrasos | `sla` | `SlaAtrasosV3.tsx` — parcialmente real |
| PDV de serviço | `pdv-servico` | `PdvServicoV3.tsx` — conectado a `pdv-servico-actions` |
| Config | `configuracoes` | `ConfiguracoesV3.tsx` — placeholder |

**Atividades:**
- Confirmar que o icon rail da Fase 1 já navega para esses `ScreenId`
- Enriquecer gradualmente cada tela (sem quebrar o existente):
  - `DashboardV3`: verificar se KPIs derivam dos `ordens` do contexto (devem, já usam `useOperacoesV3()`)
  - `SlaAtrasosV3`: adicionar cálculo das tags "No prazo / Em risco / Estourado" usando `previsaoEntrega` do payload
  - `BancadaV3`: garantir que os técnicos listados vêm de `ordens` filtradas por técnico (não mock)
- **Não tocar** em `PdvServicoV3.tsx` e `pdv-servico-actions.ts` (PDV real — fora do escopo do redesign)

**Arquivos alterados:**
```
components/operacoes-v3/pages/DashboardV3.tsx      ← verificar, ajustar se mock
components/operacoes-v3/pages/SlaAtrasosV3.tsx     ← tags computadas
components/operacoes-v3/pages/BancadaV3.tsx        ← filtro por técnico de ordens reais
```

**NÃO muda:**
- `PdvServicoV3.tsx` (fora do escopo)
- `FilaOSV3.tsx` (já real)
- `OSWorkspaceV3.tsx`

**Risco:** Baixo para Dashboard/SLA (client-side derivado). Médio para Bancada se depender de dados ausentes no payload de técnico.

---

### FASE 7 — Responsividade e Polimento < 1280px

**Objetivo:** o cockpit funciona em telas abaixo de 1280px sem overflow ou perda de função.

**Regras de colapso:**

| Viewport | Layout |
|---|---|
| ≥ 1440px | 3 colunas completas (cliente + centro + atividade) |
| 1280–1440px | Laterais auto-recolhidas (só trilho 32px); centro ocupa todo |
| 1024–1280px | Icon rail some (menu hamburger ou bottom nav); cockpit 1-col |
| < 1024px | Layout linear: top bar + conteúdo por etapa (sem colunas) |

**Regra geral:** abaixo de 1280px as colunas laterais ficam fechadas por padrão; o usuário pode abrir como drawer/overlay.

**Atividades:**
- Auditar todos os breakpoints do icon rail: de 62px → menu colapsável
- Garantir que a coluna cliente e a coluna atividade colapsam para drawer em mobile
- Verificar hit targets mínimos (40px altura) em todos os botões do cockpit
- Testar em viewport 375px (iPhone SE) e 768px (iPad)

**Arquivos alterados:**
```
components/operacoes-v3/OperacoesV3Shell.tsx       ← breakpoints de colapso
components/operacoes-v3/components/OSClienteColV3.tsx   ← drawer mode < 1024
components/operacoes-v3/components/OSContextRailV3.tsx  ← drawer mode < 1024
components/operacoes-v3/OperacoesV3Nav.tsx         ← hamburger / bottom nav < 1024
```

**Risco:** Médio. Testes em múltiplos viewports são obrigatórios antes de merge.

---

## 7. Riscos de regressão catalogados

| Risco | Severidade | Arquivo(s) crítico(s) | Mitigação |
|---|---|---|---|
| **Quebra da máquina de status** ao refatorar `OSCommandBarV3` | Crítico | `status-machine.ts`, `OSCommandBarV3.tsx` | Manter `handle(to)`, `acaoPrimariaV3`, `proximasTransicoesV3` intocados. Testar cada transição manualmente após Fase 2. |
| **Recálculo de orçamento divergente** ao renomear "interno" → "Desconto" no UI | Alto | `orcamento-model.ts`, `OrcamentoPanelV3.tsx` | Alterar APENAS os `label` strings nos `KindSelect`/`KindBadge`. Não alterar o enum `OrcamentoLinhaKindV3`. Verificar testes existentes em `orcamento-model.test.ts`. |
| **Recebimento fora do PDV** se o stage Financeiro ganhar botão de recebimento inline | Crítico | `payment-model.ts`, `pdv-servico-actions.ts` | O único CTA de recebimento DEVE navegar para `pdv-servico`. Nenhum form de pagamento no stage Financeiro. |
| **Credenciais expostas** na OS impressa ao mexer no bloco de segurança | Alto | `print-model.ts`, `ProvaEntradaV3.tsx` | NÃO tocar em `print-model.ts`. O mascaramento existe em `lerCredenciaisParaImpressao` — preservar. |
| **Perda de estado das laterais** ao migrar layout do Shell | Médio | `OperacoesV3Shell.tsx` | Novo state (`leftOpen`, `rightOpen`, `modo`) deve ser local ao Shell. O `OperacoesV3Context` não muda. |
| **OSWorkspaceV3 quebra o selectedOsId** ao refatorar para staged | Alto | `OSWorkspaceV3.tsx`, `OperacoesV3Context` | Manter lógica de `selectedOsId`/`openOS`/`navigate` no contexto. O picker de OS não muda. |
| **Scroll do stage panel vaza para o cockpit** | Médio | `OSWorkspaceV3.tsx` layout | Somente o centro deve ter `overflow-y-auto`; as colunas laterais têm scroll próprio. Usar `min-h-0` em todos os flex items. |
| **Densidade quebra toque em tablet** | Médio | Top bar (40px), command header (46px), spine (52px) | Verificar altura mínima de 44px em todos os elementos interativos na Fase 7. |
| **Drift de tokens** (cores hardcoded do protótipo viram novos tokens) | Médio | Qualquer componente novo | O protótipo usa `#4f46e5` (= `bg-primary`). Mapear para tokens existentes antes de codar. Não criar nova variável CSS sem verificar se já existe equivalente. |
| **Regressão de responsivo** abaixo de 1280px | Alto | Shell + colunas | Fase 7 é obrigatória antes de considerar o redesign completo. |
| **Nova OS não abre** após refatorar o top bar | Médio | `OperacoesV3Shell.tsx` | `abrirNovaOS` vem do contexto — não depende do layout do top bar. Testar ao final da Fase 1. |
| **Fila e Bancada ficam inacessíveis** após icon rail | Médio | `OperacoesV3Nav.tsx` | Icon rail deve emitir `navigate(id)` do contexto. Testar toda a navegação após Fase 1. |
| **`OSHistoricoV3` filtra errado** | Baixo | `OSHistoricoV3.tsx` | O mapeamento de `EventoTipo` → categoria deve cobrir todos os tipos de `TIPO_TONE`. Validar após Fase 5. |

---

## 8. Arquivos que serão alterados (consolidado)

### Fase 1
```
components/operacoes-v3/OperacoesV3Shell.tsx         ← refactor layout
components/operacoes-v3/OperacoesV3Nav.tsx           ← refactor icon rail
components/operacoes-v3/components/OSContextRailV3.tsx  ← colapso
components/operacoes-v3/components/OSModeToggleV3.tsx   ← NOVO
components/operacoes-v3/components/OSClienteColV3.tsx   ← NOVO
```

### Fase 2
```
components/operacoes-v3/components/OSCommandBarV3.tsx   ← refactor (visual)
components/operacoes-v3/components/OSStagePipelineV3.tsx ← NOVO
components/operacoes-v3/pages/OSWorkspaceV3.tsx         ← refactor (estrutura)
```

### Fase 3
```
components/operacoes-v3/components/OrcamentoPanelV3.tsx  ← rótulo + totais
```

### Fase 4
```
components/operacoes-v3/components/OSFinanceiroStageV3.tsx  ← NOVO
components/operacoes-v3/components/OSEntregaStageV3.tsx     ← NOVO
components/operacoes-v3/components/OSReciboPanelV3.tsx      ← NOVO
lib/operacoes-v3/documentos.ts         ← verificar (talvez +1 tipo)
components/operacoes-v3/components/print/PrintPreviewV3.tsx ← verificar
```

### Fase 5
```
components/operacoes-v3/components/OSHistoricoV3.tsx  ← filtro
```

### Fase 6
```
components/operacoes-v3/pages/DashboardV3.tsx
components/operacoes-v3/pages/SlaAtrasosV3.tsx
components/operacoes-v3/pages/BancadaV3.tsx
```

### Fase 7
```
components/operacoes-v3/OperacoesV3Shell.tsx       ← breakpoints
components/operacoes-v3/components/OSClienteColV3.tsx
components/operacoes-v3/components/OSContextRailV3.tsx
components/operacoes-v3/OperacoesV3Nav.tsx
```

### Arquivos INTOCÁVEIS em todo o processo
```
lib/operacoes-v3/status-machine.ts
lib/operacoes-v3/orcamento-model.ts
lib/operacoes-v3/payment-model.ts
lib/operacoes-v3/workspace-model.ts
lib/operacoes-v3/prova-entrada-model.ts
lib/operacoes-v3/print-model.ts
lib/operacoes-v3/nova-os-model.ts
lib/operacoes-v3/nova-os-actions.ts
lib/operacoes-v3/status-actions.ts
lib/operacoes-v3/garantia-*.ts
lib/operacoes-v3/orcamento-actions.ts
lib/operacoes-v3/entrega-actions.ts
lib/operacoes-v3/retorno-actions.ts
lib/operacoes-v3/pdv-servico-actions.ts
lib/operacoes-v3/nova-os-draft-storage.ts
components/operacoes-v3/context/OperacoesV3Context.tsx
components/operacoes-v3/hooks/ (todos)
components/operacoes-v3/components/PatternPadV3.tsx
components/operacoes-v3/components/SignaturePadV3.tsx
components/operacoes-v3/components/ProductPickerV3.tsx
components/operacoes-v3/components/UiV3.tsx
components/operacoes-v3/components/print/*.tsx
components/operacoes-v3/components/NovaOSEnterpriseModalV3.tsx
components/operacoes-v3/components/ProvaEntradaV3.tsx
components/operacoes-v3/components/ChecklistEntradaV3.tsx
components/operacoes-v3/components/DiagnosticoTecnicoV3.tsx
components/operacoes-v3/components/ProducaoTecnicoV3.tsx
components/operacoes-v3/components/GarantiaOSV3.tsx
components/operacoes-v3/components/PosVendaV3.tsx
components/operacoes-v3/components/HistoricoAparelhoV3.tsx
components/operacoes-v3/components/ServicosExecutadosV3.tsx
app/dashboard/operacoes-v3/page.tsx
prisma/schema.prisma  (jamais)
app/actions/operacoes.ts  (jamais neste redesign)
```

---

## 9. Fase recomendada para começar e estimativa de impacto

### Fase recomendada para iniciar: **Fase 1 (Shell + Icon Rail + Modos)**

**Por quê iniciar pela Fase 1:**
1. É puramente de layout/UI — zero risco de dado
2. Desbloqueia todas as fases seguintes
3. O impacto visual é imediato e validável sem integração de dados
4. É reversível: se algo der errado, o rollback é só CSS/layout
5. A Fase 2 (pipeline) só faz sentido quando o cockpit existe

**Estimativa de impacto por fase:**

| Fase | Impacto Visual | Risco Operacional | Esforço estimado |
|---|---|---|---|
| Fase 0 (Preparação) | Nenhum | Nenhum | 1–2h documentação |
| Fase 1 (Shell + Rail + Modos) | Alto | Baixo | 4–6h |
| Fase 2 (Command Header + Pipeline) | Muito alto | Médio–alto | 6–8h |
| Fase 3 (Orçamento Enterprise) | Médio | Muito baixo | 1–2h |
| Fase 4 (Financeiro + Recibo + Entrega) | Alto | Baixo | 4–6h |
| Fase 5 (Auditoria filtrável) | Baixo | Mínimo | 1–2h |
| Fase 6 (Rail ao vivo) | Médio | Baixo | 2–4h |
| Fase 7 (Responsividade < 1280px) | Alto | Médio | 3–5h |

**Ordem ideal de implementação (reconciliada com as prioridades do usuário):**

```
Fase 0  →  Fase 1  →  Fase 2  →  (Fase 3 + Fase 5 em paralelo)  →  Fase 4  →  Fase 6  →  Fase 7
```

A Fase 2 desbloqueou os stage panels; Fase 3 e Fase 5 são independentes entre si e podem ir num mesmo PR. A Fase 4 (Financeiro/Recibo) vai num PR separado por ser a mais crítica do ponto de vista financeiro. A Fase 6 (rail ao vivo) pode ser feita gradualmente em paralelo com qualquer fase de Workspace.

---

## 10. Decisões técnicas necessárias antes de implementar

| Decisão | Impacto | Recomendação |
|---|---|---|
| Renomear "Interno" → "Desconto" no UI do orçamento? | Médio | Sim — apenas label UI, enum intocado |
| Adicionar tipo "recibo" em `documentos.ts`? | Baixo | Verificar o arquivo antes; adicionar se ausente |
| Colapso das laterais: state no Shell ou no contexto? | Médio | **No Shell** — não contaminar o contexto com UI state |
| Icon rail: tooltip só hover ou label sempre visível? | Baixo | Tooltip hover ≥1024px; label embaixo ícone < 1024px |
| Pipeline spine: derivar etapa ativa do status ou estado local? | Alto | **Estado local** (`useState<EtapaV4>`); status apenas pré-seleciona a etapa ao abrir |
| Modal de Recibo: drawer lateral ou modal central? | Baixo | Modal central (consistent com `PrintPreviewV3`) |

---

*Documento gerado por auditoria read-only. Nenhum arquivo de código foi alterado.*
*Próximo passo: aprovação do plano → início da Fase 1.*
