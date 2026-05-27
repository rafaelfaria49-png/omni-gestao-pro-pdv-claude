---
title: Blockers — o que está travando avanço AGORA
status: vivo
owner: produto + Sonnet
last_update: 2026-05-27
---

# 🚧 Blockers — Tracking vivo

> **Blocker é o que está travando agora.** Bug em produção, decisão pendente sem a qual nada anda, dependência externa não entregue, recurso ausente.
> Não confundir com dívida (já assumida) nem risco (pode acontecer).

> **Atualização:** ao identificar blocker, ao destravar, ao mudar de owner.

---

## 1. Convenção

### 1.1 Tipo
- **DECISÃO** — falta humano decidir (escolha de provedor, modelo, ADR)
- **EXTERNO** — depende de terceiro (Meta, provedor fiscal, banco)
- **TÉCNICO** — bloqueio técnico identificado (build quebrado, dependência incompatível)
- **RECURSO** — falta hardware, credencial, ambiente
- **DEPENDÊNCIA** — depende de sprint/HUB anterior não fechado

### 1.2 Estados
- 🆕 novo · ⏳ aguardando · 🔄 em andamento · ✅ destravado · 🗑️ obsoleto

### 1.3 Severidade
- 🔴 P0 — trava release / operação parada
- 🟡 P1 — trava sprint específica
- 🟢 P2 — trava feature específica

---

## 2. Blockers ativos

| # | Blocker | Tipo | Severidade | Estado | Owner | Bloqueia | Notas |
|---|---|---|---|---|---|---|---|
| BL-01 | Decisão de provedor fiscal (NFC-e + NFS-e) | DECISÃO | 🔴 | ⏳ | humano (produto) | PDV Fase 2 + OS Fase 2 | Sugerir ADR único para os 2 |
| BL-02 | Aprovação Meta de templates WhatsApp | EXTERNO | 🟡 | ⏳ | humano (operação) | WhatsApp Fase 2 + OS Fase 3 | Submeter em paralelo |
| BL-03 | ADR de arquitetura adapter Marketplace | DECISÃO | 🔴 | ⏳ | Opus | Marketplace Fase 1 inteira | — |
| BL-04 | Decisão "cliente por loja vs por organização" | DECISÃO | 🟡 | ⏳ | humano (produto) | CRM Fase 5 + Multi-loja Fase 4 | — |
| BL-05 | Modelo de billing/limite por loja (Omni Agent) | DECISÃO | 🟡 | ⏳ | humano (produto) | Omni Agent Fase 2 (limite duro) | — |
| BL-06 | Hardware fiscal para homologação NFC-e | RECURSO | 🟡 | ⏳ | operação | PDV Fase 2 (loja-piloto) | — |
| BL-07 | Estoque multi-depósito (Fase 2) | DEPENDÊNCIA | 🔴 | ⏳ | Sonnet | Marketplace sync de saldo | DT-08 |
| BL-08 | Lint customizado de `storeId` ausente | TÉCNICO | 🔴 | ⏳ | Sonnet | Eliminar fallback `loja-1` com segurança | DT-03 |
| BL-09 | Storage S3-compatible para mídia WhatsApp | RECURSO | 🟡 | ⏳ | humano (infra) | WhatsApp Fase 3 (mídia end-to-end) | — |
| BL-10 | Algoritmo de similaridade para dedup CRM | TÉCNICO | 🟡 | ⏳ | Sonnet | CRM Fase 3 (deduplicação assistida) | Spike pendente |
| BL-11 | BSP definido (Twilio? GupShup? direto Meta?) | DECISÃO | 🟡 | ⏳ | humano (produto) | WhatsApp marketing massa | — |
| BL-12 | ADR multi-depósito (modelo `Deposito`) | DECISÃO | 🔴 | ⏳ | Opus + Sonnet | Estoque Fase 2 → desbloqueia Marketplace | — |
| BL-13 | financeiro-v2 mock | DEPENDÊNCIA | 🟡 | ⏳ | Sonnet | Onda 1 considerada completa | DT-02 / MOCK-01 |
| BL-14 | PDV Next sem persistência server-side | TÉCNICO | 🔴 | ⏳ | Sonnet | Encerramento Fase 1 PDV | DT-01 / R-03 |

---

## 3. Blockers destravados (últimos 90 dias)

| # | Blocker | Destravado em | Como |
|---|---|---|---|
| (vazio — registrar quando destravar) | | | |

---

## 4. Mapa de dependência (quem destrava o quê)

```
BL-12 (ADR Depósito) → BL-07 (Multi-depósito) → Marketplace Fase 1
BL-08 (Lint storeId) → eliminar DT-03 (loja-1 fallback)
BL-01 (provedor fiscal) → PDV Fase 2 + OS Fase 2
BL-11 (BSP) + BL-02 (templates Meta) → WhatsApp Fase 2 → Marketing IA Fase 1
BL-14 (PDV Next persist) → fecha Fase 1 PDV
```

---

## 5. Top 3 prioridades de destravamento

1. **BL-12** (ADR multi-depósito) — destrava BL-07, que destrava Marketplace inteiro. Maior alavanca do projeto.
2. **BL-01** (provedor fiscal) — destrava 2 HUBs (PDV+OS) na fase fiscal; concorrência aperta (R-11).
3. **BL-08** (lint storeId) — pré-requisito para eliminar DT-03 (`loja-1`), que é risco LGPD (R-02).

---

## 6. Como gerenciar blocker

- **Abrir:** identificou trava real → adicione `BL-NN` com tipo/severidade/owner/bloqueia.
- **Atualizar:** mudou owner ou estado → editar linha + `last_update`.
- **Destravar:** mover para §3 com data e como.
- **Obsoleto:** se prioridade caiu ou trava sumiu sem ação → marcar 🗑️ com nota.

---

## 7. Fonte da verdade

- **Tracking de blockers:** este arquivo.
- **Blockers por HUB:** `docs/roadmaps/ROADMAP_<HUB>.md §14`.
- **Cross-ref:** [`DIVIDA_TECNICA.md`](./DIVIDA_TECNICA.md), [`RISCOS.md`](./RISCOS.md), [`MOCKS_TRACKING.md`](./MOCKS_TRACKING.md).
