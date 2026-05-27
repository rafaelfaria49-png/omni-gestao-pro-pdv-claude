---
title: Monetização — OmniGestão Pro
status: vivo
owner: produto + Opus (estratégia)
last_update: 2026-05-27
---

# 💵 Monetização — OmniGestão Pro

> **Como ganhamos dinheiro.** Planos, gates, créditos IA, gateway de pagamento, métricas SaaS.
> **Estratégia geral:** [`MASTER_PLAN.md`](./MASTER_PLAN.md). **Visão de produto:** [`PRODUCT_VISION.md`](./PRODUCT_VISION.md).

---

## 1. Modelo de receita

**SaaS B2B por assinatura mensal/anual** com:
- **Plano** (gate de features) — Bronze, Prata, Ouro, Diamante.
- **Créditos de IA** (consumíveis) — execução Omni Agent, gerador de imagens, copy IA.
- **Add-ons futuros** — número WhatsApp adicional, NFC-e por volume, marketplace extra.

**Gateway:** Stripe (configurado — `STRIPE_PRICE_*` em `CLAUDE.md`).

---

## 2. Planos (referência atual)

| Plano | Posicionamento | Lojas | Usuários | WhatsApp | Créditos IA/mês | Marketplace | NFC-e/NFS-e |
|---|---|---|---|---|---|---|---|
| **Bronze** | Entrada (MEI/loja única) | 1 | 2 | 1 número | baixo | 0 | uso (provedor cobra à parte) |
| **Prata** | Crescente (até 3 lojas) | 3 | 5 | 1 número | médio | 1 canal | incluso até X/mês |
| **Ouro** | Multi-loja (até 10 lojas) | 10 | 15 | 3 números | alto | 4 canais | incluso até Y/mês |
| **Diamante** | Rede (sem limite) | ilimitado | ilimitado | ilimitado | ilimitado* | todos | incluso |

\* Diamante tem teto alto + alertas; não é literalmente infinito.

> **Valores R$** definidos em produção (Stripe price IDs); revisar trimestralmente.

### 2.1 Cobrança mensal vs anual
- **Anual:** desconto sugerido **~20%** (padrão SaaS).
- Stripe configurado para ambos: `STRIPE_PRICE_<PLANO>_MONTHLY` e `STRIPE_PRICE_<PLANO>_YEARLY`.

---

## 3. Sistema de créditos IA

> Modelo já parcialmente implementado: `src/lib/ai/credit-costs.ts`, `lib/ia-mestre/credit-costs.ts`, `lib/ia-mestre/debit-turn-credits.ts`.

### 3.1 O que consome crédito
- **Omni Agent** — execução com LLM (não as regex determinísticas).
- **Gerador de imagens** — por imagem gerada.
- **Copy de marketing IA** — por geração de texto.
- **Resumo de conversa** (futuro) — por resumo.

### 3.2 Conversão
- Crédito = unidade interna; cada feature tem custo declarado em `credit-costs`.
- Pacote do plano dá X créditos/mês.
- Cliente esgota → compra pacote extra ou aguarda mês.

### 3.3 Governança (vai para Omni Agent Fase 2)
- **Soft cap:** alerta a 80% do consumo mensal.
- **Hard cap:** bloqueio a 100% (a implementar — BL-05).
- **Audit log** por execução (a expandir).

### 3.4 Pacotes extras
- **+1.000 créditos** — avulso.
- **Boost mensal** — recorrente.

---

## 4. Gates por plano (feature flags)

> Implementação via `plan-guard` (referência em `CLAUDE.md`).

| Feature | Bronze | Prata | Ouro | Diamante |
|---|---|---|---|---|
| PDV (1 perfil) | ✅ | ✅ | ✅ | ✅ |
| PDV (4 perfis + Black Edition) | — | ✅ | ✅ | ✅ |
| Multi-terminais | — | ✅ | ✅ | ✅ |
| OS | ✅ | ✅ | ✅ | ✅ |
| Financeiro (Receber + Pagar) | ✅ | ✅ | ✅ | ✅ |
| Conciliação bancária | — | — | ✅ | ✅ |
| WhatsApp (1 número) | ✅ | ✅ | ✅ | ✅ |
| WhatsApp marketing massa | — | ✅ | ✅ | ✅ |
| Marketplace (1 canal) | — | ✅ | ✅ | ✅ |
| Marketplace (multi) | — | — | ✅ | ✅ |
| Omni Agent | — | (limite baixo) | ✅ | ✅ |
| BI básico | ✅ | ✅ | ✅ | ✅ |
| BI matriz comparativo | — | — | — | ✅ |
| API pública | — | — | ✅ | ✅ |
| Suporte prioritário | — | — | ✅ | ✅ |
| Customização branding | — | — | — | ✅ |

