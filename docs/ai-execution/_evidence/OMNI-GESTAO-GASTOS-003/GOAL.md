# OMNI-GESTAO-GASTOS-003 — Readers privados, relatórios e documentos

Comando humano de 21/10/2026 autoriza exclusivamente G003, classe C4, implementação e ensaio PostgreSQL descartável, R real Claude Code/Anthropic Sonnet 5.5 e um commit local condicionado a todos os gates. Executor Codex/OpenAI; não simular modelo/revisão. Sem push, merge, deploy, produção, credenciais reais, canal ou G004 automático.

Base exata: `bcde32ca83a216c512e5234d599a4bd8471869b0`; G001 `55bab9a7a93218433912761d6ce2f07b8b3fdfad` é ancestral comprovado. Branch `codex/omni-gestao-gastos-003`, worktree `C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-003`. G001/G002 limpas na preparação; WIPs da principal preservados. Fetch somente de refs confirmou origin/main `43574d44f997f533abdabd955da39d148d716450`. Comparar avanços a partir do ancestral comum, sem integrar nem confundir a ausência remota dos commits G001/G002 com conflito novo.

AEP opt-in ausente nesta worktree e na origem. Conforme ENTRYPOINT, não abrir trilha histórica, alterar state/registry/ledger nem executar close que produza segundo commit. Autorização C4 vem diretamente do humano; TASK_LEVELS/executors consultados. Planejamento existente em `C:/Users/rafae/.codex/visualizations/2026/10/19/01a1556c-83ac-77e2-a447-7e0f152c7c8e/OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001`. Decisão G001 e fechamento/R5 G002 prevalecem sobre propostas antigas.

## Allowlist exata — anterior à primeira edição de produto

Cada linha autoriza somente o motivo indicado. Caminhos candidatos desnecessários permanecerão intactos. Não há wildcard de produto. A auditoria inicial AST identificou 140 consultas diretas operacionais e 19 em scripts; leituras transacionais dos writers G002 serão classificadas separadamente, sem alterar seus efeitos.

