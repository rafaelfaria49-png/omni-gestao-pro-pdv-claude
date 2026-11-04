<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-FRONTEND-001B-RECOVERY-002",
  "track": "pessoas",
  "title": "Concluir o frontend Pessoas 001B preservado e validar a recuperação",
  "status": "BLOCKED",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pessoas-001b-recovery-002",
  "worktree": "C:/Projetos/omni-gestao-pessoas-001b-recovery-002",
  "test_command": "node scripts/pessoas/run-frontend-tests.mjs",
  "allowlist": [
    "app/api/pessoas/disponibilidade/route.ts",
    "app/dashboard/pessoas/configuracoes/page.tsx",
    "app/dashboard/pessoas/error.tsx",
    "app/dashboard/pessoas/funcionarios/**",
    "app/dashboard/pessoas/layout.tsx",
    "app/dashboard/pessoas/loading.tsx",
    "app/dashboard/pessoas/page.tsx",
    "components/dashboard/pessoas/campos.ts",
    "components/dashboard/pessoas/configuracoes.tsx",
    "components/dashboard/pessoas/contexto.tsx",
    "components/dashboard/pessoas/documentos.tsx",
    "components/dashboard/pessoas/ficha.tsx",
    "components/dashboard/pessoas/lista.tsx",
    "components/dashboard/pessoas/novo.tsx",
    "components/dashboard/pessoas/ui.tsx",
    "components/dashboard/pessoas/use-disponibilidade.ts",
    "components/painel-inicial/MobileNavSheet.tsx",
    "components/painel-inicial/Sidebar.tsx",
    "lib/navigation/dashboard-nav-items.ts",
    "lib/auth/page-access.ts",
    "lib/auth/page-access.test.ts",
    "lib/auth/proxy-enterprise-dashboard.ts",
    "lib/auth/proxy-enterprise-dashboard.test.ts",
    "lib/pessoas/adapters/cadastro-ui.ts",
    "lib/pessoas/cadastro.ts",
    "lib/pessoas/documentos/service.ts",
    "lib/pessoas/historico-privacidade.test.ts",
    "lib/pessoas/readers/disponibilidade.ts",
    "scripts/pessoas/frontend.contract.test.ts",
    "scripts/pessoas/frontend.e2e.ts",
    "scripts/pessoas/frontend.integration.test.ts",
    "scripts/pessoas/playwright.frontend.config.ts",
    "scripts/pessoas/run-frontend-tests.mjs",
    "scripts/pessoas/run-official-tests.mjs",
    "docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_002.md",
    "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002/**",
    "docs/execution-tracks/pessoas/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-002.md",
    "docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-002.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-a1.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-a2.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-a3.md",
    "docs/execution-tracks/pessoas/LEDGER.jsonl",
    "docs/execution-tracks/pessoas/state.json",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md"
  ],
  "gates_liberados": [],
  "read_budget": 85,
  "plan_ref": "OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15",
  "plan_rev": 9,
  "familia_executor": "openai",
  "revisao_independente": true,
  "preferencia_humana_revisao": {
    "SELF_REVIEW": "CODEX",
    "tipo": "SELF_REVIEW_NOT_INDEPENDENT",
    "decisao_formal_sucessor": "WAIVED_BY_HUMAN_DECISION_CONDITIONAL",
    "dispensa_da_pr_273_herdada": false,
    "fonte": "Missao humana Recovery 002 completo, 2026-10-25"
  },
  "dispensa_humana_revisao": {
    "INDEPENDENT_REVIEW": "WAIVED_BY_HUMAN_DECISION",
    "SELF_REVIEW": "CODEX",
    "tipo": "SELF_REVIEW_NOT_INDEPENDENT",
    "HUMAN_MERGE_AUTHORIZATION": "PENDING",
    "condicao_satisfeita": false,
    "condicao": "Autorrevisao Codex do HEAD final sem bloqueadores, testes completos e regularizacao do gate AEP. Cumprimento futuro comprovado nas evidencias do sucessor, sem editar o GOAL durante a execucao.",
    "authorization_id": "HUMAN-RECOVERY-002-2026-10-25",
    "fonte": "Mensagem direta do usuario: GOAL PESSOAS-DP-FRONTEND-001B-RECOVERY-002, AUTORIZACAO HUMANA de 25/10/2026. Dispensa especifica deste sucessor, sem herdar a da PR #273."
  },
  "autorizacao_humana_execucao": {
    "aprovado": true,
    "authorization_id": "HUMAN-RECOVERY-002-2026-10-25",
    "condicao_previa": "Merge humano da PR documental da revisao 9 e rito oficial AEP de retomada cumulativa aprovado e integrado; preservar BLOCKED 1/3 e continuar somente em abertura legitima, sem reset de tentativas.",
    "auth_scope": "Escopo da revisao 8 preservado; autorizacao humana de 28/10/2026 acrescenta exclusivamente lib/auth/proxy-enterprise-dashboard.ts para reconhecer /dashboard/pessoas e subrotas delimitadas somente depois de canAccessPage aprovar. Guards DP e cookie/Store preservados; sem liberar Unidades nem elevar STORE a PLATFORM.",
    "commit_push_functional_pr": true,
    "merge_automatico": false
  },
  "autorizacao_humana_consumer": {
    "authorization_id": "HUMAN-RECOVERY-002-AUTH-CONSUMER-2026-10-28",
    "fonte": "Mensagem direta do usuario: REGULARIZAR AUTH CONSUMER E RETOMADA AEP, AUTORIZACAO HUMANA de 28/10/2026",
    "path_adicional_exclusivo": "lib/auth/proxy-enterprise-dashboard.ts",
    "condicao": "Patch somente depois do merge humano do planejamento e abertura AEP legitima; G-AEP-CORE nao autorizado por esta decisao."
  },
  "retomada_aep": {
    "status": "BLOCKED_PENDING_OFFICIAL_RITE",
    "source_commit": "8bb2cb9019df2620d7ee7edfbf268b6ae2982be3",
    "blocked_commit": "437abb4d4dc523865710cabf8a281f43dfda1fd9",
    "reconciliation_commit": "bc9275307fff9df390c0ef02b1fb6e8d4ff55057",
    "historical_attempt": 1,
    "historical_previous_attempts": [],
    "max_attempts": 3,
    "next_corrective_attempt_required": 2,
    "current_cli_supported": false,
    "G_AEP_CORE": "REQUESTED_NOT_AUTHORIZED",
    "nota": "Metadados documentais, nao consumidos pela CLI e sem efeito sobre marcador ou contagem. Plano permanece BLOCKED, sem READY e sem tentativa nova."
  },
  "autorizacao_humana_qa": {
    "authorization_id": "HUMAN-RECOVERY-002-2026-10-25",
    "neon_project": "orange-voice-83394974",
    "neon_branch": "pessoas_001b_qa",
    "r2_bucket": "omni-gestao-pessoas-001b-qa",
    "vercel_project": "omni-gestao-pessoas-001b-qa",
    "preview_privado": true,
    "rotacao_credencial_r2_somente_qa_se_necessaria": true,
    "novos_servicos_pagos": false,
    "producao": false
  },
  "reversibilidade": "git revert do transporte e das correcoes locais; preservar dados cadastrais, versoes, documentos e auditoria. Sem schema, auth.ts, auth.config.ts, proxy.ts ou configuracao produtiva.",
  "gate_humano": {
    "requerido": true,
    "pendente": true,
    "motivo": "HUMAN_MERGE_SCOPE_PLAN_REV_9 e G-AEP-CORE para rito oficial de retomada cumulativa pendentes. CLI atual sem suporte para retomar BLOCKED sem zerar a sessao; manter status BLOCKED. Autorizacoes anteriores de execucao/QA e dispensa externa condicional preservadas, sem novo PASS, close ou merge funcional automatico. Producao nao autorizada."
  }
}
-->

