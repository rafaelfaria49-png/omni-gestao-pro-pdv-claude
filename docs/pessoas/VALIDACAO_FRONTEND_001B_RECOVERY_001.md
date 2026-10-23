# Pessoas 001B — recuperação, evidências QA e fechamento técnico impedido

Recuperação inicial: 12/10/2026. Adendo corretivo R1–R5: 13/10/2026. GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.

O frontend existente foi recuperado seletivamente e commitado. O GOAL continua aberto, sem DONE, sem close e sem aceite de liberação. Na rodada inicial, nenhum teste ou ambiente de validação foi iniciado. Estado atual em 15/10/2026: homologação isolada autorizada; projeto Neon gratuito exclusivo criado e vazio, sem DDL; inicialização e acesso R2 bloqueados, conforme o último adendo.

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

As telas, componentes e sua estrutura visual foram mantidos. As mutações continuam delegando às actions de `app/actions/pessoas/index.ts`; o corretivo abaixo acrescenta wrappers de Store e reutiliza os serviços documentais canônicos das APIs 001A. O reader/endpoint de disponibilidade é read-only, composto dos guards existentes e com resposta privada/no-store.

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

Em `scripts/pessoas/frontend.contract.test.ts`, foram removidas apenas as três opções `exact: true` das consultas getByRole nas linhas 108, 110 e 113 do snapshot. Permanecem role link, nome Pessoas e a asserção data-prefetch=false nos três modos. Na recuperação inicial, `scripts/pessoas/frontend.e2e.ts` permaneceu idêntico ao snapshot; o adendo R3 abaixo corrige somente a expectativa do tema Black e sua classe. Seus usos válidos de exact no Playwright permanecem.

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

## Adendo corretivo R1–R5 — 13/10/2026

Missão autorizada nesta rodada: corrigir os cinco achados da revisão estática, preservar o frontend recuperado, criar commit corretivo e fazer push normal da mesma branch. Sem transporte adicional, novo GOAL, execução de testes ou fechamento AEP.

- GOAL confirmado por `track.mjs status pessoas` e `open pessoas`: `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`, RUNNING, tentativa 1/3.
- Base imediata do corretivo (`BASE_HEAD`): `b5b59b677f2149da7cbaada79a86ffef422a9399`. A base de execução da recuperação continua `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`.
- Branch/worktree confirmadas: `goal/pessoas-001b-recovery-001` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`; árvore limpa antes das edições.
- Identificação do commit: `goal(pessoas-001b-recovery-001): corrige achados R1-R5 da revisao estatica`. O SHA exato do commit que contém este adendo é fornecido na entrega e no histórico Git.
- Este adendo registra implementação e inspeção estática; nenhum achado recebeu PASS de runtime.

| Achado | Correção implementada | Verificação de produto |
| --- | --- | --- |
| R1 — P1, Store entre abas | Disponibilidade devolve `storeId` de `exigirAtor`. Contexto/formulários usam essa Store validada. Wrappers inline nas páginas existentes e no layout comparam `expectedStoreId` com o ator da mesma requisição antes de delegar leituras e comandos às actions/serviços 001A. Divergência retorna `LOJA_DIVERGENTE` antes da operação. Troca via storage invalida o contexto retido; foco/pageshow revalidam com resposta no-store; gerações e desmontagem descartam respostas anteriores. | PENDENTE |
| R2 — P2, upload interrompido | Ficha coordena seções e documentos com trava síncrona e estados pendentes, incluindo resultado de mutação incerto. Formulários e novos uploads ficam bloqueados quando outra operação está pendente. A releitura da ficha conserva o componente Documentos montado no mesmo contexto e impede editar versões antigas. | PENDENTE |
| R3 — P2, tema Black | Cenário espera `data-studio-theme="black"` e verifica separadamente a classe CSS `black-edition`; os demais temas e cenários permanecem. | E2E NOT_RUN |
| R4 — P2, overflow | Quebra `overflow-wrap:anywhere` em conteúdos da ficha, nome/cargo/matrícula da lista e títulos/seções locais. Mantidos min-w-0, densidade, tipografia, tokens e composição; sem CSS global ou componentes compartilhados. | Matriz visual PENDENTE |
| R5 — P3, foco | Manutenção de empregador/estabelecimento mantém uma intenção de foco e só foca a confirmação montada quando a releitura retorna. Callback de foco do formulário também confere que segue montado. | Teclado/foco PENDENTE |

O vínculo de R1 é conferido no servidor na própria requisição da operação; não depende de comparar dois GETs ou de ler localStorage antes de salvar. O empregador, vínculo, versões esperadas e comando continuam sujeitos aos guards e à idempotência 001A. Não houve mudança em `scope.ts`, `admin.ts`, `cadastro.ts`, `app/actions/pessoas/index.ts` ou serviços/APIs documentais. Os wrappers documentais reutilizam os mesmos serviços canônicos das APIs 001A; PUT continua direto na URL assinada com todos os headers obrigatórios.

Em R2, o uploadIntent é conservado somente em memória, desde a tentativa de PUT até complete confirmado ou recusa definitiva do backend. Conferir a lista, perder a resposta ou cancelar a espera não apaga um intent que ainda admite replay. A expiração/invalidade é decidida pelo backend, removendo o corte local antecipado de nove minutos. Uma confirmação já enviada pode terminar no servidor mesmo após cancelar a espera; repetir o mesmo intent usa a idempotência canônica. Sucesso só é anunciado após complete confirmado. Trocar/perder escopo descarta o estado transitório por segurança. Tokens, URLs assinadas, bytes e formulários não são persistidos no navegador.

As suítes existentes foram adaptadas aos wrappers/DTO e receberam regressões preparadas, sem execução: Store React A/backend B; invalidação por storage e resposta anterior; wrappers recusando antes das chamadas canônicas; upload/complete pendente bloqueando salvamento; intent preservado ao conferir lista; Documentos montado na releitura; foco após salvar empregador e estabelecimento. A integração PostgreSQL preparada autoriza o mesmo usuário/empregador em A e B, verifica que o comando esperado para A é recusado em B sem novo vínculo e que o mesmo comando continua disponível para uma execução legítima em B.

### Caminhos deste corretivo

```text
app/dashboard/pessoas/configuracoes/page.tsx
app/dashboard/pessoas/funcionarios/[id]/page.tsx
app/dashboard/pessoas/funcionarios/novo/page.tsx
app/dashboard/pessoas/layout.tsx
components/dashboard/pessoas/configuracoes.tsx
components/dashboard/pessoas/contexto.tsx
components/dashboard/pessoas/documentos.tsx
components/dashboard/pessoas/ficha.tsx
components/dashboard/pessoas/lista.tsx
components/dashboard/pessoas/novo.tsx
components/dashboard/pessoas/ui.tsx
components/dashboard/pessoas/use-disponibilidade.ts
lib/pessoas/adapters/cadastro-ui.ts
lib/pessoas/readers/disponibilidade.ts
scripts/pessoas/frontend.contract.test.ts
scripts/pessoas/frontend.e2e.ts
scripts/pessoas/frontend.integration.test.ts
docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_001.md
```

### Inspeção estática e pendências desta rodada

Inspeção limitada a código, diff Git, whitespace, caminhos e consistência estática dos consumidores/props. Os 18 caminhos deste corretivo pertencem à allowlist do open. Nenhum arquivo novo, histórico/derivado AEP ou área protegida foi alterado; WIPs da worktree principal preservados. Staging por caminhos explícitos. Nenhum teste foi executado pelo commit.

```text
R1_STORE_BINDING=CORRECTED_STATIC_RUNTIME_PENDING
R2_UPLOAD_COORDINATION=CORRECTED_STATIC_RUNTIME_PENDING
R3_BLACK_THEME=CORRECTED_E2E_NOT_RUN
R4_OVERFLOW=CORRECTED_VISUAL_PENDING
R5_FOCUS=CORRECTED_RUNTIME_PENDING
TESTS=NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
BUILD=NOT_RUN
E2E=NOT_RUN
INDEPENDENT_REVIEW=PENDING_GLM_5_3
PREVIEW_R2=PENDING
AEP_CLOSE=NOT_RUN
BLOCKERS=NONE_FOR_CORRECTIVE_IMPLEMENTATION; ACCEPTANCE_VALIDATION_AND_GATES_PENDING
NEXT_GATE=AUTORIZACAO_DA_VALIDACAO_ISOLADA
```

A rodada autorizada não iniciou Docker, PostgreSQL, Vitest, Playwright, typecheck, lint, build, runner oficial ou aplicação/browser. A inspeção estática não comprova tipagem, compilação de Server Actions, persistência, isolamento em runtime, acessibilidade visual, upload real ou smoke R2. A validação futura deve usar o HEAD corretivo exato, executar as regressões preparadas e a bateria exigida pelo GOAL, seguida de revisão independente GLM 5.3 e preview/R2 com autorização específica. Produção, merge para main, close/DONE, folha/holerites e GOAL 002 continuam sem execução.

Ponto de parada: **PESSOAS 001B — ACHADOS CORRIGIDOS EM BRANCH, AGUARDANDO VALIDAÇÃO E REVISÃO INDEPENDENTE.**

## Corretivo final R2-01/R2-02 — 13/10/2026

Missão humana: corrigir exclusivamente a recuperação documental apontada na revisão estática do HEAD `34cd1b4a755e38d8eaa816bbab37d28129a13ad3`, preservar os corretivos R1–R5 e preparar cobertura sem executar validação de produto. Um commit corretivo e push normal na branch existente estão autorizados. O GOAL continua aberto, sem close/DONE.

- Branch/worktree: `goal/pessoas-001b-recovery-001` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`.
- BASE_HEAD deste corretivo final: `34cd1b4a755e38d8eaa816bbab37d28129a13ad3`.
- Entrada: `track.mjs status pessoas` e `open pessoas`; GOAL `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`, tentativa 1/3, árvore limpa na base.
- Identificação do commit: `goal(pessoas-001b-recovery-001): recupera revalidacao transitoria e PUT documental`. O SHA exato é registrado na entrega/histórico Git.
- A revisão desta base foi feita por Codex/OpenAI; não representa a revisão independente GLM 5.3 exigida pelo GOAL.

