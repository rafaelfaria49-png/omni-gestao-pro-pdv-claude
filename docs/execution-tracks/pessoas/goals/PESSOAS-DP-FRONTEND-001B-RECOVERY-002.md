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
  "plan_rev": 10,
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
    "condicao_previa": "Merge humano da PR documental da revisao 10; integrar legitimamente plano, reconciliacao 2/3 e mecanismo oficial na branch/worktree originais. Retomada 3/3 somente por resume-blocked, em missao posterior expressamente autorizada. Esta preparacao nao executa nem autoriza a aplicacao de resume-blocked 3/3.",
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
    "source_commit": "efd34ae4f0f575408975ed7f9776bacbb62adc04",
    "blocked_commit": "efd34ae4f0f575408975ed7f9776bacbb62adc04",
    "reconciliation_commit": "8f57f0433ea4773e75aced9bd376b23d5011a225",
    "historical_attempt": 2,
    "historical_previous_attempts": [],
    "max_attempts": 3,
    "next_corrective_attempt_required": 3,
    "current_cli_supported": false,
    "G_AEP_CORE": "REQUESTED_NOT_AUTHORIZED",
    "nota": "source_commit/blocked_commit/reconciliation_commit e contagem correspondem ao BLOCKED 2/3 real. previous_attempts=[] e literal; os eventos 1/3 e 2/3 nao sao falhas attempt --fail. Campos current_cli_supported=false e G_AEP_CORE=REQUESTED_NOT_AUTHORIZED preservam a evidencia da epoca da revisao 9. O rito oficial foi integrado depois na main aaab275 pela PR #321; nenhum nucleo e alterado nesta missao. Estado continua BLOCKED e proxima corretiva 3/3 depende de merge humano e retomada oficial posterior.",
    "historical_archive_r8": "docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-002.md",
    "historical_archive_r9_a2": "docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-r9-a2.md",
    "historical_archive_transport_commit": "0917a253febb0c0f43ca480037d0bc9ffb38b7e7"
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
    "motivo": "HUMAN_MERGE_SCOPE_PLAN_REV_10 pendente. Preservar BLOCKED 1/3 e 2/3 e os dois arquivos historicos. Node 24 isolado, reserva de disco e integridade historica sao pre-condicoes para a tentativa final. Nao executar resume-blocked 3/3 nesta missao; depois do merge humano, exigir autorizacao expressa e rito oficial na origem. Allowlist, QA e dispensa externa condicional preservadas; sem merge funcional automatico ou producao."
  },
  "preflight_final": {
    "evidence": "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/PREFLIGHT_FINAL_2026-10-29.json",
    "history_manifest": "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/HISTORY_MANIFEST_2026-10-29.json",
    "node_24": "READY_EXISTING_RUNTIME_SESSION_ONLY",
    "disk": "PENDING_HUMAN_CLEANUP_AND_STABILITY_MEASUREMENT",
    "history": "TWO_LITERAL_BLOCKED_EVENTS_AND_BOTH_CLOSED_ARCHIVES_PRESERVED",
    "attempt_3": "NOT_STARTED_PENDING_HUMAN_MERGE_AND_LATER_OFFICIAL_RESUMPTION"
  }
}
-->

# PESSOAS-DP-FRONTEND-001B-RECOVERY-002

## Mandato e ponto de parada

Concluir a preparação do **mesmo Recovery 002**, preservando o frontend 001B, a correção auth e seus 39 testes focados. Backend 001A e hardening P2 continuam DONE; os predecessores continuam BLOCKED. Recovery 002 está **BLOCKED na tentativa 2/3**; a próxima corretiva cumulativa será **3/3**. Não criar Recovery 003 nem reiniciar contagem.

