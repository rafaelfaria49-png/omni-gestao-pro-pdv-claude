---
title: AUDITORIA_WHATSAPP_F-04 · Roteamento WhatsApp multi-loja (fechamento)
audit_id: WHATSAPP-F04
hub: whatsapp
tipo: seguranca
data: 2026-06-01
duracao_horas: null
auditor_humano: Rafael
auditor_ia: opus
escopo: Verificação de fechamento do F-04/DT-07 (CP1–CP4) antes do Gate #2 — roteamento inbound por phone_number_id, credencial outbound por loja, ausência de fallback loja-1
status: publicada
imutavel_apos: publicada
versao_anterior: AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01 (F-04)
---

# AUDITORIA_WHATSAPP_F-04 · Roteamento WhatsApp multi-loja (fechamento)

> **Status:** publicada
> **Tipo:** segurança (multi-tenant) · **Auditor:** Rafael + Opus
> **Modo:** somente leitura — esta auditoria valida a implementação CP1–CP4; não altera código.

---

## 1. Escopo

### 1.1 Dentro
- Implementação F-04/DT-07 da sprint `MULTI_LOJA-S-003` (CP1–CP4), pré-Gate #2.
- Inbound: `lib/whatsapp-meta-cloud-webhook.ts`, `app/api/whatsapp/webhook/route.ts`.
- Outbound + resolvers: `lib/whatsapp/whatsapp-service.ts`, `lib/whatsapp/store-credentials.ts`, `lib/whatsapp.ts`.
- Fluxos sem `phone_number_id`: `lib/whatsapp-webhook-ai.ts` (owner-AI), rotas `app/api/debug/whatsapp-*`.
- Status por loja: `app/actions/omni-agent.ts`.
- Schema: `prisma/schema.prisma` (model `WhatsAppPhoneNumber`) + `prisma/migrations/0010_whatsapp_phone_number/`.
- Guard estático: `lib/whatsapp/whatsapp-service-routing.test.ts`; decisão pura: `lib/whatsapp/store-credentials.test.ts`.

### 1.2 Fora
- Auditoria de dados em produção (linhas reais em `whatsapp_phone_numbers`) — depende de seed operacional pós-deploy.
- Opt-out persistente, orquestrador de massa, qualidade Meta — fora de F-04 (roadmap WhatsApp próprio).
- Verificação E2E contra a Graph API real (exige número/token reais).

### 1.3 Premissas
- Estado do projeto: `loja-1` server-side 100% (S-001/S-002 + DT-14) e client-side 100% (DT-13/15/16). F-04 era o **último vetor aberto**.
- Migração `0010` é aditiva; aplicação real via `npm run db:push` (Opção A) — pendente no deploy.

---

## 2. Metodologia

- Documentos lidos: `AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01` (F-04), `DIVIDA_TECNICA` (DT-07), `ADR-0003`, `ADR-0006` (este fechamento).
- Código inspecionado: os 11 arquivos modificados + 4 novos (credenciais, testes, migração, backfill).
- Ferramentas: `grep` (varredura de `webhookDefaultStoreId`, `WHATSAPP_WEBHOOK_STORE_ID`, `LEGACY_PRIMARY_STORE_ID`, `process.env.WHATSAPP_PHONE_NUMBER_ID`), `npx tsc --noEmit`, `npm run build`, `npx vitest run`.
- Cenários verificados por leitura: número mapeado/ativo; número não-mapeado; número ausente; loja sem credencial; 0/1/N lojas ativas para fluxo Evolution.

---

## 3. Severidade — convenção

| Severidade | Critério |
|---|---|
| **P0** | Operação para / dinheiro / vazamento / fiscal / multi-loja quebrado |
| **P1** | Risco alto — < 7 dias |
| **P2** | < 30 dias — UX, dívida relevante |
| **P3** | Melhoria |

> P1 envolvendo dinheiro/fiscal/multi-loja → P0 automático.

---

## 4. Findings (achados)

> Auditoria de **fechamento**: o defeito original (F-04 do baseline) está **resolvido**. Os findings abaixo são observações residuais e dívidas conscientes assumidas pela própria implementação. **Nenhum P0/P1 aberto.**

### F-01 · Roteamento inbound por `phone_number_id` — `RESOLVIDO`

- **Local:** `lib/whatsapp-meta-cloud-webhook.ts:92`, `lib/whatsapp/whatsapp-service.ts:54`.
- **Verificação:** o processador resolve `storeId` por `resolveStoreIdByPhoneNumberId` por `entry/change`. Número não-mapeado/inativo/ausente → descarta + audita (`whatsapp_meta_webhook_unmapped_phone_number`), **não grava, não cai em `loja-1`**. `webhookDefaultStoreId` **removido** (grep = 0 no projeto).
- **Resultado:** ✅ sem fallback silencioso no inbound.

### F-02 · Credencial outbound por loja — `RESOLVIDO`

- **Local:** `lib/whatsapp.ts`, `lib/whatsapp/store-credentials.ts`, `lib/whatsapp/whatsapp-service.ts:600`.
- **Verificação:** o cliente Graph não lê número/token de env global (só a versão da API); o caller injeta `WhatsAppCloudCredentials`. `requireStoreCloudCreds` lança + audita (`whatsapp_send_no_store_credentials`) quando a loja não tem número ativo/token. Token nunca no DB (`tokenEnvKey`).
- **Resultado:** ✅ envio sempre pela credencial da loja correta, ou falha visível.

