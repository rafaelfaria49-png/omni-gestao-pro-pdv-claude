---
# IDENTITY
skill_id: SKILL_BENCHMARK_WHATSAPP
version: v1
status: draft
category: 1
size: S
hub: whatsapp

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
roadmap: docs/roadmaps/ROADMAP_WHATSAPP.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_BENCHMARK_WHATSAPP

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de concorrentes de WhatsApp para alimentar uma proposta de sprint do HUB WhatsApp. **Compliance Meta é dimensão obrigatória.**

---

## 1. Propósito

Pesquisar 3–5 concorrentes (BSPs, plataformas de inbox, ferramentas de automação) + **Meta Cloud API docs oficiais**, extrair UX/fluxo/edge cases/arquitetura/riscos/diferenciais. Toda saída cobre obrigatoriamente: **Meta compliance, opt-out, qualidade da conta, risco de banimento, templates HSM**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide BSP (isso é ADR — BL-11 pendente).
- Não cobre marketing IA (mesmo cruzando — usar SKILL_BENCHMARK_MARKETING_IA).
- Não cobre executores Omni Agent (separado).

---

## 2. Quando usar

- Sprint com **opt-out persistente** (P0).
- Sprint com **orquestrador de marketing em massa** (P0).
- Sprint com **templates HSM Meta** (cadastro/sincronização).
- Sprint com **inbox multi-atendente** + roteamento.
- Sprint com **histórico no CRM** (cruza com CRM Fase 2).
- Sprint com **monitor de qualidade** da conta.
- Sprint com **botões interativos / flows / mídia end-to-end**.
- Sprint com **fallback humano** quando Omni Agent não resolve.

## 3. Quando NÃO usar

- Bugfix no webhook canônico (HMAC já validado) → técnico, sem benchmark.
- Ajuste em roteamento por `storeId` (convenção já existe) → sem benchmark.
- Mock removal em inbox UI → não exige benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Opt-out persistente + monitor qualidade da conta"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["Zenvia", "Kommo"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `WHATSAPP-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- Zenvia
- Kommo
- Manychat
- GoBots
- Intercom
- **WhatsApp Cloud API / Meta docs oficiais** (sempre incluso — não conta no cap de 5)

> Nota: lista atualizada vs `ROADMAP_WHATSAPP §3` original (Wati/Take Blip, Twilio, Z-API/Evolution, Octadesk, GupShup). Roadmap será sincronizado em sprint futura.

**Concorrentes especializados por tópico:**
- Inbox multi-atendente: Kommo, Intercom, Zendesk
- Marketing em massa + compliance: GoBots, Zenvia, GupShup
- Bots e automações: Manychat, GoBots, Intercom
- Templates HSM e qualidade da conta: **Meta docs oficiais** (sempre primário)
- Fallback humano: Intercom, Zendesk

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes (Meta docs não conta).

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções OBRIGATÓRIAS deste HUB (sempre acrescentar ao artefato):**
- **Meta compliance:** como concorrente trata opt-out, templates HSM, taxa de qualidade. Sempre baseado em Meta docs.
- **Risco de banimento:** que prática do concorrente reduz/aumenta risco.
- **Limites técnicos:** rate limit, tier de envio, throttling.
- **Fallback humano:** como concorrente trata "bot não resolve → vai para operador".

**Seções condicionais:**
- **Inbox multi-atendente:** se sprint cobre.
- **Templates de marketing:** se sprint cobre massa.
- **Mídia (imagem/áudio/doc):** se sprint cobre.
- **Botões interativos / flows:** se sprint cobre.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Meta docs oficiais sempre incluído** como referência primária — não conta no cap de 5 concorrentes.
- **Compliance é dimensão não-negociável** — toda saída tem seção dedicada, mesmo se `sprint_topic` é técnico.
- **Risco R-01 (banimento Meta)** é referência permanente — toda recomendação deve avaliar impacto sobre qualidade da conta.
- **Z-API/Evolution não fazem parte da default** — são fallback não-oficial; só entram se `sprint_topic` envolve mitigação de queda Meta.
- **Kommo destacado**: cobre WhatsApp + CRM nativo; cruzamento natural com SKILL_BENCHMARK_CRM.
- **Intercom destacado**: referência para fallback humano e roteamento sofisticado.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve massa sem opt-out | bloqueia o artefato; marca "exige opt-out antes de qualquer envio (R-01)" |
| Concorrente usa Z-API/Evolution como principal | marca como "abordagem não-oficial, risco de banimento" no artefato |
| Meta docs inacessíveis | retry; depois marca limitação no artefato e usa última versão conhecida |
| Tópico cruza com CRM (histórico de conversa) | sinaliza dependência: CRM Fase 2 |
| Tópico cruza com Marketing IA (campanha em massa) | sinaliza dependência: Marketing IA Fase 1 |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: WHATSAPP-S-001
skill: SKILL_BENCHMARK_WHATSAPP
modo: SAFE
input:
  sprint_topic: "Opt-out persistente + monitor de qualidade da conta Meta"
  concorrentes_alvo: [Zenvia, Kommo, GoBots]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: WHATSAPP-S-002
  skill: SKILL_BENCHMARK_WHATSAPP
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Inbox multi-atendente com roteamento por agente"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_WHATSAPP.md`](../../../roadmaps/ROADMAP_WHATSAPP.md)
- Blocker relacionado: BL-11 (decisão de BSP).
- Risco crítico: R-01 (banimento Meta), R-14 (webhook fora do ar).
- Concorrentes default: ver §4.
- Meta Cloud API docs oficiais (sempre incluso).

---

## 11. Notas

- WhatsApp é **eixo de relacionamento** do ERP — gap em opt-out + qualidade é risco existencial.
- **Meta compliance** é o filtro: qualquer feature que aumenta risco de banimento deve ser rejeitada antes de implementar.
- **Kommo** é forte por integrar CRM + WhatsApp num só motor — modelo que OmniGestão almeja entregar.
- **Intercom** é teto de fallback humano e roteamento — referência de UX premium.
- **Z-API/Evolution** existem como fallback técnico (já documentado em `lib/whatsapp/`), mas não entram em decisão de produto sem ADR explícito.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
