# FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024 — evidência sanitizada

Data: 2026-10-01 (America/Sao_Paulo). Resultado vigente da retomada: CANONICAL_DB_NOT_IDENTIFIED.
O mesmo GOAL 024 foi reativado por autorização humana e a obtenção efêmera via Vercel foi executada. Nenhuma fonte recuperada produziu uma URI PostgreSQL interpretável. A identificação canônica não pôde ser comprovada; a retomada para no item 4 da autorização, antes de qualquer conexão DB, leitura funcional, teste offline ou preparação de retry. Nenhuma condição de readiness foi presumida.

## Retomada humana e preflight

- Worktree: C:/workspace; árvore limpa; branch goal/fiscal-024-corrected-retry-readiness; HEAD de entrada 2d6a7f7ecd1262aa662f42ac8567d0b23aff08f0, exatamente o esperado.
- git fetch origin concluído. origin/main=e65630f9943b53aaf5983111faf62f54d45dc095, exatamente o observado externamente. Base do 024/merge-base=bfbdf01087433738134f5ee308475c2ef9841fbe.
- git diff --name-status 2d6a7f7ecd1262aa662f42ac8567d0b23aff08f0 origin/main -- lib/fiscal test/fiscal docs/fiscal: saída vazia, exit 0.
- git log bfbdf01087433738134f5ee308475c2ef9841fbe..origin/main -- lib/fiscal test/fiscal docs/fiscal: saída vazia, exit 0. Nenhuma mudança upstream nesses caminhos fiscais.
- GOAL fechado movido de volta para goals/; somente status BLOCKED -> READY e authorization_source sanitizado foram alterados no metadado. A linha BLOCKED anterior permaneceu intacta no LEDGER.jsonl, com hash SHA-256 idêntico antes/depois da reativação.
- node scripts/track.mjs registry e node scripts/track.mjs verify --all: exit 0, oito trilhas sem divergências. Somente GOAL 024, estado fiscal derivado e REGISTRY tiveram diferenças versionadas; outros artefatos regenerados ficaram sem diferença.
- Commit separado de reativação: 14b49d4dc7476e77fbb9206f8ba1219abe79f050, mensagem aep(fiscal): reactivate FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024. Push normal concluído na mesma branch.
- node scripts/track.mjs open fiscal: exit 0, tentativa 1/3; mesmo ID, allowlist original, gates liberados vazios, família openai e revisão independente R obrigatória antes de eventual DONE.

## Obtenção efêmera das fontes autorizadas

Vercel CLI instalada 57.0.0; vercel whoami confirmou autenticação, exit 0, com saída integralmente suprimida para não revelar login. Não houve HUMAN_VERCEL_LOGIN_REQUIRED.

Somente os projetos conhecidos omni-gestao e omni-gestao-pro, ambiente Production, foram consultados com vercel env pull --environment=production --project=<projeto> --yes --non-interactive, executado em diretórios TEMP isolados fora do repo. Não houve vercel link no repo, deploy, mudança de variáveis cloud ou uso dos .env locais divergentes.

A revisão automática recusou duas propostas anteriores: primeiro o pull completo sem demonstrar suficientemente o escopo autorizado; depois a retenção intermediária em db-urls.json sem limpeza na mesma chamada. Ambas foram recusadas antes de executar. A autorização textual foi conferida e a alternativa autocontida foi aprovada: arquivos Production apenas em TEMP, extração em memória somente de DATABASE_URL/DIRECT_URL, nenhum arquivo intermediário de URLs e limpeza na mesma execução. A primeira execução aceita parou na estrutura da primeira URL; a inspeção seguinte verificou os quatro valores dos dois projetos.

Os arquivos foram lidos por linhas, selecionando apenas as duas chaves autorizadas. Nenhum valor, host, login, senha, token, certificado, CSC ou XML foi impresso. A interpretação usou dotenv.parse e new URL, sem remover aspas extras, reescrever credenciais ou trocar database.

