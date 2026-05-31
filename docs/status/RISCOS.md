---
title: Riscos do projeto — tracking vivo
status: vivo
owner: produto + Opus (estratégia)
last_update: 2026-05-30
---

# ⚠️ Riscos — Tracking vivo

> **Risco ≠ bug ≠ dívida ≠ blocker.**
> Risco é **algo que pode acontecer** com impacto relevante. Bug já aconteceu (vai para BLOCKERS), dívida foi assumida conscientemente, blocker está travando agora.

> **Atualização:** ao identificar risco novo, ao mudar probabilidade/impacto, ao materializar (vira incidente) ou mitigar.

---

## 1. Convenção

### 1.1 Probabilidade
- 🔵 **baixa** — < 10% em 6 meses
- 🟡 **média** — 10–40% em 6 meses
- 🟠 **alta** — > 40% em 6 meses

### 1.2 Impacto
- **baixo** — incômodo, sem perda relevante
- **médio** — perda operacional, recuperável em < 1 semana
- **alto** — perda financeira, legal, ou de cliente; recuperação > 1 semana
- **crítico** — projeto trava ou perda > 6 dígitos

### 1.3 Categorias
- **TEC** técnico · **NEG** negócio · **LEG** legal/compliance · **OPS** operacional · **SEG** segurança · **FIN** financeiro

### 1.4 Estados
- 🆕 identificado · 🛡️ mitigado parcial · ✅ mitigado · 💥 materializou (vira incidente)

---

## 2. Riscos ativos

| # | Risco | Categoria | Probabilidade | Impacto | Estado | HUB | Mitigação atual |
|---|---|---|---|---|---|---|---|
| R-01 | Conta Meta banida por marketing sem opt-out | NEG/LEG | 🟠 | crítico | 🛡️ parcial | WhatsApp | Sprint opt-out P0 planejada; sem orquestrador de massa ainda evita dispara em volume |
| R-02 | Vazamento de dados entre lojas (`storeId` errado) | LEG/SEG | 🔵 | crítico | 🛡️ parcial | Multi-loja | Vetor **server-side mitigado** (S-001/S-002, ADR-0003: guard 400 + ACL `canAccessStore`). Latente: F-04 webhook (DT-07) + resíduo client-side (DT-13) |
| R-03 | Venda perdida no PDV Next (sem persistência server) | FIN/NEG | 🟠 | alto | 🆕 | PDV | Conhecido (DT-01); sem mitigação até sprint |
| R-04 | Provedor fiscal único = single point of failure | TEC/NEG | 🟡 | alto | 🆕 | PDV/OS | Arquitetar adapter fiscal antes de escolher (ADR) |
| R-05 | Oversell em Marketplace por sync de saldo lento | FIN/NEG | 🟠 | alto | 🆕 | Marketplace | HUB não iniciado; risco fica latente |
| R-06 | Drift entre saldo de estoque e ledger | TEC | 🔵 | médio | ✅ | Estoque | Ledger profissional ✅; reconciliação noturna recomendada |
| R-07 | Token OAuth marketplace expira sem refresh | TEC | 🟡 | médio | 🆕 | Marketplace | Mitigação na Fase 1 do Marketplace |
| R-08 | Custo de IA descontrolado (loop LLM Omni Agent) | FIN | 🟡 | médio | 🛡️ parcial | Omni Agent | Credit-costs + api-guard; falta limite duro por loja |
| R-09 | Mock no painel inicial leva a decisão errada | NEG | 🟠 | médio | 🆕 | BI | MOCK-03; sem banner identificando |
| R-10 | Migração de schema multi-depósito quebra ledger histórico | TEC | 🟡 | alto | 🆕 | Estoque | Janela + rollback + backfill atômico (a planejar) |
| R-11 | Concorrente lança feature crítica antes (NFS-e+NFC-e integrada) | NEG | 🟠 | alto | 🆕 | OS/PDV | Acelerar Fase 2 fiscal com ADR único de provedor |
| R-12 | Lock multi-terminal não bloqueia em concorrência alta (TTL 120s) | TEC | 🟡 | médio | 🛡️ parcial | PDV | Fase 2 ✅; falta revalidação por transação |
| R-13 | Prompt injection via WhatsApp executa ação indevida | SEG | 🟡 | alto | 🆕 | Omni Agent | Sanitização + lista branca de comandos antes da expansão de executores |
| R-14 | Webhook fora do ar perde mensagens WhatsApp | TEC | 🔵 | médio | 🛡️ parcial | WhatsApp | Meta reenvia 7d; falta fila local + dead-letter |
| R-15 | LGPD: cliente solicita delete e quebra integridade NF | LEG | 🟡 | alto | 🆕 | CRM | Soft-delete + retenção legal de notas (a desenhar) |
| R-16 | Conciliação errada de repasses Marketplace = rombo financeiro | FIN | 🟡 | alto | 🆕 | Marketplace/Financeiro | Modo dry-run + revisão humana inicial |
| R-17 | Régua de cobrança WhatsApp disparando errado estraga relacionamento | NEG | 🟠 | médio | 🆕 | Financeiro/WhatsApp | Modo dry-run obrigatório antes de prod |

---

## 3. Riscos materializados (incidentes)

| # | Risco | Quando | Impacto real | Pós-mortem |
|---|---|---|---|---|
| (em branco — registrar quando ocorrer) | | | | |

---

## 4. Riscos mitigados (resolvidos)

| # | Risco | Mitigado em | Como |
|---|---|---|---|
| R-06 | Drift saldo×ledger (estoque) | 2026-05-21 | Adapter OS→Estoque Fase 2 com auditoria de usuário e valores propagados |

---

## 5. Top 5 riscos para atenção imediata (resumo executivo)

1. **R-01 — Banimento Meta** — está mitigado por *não usar massa*; vira P0 absoluto quando marketing IA atacar.
2. **R-02 — Vazamento multi-loja** — vetor server-side **fechado** (S-001/S-002); risco latente residual em F-04 (webhook) e resíduo client-side (DT-13). Não é mais bomba-relógio, mas não está zerado.
3. **R-03 — Venda perdida PDV Next** — conhecido, ainda sem mitigação.
4. **R-11 — Concorrente lança fiscal integrado primeiro** — pressão de tempo na Fase 2 fiscal.
5. **R-13 — Prompt injection no Omni Agent** — virá relevante quando executores crescerem; padronizar antes.

---

## 6. Como abrir / atualizar / fechar risco

- **Abrir:** identificou risco real → adicione `R-NN` em §2 com probabilidade/impacto/categoria/mitigação atual.
- **Atualizar:** mudou probabilidade ou mitigação → editar linha + `last_update`.
- **Materializar:** virou incidente → mover para §3 e abrir pós-mortem (template em `PROMPTS_OFICIAIS.md §13`).
- **Mitigar:** mover para §4 com data e link da sprint/ADR.

---

## 7. Fonte da verdade

- **Tracking de riscos:** este arquivo.
- **Riscos por HUB:** `docs/roadmaps/ROADMAP_<HUB>.md §10`.
- **Overview:** `docs/ai/CURRENT_STATUS_OVERVIEW.md`.