### R2-01: revalidação transitória

O hook conserva a disponibilidade anterior exclusivamente em erro REDE da mesma identidade, Store esperada e geração de escopo. Esse dado é apenas retido: não é devolvido como disponibilidade atual nem como autorização válida. Durante a falha ou a nova requisição, o provider mantém a árvore anterior montada, oculta e inert, com erro e tentativa novamente fora da área oculta. A interação dos formulários/documentos fica suspensa também por contexto local; novas operações aguardam validação positiva.

A nova validação positiva do mesmo escopo recupera a árvore e seu estado documental em memória. ESCOPO_NEGADO, LOJA_DIVERGENTE, flag OFF, logout, mudança de usuário/Store/empregador ou invalidação da geração continuam desmontando o contexto e limpando o estado transitório. Não há persistência ou exibição interativa de dados antigos durante REDE.

### R2-02: PUT e confirmação independentes

Documentos distingue preparação, bytes pendentes, resposta PUT desconhecida, confirmação pendente, resposta complete desconhecida, confirmação concluída e intent recusado. Enquanto houver recuperação, conserva somente em memória o uploadIntent, File original, URL assinada, headers obrigatórios e validade da URL.

- Falha HTTP/cancelamento/resposta PUT perdida permite repetir os mesmos bytes na mesma URL com os mesmos headers enquanto ela for válida. `If-None-Match: *` é preservado; nenhum caminho retira a criação exclusiva ou sobrescreve o objeto.
- HTTP 412 segue para o complete do mesmo intent. O backend 001A existente decide publicação/integridade; não há substituição de objeto nem outro intent automático.
- Uma resposta PUT desconhecida também permite verificar a confirmação diretamente, sem repetir bytes. Se essa verificação falhar sem comprovar o aceite dos bytes, o mesmo PUT continua recuperável enquanto a URL for válida.
- A validade da URL usa o TTL devolvido pelo backend, contado conservadoramente desde o início da solicitação do intent. O retry verifica o prazo antes de cada PUT; a interface também sinaliza expiração. URL vencida não é reutilizada, e seu vencimento não descarta o intent.
- Mesmo com URL vencida, confirmação e listagem continuam disponíveis para o mesmo intent. A invalidade/expiração do intent permanece decisão do backend.
- Cancelar uma action já enviada não cancela sua execução no servidor. Um intent recebido depois do cancelamento é retido sem iniciar PUT; complete cancelado permanece desconhecido e admite replay.
- Sucesso é anunciado somente após complete confirmado. Uma recusa definitiva encerra a recuperação, orienta conferir a lista e exige a ação explícita `Descartar envio recusado` antes de outro envio. Nenhum intent válido é abandonado silenciosamente.
- Durante revalidação, etapas posteriores do envio aguardam a recuperação da autorização; releitura documental necessária fica adiada enquanto a árvore está suspensa.

A trava existente da ficha é mantida durante bytes/complete recuperáveis, incluindo respostas desconhecidas. Documentos continua montado nas releituras da ficha. A edição cadastral é liberada após confirmação ou descarte explícito de uma recuperação definitivamente recusada. Não foi criado cancelamento backend fictício para abandonar um intent ainda válido.

### Cobertura preparada, sem execução

A suíte focada existente ganhou cenários com o provider real para REDE → árvore oculta/inert → revalidação positiva da mesma identidade e replay do mesmo intent. Também prepara descarte por revogação, Store divergente, flag OFF, troca de Store/usuário/empregador/logout e geração de escopo. A cobertura documental preparada inclui PUT falho/abortado seguido de retry do mesmo File/URL/headers, resposta PUT perdida seguida de HTTP 412 ou confirmação direta, URL vencida com intent ainda válido, intent inválido/expirado, cancelamento de complete e manutenção/liberação da trava da ficha.

São cenários de transporte controlado, não prova de storage R2 ou autorização em runtime. Os testes anteriores de R1–R5 foram preservados; fixtures de intent agora incluem o TTL da URL. Nenhum desses testes foi executado.

### Escopo e situação desta rodada

Somente estes seis caminhos foram alterados:

```text
components/dashboard/pessoas/use-disponibilidade.ts
components/dashboard/pessoas/contexto.tsx
components/dashboard/pessoas/ui.tsx
components/dashboard/pessoas/documentos.tsx
scripts/pessoas/frontend.contract.test.ts
docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_001.md
```

Inspeção permitida: diff estático, paths/allowlist, whitespace e estado Git. Backend 001A, wrappers de Store, schema, auth, proxy, PWA, adapter R2, contrato/histórico e corretivos visuais/foco não foram alterados. Nenhum File, intent, URL ou bytes foi persistido no cliente. CURRENT_STATUS/CHANGELOG/memória global e derivados AEP não são editados nesta missão restrita.

```text
R2_01_TRANSIENT_REVALIDATION=IMPLEMENTED_STATIC_RUNTIME_PENDING
R2_02_PUT_RECOVERY=IMPLEMENTED_STATIC_RUNTIME_PENDING
SIGNED_URL_EXPIRATION=PUT_BLOCKED_INTENT_RETAINED
INTENT_EXPIRATION=BACKEND_DECISION_EXPLICIT_DISCARD
DOCUMENT_LOCK=HELD_UNTIL_CONFIRMED_OR_EXPLICIT_SAFE_DISCARD
TESTS=NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
BUILD=NOT_RUN
E2E=NOT_RUN
GLM_REVIEW=PENDING
PREVIEW_R2=PENDING
AEP_CLOSE=NOT_RUN
NEXT_GATE=GLM_5_3_STATIC_REVIEW
```

Não foram executados Docker, PostgreSQL, npm ci, Vitest, Playwright, E2E, typecheck, lint, build, runner oficial, preview/R2 ou merge. Não há PASS de runtime, visual, tipagem ou aceite; a validação futura deve fixar o HEAD corretivo e obedecer à autorização própria.

Ponto de parada: **R2-01 E R2-02 CORRIGIDOS NA BRANCH — AGUARDANDO REVISÃO INDEPENDENTE E VALIDAÇÃO.**

## Corretivo F-01 — cancelamento de complete pendente · 13/10/2026