# PESSOAS-DP-FRONTEND-001B-RECOVERY-002

## Mandato e ponto de parada

Concluir a entrega cadastral 001B existente, preservando telas, contratos, correções e testes. O backend 001A e o hardening P2 continuam DONE; frontend original e Recovery 001 continuam BLOCKED. Este é o **mesmo Recovery 002**, agora também BLOCKED por gate na tentativa **1/3**; não é novo GOAL, tentativa zero ou quarta tentativa do Recovery 001.

A revisão 8 entrou na main pela PR #316, merge `745fb55cc65644e2be70bc963c72401ec4352015`, ancestral da main conferida `34b70a15583db7608437f04b3ba7779582f4eeb9`. A execução posterior transportou os 32 arquivos e parou oficialmente em AUTH-CONSUMER-01. A autorização humana de **28/10/2026** permite publicar a origem, reconciliar o BLOCKED e acrescentar exclusivamente `lib/auth/proxy-enterprise-dashboard.ts` à allowlist. Registro: `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/AUTHORIZATION_2026-10-28.md`.

Esta PR documental prepara a **revisão 9** na branch `codex/pessoas-001b-recovery-002-rev9`, worktree `C:/Projetos/omni-gestao/.worktrees/pessoas-001b-recovery-002-rev9`, criada limpa da main acima. Não há sessão AEP ativa. Publicação da implementação preserva os commits existentes, sem incorporá-los à main. PR #273 permanece aberta/draft e os WIPs externos permanecem preservados.

