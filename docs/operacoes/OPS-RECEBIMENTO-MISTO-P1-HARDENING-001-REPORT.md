# OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — implementação e validação para R2

Código e testes implementados por Claude Code/Anthropic (`claude-opus-5-5`). O commit funcional final é `ce1d806ba962fbf5acac1e015e18a370d7939055`. O coordenador OpenAI consolidou este relatório, os logs e o inventário produzido pelo Claude; não implementou as correções. A revisão R2 será uma sessão OpenAI nova, READ-ONLY, sobre o SHA exato que incluir estes documentos. Nenhum código será alterado depois dessa revisão sem novo parecer sobre o novo SHA.

Em 05/10/2026, o novo `git fetch origin` confirmou `origin/main=1e45f98ade83b3071548d581225928b0fd95b06c`. A main não avançou; não há reconciliação pendente. A worktree e o trabalho anterior foram preservados. PRs #234 e #235 permanecem na base. A auditoria/baseline original não foi reiniciada.

## Estado antes da revisão R2

```text
GOAL=OPS-RECEBIMENTO-MISTO-P1-HARDENING-001
BASE=1e45f98ade83b3071548d581225928b0fd95b06c
FINAL_HEAD=SHA_EXATO_DO_COMMIT_CONTENDO_ESTE_RELATORIO; fornecido no pacote da R2
FUNCTIONAL_HEAD=ce1d806ba962fbf5acac1e015e18a370d7939055
BRANCH=goal/ops-recebimento-misto-p1-hardening-001
WORKTREE=C:\Projetos\omni-gestao-ops-recebimento-misto-p1-hardening-001
IMPLEMENTER_FAMILY=anthropic
P1_CANONICAL_IDENTITY=FIXED_QA_PASS
P1_TERMINAL_DECISION_LOST_UPDATE=FIXED_QA_PASS_INCLUINDO_WRITERS_TRANSITIVOS
P2_CROSS_OS_DRAFT_RESET=FIXED_MOUNTED_E2E_PASS
CANONICAL_AGGREGATES_SAME_FORM=PASS
LEGACY_REPLAY_COMPAT=PASS_PG_SIMPLES_SPLIT_REPETIDO_E_MARCADOR_MISTO_V1
SAME_ECONOMIC_RETRY_SAME_KEY=PASS_UNIT_MOUNTED_PG_E2E
DIFFERENT_ECONOMIC_CONTENT_CONFLICT=PASS_FORMA_SESSAO_1_CENTAVO
OS_PAYLOAD_WRITERS_SCANNED=115_FUNCOES;102_SAFE_TRANSACTIONAL;13_READ_ONLY;37_WRITERS_DIRETOS;16_TRANSITIVOS_SEPARADOS
STALE_WRITERS_FOUND=YES_INCLUINDO_5_ACHADOS_DA_R1
STALE_WRITERS_FIXED=YES; inventario detalha os caminhos
STALE_WRITERS_REMAINING=0_IDENTIFICADOS_PELO_IMPLEMENTADOR; confirmar na R2
ROW_LOCK_STRATEGY=LATEST_READ_DECISION_WRITE_SAME_TX_OS_FOR_UPDATE_AND_TITLE_FOR_UPDATE
CAS_STRATEGY=CAS_UPDATEDAT_EXISTENTE_PRESERVADO_SOB_TRAVA;ZERO_WRITERS_DEPENDENDO_SO_DE_CAS
LOCK_ORDER=ADVISORY_OS_SESSAO_OS_TITULO;OS_PRODUTOS_ITENS;SYNC_OS_ITENS;FINANCEIRO_SO_TITULO_SEM_ARESTA_DE_VOLTA_PARA_OS
DEADLOCK_TEST=PASS_PG_DETERMINISTICO;MAXWAIT5000_TIMEOUT15000_SEM_AUMENTO
PIX_100_EQ_PIX_50_50=PASS
RESPONSE_LOSS_REPLAY=PASS_MOUNTED_PG_E2E
TERMINAL_REFUSAL_SURVIVES_CONCURRENCY=PASS_OPERACIONAIS_IMPORTADORES_SCRIPTS_AMBAS_ORDENS
PRIORITY_SURVIVES_CONCURRENCY=PASS_PG
NO_DUP_TITLE_PAYMENT=PASS
NO_DUP_MOVIMENTACAO=PASS
NO_DUP_CAIXA=PASS
OS_A_DOES_NOT_CLEAR_OS_B=PASS_MOUNTED_E2E
PR234_REGRESSION=PASS
PR235_350_50=PASS_PG_E2E_V3_V4
PR235_100_APRAZO=PASS_PG
PR235_LATER_PAYMENT=PASS_PG_E2E_V3_V4
UNIT=R2_830_PASS_14_FAIL_1_EXPECTED_FAIL_EM_29_ARQUIVOS;EXTRA_77_PASS;ver classificacao abaixo
MOUNTED=PASS_V3_20_V4_29
POSTGRES=PASS_V3_87_V4_PARIDADE_1_GATED_40
E2E=PASS_5_CENARIOS_FUNCIONAIS_POR_SPEC_MAIS_AUTH_SETUP;EXECUCAO_CONJUNTA_5_PASS_1_FALHA_NAVEGACAO_DOCUMENTADA
REGRESSION=PASS_FOCAL
TYPECHECK=PASS_TSC_NOEMIT_COMPLETO_EXIT0
LINT=PASS_FOCADO_0_ERROS_1_WARNING_PREEXISTENTE
BUILD=PASS_NPM_RUN_BUILD_MIGRATION_SKIPPED
DIFF_CHECK=PASS
SCHEMA_CHANGED=NO
MIGRATION_CREATED=NO
R_FAMILY=openai
R_HEAD_REVIEWED=PENDENTE_R2
R_VERDICT=PENDENTE_R2
P0=NOT_REVIEWED_R2
P1=NOT_REVIEWED_R2
P2=NOT_REVIEWED_R2
P3=NOT_REVIEWED_R2
READY_FOR_MERGE=NO
PR=NOT_CREATED
PR_MERGED=NO
MERGE_SHA=NOT_APPLICABLE
VERCEL_OMNI_GESTAO=NOT_DEPLOYED
VERCEL_OMNI_GESTAO_PRO=NOT_DEPLOYED
PROD_SMOKE=NOT_RUN
REAL_PAYMENT_EXECUTED=NO
REAL_FINANCIAL_DATA_CHANGED=NO
OS_2026_00028_TOUCHED=NO
IMPLEMENTADO=SIM
VALIDADO=SIM_LOCAL_QA_COM_RESSALVAS_DOCUMENTADAS
PUBLICADO=NO
HOMOLOGADO=NO
BLOCKER=REVISAO_INDEPENDENTE_R2_PENDENTE
```

