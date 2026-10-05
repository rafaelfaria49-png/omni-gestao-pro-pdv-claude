# OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — relatório de implementação (pré-revisão)

Retomada em 05/10/2026 (07:18 America/Sao_Paulo), após o reset da cota Anthropic. `git fetch origin`
(coordenador): `origin/main=1e45f98ade83b3071548d581225928b0fd95b06c`, sem avanço; nenhuma reconciliação.
Implementação: Claude Code (`claude-opus-5-5`). Sobre o checkpoint `266003a` (38 arquivos, commit
mecânico do coordenador) esta rodada fechou os writers de importação, o restante do inventário, o
E2E-D e os gates. **O GOAL não está concluído**: falta a revisão independente OpenAI (sessão nova,
READ-ONLY) sobre o SHA final, e depois PR/checks/merge normal/deploy/smoke somente leitura.

## Estado

```text
GOAL=OPS-RECEBIMENTO-MISTO-P1-HARDENING-001
BASE=1e45f98ade83b3071548d581225928b0fd95b06c
FINAL_HEAD=COMMIT_QUE_CONTEM_ESTE_RELATORIO (SHA exato entregue ao coordenador)
CHECKPOINT_HEAD=266003a4efa2899fce0d956317e3aba853ff2e19
BRANCH=goal/ops-recebimento-misto-p1-hardening-001
WORKTREE=C:\Projetos\omni-gestao-ops-recebimento-misto-p1-hardening-001
IMPLEMENTER_FAMILY=anthropic

P1_CANONICAL_IDENTITY=FIXED; UNIT_MOUNTED_PG_E2E_C_PASS
P1_TERMINAL_DECISION_LOST_UPDATE=FIXED; OPERACIONAIS+IMPORTADORES+PATCH_V2+SCRIPTS; PG_AMBAS_ORDENS_PASS
P2_CROSS_OS_DRAFT_RESET=FIXED; MOUNTED_PASS; E2E_D_PASS

CANONICAL_AGGREGATES_SAME_FORM=PASS
LEGACY_REPLAY_COMPAT=PASS_PG_SIMPLES_SPLIT_REPETIDO_E_MARCADOR_MISTO_V1
SAME_ECONOMIC_RETRY_SAME_KEY=PASS_HOOK_MONTADO_PG_E_E2E_C
DIFFERENT_ECONOMIC_CONTENT_CONFLICT=PASS_UNIT_E_PG (forma, sessão, 1 centavo)

OS_PAYLOAD_WRITERS_SCANNED=95_ENTRADAS_POR_FUNCAO (docs/operacoes/OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json)
STALE_WRITERS_FOUND=YES
STALE_WRITERS_FIXED=CHECKPOINT_266003A + 2_IMPORTADORES_RUNTIME + PATCH_GENERICO_V2 + createOS + PUT_/api/ops/ordens + 3_SCRIPTS_MANUAIS
STALE_WRITERS_REMAINING=0

ROW_LOCK_STRATEGY=mutarPayloadOSV3: tx -> SELECT FOR UPDATE (loja+id) -> releitura do latest -> mutação intencional (spread) -> UPDATE na mesma tx
CAS_STRATEGY=CAS por updatedAt existente preservado (dados básicos, checklist de entrada, prova) e agora SOB a trava
LOCK_ORDER=advisory(OS) -> sessão FOR SHARE -> OS FOR UPDATE -> título FOR UPDATE; operacional/importação = só OS (folha) e depois linhas que ninguém trava antes da OS
DEADLOCK_TEST=PASS_PG (normal, misto, estorno, a prazo, prioridade, técnico, local, importação na MESMA OS e caixa, 3 rodadas; limites maxWait 5000/timeout 15000 iguais à base)

PIX_100_EQ_PIX_50_50=PASS
RESPONSE_LOSS_REPLAY=PASS_MOUNTED_PG_E2E_C
TERMINAL_REFUSAL_SURVIVES_CONCURRENCY=PASS (prioridade/técnico/localização, rota de importação, importador avançado, script .mjs; ambas as ordens)
PRIORITY_SURVIVES_CONCURRENCY=PASS_PG
NO_DUP_TITLE_PAYMENT=PASS
NO_DUP_MOVIMENTACAO=PASS
NO_DUP_CAIXA=PASS
OS_A_DOES_NOT_CLEAR_OS_B=PASS_MOUNTED_E_E2E_D

PR234_REGRESSION=PASS
PR235_350_50=PASS_PG_E2E_V3_V4
PR235_100_APRAZO=PASS_PG
PR235_LATER_PAYMENT=PASS_PG_E2E_V3_V4

UNIT=FOCAL_132_PASS; SUITE_COMPLETA_9179_PASS_40_FAIL_FORA_DO_ESCOPO (detalhe abaixo)
MOUNTED=PASS_V3_20_V4_29
POSTGRES=PASS_V3_58 + V4_PARIDADE_1 + FLUXO_CURTO_GATED_34
E2E=6_PASS_INCLUINDO_SETUP (C, D, V3 350+50->50, V4 350+50->50, V4 R1); workers=1 retries=0
REGRESSION=PASS
TYPECHECK=PASS (tsc --noEmit)
LINT=PASS_0_ERROS (1 warning pré-existente em app/actions/operacoes.ts)
BUILD=PASS_OFICIAL_VIA_HELPER (MIGRATION_SKIPPED)
DIFF_CHECK=PASS

SCHEMA_CHANGED=NO
MIGRATION_CREATED=NO

R_FAMILY=openai
R_HEAD_REVIEWED=PENDENTE
R_VERDICT=PENDENTE
P0=NOT_REVIEWED
P1=NOT_REVIEWED
P2=NOT_REVIEWED
P3=NOT_REVIEWED
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
VALIDADO=SIM_LOCAL_QA
PUBLICADO=NO
HOMOLOGADO=NO
BLOCKER=REVISAO_INDEPENDENTE_OPENAI_PENDENTE
```

