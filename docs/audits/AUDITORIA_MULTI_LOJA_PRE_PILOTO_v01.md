---
title: AUDITORIA_MULTI_LOJA_v01 · Baseline pré-piloto SPRINT_01_MULTI_LOJA
audit_id: MULTI_LOJA-01
hub: multi_loja
tipo: seguranca
data: 2026-05-28
duracao_horas: 1.5
auditor_humano: Rafael
auditor_ia: opus
escopo: sweep global read-only (`lib/**`, `app/api/**`, `app/actions/**`, `auth.*`, `proxy.ts`, `components/**`) — exclui mirror legacy `components/pdv-github-original/**` e `scripts/**`
status: publicada
imutavel_apos: publicada
versao_anterior: null
skill_executora: SKILL_AUDIT_MULTI_LOJA v1
ticket_id: AUDIT-MULTI_LOJA-PRE-PILOTO
modo: SAFE
gates: []
---

# AUDITORIA_MULTI_LOJA_v01 · Baseline pré-piloto SPRINT_01_MULTI_LOJA

> **Status:** publicada · **Modo:** read-only.
> **Função no runtime:** baseline oficial pré-piloto. Auditorias subsequentes (pós-sprint, pós-fix) usarão este artefato como referência no §8.
> **NÃO ALTEROU CÓDIGO.** Nenhuma sugestão deste documento é vinculante até virar `SPRINT_PROPOSAL` aprovada no Gate #1.

---

## 1. Escopo

### 1.1 Dentro
- **Core de tenant isolation:** `lib/store-id-from-request.ts`, `lib/store-defaults.ts`, `lib/loja-ativa.tsx`, `lib/ops-api-gate.ts`, `lib/assistec-headers.ts`, `lib/operacoes/assert-active-store.ts`, `lib/auth/enterprise-permissions.ts`, `lib/auth/guard-enterprise.ts`, `lib/auth/api-enterprise-guard.ts`, `lib/auth/proxy-enterprise-dashboard.ts`, `lib/stores-api-access.ts`.
- **Proxy/gate:** `proxy.ts`, `auth.ts`, `auth.config.ts`.
- **Rotas API:** sweep em `app/api/**/route.ts` (≈140 arquivos) — foco em fallback `loja-1`, queries sem `where.storeId`, ausência de ACL `canAccessStore`.
- **Server Actions:** `app/actions/operacoes.ts`, `app/actions/whatsapp.ts`.
- **WhatsApp tenancy:** `lib/whatsapp/whatsapp-service.ts`, `lib/whatsapp-meta-cloud-webhook.ts`, `lib/whatsapp/whatsapp-api-guard.ts`, `app/api/whatsapp/webhook/route.ts`.
- **Cache/localStorage cross-store:** `lib/store-scoped-storage.ts`, `lib/loja-ativa.tsx` (cookie `assistec-active-store`, LS `assistec-pro-loja-ativa-v1`, `opsKeyForLoja`).
- **Adapters / provider boundaries:** spot check em `lib/financeiro/services/*`, `lib/operacoes/services/*`, `lib/operacoes/adapters/*`.
- Roadmap, status vivos (DT-03, DT-07, R-02, BL-04, BL-08), memórias `project_pdv_multi_terminais_fase1/fase2_lock`, `project_importador_produtos_match_seguro`.

### 1.2 Fora
- Mirror legado `components/pdv-github-original/**` — será descomissionada; findings lá são duplicatas conhecidas e não bloqueiam o piloto.
- Migrações Prisma (`prisma/migrations/**`) — leitura no schema apenas para contexto, sem auditoria de DDL.
- `scripts/**` (importadores/seeds) — usam `loja-1` por convenção controlada de import, não estão na superfície de tráfego do cliente final.
- Testes E2E / Vitest — auditoria de **cobertura** vai para [`SKILL_EXEC_TESTING`](../skills/executoras/execution/SKILL_EXEC_TESTING.md) pré-piloto, não para esta.
- Componentes Lovable do HUB Financeiro (`FinanceiroRealContext.tsx`) e telas legadas (`app/dashboard/os/OsPageClient.tsx`) — cliente-side, derivam do `lojaAtivaId`; vão a auditoria de UI separada.

### 1.3 Premissas
- Estado do projeto em `2026-05-28`; estado vivo em [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md).
- Schema Prisma vigente: convenção `storeId String` em todos os models operacionais (Cliente, Produto, Venda, OrdemServico, ContaReceberTitulo, ContaPagarTitulo, MovimentacaoFinanceira, CaixaOperacao, SessaoCaixa, PdvTerminal, WhatsAppContact/Conversation/Message/Automation, etc.).
- ACL atual: NextAuth v5 + `session.user.storeAccess: "all" | "restricted"` + `session.user.allowedStoreIds: string[]`; permissões por papel em `getEnterprisePermissions(role)`.
- Fallback `"loja-1"` é convenção histórica para multi-tenant single-tenant-only (DT-03 conhecido, P0).
- Webhook WhatsApp inbound roteia por env `WHATSAPP_WEBHOOK_STORE_ID` (DT-07 conhecido, P1 que vira P0 com 2ª loja).

---

## 2. Metodologia

- **Documentos lidos:** `CLAUDE.md`, `docs/governance/{GOVERNANCA,WORKFLOW_MULTI_IA,SESSION_HANDOFF}.md`, `docs/execution/{EXECUTION_ENGINE,SAFE_GUARDS,HUMAN_GATES}.md`, `docs/ai/CURRENT_STATUS_OVERVIEW.md`, `docs/status/{EXECUTION_LOG,APPROVAL_BATCH_V1,LOCKS,RISCOS,DIVIDA_TECNICA,BLOCKERS}.md`, `docs/roadmaps/ROADMAP_MULTI_LOJA.md`, `docs/decisions/ADR-0002-skill-front-matter-v1.md`, `docs/skills/executoras/research/SKILL_AUDIT_MULTI_LOJA.md`, `docs/audits/TEMPLATE_AUDITORIA.md`, `docs/audits/AUDITORIA_FINAL_WHATSAPP_HUB.md` (referência cruzada), `docs/audits/AUDITORIA_OPERACOES_HUB.md` (referência cruzada).
- **Ferramentas:** `Grep` (ripgrep) + `Read` direto nos arquivos críticos.
- **Padrões varridos:**
  - `"loja-1"` / `'loja-1'` / `` `loja-1` `` em código `.ts`/`.tsx`.
  - `LEGACY_PRIMARY_STORE_ID` (imports + usos).
  - `storeIdFromAssistecRequestForRead` / `For_Write` (caller-list completa).
  - `\|\|\s*"loja-1"` e `\?\?\s*"loja-1"` (fallback explícito após resolver).
  - `findMany\(\)\s*$` e `findMany\(\{ orderBy` sem `where` (queries sem escopo).
  - `WHATSAPP_WEBHOOK_STORE_ID`, `phone_number_id`.
  - Cookie `assistec_active_store` vs `assistec-active-store` (sniff por separador).