**AEP_RESUMPTION_SUPPORTED=false.** O plano proposto fica em `goals/` com `status: BLOCKED`, sem GOAL elegível: a CLI atual não reconstrói a contagem cumulativa de um bloqueio ratificado. A revisão 8 fechada e o evento literal continuam intocados. Os metadados `retomada_aep` são registro documental, não mecanismo implementado. Relatório e pedido objetivo de G-AEP-CORE: `RECONCILIATION_AND_RESUMPTION_2026-10-28.md` no mesmo subtree de planejamento.

**NEXT_GATE=HUMAN_MERGE_SCOPE_PLAN_REV_9_AND_AUTHORIZE_G_AEP_CORE_OFFICIAL_RESUMPTION.** Merge do plano sozinho não autoriza `open` nem resolve a limitação do núcleo. Não executar `open`, `attempt`, `check`, `block`, `close`, patch ou testes de produto nesta fase. Não editar/remover/criar manualmente marcador, ledger ou núcleo. Após autorização específica, implementação e ratificação humana do rito oficial, integrar legitimamente o plano e o mecanismo à branch original antes da abertura. Dispensa condicional, QA e decisão humana de merge funcional permanecem exigidos. Folha/holerites, GOAL funcional 002 e produção continuam fora do recorte.

## Histórico preservado — Recovery 001

| Referência | Valor conferido |
| --- | --- |
| Branch/worktree original | `goal/pessoas-001b-recovery-001` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-001` |
| HEAD local e remoto após push normal | `7a6df145e68bfea7eac14bf057a0904bb985dc02` |
| HEAD remoto antes do push | `8648954a4c9d8fddc73b46697d167b1a33f5cf5d` |
| Referência local de preservação | `refs/tags/preserve/pessoas-001b-recovery-001-2026-10-23` → `7a6df145e68bfea7eac14bf057a0904bb985dc02` |
| Ratificação oficial BLOCKED 3/3 | `37c5d5880c09d45a22f5ba697f95327be5e66e68`, ancestral do HEAD preservado |
| Reconciliação oficial na branch deste plano | `ca73bdc3d99dac983e9fec5a9bf7ef89cffbec56` |
| Relatório gerado pela CLI | `_closed/reports/RECONCILE-BLOCKED-7a6df145e68b.json` |
| PR da implementação bloqueada | [#273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273), aberta/draft; não fazer merge nem marcar ready |

A origem estava limpa, sem `.aep-active`, seis commits à frente do remoto e sem divergência. Os seis commits foram preservados e publicados por fast-forward, sem force/rebase/reset/amend. O comando oficial `reconcile-blocked`, primeiro em dry-run PASS e depois aplicado, anexou literalmente o único evento faltante, incluindo `previous_attempts` 1/2/3, e arquivou integralmente o GOAL da origem. Não abrir novamente esse GOAL nem editar seu histórico.

Estado histórico da revisão 8 antes da execução: dois DONE, dois BLOCKED, cinco linhas de ledger e Recovery 002 READY. A reconciliação do Recovery 001 já integra a main pela PR #305 e não foi repetida. Os eventos e arquivos fechados anteriores permanecem intactos.

## Recovery 002 preservado e reconciliação atual

| Referência | Valor conferido em 28/10/2026 |
| --- | --- |
| Branch/worktree de execução já existente | `goal/pessoas-001b-recovery-002` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-002` |
| SOURCE_SHA local e remoto publicado | `8bb2cb9019df2620d7ee7edfbf268b6ae2982be3` |
| Commit de transporte/diagnóstico | `acd4362eb93bc36cbf2f8bbd2bf8586fba78319a` |
| BLOCKED oficial por gate, 1/3 | `437abb4d4dc523865710cabf8a281f43dfda1fd9` |
| Reconciliação oficial desta origem | `bc9275307fff9df390c0ef02b1fb6e8d4ff55057` |
| Relatório gerado pela CLI | `_closed/reports/RECONCILE-BLOCKED-8bb2cb9019df.json` |