## Correções originais

A identidade econômica agrega centavos por forma de pagamento e ordena as formas. PIX100 e PIX50+PIX50 representam a mesma confirmação. O replay compara a identidade nova e a representação legada calculada para a própria requisição, sem aceitar equivalência genérica nem deduplicar operações novas por valor. Loja, OS e sessão de caixa continuam compondo a identidade do servidor. Duas confirmações legítimas consecutivas continuam permitidas.

O hook mantém a chave de uma confirmação incerta quando o saldo é relido e a representação econômica equivalente muda. Conteúdo realmente diferente com a mesma chave continua em conflito. A V3 confere a OS alvo depois de cada await de registro/reenvio; a resposta tardia de A preserva o rascunho de B. As guardas equivalentes da V4 foram preservadas.

Os writers operacionais, de importação e scripts manuais passam pela releitura protegida do latest da OS. A mutação aplica somente a intenção e preserva campos desconhecidos, timeline e estado financeiro/terminal. O patch genérico não aceita estado financeiro V3 vindo do cliente. Importações também protegem identidade, campos V3/V4, estoque e valores/status com ledger existente, e nunca alteram OS de outra loja. `createOS` cria a linha e o payload definitivo na mesma transação. O PUT de migração one-shot não apaga OS com deleteMany.

## R1 e corretivo no mesmo GOAL