## O que mudou nesta rodada

### Importadores de OS (P1-B, pendências 1 e 2)

Causa: `PUT /api/ops/ordens/import` (OS casada → `update`; id existente → `upsert`) e
`importador-avancado/persistidor.ts::persistirOS` gravavam o payload do arquivo **inteiro** por cima da
OS. Prova RED histórica (código do checkpoint, PostgreSQL real): `import-remaining-red.log`. Nos dois
caminhos da rota, a recusa terminal sumia, um campo desconhecido sumia e a MESMA chave recusada
gravava depois 1 título, 1 caixa e 1 movimentação PIX 100.

Correção: `lib/operacoes-v3/os-payload-import.ts::aplicarImportacaoEmOSExistenteV3` (sobre
`mutarPayloadOSV3`): trava a OS, relê o latest e aplica um **patch intencional**:

- campos do arquivo sobrescrevem os de mesmo nome; o que o arquivo não traz permanece;
- estado do servidor nunca vem do arquivo: `id`, `storeId`, `codigo`, `criadoEm`, `timeline`, toda
  chave `*V3`/`*V4` (recusas, `pagamentoV3`, `aPrazoV3`, status V3, entrega, retornos…) e `estoque*`;
- OS com estado financeiro/terminal (espelho de pagamento, a prazo, recusa gravada, título no
  Financeiro, entregue/cancelada): valores e status do arquivo também não entram (payload e colunas
  `valorTotal`/`valorBase`/`status`);
- `clienteId` não resolvido no arquivo mantém o vínculo atual.

A rota também passou a ser escopada por loja no caminho do id informado. Um id que pertence a
**outra loja** nunca é tocado: a importação cria uma OS nova na loja do pedido (o `upsert` por id sem
loja podia sobrescrever OS alheia). Mudança de contrato: uma OS existente encontrada pelo id agora
conta em `updated`, não em `created`.
Por isso o validador privado do coordenador (`existing_id_upsert`) falha só na asserção dura
`created === 1`. O caso `matched_update` dele passa inteiro. O teste versionado cobre esse caminho
com `updated: 1` e todas as verificações de segurança.

### Demais writers fechados no inventário

- `updateOSPayload` (Server Action genérica da V2): `pagamentoV3`, `aPrazoV3` e
  `recebimentoMistoRecusasV3` são removidos de qualquer patch do cliente (só os writers financeiros
  travados os gravam).
- `createOS`: create + payload definitivo na mesma transação.
- `PUT /api/ops/ordens` (migração one-shot): `deleteMany` removido; só insere quando a loja não tem OS.
  Uma OS criada entre o guard e a gravação nunca é apagada.
- Scripts manuais fora do runtime (`scripts/import-os-csv.mjs`, `importar_backup.mjs`,
  `scripts/atendimento-rapido-orfas.mjs`): mesma regra via `scripts/lib/os-payload-lock.mjs`. A
  paridade de regras TS × .mjs é testada em `os-payload-import.test.ts`. O cancelamento de órfãs
  re-verifica a condição de órfã sob a trava.

### E2E-D (pendência 3)