Árvore/índice de execução limpos, três commits sobre a base `34b70a1`, BLOCKED ancestral do HEAD e `.aep-active` ausente. A branch remota não existia; dry-run e push normal criaram a ref no SHA exato, sem force/rebase/reset/amend. Fetch confirmou a origem para o `reconcile-blocked` oficial. Dry-run PASS e aplicação anexaram **um evento literal**, `attempt=1`, `previous_attempts=[]`, com motivo, timestamp e base intactos; GOAL revisão 8 BLOCKED arquivado integralmente. Nenhuma tentativa foi aberta ou consumida nesta missão.

Estado atual derivado: **dois DONE, três BLOCKED, seis linhas de ledger, current_goal=null e next_goal=null**. A proposta revisão 9 permanece BLOCKED; não cria evento novo. O histórico de 1/3 já conta: a próxima tentativa corretiva deverá ser **2/3**, pelo rito oficial ainda pendente, sem fabricar uma falha `attempt --fail` retroativa.

## Transporte já preservado e integração futura

O manifesto da revisão 7 `transport-manifest.json` continua literal, com 32 arquivos funcionais/testes e origem `7a6df145e68bfea7eac14bf057a0904bb985dc02`. A evidência de transporte no SOURCE_SHA registra 29 caminhos diretos e três consumidores de navegação integrados por trechos. Não repetir transporte, reconstruir telas, restaurar diretórios inteiros ou criar outra branch/worktree de produto.

Preservar os três commits na branch original publicada. Após merge humano do plano e ratificação do mecanismo oficial de retomada, fazer fetch e integrar legitimamente a main que contém ambos à branch original, preservando os commits e resolvendo qualquer conflito de GOAL/derivados somente pelo rito oficial. GOAL deve coincidir com HEAD, main e base comum. Não copiar metadados para simular merge, importar estado AEP de outra worktree ou reutilizar `refresh-active`, exclusivo do Recovery 001.

Somente depois de abertura AEP legítima e cumulativa aplicar o patch cirúrgico autorizado. Manter saídas do runner no subtree de execução Recovery 002 e o relatório `docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_002.md`. PASS, imagens e contagens históricas não comprovam o novo HEAD. Qualquer colisão ou divergência no histórico exige parada humana, sem reescrita de eventos.

## Implementação a reutilizar e limites estreitos

Preservar visão geral, lista/busca/filtros, cadastro/rascunho, ficha/edição, contrato versionado, histórico, documentos privados e configuração de empregador/estabelecimento. Manter as Server Actions/APIs/DTOs/guards 001A; sem CRUD paralelo, novos modelos, novo motor trabalhista ou reconstrução da interface.

Manter as correções já concluídas: tipagem das três consultas Testing Library sem `exact`, privacidade de motivos pessoais/contratuais sem `viewRemuneracao`, regressão salarial, Store validada na própria requisição, contexto e respostas tardias, tema Black, contenção local de overflow, foco após releitura, retry documental/F-01, `cwd` explícito do webServer e asserções do cookie de unidade. Revalidar no HEAD novo; não reaplicar correções já presentes sem necessidade.

`lib/pessoas/cadastro.ts` está autorizado somente para transportar/preservar a redação de `listarHistorico` e sua regressão; não alterar o histórico armazenado, versões ou regras de negócio. `lib/pessoas/documentos/service.ts` está autorizado somente para transportar/preservar P2-01 em `refCanonica`: Store aceita `^[A-Za-z0-9_-]{1,100}$`, empregador/documento continuam com mínimo oito e namespace idêntico. Reutilizar a regressão de IDs curtos em `frontend.integration.test.ts`. Defeito novo nesses serviços exige delimitação e replanejamento; não usar os paths como autorização ampla de backend.

A única adição à allowlist da revisão 9 é `lib/auth/proxy-enterprise-dashboard.ts`. Permanecem os paths de auth autorizados na revisão 8: `lib/auth/page-access.ts`, `lib/auth/page-access.test.ts` e `lib/auth/proxy-enterprise-dashboard.test.ts`. O consumidor deve reconhecer exatamente `/dashboard/pessoas` ou prefixo `/dashboard/pessoas/`, somente depois de `canAccessPage` aprovar, antes dos filtros Enterprise por substring. O teste do consumidor já autorizado comprovará passagem e negações, sem novo path de teste. Não criar permissões DP por role legado, módulos Enterprise ou autoridade PLATFORM. A autorização efetiva sobre dados/operações permanece nos guards reais DP de usuário ativo, sessão, membership, Store/empregador/unidade, capacidade, flag e revogação.

