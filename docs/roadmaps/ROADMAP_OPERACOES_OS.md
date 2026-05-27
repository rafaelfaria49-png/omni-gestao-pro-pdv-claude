---
title: Roadmap — HUB Operações / Ordens de Serviço
hub: operacoes_os
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (próxima a planejar)
---

# 🔧 Roadmap — HUB Operações / OS

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Decisão arquitetural de base: [`ADR-0001 (legado) — OS_ROUTE_OFICIAL`](../decisions/OS_ROUTE_OFICIAL.md).
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **A central operacional do prestador de serviço: da abertura da OS ao faturamento, com estoque e financeiro reconciliando automaticamente — sem digitação dupla.**

OS é o **eixo do prestador** (assistência técnica, oficina, serviço técnico, instalações). Tudo o que entra como demanda passa por OS: orçamento → execução → faturamento → recebimento. Deve ser o HUB com melhor rastreabilidade do ERP (timeline imutável, auditoria por usuário, vínculo bidirecional com Estoque e Financeiro).

---

## 2. Objetivos

1. **Rastreabilidade total** — cada OS tem timeline imutável (quem mudou status, quando, por que).
2. **Reconciliação automática** — OS faturada gera receivable; peças usadas baixam estoque; cancelamento restitui — tudo via adapter, sem código duplicado.
3. **Fluxo único na rota oficial** `/dashboard/operacoes-v2` — eliminar duplicidade com `/dashboard/os` legado.
4. **Política de orçamento clara** — orçamento aprovado vira execução em 1 clique, com regras configuráveis.
5. **WhatsApp nativo** — cliente recebe atualizações de status (pronto, retirar, atrasada) sem ação manual.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **OmniSys / TecnoSpeed Assistec** | Timeline rica de OS, integração fiscal — referência para auditoria via `payload.historico[]`. |
| **Servicaa** | Fluxo orçamento → aprovação → execução muito fluido — inspiração para política de orçamento (`budget-policy-service`). |
| **Bling** | Boa cobertura fiscal de NFS-e — referência para Fase 2 fiscal de serviços. |
| **TinyERP** | UX de cards Kanban por status — adotado nos cards Lovable. |
| **MaxiManager (vertical assistência)** | Catálogo de defeitos por equipamento — ideia para Fase 4 (CRM de equipamentos). |

---

## 4. Diferenciais

- **Adapter pattern desacoplado**: `os-estoque.ts` (consumir/restituir/delta) e `os-contas-receber.ts` (materializar receivable) — código de OS não conhece detalhes de estoque ou financeiro.
- **`payload` JSONB rico** — fonte da verdade do estado da OS; status Prisma é "view colapsada". Permite evoluir campos sem migração.
- **Idempotência via `localKey`** (`os-faturamento:{storeId}:{osId}`) — refaturar mesma OS não duplica receivable.
- **Lovable hub isolado** com MemoryRouter — UI premium sem conflito com Next.js routing.
- **Hydration service** propaga cliente real via FK quando payload tem `"—"` (Fix 13 do CURRENT_STATUS).
- **Auditoria por usuário** no ledger de estoque gerado pela OS (Fase 2 do adapter OS→Estoque concluída em 21/05/2026).
- **ADR formal** já cobrindo a rota oficial (`ADR-0001 (legado)`).

---

## 5. Gaps atuais