- **Cenários testados (mental dry-run):**
  - Cliente faz `GET /api/dashboard/resumo` sem header `x-assistec-loja-id` → quem responde?
  - Cliente com sessão restrita à Loja B chama `POST /api/whatsapp/send-daily` com `body.storeId = "loja-a"` → bloqueia?
  - Proxy recebe request com cookie `assistec-active-store=loja-b` para usuário restrito a `loja-a` → bloqueia?
  - Webhook Meta entrega evento de `phone_number_id` da Loja B em ambiente com `WHATSAPP_WEBHOOK_STORE_ID=loja-a` → persiste onde?
- **NÃO rodado:** `npx tsc`, `npm run build`, `npm run test`, banco real (read-only não toca banco).

---

## 3. Severidade — convenção

| Severidade | Critério |
|---|---|
| **P0** | Vazamento cross-tenant possível, fallback silencioso para `loja-1`, ACL ausente em rota sensível, fechamento/pagamento na loja errada, webhook escrevendo em tenant errado |
| **P1** | Risco alto sem operação parar — corrigir antes do go-live multi-loja real |
| **P2** | UX / observabilidade / consistência menor |
| **P3** | Melhoria — sem prazo |

> **Regra de upgrade:** qualquer P1 envolvendo multi-loja, dinheiro ou fiscal vira automaticamente **P0** (§3 do [`AUDIT_PROTOCOL.md`](../governance/AUDIT_PROTOCOL.md)).

---

## 4. Findings

### F-01 · Fallback silencioso `loja-1` em leituras API (raiz da convenção) — `P0` — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 6436d9b)

- **Local:** `lib/store-id-from-request.ts:25-32` (função `storeIdFromAssistecRequestForRead`)
- **Descrição:** A resolução de `storeId` em leituras chega ao `LEGACY_PRIMARY_STORE_ID = "loja-1"` quando header `x-assistec-loja-id`, query `storeId`/`lojaId` e cookie `assistec-active-store` falham. Não há erro, não há sinal observável: a request **sempre** retorna dados de `loja-1` para qualquer cliente sem contexto de loja. Esta é a raiz arquitetural do DT-03.
- **Evidência:**
  ```ts
  const v = (h || q || c || LEGACY_PRIMARY_STORE_ID).trim()
  return v || LEGACY_PRIMARY_STORE_ID
  ```
- **Impacto:** com 2ª loja real em produção, qualquer rota que use este helper sem reforço posterior expõe dados de `loja-1` cross-tenant. Em LGPD, vira incidente.
- **Causa raiz:** convenção histórica single-tenant herdada do MVP; fallback documentado em comentário (`"último recurso para chamadas sem contexto"`) — explícita mas incompatível com multi-loja real.
- **Plano sugerido:** trocar fallback por `null` (modelo já existente em `storeIdFromAssistecRequestForWrite` e em `resolveActiveStoreId`). Rotas chamadoras passam a explicitamente retornar 400/403 quando `storeId` ausente. Migração faseada — ver Recomendação #1.
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (piloto). ADR provável: "Eliminar fallback silencioso `LEGACY_PRIMARY_STORE_ID` em leituras API (Fase 1)".

---

### F-02 · Fallback hardcoded `|| "loja-1"` em ≥30 rotas financeiras/vendas — `P0` — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 6436d9b)

- **Local (lista canônica detectada):**
  - `app/api/vendas/{[id],[id]/cancelar,[id]/corrigir,historico}/route.ts`
  - `app/api/financeiro/{receber,pagar,movimentacoes,fluxo-caixa,analytics,auditoria,dre}/route.ts`
  - `app/api/financeiro/conciliacao/{route.ts,[id]/route.ts}` (2 ocorrências em `conciliacao/route.ts`)
  - `app/api/financeiro/fechamentos/{route.ts,fechar-mes/route.ts,fechar-dia/route.ts,[id]/reabrir/route.ts}`
  - `app/api/financeiro/relatorios/{resumo,rankings,indicadores,fluxo,exportar,categorias}/route.ts`
  - `app/api/financeiro/carteiras/{route.ts,[id]/route.ts,transferencia/route.ts}`
  - `app/api/financeiro/auditoria/[entidade]/[entidadeId]/route.ts`
  - `app/api/finance/{transactions,dashboard,categories,accounts}/route.ts`
  - `app/api/ops/{contas-receber-list,contas-pagar-list}/route.ts`
- **Descrição:** padrão repetido `const storeId = opsLojaIdFromRequest(req) || "loja-1"`. Como `opsLojaIdFromRequest` já chama `storeIdFromAssistecRequestForRead` (que **já fallback para `loja-1`**), o `|| "loja-1"` é **redundante mas duplica o risco**: cristaliza a string `"loja-1"` em ~30 arquivos. Cada rota agora precisa ser tocada para eliminar DT-03.
- **Evidência:**
  ```ts
  // app/api/financeiro/fechamentos/fechar-mes/route.ts:31
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  ```
  Particularmente grave em `fechar-mes`/`fechar-dia`/`reabrir` (operações irreversíveis) e em `conciliacao` POST (movimenta saldo).