| Fonte Vercel Production | Chave | Presente | URI interpretável | Candidato PostgreSQL utilizável |
| --- | --- | --- | --- | --- |
| omni-gestao | DATABASE_URL | true | false | false |
| omni-gestao | DIRECT_URL | true | false | false |
| omni-gestao-pro | DATABASE_URL | true | false | false |
| omni-gestao-pro | DIRECT_URL | true | false | false |

Indicadores sanitizados dos quatro valores: sem quebra de linha, sem marcador de template, sem aspas no início/fim. Isso não identifica a database nem comprova divergência do nome: a interpretação da URI falhou antes de qualquer conexão. Nenhum candidato apontou inequivocamente a omnigestao_prod. Não se tentou inventar, corrigir ou substituir URLs.

Todos os arquivos Production foram apagados imediatamente após a extração/inspeção. Locks transitórios deixados pela CLI foram resolvidos na limpeza com caminhos absolutos verificados; ao final, os diretórios TEMP de autenticação, obtenção, inspeção e driver PostgreSQL estavam removidos. O driver pg 8.16.3 foi preparado somente em TEMP, com ignore-scripts, e removido sem uso. Nenhuma dependência do repo foi alterada.

## Ponto de parada e limites da comprovação

CANONICAL_DB_NOT_IDENTIFIED é o blocker vigente. BEGIN READ ONLY, SHOW transaction_read_only, SELECT current_database() e SELECT current_user NÃO foram executados: nenhuma URI PostgreSQL válida foi disponibilizada ao driver. Não há afirmação transaction_read_only=on sem conexão/prova.

O relacionamento SALE_ID -> payload.sessaoId -> sessoes_caixa não foi lido. A divergência entre cmubufytz000ah2mcib062l0n (pedido) e cmubufytz000ch2mcib062l0n (022E) permanece sem resolução DB. NOTA_ID, jobs EMISSAO/CONSULTA, configuração fiscal, retry pendente e UNCERTAIN atuais continuam NOT_VERIFIED. A janela versionada está dormente (activationId/notBeforeUtc/expiresAtUtc=null); esse fato de código não comprova ausência de janela injetada em runtime nem estado atual de produção fiscal.

Não se avançou para numeração/reuso, allocator/constraints/lineage, caminho SOAP ou candidato da terceira tentativa. Os quatro testes focados e o comando canônico do GOAL 023 continuam NOT_RUN nesta retomada, por parada obrigatória anterior à auditoria funcional. A etapa de PATH/xmllint da continuação não foi alcançada. PASS históricos do 023 não foram promovidos a PASS do 024. Revisão independente R não foi executada; nenhum DONE ou readiness foi declarado.

É necessária uma fonte Vercel Production autorizada que disponibilize uma URI PostgreSQL interpretável e permita comprovar omnigestao_prod em transação READ ONLY. Nenhum segredo deve ser colado no chat. Nova retomada do mesmo ID exige reativação humana conforme AEP; nenhum GOAL novo foi criado. Não se solicita transmissão.

## Relatório vigente da retomada

