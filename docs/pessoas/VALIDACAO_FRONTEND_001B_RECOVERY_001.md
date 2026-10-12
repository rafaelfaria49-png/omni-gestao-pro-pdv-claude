# Pessoas 001B — recuperação de código, validação pendente

Data: 12/10/2026. GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.

O frontend existente foi recuperado seletivamente e commitado. Esta entrega encerra somente a rodada de implementação direta autorizada; o GOAL continua aberto, sem DONE, sem close e sem aceite de liberação. Nenhum teste ou ambiente de validação foi iniciado.

## Proveniência e escopo

- Base de execução: `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d` (`origin/main`, merge da PR #266).
- Branch: `goal/pessoas-001b-recovery-001`.
- Worktree: `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`.
- Commit funcional: `9e890b35160497531f395d8e2a934576b23af4a2`.
- Origem: `origin/goal/pessoas-001b-frontend`, HEAD `25b5fda2612b35b6daccd2103fb69060f5107f73`.
- Snapshot: `fde0794c4f11712034e60d785904cec14ce99216`; base histórica: `9f1b511a21ab98a924513428d465725e6839fdc2`.
- Ancestralidade conferida por Git. Os 31 caminhos não tinham alterações posteriores na main; o patch foi aplicado exclusivamente sobre esses caminhos, preservando os demais arquivos da main.
- 31 arquivos de produto/testes recuperados: 26 adições e cinco modificações. 28 são idênticos ao snapshot; as diferenças adicionais estão somente nos três scripts descritos abaixo.
- Esta documentação adiciona somente este relatório e `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/recovery-status.json`, ambos na allowlist. O JSON registra os blobs Git de cada arquivo no snapshot e no commit funcional.
- Não houve merge/cherry-pick da branch antiga nem transporte de seus commits BLOCKED, derivados AEP, relatórios ou resultados. Nenhuma contagem/PASS anterior homologa o HEAD recuperado.

## Recuperado e corrigido

As telas, componentes e sua estrutura visual foram mantidos. As mutações continuam usando `app/actions/pessoas/index.ts`; documentos usam as APIs 001A. O reader/endpoint de disponibilidade é read-only, composto dos guards existentes e com resposta privada/no-store.

| Superfície | Presente no código recuperado | Validação runtime |
| --- | --- | --- |
| Visão geral e lista | Contagens dos vínculos reais, busca por nome/matrícula, filtros de status/cargo | PENDENTE |
| Cadastro e rascunho | criarFuncionario; dados incompletos persistem como RASCUNHO pelo backend | PENDENTE |
| Ficha e dados pessoais | obterFuncionario, atualizarDadosPessoais, completarVinculoRascunho e versões esperadas | PENDENTE |
| Contrato e histórico | criarVersaoContrato/listarHistorico, ALTERACAO/CORRECAO, vigência, supersessão e conflito | PENDENTE |
| Salário e jornada | Leitura/edição conforme capacidades 001A; conversão decimal textual e remuneração restrita | PENDENTE |
| Empregador e estabelecimento | Setup explícito, manutenção versionada e motivos | PENDENTE |
| Documentos privados | Upload-intent, PUT com headersObrigatorios, complete, listagem/download e retry | PENDENTE; bytes reais/R2 dependem de gate separado |
| Navegação | Financeiro → Pessoas → Contador em desktop, mobile e focus mode; prefetch=false | PENDENTE |
| Estados e contexto | Loading, vazio, erro/retry, OFF, negado, rascunho/conflito; descarte de respostas tardias | PENDENTE |

Em `scripts/pessoas/frontend.contract.test.ts`, foram removidas apenas as três opções `exact: true` das consultas getByRole nas linhas 108, 110 e 113 do snapshot. Permanecem role link, nome Pessoas e a asserção data-prefetch=false nos três modos. `scripts/pessoas/frontend.e2e.ts` permanece idêntico ao snapshot, incluindo seus usos válidos de exact no Playwright.

O fix de `lib/pessoas/cadastro.ts` permanece exatamente igual ao snapshot: listarHistorico redige motivos pessoais/contratuais e salário sem viewRemuneracao; a leitura autorizada preserva os valores. Nenhuma versão, motivo armazenado, vigência, supersessão ou auditoria foi reescrita. `lib/pessoas/historico-privacidade.test.ts` foi recuperado integralmente, incluindo escopo Store/empregador e revogação antes da consulta.

O código mantém os dados sensíveis em estado transitório para a operação, sem persistir CPF, salário, rascunhos, bytes, intents ou URLs assinadas em localStorage/sessionStorage. A inspeção estática não substitui as provas de revogação, contexto/cache e privacidade em runtime, que estão pendentes.

## Runner preparado para uma rodada posterior

O runner frontend continua delegando a runOfficialTests({ hardening: true, frontend: true }). O runner.json e as imagens futuras apontam para `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/`. Não foi criado runner.json nesta rodada.

No modo frontend, o código do runner agora exige Node 24, registra npm/SO/caminhos/versões PostgreSQL, usa cache npm temporário isolado e confere reserva mínima de 12 GiB por volume antes da instalação, após instalação e antes do build, ampliando-a quando o consumo medido da instalação excede a reserva. Prepara a verificação do Chromium do Playwright instalado com launch/página vazia/close e executa typecheck antes das suítes completas, build e E2E. Exige presença integral das suítes frontend e historico-privacidade no relatório. Os fluxos 001A/P2, guards, baseline/invariantes/drift e limpeza permanecem; as novas exigências são condicionadas ao modo frontend.

Essas mudanças do runner também aguardam validação. Nenhum preflight, PostgreSQL, browser, instalação, Prisma, runner, teste, lint, typecheck ou build foi executado nesta rodada.

## Validações e gates pendentes

| Item | Estado |
| --- | --- |
| Testes/Vitest/integração/runner oficial | NOT_RUN_BY_USER_REQUEST — PENDENTE |
| Typecheck | NOT_RUN_BY_USER_REQUEST — PENDENTE |
| Lint | NOT_RUN_BY_USER_REQUEST — PENDENTE |
| Build/PWA | NOT_RUN_BY_USER_REQUEST — PENDENTE |
| E2E ON/OFF e matriz visual/teclado/foco | NOT_RUN_BY_USER_REQUEST — PENDENTE |
| Revisão independente GLM 5.3 (zai/GLM-5.3) | PENDENTE; deve identificar SHA exato revisado |
| Preview isolado e smoke R2 com bytes reais | PENDENTE; exige autorização específica da infraestrutura |
| AEP close e liberação/merge | NOT_RUN; GOAL aberto |

O commit funcional e todo HEAD posterior desta recuperação continuam sem validação de produto. A futura rodada deve fixar seu próprio HEAD/base e produzir evidências novas do mesmo HEAD. O registro recovery-status.json é um inventário de recuperação com pendências, não um resultado de testes.

A única inspeção de validação realizada nesta rodada foi leitura de código/proveniência, caminhos e diff Git, incluindo git diff --cached --check sem erros de whitespace. Não se executaram check/close/attempt AEP para validações proibidas e não foram consumidas tentativas por checks.

Sem Docker/containers, PostgreSQL/banco de teste, npm ci, Vitest, Playwright/E2E, typecheck, lint, build, runner, smoke R2, preview externo, produção ou alteração de schema/auth/PWA. Nenhuma ativação produtiva de Pessoas foi feita. CURRENT_STATUS.md, CHANGELOG e memória global ficaram intactos por estarem fora da allowlist; o estado desta rodada está neste relatório. Não há backend alternativo nem motor de folha/holerite.

Próximo gate: **AUTORIZACAO_DA_VALIDACAO_ISOLADA**. Após a validação do HEAD, permanecem obrigatórias a revisão GLM 5.3 e a autorização/execução do preview/R2. Parada: **FRONTEND PESSOAS 001B RECUPERADO E COMMITADO, AGUARDANDO VALIDAÇÃO E GATES DE LIBERAÇÃO.**

## Manifesto recuperado

```text
app/api/pessoas/disponibilidade/route.ts
app/dashboard/pessoas/configuracoes/page.tsx
app/dashboard/pessoas/error.tsx
app/dashboard/pessoas/funcionarios/[id]/page.tsx
app/dashboard/pessoas/funcionarios/novo/page.tsx
app/dashboard/pessoas/funcionarios/page.tsx
app/dashboard/pessoas/layout.tsx
app/dashboard/pessoas/loading.tsx
app/dashboard/pessoas/page.tsx
components/dashboard/pessoas/campos.ts
components/dashboard/pessoas/configuracoes.tsx
components/dashboard/pessoas/contexto.tsx
components/dashboard/pessoas/documentos.tsx
components/dashboard/pessoas/ficha.tsx
components/dashboard/pessoas/lista.tsx
components/dashboard/pessoas/novo.tsx
components/dashboard/pessoas/ui.tsx
components/dashboard/pessoas/use-disponibilidade.ts
components/painel-inicial/MobileNavSheet.tsx
components/painel-inicial/Sidebar.tsx
lib/navigation/dashboard-nav-items.ts
lib/pessoas/adapters/cadastro-ui.ts
lib/pessoas/cadastro.ts
lib/pessoas/historico-privacidade.test.ts
lib/pessoas/readers/disponibilidade.ts
scripts/pessoas/frontend.contract.test.ts
scripts/pessoas/frontend.e2e.ts
scripts/pessoas/frontend.integration.test.ts
scripts/pessoas/playwright.frontend.config.ts
scripts/pessoas/run-frontend-tests.mjs
scripts/pessoas/run-official-tests.mjs
```
