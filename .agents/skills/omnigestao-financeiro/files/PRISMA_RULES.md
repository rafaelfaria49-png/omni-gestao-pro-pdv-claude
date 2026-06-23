# OmniGestão Pro — Prisma / dados

## Fonte canônica

- `prisma/schema.prisma`
- `docs/architecture/BACKEND.md` — fluxos Server Actions, services, adapters.

## Multi-store

- Todo acesso Prisma a dados de negócio deve filtrar por **`storeId`** coerente com a loja ativa.
- `storeId` vem do header `x-assistec-loja-id`, sessão ou helper (`lib/store-id-from-request.ts` / contexto de loja).

## Payload JSONB

- Muitos modelos guardam estado rico em **`payload`** (Json). Enums de coluna podem ser visão colapsada; a fonte de verdade operacional pode estar no payload.
- Alterações em payload: preferir serviços que fazem merge/patch validado (ex.: `lib/operacoes/services/payload-service.ts`).

## Idempotência financeira

- Operações financeiras usam **`localKey`** único por loja. Ver skill **omnigestao-financeiro** e `lib/financeiro/contracts/local-key.ts`.
- **Nunca** alterar o prefixo legado `os-faturamento:` sem plano de migração.

## Gerado

- `generated/prisma/` é **gerado** — não editar à mão. Rodar `npm run prisma generate` após mudanças de schema.

## Migrações

- Dev: `npm run db:push` (sem histórico formal).
- Produção: `npm run db:migrate` (interativo / versionado).