~~~text
GOAL=FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024
BASE_MAIN=bfbdf01087433738134f5ee308475c2ef9841fbe
ORIGIN_MAIN_PREFLIGHT=e65630f9943b53aaf5983111faf62f54d45dc095
FISCAL_UPSTREAM_CHANGES=false
REACTIVATION_COMMIT=14b49d4dc7476e77fbb9206f8ba1219abe79f050
VERCEL_CLI_AUTHENTICATED=true
VERCEL_PRODUCTION_PROJECTS_INSPECTED=omni-gestao,omni-gestao-pro
CANONICAL_DB_SOURCE=NOT_IDENTIFIED
CANONICAL_DB_NAME=NOT_VERIFIED
EXPECTED_CANONICAL_DB_NAME=omnigestao_prod
CANONICAL_DB_IDENTIFIED=false
TRANSACTION_READ_ONLY=NOT_VERIFIED_NO_CONNECTION
CURRENT_DATABASE_QUERY=NOT_RUN
CURRENT_USER_QUERY=NOT_RUN
DB_CONNECTION_ATTEMPTS=0
DB_CONNECTIONS=0
DB_READ_QUERIES=0
DB_WRITES=0
DATABASE_STATE_VERIFIED=false
CAIXA_ID_FROM_SALE_RELATION=NOT_VERIFIED
CAIXA_ID_DIVERGENCE_RESOLVED=false
NO_PENDING_AUTOMATIC_RETRY=NOT_VERIFIED
NO_UNCERTAIN_STATE=NOT_VERIFIED
FISCAL_ENABLED=NOT_VERIFIED
PRODUCTION=NOT_VERIFIED
TRANSMISSION_WINDOW_ARMED=NOT_VERIFIED_AT_RUNTIME
VERSIONED_TRANSMISSION_WINDOW_ARMED=false
NUMBER_REUSE_POLICY_VERIFIED=NOT_VERIFIED
CANDIDATE_NUMBER=NOT_DETERMINED
CANDIDATE_SERIES=NOT_DETERMINED
CANDIDATE_CHNFE_EXPECTED=NOT_DETERMINED
CANDIDATE_JOB_STRATEGY=NOT_DETERMINED
FOCUSED_OFFLINE_TESTS=NOT_RUN
GOAL_023_REGRESSION=NOT_RUN
INDEPENDENT_REVIEW_R=NOT_RUN
TYPECHECK=NOT_APPLICABLE_DOCUMENTATION_ONLY
BUILD=NOT_APPLICABLE_DOCUMENTATION_ONLY
TEMPORARY_FILES_AND_DIRECTORIES_REMOVED=true
EXTERNAL_SEFAZ_CONTACT=false
SEFAZ_SOAP_POST_COUNT=0
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0
PRODUCTION_FISCAL_CONTACT=false
FISCAL_ACTIVATION_WRITES=0
TRANSMISSION_WINDOWS_ARMED_BY_THIS_GOAL=0
DOCUMENTS_CREATED=0
JOBS_CREATED=0
G_F7_AUTHORIZED=false
G_F12_AUTHORIZED=false
READY_FOR_THIRD_ATTEMPT_GATE=false
TRANSMISSION_AUTHORIZATION_REQUESTED=false
BLOCKERS=CANONICAL_DB_NOT_IDENTIFIED
FINAL_DECISION=CANONICAL_DB_NOT_IDENTIFIED
STOP=CANONICAL_DB_NOT_IDENTIFIED
~~~

## Registro histórico preservado — execução anterior à reativação

O texto abaixo registra a primeira execução e seu blocker anterior; não substitui o relatório vigente acima.


Data: 2026-10-01 (America/Sao_Paulo). Resultado: BLOCKED_BY_READONLY_DB_ACCESS.
A auditoria foi interrompida no item 4 do pedido humano. Nenhum resultado atual do banco ou readiness de transmissão foi presumido. Este relatório não autoriza G-F7, G-F12, emissão, janela ou retry.

## Base e publicação comprovadas

