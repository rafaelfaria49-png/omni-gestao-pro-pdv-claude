# CAD-R2-019 — CLOSED — backfill de produção verificado

Em 15/10/2026, o script oficial preencheu 49 chaves pendentes em `omnigestao_prod`. A reexecução escreveu zero linhas. A auditoria posterior, as 172 regressões pertinentes e o smoke read-only passaram. A implementação da PR #209 foi preservada; CAD-R2-020 não foi iniciado.

```text
GOAL=CAD-R2-019
RESULT=PASS
MAIN_CURRENT=4a85dd95202b56873487b31c318fc2d751fc26f5
CANONICAL_DATABASE=omnigestao_prod
DATABASE_AUTHORITY=OWNER+OFFICIAL_NEON_CLI+LIVE_READ_ONLY_IDENTITY; FINGERPRINT=c4f2567332c8f613
BACKUP_CONFIRMED=YES_PERMANENT_SNAPSHOT+PREWRITE_PITR_6H; RESTORE_NOT_EXECUTED
MIGRATIONS=PASS_22_CLEAN_CHECKSUMS_MATCH_HISTORY_UNCHANGED
PREFLIGHT=PASS_BEFORE_AND_AFTER
BACKFILL_EXECUTED=YES_OFFICIAL_SCRIPT
DOCUMENT_KEYS_FILLED=49
BACKFILL_RERUN_WRITTEN=0
UNIQUE_ACTIVE=YES_VALID_STOREID_DOCUMENTKEY_DISTINCT_NULLS
POST_BACKFILL_AUDIT=PASS
PRODUCTION_SMOKE=PASS_READ_ONLY_BUILD_4a85dd95202b
DATABASE_DATA_LOSS=NO
CAD_R2_019_STATUS=CLOSED
READY_FOR_020=YES
```

## Conexão e recuperação

A sessão oficial Neon CLI 8.4.5 confirmou o projeto `dry-mouse-36002471` (`omnigestao-migracao`), branch `br-muddy-meadow-ac7ah2wl` (`production`) e database `omnigestao_prod`. A conexão direta obtida em memória corresponde ao fingerprint histórico `c4f2567332c8f613`. A sonda existente, em transação `REPEATABLE READ, READ ONLY`, confirmou `current_database()` igual a `omnigestao_prod`, schema public e PostgreSQL 17.11. Nenhum arquivo `.env` foi lido; a worktree isolada não contém `.env`.

O snapshot `snap-little-hat-acjrs3lh`, `production at 2026-10-09 01:04:00 UTC (manual)`, permanece listado para a mesma branch, sem expiração, com 127418368 bytes. A recuperação do snapshot já havia sido verificada pelas opções do painel oficial; nenhum restore foi executado. A retenção atual de histórico de 21600 segundos foi reconfirmada. O instante imediatamente anterior ao write, `2026-10-15T13:52:05.983Z`, foi registrado como referência de recuperação pelo histórico contínuo, junto ao snapshot permanente. Não foi necessário criar outro snapshot ou alterar outra branch/database.

## Gates e execução oficial

| Verificação | Antes | Depois |
| --- | ---: | ---: |
| Clientes | 275 | 275 |
| Documentos fortes | 51 | 51 |
| documentKey não NULL | 2 | 51 |
| Chaves divergentes | 49 | 0 |
| Documentos vazios com NULL | 215 | 215 |
| Documentos inválidos com NULL | 9 | 9 |
| Duplicidades fortes na mesma loja | 0 | 0 |
| Reutilizações entre lojas | 18 | 18 |
| Migrations consistentes | 22 | 22 |

Os valores históricos 272/49/0 não foram presumidos como atuais. Os três clientes adicionais e as duas chaves fortes já canônicas foram respeitados. O dry-run planejou exatamente 49 chaves fortes, zero limpezas para NULL e zero colisões. O índice UNIQUE composto por storeId e documentKey já estava válido e pronto, com NULLs distintos.

As únicas invocações capazes de escrever foram duas chamadas de `scripts/cad-r2-019-document-backfill.ts --exec`, inalterado na main. A primeira terminou às `2026-10-15T13:52:09.193Z` com scanned=275, planned=49, written=49 e RESULT=PASS; a segunda, às `2026-10-15T13:52:09.607Z`, terminou com alreadyCanonical=275, planned=0, written=0 e RESULT=PASS. O classificador usado foi o canônico existente; não houve outro motor de normalização, auto-merge ou escolha de survivor.

