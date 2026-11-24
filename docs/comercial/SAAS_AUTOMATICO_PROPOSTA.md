# SaaS 100% automático — proposta separada (NÃO faz parte do piloto)

> **Substituída como fonte de verdade em 2026-11-23** por
> [`SAAS_AUTOMATICO_ROADMAP_MASTER.md`](SAAS_AUTOMATICO_ROADMAP_MASTER.md) (GOAL
> `OMNI-SAAS-AUTOMATICO-ARQUITETURA-ROADMAP-000`). Mantida como registro histórico; o
> mapeamento das fases S1–S7 para os GOALs SAAS-001A…006 está na §5 do roadmap.

GOAL `OMNI-SAAS-LANCAMENTO-COMERCIAL-PILOTO-001` · 2026-11-22 · sobre `main` `8286a4a`.

O piloto pago roda com provisionamento **assistido** e cobrança **manual**. Este documento
descreve o que falta para o cliente entrar, testar, assinar e ser cobrado sem intervenção humana.
Nada aqui foi implementado; tudo exige autorização de schema e de cobrança.

## 1. Por que a estrutura atual de assinatura não serve

| Estrutura existente | Problema |
|---|---|
| `AdminUser.stripeCustomerId / stripeSubscriptionId / subscriptionStatus / planName` | Assinatura **por usuário**. A empresa paga, não a pessoa: trocar o ADMIN perderia a assinatura |
| `Store.subscriptionPlan` (`BRONZE…DIAMANTE`) | Plano **por loja**, catálogo antigo; não conhece Essencial/Comércio/Comércio Plus |
| `app/api/billing/checkout` | `trial_period_days: 14` fixo, exige cartão, só preços antigos |
| `app/api/webhooks/stripe` | assina e verifica, mas sem idempotência por `event.id` |
| Não existe "empresa" | uma rede de 2 lojas = 2 `Store` soltas, sem dono comum |

Por isso o piloto **não** liga bloqueio comercial em cima dessa estrutura.

## 2. Modelo proposto (migration aditiva, prefixo novo)

```
Organization   id, nome, documento (CNPJ/CPF), criadoEm, status (trial|active|past_due|suspended|canceled)
OrganizationMember  organizationId, adminUserId, papel (OWNER|BILLING|MEMBER)
Store.organizationId  String?  (NULL = lojas atuais, comportamento inalterado)
Subscription   organizationId @unique, plano (essencial|comercio|comercio_plus), status,
               provedor, provedorCustomerId, provedorSubscriptionId, inicioEm, fimTesteEm,
               periodoAtualFim, canceladoEm
BillingEvent   provedor, eventId @unique, tipo, payload, processadoEm   ← idempotência
TrialGrant     organizationId @unique, email normalizado @unique, documento @unique?, criadoEm  ← 1 teste por pessoa/empresa
```

- Lojas atuais (RAFACELL, loja-2, pilotos) ficam com `organizationId = NULL` → nenhuma mudança.
- Pilotos manuais migram depois, um a um, com autorização.

## 3. Fluxos

1. **Cadastro self-service** → cria `Organization` + `Store` + ADMIN (reusa `provisionClient`) +
   `TrialGrant`. Antiabuso: email verificado, 1 teste por email/documento, limite por origem
   (já existe no pedido comercial), captcha do provedor.
2. **Teste grátis controlado:** `fimTesteEm` definido no servidor (prazo = decisão comercial).
   Ao vencer: só leitura + exportação; nada é apagado.
3. **Assinatura:** checkout do provedor por **organização**; preços por variável de ambiente;
   nada ativa sem `BillingEvent` confirmado.
4. **Cobrança e inadimplência:** webhook idempotente → `past_due` → aviso no AppShell (slot
   `topNotice`) → após carência, `suspended` = só leitura. **Nunca** bloquear o Caixa no meio do
   expediente: a restrição vale a partir da próxima abertura de caixa.
5. **Limite de usuários por plano:** aplicado no servidor (ver §7 de `GESTAO_LOJAS_OPERACAO_PILOTO.md`).
6. **Cancelamento e exclusão:** exportação + retenção (ver `PRIVACIDADE_TERMOS_PROPOSTA_PILOTO.md` §3).

## 4. Fases sugeridas (cada uma é um PR)

| Fase | Entrega | Gate |
|---|---|---|
| S1 | `Organization` + `Store.organizationId` + leitura (sem efeito) | autorização de schema |
| S2 | Limite de usuários por plano (servidor + tela) | S1 + preços aprovados |
| S3 | `Subscription` + `BillingEvent` + webhook idempotente em modo teste do provedor | escolha do provedor (Stripe/Pix/boleto) |
| S4 | Teste grátis controlado + só-leitura ao vencer | prazo do teste aprovado |
| S5 | Cadastro self-service com verificação de email e antiabuso | S3 + S4 + termos publicados |
| S6 | Inadimplência (aviso → só leitura) + reativação | régua de cobrança aprovada |
| S7 | Exportação e exclusão de dados por organização | política de retenção aprovada |

## 5. Decisões do proprietário antes de começar

Provedor de cobrança (Stripe com Pix/boleto ou gateway nacional), prazo do teste grátis, exigir
ou não cartão no teste, régua de inadimplência, preços e limites por plano, quem é o "OWNER"
quando a empresa tem várias lojas.
