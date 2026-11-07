# RESULTADOS_DB_E_API — PostgreSQL real e rotas reais

## Ambiente
- **Local**: PostgreSQL 17.x descartável (`initdb` no scratchpad da sessão, `127.0.0.1:55471`, auth trust,
  banco `pdv_offline_sync_disposable`), schema **inalterado** materializado com `prisma db push --skip-generate`
  (109 tabelas). Nenhuma migration executada. O serviço PostgreSQL da porta 5432 da máquina não foi tocado.
- **CI**: job `postgres-integration` do workflow "Ramos e Cadastros" (PostgreSQL 16 do job, guard
  `assertIsolatedCadastrosDatabase`), via `scripts/cadastros/run-ramos-isolated-postgres.mjs`.
- Rotas reais executadas: `POST /api/ops/venda-persist/v2` e `GET /api/ops/vendas/by-client-sale-id`.
  Só sessão/autorização foram substituídas por mocks. Dados 100% sintéticos (lojas `off-a-*`, `off-b-*`).

## Suíte `lib/vendas/offline-sync.integration.test.ts` — 10/10 PASS (local, Node 22; JSON em `raw/vitest-postgres-integration.json`)
| Caso | Passos | Esperado | Observado |
|---|---|---|---|
| T12 | 1 POST + 9 replays sequenciais da mesma clientSaleId | 1 venda, estoque 5→4 uma vez, mesmo pedidoId, `replayed: true` nos 9 | igual; snapshot (vendas, itens, financeiro, ledger, estoque, série) idêntico após os replays |
| T14 | 10 POSTs **concorrentes** da mesma identidade | 1 venda, 1 `replayed:false`, 9 replays, 1 movimentação | igual (corrida resolvida pelo unique + replay em P2002) |
| T16/T17 | POST, depois consulta por clientSaleId | 200 com o MESMO pedidoId; outra loja 404; id inexistente 404 | igual |
| T34 | duas vendas idênticas com identidades distintas | 2 vendas, estoque −2 | igual |
| T19/T21 | linha com SKU inexistente; depois cadastro legítimo; reenvio da MESMA identidade | 409 PRODUTO_NAO_RESOLVIDO sem efeito; depois 200, 1 venda | igual |
| T23 | quantidade > estoque | 409 ESTOQUE_INSUFICIENTE, snapshot inalterado | igual |
| T25 | sessão de caixa original FECHADA | 409 CAIXA_ORIGINAL_FECHADO, nada lançado no caixa atual | igual |
| T27 | pagamento ≠ total | 409 PAGAMENTOS_TOTAL_DIVERGENTE, nada gravado | igual |
| T29 | mesma identidade com outro conteúdo | 409 IDEMPOTENCY_KEY_REUSED, original intacta | igual |
| T30/T43 | mesma clientSaleId na loja B | venda própria da B; loja A intacta | igual |

Resultado no CI: job `postgres-integration` do workflow "Ramos e Cadastros" PASS no head final `b6d4d90` (run 41672371685), rodando este mesmo arquivo. As rotas do servidor não foram alteradas por esta PR.

## Contrato cliente × servidor (OperationsProvider real × servidor-modelo)
`lib/vendas/offline-sync.component.test.ts` — **33/33 PASS**: o provider real (fila, finalização, automático,
manual) contra um modelo com o contrato observável do writer (idempotente por identidade, uma baixa e um
lançamento por venda criada, recusas sem efeito, falhas de rede/prazo/500/401/2xx inconclusivo/resposta perdida
após commit). Lista completa em `MATRIZ_TESTES_E2E.md`.