O preflight oficial posterior passou. O auditor read-only já existente confirmou zero divergências, UNIQUE válida, estrutura e checksums correspondentes às migrations versionadas. `prisma migrate status` retornou clean com 22 migrations antes e depois; o histórico permaneceu idêntico. Nenhuma migration, resolve, db push ou SQL manual foi executado. A UNIQUE foi comprovada pelo catálogo real do PostgreSQL e por seus testes unitários; nenhum INSERT/UPDATE de teste foi feito em produção.

## Integridade e limites

O conjunto dos 275 IDs e o hash dos demais atributos escalares de Cliente permaneceram idênticos. Apenas `documentKey` e o `updatedAt` automaticamente mantido pelo Prisma foram excluídos da comparação, conforme o comportamento do script oficial. Nenhum cliente desapareceu ou recebeu alteração nos atributos protegidos; os documentos de apresentação/legado foram preservados.

| Contagem operacional | Antes | Depois |
| --- | ---: | ---: |
| Lojas | 10 | 10 |
| Clientes | 275 | 275 |
| Produtos | 14106 | 14106 |
| Vendas | 2156 | 2156 |
| Ordens de serviço | 31 | 31 |
| Movimentações de estoque | 2428 | 2428 |

O programa de escrita atualiza exclusivamente Cliente. Não houve alteração de snapshots fiscais/históricos, saldo, venda, OS, estoque, Fiscal, PDV, Operações ou Pessoas. As contagens operacionais permaneceram iguais. A prova de integridade cobre os atributos dos clientes e essas contagens, sem produzir dump de produção ou prometer uma comparação byte a byte de todas as tabelas externas.

## Regressões e smoke

172 testes PASS, zero falhas e zero skipped, em 11 arquivos: ClientWriteService/HTTP/migration, ClientMergeService/discovery/migration, client-identity/boundaries/lookup, document-key e document-unique. Todas as regressões usaram datasource fictício de loopback e mocks, sem produção. O teste de concorrência que escreve em PostgreSQL real não foi executado, pois a autorização de write se restringia ao backfill oficial.

Smoke anônimo read-only posterior: `/api/version` 200, build `4a85dd95202b`; `/` 200; `/login` 200; `/dashboard` 307; `/api/clientes` 401. Não houve leitura de documentos/clientes nem escrita pela aplicação. Esse smoke confirma disponibilidade e proteção básica; os fluxos de escrita foram cobertos pelas regressões e a consistência do backfill pela auditoria do banco.

A main atual já contém a recuperação Node24 na PR #228 (`bfbdf01`), e seu build está servido em produção. O impedimento histórico de deploy Node20 foi superado por outra frente já incorporada. Nenhum GOAL de runtime foi reaberto e nenhum novo deployment Production foi criado por esta operação.

## Encerramento e preservação de escopo

CAD-R2-019 está CLOSED, com escrita, idempotência e auditoria comprovadas. READY_FOR_020=YES registra a conclusão destes pré-requisitos; CAD-R2-020 não foi iniciado. CAD-R2-018-A, CAD-R2-008 e CAD-R2-018-B não foram reabertos.

A main foi sincronizada e respeitada em `4a85dd95202b56873487b31c318fc2d751fc26f5`. O trabalho foi feito na worktree gerenciada isolada desta conversa; a branch e o WIP originais e os trabalhos de outras frentes foram preservados. Não existia `.aep-active`; pela regra opt-in, nenhum estado AEP, LEDGER ou REGISTRY foi alterado à mão. O fechamento operacional é registrado nesta evidência e no adendo de Cadastros do CURRENT_STATUS.

Nenhuma URL de conexão, senha, token ou documento foi impresso, gravado nas evidências ou enviado ao chat. Os JSONs contêm apenas contagens, metadados de autoridade, hashes e resultados sanitizados. O auditor anterior foi reutilizado sem alteração; seus hashes e os das fontes oficiais constam da proveniência.

Evidências principais: [autoridade](authority.json), [identidade live](live-identity-exec.json), [gates](gates-exec.json), [execução](backfill-execution.json), [rerun](backfill-rerun.json), [auditoria posterior](database-audit-after.json), [integridade](data-integrity.json), [regressões](focused-regressions.json), [smoke](production-read-only-smoke-after.json), [proveniência](tooling-provenance.json) e [resultado](result.json).