Investigação: as Server Actions do Next.js passam por **uma fila no cliente**. Com a resposta de A
segurada, a leitura do saldo de B (`lerPagamentoOSV3`) só roda depois que A é liberada; ao clicar
"A prazo / crediário" em B, o saldo de B ainda é 0 e a sugestão automática fica vazia **antes** da
liberação. A resposta de A não limpou nada. O spec agora preenche o rascunho de B explicitamente,
confere todos os campos ANTES de liberar A e, depois, espera o saldo real de B (botão "Registrar
R$ 100,00 + R$ 300,00 a prazo" habilitado) e confere de novo cada campo. As asserções não foram
afrouxadas nem o timeout aumentado. Nenhuma mudança de runtime foi necessária.

## Inventário de writers (pendência 4)

Arquivo versionado: `docs/operacoes/OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json` (95 entradas
por função, notas e mapa de travas). Contagem: SAFE_TRANSACTIONAL 65 · SAFE_TRANSACTIONAL+CAS 3 ·
SAFE_NEW_ROW_TX 1 · INSERT_ONLY 1 · DELEGATES_SAFE 13 · READ_ONLY 9 · PURE 1 · NOT_PAYLOAD 1 ·
NOT_REACHABLE 1 · **WHOLE_PAYLOAD_STALE_RISK 0**. A V4 não grava `OrdemServico` diretamente: consome
16 módulos de actions V3 (todos classificados).

Residuais P3 fora da corrida financeira, relatados e não corrigidos por escopo:
`applyOperacaoHubAcao` edita `orcamento` a partir de leitura prévia (última escrita vence no próprio
campo); `abrirRetornoV3` decide "retorno aberto?" sobre leitura prévia (duplo envio concorrente pode
abrir 2 atendimentos). As duas gravações são feitas sobre o latest, sob a trava.

## Validação (logs em `playwright-report/ops-p1-hardening-001/`, gitignorado)

- PG V3 (`pg-v3-all-final.log`): 58/58, incluindo 19 casos novos (importação sequencial e
  concorrente nas 2 ordens para rota e importador avançado, id de outra loja, importação legítima sem
  estado financeiro, script .mjs nas 2 ordens, `updateOSPayload` com campos financeiros, importação na
  bateria de deadlock).
- PG V4 paridade (`pg-v4-paridade-final.log`): 1/1. PG gated fluxo-curto/workspace/entrada/garantia
  (`pg-v4-fluxo-curto-gated.log`, `OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL` = banco QA, sequencial): 34/34.
  A primeira tentativa paralela falhou só por `too many clients` no cluster QA.
- Mounted: V3 20/20 (`mounted-v3-final.log`), V4 29/29 (`mounted-v4-final.log`).
- Unit focal (`unit-focal-final.log`): 132/132.
- Suíte completa `npx vitest run` (`unit-full-after-import-fix.log`): 9179 passed, 40 failed. Nenhuma
  falha é deste GOAL: 10 `preview-honesty` (pré-existentes, V4 preview sem diff); 14
  `app/api/import/advanced/route.test.ts` (mock de `getVerifiedSubscriptionFromCookies` → `null` quebra
  `hub-api-gate`; rota, gate e teste sem diff e o persistidor está mockado ali); 4 calculadora de caixa
  e 1 cancelamento de vendas (estáticos, sem diff); 5 fiscal xmllint e 2 arquivos de setup de
  ambiente; 4 suítes PG gated sem a variável (verdes acima); 2 validadores do coordenador (contador
  `created`, acima). Observação: a execução sem filtro também coletou
  `.claude/ops-p1-hardening/import-validator.test.ts` (controle privado; executado pelo vitest, não lido).
- E2E (`e2e-after-fix.log`, build novo, web QA 3051): 6/6.
- Build oficial via helper (`build-after-import-fix.log`): PASS, `MIGRATION_SKIPPED`.
- `tsc --noEmit`, lint focado (`lint-focado-2.log`: 0 erros), `git diff --check`: PASS.

As 3 reproduções RED originais (`red-prefix-*.log`, sobre a BASE) e a RED da importação
(`import-remaining-red.log`, sobre o checkpoint) são históricas e não foram repetidas.

## Próximo passo

Revisão independente OpenAI em sessão nova READ-ONLY sobre o SHA final. Achados P0/P1/P2 corrigidos
neste mesmo GOAL. Só com P0=P1=P2=0 e APPROVE: PR exclusivo, checks verdes, merge normal, deploy dos
dois projetos e smoke de produção somente leitura. A worktree continua ATIVA.
