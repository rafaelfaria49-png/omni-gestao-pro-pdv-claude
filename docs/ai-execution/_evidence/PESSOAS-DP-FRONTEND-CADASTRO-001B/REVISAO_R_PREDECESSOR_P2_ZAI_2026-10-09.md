# Revisão R cross-family — Pessoas hardening P2

**Natureza da evidência:** transcrição fiel, para vinculação documental, de relatório externo fornecido pelo usuário na conversa do projeto OmniGestão Pro. O texto foi encaminhado pelo usuário; não é um review submetido pelo revisor no GitHub, não é atestado assinado e não substitui logs/artifacts de execução quando estes forem exigidos.

**Data declarada da revisão:** 09/10/2026  
**Família declarada do revisor:** ZCode/GLM — Z.ai (não-OpenAI)  
**GOAL:** `PESSOAS-DP-HARDENING-P2-PRE-001B-001`  
**Branch:** `goal/pessoas-hardening-p2-pre-001b-001`  
**HEAD revisado:** `53250ef52c4401bdc2e0de22aab12b1f13222117`  
**HEAD funcional ratificado:** `5465ba9d2999848c3e937457d7458fa7f59900e4`  
**Origem:** mensagem de relatório encaminhada pelo usuário na conversa, após a revisão externa.

---

## Relatório encaminhado

REVISÃO R CROSS-FAMILY — PESSOAS HARDENING P2 — CONCLUÍDA  
Revisão executada por família não-OpenAI (ZCode/GLM — Z.ai). Nada foi editado, commitado, pushado ou aberto em PR; a branch e ambos os worktrees permanecem intactos.

### 1. Estado confirmado

Fetch executado; branch `origin/goal/pessoas-hardening-p2-pre-001b-001` existe com HEAD = `53250ef` ✓  
GOAL em `_closed/goals/PESSOAS-DP-HARDENING-P2-PRE-001B-001.md` (movido pelo close commit, que toca somente artefatos AEP) ✓  
Ledger: DONE, tentativa 3/3, base `4e87fb1`, head `5465ba9`, test_command `run-hardening-tests.mjs`, tentativas 1–2 registradas com razões idênticas às evidências attempt-1/2.json ✓  
Relatório a3 aponta head_commit `5465ba9` ✓; `verify --all` passa na branch ✓  
Main corrente: `40f58d6` (avançou além da esperada `07385d1` — usada a mais nova, conforme instrução)

### 2–4. Delta produtivo, evidências e worker

**P2-A (P2034)** — loop de exatamente 3 tentativas da transação completa; replay consultado fora da transação abortada antes de qualquer retry (inclusive na 3ª); replay válido retorna o mesmo efeito, incompatível mantém IDEMPOTENCIA_CONFLITO; 3ª P2034 sem replay → VERSION_CONFLICT 409; P2002 preserva replay/DUPLICIDADE sem retry; PessoasError e erros não-P2034 propagam sem retry; mutação+auditoria atômicas. Testes provam ordem (replay externo → transação), rollback real pós-mutação e ausência de efeitos/auditoria duplicados.

**P2-B (Jornada)** — helper único `jornadaSemanal` (intervalo fechado 0.00–168.00, string canônica, opcional só no rascunho) chamado em camposInput e em criarVersaoContrato antes de executarComando/$transaction. 13 variações inválidas × 2 serviços: JORNADA_INVALIDA 400 com zero transações, zero escritas e sentinelas de salário/motivo/constraint/Prisma ausentes dos logs.

**P2-C (PWA)** — regra NetworkOnly same-origin GET cobre `/api/pessoas(/)` e `/dashboard/pessoas(/)`; 30 variações com query/_rsc/headers RSC+prefetch caem primeiro na regra Pessoas; extendDefaultRuntimeCaching preserva as 17 regras padrão com estratégia/options/ordem (comparadas contra os defaults do pacote); 8 rotas de regressão preservadas; `/api/pessoas-extra` e cross-origin fora da exclusão.