- **Impacto:** **`fechar-mes` chamado sem header em ambiente multi-loja fecha o mês de `loja-1` silenciosamente**. Em produção real isso significa risco de fechamento contábil cruzado.
- **Causa raiz:** mesmo motivo da F-01 (convenção single-tenant herdada). Aqui multiplicada N vezes por copy-paste durante a fase de extração da API financeira do mirror legado.
- **Plano sugerido:** após eliminar fallback em F-01, fazer pass cirúrgica removendo `|| "loja-1"` e exigindo `storeIdFromAssistecRequestForWrite`-style `if (!storeId) return 400`. **Cuidado: rotas de leitura usam mix — algumas com `apiGuardFinanceiroViewOrOps` (que valida `canAccessStore`) e outras sem.** A pass precisa estar ordenada para não introduzir 400 inesperados nos UIs Lovable. Sprint pequena (`EXEC_DEBT_ITEM`, allow-list dinâmica das rotas listadas).
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (piloto) — payload central. Após F-01, este finding fecha automaticamente DT-03.

---

### F-03 · Proxy lê cookie com nome errado (`assistec_active_store` ≠ `assistec-active-store`) — `P0`

- **Local:** `proxy.ts:132`
- **Descrição:** o gate de cookie no proxy lê `req.cookies.get("assistec_active_store")` (com **underscores**). O cookie real é setado em `lib/store-defaults.ts:7` como `ASSISTEC_ACTIVE_STORE_COOKIE = "assistec-active-store"` (com **hífens**). Resultado: `enterpriseStoreCookieRedirect` **nunca** recebe um valor; o redirect `?storeAccess=denied` **nunca dispara** no gateway. Usuários com `storeAccess: "restricted"` cuja loja ativa não está em `allowedStoreIds` passam pelo proxy sem freio.
- **Evidência:**
  ```ts
  // proxy.ts:132
  const storeCookie = req.cookies.get("assistec_active_store")?.value
  const storeDeny = enterpriseStoreCookieRedirect(req.nextUrl.origin, sess, storeCookie)
  if (storeDeny) return NextResponse.redirect(storeDeny)
  ```
  ```ts
  // lib/store-defaults.ts:7
  export const ASSISTEC_ACTIVE_STORE_COOKIE = "assistec-active-store"
  ```
- **Impacto:** ACL de loja na borda **não existe na prática** para o cookie. As rotas individuais continuam protegidas (quando usam `canAccessStore`), mas o proxy não barra ninguém — quebra a expectativa de "defense in depth" e dificulta auditoria por logs do proxy.
- **Causa raiz:** typo/divergência de naming em algum refactor anterior; nunca foi pego porque o redirect só dispara em caso patológico (cookie populado para loja proibida) — sem teste automatizado disso, passa despercebido.
- **Plano sugerido:** trocar para `req.cookies.get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value`, importando a constante. Adicionar teste unitário em `lib/auth/proxy-enterprise-dashboard.test.ts` (a criar) que cubra cookie ausente, cookie permitido, cookie negado. Risco baixo (proxy.ts é área protegida — exige autorização, mas é fix cirúrgico de 1 linha).
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (incluir como hotfix; toca área protegida `proxy.ts` — exige flag `--with-protected-areas:proxy.ts`).

---

### F-04 · Webhook WhatsApp ingressa com env fixo `WHATSAPP_WEBHOOK_STORE_ID` → fallback `loja-1` — `P0`

- **Local:** `lib/whatsapp/whatsapp-service.ts:34-37` (`webhookDefaultStoreId`); chamado em `app/api/whatsapp/webhook/route.ts:248`, `lib/whatsapp-meta-cloud-webhook.ts:74`, três rotas `/api/debug/whatsapp-*`.
- **Descrição:** todo o ingress do WhatsApp Cloud API roteia para um **único `storeId`** lido de env. Se a env não estiver setada, cai em `LEGACY_PRIMARY_STORE_ID`. Não há lookup por `phone_number_id` para identificar a loja-destino (apesar de a Meta enviar `value.metadata.phone_number_id` em todo payload). DT-07 documentado.
- **Evidência:**
  ```ts
  // lib/whatsapp/whatsapp-service.ts:34-37
  export function webhookDefaultStoreId(): string {
    const env = process.env.WHATSAPP_WEBHOOK_STORE_ID?.trim()
    return env && env.length > 0 ? env : LEGACY_PRIMARY_STORE_ID
  }
  ```
  Já existe **detecção** de mismatch em `lib/whatsapp-meta-cloud-webhook.ts:106-115` (compara `phone_number_id` recebido com `WHATSAPP_PHONE_NUMBER_ID`), mas o `storeId` resultante ainda é o do env, não derivado do `phone_number_id`.
- **Impacto:** o cenário "1 loja, 1 número WhatsApp" funciona. O cenário "Loja B ativa WhatsApp" — sem renomear env e redeployar — faz **todas as mensagens inbound da Loja B caírem na inbox da Loja A**. Vazamento cross-tenant materializado em mensagens reais de cliente (PII).
- **Causa raiz:** desenho single-tenant intencional na Fase 1 do WhatsApp. Migração para router por `phone_number_id` está em roadmap (`ROADMAP_MULTI_LOJA §6 item 8`) mas não programada.
- **Plano sugerido:** introduzir model `WhatsAppPhoneNumberMap` (ou colunizar `phoneNumberId` no model `Store`) com chave `phone_number_id → storeId`. Webhook resolve via lookup; fallback erra **explicitamente** (200 + audit log de mismatch, como já faz para signature). Sprint média; toca `lib/whatsapp/*` + `prisma/schema.prisma` (áreas protegidas).
- **Sprint/ADR alvo:** **SPRINT_NN_MULTI_LOJA** dedicada (sucessora do piloto). ADR provável: "Router WhatsApp Meta por `phone_number_id` → `storeId`".

---

### F-05 · Rotas `/api/dashboard/*`, `/api/clients`, `/api/ops/inventory` GET sem ACL `canAccessStore` — `P0` — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 2e6e7d5)

- **Local:**
  - `app/api/dashboard/resumo/route.ts:9-25`
  - `app/api/dashboard/elite/route.ts:70-72` (toda a query depende de `storeIdFromAssistecRequestForRead` sem session check)
  - `app/api/clients/route.ts:35-58` (lista clientes; sem session, sem ACL)
  - `app/api/ops/inventory/route.ts:119-153` (apenas `requireSubscription` — não checa session NextAuth nem `canAccessStore`)
