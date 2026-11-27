# G002 — os 31 casos M1 desligados (registro, sem ampliação)

Arquivo: `test/gastos/writers-routes.postgres.test.ts`, chave `const M1_ROTAS_LIGADAS = false` (linha ~120),
introduzida na reconciliação `OMNI-GESTOR-MONEY-MAIN-RECONCILIATION-001`. Esta missão **não** criou, ampliou nem
alterou essas exclusões; a CI (`Gestor Money PG`, grupo g002) as mostra como 31 pulados explícitos dentro de um
arquivo que executa os demais 60 testes.

## Motivo registrado no código

O caminho M1 de rota (`idempotencyKey` + recibo `aplicarPagamentoLegado`) **não** foi ligado a `PATCH
/api/financeiro/pagar`, `PATCH /api/financeiro/receber` nem `POST /api/pdv/receber-conta`. Esses handlers mantêm o
contrato da #397 (título travado + CAS + `restanteEsperado`/`pagoEsperado`), coberto por `recebimento-atomico.test.ts`,
`pagar/receber-liquidar-saldo` e pelas suítes F9. Religar exige o GOAL de ativação que ligue o M1 às rotas.

## Inventário (31)

| Linha | Caso | Instâncias |
|---|---|---|
| 164 | M1 `pagar`/`receber` preserva duas parciais iguais de intenções distintas no handler real | 2 |
| 189 | M1 PDV singular conserva duas parciais iguais, dois movimentos e dois caixas | 1 |
| 198 | M1 PDV: caixa fechado sem commit libera a intenção e nova sessão recebe uma única vez | 1 |
| 229 | M1 `pagar`/`receber`/`pdv`: conta inativa/estrangeira/inexistente/perfil inativo é rejeição tipada sem efeito | 12 |
| 271 | M1 `pagar`/`receber`/`pdv`: resposta perdida após commit e reabertura conservam chave e efeito | 3 |
| 322 | M1 `pagar`/`receber`/`pdv` recusa identidade ausente, conteúdo divergente e loja estrangeira | 3 |
| 334 | M1 `pagar`/`receber`/`pdv`: requests concorrentes iguais e distintos disputam locks PostgreSQL | 3 |
| 366 | M1 `pagar`/`receber`/`pdv`: falha SQL no saldo nunca vira HTTP sucesso e retry usa mesma identidade | 3 |
| 389 | M1 PDV falha no caixa reverte também título, movimento, saldo e perfil | 1 |
| 407 | M1 PDV conserva recibo legado sem backfill (ledger consistente = sim/não) | 2 |

## Relação com a integração HUB→G004 desta missão

Com `GESTOR_MONEY_ENABLED=true`, `PATCH /api/financeiro/pagar` (liquidar/parcial/estornar) passou a usar o **motor
G004** (`pagarTituloHub`/`estornarPagamentoHub`), não o M1. Os contratos que o M1 de `pagar` provaria (chave conservada,
resposta perdida, recusa tipada sem efeito, identidade/loja, falha SQL → 503 com a mesma chave) são provados para o
G004 em `test/gastos/operacoes-http.postgres.test.ts` (3 casos HUB religados) e `test/gastos/hub-pagar-g004.postgres.test.ts`
(navegador real). Os casos M1 de `receber` e `pdv` continuam sem rota ligada — pendência do GOAL de ativação.
