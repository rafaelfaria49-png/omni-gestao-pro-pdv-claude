# OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — implementação, corretivo R2 e validação para R3

Código e testes implementados por Claude Code/Anthropic (`claude-opus-5-5`). O commit funcional anterior era `ce1d806ba962fbf5acac1e015e18a370d7939055`; o corretivo da R2 é o commit funcional `3071c6749730ca138966d46fc9e6271afc211d81` (Claude/Anthropic), seguido deste commit só de documentos. O coordenador OpenAI consolidou este relatório, os logs e o inventário produzido pelo Claude; não implementou as correções. A revisão R2 será uma sessão OpenAI nova, READ-ONLY, sobre o SHA exato que incluir estes documentos. Nenhum código será alterado depois dessa revisão sem novo parecer sobre o novo SHA.

Em 05/10/2026, o novo `git fetch origin` confirmou `origin/main=1e45f98ade83b3071548d581225928b0fd95b06c`. A main não avançou; não há reconciliação pendente. A worktree e o trabalho anterior foram preservados. PRs #234 e #235 permanecem na base. A auditoria/baseline original não foi reiniciada.

## Estado antes da revisão R3 (após corretivo R2)

```text
GOAL=OPS-RECEBIMENTO-MISTO-P1-HARDENING-001
BASE=1e45f98ade83b3071548d581225928b0fd95b06c
FINAL_HEAD=SHA_EXATO_DO_COMMIT_CONTENDO_ESTE_RELATORIO; fornecido no pacote da R3
FUNCTIONAL_HEAD=3071c6749730ca138966d46fc9e6271afc211d81
PREVIOUS_FUNCTIONAL_HEAD=ce1d806ba962fbf5acac1e015e18a370d7939055
R2_P1_TITULO_TRAVA_VAZIA=FIXED_RED_GREEN_PG_4_CASOS
R2_P2_ESTOQUE_RASCUNHO_LEDGER=FIXED_RED_GREEN_PG_4_CASOS
R2_P3_RETORNO_DUPLICADO=PREEXISTENTE_OPERACIONAL_NAO_ALTERADO
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
UNIT=R2FIX_AFETADOS_295_PASS_14_ARQUIVOS;ANTERIOR_R2_830_PASS_14_FAIL_1_EXPECTED_FAIL_EM_29_ARQUIVOS_NAO_REEXECUTADO_INTEGRAL
MOUNTED=PASS_V3_20_V4_29_REEXECUTADO_EM_3071c67
POSTGRES=PASS_V3_93_TRANSITIVOS_35_V4_PARIDADE_1_GATED_40_EM_3071c67
E2E=PENDENTE_NOVO_BUILD_DO_COORDENADOR_SOBRE_3071c67;ANTERIOR_8880b86_CONJUNTO_6_6_COM_QA_PREPARADO
REGRESSION=PASS_FOCAL
TYPECHECK=PASS_TSC_NOEMIT_COMPLETO_EXIT0_EM_3071c67
LINT=PASS_FOCADO_ARQUIVOS_DO_CORRETIVO_0_ERROS_0_WARNINGS
BUILD=PENDENTE_COORDENADOR_SOBRE_3071c67;ANTERIOR_ce1d806_PASS_MIGRATION_SKIPPED
DIFF_CHECK=PASS
SCHEMA_CHANGED=NO
MIGRATION_CREATED=NO
R_FAMILY=openai
R_HEAD_REVIEWED=R2_8880b86;R3_PENDENTE
R_VERDICT=R2_REQUEST_CHANGES;R3_PENDENTE
P0=R2_0;R3_NOT_REVIEWED
P1=R2_1_CORRIGIDO;R3_NOT_REVIEWED
P2=R2_1_CORRIGIDO;R3_NOT_REVIEWED
P3=R2_1_PREEXISTENTE;R3_NOT_REVIEWED
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
BLOCKER=BUILD_E2E_DO_COORDENADOR_E_REVISAO_INDEPENDENTE_R3_PENDENTES
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

## R2 e corretivo no mesmo GOAL

A R2 independente (OpenAI, READ-ONLY) sobre `8880b86e18ad37f3733523e9481cf467ac70a32b` retornou P0=0, P1=1, P2=1, P3=1, REQUEST_CHANGES. Corrigidos por Claude no commit funcional `3071c6749730ca138966d46fc9e6271afc211d81`, sem schema/migration, sem transação aninhada e sem trava título→OS/advisory.

1. **P1 — trava vazia do título.** `gravarTituloContaReceberTravado` ignorava o retorno de `travarTituloContaReceber`. Com `FOR UPDATE` vazio, um título criado e commitado antes do `findUnique` era lido sem trava. O UPDATE derivado dessa leitura esperava o pagamento concorrente. Depois do commit dele, apagava histórico/marcador e restaurava status/saldo, então o replay de K deixava de ser reconhecido e virava nova baixa. Agora só se deriva UPDATE de linha que a própria transação travou: trava vazia = ausente → `createMany skipDuplicates` (não sobrescreve) → nova volta trava e relê a linha (≤3). Alcança o upsert genérico (rotas `contas-receber-persist` e `sync-legacy-financeiro`) e o adapter `os-faturamento`. `cancelContaReceber` e `cancelContaReceberFromOS` já usavam o boolean. Contrato `db`: `naTransacaoDoTituloContaReceber` trata `db` como transação. Nenhum caller real passa o singleton global (busca sem ocorrências, também confirmado pela R2), por isso o contrato só foi documentado.
2. **P2 — rascunho somado ao ledger de estoque.** Antes da baixa, os itens com produto são só rascunho da sync, único criador runtime pré-baixa; `lib/os-itens-stock.ts` é legado sem callers. `consumeEstoqueFromOS` apendava o ledger ao lado do rascunho e a restauração somava ambos (10→9→11). O delta de revisão também contaria o rascunho como consumido. Sob a trava da OS, a baixa agora substitui os itens com produto pelo ledger; itens sem produto (serviços) são preservados. O ledger consumido nunca é apagado para reconstruir rascunho e `observacao` não é critério. Peças legítimas repetidas do mesmo produto continuam somadas pelo build da baixa.
3. **P3 — retorno duplicado** (`retorno-actions.ts`): pré-existente, operacional e não financeiro; não alterado neste corretivo.

### REDs antes do fix e GREEN

`hardening-p1-transitivos.pg.ts` ganhou uma pausa logo após o `SELECT … FOR UPDATE` do título devolver 0 linhas; `$queryRaw` só é envolvido com essa pausa armada. Sequência do P1-T6: A conclui a trava vazia e pausa antes da leitura ORM. B cria e commita o título 400. C trava esse título e paga, pausado no caixa antes do commit. A retoma e precisa esperar a trava de C, observada em `pg_stat_activity` sem sleep; C commita e A conclui. Casos: `contas-receber-persist` e `sync-legacy-financeiro` × K 350+50; adapter `os-faturamento` com transação própria × K 350+50; `updateOSPayload` → adapter (com trava da OS) × lote PDV 350, que só trava o título. Conferem título 1, histórico [350], marcador 1, saldo 50/parcial, caixa e movimento únicos, replay K `jaRegistrado`, e depois um 50 legítimo quitando.

P2-T4: S→C→R concorrente agora confere estoque 10→9→10, itens após a baixa e saída 1/entrada 1 no ledger de estoque. Foram acrescentados o sequencial com consumo/restauração repetidos e duas peças legítimas 1+1 do mesmo produto (10→8→10). A ordem inversa C→S→R e a ausência de deadlock continuam cobertas; o timeout não aumentou.

| Evidência (em `playwright-report/ops-p1-hardening-001/`) | Resultado |
| --- | --- |
| `r2fix-transitivos-RED-snapshot.pg.ts.txt` | snapshot do teste usado na RED antes do fix |
| `r2fix-red-p1t6-p2t4.log` | RED: 7/7 falham. Lote: histórico [] com caixa [350]. P2: após a baixa havia rascunho 1 + ledger 1, final 11 e entrada 2 |
| `r2fix-red-p1t6-motivos.log` | RED P1-T6 4/4: `[estado K]` pendente, saldo 400, histórico [], marcador 0, caixa [350]. Replay de K `jaRegistrado:false`, com Σcaixa 750 contra Σbaixas 400 |
| `r2fix-green-p1t6-p2t4.log` | GREEN 8/8 |
| `r2fix-transitivos-green.log` | transitivos 35/35 |
| `r2fix-pg-v3-full.log` | PG V3 93/93 (3 arquivos) |
| `r2fix-pg-v4-paridade.log` | 1/1 |
| `r2fix-pg-gated.log` | 40/40 (lote lock, workspace, entrada-readback, garantia, entrada complementar; flags no mesmo QA local) |
| `r2fix-mounted-v3.log` / `r2fix-mounted-v4.log` | 20/20 e 29/29 |
| `r2fix-unit-afetados.log` | 295/295 em 14 arquivos que importam ou simulam o serviço de título, o adapter de faturamento ou o adapter de estoque |
| `r2fix-typecheck.log` | `tsc --noEmit` completo, heap 8192, exit 0, saída vazia |
| `r2fix-lint.log` | eslint dos 3 arquivos alterados: 0 erros, 0 warnings |

Build oficial e E2E sobre `3071c67` ficam com o coordenador, com novo build; o web QA anterior não prova este código. A suíte unitária ampla de 830 casos/29 arquivos não foi reexecutada integralmente nesta rodada. O conjunto afetado acima a substitui somente para os dois arquivos-fonte alterados. A R2 não aprovou este SHA: a R3 OpenAI nova, READ-ONLY, deve revisar o novo HEAD.

## Inventário e ordem de locks

`OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json` foi atualizado por Claude sobre o SHA funcional ce1d806 e, no corretivo R2, sobre 3071c67 (linhas, estratégia do título/estoque e `r2Findings`): 115 funções, 102 SAFE_TRANSACTIONAL, 13 READ_ONLY, 37 writers diretos. Há 16 entradas transitivas do título/itens, em taxonomia separada; 10 escopos revisados e 2 exclusões não são somados às funções. Categorias e papéis não devem ser confundidos: um caller seguro pode alcançar um callee travado sem ele próprio gravar payload.

Recebimentos V3 seguem advisory(OS)→sessão FOR SHARE quando necessário→OS FOR UPDATE→título. OS genérica, orçamento/intenção e cancelamento seguem OS→título na mesma transação. Helpers do Financeiro travam somente título, sem voltar à OS. Estoque segue OS→produtos→itens; sync de rascunho segue OS→itens. O mapa completo e as justificativas estão no inventário; a R2 deve procurar arestas inversas e casos de título inicialmente ausente.

O espelho `components/pdv-github-original` não foi editado. Sua UI experimental é alcançável pela rota com flag, mas seu fecho de imports não contém writers de OS. O backend histórico aninhado não é roteado/importado e fica no apêndice como excluído, sem ser contado como aprovado.

O implementador informou dois candidatos operacionais residuais. A abertura duplicada de retorno com guarda prévia foi classificada como P3 na R1 e na R2 e não foi alterada. A soma de rascunho/ledger na restauração de estoque foi classificada como P2 pela R2 e corrigida no corretivo R2. Os candidatos de orçamento antes chamados P3 foram promovidos a P2 na R1 e corrigidos.

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

Build oficial e E2E do coordenador sobre o novo SHA. A R3 independente deve tentar quebrar a corrida trava vazia → título criado → leitura → pagamento → escrita, a substituição rascunho×ledger em ambas as ordens, e ainda A–O do comando original, os cinco achados R1, a cobrança sobre faturamento vigente, a criação concorrente de título e os candidatos operacionais relatados. P0=P1=P2=0 e APPROVE são obrigatórios. Havendo achado, corrigir neste mesmo GOAL por Anthropic e obter nova R sobre o novo SHA.

Só então: PR exclusivo com o SHA revisado; checks verdes; merge normal GitHub sem squash/rebase/force; SUCCESS de omni-gestao e omni-gestao-pro no merge SHA; smoke produção somente leitura. Sem sessão, OWNER_PENDING_AUTH, sem pedir credenciais. Nenhum pagamento real, mutation financeira de produção ou acesso à OS-2026-00028 é permitido. A worktree permanece ATIVA até relatório final e dois deploys verdes.