- **Descrição:** estas rotas resolvem `storeId` a partir de header/query/cookie/`loja-1` mas **não chamam** `auth()`, `canAccessStore` nem nenhum dos guards de hub. Conseqüências:
  1. Usuário autenticado restrito à Loja A pode chamar `GET /api/clients?storeId=loja-b` e listar clientes da Loja B.
  2. Chamada anônima (sem cookie de sessão NextAuth) cai em `loja-1` e devolve resumo dela.
- **Evidência:**
  ```ts
  // app/api/dashboard/resumo/route.ts:9-16
  export async function GET(req: Request) {
    try {
      const storeId = storeIdFromAssistecRequestForRead(req)
      const [totalClientes, produtosEsgotados] = await Promise.all([
        prisma.cliente.count({ where: { storeId } }),
        prisma.produto.count({ where: { storeId, stock: 0 } }),
      ])
      return NextResponse.json({ ok: true, storeId, totalClientes, produtosEsgotados })
  ```
- **Impacto:** vazamento cross-tenant explícito + caminho de DT-03. As contagens parecem inócuas, mas em `/api/dashboard/elite` (já lido apenas 100 linhas — segue idêntico padrão) retornam KPIs financeiros completos, top categorias, últimas vendas. Em multi-loja real, qualquer usuário pode trocar header e raspar KPIs de outra loja.
- **Causa raiz:** rotas criadas durante fase em que ACL ainda era convenção implícita (proxy assumia sessão); a parametrização por header foi adicionada antes do `canAccessStore` virar contrato.
- **Plano sugerido:** envolver cada rota em `apiGuardEnterpriseOrOps(storeId, p => p.algoApropriado, …)` ou helper específico `apiGuardDashboardOrPanel`. Para `/api/clients` (legacy alias), considerar deprecar redirecionando para `/api/clientes` que tem `requireCadastrosHubApi`.
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (fix oportunista junto ao DT-03; allow-list dinâmica destas rotas) — ou sprint sucessora se piloto fechado escopo.

---

### F-06 · Server Action `sendWhatsAppTextAction` aceita `storeId` cru do cliente sem validar acesso — `P0` — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 2e6e7d5)

- **Local:** `app/actions/whatsapp.ts:19-33` (`sendWhatsAppTextAction`), `:59-80` (`sendWhatsAppTemplateAction`) e variante `sendWhatsAppMediaAction` (mesmo padrão, não relido).
- **Descrição:** a action exige `session?.user` (presença), mas **não** chama `canAccessStore(session, input.storeId)`. O `storeId` chega via input do componente cliente. Usuário autenticado restrito à Loja A pode disparar `sendWhatsAppTextAction({ storeId: "loja-b", … })` e a mensagem é gravada/enviada na Loja B.
- **Evidência:**
  ```ts
  // app/actions/whatsapp.ts:19-32
  export async function sendWhatsAppTextAction(input: SendTextInput) {
    const session = await auth()
    if (!session?.user) return { ok: false as const, error: "Não autenticado" }

    const storeId = (input.storeId ?? "").trim()
    if (!storeId) return { ok: false as const, error: "storeId obrigatório" }

    try {
      const r = await sendCloudApiTextAndRecord(storeId, input.conversationId, input.text)
  ```
- **Impacto:** envio cross-tenant de mensagens WhatsApp + escrita em `WhatsAppMessage` na loja errada. Compliance Meta (qualidade do número) e LGPD (mensagem dirigida ao cliente errado) impactados.
- **Causa raiz:** padrão "server action trust client input" — comum, mas multi-loja exige sempre `canAccessStore` server-side.
- **Plano sugerido:** importar `canAccessStore` de `lib/auth/enterprise-permissions.ts`; após `auth()`, validar `canAccessStore(session, storeId)`. Aplicar a todas as actions do `app/actions/whatsapp.ts`.
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (fix oportunista — 3 actions, ≤ 30 linhas).

---

### F-07 · Rota `/api/whatsapp/send-daily` aceita `body.storeId` sem validar `canAccessStore` — `P0` — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 2e6e7d5)

- **Local:** `app/api/whatsapp/send-daily/route.ts:40-67`
- **Descrição:** rota exige sessão e assinatura, depois pega `body.storeId` cru (com fallback para `storeIdFromWhatsAppApiRead(request)`), resolve com `resolveActiveStoreId`. Não há `canAccessStore`. Quem tem sessão pode mandar resumo diário para qualquer loja.
- **Evidência:**
  ```ts
  // app/api/whatsapp/send-daily/route.ts:57-61
  const storeId = resolveActiveStoreId(
    typeof body.storeId === "string" && body.storeId.trim()
      ? body.storeId.trim()
      : storeIdFromWhatsAppApiRead(request)
  )
  ```
- **Impacto:** envio WhatsApp para número configurado + leitura do `LedgerSnapshot` (saldo de fechamento) da loja errada. P0 por dinheiro/PII.
- **Plano sugerido:** mesmo fix do F-06 — `canAccessStore(session, storeId)` antes de prosseguir.
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (mesmo lote do F-06).

---

### F-08 · Rotas `/api/ops/sync-legacy-{vendas,financeiro}` aceitam writes em qualquer loja sem `canAccessStore` — `P0`

- **Local:** `app/api/ops/sync-legacy-vendas/route.ts:23-29`, `app/api/ops/sync-legacy-financeiro/route.ts:34-40`
- **Descrição:** rotas usam apenas `requireOpsSubscription` (cookie de assinatura) + `opsLojaIdFromRequestForWrite` (header/query). Sem session NextAuth check, sem `canAccessStore`. Cliente autenticado com cookie de assinatura ativo pode despejar vendas/contas a receber na loja que quiser via header.
- **Evidência:** estrutura completa em `app/api/ops/sync-legacy-vendas/route.ts:12-49`. Apenas valida que o header foi enviado, não que o usuário tem direito sobre ela.
- **Impacto:** escrita cross-tenant possível em models `Venda`, `ContaReceberTitulo`, `MovimentacaoFinanceira`. P0 por dinheiro.
- **Causa raiz:** rotas legadas de sincronização do PDV legacy → migration do mirror; criadas antes do gate enterprise consolidar.
- **Plano sugerido:** introduzir `apiGuardEnterpriseOrOps` ou eq. com `p => p.hubs.vendas`/`p => p.financeiro.edit` e validar `canAccessStore(session, lojaId)`. Reavaliar se ainda são necessárias (mirror legacy a ser descomissionado).
- **Sprint/ADR alvo:** **SPRINT_NN_OPS_LEGACY** ou inclusão no piloto se allow-list permitir.

