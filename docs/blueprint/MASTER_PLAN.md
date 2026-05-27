---
title: Master Plan — OmniGestão Pro
status: vivo
owner: produto + Opus (estratégia)
last_update: 2026-05-27
---

# 🧭 Master Plan — OmniGestão Pro

> **Visão única e consolidada do projeto.** Quem precisa entender "o que estamos construindo, em que ordem, com qual lógica" — começa aqui.
> **Detalhes táticos:** roadmaps por HUB. **Detalhes operacionais:** sprints. **Detalhes históricos:** `CURRENT_STATUS.md`.

---

## 1. Pitch em 3 linhas

OmniGestão Pro é um **ERP/SaaS premium para SMB brasileiro** com **operação omnichannel real**: PDV, OS, Estoque, Financeiro, CRM, WhatsApp e Marketplace operam como **um sistema único** — não como módulos costurados. A camada de IA (Omni Agent + Marketing IA) **executa ações reais** no ERP via comandos, não apenas conversa. O diferencial é **qualidade enterprise sem complexidade enterprise**: SMB consegue operar como rede grande sem time de TI.

---

## 2. Por que existe (problema de fundo)

O SMB brasileiro escolhe entre:
- **ERPs baratos** (Bling, Tiny, Conta Azul) — funcionais mas com UX datada, IA superficial, integrações fracas.
- **ERPs enterprise** (SAP, Linx Microvix) — robustos mas caros, lentos e exigem consultor.
- **Soluções verticais** (assistência, varejo, alimentação) — bons no nicho, mas não integram com o resto.

**Gap:** ninguém entrega **operação de balcão fluida + omnichannel real + IA executora + auditoria enterprise** num pacote que SMB instala sozinho.

---

## 3. Os 11 HUBs (visão integrada)

```
            ┌─────────────────────────────────────────────────┐
            │  Camadas transversais (Onda 4)                  │
            │  • Omni Agent (executor por linguagem natural)  │
            │  • BI (leitura agregada)                        │
            │  • Multi-loja (isolamento + organização)        │
            └────────────────────┬────────────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │  Alcance (Onda 3)       │                         │
       │  • Marketplace          │                         │
       │  • Marketing IA         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │  Atendimento (Onda 2)   │                         │
       │  • OS (Operações)       │                         │
       │  • CRM                  │                         │
       │  • WhatsApp             │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │  Núcleo transacional (Onda 1)                     │
       │  • PDV                                            │
       │  • Estoque                                        │
       │  • Financeiro                                     │
       └───────────────────────────────────────────────────┘
```

**Princípio:** Ondas inferiores são pré-requisito das superiores. **Sem núcleo transacional confiável, IA não tem o que executar.**

---

## 4. Ondas e ordem de evolução

> Detalhe completo + matriz de paralelismo em [`docs/roadmaps/INDEX.md §3-4`](../roadmaps/INDEX.md).

| Onda | Por quê | HUBs | Marco de saída |
|---|---|---|---|
| **1 — Núcleo transacional** | Fluxo de dinheiro real | PDV, Estoque, Financeiro | Loja-piloto opera 100% real sem mocks |
| **2 — Atendimento** | Relacionamento com cliente | OS, CRM, WhatsApp | OS faturada → cliente notificado WhatsApp → histórico no CRM 360° |
| **3 — Alcance** | Expandir receita | Marketplace, Marketing IA | Vendas em N canais reconciliadas + campanhas com ROI medido |
| **4 — Camadas transversais** | Inteligência e escala | Omni Agent, BI, Multi-loja | Omni Agent operando, painel matriz consolidado, isolamento auditado |

---

## 5. Os 7 inegociáveis (resumo)

> Detalhe completo em [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).

1. **Pensar antes de codar** — entender e localizar antes de editar.
2. **Mudanças cirúrgicas** — alterar o mínimo necessário.
3. **Escopo fechado** — fazer só o pedido; problema fora vira relatório.
4. **Sem overengineering** — solução mais simples que satisfaz vence.
5. **Áreas protegidas** — auth, proxy, schema, core dos HUBs exigem autorização explícita.
6. **Nunca mocks enganosos** — ou é real, ou não vai pro banco.
7. **Multi-loja isolado** — `storeId` em toda query, sempre.

---

## 6. Estado atual (snapshot 2026-05-27)

