# Pessoas 001B — recuperação de código, validação pendente

Recuperação inicial: 12/10/2026. Adendo corretivo R1–R5: 13/10/2026. GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.

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
