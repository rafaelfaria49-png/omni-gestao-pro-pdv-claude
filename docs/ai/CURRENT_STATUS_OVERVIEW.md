---
title: CURRENT_STATUS · Overview enxuto
status: vivo
owner: produto + Sonnet (atualiza a cada sprint encerrada)
last_update: 2026-05-27
fonte_detalhada: docs/ai/CURRENT_STATUS.md
---

# 📊 CURRENT_STATUS — Overview enxuto

> **Entrada rápida (< 2 min)** para qualquer IA/humano saber em que pé está cada HUB.
> **Conteúdo completo, histórico de sprints e contexto:** [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) (1800+ linhas).
> **Roadmaps por HUB:** [`docs/roadmaps/INDEX.md`](../roadmaps/INDEX.md).

> Atualizar este arquivo **a cada sprint encerrada**. Mantenha enxuto — detalhes vão para `CURRENT_STATUS.md` (apêndice histórico) ou para o roadmap do HUB.

---

## 1. Mapa de maturidade por HUB

> Escala: 🟢 maduro · 🟡 em evolução · 🟠 incipiente · 🔴 não iniciado / risco crítico

| Onda | HUB | Maturidade | Frente principal | Bloqueio crítico |
|---|---|---|---|---|
| 1 | **PDV** | 🟢 maduro | Fase 1 ~70%: 4 PDVs convergentes, multi-terminais com lock, INSERT, F7, À Prazo, fechamento premium | 🔴 PDV Next não persiste vendas (server-side) |
| 1 | **Operações/OS** | 🟢 maduro | Adapters Fase 2 ✅, hydration FK ✅, ADR-0001 oficial | 🟡 rota legada `/dashboard/os` ainda em paralelo |
| 1 | **Financeiro** | 🟢 backend maduro / 🟠 UI | Backend sólido (services, adapters, idempotência, importador parcelado, crédito persistente) | 🔴 `/dashboard/financeiro-v2` ainda mock |
| 1 | **Estoque** | 🟢 ledger maduro | Ledger profissional ✅, importador defensivo ✅, saneamento SKU ✅ | 🟠 sem multi-depósito (bloqueia Marketplace) |
| 2 | **Operações/OS** (cross-onda) | (acima) | NFS-e, comunicação WhatsApp | 🔴 sem NFS-e |
| 2 | **CRM** | 🟡 base sólida | FK Venda→Cliente ✅, modal PF/PJ ✅, crédito persistente ✅, importador defensivo ✅ | 🟡 sem tela 360° consolidada, sem segmentação |
| 2 | **WhatsApp** | 🟡 infra ok | Webhook canônico ✅, HMAC ✅, roteamento `storeId` ✅, envio manual ✅ | 🔴 sem opt-out persistente, sem orquestrador de massa |
| 3 | **Marketplace** | 🔴 não iniciado | Greenfield total | 🔴 sem arquitetura, sem código |
| 3 | **Marketing IA** | 🟠 incipiente | Gerador de imagens ✅, credit-costs ✅, debit-turn-credits ✅ | 🔴 sem orquestrador de campanha, sem atribuição |
| 4 | **Omni Agent** | 🟠 infra ok / poucos executores | API-guard, honesty, regex determinística, executor `recebimentoFinanceiro` ✅ | 🔴 pool de executores reais pequeno |
| 4 | **BI** | 🟠 espalhado | Painel inicial parcial | 🔴 mocks misturados com real |
| 4 | **Multi-loja** | 🟡 convenção ok | `storeId` everywhere ✅, `PdvTerminal` por loja ✅, defesa 3 camadas ✅ | 🔴 fallback `loja-1` silencioso ainda existe |

---

## 2. Frentes ativas (sprints em curso)

> Atualizar quando abrir/fechar sprint.

| Sprint | HUB | Status | Owner IA | Data início |
|---|---|---|---|---|
| — | — | nenhuma sprint formal em curso (último marco: Lote 5 PDV em 2026-05-26) | — | — |

---

## 3. Próximas sprints sugeridas (top 5 prioridade)

> Em ordem recomendada — quem encerra a atual, abre a próxima.

