# D02-A — Migrations seguras do Omni Print (relatório técnico)

- **GOAL:** `OMNI-PRINT-D02-MIGRATIONS-SEGURAS-001`.
- **Decisão:** opção D02-A aprovada pelo proprietário (estratégia).
- **Base:** `1b2912c` (PR #327). Branch `claude/omni-print-d02-migrations-seguras`, PR própria em rascunho apontada para
  a branch da #327.

**Não executa nada:**

- nenhum acesso ao banco de produção, migration aplicada, deploy ou variável alterada;
- nenhum branch Neon criado;
- `APPROVED_RELEASE` continua `null` e o recurso segue desligado.

A execução real depende de nova aprovação do proprietário: `PRODUCTION_EXECUTION=PENDING_OWNER_APPROVAL`.

Roteiro operacional: [`RUNBOOK_D02.md`](RUNBOOK_D02.md).

## Entregas por item do pedido

| Item | Como ficou | Onde |
|---|---|---|
| 1. Head da #327 | Base `1b2912c`: CI verde e a #329 já integrada pelo proprietário. Nada a incorporar | — |
| 2. Plano D02-A | Seguido passo a passo (preparo, alvo, backup, janela, registro antes do merge, validação, rollback) | `DECISOES_PROPRIETARIO_OMNI_PRINT.md` §D02 |
| 3. Dois conjuntos | **(i)** duas pastas, cada uma com um único `CREATE UNIQUE INDEX CONCURRENTLY` (o Prisma só o executa fora de transação assim). **(ii)** uma pasta com 01-futura + 02 numa única transação e `lock_timeout` 2 s | `tools/print-d02/migrations/` |
| 4. CUT_GUARD exata | O núcleo é byte a byte o `CUT_II()` do ensaio, precedido só de comentários. O teste extrai a `CUT_GUARD` do arquivo do ensaio e compara | `cut.mjs`, `d02-guard.test.ts` |
| 5. Sem aplicação parcial | (ii) é uma transação: desistir não deixa nada (testes 3 e 7). (i): cada índice é um comando; um índice que desiste fica `INVALID`, e a ferramenta para e oferece `--repair-invalid` (teste 4). A ferramenta confere o estado depois de cada falha | `d02.mjs` |
| 6. Dados preservados | Hash de todas as tabelas fora de `print_*` e do registro do Prisma, idêntico antes e depois. Cobre vendas, itens, estoque, movimentações, caixa, operações de caixa, usuários e lojas, clientes e terminais (testes 2 e 8) | `d02-migrations.pg.test.ts` |
| 7. Exclusão de loja | `DELETE /api/stores/[id]` responde 409 com o motivo quando a loja tem registros de impressão. A corrida entre a checagem e a exclusão (FK `p004_fk_*`) recebe a mesma mensagem. As tabelas são descobertas pelo catálogo (sem tabelas, não bloqueia nem dá erro) | `lib/printing/direct/store-print-links.ts`, `app/api/stores/[id]/route.ts` |
| 8. Histórico do Prisma | `d02.mjs promote` + `resolve` (só com o banco aplicado). LF garantido por `.gitattributes`. `migrate deploy`, `dev`/`reset` e índice inválido documentados com o comportamento medido | `RUNBOOK_D02.md` §6, §10 |
| 9. Nada executável na main antes da hora | As pastas ficam em `tools/print-d02/migrations/`. O `d02-guard` falha se alguma aparecer em `prisma/migrations` sem `APLICACAO.json` = `APLICADA_E_REGISTRADA`, ou se outra migration criar objetos de impressão. Roda no CI pelo workflow novo `omni-print-d02-guard.yml` | `d02-guard.test.ts`, `APLICACAO.json`, `.github/workflows/omni-print-d02-guard.yml` |
| 10. Plano operacional | Identificação do alvo (a ferramenta recusa pooler, banco ou host diferente e papel que não é dono de `vendas`), backup, janela, aplicação, validação, rollback por desativação, critérios de parada | `RUNBOOK_D02.md` |
| 11. Testes em PG descartável | 8 cenários (abaixo) | `d02-migrations.pg.test.ts` |
| 12–13. Validações e revisão | Ver "Validação" e `REVISAO_INDEPENDENTE.md` | — |

## Ferramenta do operador (`tools/print-d02/d02.mjs`)

| Comando | O que faz |
|---|---|
| `status` | Estado: `BASELINE`, `INDEXES_PARTIAL`, `INDEXES_INVALID`, `INDEXES_READY`, `CORE_APPLIED` ou `INCONSISTENT`, mais as linhas em `_prisma_migrations` |
| `apply-indexes` | Cada índice com `lock_timeout` 5 s; mantém o válido; para diante de um inválido, a não ser com `--repair-invalid` |
| `apply-core` | Só a partir de `INDEXES_READY`; até 3 tentativas espaçadas; para em erro que não seja de lock |
| `verify` | 11 tabelas, 7 funções, 2 índices válidos, 46 gatilhos, restrições validadas, dono e `PUBLIC` sem privilégio. Com `--prisma`, também as 3 linhas e os checksums |
| `promote` | Copia para `prisma/migrations` com bytes idênticos |
| `resolve` | `prisma migrate resolve --applied` para as 3 pastas, só em `CORE_APPLIED`, e termina com `verify --prisma` |

## Testes (PostgreSQL 17 descartável; nada contra outro banco)

O banco de partida espelha a produção: o schema da `main`, com todas as migrations da `main` registradas em
`_prisma_migrations`. Cada cenário usa um clone dele.

| # | Cenário | Resultado |
|---|---|---|
| 1 | Banco vazio: aplicação completa, `migrate status` em dia, `migrate deploy` sem pendências (também com o diretório da `main`, sem as pastas: a janela entre o `resolve` e o merge), `migrate diff` vazio contra `prisma/schema.prisma` (paridade) | PASS |
| 2 | Banco com dados: hash de tudo fora de `print_*` idêntico; venda e impressão funcionam depois; a loja com pareamento é bloqueada pela FK de impressão e o erro real do Prisma é reconhecido | PASS |
| 3 | Venda simultânea: os índices não seguram vendas; o núcleo desiste em ~2 s, o heartbeat não espera e a venda na fila grava; tentativas espaçadas aplicam | PASS |
| 4 | Índice inválido: venda aberta além de 5 s; a ferramenta para (saída 3), o núcleo recusa, a reexecução manual falha com `already exists` e `--repair-invalid` recria | PASS |
| 5 | Reexecução: a ferramenta reconhece o já aplicado; a reexecução crua dos arquivos falha sem mudar o catálogo; o `resolve` não duplica | PASS |
| 6 | Falhas entre etapas: parada entre os índices; núcleo antes dos índices (a verificação do arquivo aborta); aplicado sem registro; cópia CRLF recusada; alvo errado, pooler, porta 6543 e papel que não é dono recusados | PASS |
| 7 | `prisma migrate deploy`: aplica; o núcleo que desiste por lock não deixa nada, mas deixa a linha sem `finished_at` (`P3009` até `resolve --rolled-back`); depois aplica, e a ferramenta reconhece a linha aplicada apesar da linha `rolled_back` | PASS |
| 8 | Rollback por remoção: dados intactos; `resolve --rolled-back` não serve para migration aplicada; sem o registro, um `migrate deploy` com as pastas presentes **reaplica** | PASS |

Unitários:

- `d02-guard.test.ts` (6): recorte, `CUT_GUARD`, um comando por pasta de índice, LF e proteção do build;
- `store-print-links.test.ts` (6): consulta parametrizada; a rota responde 409 com e sem corrida; a mensagem genérica
  continua para outras FKs.

O ensaio D02 original (`d02-rehearsal.pg.test.ts`, 5/5) continua na bateria.

## Riscos residuais

- **Tempo dos índices com o volume real:** só se mede numa cópia da produção (branch Neon), que depende de autorização
  separada. Até lá, o `lock_timeout` de 5 s e o reparo cobrem o pior caso sem afetar vendas.
- **`migrate deploy` com o núcleo pendente:** se alguém promover as pastas sem a aplicação manual, o deploy de produção
  tenta aplicá-las. O núcleo pode desistir por lock e travar os deploys seguintes (`P3009`). Mitigado pelo `d02-guard`,
  que roda no CI (workflow `omni-print-d02-guard.yml`), na bateria local e no `npm test`.
- **Rollback com as pastas na `main`:** remover as tabelas sem reverter as pastas faz o próximo deploy reaplicá-las.
  Documentado no §9 do roteiro.
- **Histórico do Prisma:** não recria um banco vazio (falha na `0005`). É pré-existente e fora do escopo; impede
  `migrate dev` neste repositório.
- **Homologação física:** pendente (`PHYSICAL_HOMOLOGATION=PENDING`).