> Overview vivo em [`CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md).

| Onda | Status |
|---|---|
| 1 — Núcleo transacional | 🟢 Backend maduro; UI Financeiro ainda mock |
| 2 — Atendimento | 🟡 OS maduro, CRM e WhatsApp com infra mas faltam features-chave |
| 3 — Alcance | 🟠 Marketing IA incipiente, Marketplace não iniciado |
| 4 — Transversais | 🟠 Omni Agent infra ok mas poucos executores, BI espalhado, Multi-loja com lacunas críticas |

**Bloqueios mais perigosos do projeto agora:**
- PDV Next sem persistência (DT-01, R-03)
- Fallback `loja-1` silencioso (DT-03, R-02 LGPD)
- Opt-out WhatsApp ausente (R-01 banimento Meta)
- Provedor fiscal não decidido (BL-01)
- Multi-depósito ausente bloqueia Marketplace (BL-12 → BL-07)

---

## 7. Princípios de produto

1. **Real ou nada** — funcionalidade que parece real e não é, fere mais que ausência.
2. **Cada centavo rastreável** — auditoria nativa via `payload.historico[]` + `localKey`.
3. **Operador é cliente** — UX de balcão > UX de painel.
4. **IA executa, humano decide** — Omni Agent age sob confirmação em destrutivo.
5. **SMB instala sozinho** — onboarding < 30 min, sem consultor.
6. **Multi-loja é regra, não plano caro** — desde a primeira loja.

---

## 8. Princípios de engenharia

1. **Adapter pattern** entre HUBs (OS→Estoque, OS→CR, Marketplace→Estoque).
2. **`payload` JSONB** como fonte da verdade rica; enum Prisma como view colapsada.
3. **`localKey`** como contrato de idempotência (`origem:storeId:id`).
4. **Server Actions** preferidas sobre API routes para mutações internas.
5. **Hubs Lovable isolados** com MemoryRouter; UI premium sem poluir tsc do core.
6. **`storeId` everywhere** — convenção e (em breve) lint customizado.
7. **Mudança em contrato** → ADR obrigatório.

---

## 9. Critérios de "release-ready" por HUB

| HUB | Critérios |
|---|---|
| PDV | Persistência 100% server-side · 4 PDVs convergentes · NFC-e em 1 clique · multi-terminais com lock por transação |
| OS | Rota legada decommissionada · NFS-e em 1 clique · WhatsApp automático por status · garantia rastreada |
| Financeiro | `financeiro-v2` real · boleto/PIX · conciliação OFX · plano de contas hierárquico configurável |
| Estoque | Multi-depósito · curva ABC · cost layering · NF-e XML como entrada · adapter Marketplace |
| CRM | Tela 360° · segmentação dinâmica · deduplicação assistida · LGPD export 1-clique |
| WhatsApp | Opt-out persistente · orquestrador massa · inbox multi-atendente · histórico no CRM · monitor qualidade |
| Marketplace | ML + Shopee + Amazon + Magalu fim-a-fim · conciliação automática · reprice · estoque virtual |
| Marketing IA | Orquestrador · atribuição cupom→venda · réguas (aniversário, recompra, inativo) · ROI dashboard |
| Omni Agent | 10+ executores reais · LLM governado · auditoria 100% · limite duro por loja |
| BI | Painel sem mocks · materialized views · alertas · cohorts · drill-down · multi-loja comparativo |
| Multi-loja | Zero `loja-1` silencioso · lint customizado · `Organizacao` modelada · permissão granular · painel matriz |

---

## 10. Metas de 12 meses

> Tradução do roadmap para o calendário (referência, não cronograma rígido).

- **Q3 2026** — Onda 1 fechada (loja-piloto sem mocks; PDV+Estoque+Financeiro 100% real).
- **Q4 2026** — Onda 2 fechada (OS+CRM+WhatsApp integrados; NFS-e operando).
- **Q1 2027** — Marketplace ML+Shopee fim-a-fim; Marketing IA com 3 réguas ativas.
- **Q2 2027** — Omni Agent com 10+ executores; BI com painel matriz; Multi-loja com lint + organização.

---

## 11. Relação com outros documentos

| Documento | Relação |
|---|---|
| `docs/blueprint/PRODUCT_VISION.md` | Visão de produto detalhada (proposta de valor, personas, mercado) |
| `docs/blueprint/MONETIZATION.md` | Plano de monetização, planos Stripe, créditos IA |
| `docs/governance/GOVERNANCA.md` | Regras inegociáveis |
| `docs/roadmaps/INDEX.md` | Roadmaps por HUB |
| `docs/architecture/INDEX.md` | Arquitetura técnica detalhada |
| `docs/ai/CURRENT_STATUS_OVERVIEW.md` | Estado real consolidado |

---

## 12. Como este documento evolui

- **Atualização trimestral** (ou ao virar de onda).
- Mudança grande → ADR + link aqui.
- `last_update` obrigatório no front matter.
- Imutabilidade não se aplica (este é o mapa, vai mudar com o terreno).