Missão humana restrita: corrigir F-01, preparar cobertura sem executá-la e criar um único commit corretivo com push normal na mesma branch. GOAL permanece aberto; sem PR, merge, rebase ou close/DONE.

- GOAL confirmado por `track.mjs status pessoas` e `open pessoas`: `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`, tentativa 1/3.
- Branch/worktree: `goal/pessoas-001b-recovery-001` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`.
- BASE_HEAD: `6c372f98a92ea2c77a4176d3194044719cf84c58`; árvore limpa antes das edições.
- Identificação do commit: `goal(pessoas-001b-recovery-001): libera espera cancelada do complete documental`. O SHA exato é fornecido na entrega e no histórico Git.

### Implementação e limites

Somente a Promise de `actions.confirmar` passa por uma espera local sensível ao AbortSignal. Cancelar encerra essa espera mesmo se a Promise original nunca terminar; o tratamento existente marca `complete_unknown`, conserva o uploadIntent e libera busy e o lock operacional. A trava documental da ficha permanece enquanto houver recuperação; conferir a lista e repetir complete usam o mesmo intent. Sucesso continua condicionado à resposta positiva da tentativa atual.

Cada espera liquida uma única vez e remove seu listener de aborto ao cancelar, resolver ou rejeitar, inclusive se receber um sinal já abortado. Handlers de sucesso e rejeição permanecem ligados à Promise original para consumir respostas tardias, sem alterar estado visual, mensagens ou locks de outra tentativa. O cancelamento é exclusivamente da espera no navegador: a operação no servidor pode concluir normalmente.

`actionData` e a chamada de `criarUploadIntent` permanecem sem alteração. Um intent recebido depois de Cancelar ainda é retido em memória sem iniciar PUT automaticamente. Recuperação PUT/HTTP 412, expiração da signedUrl, guards, privacidade e corretivos R1–R5 são preservados.

### Cobertura preparada — NOT_RUN

- Primeiro complete fica em uma Promise que nunca resolve; cancelar deve liberar os botões de recuperação antes de qualquer resposta, mantendo a ficha protegida e sem sucesso ou descarte automático.
- Conferir a lista não abandona o envio; a segunda confirmação usa exatamente o mesmo token, sem outro intent ou PUT, e libera a ficha somente após resposta positiva.
- Sucesso, recusa definitiva e rejeição tardios da tentativa cancelada chegam enquanto uma segunda confirmação está pendente; não podem trocar mensagens, anunciar sucesso, descartar o intent ou liberar busy/locks atuais.
- O cenário anterior de intent recebido depois de Cancelar permanece na suíte sem modificação.

### Caminhos e validação desta missão

```text
components/dashboard/pessoas/documentos.tsx
scripts/pessoas/frontend.contract.test.ts
docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_001.md
```

Validação limitada à inspeção do diff, comparação dos três caminhos com a allowlist e `git diff --check`. Nenhuma validação de produto foi executada. Nenhuma alteração em backend, Server Actions, schema, auth, proxy, PWA, configuração ou derivados AEP versionados. CURRENT_STATUS/CHANGELOG/memória global não foram alterados nesta missão restrita.

```text
F01=IMPLEMENTED_STATIC_RUNTIME_PENDING
CANCEL_WITH_UNRESOLVED_PROMISE=IMPLEMENTED_COVERAGE_PREPARED_NOT_RUN
INTENT_PRESERVATION=SAME_INTENT_RETAINED_IN_MEMORY
LATE_RESPONSE_ISOLATION=SETTLED_WAIT_IGNORES_LATE_SUCCESS_AND_REJECTION
DOCUMENT_LOCK=HELD_UNTIL_CONFIRMED_OR_EXPLICIT_SAFE_DISCARD
TESTS=NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
BUILD=NOT_RUN
E2E=NOT_RUN
GLM_REVIEW=PENDING
PREVIEW_R2=PENDING
AEP_CLOSE=NOT_RUN
NEXT_ACTION=REVISAO_INDEPENDENTE_ZAI_GLM_5_3
```

Ponto de parada desta missão: **F-01 CORRIGIDO E PUBLICADO NA BRANCH.** Não representa aceite do GOAL, revisão GLM ou PASS de runtime.

## Revisão GLM recebida, PR draft e caminho de visualização — 14/10/2026

Missão documental autorizada: registrar a revisão recebida do usuário, abrir uma única PR draft e identificar os previews existentes do SHA revisado. Nenhum código de produto foi alterado nesta rodada.

### Aprovação estática restrita ao F-01

O usuário informou `REVIEW_FAMILY=zai/GLM-5.3`, `REVIEWED_SHA=6cd20313ad7f1404a99d691644c82fc92ae47a55`, `REVIEW_CODE=APPROVE`, P0=0, P1=0, P2=0 e P3=1. A aprovação abrange exclusivamente o corretivo F-01. O P3 remanescente é o aviso cosmético de rede após Cancelar.

Evidência com proveniência explícita: `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/REVISAO_GLM_F01_RECEBIDA_USUARIO_2026-10-14.md`. Registro realizado por Codex/OpenAI a partir da mensagem do usuário; nenhuma nova execução GLM ou review formal em nome desse modelo foi realizada. A revisão integral da implementação e a validação de runtime não são declaradas aprovadas. Os registros anteriores GLM_REVIEW=PENDING descrevem suas respectivas rodadas; o estado atual é GLM_F01=APPROVE_RECEBIDO_USUARIO, com aceite integral/runtime ainda pendentes.

### PR, divergência da main e escopo Git

- PR draft única: [#273 — feat(pessoas): recuperar frontend cadastral e privacidade](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273), `goal/pessoas-001b-recovery-001` → `main`.
- Main consultada: `a70469ddb96ba60f9575ab8036a78a71da35d35d`; merge-base: `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`.
- No SHA revisado, a branch tinha cinco commits exclusivos e a main sete; 33 caminhos na entrega, dos quais 31 são produto/testes recuperados e dois são documentação/evidência. O commit desta rodada acrescenta somente documentação.
- Nenhum caminho alterado na branch se sobrepõe aos caminhos modificados pelos sete commits da main. O GitHub retornou `mergeable=true` e `mergeable_state=clean` para a PR na consulta inicial, sem conflitos reais identificados.
- Todos os caminhos da entrega estão na allowlist. Nesta rodada, apenas a evidência acima e este relatório são alterados. Nenhum arquivo de outras trilhas é incorporado; sem fetch de código para a worktree, rebase, merge local ou force push.

### Deployments existentes do SHA revisado

Os statuses GitHub do SHA `6cd20313ad7f1404a99d691644c82fc92ae47a55` apontam para os deployments abaixo; a consulta read-only `vercel inspect --format=json` confirmou os IDs, projetos, URLs, estado READY e target preview. As URLs imutáveis continuam vinculadas à versão de produto revisada; o commit documental desta rodada não está incluído nesse SHA.

| Projeto | Deployment | URL HTTPS de visita | Painel Vercel |
| --- | --- | --- | --- |
| omni-gestao-pro | `dpl_J5FzLGvpKeNaGWPtXDNJDmcEACW3` · READY · preview | [Abrir Pessoas](https://omni-gestao-4qne0onlj-rafaelfaria49-4373s-projects.vercel.app/dashboard/pessoas) | [Deployment](https://vercel.com/rafaelfaria49-4373s-projects/omni-gestao-pro/J5FzLGvpKeNaGWPtXDNJDmcEACW3) |
| omni-gestao | `dpl_EFEKeZ113DuUgfrfkD5XgPiUZQE2` · READY · preview | [Abrir Pessoas](https://omni-gestao-r2152ssd0-rafaelfaria49-4373s-projects.vercel.app/dashboard/pessoas) | [Deployment](https://vercel.com/rafaelfaria49-4373s-projects/omni-gestao/EFEKeZ113DuUgfrfkD5XgPiUZQE2) |

Consulta de acesso não autenticado, sem cookies ou credenciais de aplicação:

- **omni-gestao-pro:** `/api/pessoas/disponibilidade` respondeu HTTP 404 com `code=PESSOAS_DESABILITADO`, comprovando a flag OFF nessa resposta. `/dashboard/pessoas` respondeu HTTP 307 para `https://omni-gestao-pro.vercel.app/login`, domínio de produção; esse redirecionamento não demonstra uma sessão de preview nem visualização da interface Pessoas. Não foi seguido um fluxo de login em produção.
- **omni-gestao:** ambas as rotas responderam HTTP 302 para `https://vercel.com/sso-api`; a proteção SSO da Vercel impede a inspeção não autenticada. O estado da flag e a disponibilidade da aplicação atrás desse gate não foram confirmados.
- **Visualização real da interface Pessoas: bloqueada.** Os links de visita existem, mas não demonstram o cadastro aberto. A infraestrutura isolada e o preview/R2 autenticado exigidos pelo GOAL continuam pendentes, sem provisionamento ou mudança de variáveis/banco/auth/R2. PESSOAS_DP_ENABLED produtivo permanece sem ativação nesta missão.

