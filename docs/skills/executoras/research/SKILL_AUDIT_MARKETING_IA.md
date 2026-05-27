---
# IDENTITY
skill_id: SKILL_AUDIT_MARKETING_IA
version: v1
status: draft
category: 1
size: S
hub: marketing_ia

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
    - "docs/audits/AUDITORIA_MARKETING_IA_v<NN>.md"
    - "docs/audits/AUDIT_<ticket_id>.md"

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
roadmap: docs/roadmaps/ROADMAP_MARKETING_IA.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_AUDIT_MARKETING_IA

> Skill de auditoria do **estado real** do HUB Marketing IA. Foco em **rastreabilidade, atribuição, campanha→venda, geração IA, duplicidade de assets, integração CRM, integração WhatsApp, permissões, armazenamento, filas, automações, governança de conteúdo IA**.
> **Marketing IA NÃO pode virar gerador solto / automação sem rastreabilidade / spam engine.**

---

## 1. Propósito

Auditar Marketing IA de forma técnica: lê código (`components/ia-mestre/views/GeradorImagensView.tsx`, `src/lib/ai/credit-costs.ts`, `lib/ia-mestre/{credit-costs,debit-turn-credits}.ts`, `lib/marketing*` — esperado vazio), governança, ADRs, memórias e auditorias anteriores; gera `AUDITORIA_MARKETING_IA_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_MARKETING_IA:**
- BENCHMARK olha mercado (Jasper, Copy.ai, Canva Magic…).
- AUDIT olha estado real interno (gerador imagens, credit-costs, gap orquestrador, gap atribuição).

**O que ela NÃO faz:**
- Não altera código, não muda modelo de billing, não dispara campanha.
- Não autoriza marketing em massa (separação WhatsApp + opt-out vem primeiro).

---

## 2. Quando usar

### 2.1 Standalone
- A cada **trimestre** (saúde geral + governança IA).
- Antes de **liberar orquestrador de massa** (auditoria preventiva — depende WhatsApp + CRM).
- Após **incidente de custo descontrolado** (forense — créditos esgotaram inesperado).
- Antes de **liberar atribuição cupom→venda** (validar fluxo).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do Marketing IA.

---

## 3. Quando NÃO usar

- Para escolher ferramenta IA externa → benchmark.
- Para mapear UX de campanha → benchmark.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (rastreabilidade), `seguranca` (governança IA), `forense` (custo descontrolado), `saude_geral` |
| `scope_paths` | string[] | não | `["lib/ia-mestre/**", "components/ia-mestre/**", "lib/marketing*"]` |
| `ticket_id` | string | não | `MKTIA-S-001` |
| `sprint_topic` | string | não | `"orquestrador de campanha"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_MARKETING_IA_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (governança IA):**
- Consumo de créditos por execução (custo médio, top 10 mais caros).
- Limites por loja (soft cap, hard cap — gap esperado: hard cap ausente).
- Log de geração (prompt, output, custo, executor) — completo?
- Atribuição cupom→venda — funcional? gap esperado: ausente.
- Storage de assets gerados — onde vivem? duplicados?

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco Marketing IA

A skill audita obrigatoriamente as **12 dimensões críticas**:

1. **Rastreabilidade** — toda geração IA (copy, imagem) tem log (quem, quando, prompt, custo)?
2. **Atribuição** — cupom usado no PDV vincula venda à campanha origem? gap esperado.
3. **Campanha→venda** — fluxo end-to-end auditável?
4. **Geração IA** — gerador de imagens (`GeradorImagensView.tsx`) sob governança? rate limit por usuário/loja?
5. **Duplicidade de assets** — mesma imagem gerada N vezes? hash/cache?
6. **Integração CRM** — segmentação dinâmica consumida? cliente da campanha vincula corretamente?
7. **Integração WhatsApp** — disparo respeita opt-out (cross-check com WhatsApp HUB)?
8. **Permissões** — quem pode disparar campanha? quem pode gerar criativo? hierarquia clara?
9. **Armazenamento** — assets ficam onde? storage S3-compatible? expiração?
10. **Filas** — orquestrador de massa existe? throttling? dead-letter? (gap esperado P0).
11. **Automações** — dry-run obrigatório antes de produção? aprovação humana?
12. **Governança de conteúdo IA** — prompt injection mitigado? conteúdo gerado validado antes de envio? marca d'água?

**Auditorias prévias:** nenhuma dedicada ainda.

**Overlap explícito** registrado no artefato:
- **Marketing IA ↔ CRM** (segmentação dinâmica).
- **Marketing IA ↔ WhatsApp** (canal de disparo + opt-out).
- **Marketing IA ↔ PDV** (atribuição cupom→venda).
- **Marketing IA ↔ Financeiro** (custo IA vs receita gerada).
- **Marketing IA ↔ BI** (ROI dashboard).
- **Marketing IA ↔ Omni Agent** (orquestrador compartilhado de execução IA).

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Geração IA sem log completo (prompt + custo + usuário + storeId) | finding **P0** (rastreabilidade quebrada) |
| Encontra campanha disparada sem `storeId` ou com fallback `loja-1` | finding **P0** (multi-loja + LGPD) |
| Hard cap de crédito IA por loja ausente | finding P1 (gap conhecido — risco custo descontrolado) |
| Disparo em massa em produção sem dry-run | finding **P0** (automação insegura) |
| Disparo em massa sem checar opt-out (cross WhatsApp) | finding **P0** (R-01 — banimento Meta) |
| Atribuição cupom→venda ausente quando campanha promete medir ROI | finding P1 → upgrade P0 (decisão de negócio errada) |
| Gerador de imagens (`GeradorImagensView.tsx`) sem rate limit por loja | finding P1 (custo descontrolado possível) |
| Asset gerado sem hash → duplicidade infinita | finding P2 (custo + storage) |
| Conteúdo IA enviado direto a cliente sem moderação | finding **P0** (governança IA) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de rastreabilidade
```yaml
ticket_id: null
skill: SKILL_AUDIT_MARKETING_IA
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["lib/ia-mestre/**", "components/ia-mestre/**", "src/lib/ai/**"]
```

### 9.2 OVERNIGHT — Auditoria preventiva pré-orquestrador
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_MARKETING_IA
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: seguranca
    sprint_topic: "validar governança IA antes de liberar orquestrador massa"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_MARKETING_IA.md`](../../../roadmaps/ROADMAP_MARKETING_IA.md)
- Dependências críticas: WhatsApp Fase 2 (opt-out), CRM Fase 2 (segmentação), PDV cupom validado.
- Riscos críticos: R-01 (banimento Meta via marketing), custo IA descontrolado.
- Código existente: `components/ia-mestre/views/GeradorImagensView.tsx`, `src/lib/ai/credit-costs.ts`, `lib/ia-mestre/{credit-costs,debit-turn-credits}.ts`.
- Auditorias prévias: **nenhuma dedicada ainda** (Marketing IA é nascente; Omni Agent tem auditorias relacionadas).

---

## 11. Notas

- Marketing IA tem **gerador de imagens funcional** e **modelo de crédito modelado** — auditoria deve proteger esses dois ativos.
- **Atribuição cupom→venda ausente** é o gap conceitual mais grave — sem isso, "marketing IA" é gerador de conteúdo, não motor de receita.
- **Forte dependência cross-HUB** — auditoria sempre sinaliza overlap (CRM, WhatsApp, PDV).
- **Princípio fundador:** "Marketing IA não pode virar gerador solto / automação sem rastreabilidade / spam engine" — toda recomendação deve reforçar isso.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
