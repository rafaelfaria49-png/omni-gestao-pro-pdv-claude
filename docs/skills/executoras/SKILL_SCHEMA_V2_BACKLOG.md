---
title: SKILL_SCHEMA_V2 — Backlog formal
status: backlog (aguardando pós-piloto)
owner: produto + arquitetura
last_update: 2026-05-27
referente: ADR-0002 (congelamento v1)
---

# 📦 Backlog de evolução do Skill Front Matter (v2)

> v1 congelado por [ADR-0002](../../decisions/ADR-0002-skill-front-matter-v1.md).
> Schema v1 vive em [`TEMPLATE_SKILL.md`](./TEMPLATE_SKILL.md) (29 campos, 7 grupos).
> Após sprint piloto **SPRINT_01_MULTI_LOJA** + retro, **ADR-0003** decidirá quando e como começar v2.
> Este arquivo é o **único canal formal** de captura de pressão por evolução do schema — não edite v1 direto.

---

## 1. Campos candidatos a v2

> Origem: pressão real documentada durante Blocos 33–35 (Research / Proposal / Execution S).

| # | Campo | Justificativa | Origem |
|---|---|---|---|
| 1 | `read_paths_extra: []` (separar leitura vs escrita) | Cat. 1 Research lê tudo, escreve restrito — hoje `allowed_paths` confunde leitura e escrita | Bloco 33 Lote A |
| 2 | `mandatory_sources: []` | WhatsApp sempre inclui Meta docs; hoje na prosa do §4 da skill | Bloco 33 Lote 2 |
| 3 | `mandatory_sections: []` | Seções obrigatórias por skill (ex.: compliance em WhatsApp) | Bloco 33 Lote 2 |
| 4 | `cross_hubs_warnings: []` | Alertas explícitos em pares com overlap alto (PDV↔Financeiro, OS↔Estoque) | Bloco 33 Lote 2 |
| 5 | `duration_max_override` por modo | Marketplace deep / Multi-loja sweep pedem PT2H — hoje exceção documentada | Bloco 33 Lotes 2 e C |
| 6 | `benchmark_targets_default: []` parseável | Hoje listado em prosa no §4; parseável reduz duplicação | Bloco 33 Lote 1 |
| 7 | `findings_schema_version: v1` | AUDIT findings parseáveis com severidade no front matter | Bloco 33 Lote A |
| 8 | `audit_types_supported: []` (enum) | AUDITs declaram tipos cobertos (read-only DB, lint, contract, etc.) | Bloco 33 Lote A |
| 9 | `read_only_db_access: bool` | AUDIT roda queries diretas no banco — explicitar permissão | Bloco 33 Lote A |
| 10 | `requires_event: []` | DOC_REFRESH dispara apenas em eventos (post-merge, post-audit) | SKILL_DOC_REFRESH §12 |
| 11 | `dry_run_default_in: [OVERNIGHT]` | DOC_REFRESH é dry-run por padrão em OVERNIGHT | SKILL_DOC_REFRESH §12 |
| 12 | `proposal_priority: P0\|P1\|P2\|P3` | Priority queue entre propostas concorrentes | Bloco 34 |
| 13 | `proposal_lock` (cross) | Anti-conflito em `decision_topic: cross` (dois ADRs no mesmo tema) | Bloco 34 |
| 14 | `id_strategy: ticket_id\|autoincrement\|uuid` | Numeração explícita por skill | Bloco 34 |
| 15 | `output_schema_version: v1` | Versionar outputs (BENCHMARK_OUTPUT, ADR_PROPOSAL_OUTPUT, etc.) | Blocos 33 e 34 |
| 16 | `allowed_paths` com **resolução dinâmica** formalizada | DEBT_ITEM / FEATURE_S / STABILIZATION resolvem do `proposal_ref §5` — hoje convenção (`allowed_paths: dynamic`) | Bloco 35 |
| 17 | Inheritance / presets por categoria | Research-preset, Execution-preset; reduz duplicação massiva | Alternativa C de [ADR-0002 §3](../../decisions/ADR-0002-skill-front-matter-v1.md) |

> Total inicial: **17 itens** (16 documentados em Blocos 33–35 + 1 da Alternativa C do próprio ADR-0002).

---

## 2. Princípios de v2 (decisão futura — ADR-0003)

- **Compatibilidade reversa obrigatória:** engine v2 lê skills `template_version: v1` sem migração forçada.
- **Migration explícita:** skill antiga continua antiga; nova nasce v2.
- **Incremental, nunca Big Bang:** ADR-0003 deve definir escopo mínimo viável de v2 (não tudo de uma vez).
- **Justificativa por campo:** cada campo v2 deve ter uso real comprovado pelo piloto.
- **Cultura "schema é contrato":** v2 também será congelado após adoção.

---

## 3. Convenções deste backlog

- **Append-only durante o congelamento.** Itens novos vão no final da tabela §1 com número incremental.
- **Não remover itens** sem justificativa registrada nas Notas §5.
- **Origem obrigatória:** todo item cita Bloco / skill / relatório que motivou.
- **Sem implementação aqui.** Este backlog é catálogo de pressão, não roadmap de execução.
- **Revisão obrigatória** no encerramento do piloto + retro (Bloco 44).

---

## 4. Workarounds aceitos em v1 (mantidos como convenção documentada)

> Estes desvios continuam **válidos em v1** durante o congelamento — não exigem mudança imediata, mas devem ser formalizados em v2.

| Workaround | Onde aparece | Convenção atual |
|---|---|---|
| `allowed_paths: dynamic` | DEBT_ITEM, FEATURE_S, STABILIZATION | Resolve do `proposal_ref §5` em runtime |
| `mandatory_sources` em prosa | SKILL_BENCHMARK_WHATSAPP §4 | Documentado no corpo humano da skill |
| `duration_max: PT2H` (override individual) | SKILL_AUDIT_MULTI_LOJA | Front matter da própria skill, não do template |
| `benchmark_targets_default` em prosa | BENCHMARK skills | Listados no §4 textual |

---

## 5. Notas / discussão

- Este backlog nasce com **17 itens não-vazios** — não é graveyard especulativo.
- A meta do congelamento é **estabilidade do piloto**, não "v1 é definitiva". Espera-se que v2 chegue.
- Pressão extra durante o piloto deve ser anotada aqui (não em ADRs ou prosa solta).
- Se Cat. 4 (Execution M) / Cat. 5 (Composite) / Cat. 6 (Governance) demandarem campos críticos antes do fim do piloto, abrir ADR de exceção pontual (não mexer no template v1 silenciosamente).

---

## 6. Referências

- [`ADR-0002`](../../decisions/ADR-0002-skill-front-matter-v1.md) — congelamento que originou este backlog.
- [`TEMPLATE_SKILL.md`](./TEMPLATE_SKILL.md) — schema v1 atual.
- [`SKILL_TAXONOMY.md §7`](../../execution/SKILL_TAXONOMY.md) — versionamento.
- [`EXECUTION_LOG.md`](../../status/EXECUTION_LOG.md) — depende de `template_version: v1` estável.
- [`README.md §5`](./README.md) — política de modificação de skill aprovada.
- ADR-0003 (futuro) — decidirá quando/como começar v2.
