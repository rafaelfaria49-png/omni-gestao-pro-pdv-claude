# Relatório final — OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC

Concluído o laboratório autorizado: Gate A PASS e 35/35 provas executáveis do núcleo em PostgreSQL real local. A matriz original tem 53 PASS limitados ao núcleo sintético, 0 FAIL e 27 DEFERRED. Não são 80 testes aprovados. Nenhum transporte real, fluxo da aplicação, logout global ou ambiente produtivo foi habilitado.

## Base, governança e escopo

Base/HEAD: 35a3971c31f62e6e802b7dd8763be81475334780. Branch: work/omni-print-persistencia-004b-synthetic. Worktree: C:\Projetos\omni-gestao-print-core-004b. Main remota consultada por ls-remote em leitura em 30/10/2026: mesma SHA. Não houve fetch, atualização de checkout ou integração. A compatibilidade com uma main posterior continua sendo gate separado.
ENTRYPOINT/AGENTS lidos; AEP opt-in ausente nas worktrees relevantes, sem open/close que escrevessem estado ou commit. Mudanças restritas ao delta Prisma (307 linhas), migration local não publicada, seis módulos isolados e harness/evidências. Nenhuma rota, tela, handler atual, writer comercial, auth/proxy, serviço de impressão ou worker agendado foi conectado.

Os 114 worktrees preexistentes preservam caminho/HEAD/branch; os sete WIPs originais preservam SHA-256 e o status original é idêntico. Reflogs alheios e stashes têm digest idêntico. O digest global de refs diverge após excluir a branch própria; foi observado um checkpoint interno do Codex escrito no intervalo. Não foi salva uma lista original por ref para atribuir toda a diferença com certeza. Não foi emitida atualização manual de refs alheias, nem tentativa de correção/reversão. Conferir preflight-before/after.json, worktree-identity-comparison.json e ref-metadata-observation.json. Não afirmar identidade total das refs.

## Bytes e correções

- Schema documental original: 5C57411E31C558E366FDEF00A2A45C0BD0C6605ADF292B4FA71EC980C92C9F2E.
- Diff Prisma original, LF final: 1A8F11063AF75740CD46C4A014487159385871935CF0B7E30741295A6C0E39B6.
- SQL original, LF final: 4F05F943112DF35AFE986CA8BC1B4CFCF15FC53B0AFA23328C5E9A786F2FD97F.
- SQL final/migration local: E55A0340E266681556CA238E2D59019DE10E9439FEECAEB8AFF3CCE92DE8D6DD.
- Schema materializado: AEA08DA0E8DB34AF5BFC73D90148A01BCF5BD3EEBED06E7A5835453AAC5E56ED.

Os quatro documentos 004A/R2 foram relidos e seus hashes finais coincidem com o início. Originais não sobrescritos. R01 qualifica public e fixa search_path pg_catalog,public,pg_temp; seis funções permanecem SECURITY INVOKER. R02 separa print_requests antes de OLD.expires_at. R03 corrige parênteses de dois CASE após erro real42601 e rollback integral. R04 troca somente o alias b por candidate_binding após erro real42702 no fluxo positivo. Não foram removidas invariantes, ampliadas tabelas ou desabilitadas constraints/triggers. Diffs separados e sql-corrections.json preservam a cadeia. A função pura de correção reproduz exatamente o hash final.
O cabeçalho documental original do SQL foi preservado nos bytes; ele descreve a origem 004A. A execução efetiva aqui foi autorizada somente no laboratório 004B.

## Ambiente e Gate A

PostgreSQL17.10, Prisma6.19.3, TypeScript5.7.3, ESLint9.39.4, TSX4.23.1. Preparação/Gate A inicial usaram Node26.12.1 disponível; a execução final e os checks usam Node24.19.0 já instalado, compatível com package.json24.x. Engines Prisma e fontes têm hashes nos manifestos. Nenhuma instalação/download/npx foi executada.
Cluster exclusivo sob tools/print-core-004b/.lab/cluster, host127.0.0.1 e porta reservada. Databases/roles possuem nomes exclusivos de fixture. launch.ps1 limpa integralmente o ambiente filho, incluindo URLs PG/Prisma/auth/Neon/Vercel, e injeta só caminhos/credenciais sintéticas. Antes da primeira conexão foram registrados host, porta, db, user, PID, diretório e versão; identidade observada foi confrontada. Nenhum .env/dump comercial ou banco remoto foi usado.
Owner/migrator e runtime são distintos. Runtime sem SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/DDL/TEMP/TRUNCATE/desabilitar triggers/escalar a owner; sem UPDATE comercial. A leitura de admin_users foi reduzida a id,role,active,mustChangePassword,accessScope,sessionVersion,lojaId; password é negada com42501. Grants são de fixture, não política produtiva aprovada.
DDL Prisma integral aplicado apenas no database de paridade. Base real seguida da migration coordenada aplicada no outro database, sem duplicar CREATEs integrais. Catálogo comparado por identidades/definições:154 colunas,36 FKs,60 CHECKs,6 funções,45 triggers e5 índices customizados além dos derivados. UNIQUE constraint e índice único Prisma comparados semanticamente. Rollback por conflito42P07 preservou identidades dos objetos e base, sem DROP. R01 inclui search_path adversarial/homônimos e temp controlado por bootstrap; a DML positiva usa runtime. R02 exige P0001/mensagem precisa para exclusões do ledger e42501 onde falta DELETE; somente Request expirada removível pela política de fixture.

