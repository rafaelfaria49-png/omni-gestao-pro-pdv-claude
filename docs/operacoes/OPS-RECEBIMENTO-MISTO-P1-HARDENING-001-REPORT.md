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

OS_PAYLOAD_WRITERS_SCANNED=114_FUNCOES_EXPLICITAS (SAFE_TRANSACTIONAL 100 · SAFE_CAS 0 · WHOLE_PAYLOAD_STALE_RISK 0 · READ_ONLY 14; 37 gravam payload diretamente); +10 escopos revisados e 2 exclusões em apêndice, FORA da contagem (docs/operacoes/OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json)
STALE_WRITERS_FOUND=YES
STALE_WRITERS_FIXED=CHECKPOINT_266003A + 2_IMPORTADORES_RUNTIME + PATCH_GENERICO_V2 + createOS + PUT_/api/ops/ordens + 3_SCRIPTS_MANUAIS
STALE_WRITERS_REMAINING=0

ROW_LOCK_STRATEGY=mutarPayloadOSV3: tx -> SELECT FOR UPDATE (loja+id) -> releitura do latest -> mutação intencional (spread) -> UPDATE na mesma tx
CAS_STRATEGY=CAS por updatedAt existente preservado (dados básicos, checklist de entrada, prova) e agora SOB a trava (por isso classificados SAFE_TRANSACTIONAL; nenhum writer depende só de CAS)
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
IMPLEMENTER_P3_CANDIDATES=3 (candidatos do implementador, não P3 finais do revisor; ver abaixo)
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
Por isso os dois validadores privados do coordenador falham só na asserção antiga de `created`
(`created === 1`), contra o `updated` correto do contrato novo. Eles **não** são testes versionados
deste GOAL; não foram lidos, alterados nem apagados, e a falha não foi escondida. O teste versionado
cobre esse caminho com `updated: 1` e todas as verificações de segurança.

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

Arquivo versionado: `docs/operacoes/OPS-RECEBIMENTO-MISTO-P1-HARDENING-001-WRITERS.json`, levantado
sobre o código de `c1fa75a` (este commit só muda docs).

Correção desta revisão do inventário: a versão anterior tinha **95 registros, não 95 funções**. Havia
globs (`function='*'`), uma entrada combinada (`mutarPayloadOS / aplicarImportacaoEmOSExistente`), um
helper puro e escopos de leitura/histórico na mesma contagem, além de categorias fora da taxonomia
exigida. Agora:

- **`functions` (114, contadas):** uma entrada por função nomeada, com arquivo e linha da declaração,
  `role` (PRIMITIVE 8 · WRITER 37 · CALLER 55 · READER 14), `callee`, `lock`, `latest`, `intent` e
  `strategy`. Usa só as quatro categorias exigidas: **SAFE_TRANSACTIONAL 100 · SAFE_CAS 0 ·
  WHOLE_PAYLOAD_STALE_RISK 0 · READ_ONLY 14**.
  - Delegação, criação inédita e trava + CAS ficam em `role`/`strategy`; a categoria antiga fica em
    `previousCategory`.
  - SAFE_CAS = 0 porque os três CAS existentes rodam sob `FOR UPDATE`.
  - READ_ONLY quer dizer que a função nunca grava `OrdemServico.payload` a partir da leitura. A única
    escrita em outra tabela está explícita: `syncOperacaoItensComOrcamento` grava `OrdemServicoItem`.
- **`scopesReviewed` (10, fora da contagem):** V4 (sem escrita direta; consome 16 módulos V3, todos
  com funções listadas), consumidores cliente da V2, rotas e actions só de leitura,
  `app/api/ordens-servico/**` (escrita devolve 410), scripts que não gravam payload e helpers puros.
- **`appendixExcluded` (2, fora da contagem, NÃO aprovados como writers):** `scripts/migrate-loja-ids.mjs`
  (grava só a coluna `lojaId`) e o backend histórico aninhado do espelho (abaixo).

Reconfirmação de que a troca de categoria não escondeu risco: cada função foi reclassificada pela
prova no código. Uma checagem cruzada mapeou toda gravação encontrada pelo grep
(`ordemServico.update*/create*/upsert/delete*`, primitivas, `updateOSPayload`/`updateOSStatus`/
`createOS`/`appendTimelineEvent`) para a função que a contém. Todas caem numa entrada de `functions`,
exceto o apêndice (`migrate-loja-ids`) e os consumidores cliente da V2 em `scopesReviewed` (hooks
React; nenhum importador de servidor). A varredura achou funções que a versão anterior omitia ou
agrupava (prova de entrada ×6, `finalizarAtendimentoRapidoV3`, `gerarOrcamentoDaOS` ×2, `criarOS`,
`criarOSCore`, `executeOmniAgentIntent`, `syncFinanceiroAfterOSPayloadUpdate`, `persistirImportacao`,
primitivas…). Nenhuma é WHOLE_PAYLOAD_STALE_RISK. Também corrige uma nota errada: `criarOSEnterpriseV3`
grava só via `createOS`; não chama `updateOSPayload` depois.

### Espelho `pdv-github-original` (limite preciso)

A pasta **não** é inteira inalcançável. `app/dashboard/pdv-github-original/page.tsx` importa
`PdvGithubOriginal` e, com `experimentalPdvEnabled` (`NEXT_PUBLIC_OG_EXPERIMENTAL=1`), renderiza a UI
de referência (sem a flag, `ModuleEmDesenvolvimento`). O fecho de imports dessa rota (`page.tsx` e
`layout.tsx`, com relativos e aliases do tsconfig) tem 5 arquivos do espelho: `PdvGithubOriginal.tsx`,
`Icons.tsx`, `Modals.tsx`, `data.ts` e `pdv-original-scope.css`. São 0 arquivos sob `app/`, 0 gravações
em `ordemServico`, 0 `"use server"` e nenhum `fetch`/`/api/`.

Já o backend histórico aninhado (`components/pdv-github-original/app/**`, mais `components/`, `lib/`,
`scripts/` e `importar_backup.mjs` do espelho) contém gravações em `ordemServico` não corrigidas. Ele
não é roteado: o App Router só monta o `app/` da raiz e não há `src/app`. Também não é importado: fora
do espelho, a única referência de runtime é a `page.tsx` acima. Está excluído no `tsconfig.json` e no
`vitest.config.ts`. Por isso fica no apêndice, sem contar como writer aprovado. Nada no espelho foi
editado ou executado.

### Candidatos P3 do implementador (não são P3 finais do revisor)

Fora da corrida financeira do P1-B; relatados e não corrigidos por escopo. Em todos, a gravação é
feita sobre o latest, sob a trava, e campos financeiros nunca vêm do patch:

1. `applyOperacaoHubAcao` edita `orcamento` a partir de leitura prévia (última escrita vence no
   próprio campo).
2. `abrirRetornoV3` decide "retorno aberto?" sobre leitura prévia (duplo envio concorrente pode abrir
   2 atendimentos).
3. Da mesma classe do 1, registrado nesta revisão do inventário: `components/operacoes/lovable/api/os.ts::gerarOrcamentoDaOS`
   (alcançado no servidor por `orcamento-actions::gerarOrcamentoDaOS`) decide "já há orçamento
   real?" sobre `listOS` e grava `{ orcamento, timeline }` via `updateOSPayload`.

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
  ambiente; 4 suítes PG gated sem a variável (verdes acima: gated 34/34); 2 validadores privados do
  coordenador (só a asserção antiga de `created` contra o `updated` correto; não versionados neste
  GOAL, não alterados nem apagados). Observação: a execução sem filtro também coletou
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