---

### F-09 · `Cliente.totalSpent` (`/api/clientes` GET) calcula cross-store por `groupBy clienteId` — `P1` (upgrade P0 por LGPD)

- **Local:** `app/api/clientes/route.ts:67-82`
- **Descrição:** o cálculo de "total gasto" para cada cliente faz `prisma.ordemServico.groupBy({ by: ["clienteId"], where: { storeId, clienteId: { not: null }, … } })` e `prisma.venda.groupBy({ by: ["clienteId"], where: { storeId, clienteId: { not: null }, … } })`. Os `where` **incluem** `storeId`, o que está **correto**. O risco residual é se um cliente importado tiver `storeId` divergente do contexto (já documentado em `lib/clientes-loja-resolve.ts`); o mapa final é por `clienteId`. Mantenho como **não-bloqueante** mas registrando para monitoramento.
- **Evidência:** `app/api/clientes/route.ts:65-93` — código defensivo, mas auditoria de `Cliente.storeId` em produção (cross-loja silencioso após import) é responsabilidade de outra finding (F-10).
- **Impacto:** baixo isolado; vira P0 se F-10 confirmar registros com `storeId` inconsistente.
- **Plano sugerido:** somar este finding ao plano da F-10. Em separado, baixo prazo: adicionar teste integrado em `lib/clientes-loja-resolve.test.ts` que cubra `Cliente` cross-store após import.
- **Sprint/ADR alvo:** observação. Promovido a P0 se F-10 trouxer evidência.

---

### F-10 · Auditoria de dados existentes (registros com `storeId` ausente/errado) — `P1` (NÃO MEDIDA)

- **Local:** N/A (auditoria deste tópico **exige** acesso ao banco; esta auditoria é read-only do código).
- **Descrição:** auditoria de **conformidade do banco** não foi executada — exigiria queries SQL (e.g., `SELECT storeId, COUNT(*) FROM venda WHERE storeId IS NULL OR storeId NOT IN (SELECT id FROM store)`). É a **outra metade** da equação multi-loja (a primeira é o código que escreve, esta é o que já está escrito).
- **Evidência:** ausência de evidência — é o ponto.
- **Impacto:** se há registros com `storeId = ""` ou `storeId NOT IN stores`, eles **nunca aparecem** em rota alguma com `where: { storeId }`. Em LGPD, isso pode mascarar dados órfãos. Em produção, pode mascarar inconsistência de import.
- **Plano sugerido:** **antes do go-live multi-loja real**, executar query de saneamento em SAFE modo. Skill candidata: `SKILL_AUDIT_MULTI_LOJA` v2 com `audit_type: "dados"` rodando contra produção. Não no piloto.
- **Sprint/ADR alvo:** observação para `SKILL_AUDIT_MULTI_LOJA` v2 (pós-piloto). Bloqueante para 2ª loja em produção real.

---

### F-11 · LS `assistec-pro-loja-ativa-v1` aceita id "vazio mas truthy" / migração `loja-antiga → loja-1` ainda ativa — `P2`

- **Local:** `lib/loja-ativa.tsx:182-202`
- **Descrição:** o provider lê do LS, faz migração explícita `loja-antiga → loja-1`, e em ausência usa `lojas[0]?.id || LEGACY_PRIMARY_STORE_ID`. Em ambiente multi-loja onde a primeira loja **não é** `loja-1`, o fallback `LEGACY_PRIMARY_STORE_ID` ainda é semente válida — sintoma do mesmo DT-03 no client. Não é vetor de vazamento direto (cliente envia header consistente com o LS), mas é a fonte do header.
- **Evidência:**
  ```ts
  // lib/loja-ativa.tsx:195-198
  const fallback = lojas[0]?.id || LEGACY_PRIMARY_STORE_ID
  setLojaAtivaIdState(fallback)
  ```
- **Impacto:** UX (cliente abrindo o painel pode acabar em `loja-1` se houve race entre LS vazio e load remoto), e mantém DT-03 vivo no client.
- **Plano sugerido:** após eliminar fallback server-side (F-01/F-02), eliminar aqui também — usuário sem loja válida deveria ver bloqueio (banner "Selecione uma unidade") em vez de cair em fallback. Pequeno refactor.
- **Sprint/ADR alvo:** **SPRINT_NN_MULTI_LOJA** sucessora.

---

### F-12 · Cookie `assistec-active-store` sem `Secure` flag (em produção HTTPS) — `P2`