1. **SPRINT_NN_PDV** — Persistência server-side do PDV Next (P0; fecha Fase 1 PDV).
2. **SPRINT_NN_FINANCEIRO** — Substituir mocks do `/dashboard/financeiro-v2` por dados reais (P1; fecha Fase 1 Financeiro).
3. **SPRINT_NN_MULTI_LOJA** — Eliminar fallback `loja-1` + lint customizado de `storeId` (P0; previne incidente legal).
4. **SPRINT_NN_WHATSAPP** — Opt-out persistente + monitor qualidade (P0; previne banimento Meta).
5. **SPRINT_NN_ESTOQUE** — Modelagem multi-depósito (P0; desbloqueia Marketplace).

---

## 4. Áreas protegidas (lembrete)

> Qualquer mudança nestes paths **exige autorização explícita do humano**. Ver [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).

- `auth.ts`, `auth.config.ts`, `proxy.ts`
- `prisma/schema.prisma`
- `lib/pdv*` core
- `lib/financeiro/*` services
- `lib/operacoes/*` services
- `lib/whatsapp/*` core
- `lib/omni-agent/*` executores

---

## 5. Dívidas técnicas críticas

| # | Item | HUB | Severidade |
|---|---|---|---|
| 1 | PDV Next sem persistência server-side | PDV | P0 |
| 2 | financeiro-v2 mock | Financeiro | P1 |
| 3 | `loja-1` fallback silencioso | Multi-loja | P0 |
| 4 | Opt-out WhatsApp ausente | WhatsApp | P0 |
| 5 | Sem multi-depósito Estoque | Estoque | P0 (bloqueia Marketplace) |
| 6 | Rota legada `/dashboard/os` paralela | OS | P1 |
| 7 | Pool de executores Omni Agent pequeno | Omni Agent | P1 |

> Detalhe e tracking vivo em `docs/status/DIVIDA_TECNICA.md` (Bloco 23 — a criar).

---

## 6. Última atualização significativa

> Apêndice — listar entradas mais recentes do `CURRENT_STATUS.md` para contexto rápido.

- **2026-05-26** — Lote 5: remoção do else branch JSX morto no PDV Clássico.
- **2026-05-26** — Lote 3: F9 recebimento de contas convergente nos 3 PDVs.
- **2026-05-26** — Convergência operacional PDV: INSERT + Pagamento Múltiplo nos 3 PDVs.
- **2026-05-25** — Sprint À Prazo Enterprise (parcelamento no PDV).
- **2026-05-24** — Convergência PDV P1 e P0 (Black Edition no core).
- **2026-05-23** — PDV Multi-Terminais Fase 2 (lock + heartbeat).
- **2026-05-23** — PDV Item Avulso via INSERT.
- **2026-05-21** — Adapter OS → Estoque Fase 2 (auditoria de usuário).

> Histórico completo: [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) §sprints.

---

## 7. Como atualizar este arquivo

1. Ao encerrar uma sprint, atualize:
   - §1 (maturidade do HUB, se mudou).
   - §2 (remover sprint encerrada).
   - §3 (recomendar próxima).
   - §5 (atualizar dívida resolvida).
   - §6 (entrada nova no apêndice).
2. **Não duplicar** detalhe do `CURRENT_STATUS.md` — aqui é overview.
3. **Manter < 200 linhas** — se crescer, dividir.
4. `last_update` no front matter obrigatório.

---

## 8. Referências cruzadas

- **Histórico completo:** [`CURRENT_STATUS.md`](./CURRENT_STATUS.md)
- **Roadmaps:** [`docs/roadmaps/INDEX.md`](../roadmaps/INDEX.md) → 11 HUBs com fases, gaps, métricas
- **Governança:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md) → regras inegociáveis
- **Sprints:** [`docs/sprints/TEMPLATE_SPRINT.md`](../sprints/TEMPLATE_SPRINT.md) → como rodar sprint
- **Auditorias:** [`docs/audits/TEMPLATE_AUDITORIA.md`](../audits/TEMPLATE_AUDITORIA.md) → como auditar
- **ADRs:** [`docs/decisions/INDEX.md`](../decisions/INDEX.md) → decisões arquiteturais
- **Status vivos (Bloco 23):** `docs/status/{DIVIDA_TECNICA,MOCKS_TRACKING,RISCOS,BLOCKERS}.md` (a criar)