A R1 independente sobre `c21990d96f19cc148430142bd8e885991cc8b595`, consolidada com seu adendo, retornou P0=0, P1=2, P2=3, P3=1, REQUEST_CHANGES. Os cinco achados foram corrigidos por Claude no commit funcional `ce1d806`; a R2 ainda deve confirmar o fechamento.

1. Adapter `os-faturamento`: atualização da OS e sincronização de seu título passam a compartilhar a transação OS→título. Leitura, preservação de ledger, decisão e escrita ocorrem sob trava do título; upsert/cancel não restauram histórico antigo.
2. Serviço genérico `upsertContaReceber`/`cancelContaReceber`: transação curta própria ou reaproveitamento do `db: tx` recebido, FOR UPDATE antes da decisão, inserção sem sobrescrita em conflito para a ausência concorrente e releitura protegida. Não abre transação aninhada nem pede OS/advisory depois de título. Cancelamento da OS usa a mesma transação e rejeita recebimento já registrado, inclusive por Financeiro direto/lote.
3. Itens/estoque: o sync de itens trava OS e relê orçamento/estado de consumo antes de bloquear filhos. Remove o snapshot anterior ao lock e a inversão itens→OS contra restauração OS→itens.
4. Hub aprovar/enviar/recusar: a intenção é aplicada ao orçamento vigente sob trava, preservando edição concorrente e refletindo o total vigente no título.
5. Geração de orçamento: a guarda e a materialização ocorrem dentro da mutação protegida. Uma materialização tardia não substitui orçamento real criado por outro fluxo.

O caminho irmão `gerarCobrancaOSAction` também passa a decidir parcelas e título sobre o faturamento vigente. Seu cenário adicional foi criado depois do fix: tem prova GREEN, sem alegação de RED prévia.

`hardening-p1-transitivos.pg.ts` contém 29 casos reais de PostgreSQL. A fonte instrumentada da RED sobre c21990d produziu 27 falhas/1 sucesso em 28 casos, inclusive um deadlock 40P01 com ciclo explícito e perdas reais de histórico/marcador. Após o fix, 29/29 passaram. A coordenação usa barreiras, waits e locks observáveis; o timeout não foi aumentado. Os testes contam títulos, histórico, marcadores, caixa, movimentações, status/saldo e replay K.

Os mocks unitários foram atualizados para o contrato transacional, mantendo as asserções de negócio. O fault injection do teste de rollback mudou de `upsert` para `update`, método que agora persiste o título a prazo, no mesmo ponto após caixa e antes de persistir o a prazo. A R2 deve conferir essa equivalência.

## Inventário e ordem de locks

`OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json` foi atualizado por Claude sobre o SHA funcional ce1d806: 115 funções, 102 SAFE_TRANSACTIONAL, 13 READ_ONLY, 37 writers diretos. Há 16 entradas transitivas do título/itens, em taxonomia separada; 10 escopos revisados e 2 exclusões não são somados às funções. Categorias e papéis não devem ser confundidos: um caller seguro pode alcançar um callee travado sem ele próprio gravar payload.

Recebimentos V3 seguem advisory(OS)→sessão FOR SHARE quando necessário→OS FOR UPDATE→título. OS genérica, orçamento/intenção e cancelamento seguem OS→título na mesma transação. Helpers do Financeiro travam somente título, sem voltar à OS. Estoque segue OS→produtos→itens; sync de rascunho segue OS→itens. O mapa completo e as justificativas estão no inventário; a R2 deve procurar arestas inversas e casos de título inicialmente ausente.

O espelho `components/pdv-github-original` não foi editado. Sua UI experimental é alcançável pela rota com flag, mas seu fecho de imports não contém writers de OS. O backend histórico aninhado não é roteado/importado e fica no apêndice como excluído, sem ser contado como aprovado.

O implementador informou dois candidatos operacionais residuais, sem atribuir severidade final: abertura duplicada de retorno com guarda prévia (P3 na R1) e soma de itens de rascunho/ledger em restauração de estoque (observação pré-existente do implementador). A R2 deve avaliar o alcance, a severidade e eventual relação com o corretivo. Os candidatos de orçamento antes chamados P3 foram promovidos a P2 na R1 e corrigidos.