## Núcleo e provas executadas

Interfaces internas: prepare(T0), create(T1), ready(T2), start(T3), reconcile(T4), get, revogação de delegação sintética, reconhecimento explícito de risco, cancelamento/expiração segura e purga. Não há singleton Prisma da aplicação, endpoint público ou inicialização automática.
Autorização recompõe dados A01/STORE sintéticos do banco e chama canAccessStore/canUseModule/getPermissionsFromSession reais. Inclui fallback lojaId canônico, sessão/versionamento/módulo/papel/loja. Anônimo, técnico sem vendas, loja cruzada, versão de sessão e delegação revogada falham. Não se trata de certificação de sessão NextAuth/logout real.
SALE usa um SELECT MVCC coerente para campos da venda/itens/elegibilidade, projeção mínima e mapVendaDetalheToCupom existente. Fingerprint inclui campos impressos, elegibilidade e bits float8; não usa updatedAt como atalho. Testes detectam correção/cancelamento antes de T1/T3 e um commit concorrente antes do SELECT final. Não homologam todos os writers nem a janela posterior ao SELECT em relação a um dispositivo. Quantidade permanece Int da base; KG não está homologado. CPF, observações livres e dados de OS não entram no snapshot.
Snapshots/payloads imutáveis têm AES-256-GCM, AAD de escopo e hash do claro. Chaves são efêmeras em memória e somente de fixture. Renderer novo é JSON UTF-8 determinístico, marca segunda via/teste/ordinal e drawer=false; não é renderer térmico/A4 real. Purga remove bytes sem remover hashes, slots, sendKey e supressão; replay não reconstrói conteúdo.
Dois clientes runtime independentes usam barreiras reais e locks PostgreSQL. O teste de revogação concorrente observou wait_event_type=Lock no servidor antes de liberar T3. Casos: keys/usuários concorrentes, destino/vias divergentes, INITIAL versus histórico e A4 lógico, replay/resposta perdida, FK por loja/documento/job/via/tentativa, conjunto completo no commit, rollback T1/T3, lease/fencing, falhas antes e depois da chamada/T4, UNKNOWN sem retry, destino global entre lojas, duas vias parciais, prova duplicada/tardia e supressão após NO_EFFECT tardio.
REPRINT exige ato explícito e concessão de risco assinada na fixture, descobre toda exposição sem depender de previousJobId e exclui a própria intenção ao revalidar o digest. Mudança externa exige novo reconhecimento; nenhum prazo de autorização é estendido. Histórico fecha INITIAL sem inventar job anterior. Aceite de software nunca afirma papel. A4 lógico pode disputar slot/criar recibo, mas start/execute retornam A4_LOGICAL_ONLY antes de T3.
A fronteira de teste bloqueia fetch, WebSocket, net.Socket.connect, HTTP/HTTPS, dgram e child_process. O PostgreSQL usa somente a biblioteca nativa local validada. O run final não tentou essas superfícies e registrou0 chamadas de transporte real. O grafo do bundle do núcleo importa externamente apenas node:crypto. Não foi chamado RAW/spooler/USB/window.print/serviço externo.
Baseline comercial após seed usa identidades ordenadas e hashes das linhas, não contagens. Seeds/correções pertencem ao owner de fixture e têm journal próprio. Checkpoint após correções explícitas coincide com o final. O journal runtime registra 795 identidades SHA-256 de comandos e0 DML comercial; a role nega UPDATE comercial. Não houve refazer venda/pagamento/estoque/fiscal por impressão.

## Resultados, revisão e limites

