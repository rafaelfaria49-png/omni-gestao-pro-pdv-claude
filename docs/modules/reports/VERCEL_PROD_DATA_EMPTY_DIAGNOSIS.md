# Diagnóstico — Vercel produção sem dados (localhost OK)

Data: 2026-05-08

## Sintoma

- Localhost (`:3000`): dados aparecem (lojas, clientes, produtos, vendas).
- Produção (Vercel): UI carrega, mas fica “zerado”:
  - “Nenhuma unidade ativa”
  - Clientes/produtos/vendas vazios

## Hipóteses avaliadas

### A) Banco/ENV diferente (produção apontando para DB vazio)

Se a Vercel estiver com `DATABASE_URL`/`DIRECT_URL` apontando para outro projeto/banco (ou env faltando), o Prisma vai ler um banco vazio — e o app “funciona” mas sem dados.

**Como validar sem risco**:

- Rodar o script `node scripts/check-prod-data.mjs` com as variáveis de produção exportadas localmente (read-only).
- Conferir se existem `Store`, `Cliente`, `Produto` e `Venda` no banco que a produção aponta.

### B) Resolução de storeId/unidade ativa

As rotas de dados (`/api/clientes`, `/api/produtos`, `/api/vendas` etc.) filtram por `storeId`. Se a unidade ativa não está sendo definida, o sistema pode cair em `LEGACY_PRIMARY_STORE_ID = "loja-1"` ou ficar sem contexto dependendo do fluxo.

### C) Cache em rotas de API no App Router

No Next.js App Router, rotas `GET` podem ser **cacheadas** se não forem explicitamente marcadas como dinâmicas. Se `/api/stores` for servido a partir de cache (por exemplo, uma resposta vazia/erro capturada durante build/primeiro hit), o frontend pode ficar sem lista de lojas e mostrar “Nenhuma unidade ativa”.

## Evidências encontradas no codebase

- `lib/loja-ativa.tsx` faz `fetch("/api/stores", { credentials: "include", cache: "no-store" })` para obter lojas.
- `app/api/stores/route.ts` **não** estava marcado como dinâmico.
- Já `app/api/clientes/route.ts` e `app/api/produtos/route.ts` estão com:
  - `export const dynamic = "force-dynamic"`
  - `export const revalidate = 0`

Isso cria um cenário plausível: produção pode estar recebendo `/api/stores` cacheado (ex.: vazio), causando UI sem unidade ativa e cascata de telas “zeradas”.

## Correção aplicada

### 1) Forçar `/api/stores` a ser dinâmico

Arquivo: `app/api/stores/route.ts`

- Adicionado:
  - `export const dynamic = "force-dynamic"`
  - `export const revalidate = 0`

Objetivo: impedir cache e garantir leitura ao vivo do Prisma em produção.

### 2) Script seguro de diagnóstico (read-only)

Arquivo: `scripts/check-prod-data.mjs`

Imprime:

- `counts`: stores / clientes / produtos / vendas
- stores (primeiras 25)
- top storeIds por entidade (groupBy)
- sanity check se existe `loja-1`

O script **não faz escrita**.

## Como validar na Vercel

1. Confirmar variáveis na Vercel (Production):
   - `DATABASE_URL`
   - `DIRECT_URL` (se usado)
   - (se aplicável ao seu stack) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Re-deploy após a correção de cache de `/api/stores`.
3. No browser em produção:
   - abrir `"/api/stores"` e verificar se retorna `stores` > 0
   - depois abrir Cadastros HUB e verificar contagens

Opcional:

- Rodar `node scripts/check-prod-data.mjs` com as envs de produção para confirmar que o banco tem dados.

## Riscos remanescentes

- Se a produção estiver realmente apontando para um banco diferente/vazio, a correção de cache não resolve sozinha — será necessário alinhar `DATABASE_URL`/`DIRECT_URL`.
- Se houver múltiplas lojas com dados, ainda depende de unidade ativa correta (cookie/localStorage/header). A lista de lojas via `/api/stores` é o primeiro passo para estabilizar isso no frontend.

