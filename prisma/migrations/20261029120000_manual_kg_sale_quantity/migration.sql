-- Separate from PR #315. Apply only after draining all old Int clients.
-- Integer historical quantities are represented exactly by double precision.
ALTER TABLE "venda_itens" ALTER COLUMN "quantidade" TYPE DOUBLE PRECISION USING "quantidade"::DOUBLE PRECISION;
