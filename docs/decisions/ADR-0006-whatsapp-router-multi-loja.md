---
adr_id: ADR-0006
title: Roteamento WhatsApp multi-loja por `phone_number_id` (fim do webhook single-store)
status: aceito
data: 2026-06-01
sprint: MULTI_LOJA-S-003 (F-04 / DT-07)
commits: commit único da sprint S-003 (Gate #2 — hash registrado no relatório de fechamento)
aprovado_por: Rafael (Gate #2)
hub: whatsapp / multi_loja
related_findings: [F-04]
related_debt: [DT-07]
substitui: null
superado_por: null
---

# ADR-0006 · Roteamento WhatsApp multi-loja por `phone_number_id`

> **Status:** aceito (Gate #2 aprovado por Rafael em 2026-06-01 — sprint `MULTI_LOJA-S-003`).
>
> **Decisão em uma frase:** o WhatsApp passa a rotear **inbound por `phone_number_id`** (mapa
> `WhatsAppPhoneNumber` → `storeId`) e a resolver **credenciais outbound por loja**, eliminando
> o env single-store `WHATSAPP_WEBHOOK_STORE_ID` e o número/token global — **sem fallback
> silencioso `loja-1`**.

---

## Contexto

`F-04` / `DT-07` era o **último vetor `loja-1` aberto** do HUB Multi-loja (o server-side de API foi
fechado em S-001/S-002 + DT-14; o client-side em DT-13/DT-15/DT-16). O WhatsApp era **single-store**
por construção:

- `webhookDefaultStoreId()` lia `WHATSAPP_WEBHOOK_STORE_ID` e, ausente, caía em
  `LEGACY_PRIMARY_STORE_ID = "loja-1"` — **fallback silencioso**.
- O processador Meta (`processMetaWhatsAppWebhookPayload`) comparava o `phone_number_id` recebido
  com a env **global** `WHATSAPP_PHONE_NUMBER_ID` (um único número para toda a instância).
- O cliente Graph (`lib/whatsapp.ts`) lia número e token de **env global** (`WHATSAPP_PHONE_NUMBER_ID`
  / `WHATSAPP_ACCESS_TOKEN`) — toda loja enviava pelo mesmo número.

Severidade **P1**, com upgrade automático para **P0** assim que a **loja-2 (Rafa Brinquedos, já
ativa)** ligasse o WhatsApp: mensagens de qualquer loja seriam gravadas/enviadas como `loja-1`,
caracterizando vazamento cross-tenant.

> **Área protegida tocada (autorizada):** esta sprint alterou `prisma/schema.prisma` e o core
> `lib/whatsapp/*` — ambos exigem autorização explícita (CORE_RULES / GOVERNANCA §4). A autorização
> foi concedida especificamente para F-04 (o roteamento por tenant exige o mapa em schema).

---

## Decisão

### 1. Mapa de número → loja (`WhatsAppPhoneNumber`)

Tabela nova (aditiva) `whatsapp_phone_numbers`:

| Coluna | Papel |
|---|---|
| `phoneNumberId` (**@unique**) | Meta `phone_number_id` — chave de roteamento do webhook |
| `storeId` (FK → `stores`, cascade) | loja dona do número |
| `tokenEnvKey` (default `WHATSAPP_ACCESS_TOKEN`) | **nome da env** (Vercel secret) com o access token da loja |
| `wabaId`, `displayPhone` | auditoria / apresentação |
| `active` | só números ativos roteiam/enviam |

**O token NUNCA é persistido** — `tokenEnvKey` referencia a env que o contém. Migração `0010` é
**aditiva** (`CREATE TABLE IF NOT EXISTS` + índices + FK guardada); aplicada via `npm run db:push`
(Opção A). Nenhuma tabela existente é alterada/dropada.

### 2. Inbound — roteamento por `phone_number_id`

`processMetaWhatsAppWebhookPayload` resolve o `storeId` **por `entry/change`** via
`resolveStoreIdByPhoneNumberId(phone_number_id)`:

- número **mapeado e ativo** → grava na loja correta;
- número **não mapeado / inativo / ausente** → **descarta o payload, audita**
  (`whatsapp_meta_webhook_unmapped_phone_number`) e segue. **Não grava em loja nenhuma, não cai em
  `loja-1`.** A rota ainda responde **200** (evita retry storm da Meta).

`webhookDefaultStoreId()` foi **removido**. A rota de webhook não-Meta (Evolution-like legado) audita
de forma **store-agnóstica** (`whatsapp_legacy_webhook_ingress`), sem resolver loja.

### 3. Outbound — credenciais por loja

`lib/whatsapp.ts` deixa de ler env global de número/token: as funções `sendTextMessage` /
`sendTemplateMessage` / `sendMediaMessage` recebem `WhatsAppCloudCredentials`
(`{ phoneNumberId, accessToken }`) injetadas pelo caller. O serviço resolve as credenciais da loja
via `resolveStoreWhatsAppCredentials(storeId)` (→ `resolveCredentialsFromRow`, decisão **pura/testável**)
e `requireStoreCloudCreds` **lança + audita** (`whatsapp_send_no_store_credentials`) quando a loja não
tem número ativo/token — **sem fallback global**.

### 4. Fluxos sem `phone_number_id` (Evolution / owner-AI / debug)

`resolveSoleActiveStoreId()` resolve a loja **apenas quando há exatamente UMA** loja com número ativo
(deployment single-number). **0 ou >1 → `null`**, e o caller audita e degrada honestamente (o
`fechar_dia` do owner-AI avisa o dono e não fecha; as rotas de debug aceitam `?storeId=`). Sem
`loja-1`.

### 5. Status por loja no Omni Agent

`getOmniAgentWhatsAppCloudStatus` reflete o número/token **da loja ativa** (via
`resolveStoreWhatsAppCredentials`), não mais a env global.

---

## Consequências positivas

- **Fecha o último vetor `loja-1`** do projeto — multi-tenant real no WhatsApp (inbound e outbound).
- **Failure mode visível:** número não mapeado / loja sem credencial gera **auditoria explícita** em
  vez de gravação/envio silencioso cross-tenant.
- **Higiene de segredo:** o token permanece na env (Vercel secret); o DB guarda só a *referência*
  (`tokenEnvKey`).
- **Escala:** adicionar uma loja ao WhatsApp = inserir 1 linha em `whatsapp_phone_numbers` + definir a
  env do token. Sem deploy de código.
- **Decisão pura testável:** `resolveCredentialsFromRow` / `resolveSeedStoreId`-style isola a regra do I/O.

## Consequências negativas / dívida assumida

- **Onboarding operacional novo:** o WhatsApp de uma loja **só funciona após** cadastrar o número em
  `whatsapp_phone_numbers` (+ env do token). Sem linha, inbound é descartado e outbound lança. Mitigação:
  auditoria explícita aponta exatamente o que falta.
- **Webhook responde 200 mesmo para número não mapeado** (por design, anti-retry Meta) — é **silencioso
  para o remetente**, porém **auditado** no servidor.
- **`resolveSoleActiveStoreId` é heurística de transição** para fluxos sem `phone_number_id` (Evolution
  legado): correto só em deployment de número único; multi-número exige migrar esses fluxos para
  roteamento por número (follow-up).
- **Área protegida alterada** (`schema.prisma`, `lib/whatsapp/*`): exige a disciplina de áreas protegidas
  em manutenções futuras.

## Alternativas descartadas

- **Manter `WHATSAPP_WEBHOOK_STORE_ID` + número/token global:** descartado — é exatamente o single-store
  que bloqueia a loja-2 e mantém o fallback silencioso.
- **Persistir o access token no DB:** descartado — segredo em banco é regressão de segurança;
  `tokenEnvKey` mantém o token na env.
- **N envs por loja sem tabela (`WHATSAPP_PHONE_NUMBER_ID_LOJA2`…):** descartado — não escala, não há
  chave de roteamento inbound confiável, e polui a config.
- **Fallback para a primeira loja quando o número não casa:** descartado — falha silenciosa é
  estritamente inferior à falha visível (coerente com ADR-0003).

## Referências

- Finding **F-04** · `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md`
- Auditoria de fechamento · `docs/audits/AUDITORIA_F-04_WHATSAPP_ROUTER_MULTI_LOJA.md`
- Dívida **DT-07** · `docs/status/DIVIDA_TECNICA.md`
- **ADR-0003** (eliminar fallback `LEGACY_PRIMARY_STORE_ID`) — mesma doutrina "falha visível > silenciosa"
- **ADR-0004** (SAFE-lite modo padrão) — perfil de execução desta sprint
- Sprint / log · `EXECUTION_LOG.md` ENTRY 019 (`MULTI_LOJA-S-003`)
- Migração · `prisma/migrations/0010_whatsapp_phone_number/migration.sql`
