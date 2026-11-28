# G006 — Relatório de execução

STATUS: CODE_VALIDATED; R REAL APPROVED; CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL; G006_COMPLETE=false.

BASE_SHA=abec9e9dc4ca17f0c3dca342ef38fa9feaa43b6c; BRANCH=codex/omni-gestao-gastos-006. Identidade final do commit local, apos fechamento autorizado, em E/local-commit.json. Allowlist exata20 caminhos; AEP opt-in ausente; principal e WIPs preservados. E=C:/Users/rafae/.codex/visualizations/2026/10/23/01a16672-b095-7202-8895-5cf8f4aa76c5/G006-execution.

## Código e limites

WhatsAppCanal GESTAO global sem loja versus ATENDIMENTO com loja, phoneNumberId/E164 únicos e guard cruzado com legado. Cadastro inativo, identidade imutável, ativação/rotação CAS. credencialRef só no namespace WHATSAPP_CANAL_TOKEN_; sem fallback e sem ativação real. Inbox técnica privada sem perfil/store/AdminUser fabricados; dedup META+número+externalMessageId, inbox+job no mesmo COMMIT antes do ACK. Limite30KiB canônico/64KiB jsonb e CHECK permanente classificado sem repetir indefinidamente.

Fila PostgreSQL SKIP LOCKED, clock DB, leaseOwner/token novo/leaseUntil, tentativas/ciclo/prazo/backoff/jitter/DLQ. Datas novas timestamptz(3), verificadas em sessão Pacific/Honolulu. Fencing rejeita owner/token antigo e lease expirada. INICIADO commitado antes do port; ambiguidade/timeout/5xx/queda fica ENVIO_INCERTO. Trigger impede regressão por SQL direto; operador com nova referência de prova pode reconciliar mesma identidade. ACEITO não é ENTREGUE e ID externo persistido é imutável.

Origem imutável anterior à criação da operação; dispatcher e trigger conferem tempo e identidade de perfil/grupo/autor/store. Um job por GastoOutboxG004, somente após operação/resultado commitados. Sem segunda outbox, sem chamar aplicação financeira e sem alterar dinheiro em retry/falha/provider. Outbox HUB sem origem WhatsApp não ganha destino.

Worker Node24 independente de request/Next/browser; bootstrap/loop/concorrência limitada/heartbeat/shutdown cooperativo/--once/--health. Health varre privilégios de todas as relações públicas, allowlist por operação e SELECT, recusa memberships/super/BYPASS/owner e valida RLS. Retirados SELECTs desnecessários de perfil/membership. Helpers SECURITY DEFINER estreitos com search_path fixo e EXECUTE PUBLIC revogado fazem locks sem conceder DML financeiro/auth. Pulsos mortos expiram para PARADO, com histórico preservado e retenção a aprovar antes do piloto.

Binding verificado e transporte real continuam ausentes por padrão. Transporte/reconciliação injetados são SIMULADOS, rotulados; daemon CLI padrão STAGING. Contrato CONFIG/PAYLOAD/POISON só comprova não envio antes de qualquer byte. G007 deve fornecer binding/prova/provider reais em fluxo autorizado. Rotação com saídas pendentes/incertas é proibida no runbook, com consulta privada por canal e métrica; desativação emergencial pode estacionar CANAL_ALTERADO e exige futuro rebind auditado, nunca troca automática de destino.

## Provas locais

G006 focused-g006-r8:99 PASS, zero skip =62 PostgreSQL/integração reais +37 unitários. Inclui ACK/COMMIT falho, barreira concorrente com PIDs distintos, lease expirada/antiga, dois processos próprios mortos após claim e INICIADO, reinício do entrypoint, dinheiro G004 real sem duplicação, revogações, privacidade e erros HTTP/timeout. Novos testes cobrem UPDATE SQL direto, namespace de segredo, payload denso/CHECK, privilégios/membership excessivos, origem tardia, health recente/velho, heartbeat durante envio lento, loop concorrência2/AbortSignal e fuso diferente. Sinais Linux pelo supervisor são condição da prova cloud, não simulados como realizados no Windows.

