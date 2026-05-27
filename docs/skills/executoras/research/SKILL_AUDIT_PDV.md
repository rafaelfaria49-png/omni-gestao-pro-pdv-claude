---
# IDENTITY
skill_id: SKILL_AUDIT_PDV
version: v1
status: draft
category: 1
size: S
hub: pdv

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK, AUDIT]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/**"
denied_paths:
  - "prisma/schema.prisma"
  - "auth.ts"
  - "auth.config.ts"
  - "proxy.ts"
  - ".env*"
  - "lib/**"
  - "app/**"
  - "components/**"
  - "src/**"
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 0
files_max: 1
duration_max: PT1H
commits_max: 1

# I/O CONTRACT
input:
  required: [audit_type]
  optional: [scope_paths, ticket_id, sprint_topic, since_version]
output:
  artifacts:
    - "docs/audits/AUDITORIA_PDV_v<NN>.md"
    - "docs/audits/AUDIT_<ticket_id>.md"  # quando disparada na Fase 12 do Engine

# GOVERNANCE
gates: []
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Sonnet
approved_by: null
approved_at: null
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: docs/roadmaps/ROADMAP_PDV.md
related_adrs: []
related_memories:
  - project_pdv_caixa_estabilizacao
  - project_pdv_multi_terminais_fase1
  - project_pdv_multi_terminais_fase2_lock
  - project_pdv_item_avulso_insert
  - project_pdv_black_edition
  - project_aprazo_enterprise
  - project_venda_espera
  - project_cancelamento_venda_fechamento
  - project_fechamento_caixa_erp_premium
template_version: v1
---

# SKILL_AUDIT_PDV

> Skill de auditoria do **estado real** do HUB PDV. Lê código e governança internos; gera findings P0–P3 com evidência. **Não toca código.**
> Herda `docs/governance/AUDIT_PROTOCOL.md` e `docs/audits/TEMPLATE_AUDITORIA.md`.

---

## 1. Propósito

Auditar o HUB PDV de forma técnica, objetiva, baseada em evidência: lê código (`lib/pdv*`, `components/**/pdv*`, `app/api/**`), governança (`CURRENT_STATUS_OVERVIEW`, `ROADMAP_PDV`, status vivos), memórias e auditorias anteriores; gera `AUDITORIA_PDV_v<NN>.md` com findings P0–P3, evidência e recomendações.

**Diferença vs SKILL_BENCHMARK_PDV:**
- BENCHMARK olha **mercado externo** (concorrentes).
- AUDIT olha **estado real interno** (código + estado + dívida + risco). Sem pesquisa web.

**O que ela NÃO faz:**
- Não altera código.
- Não implementa fix.
- Não abre PR.
- Não roda migration.
- Não toca schema.
- Não substitui o gate humano (auditoria gera proposta, humano decide sprint).

---

## 2. Quando usar

### 2.1 Standalone (auditoria periódica)
- A cada **encerramento de fase do PDV** (Fase 1 → Fase 2).
- A cada **trimestre** (auditoria de saúde geral).
- Após **incidente operacional** (auditoria forense).
- Quando **novo HUB cruzado** vai mexer com PDV (ex: Marketplace pré-integração).

### 2.2 Sprint-scoped (Fase 12 do Engine)
- Pós-implementação de qualquer sprint do PDV → auditoria com escopo restrito à sprint, gera `AUDIT_<ticket_id>.md`.

---

## 3. Quando NÃO usar

- Para "ver se PDV está bonito" → benchmark, não auditoria.
- Para gerar plano de roadmap → use roadmap diretamente; auditoria informa, não substitui.
- Sem `audit_type` definido → rejeita.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `audit_type` | enum | sim | Tipo de auditoria (do `AUDIT_PROTOCOL §3`) | `saude_geral` \| `seguranca` \| `performance` \| `dados` \| `fiscal` \| `forense` |
| `scope_paths` | string[] | não | Restringe escopo a paths específicos | `["lib/pdv-caixa-operacao.ts"]` |
| `ticket_id` | string | não | Se disparada em Fase 12, vincula ao ticket | `PDV-S-007` |
| `sprint_topic` | string | não | Foco quando sprint-scoped | `"persistência server-side PDV Next"` |
| `since_version` | string | não | Comparar com auditoria específica anterior (default: última) | `v3` |

**Validações:**
- `audit_type` obrigatório e do enum.
- `scope_paths` ≤ 30 paths.
- Se `ticket_id`: skill roda em modo sprint-scoped (output = AUDIT_<ticket>.md).

---

## 5. Output contract

### 5.1 Standalone
**Artefato:** `docs/audits/AUDITORIA_PDV_v<NN>.md` (versão = max(versões anteriores) + 1).

### 5.2 Sprint-scoped
**Artefato:** `docs/audits/AUDIT_<ticket_id>.md`.

### 5.3 Estrutura obrigatória (herda `TEMPLATE_AUDITORIA.md`)

```markdown
---
title: AUDITORIA_PDV_v<NN>  ou  AUDIT_<ticket_id>
audit_id: pdv-v<NN>  ou  pdv-<ticket_id>
hub: pdv
tipo: <audit_type>
data: <ISO>
duracao_horas: <X>
auditor_ia: sonnet
escopo: <descrição concisa>
status: rascunho | publicada
versao_anterior: AUDITORIA_PDV_v<NN-1>  # se houver
---

# Auditoria PDV — <tipo> — <data>

## 1. Escopo (dentro/fora/premissas)
## 2. Metodologia (docs lidos, código inspecionado, queries, cenários)
## 3. Severidade — convenção (do AUDIT_PROTOCOL §3, com upgrade rule)
## 4. Findings (F-01, F-02, ...) — cada um com:
   - Local (arquivo:linha)
   - Descrição
   - Evidência (snippet, log, query)
   - Impacto
   - Causa raiz (hipótese)
   - Plano sugerido
   - Sprint/ADR alvo
## 5. Resumo executivo (tabela P0/P1/P2/P3 + 1 parágrafo)
## 6. Recomendações priorizadas
## 7. Pontos positivos (registrar o que está bem)
## 8. Comparativo com auditoria anterior (se houver — F-NN persistiu/resolvido/piorou)
## 9. Próximos passos (sprints sugeridas, ADRs, atualizar roadmap/status)
## 10. Referências
## 11. Imutabilidade pós-publicação
```

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`, com diferenças:

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `audit_type` |
| 2 PRE-FLIGHT | sim | lê: ROADMAP_PDV, CURRENT_STATUS, status vivos, memórias, auditoria anterior |
| 3 LOCK | sim | adquire lock leve no HUB pdv |
| 4 SCOPE | sim | rejeita se `scope_paths` > 30 |
| 5 BENCHMARK | **N/A** (auditoria não pesquisa externo) |
| 6 PROPOSAL | **N/A** |
| 7 GATE #1 | **N/A** |
| 8–13 | **N/A** (sem código) |
| 14 DOC UPDATE | sim | atualiza `RISCOS.md` (riscos novos detectados), `DIVIDA_TECNICA.md` (dívidas novas) |
| 15 ADR/MEMORY | condicional | findings P0 frequentemente exigem ADR; anotar no artefato |
| 16 LOG | sim | entrada em EXECUTION_LOG.md |
| 17 LOCK RELEASE | sim | |

---

## 7. Comportamento específico — foco PDV

A skill audita obrigatoriamente as **9 dimensões críticas do PDV**:

1. **Persistência server-side** — toda venda finalizada está no banco? (DT-01: PDV Next vive em localStorage)
2. **Caixa** — abertura/fechamento atômicos? `caixa-fechamento-resumo` consistente?
3. **Multi-terminal** — lock + heartbeat funcionando? TTL respeitado? força-release controlado?
4. **Venda perdida** — log de divergência entre `Venda` no DB vs cache local?
5. **Sincronização** — adapter PDV→Estoque (consumo) e PDV→Financeiro (À Prazo, recebimento)?
6. **Fallback** — quando servidor cai, PDV degrada controlado? alerta humano?
7. **Performance** — latência `finalizarVenda` (alvo < 200ms)? gargalo em catálogo grande?
8. **Offline** — preparado para Fase 4 do roadmap? estado atual zero ou parcial?
9. **Fiscal readiness** — código preparado para plugar provedor fiscal (Fase 2 roadmap)? Item Avulso com CFOP?

Cada dimensão gera 0+ findings.

**Auditorias prévias do PDV:** nenhuma dedicada ainda (gap a corrigir na primeira execução desta skill). §8 do artefato ficará vazio na v1.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Sem `audit_type` | ABORT na Fase 1 |
| `scope_paths` toca área protegida | leitura é permitida (read-only); registra no artefato |
| `since_version` aponta auditoria inexistente | warn + segue sem comparativo |
| Cap PT1H estourado | gera artefato parcial + `incomplete: true` |
| Skill encontra finding P0 envolvendo dinheiro/fiscal/multi-loja | aplica regra de upgrade do AUDIT_PROTOCOL (vira P0 obrigatório) + escala no log |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria periódica de saúde geral
```yaml
ticket_id: null
skill: SKILL_AUDIT_PDV
modo: SAFE
input:
  audit_type: saude_geral
  scope_paths: null  # auditoria global do HUB
```

### 9.2 OVERNIGHT — Auditoria de performance
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_PDV
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: performance
    scope_paths: ["lib/pdv-caixa-operacao.ts", "components/dashboard/caixa/**"]
```

### 9.3 Sprint-scoped (Fase 12 do Engine)
```yaml
ticket_id: PDV-S-007
skill: SKILL_AUDIT_PDV
modo: SAFE
input:
  audit_type: saude_geral
  ticket_id: PDV-S-007
  sprint_topic: "persistência server-side PDV Next"
  scope_paths: ["lib/pdv-next/**", "app/api/pdv-next/**"]
```

---

## 10. Referências

- **Protocolo:** [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- **Template:** [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- **Roadmap origem:** [`docs/roadmaps/ROADMAP_PDV.md`](../../../roadmaps/ROADMAP_PDV.md)
- **Status vivos:** [`docs/status/DIVIDA_TECNICA.md`](../../../status/DIVIDA_TECNICA.md), [`MOCKS_TRACKING.md`](../../../status/MOCKS_TRACKING.md), [`RISCOS.md`](../../../status/RISCOS.md), [`BLOCKERS.md`](../../../status/BLOCKERS.md)
- **Dívida crítica relacionada:** DT-01 (PDV Next sem persistência), DT-05 (PIN supervisor), DT-06 (CFOP avulso).
- **Riscos críticos:** R-03 (venda perdida PDV Next), R-12 (lock multi-terminal).
- **Auditorias prévias:** **nenhuma dedicada ainda** (gap — primeira execução desta skill cria a baseline v1).
- **Memórias:** ver front matter.

---

## 11. Notas

- PDV é HUB **mais maduro** do núcleo — auditoria provavelmente trará muitos pontos positivos no §7 (4 PDVs convergentes, multi-terminais Fase 2, À Prazo Enterprise, Item Avulso, Venda em Espera, fechamento premium).
- **Foco do v1:** estabelecer baseline. Próximas execuções (v2, v3...) usarão §8 para comparativo.
- **Risco P0 conhecido (DT-01)** vai aparecer — auditoria deve confirmar com evidência e propor sprint específica.
- **Regra de upgrade do AUDIT_PROTOCOL §3** aplica forte aqui: PDV mexe com dinheiro = P1→P0 automático em muitos casos.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
