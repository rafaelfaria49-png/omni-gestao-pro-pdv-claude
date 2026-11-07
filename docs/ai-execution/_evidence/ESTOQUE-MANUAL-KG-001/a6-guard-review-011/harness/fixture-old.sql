-- Synthetic subset. Five actual column names, int4/default/NOT NULL contracts.
SET ROLE omni_owner;
CREATE TABLE public.estoque_produtos (
  id text PRIMARY KEY, stock integer NOT NULL DEFAULT 0, metadata jsonb
);
CREATE TABLE public.produto_depositos (
  id text PRIMARY KEY, "produtoId" text NOT NULL, quantidade integer NOT NULL DEFAULT 0
);
CREATE TABLE public.movimentacoes_estoque (
  id text PRIMARY KEY, "produtoId" text, quantidade integer NOT NULL,
  "estoqueAntes" integer NOT NULL, "estoqueDepois" integer NOT NULL
);
-- Represents a future stock-related sale transaction, not the app's sale schema.
CREATE TABLE public.a6_sales (id text PRIMARY KEY, quantidade double precision NOT NULL);
INSERT INTO public.estoque_produtos(id,stock,metadata) VALUES
  ('a6-un',13,'{"comercial":{"version":1,"modoVenda":"unidade","unidade":"UN","basePreco":"UN"}}'),
  ('a6-kg',0,'{"comercial":{"version":1,"modoVenda":"peso","unidade":"KG","basePreco":"KG"}}'),
  ('a6-int4-max',2147483647,NULL), ('a6-int4-min',-2147483648,NULL);
INSERT INTO public.produto_depositos(id,"produtoId",quantidade) VALUES
  ('a6-dep-un','a6-un',13),('a6-dep-kg','a6-kg',0);
INSERT INTO public.movimentacoes_estoque(id,"produtoId",quantidade,"estoqueAntes","estoqueDepois") VALUES
  ('a6-ledger-un','a6-un',0,13,13),('a6-ledger-kg','a6-kg',0,0,0);