Não alterar `auth.ts`, `auth.config.ts`, `proxy.ts`, schema/migrations, política global de módulos, API global de Stores, componentes globais de unidades, AppShell, configuração PWA/deploy, CI ou núcleo AEP para fazer E2E passar. `app/dashboard/layout.tsx` permanece somente para leitura/verificação. A nova edição do consumidor é cirúrgica e exclusivamente a passagem Pessoas já delimitada; preservar `enterpriseStoreCookieRedirect`, Store/cookie guard e guards DP reais. Negar `/dashboard/unidades`, `/dashboard/plataforma`, `/dashboard/financeiro`, `/dashboard/configuracoes` e `/dashboard/pessoas-extra` no cenário STORE sem as permissões correspondentes. Não antecipar a passagem antes de `canAccessPage` nem usar prefixo sem a fronteira `/`. Nenhum outro consumidor é acrescentado. Se outro path protegido for indispensável, registrar arquivo/linha, pré-condição, resposta/DOM observado, impacto e gate necessário e interromper para autorização humana; não ampliar escopo durante a execução.

## Diagnóstico dirigido e primeira prioridade

**E2E_STORE_ROOT_CAUSE=HYPOTHESIS.** A evidência A3 no HEAD testado `9acf18758f4db32aed2cb7ac79d64baed244dda5` prova somente zero cartões para o seletor `getByRole("button").filter({ has: getByText(id, { exact: true }) })`, antes de ativar a Store. Não foram retidos resposta de `/api/stores`, sessão ou snapshot DOM dessa falha; a configuração tinha trace/screenshot/video desativados. O HEAD preservado tem os mesmos 32 blobs funcionais desse HEAD testado.

A fixture cria A/B, usuário `ADMIN` com `lojaId=A` e membership apenas B. Isso é uma assimetria real a eliminar na fixture autorizada futura, criando memberships sintéticos explícitos para A e B e conferindo as concessões DP separadamente. **Não confirma a causa histórica:** no `auth.ts` preservado, ADMIN recebe `storeAccess=all` e não consulta memberships; o filtro de `/api/stores` só restringe sessões `restricted`. A2 chegou a observar o texto de A em dois elementos. Os commits locais corrigiram cwd e ambiguidade do seletor; não alteraram fixture, membership ou autenticação. Não inventar prova retroativa de API/sessão/navegador.

Na main observada a política mudou: novas contas têm `accessScope=STORE`; o JWT releu memberships e priorizou a lista explícita sobre `lojaId`, inclusive para ADMIN sem autoridade de plataforma. Assim a fixture antiga, transportada sem adaptação, pode excluir A no sucessor. Preservar essa política atual; não promover o usuário de teste a PLATFORM/legado para contornar escopo.

**Dependência concreta de integração na main, detectada por leitura estática:** `lib/auth/page-access.ts:12` nega `/dashboard/unidades` para quem não tem `platformAuthority`; `/dashboard/pessoas` e seus filhos não estão mapeados e caem no `return false` da linha 31. `lib/auth/proxy-enterprise-dashboard.ts:18` e `app/dashboard/layout.tsx:18` consomem essa decisão e redirecionam. Acrescentar memberships A/B não resolve essa negação de rota. Isso descreve o código da main `0adec212...`, não uma reprodução da falha histórica.

**Decisões humanas de 25 e 28/10/2026: HUMAN_AUTHORIZE_AUTH_INTEGRATION_SCOPE=AUTHORIZED_RESTRICTED; ALLOWLIST_REPLAN=REV_9_PENDING_HUMAN_MERGE_AND_OFFICIAL_AEP_RESUMPTION.** A revisão 8 já mergeada autorizou page-access e dois testes; a revisão 9 acrescenta somente o consumidor identificado no gate real AUTH-CONSUMER-01. A passagem externa não concede capacidade DP: cada página/action/API continua sujeita aos guards reais do domínio. Preservar negação de sessão inválida, Store não autorizada, flag OFF, grants ausentes/revogados e acesso direto por URL; testar cada camada na camada responsável. Preservar Unidades, Plataforma, Financeiro e demais módulos sem relação. G-AUTH mecânico continua fechado, pois cobre `auth.ts`, `auth.config.ts` e `proxy.ts`, todos excluídos. Se outro consumidor exigir edição ou outro gate for atingido, apresentar evidência e parar; não promover STORE a PLATFORM/ADMIN legado nem enfraquecer asserts.

