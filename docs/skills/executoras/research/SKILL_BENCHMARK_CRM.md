---
# IDENTITY
skill_id: SKILL_BENCHMARK_CRM
version: v1
status: draft
category: 1
size: S
hub: crm

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/benchmarks/**"
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
duration_max: PT30M
commits_max: 1

# I/O CONTRACT
input:
  required: [sprint_topic]
  optional: [concorrentes_alvo, profundidade, ticket_id]
output:
  artifacts:
    - "docs/audits/benchmarks/BENCHMARK_<ticket_id>.md"

# GOVERNANCE
gates: []
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Opus
approved_by: null
approved_at: null
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: docs/roadmaps/ROADMAP_CRM.md
related_adrs: []
related_memories:
  - project_cadastros_ux_e_venda_cliente
  - project_credito_cliente_persistente
  - project_importador_produtos_match_seguro
template_version: v1
---

# SKILL_BENCHMARK_CRM

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de concorrentes de CRM para alimentar uma proposta de sprint do HUB CRM.

---

## 1. Propósito

Pesquisar 3–5 concorrentes (CRMs profissionais + ERPs com CRM forte), extrair UX/fluxo/edge cases/arquitetura/riscos/diferenciais. Foco em **visão 360°**, **tags/segmentação**, **pipeline B2B**, **histórico unificado**, **deduplicação**, **LGPD** e **relacionamento pós-venda**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide modelo "cliente cross-loja" (isso é ADR — `SKILL_PROPOSE_ADR`).
- Não cobre WhatsApp inbox (mesmo cruzando — usar SKILL_BENCHMARK_WHATSAPP).

---

## 2. Quando usar

- Sprint com **tela 360°** consolidada (P1).
- Sprint com **tags + segmentação dinâmica** (P1).
- Sprint com **deduplicação assistida** (P1).
- Sprint com **pipeline B2B** (Fase 4).
- Sprint com **LGPD** (export/delete) — sempre P1.
- Sprint com **score / NPS** automático.
- Sprint com **campos customizáveis** por loja.

## 3. Quando NÃO usar

- Fix em FK `Venda.clienteId` ou `totalGasto` → técnico conhecido, sem benchmark.
- Bugfix no modal PF/PJ → sem benchmark.
- Crédito de cliente persistente (já implementado) → não exige.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Tela 360° consolidada (vendas + OS + crédito + conversas)"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["HubSpot", "RD Station CRM"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `CRM-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- HubSpot
- RD Station CRM
- Kommo
- Salesforce
- Pipedrive

> Nota: lista atualizada vs `ROADMAP_CRM §3` original (HubSpot, RD Station, Pipedrive, GestaoClick, Sankhya). Roadmap será sincronizado em sprint futura.

**Concorrentes especializados por tópico:**
- Visão 360° / timeline: HubSpot, Salesforce
- Pipeline B2B: Pipedrive, Salesforce
- Segmentação dinâmica: RD Station CRM, HubSpot
- Kanban + WhatsApp nativo: Kommo
- LGPD compliance: HubSpot, RD Station
- Deduplicação: Salesforce (regras avançadas), HubSpot

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções especiais deste HUB (acrescentar ao artefato quando aplicável):**
- **Modelo de cliente único:** como concorrente lida com PF/PJ, multi-loja (cliente compartilhado vs por tenant).
- **LGPD compliance:** como concorrente exporta, anonimiza, deleta — com retenção legal preservada.
- **Pipeline:** estágios, automações por estágio, integração com vendas.
- **Cross-HUB:** sinalizar dependência com WhatsApp (conversa no timeline), Marketing IA (segmentação), Financeiro (crédito).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **CRM é HUB mais lido e menos escrito** do ERP — benchmark deve avaliar **velocidade de consulta** e **eficiência de filtro** (não só features).
- **HubSpot/Salesforce** = teto enterprise; usar como referência de "para onde vamos quando crescer", não copiar 1:1.
- **Kommo** = referência forte de **integração com WhatsApp nativa** — útil quando sprint cruza WhatsApp.
- **RD Station CRM** = referência mais próxima do mercado brasileiro SMB.
- **Pipedrive** = melhor pipeline visual simples — útil para Fase 4 B2B.
- **LGPD** sempre tem seção dedicada quando `sprint_topic` envolve dados pessoais.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve "cliente cross-loja" | registrar no artefato: exige ADR (decisão pendente em BLOCKERS BL-04) |
| Concorrente enterprise (Salesforce/HubSpot) tem features inviáveis para SMB | filtra ou marca como "referência de teto, não meta" |
| Tópico cruza com WhatsApp (conversa no timeline) | sinalizar dependência: WhatsApp Fase 3 (inbox real) |
| Tópico envolve deleção LGPD | exige nota sobre integridade referencial (NF não pode ser deletada) |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: CRM-S-001
skill: SKILL_BENCHMARK_CRM
modo: SAFE
input:
  sprint_topic: "Tela 360° consolidada do cliente"
  concorrentes_alvo: [HubSpot, RD Station CRM, Kommo, Pipedrive]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: CRM-S-002
  skill: SKILL_BENCHMARK_CRM
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Exportação LGPD em 1 clique respeitando retenção legal de NF"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_CRM.md`](../../../roadmaps/ROADMAP_CRM.md)
- Blocker relacionado: BL-04 (decisão "cliente por loja vs por organização").
- Risco crítico: R-15 (LGPD delete vs integridade NF).
- Concorrentes default: ver §4.

---

## 11. Notas

- CRM tem **base sólida** (FK Venda→Cliente, crédito persistente atômico, importador defensivo). Benchmark foca em **inteligência relacional** (tags, 360°, deduplicação, gatilhos).
- Defesa multi-loja em 3 camadas (memória `project_importador_produtos_match_seguro`) é modelo replicável aqui — mas é arquitetura interna, não benchmark.
- **Kommo** merece atenção especial: cobre WhatsApp + CRM num só lugar — é o concorrente mais próximo do que OmniGestão promete entregar (omnichannel real).
- **Salesforce/HubSpot** podem inspirar campos customizáveis e LGPD; cuidado para não copiar complexidade desnecessária.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
