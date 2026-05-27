---
# IDENTITY
skill_id: SKILL_BENCHMARK_MARKETING_IA
version: v1
status: draft
category: 1
size: S
hub: marketing_ia

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
roadmap: docs/roadmaps/ROADMAP_MARKETING_IA.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_BENCHMARK_MARKETING_IA

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de ferramentas de Marketing IA e plataformas de campanha para alimentar uma proposta de sprint do HUB Marketing IA. Foco em **geração de criativo, brand kit, atribuição, calendário e integração com canais**.

---

## 1. Propósito

Pesquisar 3–5 concorrentes (ferramentas de copy IA + plataformas de criativo + plataformas de campanha), extrair **geração de campanha**, **brand kit**, **copy por canal**, **imagem/vídeo**, **atribuição cupom→venda**, **integração CRM + WhatsApp**, **biblioteca de assets**, **calendário de campanhas**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide custo de crédito IA (modelo de billing).
- Não cobre orquestração WhatsApp (cruza — usar SKILL_BENCHMARK_WHATSAPP).
- Não cobre segmentação CRM (cruza — usar SKILL_BENCHMARK_CRM).

---

## 2. Quando usar

- Sprint com **orquestrador de campanha** (P0 — segmento + criativo + canal + agendamento).
- Sprint com **atribuição cupom→venda** (P0 — vincula campanha à receita).
- Sprint com **régua aniversário / recompra / inativos** (P1).
- Sprint com **criativos IA integrados** (copy + imagem por canal).
- Sprint com **brand kit** (logo, paleta, fontes — aplicados aos criativos).
- Sprint com **ROI dashboard** (R$ gerado / campanha).
- Sprint com **A/B teste** (2+ variações, medida conversão).
- Sprint com **calendário de campanhas** (agendamento, conflito, dedup).
- Sprint com **multi-canal** (WhatsApp + e-mail + SMS).

## 3. Quando NÃO usar

- Sprint com geração de imagem isolada (já existe `GeradorImagensView.tsx`) → enhancement não exige benchmark.
- Ajuste em `credit-costs.ts` → técnico, sem benchmark.
- Sprint focada só em integração WhatsApp → usar SKILL_BENCHMARK_WHATSAPP.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Orquestrador de campanha + atribuição cupom→venda"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["Jasper", "Mailchimp AI"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `MKTIA-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- Jasper
- Copy.ai
- Canva Magic
- CapCut Commerce
- Mailchimp AI
- Meta Ads Library

> Nota: lista atualizada vs `ROADMAP_MARKETING_IA §3` original (RD Station Marketing, Mailchimp, ActiveCampaign, Maddie/Take Blip, Bling Marketing). Roadmap será sincronizado em sprint futura. Original cobria orquestração/régua; nova cobre criativos IA + biblioteca de campanhas.

**Concorrentes especializados por tópico:**
- Copy IA por canal: Jasper, Copy.ai
- Brand kit + criativos visuais: Canva Magic, CapCut Commerce
- Calendário + orquestração: Mailchimp AI, Hootsuite
- A/B teste estruturado: Mailchimp AI, RD Station Marketing
- Atribuição multi-touch: Meta Ads Library (referência), RD Station Marketing
- Biblioteca de assets: Canva, Figma, Frontify
- Campanha WhatsApp: incluir SKILL_BENCHMARK_WHATSAPP no escopo cruzado

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções especiais deste HUB (acrescentar ao artefato quando aplicável):**
- **Geração de criativo:** prompts, templates, brand kit aplicado.
- **Atribuição:** janela de atribuição (7d, 14d, 30d), modelo (first-touch, last-touch, multi-touch).
- **Calendário:** UX, conflito entre campanhas, dedup automático por cliente.
- **Custo IA:** custo por geração (token, imagem, vídeo) — vincular ao modelo `credit-costs` interno.
- **Cross-HUB:** sinalizar dependência com CRM (segmento dinâmico), WhatsApp (canal), Financeiro (custo + receita), BI (ROI dashboard).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Cruza fortemente com WhatsApp e CRM** — toda recomendação deve verificar se feature já foi benchmarkada em HUB cruzado (evitar duplicidade).
- **Custo IA** é dimensão importante — toda recomendação que gera muitos tokens/imagens deve sugerir limite por loja.
- **Brand kit** é gap atual do OmniGestão — benchmark deve sempre cobrir quando sprint envolve criativos.
- **Atribuição** é P0 do roadmap — toda sprint envolvendo campanha deve cobrir como medir conversão.
- **Jasper/Copy.ai** = teto de copy IA; usar como referência mas não copiar 1:1 (custo proibitivo para SMB sem ajuste).
- **Canva Magic / CapCut Commerce** = referência de UX para criativos visuais sem designer.
- **Mailchimp AI** = referência mais próxima do que SMB consegue operar sozinho.
- **Meta Ads Library** é fonte primária para entender o que está rodando em campanhas reais (referência, não concorrente).

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve disparo em massa sem opt-out | bloqueia recomendação; remete para WhatsApp Fase 2 + R-01 |
| Custo de IA do concorrente é proibitivo para SMB | marca no artefato "modelo de custo não-replicável; precisa de adaptação" |
| Tópico cruza com WhatsApp (canal de campanha) | dependência: WhatsApp Fase 2 (orquestrador massa) |
| Tópico cruza com CRM (segmentação) | dependência: CRM Fase 2 (tags + segmentos dinâmicos) |
| Tópico cruza com PDV (atribuição cupom→venda) | dependência: PDV cupom validado |
| Concorrente é generalista (Canva, Jasper) sem cobrir e-commerce SMB | marca: "referência de capacidade, não de UX SMB" |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: MKTIA-S-001
skill: SKILL_BENCHMARK_MARKETING_IA
modo: SAFE
input:
  sprint_topic: "Orquestrador de campanha + atribuição cupom→venda no PDV"
  concorrentes_alvo: [Mailchimp AI, RD Station Marketing, Jasper]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: MKTIA-S-002
  skill: SKILL_BENCHMARK_MARKETING_IA
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Geração de criativo (copy + imagem) por canal com brand kit"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_MARKETING_IA.md`](../../../roadmaps/ROADMAP_MARKETING_IA.md)
- Blockers relacionados: WhatsApp Fase 2 (orquestrador), CRM Fase 2 (segmentação), PDV cupom validado.
- Risco crítico: R-01 (banimento Meta via marketing sem opt-out).
- Concorrentes default: ver §4.
- Código existente: `components/ia-mestre/views/GeradorImagensView.tsx`, `src/lib/ai/credit-costs.ts`, `lib/ia-mestre/{credit-costs,debit-turn-credits}.ts`.

---

## 11. Notas

- Marketing IA tem **gerador de imagens funcional** e **modelo de crédito modelado**, mas **nenhum orquestrador** — é o "HUB de alto ROI quando pronto", segundo o roadmap.
- **Dependências fortes:** WhatsApp Fase 2 (canal) + CRM Fase 2 (segmentação) + PDV cupom — sprint de Marketing IA mais cedo possível depende destes prerrequisitos.
- **Jasper/Copy.ai** são referência de **capacidade de copy IA**, não de UX direta — o operador SMB não vai usar esses; vai usar o OmniGestão chamando esses por baixo.
- **Mailchimp AI** é a referência mais próxima do "operável por SMB sozinho".
- **Brand kit** ainda não existe no OmniGestão — gap importante a documentar quando sprint envolver criativos.
- Cuidado especial: benchmark **não pode sugerir** disparo em massa antes de opt-out persistente (R-01 banimento Meta).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
