---
title: Skills Executoras — Índice
status: vivo
owner: produto + arquitetura
last_update: 2026-05-27
---

# 🧩 Skills Executoras — Índice

> Catálogo oficial das skills do Execution Engine.
> **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](../../execution/EXECUTION_ENGINE.md).
> **Taxonomia:** [`docs/execution/SKILL_TAXONOMY.md`](../../execution/SKILL_TAXONOMY.md).
> **Template oficial:** [`TEMPLATE_SKILL.md`](./TEMPLATE_SKILL.md) (front matter CONGELADO em 2026-05-27).

---

## 1. Organização por categoria

```
docs/skills/executoras/
├── TEMPLATE_SKILL.md            # template oficial (front matter congelado)
├── README.md                    # este arquivo
├── research/                    # Cat. 1 — read-only
│   ├── SKILL_BENCHMARK_<HUB>.md (11 variantes)
│   ├── SKILL_AUDIT_<HUB>.md (11 variantes)
│   └── SKILL_DOC_REFRESH.md
├── proposal/                    # Cat. 2 — gera drafts
│   ├── SKILL_PROPOSE_SPRINT.md
│   ├── SKILL_PROPOSE_ADR.md
│   └── SKILL_PROPOSE_REFACTOR.md
├── execution/                   # Cat. 3 e 4 — escreve código
│   ├── SKILL_EXEC_FIX_MOCK.md
│   ├── SKILL_EXEC_DEBT_ITEM.md
│   ├── SKILL_EXEC_FEATURE_S.md
│   ├── SKILL_EXEC_STABILIZATION.md
│   ├── SKILL_EXEC_TESTING.md
│   └── SKILL_EXEC_FEATURE_M.md (Onda futura)
├── composite/                   # Cat. 5 — orquestra outras
│   ├── SKILL_FULL_SPRINT.md
│   └── SKILL_OVERNIGHT_BATCH.md
└── governance/                  # Cat. 6 — operação do engine
    ├── SKILL_HANDOFF.md
    ├── SKILL_LOCK_HUB.md
    └── SKILL_ROLLBACK.md
```

---

## 2. Catálogo (estado atual)

> ⏳ a criar · 🔄 em construção · ✅ aprovado · ⚠️ deprecated

### 2.1 Research (Cat. 1)