### Checks existentes e validações pendentes

No SHA revisado, os statuses automáticos `Vercel – omni-gestao-pro` e `Vercel – omni-gestao` estão em success. O check `Vercel Preview Comments` está completed/success, com zero feedbacks não resolvidos; isso não é teste funcional. A consulta de workflows GitHub Actions para esse SHA retornou lista vazia. Nenhum desses resultados é atribuído aos testes locais, à bateria Recovery, ao novo commit documental ou ao gate preview/R2.

Nesta missão, a validação permanece limitada à inspeção de escopo Git/allowlist e `git diff --check`. Docker, PostgreSQL, Vitest, Playwright, typecheck, lint, build e runner oficial não foram executados. Permanecem pendentes a bateria isolada do GOAL, a matriz visual/acessibilidade, a revisão integral quando exigida para aceite e o preview/R2 com bytes reais em recursos sintéticos autorizados.

```text
REVIEW_GLM_F01=APPROVE_RECEBIDO_USUARIO
REVIEWED_SHA=6cd20313ad7f1404a99d691644c82fc92ae47a55
REVIEW_INTEGRAL_FRONTEND=NOT_DECLARED_APPROVED
PR_URL=https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273
PR_DRAFT=YES
MAIN_HEAD_INSPECTED=a70469ddb96ba60f9575ab8036a78a71da35d35d
MERGEABILITY_INSPECTED=CLEAN
VISUALIZACAO_REAL=BLOCKED_FLAG_OFF_AND_AUTHENTICATION
TESTS=NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
BUILD=NOT_RUN
RUNTIME_VALIDATION=PENDING
PREVIEW_R2=PENDING
AEP_CLOSE=NOT_RUN
NEXT_GATE=AUTORIZACAO_DA_VALIDACAO_ISOLADA_E_PREVIEW_R2
```

Ponto de parada: **PR DRAFT ABERTA, REVISÃO REGISTRADA E CAMINHO DE VISUALIZAÇÃO IDENTIFICADO.** Sem merge da PR, close/DONE, produção, liberação de dados reais ou GOAL 002.

## Homologação isolada autorizada — preflight de 15/10/2026

O pedido humano de 14/10/2026 autorizou PostgreSQL sintético independente, usuários/Stores fictícios, bucket R2 privado exclusivo, credenciais mínimas, variáveis isoladas, Preview privado e verificação manual. Isso atualiza a pendência de autorização específica descrita nas rodadas anteriores; não equivale a validação executada, liberação de produção ou aprovação dos caminhos protegidos.

O preflight confirmou branch/worktree, HEAD inicial local/remoto `3a5d8b563aa0160aa7a71c403a1f9c7558b9f947`, PR #273 draft e AEP RUNNING na tentativa 1/3. A main inicialmente consultada era `a70469ddb96ba60f9575ab8036a78a71da35d35d`; a consulta posterior confirmou `4a85dd95202b56873487b31c318fc2d751fc26f5`, com 17 commits desde a base comum e nenhum caminho sobreposto à entrega Pessoas. Nenhum rebase, merge ou force push foi realizado.

Foi criado no plano Free da organização Neon Omni Gestão QA o projeto exclusivo `omni-gestao-pessoas-001b-qa`, ID `orange-voice-83394974`, branch `br-twilight-shape-b5zrtyts`, endpoint ID `ep-steep-hall-b5ml41wv`, região AWS Ohio. Uma consulta somente de leitura confirmou banco `pessoas_001b_qa`, usuário `pessoas_001b_qa_owner`, PostgreSQL 17.11 e zero tabelas públicas. O hostname completo permanece pendente; nenhum DDL, migration, baseline, seed ou usuário de aplicação foi criado. A branch padrão denominada “Produção” no painel pertence a esse projeto novo de homologação, sem relação com o banco produtivo.

**Bloqueio de banco:** o limite humano “apenas migrations existentes” não cobre a baseline de schema necessária ao banco vazio. A cadeia histórica pressupõe tabelas-base que não cria (users/admin_users/tecnicos); o próprio runner versionado usa schema da base comum + invariantes 0022. Foi preparada uma proposta restrita ao projeto novo, sem execução de DDL, aguardando autorização adicional ou banco sintético previamente inicializado.

**Bloqueio R2/acesso:** a aba R2 redirecionou ao login; uma inspeção posterior foi recusada pela revisão automática por possível acesso amplo a Cloudflare/DNS. A revisão automática também recusou abrir “Conecte-se” no Neon por possível exposição de credenciais. Não houve contorno. Permanecem necessários acesso restrito R2 e confirmação segura do hostname, sem senha/token/URL completa neste relatório.

A Vercel está acessível via CLI no plano Hobby. Nenhum projeto dedicado, deployment ou variável foi criado/alterado; nenhum bucket/credencial/CORS R2 foi provisionado. Não houve contratação paga nova. A franquia disponível da conta R2 ainda não foi confirmada.

Evidência completa com custos, identificadores seguros, consulta de identidade, proposta de bootstrap e imagens saneadas: [HOMOLOGACAO_ISOLADA_PREFLIGHT_2026-10-15.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/HOMOLOGACAO_ISOLADA_PREFLIGHT_2026-10-15.md). As duas imagens comprovam somente infraestrutura Neon; nenhuma tela Pessoas foi aberta ou homologada.

```text
PREVIEW_URL=NOT_CREATED
PREVIEW_AUTH=PENDING_PRIVATE_DEPLOYMENT
ISOLATED_DATABASE=CREATED_FREE_EMPTY_IDENTITY_CONFIRMED_HOST_PENDING
SYNTHETIC_USERS=NOT_CREATED
PRIVATE_R2=NOT_CREATED_ACCESS_BLOCKED
COST_ADDITIONAL=NO_NEW_PAID_SERVICE; R2_ACCOUNT_ALLOWANCE_UNVERIFIED
SCREENS_VISUALIZED=NONE_PESSOAS
MANUAL_CADASTRO=NOT_RUN
MANUAL_RELOAD=NOT_RUN
MANUAL_DOCUMENT_UPLOAD=NOT_RUN
MANUAL_STORE_ISOLATION=NOT_RUN
SCREENSHOTS=NEON_INFRASTRUCTURE_ONLY
PRODUCTION_UNCHANGED=YES_BY_THIS_MISSION
AUTOMATED_TESTS=PENDING_NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
LOCAL_BUILD=NOT_RUN
AEP_CLOSE=NOT_RUN
PR_DRAFT=YES
BLOCKERS=FRESH_DATABASE_BOOTSTRAP_SCOPE; DATABASE_HOST_VERIFICATION; R2_ACCESS_AUTO_REVIEW_AND_LOGIN
NEXT_GATE=HUMAN_BOOTSTRAP_DECISION_AND_SAFE_PROVIDER_ACCESS
```

O commit desta rodada altera somente documentação/evidências na allowlist; validação limitada a escopo Git e `git diff --check`. Sem Docker, Vitest, E2E/runner, typecheck, lint ou build local. Nenhum build automático de provedor é tratado como teste aprovado. A revisão GLM aprovada continua exclusivamente a de F-01 no SHA `6cd20313ad7f1404a99d691644c82fc92ae47a55`; runtime e revisão integral permanecem pendentes.

