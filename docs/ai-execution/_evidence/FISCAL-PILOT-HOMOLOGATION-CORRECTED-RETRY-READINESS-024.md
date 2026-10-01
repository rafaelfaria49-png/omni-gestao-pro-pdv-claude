# FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024 — evidência de bloqueio

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