| Skill | Estado | Versão | HUB | Bloco |
|---|---|---|---|---|
| [`SKILL_BENCHMARK_PDV`](./research/SKILL_BENCHMARK_PDV.md) | 🔄 draft | v1 | pdv | 33 lote 1 |
| [`SKILL_BENCHMARK_OPERACOES_OS`](./research/SKILL_BENCHMARK_OPERACOES_OS.md) | 🔄 draft | v1 | operacoes_os | 33 lote 1 |
| [`SKILL_BENCHMARK_FINANCEIRO`](./research/SKILL_BENCHMARK_FINANCEIRO.md) | 🔄 draft | v1 | financeiro | 33 lote 1 |
| [`SKILL_BENCHMARK_ESTOQUE`](./research/SKILL_BENCHMARK_ESTOQUE.md) | 🔄 draft | v1 | estoque | 33 lote 1 |
| [`SKILL_BENCHMARK_MARKETPLACE`](./research/SKILL_BENCHMARK_MARKETPLACE.md) | 🔄 draft | v1 | marketplace | 33 lote 2 |
| [`SKILL_BENCHMARK_CRM`](./research/SKILL_BENCHMARK_CRM.md) | 🔄 draft | v1 | crm | 33 lote 2 |
| [`SKILL_BENCHMARK_WHATSAPP`](./research/SKILL_BENCHMARK_WHATSAPP.md) | 🔄 draft | v1 | whatsapp | 33 lote 2 |
| [`SKILL_BENCHMARK_MARKETING_IA`](./research/SKILL_BENCHMARK_MARKETING_IA.md) | 🔄 draft | v1 | marketing_ia | 33 lote 2 |
| [`SKILL_BENCHMARK_OMNI_AGENT`](./research/SKILL_BENCHMARK_OMNI_AGENT.md) | 🔄 draft | v1 | omni_agent | 33 lote 3 |
| [`SKILL_BENCHMARK_BI`](./research/SKILL_BENCHMARK_BI.md) | 🔄 draft | v1 | bi | 33 lote 3 |
| [`SKILL_BENCHMARK_MULTI_LOJA`](./research/SKILL_BENCHMARK_MULTI_LOJA.md) | 🔄 draft | v1 | multi_loja | 33 lote 3 |
| [`SKILL_AUDIT_PDV`](./research/SKILL_AUDIT_PDV.md) | 🔄 draft | v1 | pdv | 33 lote A |
| [`SKILL_AUDIT_OPERACOES_OS`](./research/SKILL_AUDIT_OPERACOES_OS.md) | 🔄 draft | v1 | operacoes_os | 33 lote A |
| [`SKILL_AUDIT_FINANCEIRO`](./research/SKILL_AUDIT_FINANCEIRO.md) | 🔄 draft | v1 | financeiro | 33 lote A |
| [`SKILL_AUDIT_ESTOQUE`](./research/SKILL_AUDIT_ESTOQUE.md) | 🔄 draft | v1 | estoque | 33 lote A |
| [`SKILL_AUDIT_CRM`](./research/SKILL_AUDIT_CRM.md) | 🔄 draft | v1 | crm | 33 lote B |
| [`SKILL_AUDIT_WHATSAPP`](./research/SKILL_AUDIT_WHATSAPP.md) | 🔄 draft | v1 | whatsapp | 33 lote B |
| [`SKILL_AUDIT_MARKETPLACE`](./research/SKILL_AUDIT_MARKETPLACE.md) | 🔄 draft | v1 | marketplace | 33 lote B |
| [`SKILL_AUDIT_MARKETING_IA`](./research/SKILL_AUDIT_MARKETING_IA.md) | 🔄 draft | v1 | marketing_ia | 33 lote B |
| [`SKILL_AUDIT_OMNI_AGENT`](./research/SKILL_AUDIT_OMNI_AGENT.md) | 🔄 draft | v1 | omni_agent | 33 lote C |
| [`SKILL_AUDIT_BI`](./research/SKILL_AUDIT_BI.md) | 🔄 draft | v1 | bi | 33 lote C |
| [`SKILL_AUDIT_MULTI_LOJA`](./research/SKILL_AUDIT_MULTI_LOJA.md) | 🔄 draft | v1 | multi_loja | 33 lote C |
| [`SKILL_DOC_REFRESH`](./research/SKILL_DOC_REFRESH.md) | 🔄 draft | v1 | cross | 33 (encerra) |

### 2.2 Proposal (Cat. 2)

| Skill | Estado | Versão | HUB | Bloco |
|---|---|---|---|---|
| [`SKILL_PROPOSE_SPRINT`](./proposal/SKILL_PROPOSE_SPRINT.md) | 🔄 draft | v1 | cross | 34 |
| [`SKILL_PROPOSE_ADR`](./proposal/SKILL_PROPOSE_ADR.md) | 🔄 draft | v1 | cross | 34 |
| [`SKILL_PROPOSE_REFACTOR`](./proposal/SKILL_PROPOSE_REFACTOR.md) | 🔄 draft | v1 | cross | 34 |

### 2.3 Execution S (Cat. 3)

| Skill | Estado | Versão | HUB | Bloco |
|---|---|---|---|---|
| [`SKILL_EXEC_FIX_MOCK`](./execution/SKILL_EXEC_FIX_MOCK.md) | 🔄 draft | v1 | cross | 35 |
| [`SKILL_EXEC_DEBT_ITEM`](./execution/SKILL_EXEC_DEBT_ITEM.md) | 🔄 draft | v1 | cross | 35 — **piloto** |
| [`SKILL_EXEC_FEATURE_S`](./execution/SKILL_EXEC_FEATURE_S.md) | 🔄 draft | v1 | cross | 35 |
| [`SKILL_EXEC_STABILIZATION`](./execution/SKILL_EXEC_STABILIZATION.md) | 🔄 draft | v1 | cross | 35 |
| [`SKILL_EXEC_TESTING`](./execution/SKILL_EXEC_TESTING.md) | 🔄 draft | v1 | cross | 35 |

