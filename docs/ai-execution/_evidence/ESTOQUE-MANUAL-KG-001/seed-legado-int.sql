-- Dados legados SINTÉTICOS no schema da main (colunas integer). Banco descartável local.
INSERT INTO stores (id, name, "updatedAt") VALUES
  ('kgiso-a', 'Padaria Sintética KG A', now()),
  ('kgiso-b', 'Comércio Sintético KG B', now());
INSERT INTO depositos (id, "storeId", nome, codigo, principal) VALUES
  ('kgiso-dep-a', 'kgiso-a', 'Depósito Principal', 'principal', true),
  ('kgiso-dep-b', 'kgiso-b', 'Depósito Principal', 'principal', true);
INSERT INTO estoque_produtos (id, "storeId", name, stock, price, metadata, "updatedAt") VALUES
  ('kgiso-un-10',  'kgiso-a', 'Refrigerante Sintético UN', 10, 7.5, '{}'::jsonb, now()),
  ('kgiso-un-0',   'kgiso-a', 'Bolo Sintético UN', 0, 30, '{}'::jsonb, now()),
  ('kgiso-un-max', 'kgiso-a', 'Limite int4 Sintético UN', 2147483647, 1, '{}'::jsonb, now()),
  ('kgiso-kg-legado', 'kgiso-a', 'Queijo Sintético legado vendaPorPeso', 4, 50, '{"vendaPorPeso": true}'::jsonb, now()),
  ('kgiso-pao-kg', 'kgiso-a', 'PAO FRANCES SINTETICO', 0, 20, '{"comercial":{"version":1,"modoVenda":"peso","unidade":"KG","basePreco":"KG"}}'::jsonb, now()),
  ('kgiso-b-un',   'kgiso-b', 'Produto Sintético loja B', 5, 3, '{}'::jsonb, now());
INSERT INTO produto_depositos (id, "storeId", "produtoId", "depositoId", quantidade) VALUES
  ('kgiso-pd-1', 'kgiso-a', 'kgiso-un-10', 'kgiso-dep-a', 10),
  ('kgiso-pd-2', 'kgiso-a', 'kgiso-un-max', 'kgiso-dep-a', 2147483647),
  ('kgiso-pd-3', 'kgiso-a', 'kgiso-kg-legado', 'kgiso-dep-a', 4),
  ('kgiso-pd-4', 'kgiso-b', 'kgiso-b-un', 'kgiso-dep-b', 5);
INSERT INTO movimentacoes_estoque (id, "storeId", "produtoId", "produtoNome", tipo, origem, quantidade, "estoqueAntes", "estoqueDepois", "createdAt") VALUES
  ('kgiso-mov-1', 'kgiso-a', 'kgiso-un-10', 'Refrigerante Sintético UN', 'entrada', 'manual', 12, 0, 12, now() - interval '2 day'),
  ('kgiso-mov-2', 'kgiso-a', 'kgiso-un-10', 'Refrigerante Sintético UN', 'saida', 'pdv', -2, 12, 10, now() - interval '1 day'),
  ('kgiso-mov-3', 'kgiso-a', 'kgiso-kg-legado', 'Queijo Sintético legado vendaPorPeso', 'entrada', 'manual', 4, 0, 4, now() - interval '1 day');