| Caminho | Motivo |
|---|---|
| `prisma/schema.prisma` | Fundação aditiva DocumentoGasto/DocumentoVinculo e relações canônicas privadas. |
| `prisma/migrations/20261021120000_gastos_readers_documentos/migration.sql` | Somente tabelas/constraints/índices/RLS novos G003, sem editar G001/G002 ou aplicar em produção. |
| `lib/gastos/read-scope.ts` | Contrato autorizado de leitura e predicados empresariais que preservam legado NULL restrito à loja real; respostas privadas. |
| `lib/gastos/documentos.ts` | Identidade, metadados, proveniência, vínculos, retenção e consulta/download autorizados, sem storage produtivo. |
| `lib/gastos/documentos-fixture.ts` | Adapter privado isolado, de fixture, com path estrito e expiração; reutilizar a porta compatível do Contador. |
| `lib/gastos/read-cache.ts` | Fronteira de geração de leitura no navegador para descartar respostas de contexto anterior. |
| `lib/financeiro/services/contas-pagar-service.ts` | Somente listas/detalhes empresariais e seus predicados; preservar writers/locks/M1. |
| `lib/financeiro/services/contas-receber-service.ts` | Somente listas/detalhes empresariais e seus predicados; preservar writers/locks/N10/N11. |
| `lib/financeiro/services/movimentacoes-service.ts` | Somente listagem/resumo empresarial; preservar gravação/estorno/identidades G002. |
| `lib/financeiro/services/carteiras-service.ts` | Somente listagem/projeção de contas empresariais; preservar saldo materializado e transferências. |
| `lib/financeiro/services/conciliacao-service.ts` | Leituras/DTOs de conciliação só de conta empresarial da mesma loja. |
| `lib/financeiro/services/auditoria-financeira-service.ts` | Leitura e DTO de auditoria comum sem conteúdo/documentos pessoais; erros técnicos mínimos. |
| `lib/financeiro/services/relatorios-financeiros-service.ts` | Isolamento SQL de todas as consultas/agregações, sem reconciliação geral G005. |
| `lib/financeiro/services/fluxo-caixa-service.ts` | Fontes de fluxo restritas à empresa autorizada. |
| `lib/financeiro/services/dre-service.ts` | Fontes DRE restritas à empresa, sem mudar regras contábeis. |
| `lib/financeiro/services/fechamento-service.ts` | Fontes de saldo/snapshot de fechamento restritas à empresa. |
| `lib/contador/readers/index.ts` | Fontes financeiras SQL empresariais no scope interno/externo já autorizado pelo Contador. |
| `lib/contador/readers/financeiro.ts` | Somente procedência/contrato dos DTOs empresariais, se necessário; sem alterar política contábil. |
| `lib/contador/pacote/carregar-fontes.ts` | Mesmas fronteiras empresariais na carga paginada do pacote e CSVs. |
| `lib/contas-receber-prisma-queries.ts` | Eliminar wildcard de loja omitida e detalhe por ID sem loja no helper inventariado. |
| `app/api/financeiro/analytics/route.ts` | Corrigir agregações globais por loja; autorização vigente, filtros e no-store/erros seguros. |
| `app/api/financeiro/relatorios/exportar/route.ts` | Export CSV/XLSX autorizado, fontes empresariais e no-store. |
| `app/api/financeiro/pagar/route.ts` | Somente GET: identidade/membership/permissão, fontes e cache; preservar M1 e demais writers. |
| `app/api/financeiro/receber/route.ts` | Somente GET: identidade/membership/permissão, fontes e cache; preservar M1 e demais writers. |
| `app/api/financeiro/movimentacoes/route.ts` | Somente GET: autorização e cache/erros de leitura. |
| `app/api/financeiro/carteiras/route.ts` | Somente GET: autorização e cache/erros de leitura. |
| `app/api/financeiro/fluxo-caixa/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/dre/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/conciliacao/route.ts` | Somente GET: autorização e resposta privada. |
| `app/api/financeiro/fechamentos/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/auditoria/route.ts` | GET com permissão própria vigente e resposta privada. |
| `app/api/financeiro/auditoria/[entidade]/[entidadeId]/route.ts` | Detalhe autorizado, IDs indistinguíveis fora do scope e resposta privada. |
| `app/api/financeiro/relatorios/resumo/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/relatorios/rankings/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/relatorios/categorias/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/relatorios/fluxo/route.ts` | GET autorizado e resposta privada. |
| `app/api/financeiro/relatorios/indicadores/route.ts` | GET autorizado e resposta privada. |
| `app/api/ops/contas-receber-list/route.ts` | Reader direto inventariado consumido pelo PDV: fontes empresariais/autorização/cache. |
| `app/api/ops/caixa/sessao-detalhe/route.ts` | Somente GET e consultas financeiras empresariais inventariadas; sem writer de caixa. |
| `app/api/vendas/[id]/route.ts` | Somente GET e detalhes financeiros empresariais inventariados; sem writer de venda. |
| `app/api/dashboard/elite/route.ts` | Reader de KPI financeiro inventariado, filtro empresarial/no-store. |
| `lib/operacoes-v4/financial-projection-actions.ts` | Somente fonte de leitura financeira inventariada; sem fluxo/escrita de OS. |
| `app/actions/omni-agent.ts` | Leituras/resumos/lista de comandos e logs sem acesso pessoal nem erros brutos. |
| `lib/omni-agent/executor.ts` | Consulta financeira empresarial; sem novo executor pessoal ou novo motor. |
| `app/actions/omni-agent-memory.ts` | Somente caminhos de leitura afetados e metadados de log; não inserir pessoal em memória geral. |
| `app/actions/omni-agent-timeline.ts` | Leituras indiretas/comandos, scope vigente e sem dados pessoais. |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Consumidor de leitura inventariado: descartar estado/respostas após troca de usuário/loja; preservar UI e recibos M1. |
| `lib/gastos/read-scope.test.ts` | Contratos negativos/forjados e predicados de isolamento. |
| `lib/gastos/documentos.test.ts` | Storage fixture, paths, expiração e DTOs privados. |
| `lib/gastos/read-cache.test.ts` | Resposta atrasada/troca de contexto e falha de autorização não reapresentam dados. |
| `test/gastos/g003-fixtures.ts` | Massa sintética exclusiva, identidade do banco e sessão externa substituída. |
| `test/gastos/readers.postgres.test.ts` | APIs/Actions/serviços reais com PostgreSQL e guard real. |
| `test/gastos/documentos.postgres.test.ts` | Ownership, vínculos/FKs, isolamento, download e retenção em PostgreSQL real. |
| `test/gastos/migration-g003.postgres.test.ts` | Migration aditiva em baseline vazio e histórico sintético, owner e não owner sem BYPASSRLS. |
| `docs/decisions/OMNI-GESTAO-GASTOS-003-LEITURAS-DOCUMENTOS.md` | Contratos, limites legados, retenção e fronteiras futuras. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-003/GOAL.md` | Este escopo/gates e atualização de evidência. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-003/INVENTARIO_READERS.json` | Auditoria por leitor/função/consumidor/autorização/teste e exclusões justificadas. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-003/RELATORIO.md` | Estado honesto dos aceites e validações atuais. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-003/REVISAO_R.json` | Parecer/modelo/sessão/hashes reais, inclusive lint atual. |

