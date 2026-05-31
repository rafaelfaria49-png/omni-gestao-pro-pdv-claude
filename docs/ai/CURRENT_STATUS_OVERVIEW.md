---
title: CURRENT_STATUS · Overview enxuto
status: vivo
owner: produto + Sonnet (atualiza a cada sprint encerrada)
last_update: 2026-05-30
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
| 1 | **Financeiro** | 🟢 backend + UI real | financeiro-v2 plugado a dados reais (FinanceiroRealProvider) ✅; services, adapters, idempotência, importador parcelado, crédito persistente | 🟡 DRE/Fluxo: evolução visual/funcional (não é mock) |
| 1 | **Estoque** | 🟢 ledger maduro | Ledger profissional ✅, importador defensivo ✅, saneamento SKU ✅ | 🟠 sem multi-depósito (bloqueia Marketplace) |
| 2 | **Operações/OS** (cross-onda) | (acima) | NFS-e, comunicação WhatsApp | 🔴 sem NFS-e |
| 2 | **CRM** | 🟡 base sólida | FK Venda→Cliente ✅, modal PF/PJ ✅, crédito persistente ✅, importador defensivo ✅ | 🟡 sem tela 360° consolidada, sem segmentação |
| 2 | **WhatsApp** | 🟡 infra ok | Webhook canônico ✅, HMAC ✅, roteamento `storeId` ✅, envio manual ✅ | 🔴 sem opt-out persistente, sem orquestrador de massa |
| 3 | **Marketplace** | 🔴 não iniciado | Greenfield total | 🔴 sem arquitetura, sem código |
| 3 | **Marketing IA** | 🟠 incipiente | Gerador de imagens ✅, credit-costs ✅, debit-turn-credits ✅ | 🔴 sem orquestrador de campanha, sem atribuição |
| 4 | **Omni Agent** | 🟠 infra ok / poucos executores | API-guard, honesty, regex determinística, executor `recebimentoFinanceiro` ✅ | 🔴 pool de executores reais pequeno |
| 4 | **BI** | 🟠 espalhado | Painel inicial parcial | 🔴 mocks misturados com real |
| 4 | **Multi-loja** | 🟢 isolamento server / 🟡 resíduos | fallback `loja-1` **server-side 100% eliminado** (S-001/S-002 + DT-14, ADR-0003) ✅, ACL `canAccessStore` ✅, proxy cookie ✅, `storeId` everywhere ✅ | 🟡 F-04 webhook WhatsApp single-store + resíduo `loja-1` client-side |

---

## 2. Frentes ativas (sprints em curso)

> Atualizar quando abrir/fechar sprint.

| Sprint | HUB | Status | Owner IA | Data início |
|---|---|---|---|---|
| R0 — Reconciliação governança | cross | em curso (L0 ✅; baseline `AUDITORIA_R0_RECONCILIACAO_GOVERNANCA.md`) | Opus + Rafael | 2026-05-30 |

---

## 3. Próximas sprints sugeridas (top 5 prioridade)

> Em ordem recomendada — quem encerra a atual, abre a próxima.

1. **SPRINT_NN_PDV** — Persistência server-side do PDV Next (P0; fecha Fase 1 PDV).
2. **SPRINT_NN_MULTI_LOJA** — F-04: router WhatsApp por `phone_number_id` (P1→P0 antes de loja-2 ativar WhatsApp). *Fallback `loja-1` server-side já eliminado (S-001/S-002 + DT-14).*
3. **SPRINT_NN_WHATSAPP** — Opt-out persistente + monitor qualidade (P0; previne banimento Meta).
4. **SPRINT_NN_ESTOQUE** — Modelagem multi-depósito (P0; desbloqueia Marketplace).

> financeiro-v2 saiu do top-5: deixou de ser mock (DT-02 paga, R0-L5). Evolução de UI DRE/Fluxo segue no `ROADMAP_FINANCEIRO`.

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
| 2 | Webhook WhatsApp single-store (`phone_number_id`) — DT-07 | Multi-loja/WhatsApp | P1 (→P0 c/ loja-2) |
| 3 | Opt-out WhatsApp ausente | WhatsApp | P0 |
| 4 | Sem multi-depósito Estoque | Estoque | P0 (bloqueia Marketplace) |
| 5 | Rota legada `/dashboard/os` paralela | OS | P1 |
| 6 | Pool de executores Omni Agent pequeno | Omni Agent | P1 |

> Detalhe e tracking vivo em `docs/status/DIVIDA_TECNICA.md`. (DT-03 + DT-14: `loja-1` server-side **100% pago** — ver §3 de lá.)

---

## 6. Última atualização significativa

> Apêndice — listar entradas mais recentes do `CURRENT_STATUS.md` para contexto rápido.

- **2026-05-30** — DT-14 (SAFE-lite reforçado): fallback nullish `?? "loja-1"` em `carteiras/*` + `dre` eliminado (forma que escapou da S-001 por ser `??` e multi-linha) — `loja-1` **server-side 100%** fechado; ADR-0003.
- **2026-05-30** — R0-L5: financeiro-v2 confirmado sobre dados reais (DT-02 paga · MOCK-01 removido · BL-13 destravado); DRE/Fluxo = evolução de UI pendente.
- **2026-05-30** — R0: reconciliação da governança iniciada (baseline `AUDITORIA_R0`; lote L0 ✅).
- **2026-05-30** — SPRINT_MULTI_LOJA-S-002: F-03 (proxy cookie) + F-02-anchor (exportar) — fallback `loja-1` **server-side** 100% eliminado.
- **2026-05-30** — Fase 1 Proteção de Lojas (anti-exclusão acidental).
- **2026-05-29** — SPRINT_MULTI_LOJA-S-001: fallback silencioso `loja-1` em leituras de API eliminado + ACL `canAccessStore` (ADR-0003).
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
- **Status vivos:** `docs/status/{DIVIDA_TECNICA,MOCKS_TRACKING,RISCOS,BLOCKERS}.md`