### 2.4 Execution M (Cat. 4) — Onda futura

| Skill | Estado |
|---|---|
| `SKILL_EXEC_FEATURE_M` | ⏳ futuro |
| `SKILL_EXEC_REFACTOR_SMALL` | ⏳ futuro |

### 2.5 Composite (Cat. 5)

| Skill | Estado | Bloco |
|---|---|---|
| `SKILL_FULL_SPRINT` | ⏳ | 40 |
| `SKILL_OVERNIGHT_BATCH` | ⏳ | 40 |

### 2.6 Governance (Cat. 6)

| Skill | Estado | Versão | Bloco |
|---|---|---|---|
| [`SKILL_HANDOFF_MVP`](./runtime/SKILL_HANDOFF_MVP.md) | 🔄 draft | MVP-v1 | Bridge pré-piloto (`runtime/`) |
| `SKILL_HANDOFF` | ⏳ | — | 41 (versão completa em `governance/`) |
| `SKILL_LOCK_HUB` | ⏳ | — | 41 |
| `SKILL_ROLLBACK` | ⏳ | — | 41 |

---

## 3. Skills proibidas (registradas em [`SKILL_TAXONOMY.md §4`](../../execution/SKILL_TAXONOMY.md))

> Existem apenas como wrappers de execução manual ao vivo com flag `--with-protected-areas`. Nunca rodam sozinhas, nunca em overnight, nunca em cowork.

- `SKILL_EXEC_SCHEMA`
- `SKILL_EXEC_AUTH`
- `SKILL_EXEC_PDV_CORE`
- `SKILL_EXEC_FINANCEIRO_CORE`
- `SKILL_EXEC_OS_CORE`
- `SKILL_EXEC_WHATSAPP_CORE`
- `SKILL_EXEC_OMNI_AGENT_EXECUTORS`
- `SKILL_EXEC_MARKETPLACE`
- `SKILL_EXEC_ENV`
- `SKILL_EXEC_DEPENDENCIES`
- `SKILL_EXEC_NEXT_CONFIG`
- `SKILL_EXEC_TSCONFIG_PATHS`

---

## 4. Como criar uma skill nova

1. Copie [`TEMPLATE_SKILL.md`](./TEMPLATE_SKILL.md) para a subpasta certa (`research/`, `proposal/`, etc.).
2. Renomeie para `SKILL_<NOME>.md`.
3. **Preencha TODOS os campos do front matter.** Engine valida 100%.
4. Escreva conteúdo humano-legível (§1–12 do template).
5. Salve com `status: draft`.
6. Abra PR ou solicite revisão humana.
7. Humano aprova → muda `status: approved`, preenche `approved_by` e `approved_at`.
8. Adicione linha na tabela §2 deste README.

---

## 5. Como modificar uma skill aprovada

- **Front matter (API congelada):** exige ADR. Nova versão (`SKILL_<NOME>_v2.md`); v1 preservada.
- **Conteúdo humano (corpo):** pode editar com revisão; atualizar `last_review` no front matter.
- **Deprecar:** preencher `deprecated_by` + `deprecated_at`; nova skill sucessora referencia em "Notas".

---

## 6. Versionamento

- Skill imutável após `status: approved`.
- Mudança no front matter → nova versão.
- Antiga preservada para reproduzir execuções históricas (`EXECUTION_LOG.md` referencia `skill_version`).

---

## 7. Fonte da verdade

- **Catálogo:** este arquivo.
- **Template:** [`TEMPLATE_SKILL.md`](./TEMPLATE_SKILL.md).
- **Taxonomia:** [`docs/execution/SKILL_TAXONOMY.md`](../../execution/SKILL_TAXONOMY.md).
- **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](../../execution/EXECUTION_ENGINE.md).
- **Log de execução:** [`docs/status/EXECUTION_LOG.md`](../../status/EXECUTION_LOG.md).
