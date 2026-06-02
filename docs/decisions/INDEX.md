---
title: Decisões Arquiteturais (ADRs) — OmniGestão Pro
status: vivo
owner: produto/arquitetura
last_update: 2026-06-01
---

# 🧭 Decisões Arquiteturais — Índice oficial

> **Fonte da verdade** para todas as decisões arquiteturais e de produto do OmniGestão Pro.
> **Protocolo:** `docs/governance/AUDIT_PROTOCOL.md` (auditorias geram ADR quando há decisão) e `docs/governance/SPRINT_PROTOCOL.md` (sprints implementam ADR).
> **Template oficial:** [`TEMPLATE_ADR.md`](./TEMPLATE_ADR.md).

---

## 1. Convenções

### 1.1 Naming

```
ADR-<NNNN>-<slug-kebab-case>.md

Exemplos:
  ADR-0001-os-route-oficial.md
  ADR-0002-marketplace-adapter-interface.md
  ADR-0003-storeid-logsauditoria.md
```

- `<NNNN>` é sequencial global do projeto (4 dígitos), sem reset.
- `<slug>` é curto, em kebab-case, descreve o tema.
- Datas no front matter (não no nome).

### 1.2 Status possíveis

| Status | Significado |
|---|---|
| `proposta` | Em discussão, ainda não decidida |
| `aceita` | Decidida — vigente |
| `superada` | Substituída por outro ADR (`superado_por` aponta) |
| `rejeitada` | Foi proposta e descartada (mantida como referência) |
| `depreciada` | Foi aceita um dia mas não vale mais (sem substituto direto) |

### 1.3 Quando criar um ADR

- Decisão arquitetural com **impacto > 1 arquivo** ou que **muda contrato** entre módulos.
- Escolha entre alternativas reais (não há "óbvio").
- Decisão que **outras IAs/devs precisarão entender** sem perguntar.
- Trade-off explícito (escolhi A em vez de B, sabendo dos custos).

**Não criar ADR para:**
- Microajuste cosmético.
- Decisão local de implementação que cabe num comentário.
- "Vou usar `useState` em vez de `useReducer`" (a menos que vire padrão).

### 1.4 Imutabilidade

- ADR aceito **não é editado** depois — exceto para mudar `status` (para `superada`, `depreciada`).
- Mudança de direção → **novo ADR** referenciando o anterior em `substitui:`.

---

## 2. Como criar um ADR novo

```bash
# 1. Pegue o próximo número (olhe o maior NNNN deste index e some 1)
# 2. Copie o template
cp docs/decisions/TEMPLATE_ADR.md docs/decisions/ADR-<NNNN>-<slug>.md
# 3. Preencha front matter + 8 seções
# 4. Adicione linha neste INDEX.md (tabela §3)
# 5. Atualize ADRs relacionados (campo "Referências")
# 6. Commit: docs(adr): ADR-<NNNN> · <título>
```

**Quem cria:** geralmente Opus (após discussão), Sonnet se a decisão é técnica pura.
**Quem aprova:** humano dono do projeto (mudança de status de `proposta` → `aceita`).

---

## 3. Índice de ADRs

| # | Título | HUB | Status | Data | Arquivo |
|---|--------|-----|--------|------|---------|
| 0001 (legado) | Rota Oficial de Operações de Serviço | Operações | ✅ Decidido | 2026-05-15 | [`OS_ROUTE_OFICIAL.md`](./OS_ROUTE_OFICIAL.md) |
| 0002 | Congelamento do Skill Front Matter v1 até pós-piloto | cross / governance | ✅ Aceita | 2026-05-27 | [`ADR-0002-skill-front-matter-v1.md`](./ADR-0002-skill-front-matter-v1.md) |
| 0003 | Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em leituras de API | multi_loja | ✅ Aceita | 2026-05-29 | [`ADR-0003-eliminar-fallback-legacy-primary-store-id.md`](./ADR-0003-eliminar-fallback-legacy-primary-store-id.md) |
| 0004 | SAFE-lite como modo padrão; Engine de 17 fases como modo pesado reservado | governança | ✅ Aceita | 2026-05-30 | [`ADR-0004-safe-lite-modo-padrao.md`](./ADR-0004-safe-lite-modo-padrao.md) |
| 0006 | Roteamento WhatsApp multi-loja por `phone_number_id` (fim do webhook single-store) | whatsapp / multi_loja | ✅ Aceita | 2026-06-01 | [`ADR-0006-whatsapp-router-multi-loja.md`](./ADR-0006-whatsapp-router-multi-loja.md) |
| 0007 | Modelo de Depósitos (multi-depósito por loja) — fundação de saldo segmentado | estoque / multi_loja | ✅ Aceita | 2026-06-01 | [`ADR-0007-modelo-depositos.md`](./ADR-0007-modelo-depositos.md) |

