# GOAL 025 — preflight e auditoria de persistência do plano

Data: 2026-10-08 (America/Sao_Paulo). Escopo: **PLAN-ONLY**.
GOAL: [FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025](../../execution-tracks/fiscal/goals/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.md).
Decisão: **READY_FOR_025_PLAN_REVIEW**; revisão independente pendente.

## Base e isolamento

- `git status --short` identificou alterações preexistentes de outras tarefas no checkout
  C:/Projetos/omni-gestao. Elas foram preservadas; nenhum arquivo daquele trabalho foi staged.
- Fetch concluído. `git rev-parse origin/main` =
  `4e87fb13f53fa9f78e229d88b1b8566f95262ad0`, igual ao SHA observado pelo humano.
- Branch nova `plan/fiscal-025-retry-reconciliation` criada diretamente de origin/main,
  em worktree isolada: `C:/Users/rafae/.codex/visualizations/2026/10/08/01a1197c-6cff-7b13-8316-e4eb89fdd8c2/fiscal-025-plan`.
  Status inicial dessa worktree limpo; .aep-active ausente.
- Referência do 024: PR #242, merge `390a9753296c4494c2c818cbdc31dfa61e0fe63b`.
  Resultado canônico [BLOCKED_BY_RETRY_RECONCILIATION_REQUIRED](FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md).
  O estado do piloto é o recebido do humano/024; não foi novamente consultado em banco.

Verificação de zero drift desde o merge do 024:

~~~text
git diff --name-only 390a9753296c4494c2c818cbdc31dfa61e0fe63b origin/main -- lib/fiscal test/fiscal docs/fiscal prisma/schema.prisma prisma/migrations
git log --format=oneline 390a9753296c4494c2c818cbdc31dfa61e0fe63b..origin/main -- lib/fiscal test/fiscal docs/fiscal prisma/schema.prisma prisma/migrations
~~~

Ambos retornaram vazio, exit 0. Não houve alterações intermediárias revertidas nesses paths.
Objetos Git idênticos nas duas revisões:

| Caminho | Objeto |
| --- | --- |
| lib/fiscal | 75a8ef23be3f64bece2d086230be0f90602af0f2 |
| test/fiscal | fae68a2893eba87ffd3bee5b0f99dbc071948be8 |
| docs/fiscal | 6dc61a6ea79c1152abd4a5154fe8c464d18f54f4 |
| prisma/schema.prisma (inclui modelos fiscais) | 63283f20f3a65ff168bb73d667699083e38392c3 |
| prisma/migrations | 627515c822f61415f09ce5e1b3c0f3f3f62a5d56 |

## Auditoria somente de fontes versionadas

| Primitive / fonte | Constatação | Adequação ao arquivo histórico 588 |
| --- | --- | --- |
| lib/fiscal/storage/mirror-vault.ts:22-44 | resolveXmlStorageMirror retorna sempre noop, active=false; não há arquivo real | Insuficiente; não ativar/provisionar nesta etapa |
| lib/fiscal/storage/types.ts:58-92 | Contrato do espelho de XML autorizado, sem backend concreto | Contrato não é prova de persistência |
| lib/fiscal/storage/xml-storage-reader.ts:87-128,151-180 | Lê colunas/payload atuais; escolhe job mais recente; também escreve FiscalLog | Não arquiva tentativas; não executar como leitura pura do banco |
| prisma/schema.prisma:2472,2610,2645 | NotaFiscal e payload do FiscalEmissaoJob são estado mutável; FiscalLog é trilha de eventos | Sem entidade Fiscal de tentativa imutável completa |
| prisma/migrations/0013_fiscal_foundation/migration.sql | Cria nota/job/log e índices; não impõe archive imutável de tentativas | Convenção append-only do log não preserva bytes; XML no log é proibido |
| lib/fiscal/emission/prisma-uncertain-state-persistence.ts:262-303 | Guard bloqueia nota TRANSMITINDO; pré-transmissão substitui colunas e payload.document | Não versiona tentativa anterior |
| Mesmo arquivo:607-670 | Mirror de autorização é opcional, posterior ao commit, falha gera aviso | Não atende archive obrigatório antes da reconciliação |
| Mesmo arquivo:74-87,673-730 | findEmissionJob escolhe mais recente incluindo contingência; markRejected usa mensagem de número consumido | Exige vínculo jobId inequívoco e semântica específica 588 |
| lib/contador/documentos/storage-r2.ts:152-177,190-204,270-279 | Upload assinado cria exclusivamente; escrita server-side pode sobrescrever e há removerObjeto | Storage privado vigente de outro HUB, sem arquivo Fiscal imutável pronto |
| lib/contador/documentos/storage-supabase.ts:79-113 | Provider legado; upload server-side com upsert=true | Não é solução de arquivo imutável |
| lib/fiscal/vault/provider-resolver.ts:38-73 | EnvVault somente leitura; provider supabase_vault não implementado | Cofre de segredos não é arquivo de tentativas |
| prisma/migrations/0022_pessoas_cadastro_backend/migration.sql:468-477 | Triggers imutáveis aplicam-se às tabelas próprias de Pessoas | Não arquivam tentativa Fiscal; reutilização exigiria extensão e gate |
| ADR-0017 §2 e ADR-0018 §2.1/2.4 | Retry incerto usa mesmos bytes; espelho opcional de autorização não bloqueia commit | Nova correção 588 demanda decisão explícita, sem generalizar exceção |
| lib/fiscal/provider/sefaz/sefaz-cstat-matrix.ts:324-343 | 588/NFeAutorizacao4 é REJECTED terminal e não consome número | NOT_FOUND isolado ou 588 em consulta não autorizam correção |