Seleção de Store: reutilizar o mecanismo canônico de loja ativa, com a lista de Stores autorizadas pela sessão e validação real server-side. A missão permite seletor **local em Pessoas**, se necessário, dentro dos componentes já autorizados; não depender da página administrativa `/dashboard/unidades` nem liberar essa rota. Os testes oficiais devem incluir os dois arquivos auth adicionados, usando o runner existente na allowlist.

Ordem futura obrigatória:

1. Em `frontend.e2e.ts`, criar usuário sintético **accessScope=STORE, sem platformAuthority**, memberships explícitos A/B e grants DP independentes por Store; fazer login pelo formulário real, sem injeção de sessão. Registrar de forma saneada os IDs/role/accessScope/memberships; confirmar sessão válida e `/api/stores` com HTTP 200, A/B e nenhuma Store não concedida. Testar também STORE sem grants, Store não autorizada, flag ON/OFF, sessão inválida, revogação e URL direta. Não registrar senha, token, JWT, cookies de sessão ou dados reais.
2. Correlacionar URL final/redirects, status/IDs da API, estado da tela e controle acessível de seleção de Store no navegador. Preservar diagnóstico saneado também em falha, antes do finally apagar recursos. Só afirmar causa confirmada quando sessão, API e DOM da mesma execução sustentarem a explicação. Ajustar fixture/seletor por evidência; não usar `.first()`, sleeps arbitrários, mock da API ou enfraquecer `toHaveCount(1)`.
3. Selecionar Store pelo controle acessível do fluxo canônico permitido (ou seletor local Pessoas), com ID exato e sem ambiguidade, inclusive por teclado. Conferir `assistec-active-store` após login e trocas A→B→A, releitura e isolamento efetivo das operações DP. Não injetar cookie para substituir o fluxo do produto. Cookie sozinho não comprova autorização DP.
4. Executar E2E ON/OFF completos com runner oficial, processos separados, dados sintéticos e relatórios de ambos; concluir a matriz visual/acessibilidade, corrigindo somente regressões concretas na allowlist.
5. Atender revisão/preview e demais gates, executar fechamento oficial deste sucessor e conferir cleanup. Não chamar `close` para tentar ratificar uma aceitação visual, revisão ou prova R2 ainda pendente.

## AUTH-CONSUMER-01 — evidência e correção futura autorizada

No SOURCE_SHA publicado, o diagnóstico real de funções puras aprovou `canAccessPage` para `/dashboard/pessoas/configuracoes`, mas `enterpriseDashboardRedirect` redirecionou para `/dashboard?access=denied` pelo filtro `pathname.includes("configuracoes")` (linhas 105–106 do consumidor). Sessão sintética STORE/OPERADOR, sem autoridade de plataforma e sem Configurações Enterprise. Fontes imutáveis: `GATE_AUTH_CONSUMER_2026-10-28.md`, `auth-consumer-diagnostic.json` e `PROPOSED_AUTH_CONSUMER.patch` no subtree de execução do SOURCE_SHA. Não é E2E nem prova da causa histórica A3; nenhuma nova execução desse diagnóstico nesta PR.

Após regularização, o teste `lib/auth/proxy-enterprise-dashboard.test.ts` deve provar raiz Pessoas, filhos (incluindo configuracoes), negação quando `canAccessPage` negar, as cinco rotas negativas acima e cookie/Store guard. Dados e operações continuam submetidos aos guards DP atuais; autorização de rota não cria capacidades DP. O patch proposto permanece somente evidência na branch publicada, sem aplicação nesta missão. A bateria, preflight, QA e demais critérios abaixo continuam integrais.

## Validação técnica e aceite futuro

Histórico reutilizável, sem novo PASS: 162/162 testes, typecheck, integração PostgreSQL, lint focado, dois builds e duas inspeções PWA passaram no HEAD A3; E2E ON falhou, OFF não executou e matriz visual/acessibilidade ficou pendente. O lint global saiu 1 como diagnóstico do runner, não PASS; reclassificar qualquer achado novo no HEAD futuro. Disco teve 39,374 GiB livres após cleanup histórico; isso não dispensa novas medições. Nenhuma limpeza adicional é autorizada pelo plano.

Runner obrigatório: `node scripts/pessoas/run-frontend-tests.mjs`, delegando a `run-official-tests.mjs`. Não criar runner alternativo, reduzir testes/asserts, ignorar erro, aumentar tentativas AEP, omitir suíte ou baixar guard para obter PASS.

