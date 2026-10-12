<!-- AEP:TRACK
{
  "completion_when_empty": "PAUSED"
}
-->

# Trilha pessoas — DP/RH

## Objetivo

Entregar o domínio Pessoas de forma incremental, com identidade do empregador separada da Store, dados trabalhistas versionados, autorização própria e isolamento entre empregadores. 001A e hardening P2 estão DONE; o frontend 001B original permanece BLOCKED. O sucessor atual recupera e conclui o frontend existente, sem reconstruir telas. Folha/holerites e GOAL 002 continuam fora do recorte.

## Escopo histórico 001A — paths_base

Os paths abaixo registram o recorte inicial. Não ampliam a allowlist do sucessor atual, enumerada exclusivamente no META do GOAL de recuperação da revisão 5.

- lib/pessoas/**
- app/actions/pessoas/**
- app/api/pessoas/documentos/**
- prisma/schema.prisma
- prisma/migrations/**
- scripts/pessoas/**
- docs/pessoas/**
- docs/execution-tracks/pessoas/**
- docs/execution-tracks/REGISTRY.md
- docs/ai-execution/GATES.md
- docs/ai-execution/protocol.json
- .env.example

## Fora de escopo

Motor/fechamento de folha, holerites próprios, pagamentos, integração com Financeiro/Contador, autenticação global, CI, produção e dados reais. Frontend/navegação ficam limitados ao recorte de recuperação da revisão 5.

## Comando de teste da trilha

```
node scripts/pessoas/run-frontend-tests.mjs
```

Runner atual a recuperar do snapshot funcional na execução futura: HEAD commitado, workspace temporário externo, PostgreSQL descartável, sem teste pulado. Reutiliza o runner oficial 001A e hardening P2; não é criado nem executado nesta missão de planejamento. Typecheck antecipado e preflight de disco/navegador/PostgreSQL são obrigatórios antes da bateria completa.

## Gates históricos 001A — não herdados pelo sucessor

Gates liberados para a recuperação: nenhum. As autorizações abaixo pertencem somente ao recorte inicial.

- G-DADOS-SCHEMA: adições de schema e migration, execução somente em homologação isolada.
- G-AEP-CORE: exclusivamente registro da nova trilha em protocol.json pela CLI oficial.
- G-CONFIG-DEPLOY: somente nomes de variáveis DP em .env.example, se necessários.
- G-AUTH e G-CI não liberados. Produção não liberada.

## Branch e worktree históricas — 001A

- branch: goal/pessoas-001a-fundacao-backend
- worktree: C:/Projetos/omni-gestao-pessoas-001a-backend
- base de partida: origin/main 77111da450c7d0d2610ec5b1533b6975b2fd0b5d (2026-09-29)

## Plano de origem

- plan_ref: OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15
- plan_rev: 5 (recuperação do frontend 001B; revisões anteriores preservadas abaixo)
- recorte: PESSOAS-000 incorporado ao pre-flight; PESSOAS-001A backend; 001B frontend posterior.

## Estado

O estado ratificado vive em `state.json` e `LEDGER.jsonl`. Gerar derivados somente pela CLI AEP.

Base desta revisão: dois DONE, 001B original BLOCKED, quatro eventos e nenhum READY. A revisão 5 acrescenta somente PESSOAS-DP-FRONTEND-001B-RECOVERY-001 como READY, sem evento novo no ledger. RUNNING no derivado significa sucessor elegível; a contagem BLOCKED e last_result do original permanecem visíveis.

## Histórico — hardening obrigatório antes do frontend 001B — revisão 2

- Predecessor DONE: PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A.
- Sucessor da revisão 2, agora DONE: PESSOAS-DP-HARDENING-P2-PRE-001B-001, exclusivamente P2034/retry bounded, jornada/PII em log e cache/offline Pessoas. Os 13 P3 permanecem fora do recorte.
- Branch de planejamento: plan/pessoas-hardening-p2-pre-001b-001; PR governance-only para main, sem open/close, implementação ou merge pelo agente.
- Branch futura: goal/pessoas-hardening-p2-pre-001b-001.
- Worktree futura: C:/Projetos/omni-gestao-pessoas-hardening-p2-pre-001b.
- Base inspecionada do planejamento: origin/main d63b557d04fe446f3627bfdca6827c2c6e059b8c (04/10/2026), contendo o merge 001A ed0454d91a5e3e447922068bc9d2dbc0eae88e36. Execução parte da origin/main corrente após merge humano do plano.
- Teste do sucessor: node scripts/pessoas/run-hardening-tests.mjs, reutilizando o runner oficial e exigindo build real/inspeção PWA, sem testes pulados.
- Classe C3, risco ALTO, familia_executor openai, revisao_independente true; plan_rev 2.
- G-CONFIG-DEPLOY: aprovado pelo usuário nesta conversa em 01/10/2026 exclusivamente para next.config.mjs e exclusivamente para excluir Pessoas de cache/offline com NetworkOnly same-origin. Esse path integra o recorte do sucessor; preservar caches dos demais módulos e cacheOnFrontEndNav global.
- Nenhum outro gate liberado para o sucessor. Os paths, gates, teste, branch e worktree do 001A acima são históricos e não ampliam a allowlist do novo GOAL.
- Hardening concluído/revisado é pré-requisito obrigatório do frontend 001B; este planejamento não autoriza UI, flag DP, migration de ambiente, produção, folha ou GOAL 002.

## Histórico — planejamento frontend cadastral 001B — revisão 3

Esta seção preserva o planejamento original do 001B, agora BLOCKED. Paths/gates/branch/worktree/testes de 001A e P2 acima são históricos. Os dois predecessores permanecem DONE, com seus eventos e arquivos fechados preservados.

- GOAL originalmente READY, agora BLOCKED: `PESSOAS-DP-FRONTEND-CADASTRO-001B`.
- Fonte histórica arquivada: `_closed/goals/PESSOAS-DP-FRONTEND-CADASTRO-001B.md` (AEP:META e critérios completos; não autoriza execução).
- plan_ref: OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15; plan_rev: **3**.
- Classe C3, risco ALTO, familia_executor openai, revisao_independente true.
- Branch de planejamento: `plan/pessoas-001b-frontend → main`, somente governança; commit/push/PR autorizados, merge humano.
- Branch futura: `goal/pessoas-001b-frontend`.
- Worktree futura: `C:/Projetos/omni-gestao-pessoas-001b-frontend`.
- Base inspecionada: origin/main `7cd2c65c0bc23a9f1922cbc280494e62257251ff`, 10/10/2026. Os HEADs ratificados 001A e P2 são ancestrais; P2 mergeado pelo PR #255 (`c1736651864bed3959d50af302fd1ed88c7b4d89`).
- Pré-execução: merge humano do plano, autorização da nova sessão e vinculação documental do relatório R do P2. **REVISÃO R REALIZADA EXTERNAMENTE — VINCULAÇÃO DOCUMENTAL PENDENTE**: ZCode/GLM (Z.ai), família Z.ai/GLM, em 09/10/2026, HEAD `53250ef52c4401bdc2e0de22aab12b1f13222117`, conforme referência fornecida pelo usuário em 10/10/2026 e preservada no GOAL 001B. REVIEW_CODE=APPROVE; P0=0/P1=0/P2=0/P3=2; runner independente 95 testes/0 skipped/0 todo; MERGE_READINESS=READY; FRONTEND_001B_READINESS=READY. Sem review formal no GitHub. A pendência é documental, não técnica, e não impede o merge do planejamento da PR #260; preservar autoria/data/SHA/resultado e vincular o relatório completo antes de executar. Gates da execução mantidos.
- Escopo: visão geral cadastral, lista/pesquisa/filtros, cadastro/edição/ficha, contrato/remuneração/jornada, histórico, documentos privados, setup empregador/estabelecimento e estados DP; persistência exclusivamente pelas actions/APIs 001A.
- Navegação: Financeiro HUB → Pessoas → Contador HUB, desktop/mobile/focus mode. Reader server-only compõe guards existentes; único transporte novo é GET `app/api/pessoas/disponibilidade/route.ts`, read-only/no-store. Disponibilidade não deriva de enterprise/Financeiro/GERENTE/FULL; preservar bootstrap autorizado.
- Paths do sucessor: rotas/componentes locais Pessoas; três arquivos de menu; endpoint e reader de disponibilidade; adapter puro de DTO; seis paths específicos de testes/runner; relatório/evidência do GOAL; artefatos AEP de fechamento. **A allowlist exata é somente a do META**, com justificativa de cada path no GOAL.
- Teste futuro: `node scripts/pessoas/run-frontend-tests.mjs`, a implementar no 001B; HEAD por git archive, instalação limpa, PostgreSQL descartável, suíte 001A/P2 + frontend, E2E autenticado sintético, build/PWA/typecheck/lint, zero skipped/todo e limpeza conferida. Não há runner/frontend novo neste PR de planejamento.
- Gates liberados: **nenhum**. Auth, schema, migrations, configuração PWA/deploy/CI e core AEP fora da allowlist. Preview exige configuração DP isolada autorizada, incluindo prova documental R2 real; nenhuma ativação produtiva.
- Fora do recorte: gestão nova de grants/unidades adicionais, P3s, folha, holerite próprio, férias, 13º, rescisão, GOAL 002, integrações Financeiro/Contador e outro backend de funcionários.
- Nesta missão: não executar open/close, não implementar UI nem fazer merge. Gerar derivados por `registry`, conferir `verify --all` e `git diff --check`.
- Ponto de parada: **PESSOAS 001B — PLANO AEP PRONTO PARA MERGE HUMANO**.

## Histórico — reconciliação dos dois BLOCKED executados — 12/10/2026

O bloco abaixo registra a PR #264, já mergeada em main no commit 857e24d. Referências a esta branch/PR e às pendências de revisão/merge são históricas; a recuperação atual é o planejamento separado da revisão 5 ao final.

- Autorização humana: G-AEP-CORE exclusivamente para reconciliação fiel dos dois eventos BLOCKED do Pessoas 001B, testes, PR separado e revisão independente, sem merge automático.
- Base desta branch de governança: origin/main `1fd90905e05656444576cf83c9df6c46919a917a`.
- Origem fixada após fetch: `refs/remotes/origin/goal/pessoas-001b-frontend` em `25b5fda2612b35b6daccd2103fb69060f5107f73`.
- Aplicação pela CLI oficial: `node scripts/track.mjs reconcile-blocked pessoas --goal=PESSOAS-DP-FRONTEND-CADASTRO-001B --source-ref=refs/remotes/origin/goal/pessoas-001b-frontend --source-commit=25b5fda2612b35b6daccd2103fb69060f5107f73`.
- Os dois eventos originais, de tentativa 1 e de tentativa 3 com `previous_attempts` 1/2/3, foram anexados literalmente. O ledger ratificado é idêntico ao blob Git remoto. Nenhuma tentativa nova, reclassificação ou edição manual de ledger/state/registry.
- Projeção atual desta branch: dois GOALs DONE, um GOAL BLOCKED, quatro eventos e nenhum GOAL READY. O 001B foi retirado do caminho quente; seu arquivo fechado foi preservado integralmente da origem.
- A reconciliação só chegará à main após merge humano deste PR de core AEP. Não reabrir o 001B nem iniciar tentativa 4.
- Evidências e validação: `docs/ai-execution/_evidence/PESSOAS-001B-BLOCKED-RECONCILIATION.md` e relatório gerado `_closed/reports/RECONCILE-BLOCKED-25b5fda2612b.json`.
- O sucessor `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`, classe C3, risco ALTO, plan_rev 5, depende de planejamento separado na origin/main corrente após integração deste corretivo. Não foi criado por este PR.
- Código de produto, backend 001A, hardening P2 e UI permanecem intactos. Testes de produto/frontend não foram executados nesta sessão de governança.
- Revisão técnica independente por IA registrada a partir do relatório fornecido pelo usuário: ZCode/GLM 5.3, família `zai/GLM-5.3`, SHA `066c6131fa356ee5ae5cf6e7ed8c7eb4a1253265`, APPROVE; P0=0/P1=0/P2=0/P3=1. O GLM passou os 16 testes novos; os 65 anteriores não foram reexecutados por ENOSPC. O 81/81 PASS registrado pelo Codex é execução distinta. P3-1 (NO-OP após rollback/retry) é não bloqueante, sem alteração de código. Evidência: `docs/ai-execution/_evidence/PR-264-GLM-5.3-REVIEW.md`.
- INDEPENDENT_AI_REVIEW=APPROVE; HUMAN_EXTERNAL_REVIEW=PENDING; HUMAN_MERGE_AUTHORIZATION=PENDING. O PR permanece draft. A exigência humana só pode ser substituída por decisão expressa do usuário específica para esta PR; não alterar governança global nem criar review formal em nome do GLM.
- Preview com R2 isolado, provisionamento de banco/bucket/chaves, ativação DP produtiva, produção, folha/holerites e GOAL 002 continuam NÃO AUTORIZADOS. Revisão humana externa e autorização de merge humano deste PR permanecem gates de entrega.

## Sucessor atual — recuperação frontend 001B — revisão 5

- Único GOAL READY: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.
- Fonte executável: goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-001.md; META, allowlist exata, transporte, runner, critérios e gates completos.
- plan_ref: OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15; plan_rev 5; classe C3; risco ALTO; familia_executor openai; revisao_independente true.
- Autorização humana desta missão: planejar a recuperação após esgotamento das tentativas do original, com commit/push/PR documental. O 001B original continua BLOCKED, sem reabrir, superseder, reiniciar suas tentativas ou editar seu arquivo fechado/eventos.
- Branch de planejamento: plan/pessoas-001b-recovery-001 → main. Próximo gate: HUMAN_MERGE_PLAN; merge exclusivamente humano.
- Branch futura: goal/pessoas-001b-recovery-001.
- Worktree futura: C:/Projetos/omni-gestao-pessoas-001b-recovery-001.
- Base confirmada por fetch em 12/10/2026: origin/main 857e24dfd81d2471d1a5cf448495e66d52a5073c, merge da PR #264. Execução futura parte da main corrente após merge humano do plano e autorização em nova sessão.
- Verificação inicial: status pessoas confirmou dois DONE, um BLOCKED, quatro eventos, nenhum READY, nenhuma tentativa 4 e .aep-active ausente; verify --all sem divergências.
- Origem: origin/goal/pessoas-001b-frontend em 25b5fda2612b35b6daccd2103fb69060f5107f73. Snapshot funcional fde0794c4f11712034e60d785904cec14ce99216; base histórica 9f1b511a21ab98a924513428d465725e6839fdc2.
- Transporte futuro seletivo dos 31 paths de produto/testes enumerados no manifesto do GOAL: 26 adições e cinco modificações. A allowlist tem 28 paths de produto individuais e o prefixo mínimo funcionarios/**, necessário pela gramática AEP que rejeita [id], limitado às três páginas existentes. Não trazer commits AEP BLOCKED, GOAL/evidências antigas, ledger/state/REGISTRY/GATES remotos nem a árvore/branch inteira. Conciliar a main corrente e registrar a nova base.
- Correção inicial: remover somente exact: true das três consultas getByRole em scripts/pessoas/frontend.contract.test.ts, linhas 108/110/113 do snapshot; preservar role link/nome Pessoas e prefetch=false nos três modos. npm run typecheck antes do runner completo e antecipado também no modo frontend do runner.
- Preservar fix salarial de listarHistorico em lib/pessoas/cadastro.ts: motivo pessoal/contratual e valores redigidos sem viewRemuneracao, com leitura autorizada e histórico armazenado intactos. Exceção estreita e regressão em historico-privacidade.test.ts; sem backend novo.
- Concluir as telas existentes: visão geral/cadastro real, lista/filtros, ficha/edição, contrato versionado/histórico, documentos privados, setup de empregador, menu desktop/mobile/focus e estados loading/vazio/erro.
- Persistência pelas Server Actions/APIs 001A e guards atuais; nenhuma folha/motor trabalhista, holerite próprio, integração Financeiro/Contador ou GOAL 002.
- Runner obrigatório: node scripts/pessoas/run-frontend-tests.mjs. Recuperar implementação existente e redirecionar resumo/imagens para evidências exclusivas do sucessor; relatório novo VALIDACAO_FRONTEND_001B_RECOVERY_001.md.
- Preflight antes dos testes completos: medir espaço/reserva por volume (mínimo 12 GiB conforme GOAL), conferir Chromium Playwright por launch/close e PostgreSQL descartável/binários/porta/guard. Infraestrutura ausente/insuficiente falha; não equivale a PASS.
- Provas locais: regressão 001A/P2, frontend/isolamento, privacidade salarial, PostgreSQL descartável, typecheck/lint/build/PWA, E2E autenticado ON/OFF, reload/histórico persistido, navegação desktop/mobile/focus e quatro temas oficiais em 1440x900/390x844/360x800, teclado/foco/responsividade/overflow. Zero skipped/todo/only/flaky, evidência do HEAD novo e cleanup verificado.
- Revisão R da implementação: GLM 5.3, família zai/GLM-5.3, SHA/autor/data/findings/evidências documentados; independente do executor openai. Aprovação de P2/PR #264 não substitui essa revisão.
- Gates liberados: nenhum. Preview/R2 isolado requer autorização separada ainda PENDENTE e prova de upload/complete/download com bytes reais. PASS local não autoriza close/aceite final sem esse gate e R, salvo replanejamento humano explícito.
- Produção, PESSOAS_DP_ENABLED produtivo, deploy/configuração produtiva e dados reais NÃO AUTORIZADOS.
- Somente novo GOAL/TRACK e derivados CLI nesta missão; não executar open/close, implementar produto, criar worktree de execução, testar frontend, fazer merge ou iniciar GOAL 002.
- Gerar derivados por registry; verify --all e git diff --check obrigatórios. Estado esperado após planejamento: dois DONE, um BLOCKED, quatro eventos, somente o sucessor READY.
- Ponto de parada: **PESSOAS RECOVERY 001B — PLANO PRONTO PARA MERGE HUMANO.**
