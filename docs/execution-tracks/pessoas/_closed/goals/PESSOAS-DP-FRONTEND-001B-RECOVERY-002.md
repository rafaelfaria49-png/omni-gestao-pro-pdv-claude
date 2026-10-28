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
  "plan_rev": 8,
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
    "condicao_previa": "Merge humano da PR documental da revisao 8; executar somente a partir da main que contem o plano aprovado.",
    "auth_scope": "Somente lib/auth/page-access.ts e os dois testes adicionados, para passagem externa das rotas Pessoas; guards reais DP decidem dados e operacoes. Nao liberar Unidades nem elevar STORE a PLATFORM.",
    "commit_push_functional_pr": true,
    "merge_automatico": false
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
    "motivo": "HUMAN_MERGE_SCOPE_PLAN_REV_8 pendente. Execucao, integracao restrita Pessoas e reutilizacao do QA existente autorizadas em 25/10/2026, condicionadas ao merge humano desta revisao documental antes da execucao. Dispensa externa especifica e condicional: autorrevisao Codex sem bloqueadores, testes completos e regularizacao AEP; cumprimento ainda nao comprovado. Close exige todas as provas tecnicas/QA do novo HEAD; merge funcional continua humano. Producao nao autorizada."
  }
}
-->

# PESSOAS-DP-FRONTEND-001B-RECOVERY-002

## Mandato e ponto de parada

Concluir a entrega cadastral 001B existente, preservando telas, contratos, correções e testes. O backend 001A e o hardening P2 continuam DONE. O frontend original e o Recovery 001 continuam BLOCKED, com seus arquivos fechados, motivos e tentativas preservados. Este sucessor foi solicitado expressamente pelo humano após o esgotamento 3/3; não autoriza uma quarta tentativa do Recovery 001.