- Worktree C:/workspace estava limpa, sem .aep-active, na branch antiga goal/fiscal-023-cstat588-compact-message, HEAD 6a87eb3ed846fe2f934956da19cdfefe6431354c. Essa branch está publicada com o mesmo SHA e seu HEAD é ancestral da main.
- git fetch origin executado; refs são compartilhadas pelas worktrees. BASE_MAIN=bfbdf01087433738134f5ee308475c2ef9841fbe, idêntica à base esperada. Nova branch goal/fiscal-024-corrected-retry-readiness criada diretamente de origin/main. Nenhum reset ou rebase.
- PR #222 MERGED: ceeffeb05681e094f4e711c13387ba95851bcf24 (2026-10-01T03:17:26Z), presente na main. PR #228 MERGED: bfbdf01087433738134f5ee308475c2ef9841fbe (2026-10-01T11:37:59Z), presente na main. Prova: metadados GitHub e git merge-base --is-ancestor, exit 0 para ambos.
- GOAL 023 ratificado DONE no ledger; fechamento 83a5b38dd174402cf75368225a7703dcc62b2fc9. A menção OPEN/UNMERGED na evidência histórica do 023 está desatualizada e é superada pelos metadados de merge acima; a evidência histórica não foi reescrita.
- package.json engines.node=24.x; alteração e8cbbdaccbf203204f5d545b31a2e2467d65c87a. Node local v24.14.1.
- Serializador compacto em lib/fiscal/xml/xml-writer.ts, backstop lib/fiscal/xml/d01e-backstop.ts, chamada fail-closed no envelope lib/fiscal/provider/sefaz/sefaz-envelope.ts e matriz 588 em lib/fiscal/provider/sefaz/sefaz-cstat-matrix.ts: presentes na main, commit de código b9212e5cbdb433e0d653b9390d8251bd186b4c57.
- Testes cstat588-compact-message.test.ts e cstat588-produtores-compactos.test.ts presentes; follow-up 2c967440fdcc45cd31a930bb64d19e914d8b5cd7. Testes da matriz e envelope também presentes.
- Deploys Vercel Production do SHA BASE_MAIN: GitHub deployment 6783389940 (omni-gestao), success em 2026-10-01T11:45:30Z; 6783328490 (omni-gestao-pro), success em 2026-10-01T11:42:15Z. Ambos: Deployment has completed. Essa é evidência de publicação; não é leitura do estado fiscal do banco.
- AEP verify --all na base: exit 0, oito trilhas sem divergência, registry e gates iguais aos derivados.

## Acesso READ-ONLY: indisponível para o alvo canônico

DATABASE_URL e DIRECT_URL estão ausentes do ambiente do processo. A inspeção sanitizada dos arquivos locais já existentes verificou somente presença de chaves, tipo de host, correspondência do nome da base histórica e hash do host, sem imprimir URL, login, senha ou token:

| Fonte local preexistente | DATABASE_URL / DIRECT_URL | Identidade observada | Decisão |
| --- | --- | --- | --- |
| .env da worktree principal | presentes | Neon, nome de database diferente de omnigestao_prod do 022E | identidade canônica não comprovada; não conectar |
| .env.local da worktree principal | presentes | base local, host não Neon, diferente da base histórica | não usar no piloto |
| .env.vercel.local da worktree principal | ausentes | nenhuma URL de banco disponível | não há acesso canônico disponível |
| C:/workspace | somente .env.example | exemplo sem autoridade de runtime | não usar |

DB_CONNECTIONS=0; DB_READ_QUERIES=0; DB_WRITES=0. Nenhuma URL foi reescrita para trocar de database; nenhuma credencial foi buscada externamente; nenhum arquivo de ambiente foi alterado. É necessário disponibilizar uma URL canônica autorizada para operações READ-ONLY e comprovar current_database()/identidade do alvo antes de ler a loja e os registros.

## Reconstrução histórica 022E — não é estado atual do banco

Fonte: docs/ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E.md, versionada na BASE_MAIN.

| Campo | Valor histórico registrado |
| --- | --- |
| loja / ambiente / provider / modelo | loja-1 / HOMOLOGACAO / SEFAZ_DIRETO / NFCE |
| PRODUCT_ID | cmubufygs0001h2mcjk4ws5p1 |
| SALE_ID | cmubufz1v000ch2mc5fknbpy6 |
| NOTA_ID | cmubufzhb000mh2mcvwan5e2m |
| JOB_ID EMISSAO | cmubufzmf000ph2mcu6act9zk |
| JOB_ID CONSULTA | cmuchau0k0009h21ck7yhtf7x |
| NotaFiscal / número / série | TRANSMITINDO / 2 / 1 |
| EMISSAO / tentativas | AGUARDANDO_RETRY / 1; retry executado=0 no 022E |
| CONSULTA / tentativas / resultado | CONCLUIDO / 1 / consulta_not_found, 217, NOT_FOUND |
| cStat emissão | 588; não persistido no campo cStat da NotaFiscal histórica |
| chave | 35260948241205000195650010000000021026842710 |
| dedupe emissão | fiscal:emissao:v1:venda:cmubufz1v000ch2mc5fknbpy6 |
| dedupe consulta | fiscal:consulta:v1:nota:cmubufzhb000mh2mcvwan5e2m |
| contenção final no 022E | fiscalEnabled=false; Production OFF; janela versionada dormente |

