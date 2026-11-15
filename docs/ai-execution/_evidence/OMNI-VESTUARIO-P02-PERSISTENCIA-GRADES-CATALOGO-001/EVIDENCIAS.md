# OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001 — evidências

Base `cdce14a3d049e1977ecd295a4b0d15c501dc995e` (main com P01/#357). Execução 15/11/2026, Windows, PostgreSQL 17
descartável local (data_directory no scratchpad da sessão, porta própria). Dados 100% sintéticos.
`PRODUCTION_WRITES=0` · `PRODUCTION_MIGRATIONS=0` · nenhum banco remoto (Neon/Supabase) foi acessado.

## Migration (`ensaio-migration.sh` → `ENSAIO_MIGRATION.txt`) — PASS

1. Banco vazio com schema da main + 27 migrations registradas → P02 aplicada pelo `prisma migrate deploy`.
2. Banco com legado (2.001 produtos, 400 com `metadata` livre/`gradePlanejada`) → checksum de id/sku/barcode/nome/
   saldo/preço/metadata **igual** antes e depois; 0 produtos com grade e 0 variantes criados (sem backfill).
3. Reaplicação: `migrate deploy` = "No pending migrations"; seção fora do Prisma reexecuta sem erro (idempotente).
4. Drift banco × `schema.prisma`: zero.
5. 20 recusas no banco (combinação duplicada, SKU duplicado, SKU × produto legado com caixa/espaço diferentes,
   código interno × SKU de outra variante, produto legado novo/editado com código de variante, SKU não normalizado,
   cor/tamanho/grade/produto de outra loja, trocar cor da variante, trocar grade do produto, excluir variante, excluir
   cor/tamanho usados, renomear tamanho usado, excluir pai com grade, HEX inválido, preço negativo) e 4 aceites
   (tamanho não usado editável, cor usada renomeável, edição legada comum, mesmo SKU em outra loja).
6. Rollback operacional: recusado com dados; sem dados remove tudo e preserva produtos; reaplicação posterior OK.

## Testes

| Suíte | Resultado |
|---|---|
| Integração PG real `lib/vestuario/catalog-service.integration.test.ts` | 19/19 — 2× isolada e 6× junto das demais suítes (5 verdes; 1 falha única no teste de `lock_timeout`, na primeira execução após a mudança, não reproduzida nas 7 seguintes — registrada como observação de timing a acompanhar no CI) |
| Unitários + regressões (vestuario, writer de produto, create-tx, ledger de estoque, writers de venda V1/V2, acesso de cadastros) | 397/397 |
| E2E autenticado (`scripts/vestuario/run-vestuario-p02-e2e.mjs`: `next start` do build de produção, NextAuth real, PG descartável) | 3/3 — `e2e/isolation.json` |
| `npm run typecheck` | 0 erros |
| `npm run build` | Compiled successfully; `MIGRATION_SKIPPED` |
| ESLint do escopo | 0 problemas |

Cenários da integração: grades adulto/jeans/calçados 33–45/infantil e cores por loja; duplicidade normalizada sem
bloquear nomes distintos; camiseta P/M/G/GG × Preto/Branco/Azul só com as combinações escolhidas (rascunho, sem
código fabricado, estoque 0, auditoria); grade numérica; cor editada preservando identidade; tamanho usado não
renomeável e desativado bloqueando variação nova; SKU/código interno duplicados nos três sentidos (inclusive
writer canônico legado → `DUPLICATE`); duas lojas e todas as tentativas cross-store; variante inexistente; payload
com `storeId`; exclusões barradas; legado com metadata livre/`gradePlanejada` intacto; P01 (venda com variante,
estoque do pai e da variante e editor legado recusados; nenhum ledger/saldo/depósito); edição do pai com concorrência
otimista; concorrência real (mesmo SKU em dois cadastros simultâneos, variação × produto simples, versão da variante);
lock compartilhado (legado × legado em paralelo, variação espera e enxerga colisão); `lock_timeout` → CONFLICT em ~3 s;
SKU do pai (trigger real na mesma sessão) e colisões; limite INT4 do preço; campo longo; grade desativada.

E2E: grades e reordenação, cores (criar/renomear/duplicidade), matriz com 10 de 12 combinações, SKU de variação,
colisão com SKU legado recusada sem gravar, desativação sem apagar, tamanho em uso bloqueado, modalidade simples ×
grade no Cadastro de Produtos, P01 na UI legada (estoque recusado), troca de loja sem vazamento, loja fora da
allowlist sem aba, usuário só da loja B, mobile 390 px sem rolagem horizontal. Capturas em `e2e/`.

## Revisão independente

R1 via Codex (OpenAI) interrompida por limite de uso da conta, sem veredito. Plano B: revisor Claude de contexto
limpo, somente leitura → `APPROVE_WITH_CHANGES`, sem P0/P1. Todos os achados tratados: P2 `lock_timeout` + doc;
reformatação do schema revertida (diff só aditivo, 152 linhas); P3 mensagem do update legado, limite INT4, reload
na UI, `FOR SHARE` contra TOCTOU e grade desativada, campo longo, teste do SKU do pai, limitação dos writers legados
documentada. O E2E encontrou e a branch corrigiu ainda: `instanceof` de erro Prisma falhando no bundle do Next e
"em uso" desatualizado na seção de grades.