Migration aditiva20261025120000_gastos_canais_fila_worker aplicada integralmente com cadeia G001–G006 (G005 sem DDL) em bancos novos gastos_g006_test, gastos_g006_empty_r5 e gastos_g006_history_finance_r5. Histórico sintético pré-G001 preserva IDs/365,01/parcial200/saldo800/JSON. Seis tabelas, dez FKs, CHECKs/UNIQUE/índices/RLS; logins não owner/NOBYPASS/NOSUPER/NOCREATEDB/NOCREATEROLE. UTC fixado nos três logins QA. Banco anterior preservado como gastos_g006_test_pre_r4fix, sem apagar dados. Identidade física em E/migration-r4-renewal.json e fixture: loopback55516, data_directory E/pgdata. Grants revisados E/qa-grants-r4.sql.

Regressões PostgreSQL preservadas:24 G001 +97 G002/M1/N10/N11 +6 PDV +109 OS/V3 +102 G003 +G004(29 operações/HTTP/migration +28 cartões/concorrência/rollback) +23 G005 =418 distintos. São conjuntos disjuntos, não uma rodada única57 G004. Com62 G006, total480 PostgreSQL. As418 provas anteriores são reutilizadas porque nenhum fonte/migration/schema existente G001–G005 foi alterado; auditoria integral de5818 arquivos protegidos e161 blocos antigos de schema confere isso. Novos62 exercitam o delta e G004 real sob a migration final G006.

Unitários/Financeiro/Agent/Contador/PDV/OS: unit-regression-r3,935 PASS em60 arquivos, zero skip, inclui37G006. WhatsApp separado: whatsapp-regression-r4,114 PASS +1xfail histórico F14, zero skip, sem homologação Meta. Total1049 unitários normais +1xfail declarado, sem contar37G006 duas vezes.

TYPECHECK=PASS, integral typecheck-r4, exit0, Node24.22.1. LINT_FOCADO=PASS, lint-focused-r3,13TS,0erros/0avisos. BUILD=PASS, build-r4 oficial, exit0, MIGRATION_SKIPPED. Fontes preservadas em todos os recibos. Gates integrais renovados após a R; não se usa exceção de whitespace SQL da rodada anterior para estes resultados.

LINT_GLOBAL=BASELINE_FAIL105erros/113avisos em G005 e G006, nunca PASS. LINT_DELTA=PASS218pares individuais,0novos/0removidos; resultados completos e algoritmos preservados, mesma config/lock/dependências físicas/Node24. Hashes atuais baseline=277dc20fac8aab6be971a47939fca34838325035b76357f666ea782dbcce9f3c; current=26fea79f955e1cb6fd8d5ce745a4d64fd07403295e300abf4c4df63d48856366; differential=c72de7b1b1fc25c043319ddceb05dd89cff3b09a104c02379d4ef4b9e338a689. A R4 aceitou expressamente estes hashes atuais de lint; aceites R2/R3 permanecem históricos.

## Revisão e correções

R2 real Anthropic Claude Code2.1.288, modelo efetivo claude-sonnet-5-5, sessão06d20d1c-37dc-4b25-9c7d-4bfe68bcf099: APPROVED para commit local do pacote anterior, com2P2 e10P3 não bloqueantes. O pedido humano exige corrigir defeitos nesta execução; por isso não se fez commit com pendências e as fontes foram corrigidas. Os12 itens e soluções estão em E/r3-corrections.json. A R3 real confirmou os12 itens R2 resolvidos e aprovou condicionalmente, exigindo novo gate WhatsApp e apontando7itens adicionais. Eles foram tratados; R4 real realizada e aprovada sobre o delta final de fonte, schema e SQL. REVISAO_R=APPROVED real Anthropic Sonnet5.5; CODE_VALIDATED=true. Parecer real e condições satisfeitos; commit local único liberado.

