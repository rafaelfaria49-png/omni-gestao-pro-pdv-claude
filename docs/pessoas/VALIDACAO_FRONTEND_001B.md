# Pessoas 001B — implementação e validação local

GOAL: PESSOAS-DP-FRONTEND-CADASTRO-001B
Branch: goal/pessoas-001b-frontend
Base: 9f1b511a21ab98a924513428d465725e6839fdc2 (origin/main confirmado, contém 55effa0).
Snapshot funcional testado: fde0794c4f11712034e60d785904cec14ce99216.

## Escopo implementado

Visão geral com contagens cadastrais reais; lista com pesquisa por nome/matrícula e filtros locais; cadastro rascunho; ficha com edição pessoal, preenchimento das lacunas de vínculo, contrato versionado e histórico; bootstrap/manutenção de empregador e estabelecimentos. Mutações usam as Server Actions 001A existentes.

Disponibilidade server-only compõe os guards existentes. GET read-only no-store alimenta Sidebar desktop, focus mode e MobileNavSheet, ocultos por padrão. Categorias documentais são derivadas da política existente no servidor. Links Pessoas não fazem prefetch. A rota direta também verifica disponibilidade no servidor; cada action/API revalida seu próprio escopo.

Estado sensível permanece transitório. Trocas de usuário/loja/empregador ou capacidade desmontam o contexto; respostas antigas são descartadas. Retorno de foco oculta a tela enquanto revalida, preservando o formulário somente quando o contexto autorizado é o mesmo.

Comando e payload são mantidos para repetição após resposta desconhecida. Conflitos provocam releitura e nova decisão explícita. Datas civis usam strings; conversões de salário/jornada são textuais. Remuneração oculta não vira zero.

Documentos seguem hash SHA-256 → intent → PUT com todos os headers assinados → complete → lista → download autorizado. Progresso é por etapa; complete perdido pode ser repetido com o mesmo intent, sem repetir PUT. Nenhuma signed URL, CPF, salário, intent ou documento é persistido em storage do navegador pelo frontend Pessoas.

## Correção de privacidade autorizada

O usuário autorizou replanejamento e correção do DTO em 11/10/2026. Sem viewRemuneracao, o histórico devolve motivo nulo nas versões contratuais e pessoais: o cadastro inicial grava o mesmo motivo livre nas duas versões, portanto redigir somente o contrato seria insuficiente. Banco/histórico armazenado e leitura com capacidade permanecem preservados. A regressão cobre ambas as leituras e revogação.

A prova historico-motivo-proof.mjs/.json é uma evidência histórica do código anterior à correção, identificada por hash da fonte. Não deve ser interpretada como teste do código corrigido; este é verificado por lib/pessoas/historico-privacidade.test.ts.

## Revisão predecessora

Cópia integral em docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-CADASTRO-001B/REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md.

Relatório externo fornecido pelo usuário; não é review assinado nem aprovação formal no GitHub. Data declarada 09/10/2026; ZCode/GLM, família Z.ai; GOAL PESSOAS-DP-HARDENING-P2-PRE-001B-001; HEAD 53250ef52c4401bdc2e0de22aab12b1f13222117; APPROVE, P0/P1/P2=0, P3=2, 95 testes, zero skipped/todo, FRONTEND_001B_READINESS=READY. SHA-256 da cópia e original: 746e1a59691026d5865268bf05fbbd19d08770a7089be34e2872531c8fa8096f.

A revisão independente da implementação 001B permanece pendente.

## Histórico das validações

- Tentativa 1, HEAD 40cb35e: 103/107 testes; fixture de inscrição acima do limite causou três falhas em cascata e a prova unitária excedeu 5 s. Zero skipped/todo; cleanup PASS.
- Tentativa 2, HEAD 33460f3: 107/108 testes; fixture jsdom de arquivo não disparou submit nativo. Build, typecheck e inspeção PWA PASS; lint identificou JSX dentro de try/catch no layout. Cleanup PASS. Os dois problemas foram corrigidos.
- Tentativa 3, HEAD fde0794: 111/111 testes Vitest PASS, zero skipped/todo. Build (MIGRATION_SKIPPED), PWA e lint focado PASS. Typecheck FAIL (TS2769): exact não pertence a ByRoleOptions nas três consultas de Sidebar. E2E ON/OFF, segundo build e lint global não executados. Cleanup PASS. Runner exit 1.

