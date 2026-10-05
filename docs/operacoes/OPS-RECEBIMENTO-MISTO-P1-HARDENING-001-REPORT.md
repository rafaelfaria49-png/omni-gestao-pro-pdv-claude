# OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — implementação, corretivos R2 e R3, reconciliação com a main e validação para R4

Código e testes implementados por Claude Code/Anthropic (`claude-opus-5-5`). Os commits funcionais dos corretivos são `ce1d806ba962fbf5acac1e015e18a370d7939055` (R1), `3071c6749730ca138966d46fc9e6271afc211d81` (R2), `5727e5802e202f05eef9aedcf30f17813f6cda8a` (P1-T7) e `e02e826ed4dabf4ce7f9db7fdabd2cbccace0f5e` (P1 do seed, R3). O coordenador OpenAI consolidou os documentos e evidências produzidos pelo Claude; não implementou código ou testes. A revisão final R4 será uma sessão OpenAI nova, READ-ONLY, sobre o SHA exato que incluir estes documentos e os gates finais. Nenhum código será alterado depois dessa revisão sem novo parecer sobre o novo SHA.

Em 05/10/2026, um primeiro `git fetch origin` confirmou `origin/main=1e45f98ade83b3071548d581225928b0fd95b06c`. Um fetch posterior no mesmo dia mostrou `origin/main=a27b37e861ff044666d16535acb292f5d6957fcf` (merge do PR #237, GOAL de datas, já publicado). O coordenador iniciou `git merge --no-edit origin/main`; Claude resolveu os 6 conflitos e concluiu o merge normal de dois pais (`4ed751c7d349f0e8a92e726952aeee861830b31e`, pais `d3d9a97` e `a27b37e`), sem rebase/amend/reset/stash. O código do PR #237 é do upstream, não deste GOAL. Depois do merge, Claude estabilizou a sincronização dos specs E2E (`8aa19326a85adcbab7b7afcd3479b44ea55181db`, só teste) e corrigiu o candidato escalar P1-T7 (`5727e5802e202f05eef9aedcf30f17813f6cda8a`, funcional). A worktree e o trabalho anterior foram preservados. PRs #234 e #235 permanecem na base. A auditoria/baseline original não foi reiniciada; o GOAL de datas não foi iniciado nem alterado.

## Estado antes da revisão R4 (após corretivo R2, reconciliação, P1-T7 e corretivo R3 do seed)

```text
GOAL=OPS-RECEBIMENTO-MISTO-P1-HARDENING-001
BASE=a27b37e861ff044666d16535acb292f5d6957fcf
BASE_ORIGINAL=1e45f98ade83b3071548d581225928b0fd95b06c
MERGE_RECONCILIACAO=4ed751c7d349f0e8a92e726952aeee861830b31e;MERGE_NORMAL_2_PAIS_d3d9a97+a27b37e;CONFLITOS_6_RESOLVIDOS_POR_CLAUDE
FINAL_HEAD=SHA_EXATO_DO_COMMIT_CONTENDO_ESTE_RELATORIO; fornecido no pacote da R4
FUNCTIONAL_HEAD=e02e826ed4dabf4ce7f9db7fdabd2cbccace0f5e
E2E_SPEC_SYNC_COMMIT=8aa19326a85adcbab7b7afcd3479b44ea55181db;SO_TESTE
PREVIOUS_FUNCTIONAL_HEADS=5727e5802e202f05eef9aedcf30f17813f6cda8a;3071c6749730ca138966d46fc9e6271afc211d81;ce1d806ba962fbf5acac1e015e18a370d7939055
P1T7_VALOR_TITULO_OS_SNAPSHOT_LEGADO=FIXED_RED_GREEN_PG_2_ROTAS
R3_P1_SEED_CONTAS_RECEBER_OS=FIXED_RED_GREEN_PG_CLI_REAL_10_CASOS;SO_CRIA_TITULO_AUSENTE_SOB_OS_FOR_UPDATE_INSERT_ON_CONFLICT_DO_NOTHING
R3_P3_RETORNO_FILHO=PREEXISTENTE_OPERACIONAL_NAO_ALTERADO
E2E_NAVEGACAO_RECEBER=CAUSA_REMONTAGEM_OPERATIONSPROVIDER_KEY;SPEC_SINCRONIZADO;PASS_CONJUNTO_6_6_WORKERS1_RETRIES0
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
OS_PAYLOAD_WRITERS_SCANNED=118_FUNCOES;105_SAFE_TRANSACTIONAL;13_READ_ONLY;39_WRITERS_DIRETOS;17_TRANSITIVOS_FINANCEIROS_SEPARADOS_INCLUI_SEED_CR_OS;INCLUI_4_DO_UPSTREAM_PR237
STALE_WRITERS_FOUND=YES_INCLUINDO_5_ACHADOS_DA_R1
STALE_WRITERS_FIXED=YES; inventario detalha os caminhos
STALE_WRITERS_REMAINING=0_IDENTIFICADOS_PELO_IMPLEMENTADOR; confirmar na R4
ROW_LOCK_STRATEGY=LATEST_READ_DECISION_WRITE_SAME_TX_OS_FOR_UPDATE_AND_TITLE_FOR_UPDATE
CAS_STRATEGY=CAS_UPDATEDAT_EXISTENTE_PRESERVADO_SOB_TRAVA;ZERO_WRITERS_DEPENDENDO_SO_DE_CAS
LOCK_ORDER=ADVISORY_OS_SESSAO_OS_TITULO;OS_PRODUTOS_ITENS;SYNC_OS_ITENS;FINANCEIRO_SO_TITULO_SEM_ARESTA_DE_VOLTA_PARA_OS;UPSTREAM_ADVISORY_OS_TITULO_LEITURA_E_ADVISORY_OS_GARANTIAS;SEED_CR_OS_SO_OS_TITULO_INSERT
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
UNIT=AMPLO_OPS_FINANCEIRO_APIS_2006_PASS_10_FAIL_PREEXISTENTES_PREVIEW_HONESTY_124_ARQUIVOS_EM_5727e58;CANONICALIDADE_24_24;DATAS_UPSTREAM_30_30
MOUNTED=PASS_V3_20_V4_29_EM_5727e58
POSTGRES=PASS_V3_105_INCLUI_TRANSITIVOS_47_P1SEED_10_EM_e02e826;V4_PARIDADE_1_GATED_40_EM_5727e58_SEM_DEPENDENCIA_DO_SEED
E2E=PASS_CONJUNTO_6_6_29.3s_WORKERS1_RETRIES0_BUILD_FINAL_9f582cc_FONTE_e02e826
REGRESSION=PASS_FOCAL_E_AMPLA_OPS
TYPECHECK=PASS_TSC_NOEMIT_COMPLETO_POS_BUILD_INCREMENTAL_FALSE_EXIT0_HEAP8192_HEAD_9f582cc;EXIT_REAL_REGISTRADO
LINT=PASS_61_ARQUIVOS_CODIGO_TESTES_DIFF_GOAL_EXIT0_0_ERROS_1_AVISO_PREEXISTENTE
BUILD=PASS_NPM_RUN_BUILD_OFICIAL_EXIT0_COMPILED_62S_STATIC_102_MIGRATION_SKIPPED_HEAD_9f582cc_FONTE_e02e826
DIFF_CHECK=PASS
SCHEMA_CHANGED=NO
MIGRATION_CREATED=NO
R_FAMILY=openai
R_HEAD_REVIEWED=R2_8880b86;R3_668dfb0;R4_PENDENTE
R_VERDICT=R2_REQUEST_CHANGES;R3_REQUEST_CHANGES;R4_PENDENTE
P0=R3_0;R4_NOT_REVIEWED
P1=R3_1_SEED_CORRIGIDO_e02e826;R4_NOT_REVIEWED
P2=R3_0;R4_NOT_REVIEWED
P3=R3_1_RETORNO_FILHO_PREEXISTENTE_NAO_ALTERADO;R4_NOT_REVIEWED
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
BLOCKER=REVISAO_INDEPENDENTE_R4_EXACT_SHA_PENDENTE
```

## Correções originais

A identidade econômica agrega centavos por forma de pagamento e ordena as formas. PIX100 e PIX50+PIX50 representam a mesma confirmação. O replay compara a identidade nova e a representação legada calculada para a própria requisição, sem aceitar equivalência genérica nem deduplicar operações novas por valor. Loja, OS e sessão de caixa continuam compondo a identidade do servidor. Duas confirmações legítimas consecutivas continuam permitidas.

O hook mantém a chave de uma confirmação incerta quando o saldo é relido e a representação econômica equivalente muda. Conteúdo realmente diferente com a mesma chave continua em conflito. A V3 confere a OS alvo depois de cada await de registro/reenvio; a resposta tardia de A preserva o rascunho de B. As guardas equivalentes da V4 foram preservadas.

Os writers operacionais, de importação e scripts manuais passam pela releitura protegida do latest da OS. A mutação aplica somente a intenção e preserva campos desconhecidos, timeline e estado financeiro/terminal. O patch genérico não aceita estado financeiro V3 vindo do cliente. Importações também protegem identidade, campos V3/V4, estoque e valores/status com ledger existente, e nunca alteram OS de outra loja. `createOS` cria a linha e o payload definitivo na mesma transação. O PUT de migração one-shot não apaga OS com deleteMany.

## R1 e corretivo no mesmo GOAL

A R1 independente sobre `c21990d96f19cc148430142bd8e885991cc8b595`, consolidada com seu adendo, retornou P0=0, P1=2, P2=3, P3=1, REQUEST_CHANGES. Os cinco achados foram corrigidos por Claude no commit funcional `ce1d806`; a R2 identificou os dois achados adicionais descritos abaixo; a R3 deve confirmar todas as correções na árvore integrada.

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
| `r2fix-red-p1t6-p2t4.log` | RED focal: 7 failed / 1 passed / 27 fora do filtro (35). As 4 P1-T6 e 3 das 4 P2-T4 falham; o caso "entrega trava a OS → sync lida antes recomeça" já passava. Lote: histórico [] com caixa [350]. P2: após a baixa havia rascunho 1 + ledger 1, final 11 e entrada 2 |
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

O coordenador executou o build oficial sobre `3071c67` (exit0, MIGRATION_SKIPPED) e o E2E nesse build; o resultado e a causa das falhas de navegação estão na seção pós-R2 abaixo. A R2 não aprovou nenhum SHA posterior: a R3 OpenAI nova, READ-ONLY, deve revisar o SHA final da árvore reconciliada.

## Reconciliação com origin/main (PR #237)

Merge normal `4ed751c` (pais `d3d9a97` e `a27b37e`). Os conflitos foram resolvidos um a um, preservando o hardening e o comportamento publicado do upstream:

- `atendimento-rapido-actions.ts`: mantida a trava da linha do hardening (`mutarAtendimentoRapidoV3`); dentro do mutate, as datas efetivas do upstream (evento no instante real, `concluidoEmMeta`, `registradoEm`).
- `entrega-actions.ts` e o teste: mantida a versão do upstream (`comOSTravadaV3`: advisory da OS → `FOR UPDATE` → releitura, título lido no MESMO tx), que já cobre a trava do hardening e é mais forte (sem 2ª conexão na leitura do título). Datas efetivas e idempotência por data do upstream preservadas.
- `comercial-pre-os-actions.ts`: mantida a versão do upstream (`gravarComTrava` e conversão sob advisory + `FOR UPDATE` + releitura), que cobre o `mutar` do hardening. Guardas de status comercial e CAS da previsão do upstream preservados.
- `orcamento-actions.ts` e o teste: mantida a trava da linha do hardening (`gravarSobTrava`). As regras do upstream foram aplicadas DENTRO da trava, sobre o payload relido: validade definida uma única vez (dia civil, nunca antes da proposta), envio que preserva a validade e usa dias civis, e aprovação recusada para proposta vencida. O CAS por `updatedAt` do upstream só cobria a janela leitura→escrita do servidor; sob a trava essa janela não existe. O teste CAS do upstream foi adaptado para provar a mesma garantia (trava → releitura → escrita; estado alterado em paralelo é visto e nada é gravado). O teste de proposta vencida do upstream foi mantido sem mudança.
- `retorno-actions.test.ts` (auto-merge): o R9 do upstream é compatível com o mock transacional do hardening.

Writers do upstream alcançáveis que gravam payload da OS (`corrigirDatasOSV3`, entrega/assinatura/fotos, comercial/conversão, `criarOSPreOrcamentoV3`): todos partem do latest sob advisory + `FOR UPDATE` (ou criam linha nova) e preservam `pagamentoV3`/`aPrazoV3`/`recebimentoMistoRecusasV3`. Ordem advisory → OS → título (só leitura) ou → garantias, a mesma do pagamento V3; nenhum pede advisory depois da OS. Inventário: 118 funções (+4 do upstream; `converterOrcamentoEmOSV3` passa a WRITER), 105 SAFE_TRANSACTIONAL, 13 READ_ONLY, 0 stale. Sem schema/migration (o PR #237 também não altera `prisma/`).

## Pós-R2: navegação do E2E (pendência 1)

No build `3071c67`, o conjunto dos 3 specs (workers 1, retries 0) teve 4 PASS/2 FAIL e depois 5 PASS/1 FAIL. As falhas ocorreram em `abrirReceber` (após clicar "Receber", "Ordem de serviço" ausente, com o Dashboard na tela) e foram anteriores a qualquer efeito financeiro.

Causa real: `components/dashboard/app-ops-providers.tsx` monta `<OperationsProvider key={opsStorageKey}>`. `opsStorageKey` (`lib/loja-ativa.tsx`) vale a chave legada até a loja ativa resolver (config hidratada + `/api/stores`) e depois `opsKeyForLoja(id)`. A troca de `key` remonta toda a árvore do dashboard, inclusive `OperacoesV3Shell`, cujo `activeScreen` volta a `"dashboard"`. Um clique em "Receber" depois da hidratação e antes dessa troca se perde. Nenhum outro provider renderiza `children` condicionalmente. Não é onboarding: o snapshot não tinha diálogo.

Correção, só nos specs (`8aa1932`, sem tocar UI/auth/onboarding): `abrirReceber` espera o h2 "Precisa de atenção", que o Dashboard só renderiza com `storeId` resolvido e a primeira carga concluída. Com a loja ativa no estado, a chave já é final. Só então clica e confere `aria-current="page"` na aba. Sem sleep, sem retry, sem timeout novo; nenhum assert financeiro mudou; uma única confirmação por cenário. Aplicado em `ops-recebimento-misto-p1-hardening-001.spec.ts` e `ops-v3-recebimento-misto-001.spec.ts`. O E2E com o spec corrigido NÃO foi executado por Claude: a fonte atual (merge + P1-T7) não corresponde ao build `3071c67`, e o controlador fica em diretório privado não acessível ao implementador. Novo build + E2E pelo coordenador.

## Pós-R2: candidato escalar do título da OS (pendência 2, P1-T7)

Confirmado por RED em PostgreSQL real antes do fix. `contas-receber.tsx` `persist(rows)` envia a lista inteira ao salvar qualquer título, e `contas-receber-list` devolve também os títulos `os-faturamento`. As rotas `contas-receber-persist` e `sync-legacy-financeiro` repassam o `valor` de cada linha. Em `montarUpsertContaReceber`, o `replacePayload` usava `input.valor` mesmo sobre a linha travada.

Cenário P1-T7: título da OS nasce em 400 (`updateOSPayload` → adapter); o título manual 100 existe; o writer legítimo real `updateOSPayload` (orçamento aprovado 500 + `faturamentoTotal` 500) leva OS e título a 500 (OS → título); K = 350 débito + 150 a prazo; a tela salva o manual (100→120) e reenvia a linha da OS 400/pendente/`historico: []`. RED (`p1t7-RED.log`, 2/2 rotas falham): título 400, saldo 50, ledger 350 e marcador preservados, OS 500, e o recebimento legítimo dos 150 recusado ("O saldo desta OS mudou (agora R$ 50.00)").

Fix mínimo (`5727e58`, `contas-receber-service.ts`): com `replacePayload` sobre título `os-faturamento` EXISTENTE (`parseFinanceiroLocalKey`), o `valor` gravado é mantido; o status canônico é derivado sobre ele. O valor desse título é derivado da OS: o adapter o regrava sob OS → título e a guarda do recebimento compara título × OS. Preservado: títulos manuais/legados/importados (outras chaves) seguem o snapshot; a criação de título ausente não mudou; o adapter e a V3 (sem `replacePayload`) continuam regravando o valor; o snapshot segue como autoridade de apresentação (descrição etc.). Sem trava título→OS, advisory inverso, transação aninhada, schema ou mudança no Financeiro geral. Efeito colateral documentado: editar o valor de um título de OS pela tela genérica de Contas a Receber deixa de alterá-lo; o caminho é o orçamento/faturamento da OS.

GREEN (`p1t7-GREEN.log`, 2/2): título 500, saldo 150, parcial, pagamentos [350], marcador [150], caixa [350], mov [350]; manual 120; replay de K `jaRegistrado` sem caixa/mov/baixa novos; depois 150 legítimos quitam (500/pago, caixa [350,150], mov [350,150]). Unit `contas-receber-canonicalidade.test.ts` +4 (OS existente mantém 500, caminho da OS regrava, ausente cria, manual editável).

| Evidência (em `playwright-report/ops-p1-hardening-001/`) | Resultado |
| --- | --- |
| `merge-pg-v3-full.log` / `merge-pg-gated.log` / `merge-pg-v4-paridade.log` | árvore do merge `4ed751c`, antes do P1-T7: 93/93, 40/40, 1/1 |
| `merge-mounted-v3.log` / `merge-mounted-v4.log` | 20/20 e 29/29 |
| `merge-unit-amplo-ops.log` | 1858 passed / 10 failed (preview-honesty estáticos pré-existentes, `parts/` sem diff neste GOAL) |
| `merge-datas-upstream-unit.log` | testes não-PG do upstream de datas: 30/30 |
| `merge-lint.log` | eslint dos 6 arquivos resolvidos: exit 0 |
| `p1t7-RED-snapshot.pg.ts.txt` / `p1t7-RED.log` | snapshot do teste e RED 2/2 falhas antes do fix |
| `p1t7-GREEN.log` / `p1t7-pg-v3-full.log` | P1-T7 2/2; PG V3 95/95 (3 arquivos) |
| `p1t7-pg-gated.log` / `p1t7-pg-v4-paridade.log` | 40/40; 1/1 |
| `p1t7-mounted-v3.log` / `p1t7-mounted-v4.log` | 20/20; 29/29 |
| `p1t7-unit-amplo.log` | 2006 passed / 10 failed (os mesmos preview-honesty), 124 arquivos (ops V3/V4, financeiro, APIs ops/financeiro/pdv, importador) |
| `p1t7-datas-upstream-unit.log` | 30/30 |
| `p1t7-typecheck.log` | `tsc --noEmit` completo, heap 8192, exit 0, saída vazia |
| `p1t7-lint.log` | eslint dos 3 arquivos do P1-T7: exit 0 |

Os PG do GOAL de datas (`test/ops-datas-retroativas-001/*.pg.ts`), o bootstrap e o E2E de datas não foram executados, conforme a instrução.

## R3 e corretivo do seed oficial (P1) no mesmo GOAL

A R3 OpenAI (sessão nova, READ-ONLY, sobre `668dfb0e810db780d668cf721dce5d56bb5e6439`) devolveu REQUEST_CHANGES com P0=0, P1=1, P2=0, P3=1. O P3 (guarda do retorno filho fora da seção protegida, `retorno-actions.ts`) é preexistente, operacional e sem dinheiro/título; não foi alterado. Este corretivo trata só o P1. O commit funcional é `e02e826ed4dabf4ce7f9db7fdabd2cbccace0f5e` (Claude/Anthropic) e altera só `scripts/seed-contas-receber-os.mjs` e `test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts`. Não há mudança em schema/migration, `seed-contas-pagar.mjs`, app ou Financeiro.

**Defeito (confirmado na fonte e por RED).** O caller oficial é `package.json` → `financeiro:seed` → `node scripts/seed-contas-receber-os.mjs --exec`. Para cada OS da `loja-1` com valor, o script montava a chave canônica `os-faturamento` e um payload sem `historico`, lia só o `id` do título (sem trava) e fazia `upsert` com `update: data`. Com isso sobrescrevia payload, status e valor. Assim apagava as baixas e o marcador `a_prazo_autorizado` de K. O replay de K procura esse marcador só no título (`recebimento-misto-service.ts`). Sem o marcador, K aceitava o saldo 400 e lançava caixa/movimentação 350 de novo. O problema é preexistente, depende do comando manual oficial e não exige concorrência.

**Autoridade e contrato.** O seed é de importação: cria o título das OS importadas. O título existente é a autoridade do ledger (baixas, marcadores e replay), do status (pago/parcial/cancelado/estornado) e do valor vigente. Sincronizar um título existente com a OS cabe ao adapter `os-faturamento` (OS → título, sob trava, já auditado). Portanto a estratégia mínima que atende ao contrato é **preencher títulos ausentes e nunca regravar os existentes**. Nenhuma "intenção legítima" do seed sobre um título existente precisaria ser sincronizada.

**Estratégia.** No `--exec`, cada OS usa uma transação curta (`{ maxWait: 5000, timeout: 15000 }`, a mesma convenção dos serviços): `SELECT … FOR UPDATE` da OS → releitura da OS (valor/status mais recentes) → `createMany({ skipDuplicates: true })` (INSERT … ON CONFLICT DO NOTHING). Nenhum UPDATE e nenhuma decisão de escrita baseada em leitura do título. Se outro fluxo cria o título no meio, sem commit, o INSERT espera o índice único e desiste. O dry-run só lê (`findMany` + `findUnique`) e informa CRIADO/PRESERVADO. O módulo exporta `seedContasReceberOS(prisma, opts)`; o CLI é um wrapper que só roda quando o arquivo é executado diretamente. A loja `loja-1` e a política de criação (OS `Entregue` → `pago`, demais `pendente`, vencimento +30 dias, payload `createdFrom: seed_os_import`) não mudaram.

**Ordem de travas.** OS FOR UPDATE → título (INSERT). É um subconjunto da ordem global advisory → sessão → OS → título. Não há advisory, não há aresta título → OS, não há transação aninhada e cada transação segura uma única OS. Os writers do Financeiro, que só travam o título, nunca pedem a OS, então não se forma ciclo.

**Comportamento antes/depois.** Antes: título existente regravado (payload/histórico/marcador apagados, status `pendente`/`pago` pela coluna da OS, valor da coluna `valorTotal`); dry-run informava "ATUALIZADO". Depois: título existente intacto (mesmo hash e `updatedAt`), log "preservado"; título ausente criado uma única vez; resumo "Preservadas" no lugar de "Atualizadas".

**Limites.** (1) O seed não atualiza mais títulos existentes. Corrigir título de OS existente é papel do adapter ou do faturamento da OS. (2) Para título ausente de OS `Entregue`, a criação continua `pago` sem histórico. É a política histórica de importação, sem efeito em caixa/movimentação. O recebimento V3 sempre cria o título antes de registrar dinheiro, por isso uma OS com recebimento V3 nunca fica sem título. (3) A loja segue fixa (`loja-1`). (4) `npm run financeiro:seed` completo não foi executado, porque também chama `seed-contas-pagar`, fora do P1. O componente real foi executado com `--exec` e sem argumento contra o QA.

**Provas (PostgreSQL QA real, `hardening-p1-transitivos.pg.ts` › P1-SEED, 10 casos).** O CLI roda em processo filho com ambiente mínimo: só `DATABASE_URL`/`DIRECT_URL` QA, mais PATH/SystemRoot/TEMP/NODE_ENV. Antes de iniciar, o teste confere loopback + `ops_v3_misto_qa*` e a mesma porta/banco da conexão do teste (`inet_server_port()`, `current_database()`). `loja-1` QA é criada se ausente; todos os fixtures são sintéticos. Nas intercalações em que o seed precisa pausar, a função exportada do mesmo módulo roda sobre o cliente Prisma real envolvido. A barreira é determinística e a espera é observada em `pg_stat_activity`, sem sleep.

1. CLI real: K 350 débito + 50 a prazo → `seed --exec` → título com hash/`updatedAt` idênticos → replay de K `jaRegistrado` sem caixa/mov/baixa novos → 50 legítimos quitam o mesmo título. Resultado: baixas [350, 50], marcador único com `operacaoId=K`, caixa e mov somando 400.
2. Título ausente: dry-run sem DML (hash de todos os títulos da `loja-1` igual) → `--exec` cria 400/pendente/`seed_os_import` → segunda execução mantém linha e identidade → K e os 50 seguintes no mesmo título → terceira execução preserva tudo.
3. Pago, parcial, cancelado, estornado (fixture), valor vigente 500 com a coluna da OS em 400 e OS `Entregue` com título pendente: todos intactos depois do CLI.
4. K segura OS/título (pausado no caixa) → CLI espera a trava → K commita → seed preserva. Testado com título existente e com título ausente (criado por K).
5. Seed segura a OS antes do INSERT → K espera a trava da OS → seed cria (ausente) ou preserva (existente) → K aplica no título, replay sem efeito, 50 quita. Testado com título existente e ausente.
6. Seed já observou e está antes do INSERT → rota global cria o título e o Financeiro paga 100 → seed preserva o vencedor (snapshot e pagamento 100, parcial).
7. Rota global com INSERT feito e sem commit → CLI espera o índice único → rota commita → título da rota preservado.
8. Seed antes do INSERT × quitação do Financeiro (`liquidarContaReceber`) → quitação preservada (pago, saldo 0).

Nenhum caso terminou em deadlock nem em timeout (`naoEhDeadlock`). Não houve retry, skip, timeout aumentado nem mock de pagamento/DB. Só `@/auth`, `next/cache` e o gate de assinatura da rota legada são simulados, como no restante do arquivo. Os helpers `estado`/`conferirK350Mais50` ganharam um escopo opcional (título/sessão/movimentações da OS) para a loja compartilhada `loja-1`. Sem escopo, o comportamento dos casos anteriores não muda.

| Evidência (em `playwright-report/ops-p1-hardening-001/`) | Resultado |
| --- | --- |
| `r3fix-RED-seed-original.mjs.txt`, `r3fix-RED-snapshot.pg.ts.txt`, `r3fix-RED-hashes.txt` | fonte original (sha256 `d593636…`, blob `473333e`) e teste RED, HEAD `668dfb0` |
| `r3fix-RED1-original.log` | script ORIGINAL: 9 failed / 37 skipped fora do filtro (46). 5 casos CLI falham por comportamento: título `parcial`→`pendente`, baixas [], marcador 0, replay de K `jaRegistrado:false`, caixa/mov duplicados, pago/cancelado/estornado→pendente, Entregue→pago, 500→400. Os 4 casos em processo falham por ausência do export (TypeError → barreira não atingida, 60 s) |
| `r3fix-RED2-seed-seam-only.mjs.txt`, `r3fix-RED2-seam.log` | só seam (export + wrapper; MESMO findUnique+upsert): 9/9 falham por comportamento, incluindo seed×K (ledger apagado depois de K), rota+pagamento e quitação (pagamentos [], pendente) |
| `r3fix-RED3-rota-cli.log` | caso 7 com o seam: 1 failed / 46 skipped (snapshot da rota substituído por `seed_os_import`) |
| `r3fix-GREEN-seed-verbose-2.log` | P1-SEED 10 passed / 37 skipped (47) |
| `r3fix-pg-v3-full-final.log` | PG V3 completo, 3 arquivos: 105/105 (95 anteriores + 10; transitivos 47) |
| `r3fix-typecheck.log` | `tsc --noEmit --incremental false`, heap 8192, exit 0 (antes do build) |
| `r3fix-lint.log` | eslint dos 2 arquivos alterados: exit 0, sem avisos |
| `update-writers-r3fix.cjs` | script que atualizou o WRITERS |

PG V4 paridade, PG gated, mounted e unit amplo não foram reexecutados. O corretivo não toca código de app, hooks, rotas ou serviços que eles exercitam; só o script e o arquivo PG acima mudaram (`git diff --name-only 668dfb0..e02e826`). Os resultados válidos continuam os de `5727e58`. O coordenador executou novo build oficial, E2E e typecheck pós-build sobre a fonte final; as provas estão na seção final da R4.

## Inventário e ordem de locks

`OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json` foi atualizado por Claude sobre o SHA funcional ce1d806, no corretivo R2 sobre 3071c67 e, na árvore reconciliada, sobre 5727e58 (`reconciliation`, writers do upstream marcados com `origin`, P1-T7 no upsert genérico): 118 funções, 105 SAFE_TRANSACTIONAL, 13 READ_ONLY, 39 writers diretos. Há 17 entradas transitivas financeiras/do título/itens, incluindo o seed oficial corrigido na R3, em taxonomia separada; 10 escopos revisados e 2 exclusões não são somados às funções. Categorias e papéis não devem ser confundidos: um caller seguro pode alcançar um callee travado sem ele próprio gravar payload.

Recebimentos V3 seguem advisory(OS)→sessão FOR SHARE quando necessário→OS FOR UPDATE→título. OS genérica, orçamento/intenção e cancelamento seguem OS→título na mesma transação. Helpers do Financeiro travam somente título, sem voltar à OS. Estoque segue OS→produtos→itens; sync de rascunho segue OS→itens. O mapa completo e as justificativas estão no inventário; a R4 deve procurar arestas inversas, casos de título inicialmente ausente e o seed financeiro oficial.

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

## Revisão e publicação pendentes

Os gates anteriores ao corretivo do seed estão preservados na seção histórica seguinte. Novo build oficial, E2E e typecheck pós-build sobre a fonte `e02e826` passaram, conforme a seção final da R4. A R4 independente deve revisar o SHA final exato da árvore reconciliada, separar o código do upstream (PR #237) do código deste GOAL e tentar quebrar as resoluções de conflito (orçamento sob trava × regras de validade do upstream; entrega/comercial do upstream × recusas/estado financeiro), o P1-T7 (lista antiga após faturamento vigente; manual/import preservados) e a corrida trava vazia → título criado → leitura → pagamento → escrita, a substituição rascunho×ledger em ambas as ordens, e ainda A–O do comando original, os cinco achados R1, a cobrança sobre faturamento vigente, a criação concorrente de título e os candidatos operacionais relatados. P0=P1=P2=0 e APPROVE são obrigatórios. Havendo achado, corrigir neste mesmo GOAL por Anthropic e obter nova R sobre o novo SHA.

Só então: PR exclusivo com o SHA revisado; checks verdes; merge normal GitHub sem squash/rebase/force; SUCCESS de omni-gestao e omni-gestao-pro no merge SHA; smoke produção somente leitura. Sem sessão, OWNER_PENDING_AUTH, sem pedir credenciais. Nenhum pagamento real, mutation financeira de produção ou acesso à OS-2026-00028 é permitido. A worktree permanece ATIVA até relatório final e dois deploys verdes.

## Histórico: gates finais do coordenador antes da R3

O coordenador executou o build oficial, o E2E conjunto e o typecheck completo após o build sobre o código funcional `5727e5802e202f05eef9aedcf30f17813f6cda8a`. O HEAD `32a2283d6e5ac288c06def5d3034ce86a20a3219` difere desse SHA somente em REPORT/WRITERS, verificado por `git diff --name-only`. Este commit de consolidação também altera somente o REPORT. A R3 deve revisar o SHA exato que contém esta consolidação, fornecido fora do arquivo para evitar autorreferência de hash.

| Gate | Resultado final | Evidência integral local, gitignorada |
| --- | --- | --- |
| Build oficial `npm run build` | exit 0; compilação 99s; 102 páginas estáticas; `MIGRATION_SKIPPED` | `p1t7-build-coordinator.log` |
| E2E: hardening + PR235 V3 + paridade V4 | 6/6 em 28,1s; workers=1; retries=0 | `p1t7-e2e-coordinator.log` |
| Typecheck depois do build | `tsc --noEmit --incremental false`; heap8192; exit 0 | `p1t7-typecheck-post-build.log` |
| ESLint do diff exclusivo do GOAL | 60 arquivos; exit 0; zero erros; um aviso preexistente em `app/actions/operacoes.ts` | `p1t7-lint-goal-all.log` |
| Diff e schema | `git diff --check BASE..HEAD` exit 0; nenhum diff em schema/migrations | Git na árvore exata |

Os logs estão em `playwright-report/ops-p1-hardening-001/`; cópias sanitizadas do coordenador estão fora da worktree no diretório de artefatos do chat. O build Next informa que ignora tipos, por isso o typecheck completo separado é um gate obrigatório e foi executado. O build anterior `3071c67` não foi reutilizado como prova da árvore reconciliada. As duas falhas anteriores de navegação permanecem registradas (`r2fix-e2e-first-failed.log`: 4 PASS/2 FAIL; `r2fix-e2e-recheck-failed.log`: 5 PASS/1 FAIL), seguidas da correção de sincronização pelo Claude e do novo conjunto 6/6.

A suíte ampliada final permanece qualificada: 2006 PASS/10 FAIL estáticas preexistentes em `preview-honesty`, 124 arquivos. Não se declara a suíte inteira do projeto verde. Os 95 PG V3, 40 PG complementares, 1 PG V4 e 49 montados passaram integralmente na árvore integrada. O RED R2 correto é 7 FAIL/1 PASS/27 fora do filtro; o RED P1-T7 é 2 FAIL/35 fora do filtro, com GREEN 2/2 e PG V3 completo 95/95.

O fetch final anterior à R3 confirmou `origin/main=a27b37e861ff044666d16535acb292f5d6957fcf`. A implementação e os testes permanecem exclusivamente Anthropic. Não houve PR, merge remoto, deploy, pagamento real, alteração financeira real nem acesso à OS-2026-00028 até este registro. O resultado da R3 e as provas posteriores de publicação serão gravados no relatório operacional fora da worktree, sem alterar o SHA aprovado.


## Consolidação documental para a R4

Claude criou o commit funcional e concluiu o PostgreSQL V3 105/105, typecheck e lint antes do build. Também redigiu a seção R3 e o inventário (17 transitivos); o coordenador concluiu a consolidação documental e o commit destes dois documentos. O diff desde o SHA funcional é exclusivamente documental. Build/E2E/typecheck pós-build passaram e seus resultados reais foram consolidados na seção seguinte antes da R4. O parecer R3 é REQUEST_CHANGES sobre 668dfb0, e não aprova e02e826. Uma nova revisão exata é obrigatória.

## Gates finais do coordenador antes da R4

Fonte funcional Anthropic `e02e826ed4dabf4ce7f9db7fdabd2cbccace0f5e`. O HEAD validado `9f582cc5211931f15b4d4d33a697d14779323b9a` difere dele somente em REPORT/WRITERS; este commit de consolidação também altera somente o REPORT. A R4 deve revisar o SHA exato posterior fornecido no pacote externo, sem autorreferência de hash neste documento. O parecer R3 REQUEST_CHANGES não é uma aprovação do corretivo.

| Gate | Resultado | Evidência local gitignorada |
| --- | --- | --- |
| PostgreSQL V3 completo | 105/105, 47 transitivos e dez P1-SEED, no código final Anthropic | `r3fix-pg-v3-full-final.log` |
| Build oficial | exit 0, compilação 62s, 102 páginas estáticas, `MIGRATION_SKIPPED` no QA | `r3fix-final-build-coordinator.log` |
| E2E conjunto hardening + regressão PR235 V3 + paridade V4 | 6/6, 29.3s, workers=1, retries=0 | `r3fix-final-e2e-coordinator.log` |
| Typecheck após build | `tsc --noEmit --incremental false`, heap8192, exit 0 | `r3fix-final-typecheck-coordinator.log` |
| ESLint de todo código/teste do diff | 61 arquivos, exit 0, zero erros, um aviso preexistente em operacoes.ts | `r3fix-final-lint-coordinator.log` |
| Diff/schema | diff-check BASE..HEAD e árvore limpos; schema/migrations sem alterações | Git no SHA final |

Os quatro gates do coordenador têm JSON externo com HEAD, horários e exit code real. Os logs incluem `ACTUAL_EXIT_CODE=0 HEAD_VALIDATED=9f582cc...`; o typecheck completo separado é obrigatório porque o build Next ignora tipos. Não se inferiu sucesso apenas de um log vazio.

Mounted V3 20/20 e V4 29/29, PG complementares 40/40, PG V4 paridade 1/1 e unit amplo 2006 PASS/10 FAIL estáticas preexistentes (124 arquivos) continuam qualificados como execuções em 5727e58: o código que exercitam não mudou no corretivo do seed. O diff 668dfb0..e02e826 contém somente o script e os testes PG do seed. A suíte inteira do projeto não é declarada verde. Os REDs e as falhas históricas de navegação continuam preservados.

PR, merge remoto, deploy e smoke ainda não ocorreram. Uma nova sessão OpenAI READ-ONLY revisará este SHA final e todos os caminhos A–O, o P1 do seed, as resoluções do upstream e os corretivos anteriores. Merge normal exige P0=P1=P2=0, APPROVE e checks verdes. Provas operacionais posteriores serão gravadas fora da worktree para preservar o SHA aprovado. Nenhum pagamento real, alteração financeira de produção ou acesso à OS-2026-00028 ocorreu.