Artefatos regeneráveis ignorados (node_modules por junction, generated/prisma, .next e tsbuildinfo) limitados à worktree. Harnesses/logs/cluster/pacote de revisão externos em `C:/Users/rafae/.codex/visualizations/2026/10/21/01a1601f-4e52-74a1-8887-2c958c8c5d2b/G003-execution`; sem dados reais, .env copiado ou alteração de dependências. Harness externo não amplia a allowlist de produto.

## Contratos e aceites

EMPRESA: loja real, sessão atual, papel ativo/membership e permissão efetivos; perfil empresarial resolvido no servidor. Predicado SQL exclui PESSOAL e lojas estrangeiras; legado perfilId NULL permanece somente da loja real, sem adoção em leitura. PESSOAL: contexto G001 opaco revalidado e dono exato, sem loja, acesso global de administrador ou canal público. Nenhuma rota pessoal operacional nova.

Documentos: FK e validação de mesmo perfil/dono/loja; identidade durável independente de URL; hash deduplicado somente no perfil; storage privado exclusivamente fixture sem configuração produtiva; download depois de autorização, path exato e expiração curta. Retenção e órfãos não apagam histórico.

A02/A03: comprovar fronteiras atuais de readers/documentos. A14: somente privacidade/procedência de totais, sem PASS integral de reconciliação G005. A18: documentos/DTOs/cache/logs de G003; mídia real/STT/OCR/canal permanecem G007/G009/G010. G004, estorno por operação e cálculos G005 não serão antecipados.

## Gates locais de fechamento

SQL revisado antes de aplicar em cluster criado vazio e identificado por host/porta/current_database/current_user/data_directory. Ensaios de baseline + G001 + G002 + G003 sem dados reais. Papel app owner separado do papel efetivo não owner; não certificar RLS produtiva por fixture owner.

Sequência: focados → PostgreSQL G003 → G001/G002 pertinentes → Financeiro/Contador/Omni/PDV/OS e APIs/Actions/cache → typecheck integral exit 0 → lint focado → lint diferencial contra G002 com mesmos comandos/config/deps → build integral exit 0/MIGRATION_SKIPPED → diff --check → R real → correções/reteste/R do delta → um commit local por caminhos explícitos. Tarefas pesadas sequenciais. LINT_GLOBAL=BASELINE_FAIL quando aplicável; exceção somente se zero novos diagnósticos e R atual a aceitar expressamente. Sem herdar R5.

STATUS: APPROVED_R2_LOCAL_COMMIT_AUTHORIZED. R2 real claude-sonnet-5-5, sessao ccf81443-42bb-4a6d-b9bb-a5e589d14eb1, aprovou o conjunto atual e aceitou expressamente os hashes de lint atuais. Sem achados bloqueantes. Criar somente um commit local dos 66 caminhos exatos, apos conferir que apenas metadados do parecer mudaram; sem push/merge/deploy/G004.