- **Local:** `lib/loja-ativa.tsx:27-34`
- **Descrição:** o cookie é setado via `document.cookie` com `SameSite=Lax` mas sem `Secure`. Em ambientes HTTPS, isso permite leak via HTTP downgrade ou MITM no LAN. Não é HttpOnly (precisa ler client-side), portanto o vetor real é o JS comprometido (XSS) — risco baixo dado o stack.
- **Evidência:**
  ```ts
  document.cookie = `${ASSISTEC_ACTIVE_STORE_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`
  ```
- **Impacto:** baixo no contexto; melhor higiene.
- **Plano sugerido:** adicionar `Secure` quando `window.location.protocol === "https:"`. Em dev local, omitir.
- **Sprint/ADR alvo:** observação — `SKILL_EXEC_STABILIZATION` standalone (≤ 5 linhas).

---

### F-13 · `app/dashboard/os/OsPageClient.tsx:346` tem `TODO` confessado de fallback `loja-1` — `P1`

- **Local:** `app/dashboard/os/OsPageClient.tsx:346`
- **Descrição:** comentário `// TODO: garantir loja ativa via contexto/sessão` ao lado de `(lojaAtivaId || "loja-1").trim() || "loja-1"`. Rota legada `/dashboard/os`, marcada para descomissionamento mas ainda em paralelo (`CURRENT_STATUS_OVERVIEW §1`).
- **Impacto:** baixo (rota legada com tráfego decrescente), mas é evidência de que DT-03 foi conhecido localmente e não fechado.
- **Plano sugerido:** fechar junto à descomissionação da rota legada (ROADMAP_OPERACOES_OS §5). Não inflar piloto com isso.
- **Sprint/ADR alvo:** observação — entra na sprint de descomissionamento `/dashboard/os`.

---

### F-14 · `lib/whatsapp-daily-server.ts:38` fallback silencioso `LEGACY_PRIMARY_STORE_ID` — `P1` (upgrade P0) — ✅ RESOLVIDO (SPRINT_MULTI_LOJA-S-001 · 2e6e7d5)

- **Local:** `lib/whatsapp-daily-server.ts:6, 38`
- **Descrição:** `sendDailyClosingToPhone` aceita `params.storeId` opcional. Se vazio: cai em `LEGACY_PRIMARY_STORE_ID` e lê `LedgerSnapshot` dela. Junto com F-07 (a rota que chama isto), forma cadeia: rota não valida → service fallback → vazamento.
- **Evidência:** linha 38: `const storeId = (params.storeId ?? LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID`.
- **Impacto:** fechamento diário da loja errada via WhatsApp ao número do dono. Vira **P0** pela regra de upgrade (multi-loja + dinheiro).
- **Plano sugerido:** assinatura do service passa a exigir `storeId` obrigatório (não-nullable). Caller (rota) é quem tem que ter validado.
- **Sprint/ADR alvo:** **SPRINT_01_MULTI_LOJA** (mesmo lote do F-07).

---

### F-15 · `lib/stores-api-access.ts:46` `resolvePrimaryStoreId` cai em `LEGACY_PRIMARY_STORE_ID` quando tabela `Store` vazia — `P2`

- **Local:** `lib/stores-api-access.ts:44-47`
- **Descrição:** helper usado para identificar "loja principal" (não-deletável). Quando `prisma.store.findFirst()` retorna `null` (zero lojas no banco), cai em `LEGACY_PRIMARY_STORE_ID`. Em produção isso é onboarding-only (instância nova); risco operacional baixo.
- **Plano sugerido:** observação — fica até instância seedar primeira `Store`. Após F-01/F-02 fechados, este fallback é o único restante e fica simbólico.
- **Sprint/ADR alvo:** observação.

---

### F-16 · Rota `POST /api/stores` gera id auto-incremental `loja-N` com `Math.max + 1` — `P3`

- **Local:** `app/api/stores/route.ts:63-74`
- **Descrição:** geração de id parseia ids existentes via regex `^loja-(\d+)$`, pega max e soma 1. Race condition se 2 POSTs simultâneos. Como criação de loja é raro (uma vez por onboarding), risco residual.
- **Plano sugerido:** observação. Eventualmente: id = `cuid` ou ULID; manter `loja-N` como `slug` apenas. Out of scope do piloto.
- **Sprint/ADR alvo:** observação.

---

## 5. Resumo executivo

| Severidade | Quantidade | Itens |
|---|---|---|
| P0 | 8 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08 |
| P1 | 4 | F-09, F-10, F-13, F-14 (este último vira P0 por upgrade automático multi-loja+dinheiro) |
| P2 | 3 | F-11, F-12, F-15 |
| P3 | 1 | F-16 |

> **Aplicando regra de upgrade (P1 multi-loja/dinheiro → P0):** F-14 vira P0. Quadro efetivo: **9 P0**, 3 P1, 3 P2, 1 P3.

**Diagnóstico em 1 parágrafo:** o OmniGestão Pro tem **convenção sólida** para multi-loja (header `x-assistec-loja-id`, `storeId` em todo schema operacional, ACL por `session.user.allowedStoreIds`), mas a **raiz arquitetural do fallback silencioso `LEGACY_PRIMARY_STORE_ID = "loja-1"`** ainda vive em `storeIdFromAssistecRequestForRead` (F-01) e foi **multiplicada por ≥30 rotas com hardcode redundante `|| "loja-1"`** (F-02). Esse é o vetor central do DT-03 e o foco oficial do piloto **SPRINT_01_MULTI_LOJA**. Em volta dele, 4 P0 colaterais materializam vazamento real: cookie de ACL com nome errado no proxy (F-03), webhook WhatsApp single-store (F-04), 4 famílias de rota sem ACL `canAccessStore` (F-05/F-06/F-07/F-08). Conformidade do **banco existente** (registros com `storeId` órfão) **não foi auditada** (F-10) e é pré-requisito para 2ª loja em produção. **Conclusão:** o piloto pode prosseguir, mas o escopo declarado ("eliminar fallback `loja-1` + lint customizado") precisa ser **estendido** para cobrir, no mínimo, F-01+F-02+F-03 ou explicitamente fatiado em sprints sucessoras.

---

## 6. Recomendações priorizadas

| # | Ação | Severidade | Tipo | Owner sugerido | Quando |
|---|---|---|---|---|---|
| 1 | Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em `storeIdFromAssistecRequestForRead` (retornar `null`); rotas chamadoras passam a explicitamente retornar 400/403 | **P0** | sprint (`EXEC_DEBT_ITEM`) | Sonnet | **SPRINT_01_MULTI_LOJA** (piloto) |
| 2 | Remover `|| "loja-1"` em ≥30 rotas (F-02); allow-list dinâmica das rotas listadas | **P0** | sprint (`EXEC_DEBT_ITEM`) | Sonnet | **SPRINT_01_MULTI_LOJA** (piloto) — depende #1 |
| 3 | Fix do cookie no `proxy.ts:132` (usar `ASSISTEC_ACTIVE_STORE_COOKIE`); área protegida → flag `--with-protected-areas:proxy.ts` | **P0** | sprint (`EXEC_DEBT_ITEM`) | Sonnet | **SPRINT_01_MULTI_LOJA** (incluir; ≤ 5 linhas + teste) |
| 4 | Subir cobertura de testes multi-loja (cookie/header/ACL/`canAccessStore`) em rotas-chave | **P0** | sprint (`EXEC_TESTING`) | Sonnet | **antes** de #1 e #2 (rede de segurança) |
| 5 | Adicionar `canAccessStore` em `/api/dashboard/{resumo,elite}`, `/api/clients`, `/api/ops/inventory`, `/api/ops/sync-legacy-{vendas,financeiro}`, actions `whatsapp.ts`, `/api/whatsapp/send-daily` | **P0** | sprint (`EXEC_DEBT_ITEM` ou `EXEC_FEATURE_S` se virar `apiGuardDashboard*`) | Sonnet | **SPRINT_01_MULTI_LOJA** (mesmo lote ou sprint paralela serializada — multi-loja × demais hubs é serial) |
| 6 | Router WhatsApp Meta por `phone_number_id → storeId` (F-04) | **P0** | sprint média + ADR (model novo) | Opus desenha ADR + Sonnet implementa | **sprint sucessora** (não no piloto — exige schema/area protegida + mais escopo) |
| 7 | Auditoria de dados existentes em produção (registros com `storeId` órfão) | **P1** | research (`SKILL_AUDIT_MULTI_LOJA` v2 com `audit_type: dados`) | Opus | **antes de 2ª loja real em produção** |
| 8 | Lint customizado `prisma.X.findMany` sem `where.storeId` (BL-08) | P1 | tooling | Sonnet | **sprint sucessora** (após piloto) — previne regressão futura |
| 9 | Service `sendDailyClosingToPhone`: tornar `storeId` obrigatório (F-14) | **P0** | sprint (`EXEC_STABILIZATION`) | Sonnet | mesmo lote do #5 |
| 10 | Observações F-11/F-12/F-13/F-15/F-16 | P2/P3 | observação | — | sprints orientadas a cada HUB |

---

## 7. Pontos positivos (registrar para evitar regressão)

- **Schema com `storeId` everywhere:** modelos operacionais (Cliente, Produto, Venda, OrdemServico, ContaReceberTitulo, ContaPagarTitulo, MovimentacaoFinanceira, CaixaOperacao, SessaoCaixa, PdvTerminal, WhatsApp*) **todos** têm `storeId String` indexado. **Manter como linha base não-negociável**.
- **ACL bem desenhada:** `session.user.storeAccess: "all" | "restricted"` + `allowedStoreIds: string[]` + `canAccessStore()` é o padrão certo. O problema **não é o desenho** — é a **aplicação inconsistente**.
- **Helpers já têm a forma correta:**
  - `storeIdFromAssistecRequestForWrite` retorna `null` se faltar header/query (sem fallback).
  - `resolveActiveStoreId` retorna `null` em vez de cair em `loja-1`.
  - `assertActiveStoreId` **throwa** explicitamente (usado em `app/actions/operacoes.ts:64`).
  - Estes 3 helpers são o template para a correção da F-01.
- **HUBs maduros já passaram pela auditoria final correlata:**
  - WhatsApp HUB ([`AUDITORIA_FINAL_WHATSAPP_HUB.md`](./AUDITORIA_FINAL_WHATSAPP_HUB.md)) → guard `storeIdFromWhatsAppApiRead` retorna `null` sem fallback ✅.
  - IA Mestre ([`AUDITORIA_FINAL_IA_MESTRE.md`](./AUDITORIA_FINAL_IA_MESTRE.md)) → guard `storeIdFromIaMestreRead` retorna `null` ✅.
  - Omni Agent ([`AUDITORIA_FINAL_OMNI_AGENT_HUB.md`](./AUDITORIA_FINAL_OMNI_AGENT_HUB.md)) → `lib/omni-agent/**` **zero** ocorrências de `loja-1` ✅.
  - Operações Lovable Hub (`apiGuardOperacoesHubOrLegacy`) → usa `requireEnterpriseWith` → `canAccessStore` ✅.
- **`PdvTerminal` por loja** (Multi-Terminais Fase 1) e lock per loja (Fase 2) — modelo replicável para outros recursos por loja.
- **Idempotência multi-loja** (`localKey` composto com `storeId`) funciona como segunda camada defensiva.
- **`store-scoped-storage.ts`** + teste (`store-scoped-storage.test.ts`) é o padrão para LS isolado — **substitui** chaves globais antigas; deve ser estendido a chaves remanescentes.
- **`/api/stores/[id]`** (GET/PUT/DELETE) **usa** `denyIfNoStoreAccess` (bom modelo) e protege loja primária.
- **Webhook WhatsApp Meta** já tem detecção de `phone_number_id_mismatch` (audita); é base para o router de F-04.

---

## 8. Comparativo com auditoria anterior

Não há auditoria anterior dedicada a multi-loja (`versao_anterior: null`). Auditorias parciais correlatas:

| Documento | Cobertura multi-loja parcial |
|---|---|
| [`AUDITORIA_FINAL_WHATSAPP_HUB.md`](./AUDITORIA_FINAL_WHATSAPP_HUB.md) | DT-07 `WHATSAPP_WEBHOOK_STORE_ID` ✓ (este audit confirma como F-04) |
| [`AUDITORIA_OPERACOES_HUB.md`](./AUDITORIA_OPERACOES_HUB.md) | Hub OS sem fallback `loja-1` ✓; resto de `lib/store-id-from-request` deixado para outro audit ✓ (é este) |
| [`AUDITORIA_IA_MESTRE.md`](./AUDITORIA_IA_MESTRE.md) | Risco fetch sem header → `loja-1` mencionado; resolvido para IA Mestre ✓ |
| [`AUDITORIA_FINAL_OMNI_AGENT_HUB.md`](./AUDITORIA_FINAL_OMNI_AGENT_HUB.md) | Zero `loja-1` no Agent ✓ |

Este documento **consolida** a visão sistêmica que faltava — DT-03 deixa de ser um item de dívida e vira um plano cirúrgico de N rotas + 1 helper + 1 cookie de proxy.

---

## 9. Próximos passos (orientação ao runtime — não-vinculantes)

> Próximos passos abaixo **não iniciam nada automaticamente.** Cada um exige aprovação humana separada (Gate #1 ou flag explícita).

- [ ] **Não merge:** este documento é baseline read-only.
- [ ] **Próxima skill sugerida (autorização separada):** `SKILL_EXEC_TESTING` para **subir cobertura de testes multi-loja** **antes** do primeiro `EXEC_DEBT_ITEM` em produção. Foco: ACL `canAccessStore` em `/api/dashboard/*`, `/api/clients`, `/api/ops/inventory`, `/api/ops/sync-legacy-*` (Recomendação #4).
- [ ] **Próxima skill sugerida (autorização separada):** `SKILL_PROPOSE_SPRINT` para gerar `SPRINT_PROPOSAL_MULTI_LOJA-01.md` cobrindo Recomendações #1+#2+#3+#5+#9 — escopo precisa ser **fatiado** entre o piloto e sprints sucessoras (ver §10).
- [ ] **Gate #1 humano:** humano aprova ou ajusta a proposta de sprint piloto antes de qualquer write.
- [ ] **Dry-run SAFE** do primeiro `SKILL_EXEC_DEBT_ITEM` (escopo F-01 + F-02 limitado a 5 rotas para validar o pipeline) **antes** do lote completo.
- [ ] **Auditoria pós-sprint** via Fase 12 do Engine: `SKILL_AUDIT_MULTI_LOJA` rodando sobre o diff da `SPRINT_01_MULTI_LOJA` — compara contra este §4. Documento sucessor: `AUDITORIA_MULTI_LOJA_v02.md` com §8 preenchido.
- [ ] **Atualizar** `docs/ai/CURRENT_STATUS_OVERVIEW.md §5` (dívida técnica) **somente** após sprint encerrar (não agora — DT-03 ainda aberto).
- [ ] **Notificar** humano dono do projeto (Rafael) — feito automaticamente pelo retorno desta auditoria à conversa.

---

## 10. Readiness do piloto SPRINT_01_MULTI_LOJA (resumo)

| Pergunta | Resposta | Evidência |
|---|---|---|
| **Existe blocker absoluto?** | **NÃO** — pipeline pode prosseguir | Runtime governance OK; APPROVAL_BATCH_V1 fechado; pré-flight desta auditoria gerou findings, não interrupções |
| **Escopo declarado do piloto basta?** | **NÃO** — apenas F-01 (fallback) + lint não fecha o vetor real | F-02 (≥30 rotas) é continuidade direta; F-03 (cookie proxy) é hotfix que precisa estar junto |
| **Como fatiar?** | **Sugestão (não-vinculante):** piloto cobre F-01+F-02 + ≤ 5 rotas de F-05 como prova de conceito; sprints sucessoras cobrem F-03 (área protegida), F-04 (schema novo), F-06/F-07/F-08, F-10 (auditoria de dados). | Escopo cap S/M do Engine + área protegida exige flag separada |
| **Pré-requisitos antes do primeiro write real?** | (a) `EXEC_TESTING` baseline multi-loja; (b) `PROPOSE_SPRINT` aprovada no Gate #1; (c) `LOCKS.md` ativado (`multi_loja`); (d) dry-run SAFE de 1 rota | Cada um exige autorização humana explícita |
| **Pré-requisitos para 2ª loja em produção real?** | (a) Recomendações #1+#2+#3+#5+#9 mergeadas; (b) Recomendação #6 (router WhatsApp) decidida via ADR; (c) Recomendação #7 (auditoria de dados em produção); (d) Recomendação #8 (lint customizado) | Bloqueante — não cabe no piloto |
| **Recomendação para `EXEC_TESTING`?** | **GO** com autorização separada | Roda **antes** do primeiro `EXEC_DEBT_ITEM`; rede de segurança contra regressão |
| **Recomendação para `PROPOSE_SPRINT`?** | **GO** com autorização separada | Proposta deve fatiar; humano valida no Gate #1 |
| **Recomendação para `EXEC_DEBT_ITEM`?** | **AGUARDA**: depois de Gate #1 + dry-run validado | Toca `lib/store-id-from-request.ts` (raiz) — exige supervisão humana ao vivo no piloto |

**Conclusão de readiness:** ⚠️ **READY com 3 ressalvas** — (1) escopo precisa ser explicitamente fatiado pelo humano; (2) `EXEC_TESTING` deve rodar antes; (3) `proxy.ts` em F-03 exige flag `--with-protected-areas` no piloto.

---

## 11. Referências

- Auditorias anteriores parciais: §8.
- Roadmap: [`docs/roadmaps/ROADMAP_MULTI_LOJA.md`](../roadmaps/ROADMAP_MULTI_LOJA.md).
- Status vivo: [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md), [`docs/status/DIVIDA_TECNICA.md`](../status/DIVIDA_TECNICA.md) (DT-03, DT-07), [`docs/status/RISCOS.md`](../status/RISCOS.md) (R-02 LGPD), [`docs/status/BLOCKERS.md`](../status/BLOCKERS.md) (BL-04, BL-08).
- ADRs relacionados: nenhum ainda — possível ADR-0003 "Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em leituras API" surgindo da Recomendação #1; possível ADR-0004 "Router WhatsApp Meta por `phone_number_id`" da Recomendação #6.
- Skills usadas: [`SKILL_AUDIT_MULTI_LOJA`](../skills/executoras/research/SKILL_AUDIT_MULTI_LOJA.md) v1 (esta execução).
- Skills sugeridas a seguir: [`SKILL_EXEC_TESTING`](../skills/executoras/execution/SKILL_EXEC_TESTING.md), [`SKILL_PROPOSE_SPRINT`](../skills/executoras/proposal/SKILL_PROPOSE_SPRINT.md), [`SKILL_EXEC_DEBT_ITEM`](../skills/executoras/execution/SKILL_EXEC_DEBT_ITEM.md), [`SKILL_PROPOSE_ADR`](../skills/executoras/proposal/SKILL_PROPOSE_ADR.md).
- Memórias relacionadas: `project_pdv_multi_terminais_fase1`, `project_pdv_multi_terminais_fase2_lock`, `project_importador_produtos_match_seguro` (defesa 3 camadas — modelo).
- Governança: [`docs/governance/GOVERNANCA.md §4`](../governance/GOVERNANCA.md) (áreas protegidas — `proxy.ts`, `lib/financeiro/*`), [`docs/execution/SAFE_GUARDS.md §3`](../execution/SAFE_GUARDS.md) (deny-list global).
- Pipeline: [`docs/execution/EXECUTION_ENGINE.md`](../execution/EXECUTION_ENGINE.md), [`docs/execution/HUMAN_GATES.md`](../execution/HUMAN_GATES.md).

---

## 12. Imutabilidade

Após `status = publicada`:
- **Conteúdo deste documento não é editado** (exceto correção tipográfica óbvia).
- Mudança de cenário (post-sprint) → nova auditoria `AUDITORIA_MULTI_LOJA_v02.md` com §8 (comparativo) preenchido apontando para esta v01.
- Entradas de evolução vão para o **EXECUTION_LOG** (ENTRY 004 anexada após esta auditoria).
