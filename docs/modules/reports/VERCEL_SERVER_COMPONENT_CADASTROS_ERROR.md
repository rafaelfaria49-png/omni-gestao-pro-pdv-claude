# Diagnóstico — Vercel: erro de Server Components no Cadastros HUB (Produtos)

Data: 2026-05-08

## Sintoma

Em produção (Vercel), ao abrir **Cadastros HUB → Produtos**:

> “An error occurred in the Server Components render. The specific message is omitted in production builds…”

No localhost tudo funciona.

## Causa provável

O erro é compatível com **exceção em Server Action** invocada pelo Cadastros HUB durante o carregamento da aba Produtos.

O Cadastros HUB (client) chama funções em `app/actions/cadastros.ts` (server actions). Se uma dessas funções faz query Prisma que falha no ambiente de produção (por divergência de schema/tabela, coluna ausente, ou outra condição), o Next.js “embrulha” como erro de Server Components em builds de produção.

Ponto crítico encontrado:

- `listProdutos(storeId)` em `app/actions/cadastros.ts` fazia `prisma.produto.findMany(...)` **sem** `withPrismaSafe`/try-catch.

Isso pode derrubar o render da aba Produtos em produção, mesmo que outras partes do app continuem.

## Correções aplicadas (mínimas)

### 1) Hardening em `listProdutos`

Arquivo: `app/actions/cadastros.ts`

- `listProdutos` agora:
  - tenta o `findMany` completo
  - se falhar, registra `console.error("[cadastros:listProdutos]", msg)`
  - faz fallback para um `select` mínimo via `withPrismaSafe` e retorna lista em formato `ProdutoDTO`

Objetivo: **evitar quebrar o render** e capturar o erro real nos logs da Vercel.

### 2) Rota de diagnóstico read-only

Arquivo: `app/api/debug/prod-health/route.ts`

Retorna (sem secrets):

- `NODE_ENV`
- booleans `hasDatabaseUrl` / `hasDirectUrl`
- contagens `Store/Cliente/Produto/Venda`
- top storeIds por entidade
- `storeIdResolved` da request (`storeIdFromAssistecRequestForRead`)
- probe de `produto.findFirst` com mensagem de erro (se houver) para detectar divergência de schema

## Como validar na Vercel

1. Abrir:
   - `GET /api/debug/prod-health`
   - `GET /api/debug/prod-health` com header `x-assistec-loja-id: loja-1` (se possível via ferramenta/cliente)
2. Em “Deployments → Logs”:
   - buscar por `"[cadastros:listProdutos]"`
   - e/ou ver `probes.produtoProbeError` na rota debug (se estiver falhando)
3. Reabrir Cadastros HUB → Produtos:
   - deve parar de “explodir” com erro genérico
   - deve listar produtos normalmente quando o banco estiver consistente

## Riscos remanescentes

- Se o banco de produção estiver com **schema realmente divergente** do Prisma gerado no deploy, o fallback pode listar parcialmente ou ainda retornar vazio; porém deixa logs claros para corrigir ENV/DB.
- A rota `/api/debug/prod-health` é diagnóstica. Quando estabilizar produção, pode ser removida ou protegida por `requireAdmin()`.