## Delta da revisão R1 — antes das edições correspondentes

Manter o gate de grant atual; não afrouxar ACL nem alterar writers G002. Nos caminhos já autorizados `test/gastos/g003-fixtures.ts`, `test/gastos/readers.postgres.test.ts` e `test/gastos/documentos.postgres.test.ts`, acrescentar: transição de loja legada por writer G002 real que cria perfil sem PerfilMembro; fixtures não vazias e asserts numéricos nos relatórios/exports; auditoria gravada/devolvida mínima; concorrência/dedup/rollback e corrida vínculo/quarentena em PostgreSQL. Registrar em decisão/relatório a pré-condição de grants antes de qualquer implantação, sem autoatribuição ou DDL/backfill produtivo. Isso não autoriza implantação nem inicia G004.

F4: rastrear os consumidores reais de GET venda e a matriz vigente; declarar a nova exigência operacional ou corrigir somente o GET já autorizado se houver regressão comprovada. F5-F8: documentar limites de quarentena, owner SQL, minimização de auditoria e múltiplas abas. O seed offline executado somente em QA foi distinguido de manutenção produtiva no inventário.

Falhas de rollback podem usar trigger de falha exclusivo da fixture sintética, com SQL revisado antes da execução e cleanup garantido; não desabilitar ou remover triggers/constraints/RLS canônicos. Semear anomalias históricas somente quando as constraints atuais as permitem; caso contrário provar a rejeição real do banco, sem forjar prova por bypass.

O diagnóstico real `r1-delta-diagnostic-r2` confirmou vazamento na auditoria antiga: o FK livre de entidade permite audit.storeId L1 apontar para título P1/P2/E2. A sanitização do snapshot não removia o ID de entidade nem o valor de empresa estrangeira. Corrigir somente os leitores já autorizados `lib/financeiro/services/auditoria-financeira-service.ts` e o ramo de auditoria de `app/api/financeiro/relatorios/exportar/route.ts`: filtrar no SQL a origem canônica e marcadores privados, compartilhar o contrato entre lista/detalhe/export e manter eventos sem origem comprovável apenas como metadados sem referência/snapshot. Não mudar writers financeiros, auth, migration ou persistência histórica; nenhum backfill. Acrescentar testes positivos/negativos sobre os dados já semeados e revisar o delta real com Anthropic.

## Refinamento comprovado no build — páginas SSR/RSC do mesmo Contador externo

O build oficial r1 passou (exit 0/MIGRATION_SKIPPED), mas a lista de rotas e a fonte `app/contador-externo/lojas/[loja]/competencias/[c]/page.tsx` confirmaram que o portal autorizado renderiza documentos, pacotes e andamento diretamente em Server Components, além da API já inventariada. Os caminhos reais `/contador-externo`, `/contador-externo/lojas/**` e a lista `/api/contador-externo/lojas` faltavam na matriz de cache. A ausência de store em payload ou `force-dynamic` do Next não controla CacheStorage/Workbox.

Antes da edição, registrar o refinamento da mesma correção de cache autorizada: somente `next.config.mjs` e `public/client-privacy-cache.js`, já na allowlist, mais a matriz de `lib/gastos/read-cache.test.ts`, também autorizada. Incluir NetworkOnly, recusa de aquecimento e limpeza histórica dessas representações HTML/RSC do MESMO consumidor financeiro. Não alterar páginas, auth, contratos de Contador ou outra configuração. Preservar o build r1 e sua prova de 17 URLs como históricos; demonstrar falha com as novas URLs, retestar e exigir novo build/validação do worker real antes de R.

## Necessidade material identificada — cache PWA, aguardando autorização específica