O planejamento da revisão 7 e a reconciliação do Recovery 001 foram incorporados à main pela [PR #305](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/305), merge `57cab7cd2935ce040be6b0342aab686e46d9d91e`. A missão humana de **25/10/2026** autoriza concluir este mesmo GOAL, integrar restritamente as rotas Pessoas para atores STORE legítimos, reutilizar o QA identificado e dispensar revisão externa adicional sob condições explícitas. Registro integral do recorte: `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/AUTHORIZATION_2026-10-25.md`.

A fase documental atual prepara a **revisão 8**, na branch `codex/pessoas-001b-recovery-002-auth-plan`, a partir dessa main. Somente GOAL, TRACK, registro desta autorização e derivados oficiais; commit/push/PR documental separados autorizados. Não executar `open`, `attempt`, `check`, `close` ou testes de produto, nem criar a branch/worktree de implementação antes do merge humano desta revisão. Não aplicar a revisão diretamente na branch de execução.

READY identifica o único plano no caminho quente; não libera o início enquanto **NEXT_GATE=HUMAN_MERGE_SCOPE_PLAN_REV_8** estiver pendente. Após esse merge, a autorização desta missão permite continuar a execução, sem exigir nova autorização para os mesmos atos já concedidos. Autorrevisão/validação/QA e decisão humana de merge funcional continuam exigidos. Folha/holerites/GOAL funcional 002, produção e ativação produtiva de Pessoas permanecem fora do recorte.

## Origem preservada e histórico ratificado

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

Estado confirmado na main e a preservar nesta revisão: dois DONE, dois BLOCKED, cinco linhas de ledger e somente este sucessor READY. `last_goal`/`last_result` continuam apontando ao Recovery 001 BLOCKED. READY não gera linha no ledger. A reconciliação já integra a main pela PR #305; não repetir importação, reconciliação ou bloqueio, nem editar ledger ou arquivos fechados.

## Transporte seletivo na execução futura

O manifesto fixado em `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/transport-manifest.json` enumera **32 arquivos funcionais/testes**, 26 adições e seis modificações, com blobs da base, da origem e da main observada. Base histórica do delta: `13700862405a89da3c7d16702318735a88348133`, merge-base comprovada com a main observada. Origem de todos os arquivos: `7a6df145e68bfea7eac14bf057a0904bb985dc02`. Nenhum arquivo de produto é transportado nesta PR documental.

1. Após merge humano da revisão 8, fazer fetch e fixar a nova main/base de execução; a autorização da execução foi dada em 25/10/2026. Conferir origem/tag/manifesto **inalterado da revisão 7** e histórico. Se a origem divergir do SHA fixado ou uma adição colidir com a main, parar para decisão específica; não substituir a fonte silenciosamente.
2. Criar `goal/pessoas-001b-recovery-002` e `C:/Projetos/omni-gestao-pessoas-001b-recovery-002` a partir da main corrente contendo este plano. Ler CLAUDE/ENTRYPOINT; executar `status pessoas` e depois `open pessoas` somente nessa nova sessão autorizada. O GOAL deve estar idêntico na base comum e na execução; não copiar metadados do predecessor nem reaproveitar `refresh-active`, restrito ao Recovery 001.
3. Aplicar o delta **apenas dos 32 caminhos do manifesto** sobre a base nova. Não restaurar diretórios inteiros, fazer merge/cherry-pick da sequência BLOCKED ou importar `.aep-active`, GOALs antigos, ledger/state/REGISTRY/GATES, relatórios ou evidências da origem. O histórico BLOCKED canônico já estará na main por esta reconciliação, sem novo transporte.
4. Integrar por trechos `Sidebar.tsx`, `MobileNavSheet.tsx` e `dashboard-nav-items.ts`: os três foram modificados na main desde a base histórica. Preservar `canAccessPage`, filtros atuais, plataforma/clientes piloto, PDV Clássico e demais mudanças da main. Acrescentar somente o comportamento Pessoas já existente e seus ajustes necessários; não sobrescrever esses arquivos pelos blobs antigos. Recalcular sobreposições na execução.
5. Reutilizar a implementação dos outros 29 caminhos, respeitando qualquer mudança posterior da main e a allowlist. O prefixo `funcionarios/**` cobre somente as três páginas existentes do manifesto; não autoriza ampliar o módulo. Alterações nos três consumidores globais de navegação limitam-se à inserção/visibilidade/privacidade de Pessoas, sem refactor ou alteração de outros fluxos.
6. Retargetar **todas** as saídas frontend do runner oficial: `runner.json`, diretório de preflight/evidência e capturas para `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002/`. Criar relatório novo `docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_002.md`. Preservar os modos 001A/P2 e seus destinos. Não reescrever evidências históricas.
7. Commitar transporte/correções por caminhos explícitos antes de validar o HEAD imutável. Registrar o delta integrado e a proveniência. Nenhuma contagem ou imagem histórica vira PASS do sucessor.

## Implementação a reutilizar e limites estreitos

Preservar visão geral, lista/busca/filtros, cadastro/rascunho, ficha/edição, contrato versionado, histórico, documentos privados e configuração de empregador/estabelecimento. Manter as Server Actions/APIs/DTOs/guards 001A; sem CRUD paralelo, novos modelos, novo motor trabalhista ou reconstrução da interface.

Manter as correções já concluídas: tipagem das três consultas Testing Library sem `exact`, privacidade de motivos pessoais/contratuais sem `viewRemuneracao`, regressão salarial, Store validada na própria requisição, contexto e respostas tardias, tema Black, contenção local de overflow, foco após releitura, retry documental/F-01, `cwd` explícito do webServer e asserções do cookie de unidade. Revalidar no HEAD novo; não reaplicar correções já presentes sem necessidade.

`lib/pessoas/cadastro.ts` está autorizado somente para transportar/preservar a redação de `listarHistorico` e sua regressão; não alterar o histórico armazenado, versões ou regras de negócio. `lib/pessoas/documentos/service.ts` está autorizado somente para transportar/preservar P2-01 em `refCanonica`: Store aceita `^[A-Za-z0-9_-]{1,100}$`, empregador/documento continuam com mínimo oito e namespace idêntico. Reutilizar a regressão de IDs curtos em `frontend.integration.test.ts`. Defeito novo nesses serviços exige delimitação e replanejamento; não usar os paths como autorização ampla de backend.

As únicas adições à allowlist nesta revisão são `lib/auth/page-access.ts`, `lib/auth/page-access.test.ts` e `lib/auth/proxy-enterprise-dashboard.test.ts`. O primeiro permite somente a integração externa de `/dashboard/pessoas` e subrotas delimitadas por `/`; os dois testes cobrem essa passagem e os bloqueios preservados. Não criar permissões DP por role legado, módulos Enterprise ou autoridade PLATFORM. A autorização efetiva sobre dados/operações permanece nos guards reais DP de usuário ativo, sessão, membership, Store/empregador/unidade, capacidade, flag e revogação.

Não alterar `auth.ts`, `auth.config.ts`, `proxy.ts`, schema/migrations, política global de módulos, API global de Stores, componentes globais de unidades, AppShell, configuração PWA/deploy, CI ou núcleo AEP para fazer E2E passar. `lib/auth/proxy-enterprise-dashboard.ts` e `app/dashboard/layout.tsx` devem ser lidos e verificados como consumidores de `canAccessPage`, sem edição adicional. Além dos três consumidores de navegação já previstos, somente os três paths auth acima são acrescentados. Se outro path protegido for indispensável, registrar arquivo/linha, pré-condição, resposta/DOM observado, impacto e gate necessário e interromper para autorização humana; não ampliar escopo durante a execução.

## Diagnóstico dirigido e primeira prioridade

**E2E_STORE_ROOT_CAUSE=HYPOTHESIS.** A evidência A3 no HEAD testado `9acf18758f4db32aed2cb7ac79d64baed244dda5` prova somente zero cartões para o seletor `getByRole("button").filter({ has: getByText(id, { exact: true }) })`, antes de ativar a Store. Não foram retidos resposta de `/api/stores`, sessão ou snapshot DOM dessa falha; a configuração tinha trace/screenshot/video desativados. O HEAD preservado tem os mesmos 32 blobs funcionais desse HEAD testado.

A fixture cria A/B, usuário `ADMIN` com `lojaId=A` e membership apenas B. Isso é uma assimetria real a eliminar na fixture autorizada futura, criando memberships sintéticos explícitos para A e B e conferindo as concessões DP separadamente. **Não confirma a causa histórica:** no `auth.ts` preservado, ADMIN recebe `storeAccess=all` e não consulta memberships; o filtro de `/api/stores` só restringe sessões `restricted`. A2 chegou a observar o texto de A em dois elementos. Os commits locais corrigiram cwd e ambiguidade do seletor; não alteraram fixture, membership ou autenticação. Não inventar prova retroativa de API/sessão/navegador.

Na main observada a política mudou: novas contas têm `accessScope=STORE`; o JWT releu memberships e priorizou a lista explícita sobre `lojaId`, inclusive para ADMIN sem autoridade de plataforma. Assim a fixture antiga, transportada sem adaptação, pode excluir A no sucessor. Preservar essa política atual; não promover o usuário de teste a PLATFORM/legado para contornar escopo.

**Dependência concreta de integração na main, detectada por leitura estática:** `lib/auth/page-access.ts:12` nega `/dashboard/unidades` para quem não tem `platformAuthority`; `/dashboard/pessoas` e seus filhos não estão mapeados e caem no `return false` da linha 31. `lib/auth/proxy-enterprise-dashboard.ts:18` e `app/dashboard/layout.tsx:18` consomem essa decisão e redirecionam. Acrescentar memberships A/B não resolve essa negação de rota. Isso descreve o código da main `0adec212...`, não uma reprodução da falha histórica.

**Decisão humana de 25/10/2026: HUMAN_AUTHORIZE_AUTH_INTEGRATION_SCOPE=AUTHORIZED_RESTRICTED; ALLOWLIST_REPLAN=REV_8_PENDING_HUMAN_MERGE.** Integrar apenas a passagem externa de Pessoas nos três paths adicionados e verificar os consumidores existentes sem modificá-los. A passagem externa não concede capacidade DP: cada página/action/API continua sujeita aos guards reais do domínio. Preservar negação de sessão inválida, Store não autorizada, flag OFF, grants ausentes/revogados e acesso direto por URL; testar cada camada na camada responsável. Preservar Unidades, Plataforma, Financeiro e demais módulos sem relação. G-AUTH mecânico continua fechado, pois cobre `auth.ts`, `auth.config.ts` e `proxy.ts`, todos excluídos. Se um consumidor exigir edição ou outro gate for atingido, apresentar evidência e parar; não promover STORE a PLATFORM/ADMIN legado nem enfraquecer asserts.

Seleção de Store: reutilizar o mecanismo canônico de loja ativa, com a lista de Stores autorizadas pela sessão e validação real server-side. A missão permite seletor **local em Pessoas**, se necessário, dentro dos componentes já autorizados; não depender da página administrativa `/dashboard/unidades` nem liberar essa rota. Os testes oficiais devem incluir os dois arquivos auth adicionados, usando o runner existente na allowlist.

Ordem futura obrigatória:

1. Em `frontend.e2e.ts`, criar usuário sintético **accessScope=STORE, sem platformAuthority**, memberships explícitos A/B e grants DP independentes por Store; fazer login pelo formulário real, sem injeção de sessão. Registrar de forma saneada os IDs/role/accessScope/memberships; confirmar sessão válida e `/api/stores` com HTTP 200, A/B e nenhuma Store não concedida. Testar também STORE sem grants, Store não autorizada, flag ON/OFF, sessão inválida, revogação e URL direta. Não registrar senha, token, JWT, cookies de sessão ou dados reais.
2. Correlacionar URL final/redirects, status/IDs da API, estado da tela e controle acessível de seleção de Store no navegador. Preservar diagnóstico saneado também em falha, antes do finally apagar recursos. Só afirmar causa confirmada quando sessão, API e DOM da mesma execução sustentarem a explicação. Ajustar fixture/seletor por evidência; não usar `.first()`, sleeps arbitrários, mock da API ou enfraquecer `toHaveCount(1)`.
3. Selecionar Store pelo controle acessível do fluxo canônico permitido (ou seletor local Pessoas), com ID exato e sem ambiguidade, inclusive por teclado. Conferir `assistec-active-store` após login e trocas A→B→A, releitura e isolamento efetivo das operações DP. Não injetar cookie para substituir o fluxo do produto. Cookie sozinho não comprova autorização DP.
4. Executar E2E ON/OFF completos com runner oficial, processos separados, dados sintéticos e relatórios de ambos; concluir a matriz visual/acessibilidade, corrigindo somente regressões concretas na allowlist.
5. Atender revisão/preview e demais gates, executar fechamento oficial deste sucessor e conferir cleanup. Não chamar `close` para tentar ratificar uma aceitação visual, revisão ou prova R2 ainda pendente.

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

- Classe C3, risco ALTO, família executora openai e requisito padrão `revisao_independente=true` preservados, com **exceção humana específica e condicional deste sucessor** no META. Nenhum gate de caminho liberado: G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CI, G-CONFIG-DEPLOY e G-AEP-CORE continuam fechados. A autorização restrita de `page-access.ts` não altera a política global nem abre esses gates.
- A integração auth/rotas é autorizada somente no recorte da revisão 8, após seu merge humano. Consumidores fora da allowlist exigem prova de funcionamento sem edição; necessidade de outro path protegido é ponto de parada real.
- **Decisão formal do sucessor em 25/10/2026: INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION; SELF_REVIEW=CODEX; HUMAN_MERGE_AUTHORIZATION=PENDING.** A dispensa é nova, exclusiva deste GOAL; não herda a de 18/10 da PR #273 nem modifica governança global. Exige autorrevisão integral do diff final com cobertura/achados/SHA, sem bloqueadores, testes completos e regularização do gate AEP. Autorrevisão é **SELF_REVIEW_NOT_INDEPENDENT**, nunca R executada. `condicao_satisfeita=false` registra que as condições ainda não foram demonstradas no planejamento; comprovar seu cumprimento nas novas evidências antes do close, sem editar META/GOAL na execução. Não solicitar outra IA autonomamente.
- QA privado autorizado: reutilizar somente Neon `pessoas_001b_qa`, projeto `orange-voice-83394974`; bucket R2 privado `omni-gestao-pessoas-001b-qa`; projeto Vercel `omni-gestao-pessoas-001b-qa`. Não contratar serviços adicionais pagos. Conferir o token R2 com expiração informada em **23/10/2026**; se inválido, renovar/rotacionar somente credencial QA limitada ao bucket. Manter bucket privado; não tocar bucket Contador produtivo, DNS ou produção. Não copiar `.env` da origem nem registrar segredos, cookies ou URLs assinadas.
- Implantar o HEAD funcional em **Preview privado**, com `PESSOAS_DP_ENABLED=on` somente no QA, e validar cadastro, reload, contrato, histórico, upload-intent→PUT exclusivo→complete→list/reload→download de bytes reais, integridade por hash e isolamento A/B/empregador/capacidade. Registrar URL privada real e evidências saneadas vinculadas ao novo HEAD. Smokes de 15/16 de outubro e quaisquer outros PASS históricos não substituem esta prova. Sem prova, o gate continua pendente; PASS local sozinho não conclui o GOAL.
- Depois de todas as provas e gates, `verify --all`, `git diff --check` e `close pessoas` oficiais, respeitando tentativas 1/3–3/3 reais deste sucessor e seu veredito de contexto. Ledger/state/REGISTRY/GATES apenas pela CLI; GOAL/meta não são alterados na execução para forçar fechamento.
- Commit/push normais na branch de execução e PR funcional exclusiva para main foram autorizados em 25/10/2026, após validação/fechamento completos. Merge de qualquer PR continua humano. PR #273 permanece aberta/draft e sem merge. Não habilitar Pessoas em produção, fazer deploy produtivo, usar dados reais ou iniciar a folha/GOAL funcional 002.

## Conferência deste planejamento

Atualizar somente este GOAL e TRACK, criar o registro da autorização de 25/10 e gerar derivados oficiais por `registry`. Preservar o manifesto de transporte da revisão 7, evidências históricas, ledger e arquivos fechados. Conferir inclusões exatas dos três paths, demais paths intactos, um único READY, dois DONE/dois BLOCKED e cinco eventos. Executar `verify --all` e diff check, staging por caminhos explícitos, commit/push normais e PR somente documental separada para main. Typecheck/build/E2E não se aplicam a esta PR e não comprovam o sucessor até execução futura.

Ponto de parada documental: **REVISÃO 8 PRONTA; AGUARDAR MERGE HUMANO DA PR DOCUMENTAL**, sem iniciar implementação em branch com plano divergente. Depois do merge autorizado, continuar esta missão até **RECOVERY 002 CONCLUÍDO E PR FUNCIONAL PRONTA PARA DECISÃO HUMANA DE MERGE, OU GATE REAL IDENTIFICADO**. Próximo GOAL funcional, fora desta missão: **PESSOAS-002 — FOLHA MENSAL CALCULÁVEL**.