## Evidências locais

Todos os logs seguintes estão em `playwright-report/ops-p1-hardening-001/`, gitignorados. PostgreSQL é descartável, loopback 127.0.0.1:55493, banco `ops_v3_misto_qa_p1_hardening_001`. O servidor do build oficial é QA loopback 3051. O controlador privado injeta credenciais QA sem publicá-las, redige o console e mantém auth storage/traces privados. Não há `.env` nesta worktree. Nenhum banco remoto ou registro real foi usado.

| Gate | Evidência |
| --- | --- |
| PG V3 final | `pg-v3-coordinator-r2.log`: 87/87, 3 arquivos, exit0 no SHA funcional ce1d806. |
| PG transitivos | `transitivos-green-2.log`: 29/29; `transitivos-red-c21990d.log`: RED 27/28. Snapshot RED correspondente preservado no pacote externo. |
| PG V4 paridade | `pg-v4-paridade-1.log`: 1/1. |
| PG gated | `pg-gated-1.log`: 40/40, 5 arquivos, incluindo lote lock, workspace/entrada/garantia; flags apontam ao mesmo QA local. Não iniciou Fluxo Curto005. |
| Mounted | `mounted-1.log`: V3 20/20 e V4 29/29. |
| Unit afetados | `unit-afetados-2.log`: 830 passed, 14 failed, 1 expected fail, 29 arquivos; `unit-extra-1.log`: 77/77. As 3 falhas PG workspace sem flag foram revalidadas no gated acima. As outras 11 são 10 static preview-honesty V4 e 1 static cancelamento de vendas, em arquivos/código inspecionado sem diff neste GOAL. |
| Unit focal histórico | `unit-focal-final.log`: 132/132 antes do corretivo R1. Não substitui as execuções R2 acima. |
| E2E por spec | `e2e-r2-1.log`: 3/3; `e2e-r2-2.log`: 2/2; `e2e-r2-3.log`: 3/3. São 5 cenários funcionais e auth setup repetido em cada spec, workers1/retries0. |
| E2E conjunto | `e2e-combined-r2-red.log`: 5/6; V3 falhou ao localizar o formulário depois de clicar Receber. O mesmo spec passou depois isoladamente. A falha permanece registrada; nenhum teste foi enfraquecido para ocultá-la. |
| Typecheck | `typecheck-coordinator-r2.log`: tsc --noEmit completo, exit0, heap8192, sem truncar output ou mascarar exit code. |
| Lint | `lint-1.log`: lint focado 0 erros/1 warning de diretiva antiga em operacoes.ts; sem --fix. |
| Build | `build-r2.log`: npm run build oficial, compilação OK, MIGRATION_SKIPPED. |
| Diff | git diff --check PASS antes do commit documental; confirmar HEAD limpo depois. |

A execução ampla histórica `unit-full-after-import-fix.log` teve 9179 passed/40 failed, incluindo infra fiscal/setup, mocks legados, checks estáticos sem diff, PG gated sem flag e dois validadores privados antigos da coordenação. Não é relatada como suíte inteira verde. As reproduções originais P1-A, P1-B, P2 e a RED de importação foram preservadas; não se repetiu toda a auditoria/baseline.

## Gates finais pendentes

A R2 independente deve tentar quebrar A–O do comando original, os cinco achados R1, a cobrança sobre faturamento vigente, a criação concorrente de título e os candidatos operacionais relatados. P0=P1=P2=0 e APPROVE são obrigatórios. Havendo achado, corrigir neste mesmo GOAL por Anthropic e obter nova R sobre o novo SHA.

Só então: PR exclusivo com o SHA revisado; checks verdes; merge normal GitHub sem squash/rebase/force; SUCCESS de omni-gestao e omni-gestao-pro no merge SHA; smoke produção somente leitura. Sem sessão, OWNER_PENDING_AUTH, sem pedir credenciais. Nenhum pagamento real, mutation financeira de produção ou acesso à OS-2026-00028 é permitido. A worktree permanece ATIVA até relatório final e dois deploys verdes.