Esta é a **revisão 10**, na branch documental `codex/pessoas-001b-recovery-002-rev10`, worktree `C:/Projetos/omni-gestao/.worktrees/pessoas-001b-recovery-002-rev10`, criada da main verificada `aaab27505a03903d9fb8333baef5b52424821093`. A origem permanece `goal/pessoas-001b-recovery-002` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-002`, sem marcador. A autorização humana desta missão limita-se a pré-flight, preservação, reconciliação 2/3 e planejamento; a terceira tentativa não foi aberta.

**AEP_RESUMPTION_SUPPORTED=true na main aaab275**, após merge humano da PR #321 (implementação `b590b6bc7661abef11179f34a9c042663f8de22e`). A retomada oficial 2/3 já foi realizada na origem e terminou no BLOCKED de infraestrutura. Os campos legados `current_cli_supported` e `G_AEP_CORE` no META registram a época da revisão 9 e permanecem preservados. Nenhuma nova alteração do núcleo AEP foi necessária nesta preparação.

**NEXT_GATE=HUMAN_MERGE_SCOPE_PLAN_REV_10.** Após o merge humano, integrar legitimamente main/plano/histórico na origem, conferir Node 24, disco e hashes e executar o rito oficial somente em missão posterior expressamente autorizada. Não utilizar `open`, fabricar falhas, editar `.aep-active`, ledger ou derivados. Não executar `resume-blocked` 3/3, runner, QA ou `close` nesta missão. PR #273 e WIPs externos preservados; merge funcional, produção e folha/GOAL funcional 002 permanecem fora desta preparação.

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

## Recovery 002 — histórico 1/3 e 2/3 preservado

| Referência | Valor conferido em 29/10/2026 |
| --- | --- |
| SOURCE_HEAD local e remoto após push normal | `efd34ae4f0f575408975ed7f9776bacbb62adc04` |
| Remoto anterior, ancestral da origem | `8bb2cb9019df2620d7ee7edfbf268b6ae2982be3`; dez commits publicados por fast-forward |
| BLOCKED oficial 1/3 | `437abb4d4dc523865710cabf8a281f43dfda1fd9`; reconciliação `bc9275307fff9df390c0ef02b1fb6e8d4ff55057` |
| Auth corrigido e 39 testes focados preservados | `bb573fdf9a892c870cdc5d238c1cc8395b4cb9b5` |
| BLOCKED oficial 2/3, pai único | `efd34ae4f0f575408975ed7f9776bacbb62adc04`; pai `29afd1007ff83cd5ca40b67ede547b34dbaef6ec` |
| Transporte literal do arquivo r9-a2 antes da CLI | `0917a253febb0c0f43ca480037d0bc9ffb38b7e7` |
| Reconciliação oficial 2/3 | `8f57f0433ea4773e75aced9bd376b23d5011a225` |
| Relatório oficial 2/3 | `_closed/reports/RECONCILE-BLOCKED-efd34ae4f0f5.json` |

O ledger da main era prefixo literal da origem; o commit BLOCKED acrescentou exatamente um evento. Dry-run oficial PASS antes e depois do transporte, aplicação PASS, **um evento literal anexado**, sem duplicação. Recovery 002 conserva exatamente dois BLOCKED, tentativas **1/3 e 2/3**, ambos com `previous_attempts=[]`. Esse array contém somente falhas reais registradas por `attempt --fail`; não inserir bloqueios históricos como falhas artificiais. Sete linhas totais; projeção por GOAL: dois DONE/três BLOCKED, `current_goal=null`, `next_goal=null`. Revisão 10 permanece BLOCKED, sem evento de abertura ou terceira tentativa.

Arquivos fechados preservados integralmente:

| Arquivo em `_closed/goals/` | Blob Git | SHA-256 do blob |
| --- | --- | --- |
| `PESSOAS-DP-FRONTEND-001B-RECOVERY-002.md` — revisão 8 | `95807306788d58ec842dd992edf2df2ab9932622` | `b8f51cdd9446a52eae07cb8b3f9aed030917c3ab015c9921c8d7558e4224f41b` |
| `PESSOAS-DP-FRONTEND-001B-RECOVERY-002-r9-a2.md` — revisão 9, tentativa 2 | `b86c8a26afcf4be481f74fb5c0c088696877db5f` | `c8807aae37811c8ba451e53b9a11c6bb4a124c9921998d559e97ef96d204bc5c` |

A inspeção de `cmdReconcileBlocked` confirmou que a CLI transporta somente `<ID>.md`, sem consultar `goal_archive`. Por isso o arquivo `r9-a2.md` foi transportado antes por `git cat-file blob` → Buffer → escrita exclusiva, sem reescrever bytes, e commitado com manifesto auditável. A CLI oficial anexou o evento e regenerou derivados; nenhum ledger/derivado foi editado manualmente. Hash do evento 2/3 incluindo LF: `4f75060747a106f0a1cd555a303ee26f2dc67ba9144907a43a5c12b58258ec84`. Manifesto e hashes dos 17 artefatos de origem: `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/HISTORY_MANIFEST_2026-10-29.json`. Conversão CRLF local do Git é identificada separadamente; blobs históricos não mudam.

## Transporte já preservado e integração futura

O manifesto da revisão 7 `transport-manifest.json` continua literal, com 32 arquivos funcionais/testes e origem `7a6df145e68bfea7eac14bf057a0904bb985dc02`. A evidência de transporte no SOURCE_SHA registra 29 caminhos diretos e três consumidores de navegação integrados por trechos. Não repetir transporte, reconstruir telas, restaurar diretórios inteiros ou criar outra branch/worktree de produto.

Preservar todos os commits na branch original publicada. Após merge humano da revisão 10, com o mecanismo oficial já ratificado, fazer fetch e integrar legitimamente a main que contém ambos à branch original, preservando os commits e resolvendo qualquer conflito de GOAL/derivados somente pelo rito oficial. GOAL deve coincidir com HEAD, main e base comum. Não copiar metadados para simular merge, importar estado AEP de outra worktree ou reutilizar `refresh-active`, exclusivo do Recovery 001.

Na integração futura, conferir separadamente o GOAL quente revisão 10, o arquivo legado revisão 8 e o arquivo fechado `r9-a2.md`. O detector de renames do Git pode aplicar a revisão nova ao arquivo fechado mesmo sem conflito textual, como já ocorreu na integração anterior. Antes do commit de merge, cada caminho deve coincidir com seu blob canônico aprovado na main; preservar ambos os arquivos fechados e o ledger literal. Essa conferência pertence à integração Git legítima e não permite editar eventos, derivados ou o núcleo AEP.

A correção cirúrgica auth já está no commit bb573fdf9a892c870cdc5d238c1cc8395b4cb9b5; preservá-la. Somente depois de retomada oficial 3/3 posterior continuar as correções restantes e a validação. Manter saídas do runner no subtree de execução Recovery 002 e o relatório `docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_002.md`. PASS, imagens e contagens históricas não comprovam o novo HEAD. Qualquer colisão ou divergência no histórico exige parada humana, sem reescrita de eventos.

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

**Decisões humanas de 25 e 28/10/2026 preservadas: HUMAN_AUTHORIZE_AUTH_INTEGRATION_SCOPE=AUTHORIZED_RESTRICTED; ALLOWLIST_REV_9_PRESERVED_IN_REV_10.** A revisão 8 já mergeada autorizou page-access e dois testes; a revisão 9 acrescenta somente o consumidor identificado no gate real AUTH-CONSUMER-01. A passagem externa não concede capacidade DP: cada página/action/API continua sujeita aos guards reais do domínio. Preservar negação de sessão inválida, Store não autorizada, flag OFF, grants ausentes/revogados e acesso direto por URL; testar cada camada na camada responsável. Preservar Unidades, Plataforma, Financeiro e demais módulos sem relação. G-AUTH mecânico continua fechado, pois cobre `auth.ts`, `auth.config.ts` e `proxy.ts`, todos excluídos. Se outro consumidor exigir edição ou outro gate for atingido, apresentar evidência e parar; não promover STORE a PLATFORM/ADMIN legado nem enfraquecer asserts.

Seleção de Store: reutilizar o mecanismo canônico de loja ativa, com a lista de Stores autorizadas pela sessão e validação real server-side. A missão permite seletor **local em Pessoas**, se necessário, dentro dos componentes já autorizados; não depender da página administrativa `/dashboard/unidades` nem liberar essa rota. Os testes oficiais devem incluir os dois arquivos auth adicionados, usando o runner existente na allowlist.

Ordem futura obrigatória:

1. Em `frontend.e2e.ts`, criar usuário sintético **accessScope=STORE, sem platformAuthority**, memberships explícitos A/B e grants DP independentes por Store; fazer login pelo formulário real, sem injeção de sessão. Registrar de forma saneada os IDs/role/accessScope/memberships; confirmar sessão válida e `/api/stores` com HTTP 200, A/B e nenhuma Store não concedida. Testar também STORE sem grants, Store não autorizada, flag ON/OFF, sessão inválida, revogação e URL direta. Não registrar senha, token, JWT, cookies de sessão ou dados reais.
2. Correlacionar URL final/redirects, status/IDs da API, estado da tela e controle acessível de seleção de Store no navegador. Preservar diagnóstico saneado também em falha, antes do finally apagar recursos. Só afirmar causa confirmada quando sessão, API e DOM da mesma execução sustentarem a explicação. Ajustar fixture/seletor por evidência; não usar `.first()`, sleeps arbitrários, mock da API ou enfraquecer `toHaveCount(1)`.
3. Selecionar Store pelo controle acessível do fluxo canônico permitido (ou seletor local Pessoas), com ID exato e sem ambiguidade, inclusive por teclado. Conferir `assistec-active-store` após login e trocas A→B→A, releitura e isolamento efetivo das operações DP. Não injetar cookie para substituir o fluxo do produto. Cookie sozinho não comprova autorização DP.
4. Executar E2E ON/OFF completos com runner oficial, processos separados, dados sintéticos e relatórios de ambos; concluir a matriz visual/acessibilidade, corrigindo somente regressões concretas na allowlist.
5. Atender revisão/preview e demais gates, executar fechamento oficial deste sucessor e conferir cleanup. Não chamar `close` para tentar ratificar uma aceitação visual, revisão ou prova R2 ainda pendente.

## AUTH-CONSUMER-01 — correção preservada e validação restante

Na origem histórica 8bb2cb9019df2620d7ee7edfbf268b6ae2982be3, o diagnóstico real de funções puras aprovou `canAccessPage` para `/dashboard/pessoas/configuracoes`, mas `enterpriseDashboardRedirect` redirecionou para `/dashboard?access=denied` pelo filtro `pathname.includes("configuracoes")` (linhas 105–106 do consumidor). Sessão sintética STORE/OPERADOR, sem autoridade de plataforma e sem Configurações Enterprise. Fontes imutáveis: `GATE_AUTH_CONSUMER_2026-10-28.md`, `auth-consumer-diagnostic.json` e `PROPOSED_AUTH_CONSUMER.patch` no subtree de execução do SOURCE_SHA. Não é E2E nem prova da causa histórica A3; nenhuma nova execução desse diagnóstico nesta PR.

A retomada oficial 2/3 integrou o patch em `bb573fdf9a892c870cdc5d238c1cc8395b4cb9b5`: passagem específica de Pessoas somente após `canAccessPage` aprovar. A evidência preservada registra 13 testes page-access e 26 testes do consumidor, 39 PASS e lint auth PASS com dependências existentes/Node 26. Isso não equivale à instalação limpa ou ao runner oficial. Preservar raiz/filhos, negações, fronteira de prefixo, cookie/Store e revogação; dados/operações continuam sujeitos aos guards DP. Nenhum código funcional ou teste foi alterado/reexecutado nesta preparação; a bateria, preflight, QA e demais critérios abaixo continuam integrais.

## Pré-condições para a tentativa final 3/3

- **Runtime:** instalação existente Node **24.19.0 x64**, npm **11.17.0**, assinatura Authenticode válida OpenJS Foundation e ZIP correspondente ao SHASUMS256 local. Caminho absoluto do executável: `C:/Users/rafae/.codex/visualizations/2026/10/24/01a16e07-9c6a-7cc0-ad3c-e9bb6139d57b/PDV-N5C-PR299-FINAL-RELEASE-011/node-v24.19.0-win-x64/node.exe`. Selecionar somente no processo da sessão por PATH ou caminho absoluto; Node global **26.12.1** preservado. `node_modules/npm/bin/npm-cli.js` ao lado do executável foi resolvido e executado no ambiente sanitizado esperado. Não é necessário instalar ou substituir o Node global.
- **Disco:** pelo menos **24 GiB livres antes do runner**, preferencialmente **30 GiB**; manter o mínimo oficial de **12 GiB por volume em todas as etapas**, incluindo reserva ampliada pelo consumo observado após instalação. Worktree, TEMP, workspace/cache descartável e evidência foram identificados no C:. O estado final, autorização de limpeza, caminhos, medições e estabilidade estão em `PREFLIGHT_FINAL_2026-10-29.json`; reconferir imediatamente antes de qualquer execução. Não reduzir limites, excluir worktrees/node_modules/Docker/bancos/arquivos pessoais/WIPs ou limpar outros caches sem autorização específica.
- **Histórico:** ledger e ambos os arquivos fechados devem coincidir com os blobs/hashes acima, inclusive `r9-a2.md`, com exatamente os eventos BLOCKED 1/3 e 2/3. Conferir o relatório oficial e a proveniência desta revisão 10 após integração; `historical_attempt=2`, `historical_previous_attempts=[]`, `next_corrective_attempt_required=3`, teto 3. Qualquer lacuna que exija nova alteração do núcleo AEP é gate específico de parada; não criar workaround.
- **Retomada:** merge humano da PR documental, fetch e integração legítima na origem; plano/script/protocolo idênticos em main, HEAD e base comum, árvore limpa e nenhuma sessão concorrente. Somente em missão posterior expressamente autorizada usar `resume-blocked` oficial (primeiro dry-run), sem `open` nem edição do marcador. Esta preparação não executa sequer o dry-run de retomada 3/3.

Registros desta missão: `HISTORY_MANIFEST_2026-10-29.json`, `PREFLIGHT_FINAL_2026-10-29.json` e `DOCUMENTATION_CHECKS_2026-10-29.json` no subtree de planejamento. Runner integral, instalação limpa, QA, build, E2E e close permanecem para depois da retomada legítima; nenhuma versão ou prova histórica os substitui.

## Validação técnica e aceite futuro

Histórico reutilizável, sem novo PASS: 162/162 testes, typecheck, integração PostgreSQL, lint focado, dois builds e duas inspeções PWA passaram no HEAD A3; E2E ON falhou, OFF não executou e matriz visual/acessibilidade ficou pendente. O lint global saiu 1 como diagnóstico do runner, não PASS; reclassificar qualquer achado novo no HEAD futuro. O BLOCKED 2/3 ratificou C: com 11,706 GiB e Node padrão 26. As medições e a seleção Node 24 desta preparação ficam no pré-flight final abaixo; histórico não dispensa novas medições. Limpeza de caches externos depende de autorização humana com caminhos exatos e prova de inatividade.

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

- Classe C3, risco ALTO, família executora openai e requisito padrão `revisao_independente=true` preservados, com **exceção humana específica e condicional deste sucessor** no META. Nenhum gate de caminho liberado: G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CI, G-CONFIG-DEPLOY e G-AEP-CORE continuam fechados. As autorizações restritas de `page-access.ts` e do consumidor Pessoas não alteram a política global nem abrem esses gates. O pedido histórico de G-AEP-CORE foi atendido em manutenção separada já integrada pela PR #321; nenhuma nova alteração do núcleo é autorizada nesta missão.
- A integração auth/rotas mantém o recorte da revisão 8 e a única ampliação da revisão 9. Preservar o patch já aplicado na tentativa 2/3 e retomar trabalho restante somente após merge humano desta revisão e rito cumulativo oficial posterior. Consumidores fora da allowlist exigem prova sem edição; necessidade de outro path é ponto de parada.
- **Decisão formal do sucessor em 25/10/2026: INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION; SELF_REVIEW=CODEX; HUMAN_MERGE_AUTHORIZATION=PENDING.** A dispensa é nova, exclusiva deste GOAL; não herda a de 18/10 da PR #273 nem modifica governança global. Exige autorrevisão integral do diff final com cobertura/achados/SHA, sem bloqueadores, testes completos e regularização do gate AEP. Autorrevisão é **SELF_REVIEW_NOT_INDEPENDENT**, nunca R executada. `condicao_satisfeita=false` registra que as condições ainda não foram demonstradas no planejamento; comprovar seu cumprimento nas novas evidências antes do close, sem editar META/GOAL na execução. Não solicitar outra IA autonomamente.
- QA privado autorizado: reutilizar somente Neon `pessoas_001b_qa`, projeto `orange-voice-83394974`; bucket R2 privado `omni-gestao-pessoas-001b-qa`; projeto Vercel `omni-gestao-pessoas-001b-qa`. Não contratar serviços adicionais pagos. Conferir o token R2 com expiração informada em **23/10/2026**; se inválido, renovar/rotacionar somente credencial QA limitada ao bucket. Manter bucket privado; não tocar bucket Contador produtivo, DNS ou produção. Não copiar `.env` da origem nem registrar segredos, cookies ou URLs assinadas.
- Implantar o HEAD funcional em **Preview privado**, com `PESSOAS_DP_ENABLED=on` somente no QA, e validar cadastro, reload, contrato, histórico, upload-intent→PUT exclusivo→complete→list/reload→download de bytes reais, integridade por hash e isolamento A/B/empregador/capacidade. Registrar URL privada real e evidências saneadas vinculadas ao novo HEAD. Smokes de 15/16 de outubro e quaisquer outros PASS históricos não substituem esta prova. Sem prova, o gate continua pendente; PASS local sozinho não conclui o GOAL.
- Depois de todas as provas e gates, `verify --all`, `git diff --check` e `close pessoas` oficiais, preservando os BLOCKED 1/3 e 2/3 e respeitando exclusivamente a última corretiva 3/3 deste mesmo GOAL, pelo rito oficial já integrado, e seu veredito de contexto. Ledger/state/REGISTRY/GATES apenas pela CLI; GOAL/meta não são alterados na execução para forçar fechamento.
- Commit/push normais na branch de execução e PR funcional exclusiva para main foram autorizados em 25/10/2026, após validação/fechamento completos. Merge de qualquer PR continua humano. PR #273 permanece aberta/draft e sem merge. Não habilitar Pessoas em produção, fazer deploy produtivo, usar dados reais ou iniciar a folha/GOAL funcional 002.

## Conferência deste planejamento

Revisão **10** do mesmo GOAL, `status=BLOCKED`. Allowlist integralmente igual à revisão 9, sem novo path ou gate. Autenticação aprovada, runner, QA, dispensa externa condicional e todos os critérios técnicos permanecem. A origem publicou dez commits por push normal; a branch documental contém somente planejamento, transporte histórico e saídas oficiais da CLI. Nenhum código funcional foi integrado à main por esta preparação.

Executar `registry`, `verify --all` e `git diff --check`; conferir dois DONE/três BLOCKED/sete linhas, eventos Recovery 002 1/3 e 2/3 sem duplicação, hashes/arquivos fechados e ausência de marcador. Derivados somente pela CLI; staging por caminhos explícitos; commit/push normais e **uma única PR documental para main**, sem merge automático. Typecheck/build/E2E não se aplicam à documentação e não foram executados nesta missão.

Ponto de parada desejado: **INFRAESTRUTURA PRONTA E REVISÃO 10 AGUARDANDO MERGE HUMANO**. Se alguma pré-condição permanecer pendente, registrar o bloqueio objetivo e manter BLOCKED; nunca declarar infraestrutura pronta por previsão de espaço. A tentativa 3/3 não começa nesta missão. Após merge humano, a próxima missão deve conferir novamente os pré-requisitos e obter autorização expressa para a retomada oficial. Próximo GOAL funcional fora do recorte: **PESSOAS-002 — FOLHA MENSAL CALCULÁVEL**.