Conclusão limitada às fontes versionadas: **SCHEMA_OR_STORAGE_EXTENSION_REQUIRED=true**.
Não foi verificada infraestrutura externa oculta nem provisionado qualquer recurso.
Não existe autorização para inventar JSON mutável, reusar mirror inativo ou tomar hash sem
bytes como preservação suficiente. Backend específico e necessidade de Prisma permanecem
para decisão humana 025-A. O contrato completo está no GOAL, evitando duplicação.

A fila atual (`prisma-queue-worker.ts:165-201`) não adquire AGUARDANDO_RETRY com data null.
A terminalização planejada em FALHA continuará inelegível automaticamente, mas
`queue-admin.ts:125-167` permite reprocessar FALHA genericamente: o plano exige bloquear
esse atalho para a correção 588. Nenhum desses caminhos foi executado ou alterado.

## Governança e validação

Planejamento autorizado segue EXECUTION_PROTOCOL §2. GOAL 025 inicial READY/C3/ALTO,
revisao_independente=true, gates_liberados=[] e allowlist documental.
Regeneração de state.json/REGISTRY.md somente via `node scripts/track.mjs registry`;
nenhuma edição manual nem nova linha de ledger. O 024 permanece BLOCKED.
Não há `open`/`close`: não iniciar nem ratificar implementação de um plano pendente de revisão.

Baseline e validação após `registry`: `node scripts/track.mjs verify --all` PASS,
nove trilhas, REGISTRY.md e GATES.md sem divergências. `git diff --check`: PASS.
Validação mecânica do plano: PASS para parser AEP real, READY/C3/ALTO,
revisão independente, PLAN_ONLY, implementação negada, allowlist documental, gates vazios,
identidades/saídas exigidas e quatro links locais válidos. Ledger integralmente igual ao HEAD
de entrada (12 linhas); 024 permanece BLOCKED. .aep-active ausente, nenhuma execução aberta.
RUNNING na trilha é projeção automática da presença de um GOAL READY, sem implementação iniciada.
Testes fiscais, TypeScript e build: **NOT_RUN / não aplicáveis a esta etapa documental**.
Os PASS de fixtures do 024 não são novos testes nem prova dos bytes históricos ou do candidato.

## Contenção e relatório do plano

~~~text
GOAL=FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025
BASE_MAIN=4e87fb13f53fa9f78e229d88b1b8566f95262ad0
PLAN_BRANCH=plan/fiscal-025-retry-reconciliation
CODE_CHANGED=false
SCHEMA_CHANGED=false
DB_CONNECTIONS=0
DB_WRITES=0
EXTERNAL_SEFAZ_CONTACT=false
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0
IMMUTABLE_ARCHIVE_STRATEGY=PRIVATE_IMMUTABLE_ATTEMPT_ARCHIVE_REQUIRED_PENDING_025_A
SCHEMA_OR_STORAGE_EXTENSION_REQUIRED=true
OLD_JOB_REUSE_REQUIRED=true
SECOND_EMISSION_JOB_ALLOWED=false
SAME_NOTA_REQUIRED=true
SAME_NUMBER_REQUIRED=true
G_F7=BLOCKED
G_F12=BLOCKED
INDEPENDENT_REVIEW_REQUIRED=true
IMPLEMENTATION_STARTED=false
FINAL_DECISION=READY_FOR_025_PLAN_REVIEW
~~~

Publicar somente documentação/AEP na branch de planejamento, abrir PR para main,
solicitar revisão independente **somente do plano 025** e parar, sem merge.
Commit e PR serão identificados no relatório de entrega e no próprio PR, sem hash circular.
CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não mudam: não houve entrega funcional nem decisão
arquitetural aprovada. Arquivamento histórico, reconciliação, reentrada e gates permanecem
pendências futuras, sem reivindicação de sucesso no banco.