**Worker** — a inspeção do meu build executou o SW real em VM (rotas na ordem real) e o swe-worker real: 96 mensagens Pessoas com trace vazio (zero fetch/aquecimento/leitura/gravação de cache) e 24 mensagens não-Pessoas com comportamento deep-equal ao worker original (fetch + pages.put preservados). A transformação é append-only, específica de Pessoas, falha fechado (worker ausente/ambíguo ou contrato alterado), e roda em OPTIMIZE_TRANSFER − 20, antes do GenerateSW (workbox-webpack-plugin 7.1.0, confirmado na fonte em generate-sw.js:111), então o manifesto recalcula a revision sobre o worker transformado — MD5 conferida nos dois builds, com referência do cliente validada. Prova comportamental, não busca por strings.

**Reexecução independente** — `node scripts/pessoas/run-hardening-tests.mjs` no worktree do GOAL: exit 0, 95 testes, 0 skipped, 0 todo, PostgreSQL real descartável (initdb próprio em loopback:55439, invariantes 001A 10 CHECKs/7 índices/10 triggers/4 funções, drift nenhum), PWA real de build (2 builds com MIGRATION_SKIPPED), typecheck PASS, ESLint focado --max-warnings=0 PASS, CLEANUP PASS (confirmei: nenhum workspace residual, porta livre). verify --all PASS e git diff --check PASS (worktree e range `4e87fb1..HEAD`). typecheck/lint/build rodaram dentro do runner, no workspace isolado do HEAD — conteúdo byte-idêntico ao worktree; o worktree da branch permanece sem node_modules por design.

### 5. Main e integração

`4e87fb1..origin/main`: 22 commits, 26 arquivos — produto todo em ops-v4 (components/operacoes-v4-preview, lib/operacoes-v4, e2e/test), zero interseção com lib/pessoas, scripts/pessoas, next.config.mjs, prisma, app → `MAIN_PRODUCT_OVERLAP=NO`  
Simulação read-only (`git merge-tree --write-tree origin/main 53250ef`): tree `4d6d6a0`, exit 0, nenhum conflito. O único arquivo em comum, REGISTRY.md, mescla coerente (linha pessoas da branch + linha ops-v4 da main, sem duplicação); state/ledger da trilha Pessoas só existem na branch e os de ops-v4 só na main → `AEP_DERIVED_CONFLICT=NO`

### 6. Veredito

```text
REVIEW_FAMILY=zai (GLM) — não-OpenAI
REVIEW_CODE=APPROVE
P0_COUNT=0
P1_COUNT=0
P2_COUNT=0
P3_COUNT=2
P2_A_P2034_REVIEW=PASS
P2_B_JORNADA_REVIEW=PASS
P2_C_PWA_REVIEW=PASS
OFFICIAL_RUNNER=PASS
TESTS_TOTAL=95
TESTS_SKIPPED=0
TESTS_TODO=0
PWA_REAL_BUILD=PASS
PWA_WORKER_TRANSFORM_REVIEW=PASS
PWA_OTHER_ROUTES_REGRESSION=PASS
TYPECHECK=PASS
LINT=PASS
BUILD=PASS
VERIFY_ALL=PASS
AEP_CLOSE_INTEGRITY=PASS
ATTEMPT_HISTORY_INTEGRITY=PASS
MAIN_PRODUCT_OVERLAP=NO
UPSTREAM_INTEGRATION_SIMULATION=PASS
AEP_DERIVED_CONFLICT=NO
MERGE_READINESS=READY
FRONTEND_001B_READINESS=READY
```

### Observações P3 (informativas, não bloqueantes)

A evidência `runner.json` registra head `427962f`, não ancestral do ratificado `5465ba9` — consequência mecânica de commitar a evidência após a execução (commit amendado). O diff de produto entre os dois é vazio, o close re-executou o test_command no head funcional e minha reexecução no tip `53250ef` confirma exit 0.

A branch está 22 commits atrás da main (o ledger já marcava `rebase_needed` no close); a simulação de merge é limpa e sem overlap produtivo. Merge segue exigindo autorização humana em fluxo próprio, conforme o GOAL; o frontend 001B pode ter seu planejamento iniciado.

**PESSOAS HARDENING P2 — REVISÃO R CROSS-FAMILY APROVADA**

---

**Instrução de vinculação:** anexar o arquivo à sessão de execução do GOAL 001B e persisti-lo sem alterar conteúdo, com caminho permitido pelo AEP (por exemplo `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-CADASTRO-001B/REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md`). Registre explicitamente que é uma transcrição encaminhada pelo usuário e não uma submissão formal de review do revisor no GitHub. Preserve os GOALs predecessores fechados.
