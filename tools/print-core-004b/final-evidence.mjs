import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root,labRoot,evidence,privateRoot,config,validateConfig,sha,json } from './lab.mjs';
export function finalize(){
 const c=validateConfig(config(),false);
 assert.ok(!fs.existsSync(path.join(c.cluster,'postmaster.pid')),'Owned cluster must be stopped');
 const a=JSON.parse(fs.readFileSync(path.join(evidence,'GATE_A.json')));
 const b=JSON.parse(fs.readFileSync(path.join(evidence,'gate-b-results.json')));
 const matrix=JSON.parse(fs.readFileSync(path.join(evidence,'case-results-80.json')));
 const checks=JSON.parse(fs.readFileSync(path.join(evidence,'checks.json')));
 const before=JSON.parse(fs.readFileSync(path.join(evidence,'preflight-before.json')));
 const after=JSON.parse(fs.readFileSync(path.join(evidence,'preflight-after.json')));
 const trees=JSON.parse(fs.readFileSync(path.join(evidence,'worktree-identity-comparison.json')));
 const sql=JSON.parse(fs.readFileSync(path.join(evidence,'sql-corrections.json')));
 const boundary=JSON.parse(fs.readFileSync(path.join(evidence,'real-transport-boundary.json')));
 const runtime=JSON.parse(fs.readFileSync(path.join(evidence,'runtime-sql-journal-'+b.run+'.json')));
 assert.equal(a.status,'PASS');assert.equal(b.status,'PASS');assert.equal(b.results.length,35);
 assert.equal(b.node,'v24.19.0');assert.equal(matrix.summary.FAIL,0);
 assert.equal(checks.typecheck.status,'PASS');assert.equal(checks.lint.status,'PASS');assert.equal(checks.isolatedCoreBuild.status,'PASS');
 assert.equal(checks.sqlReproducibility.status,'PASS');
 assert.ok(trees.existingPreserved && after.OriginalTrackedWip.every(x=>x.Unchanged));
 assert.equal(after.OriginalHead,before.OriginalHead);assert.equal(after.OriginalStatus,before.OriginalStatus);
 assert.equal(after.AuditStatus,'');assert.equal(after.ExistingReflogsUnchanged,true);assert.equal(after.StashesUnchanged,true);
 assert.equal(runtime.filter(x=>x.target&&!x.target.startsWith('print_')).length,0);
 assert.equal(boundary.attemptedCalls.length,0);
 const input=JSON.parse(fs.readFileSync(path.join(evidence,'input-integrity.json')));
 for(const [name,expected]of Object.entries(input.documents))assert.equal(sha(fs.readFileSync(path.join('C:/Projetos/omni-print-schema-004a-evidence-001',name))),expected);
 assert.equal(sha(fs.readFileSync(path.join(root,'prisma/migrations/20261030_print_core_synthetic_local/migration.sql'))),sql.final);
 const schemaHash=sha(fs.readFileSync(path.join(root,'prisma/schema.prisma')));
 assert.equal(schemaHash,sha(fs.readFileSync(path.join(labRoot,'scratch/proposed.prisma'))));
 const priorValidate=fs.readFileSync(path.join(evidence,'validate.log'),'utf8');
 const actualValidate=fs.readFileSync(path.join(evidence,'final-prisma-validate.log'),'utf8');
 assert.ok(priorValidate.includes('valid')&&actualValidate.includes('valid'));
 const review={
  reviewer:'/root/independent_contract_review',method:'read-only independent agent; no DB/script/service execution by reviewer',
  status:'COMPLETED_WITH_SCOPE_LIMIT',reviews:['Gate A SQL, diff, catalog and behavior evidence','isolated core source and four regressions','A4 boundary closure','Node24 result and matrix scope','checks distinction'],
  findings:[
   {id:'REV-A-01',severity:'P2',finding:'admin_users SELECT included password',resolution:'column grant plus SQLSTATE42501 denial executed',status:'CLOSED'},
   {id:'REV-B-01',severity:'P1',finding:'Venda.sessaoId column does not exist',resolution:'payload extraction; SALE positive and regression executed',status:'CLOSED'},
   {id:'REV-B-02',severity:'P2',finding:'inactive terminal permitted',resolution:'ACTIVE check before T0/T1/T3; inactivation regression',status:'CLOSED'},
   {id:'REV-B-03',severity:'P2',finding:'invalid payment/discount silently coerced',resolution:'strict finite numeric validation; two adversarial JSON fixtures',status:'CLOSED'},
   {id:'REV-B-04',severity:'P2',finding:'legacy lojaId fallback diverged',resolution:'same fallback as auth.ts; legacy and unbound fixtures',status:'CLOSED'},
   {id:'REV-B-05',severity:'P2',finding:'logical A4 could receive transport acceptance',resolution:'A4_LOGICAL_ONLY before T3; zero attempts/send calls regression',status:'CLOSED'},
  ],
  conclusion:'No new material blocker found in examined source. Does not approve production or all80cases.',
  limit:'Final complete journal and additional harness reread could not finish. Automatic approval reviewer failed initialization due disk space os error112, not a safety determination. Primary agent verified runtime journal; do not claim independent full journal review.',
 };
 json('INDEPENDENT_REVIEW.json',review);
 json('final-integrity.json',{goal:'OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC',base:after.OwnHead,branch:after.OwnBranch,
  remoteMainReadOnly:'35a3971c31f62e6e802b7dd8763be81475334780',remoteMainObservedOn:'2026-10-30',fetchOrIntegrationExecuted:false,
  schemaHash,originalSqlHash:sql.original,finalSqlHash:sql.final,originalInputsUnchanged:true,
  existingWorktreesPreserved:114,trackedOriginalWipsUnchanged:7,unrelatedReflogsUnchanged:true,stashesUnchanged:true,
  globalRefsDigestUnchanged:after.ExistingRefsUnchanged,refsObservation:'Digest differs after excluding own branch. A Codex internal checkpoint ref was written in interval; original per-ref list unavailable, so cause is not asserted as proven. No manual update of unrelated refs was issued. See ref-metadata-observation.json.',
  allowedChangesOnly:['prisma/schema.prisma','prisma/migrations/20261030_print_core_synthetic_local/migration.sql','lib/print-core-synthetic/','tools/print-core-004b/'],
  focusedChecks:checks,priorPrismaValidate:{status:'PASS_EXECUTED_IDENTICAL_SCHEMA',schemaHash,proof:['validate.log','final-prisma-validate.log','gate-a-cli-reuse.json']},
  lastExtraPrismaValidation:checks.materializedPrismaValidate,clusterStopped:true,realTransportCalls:0,commercialMutationsByPrintCore:0,productionWrites:0,
  runtimeStatementIdentities:runtime.length,runtimeCommercialDmlStatements:0,commit:null,push:false,merge:false,deploy:false});
 const deferred=matrix.rows.filter(r=>r.status==='DEFERRED').map(r=>r.id).join(',');
 const summary=[
 'GOAL=OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC',
 'BASE_SHA='+after.OwnHead,
 'SCHEMA_APPROVAL_SCOPE=LOCAL_DISPOSABLE_ONLY',
 'GATE_A_PRISMA_SQL=PASS',
 'SCHEMA_QUALIFICATION=PASS_R01',
 'SHARED_DELETE_GUARD=PASS_R02_EXPECTED_SQLSTATES',
 'RUNTIME_ROLE_LEAST_PRIVILEGE=PASS_LOCAL_FIXTURE',
 'DDL_PRISMA_CUSTOM_SQL_PARITY=PASS',
 'POSITIVE_T0_T4=PASS_SALE_AND_SYNTHETIC_TEST',
 'MULTITENANT_TESTS=PASS_LOCAL_FIXTURES',
 'REAL_POSTGRES_CONCURRENCY=PASS_INDEPENDENT_CLIENTS_AND_BARRIERS',
 'RECOVERY_NO_DUPLICATION=PASS_INJECTED_FAULTS',
 'CASE_RESULTS=53_PASS_0_FAIL_27_DEFERRED',
 'DEFERRED_CASES='+deferred,
 'TYPECHECK=PASS_FOCUSED',
 'LINT=PASS_FOCUSED',
 'BUILD=ISOLATED_CORE_PASS_FULL_APPLICATION_BLOCKED',
 'INDEPENDENT_REVIEW=COMPLETED_WITH_SCOPE_LIMIT',
 'GLOBAL_LOGOUT_CHANGED=NO',
 'REAL_TRANSPORT_CALLS=0',
 'COMMERCIAL_MUTATIONS_BY_PRINT_CORE=0',
 'PRODUCTION_WRITES=0',
 'COMMIT=NONE','PUSH=NO','MERGE=NO','DEPLOY=NO','PRODUCTION_READY=NO',
 'NEXT_GATE=REVIEW_OF_EXECUTED_LOCAL_EVIDENCE',
 ].join('\n')+'\n';
 fs.writeFileSync(path.join(evidence,'RESUMO_OBRIGATORIO.txt'),summary);
 const report=[
 '# Relatório final — OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC',
 '',
 'Concluído o laboratório autorizado: Gate A PASS e 35/35 provas executáveis do núcleo em PostgreSQL real local. A matriz original tem 53 PASS limitados ao núcleo sintético, 0 FAIL e 27 DEFERRED. Não são 80 testes aprovados. Nenhum transporte real, fluxo da aplicação, logout global ou ambiente produtivo foi habilitado.',
 '',
 '## Base, governança e escopo',
 '',
 'Base/HEAD: '+after.OwnHead+'. Branch: '+after.OwnBranch+'. Worktree: '+root+'. Main remota consultada por ls-remote em leitura em 30/10/2026: mesma SHA. Não houve fetch, atualização de checkout ou integração. A compatibilidade com uma main posterior continua sendo gate separado.',
 'ENTRYPOINT/AGENTS lidos; AEP opt-in ausente nas worktrees relevantes, sem open/close que escrevessem estado ou commit. Mudanças restritas ao delta Prisma (307 linhas), migration local não publicada, seis módulos isolados e harness/evidências. Nenhuma rota, tela, handler atual, writer comercial, auth/proxy, serviço de impressão ou worker agendado foi conectado.',
 '',
 'Os 114 worktrees preexistentes preservam caminho/HEAD/branch; os sete WIPs originais preservam SHA-256 e o status original é idêntico. Reflogs alheios e stashes têm digest idêntico. O digest global de refs diverge após excluir a branch própria; foi observado um checkpoint interno do Codex escrito no intervalo. Não foi salva uma lista original por ref para atribuir toda a diferença com certeza. Não foi emitida atualização manual de refs alheias, nem tentativa de correção/reversão. Conferir preflight-before/after.json, worktree-identity-comparison.json e ref-metadata-observation.json. Não afirmar identidade total das refs.',
 '',
 '## Bytes e correções',
 '',
 '- Schema documental original: '+input.documents['SCHEMA_PROPOSTO.md']+'.',
 '- Diff Prisma original, LF final: '+input.originalPrismaDiff+'.',
 '- SQL original, LF final: '+sql.original+'.',
 '- SQL final/migration local: '+sql.final+'.',
 '- Schema materializado: '+schemaHash+'.',
 '',
 'Os quatro documentos 004A/R2 foram relidos e seus hashes finais coincidem com o início. Originais não sobrescritos. R01 qualifica public e fixa search_path pg_catalog,public,pg_temp; seis funções permanecem SECURITY INVOKER. R02 separa print_requests antes de OLD.expires_at. R03 corrige parênteses de dois CASE após erro real42601 e rollback integral. R04 troca somente o alias b por candidate_binding após erro real42702 no fluxo positivo. Não foram removidas invariantes, ampliadas tabelas ou desabilitadas constraints/triggers. Diffs separados e sql-corrections.json preservam a cadeia. A função pura de correção reproduz exatamente o hash final.',
 'O cabeçalho documental original do SQL foi preservado nos bytes; ele descreve a origem 004A. A execução efetiva aqui foi autorizada somente no laboratório 004B.',
 '',
 '## Ambiente e Gate A',
 '',
 'PostgreSQL17.10, Prisma6.19.3, TypeScript5.7.3, ESLint9.39.4, TSX4.23.1. Preparação/Gate A inicial usaram Node26.12.1 disponível; a execução final e os checks usam Node24.19.0 já instalado, compatível com package.json24.x. Engines Prisma e fontes têm hashes nos manifestos. Nenhuma instalação/download/npx foi executada.',
 'Cluster exclusivo sob tools/print-core-004b/.lab/cluster, host127.0.0.1 e porta reservada. Databases/roles possuem nomes exclusivos de fixture. launch.ps1 limpa integralmente o ambiente filho, incluindo URLs PG/Prisma/auth/Neon/Vercel, e injeta só caminhos/credenciais sintéticas. Antes da primeira conexão foram registrados host, porta, db, user, PID, diretório e versão; identidade observada foi confrontada. Nenhum .env/dump comercial ou banco remoto foi usado.',
 'Owner/migrator e runtime são distintos. Runtime sem SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/DDL/TEMP/TRUNCATE/desabilitar triggers/escalar a owner; sem UPDATE comercial. A leitura de admin_users foi reduzida a id,role,active,mustChangePassword,accessScope,sessionVersion,lojaId; password é negada com42501. Grants são de fixture, não política produtiva aprovada.',
 'DDL Prisma integral aplicado apenas no database de paridade. Base real seguida da migration coordenada aplicada no outro database, sem duplicar CREATEs integrais. Catálogo comparado por identidades/definições:154 colunas,36 FKs,60 CHECKs,6 funções,45 triggers e5 índices customizados além dos derivados. UNIQUE constraint e índice único Prisma comparados semanticamente. Rollback por conflito42P07 preservou identidades dos objetos e base, sem DROP. R01 inclui search_path adversarial/homônimos e temp controlado por bootstrap; a DML positiva usa runtime. R02 exige P0001/mensagem precisa para exclusões do ledger e42501 onde falta DELETE; somente Request expirada removível pela política de fixture.',
 '',
 '## Núcleo e provas executadas',
 '',
 'Interfaces internas: prepare(T0), create(T1), ready(T2), start(T3), reconcile(T4), get, revogação de delegação sintética, reconhecimento explícito de risco, cancelamento/expiração segura e purga. Não há singleton Prisma da aplicação, endpoint público ou inicialização automática.',
 'Autorização recompõe dados A01/STORE sintéticos do banco e chama canAccessStore/canUseModule/getPermissionsFromSession reais. Inclui fallback lojaId canônico, sessão/versionamento/módulo/papel/loja. Anônimo, técnico sem vendas, loja cruzada, versão de sessão e delegação revogada falham. Não se trata de certificação de sessão NextAuth/logout real.',
 'SALE usa um SELECT MVCC coerente para campos da venda/itens/elegibilidade, projeção mínima e mapVendaDetalheToCupom existente. Fingerprint inclui campos impressos, elegibilidade e bits float8; não usa updatedAt como atalho. Testes detectam correção/cancelamento antes de T1/T3 e um commit concorrente antes do SELECT final. Não homologam todos os writers nem a janela posterior ao SELECT em relação a um dispositivo. Quantidade permanece Int da base; KG não está homologado. CPF, observações livres e dados de OS não entram no snapshot.',
 'Snapshots/payloads imutáveis têm AES-256-GCM, AAD de escopo e hash do claro. Chaves são efêmeras em memória e somente de fixture. Renderer novo é JSON UTF-8 determinístico, marca segunda via/teste/ordinal e drawer=false; não é renderer térmico/A4 real. Purga remove bytes sem remover hashes, slots, sendKey e supressão; replay não reconstrói conteúdo.',
 'Dois clientes runtime independentes usam barreiras reais e locks PostgreSQL. O teste de revogação concorrente observou wait_event_type=Lock no servidor antes de liberar T3. Casos: keys/usuários concorrentes, destino/vias divergentes, INITIAL versus histórico e A4 lógico, replay/resposta perdida, FK por loja/documento/job/via/tentativa, conjunto completo no commit, rollback T1/T3, lease/fencing, falhas antes e depois da chamada/T4, UNKNOWN sem retry, destino global entre lojas, duas vias parciais, prova duplicada/tardia e supressão após NO_EFFECT tardio.',
 'REPRINT exige ato explícito e concessão de risco assinada na fixture, descobre toda exposição sem depender de previousJobId e exclui a própria intenção ao revalidar o digest. Mudança externa exige novo reconhecimento; nenhum prazo de autorização é estendido. Histórico fecha INITIAL sem inventar job anterior. Aceite de software nunca afirma papel. A4 lógico pode disputar slot/criar recibo, mas start/execute retornam A4_LOGICAL_ONLY antes de T3.',
 'A fronteira de teste bloqueia fetch, WebSocket, net.Socket.connect, HTTP/HTTPS, dgram e child_process. O PostgreSQL usa somente a biblioteca nativa local validada. O run final não tentou essas superfícies e registrou0 chamadas de transporte real. O grafo do bundle do núcleo importa externamente apenas node:crypto. Não foi chamado RAW/spooler/USB/window.print/serviço externo.',
 'Baseline comercial após seed usa identidades ordenadas e hashes das linhas, não contagens. Seeds/correções pertencem ao owner de fixture e têm journal próprio. Checkpoint após correções explícitas coincide com o final. O journal runtime registra '+runtime.length+' identidades SHA-256 de comandos e0 DML comercial; a role nega UPDATE comercial. Não houve refazer venda/pagamento/estoque/fiscal por impressão.',
 '',
 '## Resultados, revisão e limites',
 '',
 'CASE_RESULTS_80.md e case-results-80.json preservam todos os80IDs, com53PASS/0FAIL/27DEFERRED e referências aos35testes executados; R01/R02 são adicionais. As rodadas falhas e suas correções continuam nos logs append e progress por run. A prova de commit incompleto checa a mensagem específica do connector e também P0001 ao forçar a mesma constraint diferida.',
 'Typecheck e lint focados: PASS. Lint inicial excedeu60s; a rodada limitada com prazo maior concluiu, mantendo regras do repositório e resolução focada. Bundle isolado Node24: PASS. Build completo: BLOCKED_NOT_RUN; scripts/vercel-build.mjs invoca npx/generate/build, a worktree não tem node_modules/generated/prisma, e PWA escreve public/* fora da allowlist. Não foi contornado alterando config/aplicação ou instalando dependências.',
 'Prisma validate/generate do Gate A e validação materializada anterior passaram com o schema de mesmo SHA-256. A última repetição extra de validate, depois de encerrar o cluster, excedeu o timeout; checks.json preserva essa falha. Ela não é apresentada como nova validação aprovada e não substitui a evidência executada anterior de bytes idênticos.',
 'Revisão independente real leu SQL/diff/catálogo/provas e núcleo; seis achados foram corrigidos e têm regressões. Fechamento confirmou Node24, A4 bloqueado, matriz restrita e distinção do build. A leitura integral final do journal e a última releitura adicional do harness ficaram incompletas: o revisor automático não iniciou por falta de espaço(os error112). A ação não foi executada, sem determinação de insegurança. O journal foi conferido pelo agente principal; não declarar revisão independente integral dele. INDEPENDENT_REVIEW.json delimita o alcance.',
 'Pendentes: sessão/rotas/Origin/CSRF/logout reais, pareamento e proveniência física do destino, lifecycle completo de configuração, A4/UI/fallback reais, renderers térmicos58/80, fornecedor/hardware/offline, parâmetros/retenção D03 e transporte D04. Rate limit por principal e TTLs desta execução são fixtures finitas, não defaults SaaS. Reinício de cliente/worker foi exercitado mantendo a chave efêmera no processo; após encerrar o processo os bytes não são recuperáveis sem gestão futura de chaves. Não há regeneração automática como compensação.',
 '',
 '## Encerramento',
 '',
 'Somente o cluster deste GOAL foi parado, com validação do diretório/PID e confirmação de postmaster.pid ausente; demais serviços intocados. Cluster, fixtures, WIPs, objetos, branches e evidências não foram apagados. Não houve commit/push/PR/merge/deploy/migration remota. Credenciais sintéticas privadas, cluster, gerados e scratch permanecem em áreas ignoradas e não são incluídos no manifesto público.',
 'Próximo gate único: REVIEW_OF_EXECUTED_LOCAL_EVIDENCE. Avaliar relatório/matriz/diffs/limites e a divergência auxiliar de refs; autorização futura deve definir integração com main, D03/D04, gestão de chaves e gates reais. Nenhuma implementação adicional foi autorizada por esta entrega.',
 '',
 '## Resumo obrigatório',
 '',
 '~~~text',summary.trimEnd(),'~~~','',
 ].join('\n');
 fs.writeFileSync(path.join(evidence,'RELATORIO_FINAL_004B.md'),report);
 const paths=['prisma/schema.prisma','prisma/migrations/20261030_print_core_synthetic_local/migration.sql'];
 for(const dir of ['lib/print-core-synthetic','tools/print-core-004b']){
  const walk=rel=>{for(const d of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){
   if(['.lab','scratch'].includes(d.name))continue;
   const n=rel+'/'+d.name;if(d.isSymbolicLink())throw new Error('Evidence must not follow symlink');
   if(d.isDirectory())walk(n);else if(!d.name.startsWith('FINAL_MANIFEST'))paths.push(n);
  }};walk(dir);
 }
 const secrets=[c.adminPassword,c.ownerPassword,c.runtimePassword].filter(Boolean);
 const manifest=[];
 for(const relative of [...new Set(paths)].sort()){
  const buf=fs.readFileSync(path.join(root,relative));
  for(const secret of secrets)assert.ok(!buf.includes(secret),'Synthetic credential leaked into public evidence: '+relative);
  manifest.push({path:relative,size:buf.length,sha256:sha(buf)});
 }
 json('FINAL_MANIFEST_SHA256.json',{goal:'OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC',createdUtc:new Date().toISOString(),run:b.run,
  testedCoreSourceHashes:manifest.filter(x=>x.path.startsWith('lib/print-core-synthetic/')),excluded:['.lab/','scratch/','this manifest'],syntheticCredentialsInPublicEvidence:0,files:manifest});
 console.log('FINAL PASS: report, mandatory summary,80case matrix,manifest; owned cluster stopped; originals verified');
}