Em `next.config.mjs`, `extendDefaultRuntimeCaching=true` mantém a regra instalada de next-pwa: GET `/api/**` em NetworkFirst, cache `apis`, até 86400s e timeout de rede 10s. Workbox StrategyHandler aceita status 200 sem consultar Cache-Control por padrão. O worker auxiliar também aquece páginas. Assim, no-store HTTP e descarte React não bastam para excluir respostas de outro ator após troca/revogação/offline. O script de ativação `public/client-privacy-cache.js` limpa apenas Pessoas/Clientes, não Financeiro.

Dois caminhos materiais fora da allowlist inicial: `next.config.mjs` (regra NetworkOnly existente e bloqueio de aquecimento para readers/páginas financeiros inventariados) e `public/client-privacy-cache.js` (remover respostas financeiras históricas dos caches na ativação). Alteração concreta proposta, ainda NÃO aplicada, em `G003-execution/PROPOSTA_CACHE_PWA.patch`. Preserva cache e regras de Pessoas/Clientes e demais recursos. Testes diretamente correspondentes podem permanecer em `lib/gastos/read-cache.test.ts`, já autorizado.

A seção 4 do comando humano proíbe alterar configurações de produção e exige autorização específica para necessidade material nova. Portanto, estes dois arquivos permanecem bloqueados até resposta humana. Prosseguir com os demais testes/correções autorizados; não declarar A02/A18/cache completos ou criar commit final com essa lacuna conhecida.

Harness: a primeira importação PostgreSQL do Agent detectou que Vitest não replica aliases específicos de `tsconfig.json` (ex.: `@/types/os` é arquivo REAL de Operações Lovable). A configuração externa G003 adiciona esses mesmos aliases reais e cache em evidências, sem alterar config de produto, mockar domínio, excluir testes ou afrouxar typecheck. A rodada inicial FAIL de importação está preservada; não é prova PostgreSQL.

## Allowlist revisão 2 — autorização humana específica recebida antes da edição

Resposta humana: **"Autorizar somente essa correção de cache nos dois arquivos"**. Substitui a pendência acima exclusivamente para a proposta concreta de cache; não libera configurações adicionais, deploy ou outra funcionalidade.

| Caminho adicional | Motivo autorizado |
|---|---|
| `next.config.mjs` | Acrescentar leituras/páginas financeiras inventariadas à regra NetworkOnly e à recusa de aquecimento do worker já existentes, preservando o restante da configuração. |
| `public/client-privacy-cache.js` | Excluir respostas financeiras históricas de CacheStorage na ativação, preservando o saneamento anterior e recursos não relacionados. |

Testes da fronteira PWA em `lib/gastos/read-cache.test.ts`, já listado. Implementação limitada a `PROPOSTA_CACHE_PWA.patch`; nenhum outro gate novo liberado. 16 focados e 37 PostgreSQL de readers passaram nas rodadas registradas; documentos, migration, regressões, gates globais e R continuam pendentes.

## Allowlist revisão 3 — fixtures de regressão diretamente correspondentes

A rodada `regression-unit-r1` confirmou cinco fixtures anteriores sem os novos contratos de sessão/membership, ou ainda sem a composição G002 de perfil no fake Prisma. A autorização original cobre testes diretamente pertinentes. Antes da edição, ficam listados os caminhos exatos abaixo; não alterar assertions de negócio para ocultar regressões, nem substituir a prova de segurança PostgreSQL por mocks.

| Caminho adicional | Motivo |
|---|---|
| `app/actions/omni-agent-memory.test.ts` | Complementar sessão/usuário/membership no fake das Actions de leitura; manter asserts de busca/loja. |
| `app/actions/omni-agent-timeline.test.ts` | Complementar sessão/membership/grant no fake da timeline; manter asserts de fontes/paginação. |
| `app/api/ops/contas-receber-list/canonical-list.test.ts` | Atualizar fake legado com composição de perfil G002 e autorização atual, preservando status/saldo canônico. |
| `app/api/ops/caixa/sessao-detalhe/route.test.ts` | Complementar identidade/membership na fixture da leitura de caixa, sem alterar contratos de venda/sessão. |
| `lib/operacoes-v4/financial-projection-actions.test.ts` | Complementar membership atual e exigir predicado empresarial na consulta, mantendo projeções/UNKNOWN. |