Preflight obrigatório: Node 24 compatível com o runner/lockfile, npm/versões/SO registrados, HEAD por git archive, instalação limpa/Prisma no workspace temporário externo e ambiente sanitizado sem `.env` da worktree. Typecheck canônico com heap adequado antes das suítes/build/E2E. Exigir 12 GiB livres por volume no mínimo, medindo antes/depois da instalação e antes do build e ampliando a reserva pelo consumo observado. PostgreSQL descartável exclusivo em loopback, binários/porta/guard conferidos e smoke Chromium launch→close. Falha de infraestrutura é falha, nunca skip/PASS.

| Prova obrigatória | Critério de aceite |
| --- | --- |
| Regressão 001A/P2/frontend | Toda suíte `lib/pessoas`, `frontend.contract.test.ts` e `frontend.integration.test.ts` coletada e executada; PostgreSQL real descartável, baseline/invariantes/índices/triggers/drift/retry/PII. Preservar os casos existentes, inclusive IDs curtos; zero skipped/todo/only/flaky. |
| Persistência e concorrência | Criar→salvar→reload→localizar→editar→versionar→reload do histórico; DB confirma IDs/versões. ALTERACAO/CORRECAO, expectedVersion, replay idêntico e payload conflitante, duas sessões e respostas tardias. |
| Isolamento e privacidade | Usuário ativo, Store/empregador/unidade e grants próprios DP; bootstrap autorizado, capacidades combinadas, IDs adulterados, revogação e troca de contexto. Sem salário/motivos em DTO/DOM sem capacidade, sem PII/bytes/intents/URLs assinadas em storage/logs/cache. Pessoas não herda permissões do Financeiro/Enterprise. |
| Login/Stores/cookie | Sessão real e API correlacionadas ao DOM; memberships sintéticos coerentes; controle de seleção único e cookie de unidade ativa após A→B→A, com negação de acesso cruzado efetiva. |
| E2E ON/OFF | Loopback/porta exclusiva, `cwd` correto, `reuseExistingServer=false`, workers=1, retries=0, forbidOnly=true; flag somente nos processos sintéticos separados. JSON dos dois modos com contagem positiva e zero inesperados/skipped/flaky. ON percorre entrega; OFF oculta navegação e nega URL/endpoint sem dados e com no-store. |
| Documentos | Preservar e reexecutar as **20 regressões documentais** existentes, intent→PUT com headers obrigatórios→complete→list/retry/F-01/download e serviço real+PostgreSQL. UI mostra indisponibilidade honesta no ambiente local sem storage. Mock/armazenamento controlado não comprova bytes R2. |
| Navegação e matriz visual | Desktop normal/focus recolhido/expandido e drawer mobile; Financeiro→Pessoas→Contador, prefetch=false. Quatro temas Light/Soft Ice/Midnight/Black (classe black-edition), cada um em 1440×900, 390×844 e 360×800. Visão geral, lista/filtros, cadastro, ficha/edição/histórico, documentos e setup, além de loading/vazio/erro/negado/OFF/conflito. Registrar grade de cobertura com captura saneada por combinação e inspeção visual; screenshot parcial não conclui a matriz. |
| Acessibilidade | Tab/Shift+Tab, Enter/Escape, labels/erros associados, foco no primeiro erro/resultado, dialog/drawer e retorno de foco, contraste, toque e reduced-motion. Sem overflow horizontal/sobreposição; tokens semânticos, min-w-0 e AppShell como único scroll owner. |
| Build/PWA/tipos/lint | Typecheck antecipado, lint focado --max-warnings=0, diagnóstico global explicado, dois builds reais com MIGRATION_SKIPPED e inspeções PWA novas. NetworkOnly Pessoas em HTML/RSC/prefetch/workers, sem enfraquecer a proteção de outros módulos. |
| Evidência/cleanup | HEAD/base/etapas/exits/contagens/cobertura registrados; encerrar browser/servidor/cluster e conferir portas. Copiar somente evidência sintética saneada para o subtree do sucessor; remover apenas temporários próprios após conferir limites absolutos. Cleanup incompleto falha. |

## Revisão, preview e entrega