Ponto de parada desta etapa: **BLOQUEIO EXATO IDENTIFICADO — INICIALIZAÇÃO DO BANCO VAZIO E ACESSO SEGURO AOS PROVEDORES.** O GOAL permanece aberto, PR draft, sem close/DONE, merge, produção ou GOAL 002.


## Baseline concluída e Preview privado real — 15/10/2026

O pedido humano “CONCLUIR BASELINE, R2 E PREVIEW PRIVADO REAL” autorizou a baseline no banco QA identificado e o acesso restrito aos provedores. Essa autorização e a execução abaixo substituem as pendências de bootstrap/conexão do preflight anterior; não liberam produção ou close.

- HEAD inicial e deployado: `3ed789c689b41acbdc3e8f5ca5e10c26ff6d7479`. Worktree/branch preservadas. Main remota consultada: `4a85dd95202b56873487b31c318fc2d751fc26f5`. AEP RUNNING, sessão aberta, tentativa 1/3.
- Neon conectado: projeto `orange-voice-83394974`, branch `br-twilight-shape-b5zrtyts`, banco `pessoas_001b_qa`. Identidade/vazio confirmados antes do DDL.
- Baseline offline da base fixa `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d` aplicada em transação; 109 tabelas e invariantes 0022 verificadas (10 CHECKs, sete índices parciais, dez triggers, quatro funções).
- Estratégia de histórico: baseline QA por schema fixo + invariantes; nenhuma migration histórica foi marcada ficticiamente como aplicada. `_prisma_migrations` ausente, sem reset/db push/schema novo.
- Drift específico no ambiente Vercel QA: `No difference detected.`, exit zero. Compilação remota concluída com `MIGRATION_SKIPPED` e tipos pulados; sem atribuir PASS ao typecheck, lint ou à bateria.
- [Preview privado Pessoas — visita real](https://omni-gestao-pessoas-001b-fiohd84il-rafaelfaria49-4373s-projects.vercel.app/dashboard/pessoas), deployment `dpl_BiqCTkxCT5kNZmLj7ermmFnyoZmH`, projeto exclusivo `omni-gestao-pessoas-001b-qa`, target API staging/Preview, proteção Vercel all + NextAuth normal.
- Cadastro manual real: empregador/estabelecimento, funcionário A ATIVO, reload, edição pessoal v2, contrato ALTERACAO v2 e histórico preservado; funcionário B RASCUNHO salvo e recarregado. Fixtures e credenciais são exclusivamente sintéticas.
- Store A/B: listas separadas, URL direta A em contexto B negada; SQL confirma um vínculo por Store. Leitor apenas viewCadastro vê remuneração/motivos restritos, sem edição ou documentos; valores e motivos ausentes no DOM inspecionado.
- Oito capturas reais da lista nos quatro temas em 1440×900 e 390×844, mais visão geral, histórico restrito e recusa por Store. Amostra parcial; matriz completa/360×800/acessibilidade pendentes.
- R2 ainda sem painel autenticado observado: após o usuário informar login concluído, a Cloudflare permaneceu no login com aviso de SSO. Nenhum bucket/token/CORS criado, plano/franquia não verificados.
- Upload não iniciado: além do R2 pendente, a extensão Edge bloqueou a seleção automática do PDF local. Zero documentos no banco; não há prova de intent/PUT/complete/list/download reais.

Evidência detalhada, ocorrências e galeria: [BASELINE_PREVIEW_PRIVADO_2026-10-15.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/BASELINE_PREVIEW_PRIVADO_2026-10-15.md). Metadados saneados em `QA_BASELINE_PREVIEW_2026-10-15.json` no mesmo diretório. Nenhum CPF, segredo, URI de conexão, cookie ou URL assinada foi incluído.

Ocorrência declarada: o primeiro deployment, com target omitido, foi classificado production pela Vercel no projeto QA novo e imediatamente cancelado (CANCELED confirmado). Os seguintes usaram staging/Preview explícito. Os projetos e recursos produtivos existentes permaneceram sem alteração.

```text
NEON_PLUGIN=CONNECTED_AND_VERIFIED
BASELINE=APPLIED_QA_109_TABLES_INVARIANTS_VERIFIED
MIGRATION_HISTORY=FIXED_SCHEMA_QA_BASELINE_NO_FAKE_REPLAY
SCHEMA_DRIFT=ZERO_TARGETED_PROVIDER_CHECK
LOGIN_QA=REAL_NEXTAUTH_ADMIN_AND_RESTRICTED_PRIVATE_VERCEL
CADASTRO_MANUAL=CREATE_RELOAD_EDIT_CONTRACT_HISTORY_AND_DRAFT_OBSERVED
STORE_ISOLATION=MANUAL_A_B_LIST_AND_DIRECT_ID_DENIAL_OBSERVED
R2_PRIVATE=PENDING_AUTHENTICATED_SSO_DASHBOARD
DOCUMENT_UPLOAD=NOT_STARTED_R2_AND_BROWSER_FILE_SELECTION_BLOCKED
VISUAL_SCREENSHOTS=11_REAL_IMAGES_PARTIAL_MATRIX
ADDITIONAL_COST=NO_NEW_PAID_SERVICE_R2_ALLOWANCE_UNVERIFIED
PRODUCTION_UNCHANGED=EXISTING_PRODUCTION_RESOURCES_UNCHANGED
AUTOMATED_TESTS=PENDING
TYPECHECK=NOT_RUN
LINT=NOT_RUN
LOCAL_BUILD=NOT_RUN
REMOTE_COMPILE=COMPLETED_TYPES_SKIPPED_MIGRATION_SKIPPED
GLM_F01=APPROVE_RECEIVED_USER_SHA_6cd20313ad7f1404a99d691644c82fc92ae47a55
GLM_INTEGRAL=PENDING
AEP_CLOSE=NOT_RUN
PR_DRAFT=YES
NEXT_GATE=R2_SSO_PRIVATE_BUCKET_REAL_BYTES_THEN_FULL_VALIDATION_AND_INDEPENDENT_REVIEW
```

Esta rodada altera somente relatório/evidências na allowlist. CURRENT_STATUS, CHANGELOG, memória global e derivados AEP não são editados nesta missão restrita. A bateria oficial, regressões completas R1–R5 e revisão integral independente continuam pendentes. A aprovação GLM recebida continua limitada a F-01; Codex/OpenAI não declara revisão cross-family realizada.

Ponto de parada: **PREVIEW PRIVADO DO CADASTRO REAL DISPONÍVEL; R2/UPLOAD E ACEITE INTEGRAL PENDENTES.** Sem merge, close/DONE, liberação de dados reais ou GOAL 002.

## R2 privado e Preview com upload real — 16/10/2026

A confirmação humana final autorizou o token R2 restrito ao bucket QA, com validade de uma semana e armazenamento criptografado; o login Vercel foi concluído pelo usuário. Essa execução supera o bloqueio R2 de 15/10, preservando o histórico anterior e os gates de aceite.

- HEAD inicial/remoto e deployado: `cdcd29f2463f98e971034932abfd6a3bc739913f`. Main consultada: `976ebaa294e09441ce0c5be7bbe5776a568f4013`; sem rebase, merge ou force push. AEP RUNNING/aberto, tentativa 1/3.
- Neon QA existente reutilizado, sem novo DDL/seed. Runtime continua com o role restrito. Drift específico do provedor novamente zero; compilação remota READY com tipos pulados e MIGRATION_SKIPPED.
- Novo bucket `omni-gestao-pessoas-001b-qa`, Standard/ENAM, acesso público desabilitado, sem domínio público. Token Object Read & Write exclusivo desse bucket, expira em **23/10/2026**; CORS somente do alias estável QA, PUT/GET/HEAD, If-None-Match/Content-Type.
- Credenciais somente no cofre DPAPI CurrentUser e Vercel QA encrypted/Preview. Transporte plaintext foi rejeitado automaticamente e substituído por transporte criptografado, sem arquivo plaintext de credencial R2.
- [Preview privado real — abrir Pessoas](https://omni-gestao-pessoas-001b-qa-rafaelfaria49-4373s-projects.vercel.app/dashboard/pessoas), deployment `dpl_AjM5mPXsASK6JUPwLQVWnK8smKzg`, staging/Preview explícito, proteção Vercel all + NextAuth. Treze variáveis exclusivas de Preview; zero production e Git link ausente.
- Upload real pela interface: PDF sintético de 729 bytes, intent/PUT/complete positivo, “Documento salvo”, listagem e reload. SQL/auditoria confirmam o documento `677db717-9621-463c-9057-5b379c73e6e8` somente na Store A. Após complete, Criar versão do contrato voltou habilitado.
- HEAD/GET QA pelo SDK confirmam SHA-256 `d658d6542efa23246c0e9a8e8d77c0519c1b61e541b74d505cb9486ddd049c64`; PUT exclusivo sobre o mesmo objeto recebeu HTTP 412, sem alteração. Não é prova da recuperação HTTP 412 pela interface.
- O botão Baixar gerou autorizações reais auditadas. Depois, o usuário confirmou em 16/10/2026 **“Sim, o PDF foi baixado”**, com proveniência explícita de mensagem humana neste chat. O backend usa nome neutro `documento.pdf`; a distinção para o nome da listagem foi esclarecida antes da resposta. A ferramenta CUA não retornou arquivo local por timeout/reinicialização, portanto o hash do arquivo recebido pelo navegador não foi inspecionado; a integridade foi conferida separadamente no objeto R2 pelo SDK. Nenhum defeito do produto é inferido desse timeout.
- Com documento já existente, Store B negou a URL direta da ficha A; contexto A restaurado. Capacidades restritas/contratos permanecem na evidência manual anterior; regressões integrais pendentes.
- Seis novas imagens saneadas; matriz completa de quatro temas/responsividade/teclado permanece pendente. Nenhuma imagem contém CPF, segredo ou URL assinada.
- Sem contratação paga nova; Neon Free, Vercel Hobby, R2 faturável US$ 0,00 observado antes do smoke. Franquia Standard oficial e limites da observação estão na evidência.
- Bucket `omni-contador-documentos-prod`, suas chaves/objetos, DNS, recursos produtivos e flag produtiva não foram utilizados ou modificados.

Evidência detalhada: [R2_PREVIEW_PRIVADO_REAL_2026-10-16.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/R2_PREVIEW_PRIVADO_REAL_2026-10-16.md); metadados saneados em `QA_R2_PREVIEW_2026-10-16.json` no mesmo diretório. O commit desta rodada é documental; o runtime validado permanece fixado no SHA deployado acima.

```text
R2_PRIVATE=QA_PRIVATE_CREATED_TOKEN_LIMITED_UNTIL_2026_10_23
DOCUMENT_UPLOAD=REAL_INTENT_PUT_POSITIVE_COMPLETE_LIST_RELOAD
DOCUMENT_STORAGE_INTEGRITY=MATCH_729_BYTES_HTTP_412_NO_OVERWRITE
DOCUMENT_DOWNLOAD_AUTHORIZATION=REAL_AUDITED
DOCUMENT_BROWSER_DOWNLOAD=CONFIRMED_BY_USER
DOCUMENT_BROWSER_DOWNLOAD_HASH=NOT_INSPECTED_BY_TOOL
STORE_ISOLATION=REAL_B_DENIED_A_WITH_DOCUMENT_A_RESTORED
AUTOMATED_TESTS=PENDING
TESTS=NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
LOCAL_BUILD=NOT_RUN
GLM_F01=APPROVE_RECEIVED_USER_ONLY
GLM_INTEGRAL=PENDING
AEP_CLOSE=NOT_RUN
PR_DRAFT=YES
NEXT_GATE=FULL_ISOLATED_VALIDATION_AND_GLM_INTEGRAL
```

Somente documentação/evidências na allowlist, inspeção de escopo Git e `git diff --check`. Sem testes automatizados, typecheck, lint, build local, runner oficial, merge, close/DONE, produção ou GOAL 002. Não há aceite integral ou revisão cross-family realizada por Codex/OpenAI.

Ponto de parada: **PREVIEW PRIVADO REAL COM R2 QA, UPLOAD CONFIRMADO E DOWNLOAD RELATADO PELO USUÁRIO; ACEITE INTEGRAL PENDENTE.**

## Fechamento técnico direto e decisão humana — 18/10/2026

Autorrevisão integral única realizada por Codex/OpenAI sobre `12022ff41c2046350f4c4ab2aff5681e24b95410`, cobrindo cadastro, lista/ficha/edição, contratos/histórico/remuneração, documentos, Store/empregador, capacidades/revogação, contexto e F-01. Não é revisão independente. Nenhum código de produto foi modificado.

```text
INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION
SELF_REVIEW=CODEX
HUMAN_MERGE_AUTHORIZATION=PENDING
P0=0
P1=0
P2=1
WAIVER_CONDITION_SATISFIED=NO
```

A dispensa foi decidida pelo usuário neste chat em 18/10, exclusivamente para a PR #273, condicionada a autorrevisão sem achados bloqueantes. A condição não foi declarada satisfeita. Não houve execução GLM ou envio a outra IA. O GOAL/META, ledger, state, REGISTRY e GATES permanecem preservados; nenhuma exigência técnica foi removida para forçar close.

**P2-01, integração preexistente 001A:** `lib/pessoas/documentos/service.ts:55` aplica mínimo de oito caracteres a storeId; `exigirAtor` aceita 1–100 e os IDs reais `loja-1/loja-2` têm seis. Upload-intent falha com INTENT_INVALIDO/403 antes do R2. Diagnóstico isolado do helper real confirmou as duas recusas e aceitação de `qa-pessoas-a`; sem banco/rede/storage, não equivale a bateria. A correção mínima está em serviço expressamente fora da allowlist e não foi aplicada nem contornada pelo frontend.

**Validação consolidada:** `verify --all` PASS, exit 0. Uma execução de `check pessoas` no SHA acima: itens 1–9 PASS; item 10 FAIL porque o runner oficial saiu com código 5, reserva insuficiente em C:. Node 24.14.1 e binários PostgreSQL 17 presentes; aproximadamente 1,9 GiB livres contra 12 GiB obrigatórios. npm ci, Prisma generate, typecheck, Vitest/integração, build/PWA, lint e Playwright não foram executados. Sem reduzir guard ou limpar arquivos de outras tarefas. Sem nova tentativa/ratificação AEP.

Evidências reais de 15–16/10 reaproveitadas: Neon QA, cadastro/reload/contrato/histórico, restrição salarial no DOM, upload/complete/list/reload R2, integridade do objeto, download confirmado pelo usuário e isolamento A/B. Smokes não repetidos. QA usou IDs longos e não cobre P2-01; matriz integral/360×800/teclado e regressões completas continuam pendentes.

Main confirmada: `976ebaa294e09441ce0c5be7bbe5776a568f4013`; zero interseção líquida entre caminhos alterados da entrega e da main, sem incompatibilidade concreta identificada na inspeção das dependências compartilhadas. O check emitiu aviso upstream por nove commits em padrões da allowlist. Nenhuma combinação final foi compilada; sem rebase, merge ou WIPs incorporados.

Relatório completo, cobertura, decisão humana, correção mínima e resultados: [FECHAMENTO_TECNICO_CODEX_2026-10-18.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FECHAMENTO_TECNICO_CODEX_2026-10-18.md). No mesmo diretório: `self-review-2026-10-18.json`, saída integral `aep-check-2026-10-18.txt` e diagnóstico `store-id-diagnostic-2026-10-18.json`.

```text
AEP_CLOSE=NOT_RUN_CHECK_FAILED
PR_DRAFT=YES
MERGE_READINESS=BLOCKED
NEXT_ACTION=HUMAN_PLANNING_FOR_SERVICE_ALLOWLIST_AND_AT_LEAST_12_GIB_PER_VOLUME
```

Ponto de parada: **AUTORREVISÃO CONCLUÍDA; CORREÇÃO DOCUMENTAL FORA DA ALLOWLIST E VALIDAÇÃO OFICIAL IMPEDIDA POR DISCO.** Sem DONE, merge, produção ou GOAL 002.


## Retomada P2-01 após merge AEP — 18/10/2026

A PR #284 foi confirmada mergeada pelo humano `rafaelfaria49-png` em `180a2f2ab450cc2686b5087dc09b1a0ee58b5f72`. A branch da PR #273 foi atualizada pelo Update Branch oficial do GitHub, exigindo o HEAD esperado `5eac8be5820f0d9a9ef0374e52bf1603112f78ca`. O merge remoto `1c3ce6b57fdc8d3eeeb19fd414d713eb3c524527` foi incorporado localmente somente por fast-forward. Sem rebase, force push, reset, cherry-pick ou transporte de WIPs.

O refresh oficial passou em dry-run e aplicação. A revisão 6 está idêntica em HEAD, origin/main e base comum (blob `9f3ee05b4d920b81ccccbd6c7d431d2cd95d63fa`). Somente `lib/pessoas/documentos/service.ts` foi acrescentado à allowlist. Tentativa 1/3, `opened_at=2026-10-12T23:27:06.181Z`, `attempts_log=[]`, gates e demais campos anteriores foram preservados. O hash anterior do marcador é `ca76b04e214e25c20ff54fc2fbcaf9bb3f1c8eebc8e2cae4b9d68c65744f077f`; a proveniência foi registrada pela CLI. Nenhum open ou edição manual do marcador foi realizado. Item 8 preservado e verify --all PASS.

**Correção funcional commitada e publicada:** `d3e19a4aa4ce4f79aa39d57402d361e194b754b6`. O helper refCanonica valida Store pela mesma gramática 1–100 de exigirAtor e mantém empregador/documento em 8–100, com namespace inalterado. Nenhuma outra regra documental, schema, auth, Prisma, adapter R2 ou serviço foi alterado.

**Validação focada executada:** 24 asserções PASS sobre o helper real, extraído e executado com o parser TypeScript nativo do Node 24; sintaxe do arquivo de integração também validada. Isso é diagnóstico focado sem banco/storage/rede, não execução Vitest nem homologação documental. Foram acrescentados 20 casos de integração PostgreSQL em frontend.integration.test.ts, ainda não executados: loja-1/loja-2/QA longo, limites 1/100, IDs inválidos, namespace, intent/complete/list/download, replay e isolamento nas duas direções com membership/grants válidos.

**Runner oficial:** executado no HEAD funcional acima, exit **5**, por reserva após instalação. Node 24.14.1, npm 11.11.0 e binários PostgreSQL 17.10. Havia `13067345920` bytes livres antes da instalação; npm ci e Prisma generate concluíram no workspace externo sanitizado, mas restaram `11607539712` bytes (**10,810 GiB**), abaixo dos `12884901888` bytes (**12 GiB**) obrigatórios. O runner interrompeu antes de typecheck, Chromium, Vitest/integração, lint, build/PWA e E2E. Nenhuma dessas etapas recebe PASS. Reserva e política preservadas.

**Cleanup PASS:** o runner removeu somente seu workspace `C:/Users/rafae/AppData/Local/Temp/omni-pessoas-test-KKkU2j`, incluindo dependências/cache e relatórios transitórios; ausência do diretório confirmada separadamente. Porta 55439 livre, conferida pelo runner. Após cleanup: `13141671936` bytes livres (**12,239 GiB**). Esse retorno acima de 12 GiB não resolve a insuficiência comprovada após instalação.

**Autorrevisão Codex:** revisão estática da correção/regressões e incorporação governada da main, reaproveitando a autorrevisão integral anterior sem nova auditoria geral. Sem novos achados estáticos P0/P1/P2; aceite técnico final e condição da dispensa continuam **PENDENTES**, pois a bateria obrigatória não executou. `INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION`; autorrevisão não representa revisão independente. Nenhum GLM solicitado. Smokes QA reais de 15–16/10 reaproveitados com seus SHAs e limites anteriores; não repetidos nem apresentados como validação do HEAD novo.

**Único impedimento desta retomada:** capacidade de disco suficiente para preservar a reserva após instalar/buildar. Foi solicitada autorização limitada a `C:/Projetos/omni-gestao-ops-v4-fluxo-curto-005/.next` (1.816.226.473 bytes lógicos) e `C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007/.next` (2.526.388.504 bytes lógicos). Sem reparse points ou consumidores visíveis na inspeção; reconferir imediatamente antes de eventual limpeza autorizada. Tamanho lógico não garante recuperação física. Nenhuma exclusão adicional realizada. A preferência de 16 GiB não foi criada como gate novo.

Evidência estruturada: [P2_01_RECOVERY_2026-10-18.json](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/P2_01_RECOVERY_2026-10-18.json).

```text
P2_01=IMPLEMENTED_FOCUSED_HELPER_PASS_POSTGRES_PENDING
OFFICIAL_RUNNER=FAIL_POST_INSTALL_DISK_PREFLIGHT_EXIT_5
TYPECHECK=NOT_RUN
LINT=NOT_RUN
BUILD=NOT_RUN
E2E=NOT_RUN
VERIFY_ALL=PASS
CLEANUP=PASS
SELF_REVIEW=CODEX_STATIC_NO_NEW_FINDINGS_TECHNICAL_ACCEPTANCE_PENDING
WAIVER_CONDITION_SATISFIED=NO
AEP_CLOSE=NOT_RUN
AEP_SESSION=ORIGINAL_ATTEMPT_1_OF_3_PRESERVED
PR_273=OPEN_DRAFT
MERGE_READINESS=BLOCKED
NEXT_ACTION=AUTHORIZE_SCOPED_CLEANUP_THEN_REQUIRED_VALIDATION
```

Sem close/DONE, merge da PR #273, ativação produtiva, dados reais ou GOAL 002. CURRENT_STATUS/CHANGELOG/memória e derivados AEP não foram editados; esta retomada permanece restrita ao corretivo e às evidências permitidas.


## Limpeza autorizada e novo typecheck — 18/10/2026

O usuário autorizou exclusivamente os dois diretórios .next solicitados. Ambos foram reconferidos imediatamente antes da remoção: caminhos absolutos iguais aos autorizados, sem reparse points nos ancestrais/descendentes e sem consumidores visíveis. Remoção por Remove-Item -LiteralPath, sem outros arquivos excluídos. Aumento líquido físico medido no C: **4.334.067.712 bytes (4,036 GiB)**; livre ao fim: **15.016.374.272 bytes (13,985 GiB)**. Variação concorrente do volume explica a diferença para a soma das medições individuais. Detalhes: [DISK_CLEANUP_AUTHORIZED_2026-10-18.json](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/DISK_CLEANUP_AUTHORIZED_2026-10-18.json).

Nova execução oficial sobre `c16165b1e361684944c81a8d4ff408f7c6fedf33`: npm ci e Prisma generate concluídos; reserva após instalação **13.421.813.760 bytes (12,500 GiB), PASS**, com mínimo de 12 GiB preservado. Chromium 136.0.7103.25 / Playwright 1.52.0 do lockfile: launch → página vazia → close PASS.

O typecheck canônico foi executado e saiu com código **2**: `frontend.contract.test.ts(655,54)`, TS2322, fixture `documentoId: "doc-stage"` incompatível com o tipo template UUID inferido do backend. O runner saiu com código **1**. Vitest/integração, lint, build/PWA e E2E não iniciaram. Sem skipped/todo contados ficticiamente. O ajuste desta rodada troca apenas os dois usos da mesma fixture por UUID sintético válido; as asserções e o comportamento de cancelamento/retry permanecem.

Cleanup oficial PASS; workspace `omni-pessoas-test-Is6eAx` ausente em verificação separada e porta 55439 livre. Espaço após cleanup: **14.992.912.384 bytes (13,963 GiB)**. A sessão continua na tentativa 1/3, com abertura e histórico preservados; close ainda não executado. É necessária nova execução sobre a fixture corrigida antes de atribuir PASS ao TypeScript ou às etapas seguintes.

Evidência: [RETRY_AFTER_CLEANUP_2026-10-18.json](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/RETRY_AFTER_CLEANUP_2026-10-18.json); saída integral em `runner-after-cleanup-2026-10-18.log`, no mesmo diretório.


## TypeScript aprovado e correção da inscrição sintética — 18/10/2026

Runner oficial no HEAD `290641dff4fc6ce773ad6c66a446c081e1dbffee`: **TypeScript PASS**, Chromium PASS, reserva após instalação de **13.434.957.824 bytes**, invariantes 001A conferidos (10 CHECKs, sete índices, dez triggers e quatro funções), drift zero.

Vitest coletou 162 casos: **142 passaram** (98 de lib/pessoas, 39 do contrato frontend e cinco da integração frontend anterior), **20 não executaram**, zero todo e uma suíte falhou no beforeAll. A fixture P2-01 que adicionei usava dois UUIDs completos de 36 caracteres em inscricao; o contrato real permite até 32. O bootstrap retornou CAMPO_INVALIDO na linha 133, antes dos novos casos. O runner saiu com **1** e recusou o resultado com casos não executados. Isso não representa aprovação da regressão P2-01.

Correção restrita aos dados de teste: remover os hífens dos dois UUIDs de inscrição, produzindo 32 caracteres. Validações de produção e todos os 20 casos permanecem. Foram conferidos também os demais limites de campos e os contratos de vinculação/funcionário usados no setup da nova suíte.

Lint, build/PWA e E2E não iniciaram nesta execução. Cleanup oficial PASS, workspace `omni-pessoas-test-vsmuDA` ausente em verificação separada e porta 55439 livre. Livre após cleanup: **14.969.081.856 bytes (13,941 GiB)**. Nenhuma exclusão adicional; AEP permanece na tentativa 1/3, sem close. Nova bateria necessária no HEAD com a fixture válida.

Detalhes e contagens: [RETRY_AFTER_UUID_FIXTURE_2026-10-18.json](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/RETRY_AFTER_UUID_FIXTURE_2026-10-18.json). Saída integral: `runner-after-uuid-fixture-2026-10-18.log`, no mesmo diretório.


## Resultado do P2-01 e gate PWA da main — 19/10/2026

No HEAD `dab8ce719142f334250c69afe5ed6b6a8cd76e10`, **TypeScript PASS; 162/162 testes PASS; zero falhas, skipped e todo**. São 98 testes de lib/pessoas, 39 de contrato frontend e 25 de integração frontend (os cinco anteriores e os 20 novos do P2-01). Foram comprovados intent/complete/list/download e replay em loja-1, loja-2, Store QA longa e limites de 1/100 caracteres; IDs inválidos, namespace e isolamento entre Stores com memberships/grants válidos. Banco PostgreSQL descartável: invariantes 001A conferidos e drift zero.

**Primeiro build PASS, com MIGRATION_SKIPPED.** O aceite PWA falhou: `SW importa script inesperado — 1 !== 0`. O SW gerado importa `/client-privacy-cache.js`, já declarado pela main em next.config.mjs:58, introduzido pelo commit `ae8793259df48b1cfa27d3e87bd5cfa74da95c13`. Os dois arquivos globais estão idênticos em HEAD e origin/main. O inspetor antigo exige importScripts sem argumentos e está fora da allowlist vigente. Não foi alterado nem contornado; as provas posteriores de PWA não executaram.

O ESLint focado executou independentemente e retornou um erro e um warning: react/no-children-prop no teste React e react-hooks/exhaustive-deps em Documentos. Foram aplicadas correções mínimas nos caminhos já autorizados: children como argumento de createElement, com cloneElement para injetar as actions tipadas; e resource como dependência do efeito que o captura. useResource já retorna objeto e reload novos em cada render, preservando o padrão de disparo e os guards de retomada/cancelamento. **Esses ajustes posteriores ao HEAD acima ainda não foram reexecutados; nenhum PASS de lint ou do último diff é presumido.** Nenhuma asserção foi removida.

O runner oficial saiu com **1** por PWA/lint. A repetição de build prevista pelo runner, lint global e E2E ON/OFF não iniciaram. Cleanup oficial PASS; workspace omni-pessoas-test-bM5hfD removido, porta 55439 livre e os processos do build encerrados. Última medição de C: durante o fechamento das evidências: aproximadamente **12,615 GiB**; medir novamente antes de outra instalação e manter a reserva original. Nenhuma exclusão além dos dois diretórios .next expressamente autorizados.

**Gate humano concreto:** incluir formalmente `scripts/pessoas/inspect-pwa-build.mjs` e definir atualização oficial compatível da sessão, sem edição manual do marcador ou alteração do core nesta execução. Proposta revisável: [PWA_SCOPE_GATE_2026-10-19.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/PWA_SCOPE_GATE_2026-10-19.md). Resultado estruturado: [FINAL_STATUS_2026-10-19.json](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FINAL_STATUS_2026-10-19.json). Saída integral da execução iniciada em 18/10: runner-after-fixture-setup-2026-10-18.log.

Autorrevisão Codex da correção/integração e dos ajustes mínimos: sem novos achados estáticos P0/P1/P2 de produto; **aceite técnico bloqueado**, com revalidação do último diff pendente. INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION, SELF_REVIEW=CODEX e HUMAN_MERGE_AUTHORIZATION=PENDING. Condição da dispensa ainda não satisfeita; não se trata de revisão independente. Smokes QA reais de 15–16/10 reaproveitados com seus limites, sem repetição.

AEP mantém tentativa **1/3**, opened_at **2026-10-12T23:27:06.181Z**, attempts_log vazio e proveniência do refresh. Item 8 preservado, verify --all PASS; GOAL, ledger, state, REGISTRY e GATES não foram editados manualmente. Close não executado porque os gates não passaram. PR #273 permanece draft; sem merge, ativação produtiva, dados reais, Docker ou GOAL 002. CURRENT_STATUS/CHANGELOG/memória global não foram alterados nesta missão restrita.


## Sincronização final e bloqueio de infraestrutura — 19/10/2026

PR #273 atualizada pelo GitHub Update Branch com expected_head_sha e merge, seguida de fast-forward para 8648954a4c9d8fddc73b46697d167b1a33f5cf5d, integrando a PR #287 e main 13700862405a89da3c7d16702318735a88348133. O open oficial atualizou somente base_commit; tentativa 1/3, allowlist e histórico/proveniência preservados. Inspetor: 25/25 PASS, zero skipped/todo; verify --all e diff --check PASS. Os dois ajustes de lint foram confirmados no diff, mas não revalidados pelo lint canônico.

O close oficial executou o runner e abortou exclusivamente no item 10: exit 5 por reserva de disco abaixo de 12 GiB em C:, antes da instalação. Item 8 PASS. Nenhum DONE ratificado, sessão intacta. Typecheck/integração/lint/builds/PWA completo/E2E ON/OFF/visual do HEAD integrado permanecem não executados. Cleanup confirmado e porta 55439 livre. Nenhum workspace temporário próprio remanescente; D: indisponível e G: sem espaço. Resultados antigos permanecem históricos. PR segue draft, sem merge/produção.

Medidas, autorrevisão e próxima ação: [CLOSE_BLOCKED_DISK_2026-10-19.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/CLOSE_BLOCKED_DISK_2026-10-19.md) e [JSON](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/CLOSE_BLOCKED_DISK_2026-10-19.json).


## Execução de 22/10/2026 — disco suficiente, E2E e teto AEP

C: iniciou com 45,744 GiB; não foi necessária limpeza de caches existentes. No HEAD 9acf18758f4db32aed2cb7ac79d64baed244dda5, TypeScript, 162/162 regressões, lint focado, dois builds/MIGRATION_SKIPPED e duas inspeções PWA passaram. Lint global diagnóstico exit 1. E2E ON falhou no seletor de Store (scripts/pessoas/frontend.e2e.ts:32, esperado 1 cartão, recebido 0); OFF e matriz visual não executaram. O close abortou no item 10, com item 8 PASS.

Os dois corretivos locais tratam cwd do webServer e seleção semântica de Store; o último ainda falha no navegador real. As tentativas foram registradas pela CLI, sem reinício da sessão. Teto 3/3 atingido; registrar a falha final e aguardar decisão humana de retomada, sem quarta tentativa automática, produção, merge, GOAL novo ou GOAL 002. Sem push.

[Evidência e limites](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FINAL_BLOCKED_2026-10-22.md) · [Resultado estruturado](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FINAL_BLOCKED_2026-10-22.json).
