# P02 — liberação progressiva do catálogo em Production

Objetivo: liberar **somente o cadastro** de grades, tamanhos, cores e variantes por loja autorizada, sem habilitar estoque, venda, PDV, etiqueta, GTIN ou Mercado Livre.

## Estado do banco validado antes deste release
- Projeto Neon: `dry-mouse-36002471`, branch `production`, database `omnigestao_prod`.
- Migration `20261115120000_vestuario_p02_grades_catalogo` aplicada com sucesso via `prisma migrate deploy` do projeto canônico.
- Cinco tabelas, seis CHECKs, oito FKs e seis triggers `vestuario_%` presentes; 29 migrations concluídas, nenhuma incompleta.
- A implementação de catálogo permanece sem registros iniciais; produto simples/estoque legado preservados.
- `MIGRATION_AUTHORITY_ENABLED=false` deve permanecer no Vercel Production; nunca é necessário religá-la para cadastrar grades.

## Gate privado de liberação (server-only)

O catálogo em Production somente aparece e aceita Server Actions quando **todas** as condições forem verdadeiras:

1. `VERCEL_ENV=production` e `VESTUARIO_CATALOG_PRODUCTION_ENABLED=1` (opt-in adicional).
2. `VESTUARIO_CATALOG_ENABLED=1` (flag privada, exatamente o literal "1").
3. A loja autorizada consta por ID exato em `VESTUARIO_STORE_ALLOWLIST` (IDs separados por vírgula; sem wildcard).
4. O servidor valida sessão, autorização da loja, entitlement e módulo `catalog` antes de qualquer acesso ao catálogo.

Em Preview/QA a flag de Production não é necessária, mas as condições de allowlist e módulo/sessão continuam válidas. Valores ausentes, `true`, `*` ou strings diferentes de `1` **não** abrem acesso.

O writer de estoque e o PDV continuam recusando produtos COM_GRADE pela política P01; `VESTUARIO_STOCK_ENABLED` e `VESTUARIO_SALE_ENABLED` nunca habilitam operações nesta fase, ainda que tenham valor "1".

## Sequência de ativação operacional

1. Integrar a PR de liberação somente após CI completo (Vitest, integração PostgreSQL, E2E, build).
2. Confirmar no Vercel a publicação do SHA específico, em Production.
3. Identificar a **loja piloto exata por ID**, aprovada pelo proprietário. Não adivinhar pela razão social; existem nomes de lojas repetidos no banco. Não habilitar todas as lojas.
4. Configurar apenas em Production as variáveis privadas:
   - `VESTUARIO_CATALOG_ENABLED=1`
   - `VESTUARIO_CATALOG_PRODUCTION_ENABLED=1`
   - `VESTUARIO_STORE_ALLOWLIST=<ID_EXATO_DA_LOJA_PILOTO>`
5. Publicar novo deployment com as variáveis efetivamente incorporadas, mantendo `MIGRATION_AUTHORITY_ENABLED=false`.
6. Testar autenticado no Cadastro de Produtos / Grades e variações: criar grade, tamanhos, cor HEX, produto com grade, duas variantes; conferir edição, isolamento de segunda loja e ausência de escrita de estoque/venda/ledger. Testes são **cadastros reais em Production**: usar somente a loja piloto expressamente aprovada e registros facilmente identificáveis, sem conversão de legado.
7. Revisar resultado com o dono antes de expandir `VESTUARIO_STORE_ALLOWLIST` a outras lojas.

## Rollback sem perda de dados

Desativar em Production `VESTUARIO_CATALOG_PRODUCTION_ENABLED` (definir `0` ou remover), publicar novo deployment e confirmar que a aba sumiu e as Server Actions recusam. **Não** executar `prisma migrate reset`, `db push`, excluir tabelas ou apagar registros. O banco permanece íntegro para reativação após correção.

A Vercel usa variáveis de ambiente congeladas no deployment: alteração de flag só vale após novo deployment. A mudança do código não ativa nada automaticamente enquanto as três flags não estiverem configuradas para a loja piloto.
