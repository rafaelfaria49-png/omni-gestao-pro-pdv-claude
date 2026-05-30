---
adr_id: ADR-0003
title: Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em leituras de API
status: aceito
data: 2026-05-29
sprint: SPRINT_MULTI_LOJA-S-001
commits: 6436d9b (F-01+F-02) · 2e6e7d5 (F-05+F-06+F-07+F-14)
aprovado_por: Rafael
---

# ADR-0003 · Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em leituras de API

## Contexto

`storeIdFromAssistecRequestForRead` resolvia o storeId via header → query → cookie → **`LEGACY_PRIMARY_STORE_ID = "loja-1"`**. O fallback silencioso era a raiz do DT-03: qualquer chamada sem contexto de loja caia em "loja-1" e lia/gravava dados da loja principal sem sinalizar o problema.

## Decisão

`storeIdFromAssistecRequestForRead` retorna `null` quando nenhuma fonte resolve. Toda rota chamadora deve:

1. Verificar `if (!storeId) return 400 { error: "storeId obrigatório" }`.
2. (Rotas sensíveis F-05+) Verificar `if (!canAccessStore(session, storeId)) return 403`.

**Exceção declarada (encerrada):** `app/api/financeiro/relatorios/exportar/route.ts` — rota acessada via anchor-tag (`<a href>`), que não envia header. Mantinha `|| "loja-1"` com `// TODO F-02-anchor`. **Resolvido em SPRINT_MULTI_LOJA-S-002:** o fallback foi removido; `storeId` ausente retorna 400. O caller já envia `storeId` na query string, então a exportação segue funcional sem o fallback.

## Consequências positivas

- **Failure mode visível:** 400 imediato substitui leitura silenciosa cross-tenant.
- **DT-03 fechado:** eliminado o vetor principal de vazamento cross-store.
- **Paridade ForRead/ForWrite:** ambas as funções agora retornam `null` sem contexto.

## Consequências negativas / dívida assumida

- ~~Exceção `exportar/route.ts` mantém fallback temporário (Sprint_02).~~ Encerrada em SPRINT_MULTI_LOJA-S-002 (fallback removido, 400 quando ausente).
- `lib/whatsapp-webhook-ai.ts` usa `WHATSAPP_WEBHOOK_STORE_ID` env — se não configurado, o serviço envia mensagem com zeros (degradado, não quebrado).

## Alternativas descartadas

- **Dual-mode com flag de transição:** descartado — flags de tenancy raramente são removidas e mascaram regressões.
- **Manter fallback:** descartado — falha silenciosa é estritamente inferior à falha visível.

## Referências

- Finding F-01 · `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md`
- SPRINT_MULTI_LOJA-S-001 · `docs/sprints/proposals/SPRINT_MULTI_LOJA-S-001.md`
- ADR-0002 · workaround `allowed_paths: dynamic` para override de `files_max`
