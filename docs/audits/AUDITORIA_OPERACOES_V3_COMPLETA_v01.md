---
title: Auditoria Operacional Completa — Operações V3
hub: operacoes (V3)
tipo: auditoria read-only (sem alteração de código)
status: v01
data: 2026-06-07
owner_humano: Rafael
owner_ia: Opus (Claude Code)
escopo: components/operacoes-v3/** · lib/operacoes-v3/** · app/dashboard/operacoes-v3/** + integrações (app/actions/**, lib/events/**, components/operacoes/**)
pergunta_central: "Se uma assistência técnica começasse a usar a Operações V3 amanhã, o que ainda impediria a operação real?"
---

# 🔬 Auditoria Operacional Completa — Operações V3 (v01)

> **Read-only.** Nenhum código, schema, migração, banco ou commit alterado. Evidência: leitura integral
> de `components/operacoes-v3/**` (20 telas + componentes + hooks), `lib/operacoes-v3/**`,
> `app/dashboard/operacoes-v3/**`, e das integrações reais (`app/actions/ordens.ts`,
> `lib/operacoes-v3/*-actions.ts`, `lib/events/event-bus.ts`, adapters de Financeiro/Estoque/Garantia).

---

## 1. Resumo executivo

A Operações V3 é, hoje, um **prontuário de bancada muito acima da média do mercado SMB** — porém ainda
**não é um sistema de operação fechada**. O núcleo (abertura de OS, orçamento, máquina de status, bancada,
pós-venda, recebimento) é **real e persistente**; as bordas (estoque, comunicação com o cliente, catálogos,
relatórios, configuração) são **placeholders honestos**.

**Veredito direto da pergunta central:** uma assistência **conseguiria abrir, diagnosticar, orçar, executar,
receber e entregar uma OS amanhã** pela V3 — mas com **3 bloqueios reais** que impediriam a operação correta:

1. **🔴 Estoque nunca é baixado.** Vender peça pela V3 **não** decrementa inventário (a flag `baixaEstoqueV3`
   só é registrada, nunca executada). Em uma semana o estoque fica irreal.
2. **🔴 Zero comunicação com o cliente.** As 10 etapas de evento existem (Fase 3C.0) mas **não há nenhum
   assinante** — nada dispara WhatsApp/notificação. As telas **Portal** e **Notificações** são placeholders.
   O cliente nunca é avisado de "orçamento pronto" / "pode retirar".
3. **🟠 Dois caminhos de "entregue" divergentes.** Marcar entregue pelo Kanban/Command Bar finaliza o status
   **mas não registra a entrega** (quem retirou, data) nem **inicia a contagem de garantia** — que conta a
   partir da entrega formal. A garantia fica "prevista" para sempre.

Fora isso, **Financeiro (recebimento) é real**, **garantia/retorno/técnico/SLA são reais**, e a disciplina
"dado real vs. a-conectar" é **exemplarmente honesta** (nada de KPI fake; cards sem fonte mostram pílula
"a conectar"). O risco de produção **não** é "telas mentirosas" — é **escopo incompleto** nas bordas.

| Dimensão | Estado |
|---|---|
| Telas **FUNCIONAIS** (núcleo real) | 11 de 20 |
| Telas **PARCIAIS** (real + lacuna declarada) | 2 (Serviços, Técnicos) |
| Telas **PLACEHOLDER** (honestas, nada grava) | 7 (Atendimento, Portal, Notificações, Peças, Rastreio, Relatórios, Configurações) |
| Telas **QUEBRADAS** | 0 |
| Persistência real | OS, orçamento, status, checklist/senha/diagnóstico, garantia, entrega, retorno, técnico/prioridade, **recebimento (CR+caixa)** |
| Bloqueios P0 de produção | **3** (estoque, comunicação cliente, divergência de entrega) |

---

## 2. Matriz de funcionalidades (navegação)

> Legenda: **FUNCIONAL** = grava/lê dado real · **PARCIAL** = parte real + lacuna declarada · **PLACEHOLDER**
> = casca honesta (nada grava) · **QUEBRADA** = erro/sem função. Fonte: `OperacoesV3Shell.tsx` (19 telas) +
> Hub (shell).

| # | Aba | Estado | Evidência / observação |
|---|---|---|---|
| — | **Hub** (shell) | **FUNCIONAL** | `OperacoesV3Shell.tsx` — navegação por estado, "Nova OS", "Atualizar", toasts honestos, guard de `storeId`. |
| 1 | **Dashboard** | **FUNCIONAL** | KPIs reais (status, orçamento, produção, pós-venda). 2 cards **"a conectar"** honestos (Recebido hoje / Saldo em aberto, `DashboardV3.tsx:112-113`). |
| 2 | **Fila de OS** | **FUNCIONAL** | Kanban com **drag→status real** (máquina única) + Lista real. Aba **Calendário = placeholder interno** (`FilaOSV3.tsx:124`). |
| 3 | **Atendimento rápido** | **PLACEHOLDER** | Form visual editável; **"nada é gravado aqui"** (`AtendimentoRapidoV3.tsx:67`). Redireciona à Nova OS Enterprise. |
| 4 | **Bancada por técnico** | **FUNCIONAL** | Produção do dia + OS por técnico + ações rápidas reais. "Fila de produção" são **botões que só navegam** (não filtram, `BancadaV3.tsx:146-155`). |
| 5 | **SLA & atrasos** | **FUNCIONAL** | Deriva de `os.sla` (atrasada/risco/no prazo). Honesto: usa o SLA já gravado na OS. |
| 6 | **OS Workspace** | **FUNCIONAL** | Prontuário completo; checklist/senha/diagnóstico/orçamento/garantia/entrega/retorno/técnico **persistem**. Alguns botões de rodapé/rail são placeholder (ver §3). |
| 7 | **PDV de serviço** | **FUNCIONAL** | Recebimento **real** (Conta a Receber + caixa + estorno). Cartão parcelado/crediário/carteira "a conectar". Exige **caixa aberto (PDV principal)**. |
| 8 | **Orçamentos** | **FUNCIONAL** | Funil real por status (rascunho→expirado); abre a OS. Leitura — a edição mora no Workspace. |
| 9 | **Garantias** | **FUNCIONAL** | Segmentação real (ativa/vencendo/vencida/prevista) derivada da entrega (`pos-venda-model`). |
| 10 | **Retornos & retrabalho** | **FUNCIONAL** | Lista real de retornos + KPIs (taxa de retorno). Abertura/finalização no Workspace. |
| 11 | **Portal do cliente** | **PLACEHOLDER** | `PortalClienteV3.tsx` → `PlaceholderScreenV3`. Nenhum link público/consulta. |
| 12 | **Notificações** | **PLACEHOLDER** | `NotificacoesV3.tsx` → `PlaceholderScreenV3`. Nenhuma automação ativa. |
| 13 | **Serviços** | **PARCIAL** | Lista **real** agregada das OS (read-only); **CRUD de catálogo = placeholder** ("Novo serviço" → toast, `ServicosV3.tsx:52`). |
| 14 | **Peças & pedidos** | **PLACEHOLDER** | `PecasPedidosV3.tsx` → `PlaceholderScreenV3`. Sem reserva/pedido. |
| 15 | **Rastreio físico** | **PLACEHOLDER** | `RastreioFisicoV3.tsx` → `PlaceholderScreenV3`. |
| 16 | **Técnicos** | **PARCIAL** | Métricas **reais** (atribuídas/execução/prontas/atrasadas/entregues hoje). **Tempo médio/comissão "a conectar"**; sem cadastro de técnico (id por slug do nome). |
| 17 | **Histórico de clientes** | **FUNCIONAL** | Agrupamento real por cliente + busca. |
| 18 | **Relatórios** | **PLACEHOLDER** | `RelatoriosV3.tsx` → `PlaceholderScreenV3`. |
| 19 | **Configurações** | **PLACEHOLDER** | `ConfiguracoesV3.tsx` — 7 blocos visuais; **"nada é salvo nesta fase"** (`:41`). |

---

## 3. Matriz de botões

> Classificação: **AÇÃO REAL** (persiste/efeito real) · **AÇÃO MOCK** (muda estado local sem persistir) ·
> **PLACEHOLDER** (toast honesto "próxima fase") · **NAVEGAÇÃO** (troca de tela). Não há botão "mentiroso"
> (que finja salvar) — os placeholders são **declarados**.

| Botão | Tela | Situação | Observação |
|---|---|---|---|
| Nova OS | Hub/Dashboard/Fila/Workspace | **AÇÃO REAL** | `criarOSEnterpriseV3` — cria OS+cliente reais, emite `os_criada`. |
| Atualizar | Hub | **AÇÃO REAL** | `reload()` → `listOrdens` (Prisma). |
| Criar Ordem de Serviço | Nova OS Modal | **AÇÃO REAL** | `handleCriar` → persiste; **não baixa estoque** (ver §6). |
| Arrastar card (Kanban) | Fila | **AÇÃO REAL** | `aplicarTransicaoStatusV3` (status + timeline + evento). |
| Ação primária / transições / Cancelar OS | Workspace (Command Bar) | **AÇÃO REAL** | Máquina única. **"Mais ações" = PLACEHOLDER** (`OSCommandBarV3.tsx:80`). |
| Gerar/Salvar/Enviar/Aprovar/Recusar orçamento | Workspace (Orçamento) | **AÇÃO REAL** | `useOrcamentoV3` → actions reais + versões + timeline. |
| Salvar checklist / senha+acessórios / diagnóstico | Workspace | **AÇÃO REAL** | `useWorkspaceV3` → `workspace-actions` (payload + timeline). |
| Atribuir/Alterar/Remover técnico · Prioridade | Workspace (Produção) | **AÇÃO REAL** | `producao-actions` (`payload.tecnico`/`prioridadeV3`). |
| Salvar garantia / Aplicar sugestão | Workspace (Garantia) | **AÇÃO REAL** | `salvarGarantiaOSV3` (payload + timeline), emite `os_garantia_criada`. |
| Registrar entrega / Abrir-Finalizar retorno | Workspace (Pós-venda) | **AÇÃO REAL** | `entrega-actions`/`retorno-actions` + eventos. |
| Imprimir OS/Garantia/Via Interna/Etiqueta/Termo Entrega | Workspace (rodapé) | **AÇÃO REAL** | `PrintPreviewV3` (documento A4) + registra `documento_impresso`. |
| Receber / Quitar / Split / Estornar | PDV de Serviço | **AÇÃO REAL** | `pdv-servico-actions` (Conta a Receber + caixa). |
| Avançar para Recebida / Marcar Entregue | PDV de Serviço | **AÇÃO REAL** | `mudarStatus` (status-only, **sem estoque**). |
| Adicionar foto (antes/depois) | Workspace (Anexos) | **PLACEHOLDER** | `AnexosV3.tsx:84-85` → toast; **sem upload real**. |
| Enviar mensagem ao cliente | Workspace (Rail Comunicação) | **PLACEHOLDER** | `OSContextRailV3.tsx:77` → toast. |
| Portal do cliente | Workspace (rodapé) | **PLACEHOLDER** | `OSWorkspaceV3.tsx:389` → toast "Abrir portal do cliente". |
| Imprimir etiqueta de entrada | Atendimento rápido | **PLACEHOLDER** | `AtendimentoRapidoV3.tsx:135` → toast. |
| Novo serviço | Serviços | **PLACEHOLDER** | `ServicosV3.tsx:52` → toast "Cadastrar serviço". |
| Fila de produção (5 colunas) | Bancada | **NAVEGAÇÃO** | Vai para Fila — **não filtra** pela coluna clicada. |
| Calendário (tab) | Fila | **PLACEHOLDER** | Empty-state "em construção". |
| Blocos de Configuração (7) | Configurações | **PLACEHOLDER** | Visual; nada salva. |

---

## 4. CRUDs por módulo

> ✅ funciona · 🟡 parcial · ❌ ausente. "Atualiza tela" = re-busca após a ação (`reload`/`reloadOrdem`).

| Módulo | Cria | Edita | Exclui | Persiste | Atualiza tela | Notas |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **OS** | ✅ | ✅ | 🟡 | ✅ | ✅ | "Exclui" = **cancelar** (status), não há delete físico. |
| **Orçamento** | ✅ | ✅ | ✅ (linha) | ✅ | ✅ | CRUD completo de itens/peças + versões + recusa. |
| **Checklist / Senha / Diagnóstico** | ✅ | ✅ | n/a | ✅ | ✅ | Payload + timeline. |
| **Garantia (prevista)** | ✅ | ✅ | n/a | ✅ | ✅ | Não cria `GarantiaOperacional` no DB (ver §6). |
| **Entrega** | ✅ | ❌ | ❌ | ✅ | ✅ | Registro único; sem editar/desfazer. |
| **Retorno** | ✅ | 🟡 (finalizar) | ❌ | ✅ | ✅ | Embutido em `payload.retornosV3[]`. |
| **Técnico (atribuição)** | ✅ | ✅ | ✅ | ✅ | ✅ | **Sem cadastro de técnico** (id por slug). |
| **Recebimento (PDV Serviço)** | ✅ | n/a | ✅ (estorno) | ✅ | ✅ | Conta a Receber + caixa reais. |
| **Catálogo de Serviços** | ❌ | ❌ | ❌ | ❌ | — | Só leitura agregada. |
| **Catálogo de Peças / Pedidos** | ❌ | ❌ | ❌ | ❌ | — | Placeholder. |
| **Anexos (fotos)** | ❌ | ❌ | ❌ | ❌ | — | Estrutura visual; sem upload. |
| **Configurações do módulo** | ❌ | ❌ | ❌ | ❌ | — | Placeholder. |

---

## 5. Fluxo de OS — ponta a ponta

```
Nova OS ✅ → Diagnóstico ✅ → Orçamento ✅ → Aprovação ✅ → Peças 🔴 → Execução ✅
   → Recebimento ✅ → Entrega 🟠 → Garantia 🟠 → Retorno ✅
```

| Etapa | Estado | Lacuna / passo manual / desconexão |
|---|---|---|
| **Nova OS** | ✅ real | Cria OS+cliente. **Não reserva/baixa estoque** das peças informadas. |
| **Diagnóstico** | ✅ real | Persistido no Workspace. |
| **Orçamento** | ✅ real | Editar/enviar/aprovar/recusar + versões + lucro. |
| **Aprovação** | ✅ real | **Não materializa Conta a Receber** (no V2, aprovar gera receivable; na V3, a CR só nasce no 1º recebimento). → Financeiro não "vê" OS aprovada-não-paga. |
| **Peças** | 🔴 **lacuna crítica** | Não há reserva, pedido, nem **baixa de estoque**. Peça vendida não sai do inventário. Tela Peças = placeholder. |
| **Execução** | ✅ real | Status + bancada + técnico + checklist técnico (read). |
| **Recebimento** | ✅ real | PDV de Serviço (CR + caixa + split + estorno). **Depende de caixa aberto no PDV principal** (cross-módulo). |
| **Entrega** | 🟠 **inconsistente** | 2 caminhos: (a) **Pós-venda → Registrar entrega** (rico: quem retirou, obs, `entregaV3`) e (b) **Kanban/Command Bar → entregue** (status-only, **sem** `entregaV3`). O caminho (b) deixa a OS "entregue" **sem** registro de entrega. |
| **Garantia** | 🟠 depende da entrega | Conta a partir de `entregaV3`. Se a entrega foi pelo caminho (b), a garantia **nunca inicia** (fica "prevista" eternamente). Sem job de vencimento; sem aviso. |
| **Retorno** | ✅ real | Vinculado à OS original; histórico por OS e por cliente. |

**Maior buraco do fluxo:** **Peças/Estoque** (🔴) e a **divergência de Entrega** (🟠) — ambos no meio do
caminho "feliz". O resto encadeia bem.

---

## 6. Integrações internas

| Integração | Estado | Evidência / risco |
|---|---|---|
| **Leitura de OS** (`listOrdens`/`getOrdem`) | ✅ real | `app/actions/ordens.ts` — Prisma, multi-loja, hidratado, não-lança. `getOrdem` roda `expirarGarantiasVencidas` (só nas garantias **operacionais** do DB). |
| **Financeiro — Conta a Receber** | ✅ real | `pdv-servico-actions` reusa `liquidar/registrarPagamentoParcial` + `localKey` única por OS (Correção 2A.1). |
| **Financeiro — Caixa** | ✅ real | `recebimento_cr` por forma entra no fechamento. **Mas o caixa é aberto no PDV principal** — a V3 não abre caixa. |
| **Financeiro — Estorno** | ✅ real | `estornarRecebimentoOSV3` (último pagamento). Limitação 2B: fechamento ainda não abate estorno na gaveta. |
| **Financeiro — aprovação → receivable** | 🟠 lacuna | Aprovar orçamento **não** cria CR; ela só nasce no recebimento. OS aprovada-não-paga **não aparece** no "a receber". |
| **Estoque** | 🔴 ausente | V3 **nunca** consome/restaura estoque. `baixaEstoqueV3` só é registrada. Peças não saem do inventário. |
| **Técnicos** | 🟡 parcial | Atribuição/métricas reais (`payload.tecnico`). **Sem entidade Técnico** (id por slug); sem comissão/tempo. |
| **Garantias** | 🟡 divergente | V3 grava garantia **no payload** (`aberturaV3.garantiaPrevista`) e deriva situação na leitura; **não cria `GarantiaOperacional`** (DB) como o V2. Dois sistemas de garantia coexistem; o job de expiração do DB não vê garantias V3. |
| **Eventos (publisher 3C.0)** | 🟠 produtor sem consumidor | `emitirEventoOperacaoV3` emite os 10 eventos, **mas há ZERO `subscribeOperacaoEventoV3` em produção** (só nos testes). Eventos caem num **ring buffer em memória** que nada lê. |
| **Eventos legados (`lib/events` / `handleEvent`)** | 🔴 desconectado | A V3 **não** chama `handleEvent`/`emitOsFinalizadaOmniEvent` (só o V2 chama, em `app/actions/operacoes.ts`). → **mudança de status na V3 não dispara nenhuma automação WhatsApp/Omni**. |
| **WhatsApp / Portal / Notificações** | 🔴 ausente | Nenhum envio; telas placeholder. |

**Diagnóstico de integração:** a V3 está **financeiramente conectada** (recebimento real) mas
**operacionalmente isolada** do estoque e **comunicacionalmente muda** (eventos sem assinante + sem WhatsApp).

---

## 7. Timeline — coerência

**Eventos que GERAM timeline (reais):** mudança de status, orçamento (criar/salvar/enviar/aprovar/recusar),
checklist/senha/diagnóstico, garantia (gerada/alterada), entrega (`entrega_cliente`), retorno
(`garantia_acionada`/`observacao`), técnico (`atribuicao_tecnico`), prioridade, recebimento (`pagamentoV3`),
impressão (`documento_impresso`). **Cobertura boa.**

**Lacunas / inconsistências da timeline:**

| Item | Tipo | Detalhe |
|---|---|---|
| Entrega via Kanban/Command Bar | **evento ausente** | Caminho (b) grava `mudanca_status` mas **não** `entrega_cliente` nem `entregaV3` → a "entrega" não vira marco de pós-venda. |
| `os_entregue` (3C.0) | **duplicação potencial** | Pode ser emitido por **duas** origens (entrega formal **e** transição de status) — dedup é responsabilidade de um consumidor que **ainda não existe**. |
| Anexos / "Enviar mensagem" / "Portal" / "Mais ações" | **sem histórico** | São placeholders (toast) — corretamente **não** geram timeline. |
| `os_garantia_expirada` | **evento sem emissor** | Definido no inventário 3C.0, mas **nenhum** write-path o emite (precisa job/cron). |
| Recebimento → timeline | ✅ ok | Mas o **estorno** atualiza espelho/timeline financeira; conferir granularidade ao plugar relatórios. |

**Veredito:** a timeline é **coerente com o status** no caminho rico; o ponto frágil é a **entrega
status-only** que não escreve o evento de pós-venda.

---

## 8. Placeholders (inventário)

| Tipo | Arquivo / tela | Impacto |
|---|---|---|
| `PlaceholderScreenV3` | Portal, Notificações, Peças & Pedidos, Rastreio, Relatórios | Telas inteiras sem função (honestas). |
| Casca de formulário | `AtendimentoRapidoV3` | Form visual; **nada grava** (redireciona à Nova OS). |
| Blocos visuais | `ConfiguracoesV3` | 7 blocos; nada salva. |
| Botão "Novo serviço" | `ServicosV3:52` | CRUD de catálogo ausente. |
| Botão "Adicionar foto" | `AnexosV3:84-85` | Sem upload real de imagem. |
| Botão "Enviar mensagem" | `OSContextRailV3:77` | Sem WhatsApp/SMS pela OS. |
| Botão "Portal do cliente" | `OSWorkspaceV3:389` | Sem portal. |
| Botão "Mais ações" | `OSCommandBarV3:80` | Sem menu. |
| Tab "Calendário" | `FilaOSV3:124` | Sem agenda. |
| Cards "a conectar" | `DashboardV3:112-113` | Recebido hoje / Saldo em aberto (Financeiro). |
| "Tempo médio / comissão: a conectar" | `TecnicosV3:54,73` | Métricas de produtividade incompletas. |
| Eventos sem consumidor | `event-publisher.ts` (buffer) | Toda a Fase 3C.0 — produtor sem assinante. |

**Nota positiva:** **nenhum** placeholder finge persistência. A convenção "toast honesto + badge Em
construção + pílula a-conectar" é seguida com rigor — isso reduz drasticamente o risco de operação enganosa.

---

## 9. Funcionalidades que aparentam existir mas não existem

| Achado | Classe | Por quê |
|---|---|---|
| **Baixa de estoque de peças** | **P0** | Nova OS/itens sugerem controle de peça (`baixaEstoque` no item), mas **nada decrementa inventário**. |
| **Comunicação automática com o cliente** | **P0** | Eventos 3C.0 + telas Portal/Notificações dão a impressão de aviso automático; **nenhum assinante/envio**. |
| **Entrega pelo Kanban** | **P1** | "Marcar como entregue" parece concluir a OS, mas **não registra entrega nem inicia garantia**. |
| **Conta a Receber de OS aprovada** | **P1** | Orçamento aprovado parece gerar cobrança; a CR só nasce no recebimento → aging do Financeiro não reflete. |
| **Catálogo de serviços** | **P2** | A tela "Serviços" + botão "Novo serviço" sugerem catálogo gerenciável; é só leitura agregada. |
| **Catálogo/cadastro de técnico** | **P2** | Métricas por técnico sugerem equipe cadastrada; técnicos são **derivados do texto** das OS (id por slug). |
| **Garantia operacional (DB)** | **P2** | Garantia V3 parece igual à do V2, mas **não cria `GarantiaOperacional`** — não entra no job de expiração nem nos relatórios do V2. |
| **Anexos de fotos antes/depois** | **P2** | Slots "Foto frontal/traseira…" sugerem upload; **sem upload**. |
| **Relatórios / BI** | **P3** | Tela existe; placeholder. |
| **Configurações do módulo** | **P3** | 7 blocos; nada salva. |

---

## 10. Bugs e inconsistências (não corrigidos — apenas registrados)

| # | Severidade | Descrição | Evidência |
|---|---|---|---|
| B1 | **P1** | Entrega via Command Bar/Kanban deixa OS "entregue" **sem `entregaV3`** → seção Pós-venda mostra "A OS precisa estar Pronta/Recebida" (beco sem saída) e **garantia nunca inicia**. | `status-actions.ts` (não grava entrega) × `PosVendaV3.tsx:82,136` (`deliverable = pronta\|recebida`). |
| B2 | **P1** | `os_entregue` pode ser emitido por 2 caminhos → **duplicação** quando houver consumidor. | `entrega-actions.ts:113` + `status-actions.ts:146` (`statusV3ParaEvento("entregue")`). |
| B3 | **P2** | `listOrdens` **não** roda `expirarGarantiasVencidas` (só `getOrdem`) → garantia "vencida" no DB só atualiza ao abrir a OS, não na tela Garantias. | `app/actions/ordens.ts:122` vs `:135`. |
| B4 | **P2** | Tela **Garantias** conta por payload (`lerGarantiaV3`), enquanto `os-derive.isGarantiaAtiva` conta `garantiasOperacionais` (DB) → **duas fontes** de "garantia ativa" que podem divergir no Dashboard. | `pos-venda-model` vs `os-derive.ts:65-76`. |
| B5 | **P2** | "Recebido hoje/Saldo em aberto" ficam **"a conectar"** mesmo com recebimentos reais já existindo no caixa/CR → Dashboard subinforma o financeiro real. | `DashboardV3.tsx:112-113`. |
| B6 | **P3** | Bancada "Fila de produção" sugere filtro por coluna, mas só navega para a Fila (Kanban geral). | `BancadaV3.tsx:146-155`. |
| B7 | **P3** | `reload()` global após cada ação re-busca **500 OS** (`take: 500`) — custo aceitável p/ SMB, mas sem paginação para lojas grandes. | `app/actions/ordens.ts:116`. |

*Não há bug que cause perda de dado ou crash — são inconsistências de fluxo/relatório.*

---

## 11. Relatório UX

| Achado UX | Severidade | Detalhe |
|---|---|---|
| **Dois pontos de entrega** confundem | Média | "Registrar entrega" (rico) vs "Marcar entregue" (status). O usuário não sabe qual conclui de verdade. Unificar. |
| **Atendimento rápido** redundante | Baixa | É um form que não grava e só manda abrir a Nova OS — dois caminhos de check-in. Considerar remover ou ligar de verdade. |
| **Caixa fora do módulo** | Média | PDV de Serviço exige caixa aberto, mas não há como abrir caixa pela V3 → o operador precisa ir ao PDV de vendas. Falta atalho/abertura no próprio módulo. |
| **20 abas, 7 placeholders** | Média | A sidebar mostra 19 itens; ~⅓ são "Em construção". Bom para roadmap, ruim para foco do operador. Considerar **ocultar/colapsar** placeholders num grupo "Em breve". |
| Nomenclatura status V2×V3 | Baixa | "pronta"=label "Pronto", "aprovado"=label "Aprovada" — coerente, mas o enum Prisma colapsa `recebida`→`pronta` (projeção). Documentado, sem impacto ao usuário. |
| "Fila de produção" não filtra | Baixa | Expectativa visual de drill-down não cumprida (B6). |
| Bancada/Dashboard duplicam métricas | Baixa | "Em execução/Prontas/Atrasadas" aparecem em Dashboard **e** Bancada — ok, mas observar consistência. |
| Honestidade | **Positivo** | Toasts "disponível na próxima fase", pílulas "a conectar", badges "Em construção" — UX de transparência exemplar. |

---

## 12. Comparação operacional (concorrentes)

> Vertical assistência técnica. ✅ tem · 🟡 parcial · ❌ não tem. Avaliação contextual.

| Capacidade | Gestão Click | Smart System | ServicAA | Assistec | **Omni V3** |
|---|:--:|:--:|:--:|:--:|:--:|
| Abertura de OS rica (cliente/equip/senha/checklist) | ✅ | ✅ | 🟡 | ✅ | ✅ **forte** |
| Orçamento com brinde/interno/lucro + versões | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** |
| Kanban + máquina de status única | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** |
| Bancada por técnico + SLA + prioridade | 🟡 | ✅ | 🟡 | ✅ | ✅ |
| Recebimento no balcão (CR + caixa + split + estorno) | ✅ | ✅ | 🟡 | ✅ | ✅ |
| Impressão pro (OS/garantia/via interna/etiqueta) | ✅ | ✅ | 🟡 | ✅ | ✅ |
| Pós-venda (entrega formal + garantia + retorno + taxa) | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** |
| Timeline auditável imutável | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** |
| **Baixa de estoque por peça da OS** | ✅ | ✅ | ✅ | ✅ | ❌ **impede uso real** |
| **Aviso automático ao cliente (WhatsApp/status)** | ✅ | ✅ | 🟡 | ✅ | ❌ **impede empate** |
| **Portal/consulta pública da OS** | ✅ | ✅ | 🟡 | ✅ | ❌ |
| Catálogo de serviços/peças gerenciável | ✅ | ✅ | ✅ | ✅ | ❌ |
| Relatórios/BI | ✅ | ✅ | 🟡 | ✅ | ❌ (placeholder) |
| Upload de fotos antes/depois | 🟡 | 🟡 | 🟡 | 🟡 | ❌ |
| NFS-e / fiscal | 🟡 | 🟡 | 🟡 | 🟡 | ❌ |

**O que já SUPERA os concorrentes:** orçamento (brinde/interno/lucro/versões), **máquina de status única**,
**pós-venda first-class** (entrega+garantia+retorno+taxa de retorno), **timeline auditável** e a **honestidade
de estado** (real vs a-conectar). Para o nicho SMB, o **núcleo da V3 já é superior**.

**O que falta para EMPATAR:** **baixa de estoque**, **aviso automático ao cliente**, **catálogo gerenciável**
e **relatórios**. São o "feijão com arroz" que todo concorrente entrega.

**O que IMPEDE uso real hoje:** (1) **estoque não baixa**, (2) **cliente nunca é avisado**, (3) **entrega
inconsistente** (garantia não inicia). Resolvidos esses três, a V3 vira **produto vendável**.

---

## 13. Lacunas consolidadas

- 🔴 **Estoque:** sem reserva/baixa/restauração de peças.
- 🔴 **Comunicação:** eventos sem assinante; sem WhatsApp; Portal/Notificações placeholder.
- 🟠 **Entrega:** dois caminhos divergentes; garantia depende do caminho rico.
- 🟠 **Financeiro:** CR só nasce no recebimento (OS aprovada-não-paga invisível no aging); Dashboard "a conectar".
- 🟡 **Catálogos:** serviços e peças não gerenciáveis; técnicos sem entidade.
- 🟡 **Garantia:** payload-derivada, não cria `GarantiaOperacional` (DB); sem job de vencimento.
- 🟡 **Anexos:** sem upload de imagem.
- 🟢 **Relatórios, Configurações, Rastreio, Calendário, Atendimento rápido:** placeholders.
- 🟢 **Caixa:** abertura só pelo PDV principal (cross-módulo).

---

## 14. Prioridades

### 🔴 P0 — impedem operação correta (resolver antes de qualquer piloto)
1. **Baixa de estoque na V3** (consumo na execução/entrega + restauração no cancelamento). Reusar o adapter OS→Estoque do V2.
2. **Ligar a espinha de eventos** (3C.1): um assinante que faça o bridge para notificação real ao cliente (status "pronta"/"entregue"/orçamento) — com opt-out. Tira a V3 do silêncio.
3. **Unificar a entrega** (corrigir B1): todo caminho para "entregue" deve gravar `entregaV3` e iniciar garantia (ou bloquear o atalho de status e forçar o fluxo de Pós-venda).

### 🟠 P1 — empate competitivo
4. **Materializar Conta a Receber na aprovação** (ou expor "previsto a receber" no Financeiro) — corrige o aging.
5. **Dedup de `os_entregue`** (B2) + emissor de `os_garantia_expirada` (job).
6. **Catálogo de serviços** gerenciável (CRUD real) — destrava "Novo serviço".
7. **Dashboard "Recebido hoje/Saldo em aberto"** ligado ao Financeiro real (B5).

### 🟡 P2 — robustez e paridade
8. **Cadastro de técnico** (entidade) + comissão/tempo médio.
9. **Garantia operacional no DB** (alinhar V3 com `GarantiaOperacional` + job de vencimento) — resolve B3/B4.
10. **Upload real de anexos** (fotos antes/depois).
11. **Reserva/pedido de peças** (tela Peças real).

### 🟢 P3 — evolutivos
12. Relatórios/BI · Configurações persistentes · Rastreio físico · Calendário · Filtro da Fila de produção (B6) · paginação (B7) · NFS-e.

---

## 15. Plano recomendado da próxima fase

**Fase 3D — "Fechar o ciclo físico e a voz" (tornar a V3 operável de verdade):**

| Bloco | Entrega | Esforço |
|---|---|---|
| **3D.1 — Estoque na V3** | Consumo/restauração de peças (adapter OS→Estoque do V2), idempotente por OS. | L |
| **3D.2 — Entrega unificada** | Todo "entregue" passa pelo registro de entrega (quem retirou + início de garantia). Fecha B1/B2. | M |
| **3D.3 — Notificação real (3C.1)** | 1 assinante do publisher → WhatsApp por evento (pronta/entregue/orçamento) **com opt-out**. ⚠️ toca `lib/whatsapp` (área protegida) → autorização + ADR. | L |
| **3D.4 — Financeiro coerente** | CR na aprovação (ou "previsto a receber") + Dashboard recebido/saldo reais. | M |

> Ordem sugerida: **3D.1 → 3D.2** (corrigem os bloqueios P0 sem área protegida) e, em paralelo,
> **preparar o ADR** de 3D.3 (notificação real) antes de tocar WhatsApp.

---

## 16. Respostas finais

**✅ O que está pronto para produção (núcleo real):**
Abertura de OS, orçamento (com brinde/interno/lucro/versões), máquina de status única (Kanban/Command Bar),
bancada por técnico + SLA + prioridade, **recebimento real** (Conta a Receber + caixa + split + estorno),
impressão profissional (OS/garantia/via interna/etiqueta/termo), pós-venda (entrega formal + garantia +
retorno + taxa de retorno), histórico por cliente, e a **espinha de eventos** (produtor). Persistência e
multi-loja sólidas. **Ressalva:** só é "produção" se estoque e comunicação forem resolvidos — senão é
piloto controlado.

**🟡 O que ainda é protótipo (real parcial):**
Serviços (leitura sem CRUD), Técnicos (métricas sem entidade/comissão), Garantia (payload sem `GarantiaOperacional`),
eventos 3C.0 (produtor sem consumidor).

**⚪ O que é apenas visual (placeholder honesto):**
Portal do cliente, Notificações, Peças & Pedidos, Rastreio físico, Relatórios, Configurações, Atendimento
rápido, tab Calendário, botões "Adicionar foto"/"Enviar mensagem"/"Portal"/"Mais ações"/"Novo serviço".

**🎯 Próxima sprint recomendada:**
**SPRINT_3D.1 — Estoque na Operações V3** (consumo/restauração de peças via adapter OS→Estoque, idempotente
por OS, sem tocar área protegida). É o **maior bloqueio isolado**, não depende de decisão de risco
(WhatsApp/schema), e destrava o uso real imediato. Em paralelo, **3D.2 (entrega unificada)** elimina a
inconsistência de garantia. A notificação real (3D.3) entra em seguida, **com ADR**, por tocar `lib/whatsapp`.

---

*Auditoria read-only. Nenhum código, schema, migração ou commit alterado. As prioridades são recomendação
técnica — a abertura de cada bloco (em especial 3D.3, que toca WhatsApp/área protegida) exige decisão humana
e, quando aplicável, ADR.*