CASE_RESULTS_80.md e case-results-80.json preservam todos os80IDs, com53PASS/0FAIL/27DEFERRED e referências aos35testes executados; R01/R02 são adicionais. As rodadas falhas e suas correções continuam nos logs append e progress por run. A prova de commit incompleto checa a mensagem específica do connector e também P0001 ao forçar a mesma constraint diferida.
Typecheck e lint focados: PASS. Lint inicial excedeu60s; a rodada limitada com prazo maior concluiu, mantendo regras do repositório e resolução focada. Bundle isolado Node24: PASS. Build completo: BLOCKED_NOT_RUN; scripts/vercel-build.mjs invoca npx/generate/build, a worktree não tem node_modules/generated/prisma, e PWA escreve public/* fora da allowlist. Não foi contornado alterando config/aplicação ou instalando dependências.
Prisma validate/generate do Gate A e validação materializada anterior passaram com o schema de mesmo SHA-256. A última repetição extra de validate, depois de encerrar o cluster, excedeu o timeout; checks.json preserva essa falha. Ela não é apresentada como nova validação aprovada e não substitui a evidência executada anterior de bytes idênticos.
Revisão independente real leu SQL/diff/catálogo/provas e núcleo; seis achados foram corrigidos e têm regressões. Fechamento confirmou Node24, A4 bloqueado, matriz restrita e distinção do build. A leitura integral final do journal e a última releitura adicional do harness ficaram incompletas: o revisor automático não iniciou por falta de espaço(os error112). A ação não foi executada, sem determinação de insegurança. O journal foi conferido pelo agente principal; não declarar revisão independente integral dele. INDEPENDENT_REVIEW.json delimita o alcance.
Pendentes: sessão/rotas/Origin/CSRF/logout reais, pareamento e proveniência física do destino, lifecycle completo de configuração, A4/UI/fallback reais, renderers térmicos58/80, fornecedor/hardware/offline, parâmetros/retenção D03 e transporte D04. Rate limit por principal e TTLs desta execução são fixtures finitas, não defaults SaaS. Reinício de cliente/worker foi exercitado mantendo a chave efêmera no processo; após encerrar o processo os bytes não são recuperáveis sem gestão futura de chaves. Não há regeneração automática como compensação.

## Encerramento

Somente o cluster deste GOAL foi parado, com validação do diretório/PID e confirmação de postmaster.pid ausente; demais serviços intocados. Cluster, fixtures, WIPs, objetos, branches e evidências não foram apagados. Não houve commit/push/PR/merge/deploy/migration remota. Credenciais sintéticas privadas, cluster, gerados e scratch permanecem em áreas ignoradas e não são incluídos no manifesto público.
Próximo gate único: REVIEW_OF_EXECUTED_LOCAL_EVIDENCE. Avaliar relatório/matriz/diffs/limites e a divergência auxiliar de refs; autorização futura deve definir integração com main, D03/D04, gestão de chaves e gates reais. Nenhuma implementação adicional foi autorizada por esta entrega.

## Resumo obrigatório

~~~text
GOAL=OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC
BASE_SHA=35a3971c31f62e6e802b7dd8763be81475334780
SCHEMA_APPROVAL_SCOPE=LOCAL_DISPOSABLE_ONLY
GATE_A_PRISMA_SQL=PASS
SCHEMA_QUALIFICATION=PASS_R01
SHARED_DELETE_GUARD=PASS_R02_EXPECTED_SQLSTATES
RUNTIME_ROLE_LEAST_PRIVILEGE=PASS_LOCAL_FIXTURE
DDL_PRISMA_CUSTOM_SQL_PARITY=PASS
POSITIVE_T0_T4=PASS_SALE_AND_SYNTHETIC_TEST
MULTITENANT_TESTS=PASS_LOCAL_FIXTURES
REAL_POSTGRES_CONCURRENCY=PASS_INDEPENDENT_CLIENTS_AND_BARRIERS
RECOVERY_NO_DUPLICATION=PASS_INJECTED_FAULTS
CASE_RESULTS=53_PASS_0_FAIL_27_DEFERRED
DEFERRED_CASES=F01,F02,F03,F04,F05,F06,F07,I01,I02,I04,I06,I07,I08,I09,I10,I11,I12,I14,I18,I19,I20,I23,I26,I27,I31,P04,P05
TYPECHECK=PASS_FOCUSED
LINT=PASS_FOCUSED
BUILD=ISOLATED_CORE_PASS_FULL_APPLICATION_BLOCKED
INDEPENDENT_REVIEW=COMPLETED_WITH_SCOPE_LIMIT
GLOBAL_LOGOUT_CHANGED=NO
REAL_TRANSPORT_CALLS=0
COMMERCIAL_MUTATIONS_BY_PRINT_CORE=0
PRODUCTION_WRITES=0
COMMIT=NONE
PUSH=NO
MERGE=NO
DEPLOY=NO
PRODUCTION_READY=NO
NEXT_GATE=REVIEW_OF_EXECUTED_LOCAL_EVIDENCE
~~~