> **Nota sobre o ADR legado:** `OS_ROUTE_OFICIAL.md` foi escrito antes desta convenção e não segue o template/naming atual. Mantido como histórico. Quando precisar ser referenciado, citar como **ADR-0001 (legado)**. Migração para o naming `ADR-0001-os-route-oficial.md` é uma tarefa **opcional** e exige autorização (renomear histórico pode quebrar links externos).

---

## 4. ADRs propostos (em discussão, ainda não decididos)

| # | Título | HUB | Proponente | Data |
|---|--------|-----|------------|------|
| 0005 (draft) | Liberação controlada do modo COWORK (Fase 1 supervisionada) | governança | Opus | 2026-06-01 |

> **0005 (CoWork)** vive como draft em [`drafts/ADR_PROPOSAL_0005_LIBERAR_COWORK.md`](./drafts/ADR_PROPOSAL_0005_LIBERAR_COWORK.md) (aguarda decisão humana). **0006 (WhatsApp)** foi **aceito** no Gate #2 da sprint `MULTI_LOJA-S-003` (ver §3). **0007 (Depósitos)** foi **aceito** no Gate #1 em 2026-06-01 (decisão); **Fase 1 (Fundação) implementada** em 2026-06-02 (`SPRINT_BL07_FASE1`, validada `tsc`/`build`/vitest) — ver **Adendo §9** do ADR (reconciliação as-built: `ProdutoDeposito`≡`EstoqueSaldo`, `principal`≡`isDefault`; `custoMedio`/`tipo`/`depositoId@ledger` diferidos p/ Fase 2/3). Cutover (`db:push`+backfill) pendente. O número `0006` decorre de `0005` já estar reservado ao CoWork (não se renumera histórico publicado).

---

## 5. ADRs superados / depreciados

| # | Título | Status | Superado por |
|---|--------|--------|--------------|
| — | — | — | — |

---

## 6. Atalhos por HUB

> Quando houver ADRs suficientes, organizar por HUB aqui.

- **Operações/OS:** ADR-0001 (legado)
- **PDV:** —
- **Financeiro:** —
- **Estoque:** ADR-0007 (modelo de depósitos — aceita)
- **Marketplace:** —
- **CRM:** —
- **WhatsApp:** ADR-0006 (router multi-loja por `phone_number_id` — aceita)
- **Marketing IA:** —
- **Omni Agent:** —
- **BI:** —
- **Multi-loja:** ADR-0003 (eliminar fallback `loja-1`) · ADR-0006 (router WhatsApp — aceita) · ADR-0007 (modelo de depósitos — aceita)
- **Governança:** ADR-0002 (congelamento Skill Front Matter v1) · ADR-0004 (SAFE-lite modo padrão)

---

## 7. Anti-padrões em ADRs

- ADR sem alternativa real considerada (vira "registrei o que ia fazer").
- ADR sem trade-off explícito (vira ata, não decisão).
- ADR editado depois de aceito (perde imutabilidade).
- ADR sem referência cruzada (vira ilha).
- Decisão importante sem ADR (vira tribal knowledge — morre quando o autor sai).
- Múltiplas decisões no mesmo ADR (vira documento confuso — quebrar em N).

---

## 8. Fonte da verdade

- **Convenção e índice de ADRs** → este arquivo.
- **Template** → [`TEMPLATE_ADR.md`](./TEMPLATE_ADR.md).
- **Quando criar ADR** → este arquivo §1.3.
- **Como criar ADR** → este arquivo §2.