DIVERGÊNCIA DE IDENTIFICADOR: o pedido informa CAIXA_ID=cmubufytz000ah2mcib062l0n; a evidência versionada informa cmubufytz000ch2mcib062l0n. Não se escolheu um dos IDs sem conferir o relacionamento real da venda no banco.

A nota histórica TRANSMITINDO e o job histórico AGUARDANDO_RETRY impedem inferir NO_PENDING_AUTOMATIC_RETRY=true ou NO_UNCERTAIN_STATE=true apenas a partir de 217/NOT_FOUND ou da matriz nova. O deploy do 023 não comprova reconciliação retroativa desses registros. Timestamps dos registros, status atuais, jobs RUNNING/PENDING, retry pendente, cscId, cscTokenRef e configuração fiscal atual permanecem NOT_VERIFIED.

## Numeração, caminho real, prova offline e candidato — pendentes

A autoridade oficial já versionada em docs/fiscal/FISCAL_CSTAT588_AUTORIDADE_OFICIAL_023.md sustenta correção e retransmissão com o mesmo número/série após rejeição não gravada. A matriz 023 documenta 588 em NFeAutorizacao4 como REJECTED, terminal=true, numeroConsumido=false, requiresInutilizacao=false, requiresConsultation=false e zero auto retry. Isso não demonstra que o allocator, unique constraints, dedupe, guards e persistência atuais conseguem efetuar a terceira tentativa.

A auditoria mecânica do allocator, imutabilidade/lineage da nota antiga, estratégia de NotaFiscal/job, chamadas reais até SOAP e exclusão de caminhos pretty NÃO foi concluída. Não há micro-GOAL estrutural proposto sem essa auditoria. Nenhum número novo foi escolhido como contorno. Número 2/série 1 e a chave antiga permanecem referências históricas, não um candidato aprovado ou uma chave esperada recalculada.

Os quatro testes focados solicitados e a regressão canônica do 023 NÃO foram executados após o ponto de parada obrigatório do item 4. O comando canônico confirmado nos metadados ratificados do 023 é:

~~~text
npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery
~~~

xmllint não foi encontrado no PATH inicial por Get-Command. Não houve instalação, shim ou skip. A disponibilidade de xmllint real deve ser resolvida antes de executar o teste XSD na retomada. Os PASS históricos do 023 não foram promovidos a PASS do 024.

## Contenção desta execução e retomada

EXTERNAL_SEFAZ_CONTACT=false; SEFAZ_SOAP_POST_COUNT=0; REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0; PRODUCTION_CONTACT=false; FISCAL_ACTIVATION_WRITES=0; TRANSMISSION_WINDOWS_ARMED_BY_THIS_GOAL=0; DOCUMENTS_CREATED=0; JOBS_CREATED=0. O estado fiscalEnabled/Production/janela atualmente persistido no alvo canônico não foi observado. G-F7 e G-F12 continuam sem autorização neste GOAL.

Retomar exige acesso canônico READ-ONLY e desbloqueio humano pelo fluxo AEP. Em seguida, verificar banco, reconciliar a divergência do caixa, comprovar ausência de retry/estado incerto, auditar numeração e caminho SOAP, prover xmllint real e executar as provas offline. Somente após todos os critérios do item 11 estarem comprovados caberá apresentar uma proposta de autorização da terceira tentativa. Nenhuma autorização de transmissão é solicitada agora.

## Relatório solicitado

NOT_VERIFIED significa ausência de comprovação atual. Valores com sufixo HISTORICAL_022E vêm exclusivamente da evidência versionada; não foram lidos do banco nesta sessão.