- Classe C3, risco ALTO, família executora openai e requisito padrão `revisao_independente=true` preservados, com **exceção humana específica e condicional deste sucessor** no META. Nenhum gate de caminho liberado: G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CI, G-CONFIG-DEPLOY e G-AEP-CORE continuam fechados. As autorizações restritas de `page-access.ts` e do consumidor Pessoas não alteram a política global nem abrem esses gates. G-AEP-CORE foi solicitado para o rito de retomada e permanece NÃO AUTORIZADO.
- A integração auth/rotas mantém o recorte da revisão 8 e a única ampliação da revisão 9. Aplicar o patch somente após merge humano desta revisão e abertura AEP legítima pelo rito cumulativo ratificado. Consumidores fora da allowlist exigem prova sem edição; necessidade de outro path é ponto de parada.
- **Decisão formal do sucessor em 25/10/2026: INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION; SELF_REVIEW=CODEX; HUMAN_MERGE_AUTHORIZATION=PENDING.** A dispensa é nova, exclusiva deste GOAL; não herda a de 18/10 da PR #273 nem modifica governança global. Exige autorrevisão integral do diff final com cobertura/achados/SHA, sem bloqueadores, testes completos e regularização do gate AEP. Autorrevisão é **SELF_REVIEW_NOT_INDEPENDENT**, nunca R executada. `condicao_satisfeita=false` registra que as condições ainda não foram demonstradas no planejamento; comprovar seu cumprimento nas novas evidências antes do close, sem editar META/GOAL na execução. Não solicitar outra IA autonomamente.
- QA privado autorizado: reutilizar somente Neon `pessoas_001b_qa`, projeto `orange-voice-83394974`; bucket R2 privado `omni-gestao-pessoas-001b-qa`; projeto Vercel `omni-gestao-pessoas-001b-qa`. Não contratar serviços adicionais pagos. Conferir o token R2 com expiração informada em **23/10/2026**; se inválido, renovar/rotacionar somente credencial QA limitada ao bucket. Manter bucket privado; não tocar bucket Contador produtivo, DNS ou produção. Não copiar `.env` da origem nem registrar segredos, cookies ou URLs assinadas.
- Implantar o HEAD funcional em **Preview privado**, com `PESSOAS_DP_ENABLED=on` somente no QA, e validar cadastro, reload, contrato, histórico, upload-intent→PUT exclusivo→complete→list/reload→download de bytes reais, integridade por hash e isolamento A/B/empregador/capacidade. Registrar URL privada real e evidências saneadas vinculadas ao novo HEAD. Smokes de 15/16 de outubro e quaisquer outros PASS históricos não substituem esta prova. Sem prova, o gate continua pendente; PASS local sozinho não conclui o GOAL.
- Depois de todas as provas e gates, `verify --all`, `git diff --check` e `close pessoas` oficiais, preservando o BLOCKED 1/3 e respeitando a continuação corretiva 2/3–3/3 deste mesmo GOAL, pelo rito oficial ainda não implementado, e seu veredito de contexto. Ledger/state/REGISTRY/GATES apenas pela CLI; GOAL/meta não são alterados na execução para forçar fechamento.
- Commit/push normais na branch de execução e PR funcional exclusiva para main foram autorizados em 25/10/2026, após validação/fechamento completos. Merge de qualquer PR continua humano. PR #273 permanece aberta/draft e sem merge. Não habilitar Pessoas em produção, fazer deploy produtivo, usar dados reais ou iniciar a folha/GOAL funcional 002.

## Conferência deste planejamento

Reconciliação oficial já concluída, sem produto, seguida de proposta para este mesmo GOAL com `plan_rev=9` e `status=BLOCKED`. Preservar literalmente o evento e GOAL revisão 8 fechados, os predecessores, manifesto, testes, classe/risco, QA, dispensa condicional e contratos. Única inclusão na allowlist: `lib/auth/proxy-enterprise-dashboard.ts`; nenhum gate liberado. TRACK e registro da autorização descrevem o estado real e o pedido de rito oficial.

Executar `registry`, `verify --all` e `git diff --check`; conferir dois DONE/três BLOCKED/seis eventos, nenhum READY, nenhum marcador e nenhum novo evento de tentativa. Derivados somente pela CLI; staging por caminhos explícitos; commit/push normais e uma única PR documental para main. Typecheck/build/E2E não se aplicam à documentação; testes de produto continuam pendentes.

Ponto de parada: **REVISÃO 9 DOCUMENTADA PARA MERGE HUMANO, COM GATE G-AEP-CORE OBJETIVO PARA RETOMADA CUMULATIVA**. Solicitar autorização restrita ao mecanismo oficial antes de qualquer alteração de núcleo. Merge do plano não autoriza abertura pela CLI atual. Não fabricar comando nem sessão; a próxima ação depende de decisão humana sobre esse gate. Próximo GOAL funcional, fora da missão: **PESSOAS-002 — FOLHA MENSAL CALCULÁVEL**.
