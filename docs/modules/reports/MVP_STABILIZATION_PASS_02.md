# MVP — Estabilização passo 02 (produção, rotas críticas, smoke)

**Data:** 2026-05-08  
**Escopo:** checklist de deploy, script de smoke read-only, revisão de `GET` com Prisma sujeitas a cache indevido no App Router — **sem** migration, schema Prisma, auth, billing, WhatsApp Cloud API ou Omni Agent.

---

## 1. Artefatos criados

| Artefato | Descrição |
|----------|-----------|
| `docs/deploy/PRODUCTION_CHECKLIST.md` | Roteiro: ENV Supabase, build, rotas dinâmicas, smoke, validação manual por módulo. |
| `scripts/smoke-production.mjs` | `GET` read-only em `/`, `/api/stores`, `/api/debug/prod-health`, ops list (receber/pagar/ordens). |

---

## 2. Rotas GET revisadas (cache)

**Já estavam** com `dynamic = "force-dynamic"` + `revalidate = 0` (amostra):  
`/api/stores`, `/api/debug/prod-health`, `/api/clientes`, `/api/produtos`, `/api/ops/contas-receber-list`, `/api/ops/contas-pagar-list`, `/api/ops/ordens`, `/api/ordens-servico`, `/api/financeiro/analytics`, `/api/dashboard/resumo`, `/api/dashboard/elite`, `/api/ops/vendas-list`, `/api/ops/inventory`, `/api/ops/categorias-produto`, `/api/clients`.

**Alteradas neste passo** (mesmo padrão):

| Rota | Motivo |
|------|--------|
| `GET /api/stores/[id]` | `findUnique` Store — evitar snapshot cacheado por segmento. |
| `GET /api/stores/[id]/settings` | `findUnique` StoreSettings. |
| `GET /api/ops/import/clientes` | `findMany` cliente por loja. |
| `GET /api/settings/perfil-loja` | `findUnique` Store + resolução de perfil. |
| `GET /api/audit/logs` | Lista Prisma com filtros — não deve servir dados stale nem públicos por engano (continua 403 sem admin). |

**Não alteradas (deliberado):**

- Rotas **auth**, **billing/subscription**, **WhatsApp** — fora do pedido ou já marcadas noutros arquivos.
- Rotas sem `GET` Prisma crítico para “loja vazia” (ex.: apenas `POST`).

---

## 3. Como rodar o smoke test

```bash
BASE_URL=https://seu-app.vercel.app node scripts/smoke-production.mjs
```

Com header de loja (quando o deploy espera `x-assistec-loja-id`):

```bash
BASE_URL=https://seu-app.vercel.app X_ASSISTEC_LOJA_ID=id-da-loja node scripts/smoke-production.mjs
```

**Comportamento:** apenas `GET`; não envia body; não imprime variáveis de ambiente locais além de `BASE_URL` e do ID de loja opcional; resume HTTP, se parseou JSON e contagens quando aplicável. **401/403** em `/api/ops/*` são aceitáveis sem cookie de assinatura/sessão.

---

## 4. Checklist de produção

Ver **`docs/deploy/PRODUCTION_CHECKLIST.md`** (fonte única para pré/pós-deploy).

---

## 5. Riscos remanescentes

- Smoke **não** substitui login real: rotas ops podem falhar por gate de assinatura sem indicar bug de cache.
- **`GET /api/audit/logs`** permanece restrito a admin; smoke não valida essa rota (evita ruído).
- Outras rotas `GET` menos usadas no fluxo “loja ativa” podem ser adicionadas à revisão em passos futuros.

---

## 6. Referências

- Passo 01 (UI honesta): `docs/modules/reports/MVP_STABILIZATION_PASS_01.md`
- Diagnóstico cache `/api/stores`: `docs/modules/reports/VERCEL_PROD_DATA_EMPTY_DIAGNOSIS.md`