> Tabela é referência; gate exato vive em `plan-guard` (código).

---

## 5. Trial e onboarding pago

- **Trial:** 14 dias do plano **Prata** com todos os recursos liberados (limites do Prata).
- **Sem cartão:** colher cartão só ao fim do trial.
- **Onboarding self-service:** < 30 min (princípio de produto).
- **Migração assistida:** ofertada como serviço pago para clientes > Prata (não incluso no plano).

---

## 6. Métricas SaaS

| Métrica | O que mede | Meta de longo prazo |
|---|---|---|
| **MRR** (Monthly Recurring Revenue) | Receita recorrente | crescimento mês a mês |
| **ARPA** (Avg Revenue Per Account) | Mix de plano | tendência ascendente |
| **Churn mensal** | Saúde do produto | **< 2%/mês** |
| **LTV/CAC** | Eficiência de aquisição | **> 3x** |
| **Trial → Pago** | Eficácia do trial | **> 25%** |
| **Upgrade Bronze→Prata** | Funil de upsell | **> 15%/ano** |
| **Consumo médio de créditos vs pacote** | Saúde do modelo IA | **70–90%** (não estourar, não desperdiçar) |
| **NPS** | Satisfação | **> 50** |

---

## 7. Add-ons e expansão de receita futura

- **Número WhatsApp adicional** — R$/mês por número extra (BSP custom).
- **NFC-e/NFS-e por volume** — pacote acima do incluso (provedor cobra, repassamos).
- **Marketplace adicional** — canal extra (Ouro = 4, +1 = upsell).
- **Conector contábil** (Domínio/Alterdata) — single-tenant add-on.
- **API pública premium** — quotas + suporte API.
- **Marketplace App Store** — terceiros publicam apps no painel; rev-share.

---

## 8. Riscos de monetização

| Risco | Mitigação |
|---|---|
| **Estouro de crédito IA sem aviso** | Hard cap por loja + alerta soft (Omni Agent Fase 2) |
| **Cliente cancela após esgotar crédito** | Pacotes extras visíveis dentro do produto |
| **Churn por bug em produção** | Auditoria + sprint de estabilização contínua |
| **Cliente Diamante não rentável** (uso > custo) | Monitorar custo Stripe/OpenAI por cliente, ajustar ou conversar |
| **Concorrente lança grátis** | Defender com diferencial (Omni Agent, omnichannel real, multi-loja) |
| **Provedor de IA aumenta preço** | Reprecificar pacote IA com aviso de 30 dias |
| **Stripe rejeita cartão** silenciosamente | Webhook `invoice.payment_failed` aciona régua de retenção |

---

## 9. Política de descontos

- **Anual:** ~20% padrão.
- **Promocional de lançamento:** discutir com humano antes de aplicar (não automático).
- **Cliente referenciado:** crédito para quem indica + desconto para quem chega (Fase 4 do CRM).
- **NGO/educação:** sob avaliação caso a caso.
- **Sem desconto" silencioso" no Stripe** — todo desconto tem nome, motivo, prazo.

---

## 10. Integração com Stripe (operação)

> Detalhes em `CLAUDE.md` (env vars + webhooks).

**Webhook endpoint:** `https://<dominio>/api/webhooks/stripe`

**Eventos consumidos:**
- `checkout.session.completed` — ativação de assinatura
- `customer.subscription.updated` — mudança de plano
- `customer.subscription.deleted` — cancelamento
- `invoice.paid` — registro de pagamento
- `invoice.payment_failed` — disparar régua de retenção

**Garantias:**
- Webhook **assinado** (`STRIPE_WEBHOOK_SECRET`) verificado.
- Idempotência por `event.id`.
- Replay seguro.

---

## 11. Métricas que reportamos ao humano (dashboard interno)

- MRR total + por plano
- ARPA por plano
- Churn mensal + por plano
- Trial → Pago (taxa semanal)
- Consumo de créditos IA por cliente (top 20 + médios + esgotando)
- Tickets / cliente / mês
- LTV estimado por plano

---

## 12. Como esta política evolui

- **Revisão trimestral** de preços e gates.
- Mudança de preço → comunicação **30 dias antes** + ADR.
- Novo gate → ADR + atualização da tabela §4.
- `last_update` obrigatório.