A tentativa ampla r1 de empacotamento foi rejeitada pelo auto-review antes de qualquer processo/transmissão. R2 foi autorizada após comprovar §14 humano e minimizar o pacote:20paths+dependências estritamente necessárias+provas sintéticas, sem .env/credenciais/dados reais. R3 mantém essa minimização e a mesma destinação explicitamente solicitada.

## Falhas intermediárias preservadas

Wrapper pg_ctl Windows inicial reteve pipe; só wrapper próprio identificado foi encerrado. Fixture inicial reutilizava número e loader Windows precisava fileURL; alias faltava no harness G003: corrigidos no escopo próprio. Typecheck-r1 perdeu processo sem recibo terminal, não PASS. WhatsApp estático e complemento G004 tiveram timeout5s intermediário; rodadas completas posteriores passaram no MESMO limite, sem alterar asserções/timeouts. Lint baseline inicial com caminho errado recusou antes de executar; base final veio de git archiveG005,5819blobs verificados. Auditoria pré-R2 removeu1newline EOF SQL; provas anteriores preservadas. Após correções R2, focused-r6 teve88PASS/2falhas (CHECK Prisma sem code estruturado e seletor não único do novo teste); ambos corrigidos, rodada inteira r7 teve90PASS. Nenhuma falha intermediária é contada como aprovação.

## Gate externo e parada

Fetch final origin/main745fb55cc65644e2be70bc963c72401ec4352015, sem incorporar avanços de módulo/accessScope/sessionVersion/WhatsApp. Base G005 exata preservada; futura integração precisa conciliar esses gates. A03/A16/A20 locais comprovados com PostgreSQL real e transporte simulado; A15 local comprovado, runtime cloud não. Nenhum aceite homologa número real/OTP/binding/webhook/conversa/STT/OCR/G007–G010.

CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL. Render Background Worker é host previsto documental, sem contratação/custo inventado. Vercel Functions/cron/Daemons avaliados por fontes oficiais sem pressupor daemon autorizado. Faltam host/projeto/região/orçamento/responsável e banco sintético remoto exclusivo gastos_g006_hml_<identificador>, TLS/papéis/segredos/migration/grants aprovados, build/commit identificado, logs/health e dois workers/queda/reinício observados no host sem computador/túnel/browser. URL deve casar com GASTOS_WORKER_APPROVED_DATABASE; esse parâmetro não concede autorização de deploy.

G006_COMPLETE=false até CODE_VALIDATED e CLOUD_RUNTIME_PROVEN reais. Sem push/merge/deploy/provisionamento/DDL/grants/backfill de produção, mensagens/SMS/OTP reais ou ativação pessoal. Depois do relatório e eventual commit local único aprovado, PARAR. Não iniciar G007.

O build-r2 interrompeu antes de compilar por npx ausente no PATH do harness Windows. O harness normalizou Path/PATH e usou shim local em E/runtime-bin que chama npx-cli com Node24 absoluto, sem alterar produto/dependências/global. Build-r3 oficial completo passou; E/build-r4.node-runtime.ndjson registra Node24.22.1 em npm/runner/npx/Prisma/Next e filhos. Nenhuma falha de build-r2 foi ocultada ou declarada PASS. Todos os clusters QA próprios estão parados e dados preservados.


## Delta após a R3 real

R3 real, sessão055909d6-bf7c-4253-a68b-f47e54fb5c1a, Claude Code2.1.288/modelo efetivo claude-sonnet-5-5: APPROVED CONDICIONAL, não usado para commit. A condição WhatsApp foi satisfeita na rodada r4, sem alterar teste/timeout:114PASS+1xfailF14, fontes atuais preservadas. O comando humano exige corrigir defeitos nesta execução; todos os7itens F01–F07 foram tratados, além dos12 anteriores já confirmados resolvidos pela R3. E/r4-corrections.json contém o parecer anterior e as soluções.

F-01: WhatsApp renovado r4 nas fontes atuais:114PASS+1xfailF14, fonte preservada e hashes dos15TS/schema/SQL vinculados.

F-02: Loader limita searchParams de homologação, nega duplicatas/sslaccept inseguro/host=/schema não público e outros overrides;5novos casos unitários passam.