~~~text
GOAL=FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024
BASE_MAIN=bfbdf01087433738134f5ee308475c2ef9841fbe
GOAL_023_PRESENT=true
GOAL_023_DEPLOYED=true
NODE24_PRESENT=true
DATABASE_STATE_VERIFIED=false
READONLY_CANONICAL_DB_ACCESS_AVAILABLE=false
STORE=loja-1 (HISTORICAL_022E; current=NOT_VERIFIED)
AMBIENTE=HOMOLOGACAO (HISTORICAL_022E; current=NOT_VERIFIED)
PROVIDER=SEFAZ_DIRETO (HISTORICAL_022E; current=NOT_VERIFIED)
MODELO=NFCE (HISTORICAL_022E; current=NOT_VERIFIED)
CSC_ID=NOT_VERIFIED
CSC_TOKEN_REF=NOT_VERIFIED
FISCAL_ENABLED=NOT_VERIFIED
PRODUCTION=NOT_VERIFIED
TRANSMISSION_WINDOW_ARMED=NOT_VERIFIED
OLD_NOTA_STATUS=TRANSMITINDO (HISTORICAL_022E; current=NOT_VERIFIED)
OLD_JOB_STATUS=AGUARDANDO_RETRY (HISTORICAL_022E; current=NOT_VERIFIED)
OLD_CSTAT=588 (HISTORICAL_022E; not stored on old NotaFiscal; current=NOT_VERIFIED)
OLD_CONSULTA_RESULT=217/NOT_FOUND (HISTORICAL_022E; current=NOT_VERIFIED)
OLD_NUMBER=2 (HISTORICAL_022E; current=NOT_VERIFIED)
OLD_SERIES=1 (HISTORICAL_022E; current=NOT_VERIFIED)
OLD_CHNFE=35260948241205000195650010000000021026842710 (HISTORICAL_022E; current=NOT_VERIFIED)
NO_PENDING_AUTOMATIC_RETRY=NOT_VERIFIED
NO_UNCERTAIN_STATE=NOT_VERIFIED
NUMBER_REUSE_OFFICIAL_SUPPORT_VERSIONED=true
NUMBER_REUSE_POLICY_VERIFIED=NOT_VERIFIED
CANDIDATE_NUMBER=NOT_DETERMINED
CANDIDATE_SERIES=NOT_DETERMINED
CANDIDATE_CHNFE_EXPECTED=NOT_DETERMINED
CANDIDATE_REUSES_REJECTED_NUMBER=NOT_VERIFIED
CANDIDATE_SOURCE_PATH=NOT_VERIFIED
CANDIDATE_JOB_STRATEGY=NOT_DETERMINED
FOCUSED_OFFLINE_TESTS=NOT_RUN
GOAL_023_REGRESSION=NOT_RUN
XMLLINT_ON_INITIAL_PATH=false
D01E_INTERTAG_WHITESPACE=NOT_VERIFIED
XMLDSIG_VALID=NOT_VERIFIED
XSD_VALID=NOT_VERIFIED
CSTAT588_POLICY=NOT_VERIFIED_IN_THIS_GOAL
AUTO_RETRY_588=NOT_VERIFIED_IN_THIS_GOAL
EXTERNAL_SEFAZ_CONTACT=false
SEFAZ_SOAP_POST_COUNT=0
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0
DB_CONNECTIONS=0
DB_WRITES=0
PRODUCTION_CONTACT=false
G_F7_AUTHORIZED=false
G_F12_AUTHORIZED=false
READY_FOR_THIRD_ATTEMPT_GATE=false
BLOCKERS=BLOCKED_BY_READONLY_DB_ACCESS; CAIXA_ID_DIVERGENCE_PENDING_DB_VERIFICATION; XMLLINT_NOT_ON_INITIAL_PATH
FINAL_DECISION=BLOCKED_BY_READONLY_DB_ACCESS
STOP=BLOCKED_BY_READONLY_DB_ACCESS
TRANSMISSION_AUTHORIZATION_REQUESTED=false
~~~

Não se aplica AWAITING_THIRD_HOMOLOGATION_ATTEMPT_AUTHORIZATION: as condições de readiness não foram comprovadas. O estado deve ser ratificado como BLOCKED pelo AEP, sem close/DONE.