> Cruzar com [`CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) e [`ADR-0001 (legado)`](../decisions/OS_ROUTE_OFICIAL.md).

| Gap | Severidade | Origem |
|---|---|---|
| **Rota legada `/dashboard/os` ainda em paralelo** à oficial `/dashboard/operacoes-v2` | 🟡 P1 | CURRENT_STATUS linha 1778 |
| **Sem emissão de NFS-e** real (nota de serviço) | 🔴 P0 | gap de produto |
| **Política de orçamento incompleta** — `budget-policy-service` existe mas regras configuráveis por loja ainda hardcoded | 🟡 P1 | inspeção `lib/operacoes/services/` |
| **Sem notificação WhatsApp automática** ao mudar status de OS | 🟡 P1 | gap de produto |
| **Timeline UI** existe mas sem filtro por usuário/tipo de evento | 🟢 P2 | melhoria de UX |
| **Catálogo de defeitos por equipamento** inexistente | 🟢 P2 | feature futura |
| **Sem SLA por tipo de OS** (prazo, alerta de atraso) | 🟡 P1 | gap de produto |
| **Re-impressão de OS / ordem de serviço PDF** ainda manual | 🟢 P2 | gap de UX |
| **Vínculo OS ↔ Garantia** (peças e serviços com prazo de garantia) ausente | 🟡 P1 | gap de produto |
| **Auditoria de cancelamento** registra mas não exige motivo estruturado | 🟢 P2 | gap de processo |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **NFS-e** com 1 clique no faturamento | P0 |
| 2 | **Decommission da rota legada** `/dashboard/os` | P1 |
| 3 | **WhatsApp automático** por mudança de status (templates Meta) | P1 |
| 4 | **Política de orçamento configurável** por loja (validade, aprovação, multas) | P1 |
| 5 | **SLA por tipo de OS** + alerta visual de atraso | P1 |
| 6 | **Garantia** vinculada a OS, peça e serviço | P1 |
| 7 | **Catálogo de defeitos por equipamento** | P2 |
| 8 | **Re-impressão PDF** estilizada da OS (orçamento + execução) | P2 |
| 9 | **Filtros avançados na timeline** (usuário, tipo de evento, intervalo) | P2 |
| 10 | **Importação de OS em lote** (migração de outro ERP) | P2 |
| 11 | **App técnico mobile** (executar OS no celular, fotos antes/depois) | P3 |
| 12 | **Omni Agent executor**: "abrir OS para João, equipamento iPhone 13, defeito tela" | P3 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Auditar e decommissionar `/dashboard/os` legado | M | Plano de migração de URL antigas |
| Spike NFS-e (escolher provedor + POC) | L | Decisão de provedor (mesma do PDV?) |
| Templates Meta para WhatsApp de status | S | Aprovação Meta + WhatsApp HUB pronto |
| Adicionar `lojaConfig.budgetPolicy` no schema | M | Decisão de campos configuráveis |
| Implementar SLA + alerta no card Lovable | M | Definir campos `slaInicio`, `slaPrazo` |
| Modelar `Garantia` (peça/serviço, prazo, vínculo OS) | L | Decisão de modelo (FK ou JSONB?) |
| Tela "motivos de cancelamento" estruturados | S | Lista de motivos por loja |
| Migrar `budget-policy-service` para regras tabeladas | M | Bloco anterior aprovado |
| PDF de OS estilizado (template imprimível) | M | Decisão de biblioteca PDF |

---

## 8. Fases

### Fase 1 — Consolidação operacional (~85% feita)
**Objetivo:** rota oficial estabilizada + adapters reconciliando 100% + hydration real.
**Critério de saída:**
- Rota legada `/dashboard/os` decommissionada ou marcada como redirect.
- Adapter OS→Estoque com auditoria completa ✅ (Fase 2 21/05/2026).
- Adapter OS→Contas Receber idempotente ✅.
- Hydration propaga cliente real ✅ (Fix 13).
- Timeline imutável funcional ✅.

### Fase 2 — Fiscal de serviço (NFS-e)
**Objetivo:** emitir NFS-e em 1 clique a partir da OS faturada.
**Critério de saída:**
- Provedor escolhido (ADR — preferencialmente o mesmo do PDV).
- 1 loja-piloto emitindo NFS-e real.
- Cancelamento fiscal coberto.

### Fase 3 — Comunicação automática
**Objetivo:** cliente recebe atualizações sem ação manual do operador.
**Critério de saída:**
- Templates Meta aprovados para 4 status (orçamento pronto, aprovado, pronto para retirar, atrasada).
- Envio automático ao mudar status (event bus).
- Opt-out por cliente respeitado.

### Fase 4 — SLA + Garantia + Equipamentos
**Objetivo:** vertical assistência técnica completa.
**Critério de saída:**
- SLA configurável por tipo de OS.
- Garantia rastreada (peça, serviço, OS).
- Catálogo de defeitos por equipamento.

### Fase 5 — Mobile técnico + Omni Agent
**Objetivo:** técnico executa OS no celular; Omni Agent abre OS por comando.
**Critério de saída:**
- App PWA do técnico (fotos, status, observações).
- Omni Agent com executor `abrirOS` funcional.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Estoque** | Consumo/restituição de peças via adapter (serial — ver matriz §4 do INDEX) |
| **Financeiro** | Materialização de `ContaReceberTitulo` no faturamento (adapter compartilhado) |
| **CRM** | Cliente da OS (FK), histórico de gastos, crédito de cliente |
| **WhatsApp** | Notificação de status (Fase 3) |
| **Marketing IA** | Pesquisa pós-atendimento, indicação (futuro) |
| **Omni Agent** | Executor `abrirOS` (Fase 5) |
| **Multi-loja** | Toda OS escopada por `storeId` (já cumprido) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Manter as 2 rotas** (`/dashboard/os` + `/dashboard/operacoes-v2`) gera divergência de dados | Técnico — P1 | Sprint dedicada a decommission + redirect 301 |
| **Provedor fiscal diferente** do PDV multiplica complexidade | Negócio — P1 | Decidir 1 provedor que cubra NFC-e + NFS-e (ADR) |
| **Templates WhatsApp** demoram aprovação Meta | Operacional — P2 | Submeter templates em paralelo à implementação |
| **Mudar contrato de adapter OS→Estoque** quebra OS antiga em produção | Técnico — P0 | Versionar contrato; migração com janela de baixa |
| **Garantia mal modelada** vira tribal knowledge difícil de evoluir | Técnico — P1 | ADR formal antes de implementar |
| **MemoryRouter Lovable** pode conflitar com deep links de OS | Técnico — P2 | Mapear URLs externas → query params na entrada do hub |

---

## 11. Sprint atual

**Nenhuma.** Última iniciativa relevante: Adapter OS → Estoque Fase 2 (concluído 21/05/2026 — auditoria de usuário + valores propagados).

Próxima sprint sugerida (a planejar):
- **SPRINT_NN_OPERACOES_OS — Decommission da rota legada `/dashboard/os`** (item P1 do backlog).

---

## 12. Status atual

> Resumo consolidado em 1 parágrafo.

Operações/OS é hoje o HUB **mais maduro** do ERP em backend: adapters OS→Estoque (Fase 2 com auditoria de usuário) e OS→Contas Receber estão estáveis e idempotentes, hydration service propaga corretamente cliente via FK, timeline imutável via `payload.historico[]` é fonte da verdade, e a rota oficial `/dashboard/operacoes-v2` (Lovable + MemoryRouter) opera com seus providers próprios. Pendências principais: **decommission da rota legada** `/dashboard/os` (ainda em paralelo), **emissão fiscal NFS-e** (nada implementado), e **comunicação automática via WhatsApp** (gap de produto). O ADR-0001 legado cobre a decisão sobre rota oficial. Próximo passo natural é fechar Fase 1 com o decommission e iniciar discussão de provedor fiscal compartilhado com PDV.

---

## 13. Métricas de sucesso

| Métrica | Meta | Como medir |
|---|---|---|
| OSs criadas na rota oficial vs legado | **100% oficial** (após Fase 1) | Telemetria de rota |
| Divergência adapter OS↔Estoque (peça baixada sem registro) | **0/mês** | Cruzar `MovimentacaoEstoque(origem:os)` vs `payload.pecas` |
| Divergência adapter OS↔Receber (OS faturada sem receivable) | **0/mês** | Cruzar `os.status:faturada` vs `ContaReceber.localKey` |
| OSs com timeline vazia | **0/mês** | Query `payload.historico = []` |
| Tempo médio de mudança de status (UX) | **< 500 ms** | Telemetria UI |
| NFS-e emitidas com sucesso (pós-Fase 2) | **> 99%** | Webhook do provedor |
| Taxa de envio WhatsApp de status (pós-Fase 3) | **> 95%** | Webhook Meta |

---

## 14. Blockers

| Blocker | Bloqueia | Owner |
|---|---|---|
| **Decisão de provedor fiscal** (preferencialmente compartilhado com PDV) | Fase 2 | Humano (produto) |
| **Aprovação Meta de templates** WhatsApp | Fase 3 | Humano (operação) |
| **Decisão de modelo de Garantia** (FK vs JSONB) | Fase 4 | ADR pendente |

Status vivo em `docs/status/BLOCKERS.md` (Bloco 23 a criar).

---

## 15. Referências

- **ADRs relacionados:**
  - [`ADR-0001 (legado)` — OS_ROUTE_OFICIAL](../decisions/OS_ROUTE_OFICIAL.md)
  - ADR de provedor fiscal (a criar — compartilhado com PDV)
- **Auditorias relacionadas:** — (nenhuma dedicada; recomendado executar uma após Fase 1)
- **Sprints relacionadas:** entradas "Operações", "OS" e "adapter OS" em [`CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) (linhas 893, 1284, 1684, 1698–1795).
- **Docs de módulo:** [`docs/modules/OPERACOES.md`](../modules/OPERACOES.md) (citado no CLAUDE.md).
- **Backend reference:** [`docs/architecture/BACKEND.md`](../architecture/BACKEND.md) (services breakdown).
- **Blueprint:** `docs/blueprint/MASTER_PLAN.md` (Bloco 24, a criar).
- **Memórias persistentes (MEMORY.md):**
  - `project_cadastros_ux_e_venda_cliente` (FK `Venda.clienteId` relacionada)
  - `project_credito_cliente_persistente`
- **Governança:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md) — `lib/operacoes/*` é área protegida; mudança no core dos services exige autorização explícita.