F-03: Trigger de canal rotacionado é CANAL_ALTERADO, não INGRESSO_INVALIDO. Barreira real no BEFOREINSERT permite rotação entre SELECT e INSERT, prova erro e retry durável do mesmo envelope.

F-04: Defaults técnicos G006 explicitamente dbgenerated(clock_timestamp()), incluindo agenda/created/updated/pulsos e prazo DB. Teste de query real captura apenas nomes de colunas INSERT: nenhum timestamp desses é vinculado pelo cliente; datas ficam entre leituras de clock_timestamp. Não se afirma sem prova que o now anterior materializava no app.

F-05: Operador recebe UPDATE só de9colunas, não de lease. Guard só deixa reduzir ciclo/estender prazo em ESTACIONADO→PRONTO pelo operador; agenda/prazo/ciclo geram auditoria. Teste nega bypass e verifica evento de agenda e recuperação válida.

F-06: Health nega CREATE no banco/public e EXECUTE de funções diretamente chamáveis fora da allowlist. Exceção explícita herdada: G004 validador somente leitura STABLE/SECURITY INVOKER (consulta movimentacoes_financeiras com direitos do chamador; worker sem SELECT é recusado), sem ampliar grant financeiro. RETURNS trigger não são APIs chamáveis; preservar seus privilégios herdados evita alterar G004. Sondas CREATE/EXECUTE são negadas pelo health.

F-07: SHA a288 rotulado preflight,745fb55 é a última referência fetched. Metadados atualizados após gates; nova R4 obrigatória para o delta de fonte e novos hashes.

Todos os gates de fonte atuais foram renovados:99G006(62PG+37unit),935unit,WhatsApp114+1xfail,typecheck-r4,lint-focused-r3,build-r4/MIGRATION_SKIPPED e lint global/diferencial após build. O build anterior r3 também passou; r4 é nova execução após as correções finais. As418 regressões PG prévias mantêm a justificativa de reuso aceita expressamente pela R3. Todos os bancos e históricos anteriores são preservados; nova cadeia integral em baselines_r5. Somente os3metadados autorizados foram finalizados após R4, com demais17paths conferidos byte a byte. CODE_VALIDATED=true; CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL; G006_COMPLETE=false.


Correções textuais finais permitidas expressamente pela R4: tabela principal do RUNBOOK e referência do script agora apontam somente ao grant r4 de9colunas do operador, sem lease; contratos históricos foram rotulados substituídos. Corrigido o termo "puro": a função G004 é somente leitura/SECURITY INVOKER e sua leitura é negada ao worker sem SELECT. E/r4-corrections.json é o registro histórico apresentado à R; o texto corrigido está em E/r4-corrections-final.json. Código/SQL/schema/testes intocados após a R. A R4 registra uma INCERTEZA, não defeito confirmado, sobre origem DB versus createdAt legado G004 em eventual skew; investigar pelo INSERT real antes de uso real/G008, preservando a base G004 e registrando a possível negação fail-closed, sem perda de dinheiro.


## R independente e fechamento de código

R real R4: APPROVED, CLI 2.1.288 (Claude Code), modelo efetivo claude-sonnet-5-5, sessão b2bc0680-adb5-464b-90dc-ae81f36ca734, 48chamadas Read/Glob/Grep. Parecer integral e proveniência imutáveis em E/review-r4-submission; exceção dos hashes atuais de lint expressamente aceita. Fontes TS/SQL/schema/testes foram reconferidas byte a byte com o pacote; somente estes metadados de revisão/GOAL/relatório são finalizados após o parecer.

CODE_VALIDATED=true. CLOUD_RUNTIME_PROVEN=false; G006_COMPLETE=false. Eventual commit único local registra o código aprovado; SHA final e parent real estarão em E/local-commit.json, para evitar autorreferência de SHA neste documento. A R não autoriza produção, host, contratação, envio real, ativação pessoal ou G007. Sem pendência de código bloqueante aceita pela R; gate externo de homologação continua real. Após commit e conferência, PARAR.