Falhas e erros de spawn da primeira rodada são preservados. A repetição deve executar todos os arquivos selecionados; sem skip/expected-fail/waiver.

## Refinamento dentro das superfícies já autorizadas

Reconfirmação do consumidor externo: `lib/contador/portal/resumo.ts` usa `construirDadosContador` com sessão própria do Contador. A correção de cache autorizada nos mesmos dois arquivos passa a abranger também `/api/contador-externo/lojas/**` e `/contador`, consumidores dos readers inventariados. Mesmo objetivo NetworkOnly/recusa de aquecimento/limpeza histórica; sem outra configuração ou superfície de produto nova. Os testes continuam em `lib/gastos/read-cache.test.ts`.

Nos readers reais do Contador (dois caminhos já listados), revalidar o acesso vigente antes da carga: interno com sessão/ator/membership/permissão/grant atuais; externo com cookie assinado, identidade/sessão e ContadorAcesso ativo próprios. O objeto de scope é seletor, nunca prova de identidade. A revalidação externa reutiliza a validação existente com porta sem toque/renovação de sessão para não acrescentar escrita oculta ao reader; o guard HTTP conserva sua rotação normal. Portas injetadas de agregação continuam puras. Acrescentar prova de revogação/forja nos testes PostgreSQL já listados.

O volume C: chegou a zero bytes, impedindo os ensaios e até o registro de status no app. Somente o binário ignorado/regenerável `generated/prisma/query_engine-windows.dll.node` desta worktree foi removido (21.182.976 bytes), após confirmar caminho físico sem junction. Bancos, código, WIPs, dependências e evidências preservados. Será obrigatório regenerar Prisma antes de retomar PostgreSQL. Os poucos MB liberados permitem registrar estado/correções pequenas; build e validações integrais dependem de espaço adicional. Não commitar antes de todos os gates.

| Caminho adicional, antes da edição | Motivo diretamente correspondente |
|---|---|
| `lib/contador/readers/index.test.ts` | Atualizar a assertion exata da query antiga sem perfil para exigir também o predicado empresarial; manter intervalo UTC/selects e demais contratos. |

O harness externo pode reutilizar via `PRISMA_QUERY_ENGINE_LIBRARY` o engine JÁ instalado em node_modules: versão exata `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`, igual à do cliente G003 gerado, conferida em fonte. Registrar caminho real/hash nos receipts; sem copiar binário, alterar dependência ou substituir domínio/Prisma por mock. Isso permite ensaios que não precisem de nova alocação grande; não libera build sem espaço nem dispensa regeneração final.

## Reteste e resposta ao R1

122/122 focados (77 readers PG, 25 documentos PG, 20 unitarios), 820 regressoes selecionadas, typecheck-r7/lint-focused-r5/build-r3 aprovados. Lint global BASELINE_FAIL, delta sem diagnosticos novos; aceite R2 pendente. E/r1-triage.json registra F1-F8 e a correcao SQL da auditoria comprovada no PostgreSQL. Grant explicito e revisado e pre-condicao de qualquer implantacao; escritores G002 intactos. R1 imutavel, nenhum commit ate R final APPROVED.

## Parecer final R2 e autorizacao local

APPROVED real em 2026-10-22T05:17:43.606Z, 70 ferramentas, manifesto 41d8c4c4e4c32b0c95d6a2fbd5fd7ae063cec84ccf6a124acf58cf1009898611, eventos 9354f7c3e434d1f45ed27d32ac39db459de9a3a10e3b640c065a4c5634ef1430. LINT_GLOBAL=BASELINE_FAIL e LINT_DELTA=PASS com excecao atual expressamente aceita. N1-N3 nao bloqueantes preservados no parecer integral, sem pendencia obrigatoria de codigo. Permitida somente transcricao do parecer nos quatro registros de evidencias; todo produto/schema/teste permanece identico. O SHA nasce no unico commit e sera registrado em evidencia externa pos-commit. Implantacao exige concessao/revisao explicita de grants por operador autorizado e continua fora deste GOAL.