### F-03 · Onboarding operacional do número — `P2` (dívida consciente)

- **Local:** tabela `whatsapp_phone_numbers` (vazia até seed).
- **Descrição:** o WhatsApp de uma loja só funciona após cadastrar a linha (`phoneNumberId` + `storeId` + env do token). Sem linha: inbound descartado, outbound lança.
- **Impacto:** passo de configuração novo por loja; mitigado por auditoria explícita que aponta o que falta. Há `scripts/backfill-whatsapp-phone-number.mjs` para o número atual.
- **Plano:** documentar no runbook do HUB WhatsApp; futura UI de cadastro de número por loja (Config V3).

### F-04 · `resolveSoleActiveStoreId` é heurística de transição — `P3`

- **Local:** `lib/whatsapp/whatsapp-service.ts`, consumido por owner-AI (`lib/whatsapp-webhook-ai.ts`) e debug.
- **Descrição:** fluxos sem `phone_number_id` (Evolution legado) resolvem a loja só quando há **exatamente uma** loja com número ativo; 0/>1 → `null` + auditoria, sem `loja-1`. Correto em deployment single-number; multi-número exige migrar esses fluxos para roteamento por número.
- **Plano:** follow-up quando 2+ números ativos coexistirem (não bloqueia o piloto atual).

### F-05 · Webhook responde 200 a número não-mapeado — `P3` (intencional)

- **Local:** `lib/whatsapp-meta-cloud-webhook.ts`.
- **Descrição:** payload de número não-mapeado é descartado mas a rota responde 200 (anti-retry storm da Meta). Silencioso para o remetente, **auditado** no servidor.
- **Plano:** aceito por design; observabilidade via `LogsAuditoria`.

---

## 5. Resumo executivo

| Severidade | Quantidade | Itens |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | F-03 (onboarding por loja) |
| P3 | 2 | F-04 (heurística Evolution), F-05 (200 intencional) |
| Resolvido | 2 | F-01 (inbound), F-02 (outbound) |

**Diagnóstico:** o defeito **F-04 do baseline** (webhook single-store com fallback `loja-1`) está **fechado**. O inbound roteia por `phone_number_id` e o outbound por credencial de loja, ambos **sem fallback silencioso** — auditoria explícita em todos os caminhos de borda. Os resíduos são uma dívida de **onboarding operacional** (P2) e duas decisões conscientes (P3). Validação verde: `tsc` 0 erros, `build` OK, `vitest` **258 passed | 2 expected fail**. **Pronto para Gate #2.**

---

## 6. Recomendações priorizadas

| # | Ação | Severidade | Tipo | Owner |
|---|---|---|---|---|
| 1 | Aceitar Gate #2 → ADR-0006 `proposta`→`aceito`; DT-07 §2 🔄 → §3 ✅ | — | gate | Rafael |
| 2 | `db:push` da migração `0010` no deploy + seed do número atual (backfill) | P2 | ops | Rafael |
| 3 | UI de cadastro de número por loja (Config V3 → WhatsApp) | P2 | sprint | a planejar |
| 4 | Migrar fluxos Evolution para roteamento por número quando houver 2+ ativos | P3 | follow-up | a planejar |

---

## 7. Pontos positivos

- **Decisão pura testável** (`resolveCredentialsFromRow`) isola a regra de credencial do I/O — espelha o precedente `resolveSeedStoreId` (DT-16).
- **Higiene de segredo:** token permanece na env; DB guarda só `tokenEnvKey`.
- **Migração aditiva** (`CREATE TABLE IF NOT EXISTS` + FK guardada) — zero risco a tabelas existentes.
- **Guard estático** (`whatsapp-service-routing.test.ts`) impede reintrodução de `webhookDefaultStoreId`/fallback.
- **Auditoria em todos os caminhos de borda** (não-mapeado, sem credencial, owner sem loja) — failure mode visível.

---

## 8. Comparativo com auditoria anterior

| Finding anterior | Status atual | Comentário |
|---|---|---|
| F-04 (`AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01`) — webhook single-store, fallback `loja-1` | **resolvido** | Roteamento por `phone_number_id` + credencial por loja (ADR-0006). Último vetor `loja-1` do projeto fechado (pendente Gate #2). |

---

## 9. Próximos passos

- [ ] Gate #2: aceitar ADR-0006 + mover DT-07 para §3 (✅).
- [ ] `npm run db:push` + backfill do número no deploy.
- [ ] Atualizar `ROADMAP_WHATSAPP` §5 (remover F-04 dos gaps).
- [ ] Follow-up P2/P3 (UI de número por loja; Evolution multi-número).

---

## 10. Referências

- Auditoria baseline: `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md` (F-04)
- ADR: `docs/decisions/ADR-0006-whatsapp-router-multi-loja.md` · `ADR-0003`
- Dívida: `docs/status/DIVIDA_TECNICA.md` (DT-07)
- Log: `docs/status/EXECUTION_LOG.md` ENTRY 019 (`MULTI_LOJA-S-003`)
- Migração: `prisma/migrations/0010_whatsapp_phone_number/migration.sql`

---

## 11. Imutabilidade

Após `status = publicada`: conteúdo não editado (exceto tipográfico). Mudança de cenário → nova auditoria `v<NN+1>` com §8 preenchida.
