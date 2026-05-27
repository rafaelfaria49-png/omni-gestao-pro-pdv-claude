---
# IDENTITY
skill_id: SKILL_AUDIT_WHATSAPP
version: v1
status: draft
category: 1
size: S
hub: whatsapp

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
    - "docs/audits/AUDITORIA_WHATSAPP_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_WHATSAPP.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_AUDIT_WHATSAPP

> Skill de auditoria do **estado real** do HUB WhatsApp. **Auditoria conservadora — risco de banimento Meta é existencial.**
> Foco em **compliance Meta, opt-out persistente, qualidade da conta, banimento, templates HSM, fallback humano, automação insegura, spam, retries, fila, status de entrega, separação por tenant**.

---

## 1. Propósito

Auditar WhatsApp de forma técnica e defensiva: lê código (`lib/whatsapp/**`, `app/api/whatsapp/**`, `app/api/webhooks/whatsapp/**`, `components/dashboard/whatsapp/**`), governança, memórias e auditorias anteriores; gera `AUDITORIA_WHATSAPP_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_WHATSAPP:**
- BENCHMARK olha mercado (Zenvia, Kommo, Intercom, Meta docs).
- AUDIT olha estado real interno (HMAC válido, opt-out persistido, roteamento `storeId`, integridade webhook).

**O que ela NÃO faz:**
- Não altera código, não muda templates Meta, não desativa conta.
- Não decide BSP (ADR pendente — BL-11).

---

## 2. Quando usar

### 2.1 Standalone
- A cada **trimestre** (saúde geral + compliance Meta).
- Após **mudança em webhook** ou em envio.
- Antes de **liberar marketing em massa** (auditoria preventiva obrigatória — R-01 banimento).
- Após **incidente Meta** (queda de qualidade da conta, banimento parcial).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do WhatsApp.

---

## 3. Quando NÃO usar

- Para mapear features novas → benchmark + ADR.
- Para "ver se inbox está bonito" → escopo UX, não auditoria conservadora.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `seguranca` (HMAC, opt-out), `dados` (drift mensagens), `forense` (pós-incidente Meta), `saude_geral` |
| `scope_paths` | string[] | não | `["lib/whatsapp/**", "app/api/webhooks/whatsapp/**"]` |
| `ticket_id` | string | não | `WHATSAPP-S-001` |
| `sprint_topic` | string | não | `"opt-out persistente"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_WHATSAPP_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (Meta Compliance):**
- Score atual de qualidade da conta (se observável).
- Lista de templates HSM cadastrados + status (approved/rejected/pending).
- Taxa de mensagens com opt-out respeitado (se aplicável).
- Limites técnicos vs tier atual (rate limit, throttling).
- Última verificação de assinatura HMAC.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco WhatsApp (auditoria conservadora)

A skill audita obrigatoriamente as **13 dimensões críticas**:

1. **Compliance Meta** — webhook usa HMAC válido (`WHATSAPP_APP_SECRET`)? rejeição de payload inválido?
2. **Opt-out persistente** — modelo `OptOut` existe? checagem em todo envio? (gap atual P0).
3. **Qualidade da conta** — monitor existe? alerta humano quando cai? (gap atual P1).
4. **Risco de banimento** — práticas que aumentam risco identificadas? mitigação ativa?
5. **Template HSM misuse** — envio fora da janela 24h sem template aprovado? template usado em contexto errado?
6. **Fallback humano** — Omni Agent não resolveu → vai para inbox real? roteamento existe?
7. **Automação insegura** — disparo automático sem dry-run? sem aprovação humana?
8. **Spam risk** — mesma mensagem para N clientes sem cooldown? sem dedup?
9. **Retries** — webhook fora do ar → Meta reenvia até 7d; fila local processa idempotente?
10. **Fila** — orquestrador de massa existe? throttling configurado? dead-letter queue?
11. **Status de entrega** — `message_deliveries` + `message_reads` processados? armazenados?
12. **Auditoria de mensagens** — toda mensagem (in/out) registrada com `storeId`, conversa, timestamp?
13. **Separação por tenant** — roteamento por `phone_number_id` ou `storeId` correto? `WHATSAPP_WEBHOOK_STORE_ID` fixo aparece em multi-loja?

**Auditorias prévias:** nenhuma dedicada ainda.

**Overlap explícito** registrado no artefato:
- **WhatsApp ↔ CRM** (histórico no timeline 360°, opt-out por cliente).
- **WhatsApp ↔ Marketing IA** (canal de campanha).
- **WhatsApp ↔ Omni Agent** (canal de comando).
- **WhatsApp ↔ Multi-loja** (roteamento `phone_number_id`).

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Webhook recebe payload sem HMAC válido sem rejeitar | finding **P0** (segurança — mensagens forjadas possíveis) |
| Envio em massa sem checar opt-out | finding **P0** (risco banimento Meta — R-01) |
| Mesma mensagem para mesma conversa em < 5min sem dedup | finding P1 → upgrade P0 (spam = risco banimento) |
| Template usado fora da janela 24h sem ser HSM aprovado | finding **P0** (Meta rejeita ou pune) |
| `WHATSAPP_WEBHOOK_STORE_ID` em uso quando há > 1 loja com WhatsApp | finding **P0** (vazamento entre tenants) |
| Mensagens sem `storeId` no banco | finding **P0** (auditoria + vazamento multi-loja) |
| Sem monitor de qualidade da conta | finding P1 (gap conhecido) |
| Sem dead-letter queue para webhook falho | finding P1 (perda silenciosa) |
| Disparo automático sem dry-run em produção | finding **P0** (automação insegura) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de compliance Meta
```yaml
ticket_id: null
skill: SKILL_AUDIT_WHATSAPP
modo: SAFE
input:
  audit_type: seguranca
  scope_paths: ["lib/whatsapp/**", "app/api/webhooks/whatsapp/**"]
```

### 9.2 OVERNIGHT — Auditoria preventiva pré-marketing massa
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_WHATSAPP
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: saude_geral
    sprint_topic: "pré-liberação marketing em massa — checar opt-out"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_WHATSAPP.md`](../../../roadmaps/ROADMAP_WHATSAPP.md)
- Blockers: BL-02 (templates Meta), BL-11 (BSP).
- Riscos críticos: **R-01 (banimento Meta — categoria/impacto crítico)**, R-14 (webhook fora do ar).
- Dívida relacionada: DT-07 (webhook por env fixo).
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- **WhatsApp é HUB sensível operacionalmente** — auditoria conservadora; preferir falso-positivo a falso-negativo.
- **Opt-out persistente** é P0 absoluto — qualquer envio em massa sem isso é incidente potencial.
- **HMAC válido** é segurança crítica — auditoria sempre verifica.
- **Multi-loja em WhatsApp** é onde DT-07 mais machuca — virá P0 imediato quando 2ª loja conectar.
- Próximas auditorias (v2+) compararão evolução de findings, especialmente opt-out e qualidade da conta.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