O runner oficial é node scripts/pessoas/run-frontend-tests.mjs. Usa git archive do HEAD, npm ci do lock, Prisma e PostgreSQL descartáveis fora da worktree, usuários/Stores/empregadores sintéticos, sem herdar .env ou credenciais. Banco de produção/Neon não foi acessado. A baseline/invariantes são aplicadas somente no cluster local descartável.

## Evidências e limites

O teste de Sidebar cobre os consumidores nos três modos, isolando o mecanismo de rail que não foi alterado. A prova documental de componente usa transporte controlado; a integração backend utiliza PostgreSQL real e o storage simulado existente. Nenhuma dessas provas substitui R2 privado real.

A inspeção PWA executa os workers gerados: NetworkOnly em Pessoas, ausência de aquecimento/cache para suas mensagens e preservação de outras rotas. Não houve alteração em PWA, auth, schema, proxy, AppShell, tokens globais ou outros HUBs.

O relatório externo original contém espaços de quebra Markdown: preservados por exigência de cópia integral. O diff check do código novo passa; a conferência que inclui a cópia original sinaliza esses espaços conhecidos.

CURRENT_STATUS, CHANGELOG e masterplan não foram alterados: estão fora da allowlist. Registro desta entrega fica neste documento e na evidência específica do GOAL.

## Gates pendentes

Smoke ponta a ponta com R2 privado real depende de autorização posterior e configuração isolada identificada (banco sintético, bucket privado exclusivo, credenciais mínimas e chaves efêmeras). Nenhum recurso externo, preview, deploy ou ativação produtiva foi criado. Revisão R da implementação e aceite humano continuam obrigatórios. Não executar close/DONE antes dos gates; não iniciar GOAL 002.

## Resultado final local

AEP registrou a terceira falha e BLOCKED via CLI, commit 3259905ee4fdf821c54e035f9ffa7ce696fdbc67. É necessário replanejamento humano para novo ciclo; não houve correção posterior ao snapshot funcional. Retirar a opção exact das três consultas getByRole do Testing Library (name textual já compara exatamente), seguido de nova validação completa. Nenhuma captura visual foi produzida; revisão visual, teclado e quatro temas ainda não comprovados em navegador. O checklist frontend foi relido, mas não substitui essa prova.

```text
GOAL=PESSOAS-DP-FRONTEND-CADASTRO-001B
BASE_SHA=9f1b511a21ab98a924513428d465725e6839fdc2
FUNCTIONAL_COMMIT=fde0794c4f11712034e60d785904cec14ce99216
BRANCH_HEAD=commit documental que contém este relatório; SHA exato na resposta de entrega
REVIEW_R_P2_EVIDENCE=REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md; não cobre 001B
CADASTRO_REAL=implementado; integração PostgreSQL PASS; E2E pendente
CONTRATO_VERSIONADO=implementado; regressões PASS; E2E pendente
HISTORICO=implementado; regressão de privacidade PASS; E2E pendente
DOCUMENTOS=implementado; transporte controlado PASS; R2 real pendente
PERMISSOES=unitários e integração PASS; E2E pendente
MENU_DESKTOP_MOBILE_FOCUS=implementado; contratos de componente PASS; E2E pendente
FOUR_THEMES=NAO_VALIDADO_EM_NAVEGADOR
OFFICIAL_RUNNER=FAIL, exit 1, tentativa 3
TESTS_TOTAL=111 Vitest, todos PASS; E2E não executado
TESTS_SKIPPED=0; TODO=0
TYPECHECK=FAIL TS2769 em frontend.contract.test.ts
LINT=FOCADO_PASS; GLOBAL_NAO_EXECUTADO
BUILD=PASS MIGRATION_SKIPPED; segundo build não executado
PWA_REGRESSION=PASS; 30 requests NetworkOnly, 8 rotas preservadas, 96 mensagens Pessoas, 24 externas; offline 1 fetch e 0 cache
PREVIEW_SMOKE=PENDENTE_NAO_AUTORIZADO
AEP_CLOSE=NAO_EXECUTADO; BLOCKED pelo teto de tentativas
PENDENCIAS=tipagem dos testes, runner completo, E2E/visual, revisão R 001B, preview/R2 isolado, aceite humano
NEXT_HUMAN_GATE=replanejar novo ciclo de correção e validação conforme AEP; depois revisão R e autorização de smoke isolado
```
