<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-FRONTEND-001B-RECOVERY-002",
  "track": "pessoas",
  "title": "Concluir o frontend Pessoas 001B preservado e validar a recuperação",
  "status": "READY",
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
  "plan_rev": 7,
  "familia_executor": "openai",
  "revisao_independente": true,
  "preferencia_humana_revisao": {
    "SELF_REVIEW": "CODEX",
    "tipo": "SELF_REVIEW_NOT_INDEPENDENT",
    "decisao_formal_sucessor": "PENDING",
    "dispensa_da_pr_273_herdada": false,
    "fonte": "Missao humana de planejamento Recovery 002, 2026-10-23"
  },
  "reversibilidade": "git revert do transporte e das correcoes locais; preservar dados cadastrais, versoes, documentos e auditoria. Sem schema/auth/configuracao produtiva.",
  "gate_humano": {
    "requerido": true,
    "pendente": true,
    "motivo": "HUMAN_MERGE_SUCCESSOR_PLAN e autorizacao da nova execucao pendentes. Compatibilidade das rotas Pessoas/Unidades com auth da main exige decisao humana de integracao/allowlist antes de implementar. Politica de revisao do sucessor requer decisao formal; autorrevisao nao e R e a dispensa da PR #273 nao e herdada. Preview/R2 requer autorizacao especifica. Producao nao autorizada."
  }
}
-->

# PESSOAS-DP-FRONTEND-001B-RECOVERY-002

## Mandato e ponto de parada

Concluir a entrega cadastral 001B existente, preservando telas, contratos, correções e testes. O backend 001A e o hardening P2 continuam DONE. O frontend original e o Recovery 001 continuam BLOCKED, com seus arquivos fechados, motivos e tentativas preservados. Este sucessor foi solicitado expressamente pelo humano após o esgotamento 3/3; não autoriza uma quarta tentativa do Recovery 001.

Esta missão produz somente reconciliação e planejamento documental em `plan/pessoas-001b-recovery-002`, partindo da `origin/main` conferida por fetch em `0adec2121ed463844f1af325f05f924f6952eddf`. Commit/push e uma PR documental para main foram autorizados. Merge permanece humano. Não executar `open`, `attempt`, `check`, `close` ou testes de produto, nem criar a branch/worktree de implementação nesta missão.

READY identifica o único plano no caminho quente; não significa liberação dos gates ou do início da execução. **NEXT_GATE=HUMAN_MERGE_SUCCESSOR_PLAN**. Depois do merge, também são necessárias a autorização da nova sessão e as decisões específicas descritas adiante. Folha/holerites/GOAL funcional 002, produção e ativação produtiva de Pessoas permanecem fora do recorte.

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

Estado esperado após este planejamento: dois DONE, dois BLOCKED, cinco linhas de ledger e somente este sucessor READY. `last_goal`/`last_result` continuam apontando ao Recovery 001 BLOCKED. READY não gera linha no ledger. A reconciliação só integra o histórico da main após o merge humano desta PR.

## Transporte seletivo na execução futura

O manifesto fixado em `docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002-PLAN/transport-manifest.json` enumera **32 arquivos funcionais/testes**, 26 adições e seis modificações, com blobs da base, da origem e da main observada. Base histórica do delta: `13700862405a89da3c7d16702318735a88348133`, merge-base comprovada com a main observada. Origem de todos os arquivos: `7a6df145e68bfea7eac14bf057a0904bb985dc02`. Nenhum arquivo de produto é transportado nesta PR documental.

1. Após merge humano e autorização da execução, fazer fetch e fixar a nova main/base de execução. Conferir origem/tag/manifesto e histórico. Se a origem divergir do SHA fixado ou uma adição colidir com a main, parar para decisão específica; não substituir a fonte silenciosamente.
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

Não alterar `auth.ts`, `auth.config.ts`, `proxy.ts`, schema/migrations, API global de Stores, componentes globais de unidades, AppShell, configuração PWA/deploy, CI ou núcleo AEP para fazer E2E passar. Nenhum desses paths integra a allowlist, exceto os três consumidores de navegação com o recorte estreito acima. Se a prova demonstrar defeito real externo, reportar arquivo/linha, pré-condição, resposta/DOM observado, impacto e gate necessário (por exemplo G-AUTH, G-DADOS-SCHEMA ou G-CONFIG-DEPLOY); não contornar a autorização.

## Diagnóstico dirigido e primeira prioridade

**E2E_STORE_ROOT_CAUSE=HYPOTHESIS.** A evidência A3 no HEAD testado `9acf18758f4db32aed2cb7ac79d64baed244dda5` prova somente zero cartões para o seletor `getByRole("button").filter({ has: getByText(id, { exact: true }) })`, antes de ativar a Store. Não foram retidos resposta de `/api/stores`, sessão ou snapshot DOM dessa falha; a configuração tinha trace/screenshot/video desativados. O HEAD preservado tem os mesmos 32 blobs funcionais desse HEAD testado.

A fixture cria A/B, usuário `ADMIN` com `lojaId=A` e membership apenas B. Isso é uma assimetria real a eliminar na fixture autorizada futura, criando memberships sintéticos explícitos para A e B e conferindo as concessões DP separadamente. **Não confirma a causa histórica:** no `auth.ts` preservado, ADMIN recebe `storeAccess=all` e não consulta memberships; o filtro de `/api/stores` só restringe sessões `restricted`. A2 chegou a observar o texto de A em dois elementos. Os commits locais corrigiram cwd e ambiguidade do seletor; não alteraram fixture, membership ou autenticação. Não inventar prova retroativa de API/sessão/navegador.

Na main observada a política mudou: novas contas têm `accessScope=STORE`; o JWT releu memberships e priorizou a lista explícita sobre `lojaId`, inclusive para ADMIN sem autoridade de plataforma. Assim a fixture antiga, transportada sem adaptação, pode excluir A no sucessor. Preservar essa política atual; não promover o usuário de teste a PLATFORM/legado para contornar escopo.

**Dependência concreta de integração na main, detectada por leitura estática:** `lib/auth/page-access.ts:12` nega `/dashboard/unidades` para quem não tem `platformAuthority`; `/dashboard/pessoas` e seus filhos não estão mapeados e caem no `return false` da linha 31. `lib/auth/proxy-enterprise-dashboard.ts:18` e `app/dashboard/layout.tsx:18` consomem essa decisão e redirecionam. Acrescentar memberships A/B não resolve essa negação de rota. Isso descreve o código da main `0adec212...`, não uma reprodução da falha histórica.

**Gate necessário: HUMAN_AUTHORIZE_AUTH_INTEGRATION_SCOPE / ALLOWLIST_REPLAN_REQUIRED.** Antes de alterar a política, o humano deve decidir como integrar as rotas Pessoas aos guards DP existentes e qual fluxo autorizado permite selecionar Store para esse ator. A proposta de escopo deve nomear `lib/auth/page-access.ts`, os consumidores `lib/auth/proxy-enterprise-dashboard.ts`/`app/dashboard/layout.tsx` e testes afetados; nenhum desses paths foi incluído neste GOAL. Trata-se de autorização explícita da camada de autenticação exigida por CLAUDE/CORE_RULES; o gate mecânico G-AUTH também precisa ser liberado se a solução tocar `auth.ts`, `auth.config.ts` ou `proxy.ts`. Não liberar Unidades globalmente, conceder autoridade PLATFORM ou remover checks enterprise/DP apenas para o E2E. Se um fluxo já autorizado satisfizer a seleção de Store, demonstrá-lo sem ampliar escopo; a integração da rota Pessoas ainda exige decisão. Sem solução autorizada, parar nesse gate e reportar BLOCKED conforme AEP, preservando evidência e tentativas.

Ordem futura obrigatória:

1. Dentro da fixture E2E já permitida, registrar de forma saneada os IDs sintéticos/role/accessScope e membership A/B; fazer login pelo formulário real. Confirmar sessão válida e `/api/stores` com HTTP 200, conteúdo esperado A/B e nenhuma Store não concedida. Não registrar senha, token, JWT, cookies de sessão ou dados reais.
2. Correlacionar URL final/redirects, status/IDs da API, estado da tela e cartão acessível no navegador. Preservar diagnóstico saneado também em falha, antes do finally apagar recursos. Só afirmar causa confirmada quando sessão, API e DOM da mesma execução sustentarem a explicação. Ajustar fixture/seletor por evidência; não usar `.first()`, sleeps arbitrários, mock da API ou enfraquecer `toHaveCount(1)`.
3. Selecionar cada cartão pelo ID exato e sem ambiguidade; ativar por teclado. Conferir `assistec-active-store` após login e trocas A→B→A, além do efeito no escopo das requisições. Não injetar cookie para substituir o fluxo do produto. Cookie sozinho não comprova autorização DP.
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
| Login/Stores/cookie | Sessão real e API correlacionadas ao DOM; memberships sintéticos coerentes; cartão único e cookie de unidade ativa após A→B→A, com negação de acesso cruzado efetiva. |
| E2E ON/OFF | Loopback/porta exclusiva, `cwd` correto, `reuseExistingServer=false`, workers=1, retries=0, forbidOnly=true; flag somente nos processos sintéticos separados. JSON dos dois modos com contagem positiva e zero inesperados/skipped/flaky. ON percorre entrega; OFF oculta navegação e nega URL/endpoint sem dados e com no-store. |
| Documentos | Reutilizar testes intent→PUT com headers obrigatórios→complete→list/retry/F-01/download e serviço real+PostgreSQL. UI mostra indisponibilidade honesta no ambiente local sem storage. Mock/armazenamento controlado não comprova bytes R2. |
| Navegação e matriz visual | Desktop normal/focus recolhido/expandido e drawer mobile; Financeiro→Pessoas→Contador, prefetch=false. Quatro temas Light/Soft Ice/Midnight/Black (classe black-edition), cada um em 1440×900, 390×844 e 360×800. Visão geral, lista/filtros, cadastro, ficha/edição/histórico, documentos e setup, além de loading/vazio/erro/negado/OFF/conflito. Registrar grade de cobertura com captura saneada por combinação e inspeção visual; screenshot parcial não conclui a matriz. |
| Acessibilidade | Tab/Shift+Tab, Enter/Escape, labels/erros associados, foco no primeiro erro/resultado, dialog/drawer e retorno de foco, contraste, toque e reduced-motion. Sem overflow horizontal/sobreposição; tokens semânticos, min-w-0 e AppShell como único scroll owner. |
| Build/PWA/tipos/lint | Typecheck antecipado, lint focado --max-warnings=0, diagnóstico global explicado, dois builds reais com MIGRATION_SKIPPED e inspeções PWA novas. NetworkOnly Pessoas em HTML/RSC/prefetch/workers, sem enfraquecer a proteção de outros módulos. |
| Evidência/cleanup | HEAD/base/etapas/exits/contagens/cobertura registrados; encerrar browser/servidor/cluster e conferir portas. Copiar somente evidência sintética saneada para o subtree do sucessor; remover apenas temporários próprios após conferir limites absolutos. Cleanup incompleto falha. |

## Revisão, preview e entrega

- Classe C3, risco ALTO, família executora openai e `revisao_independente=true` preservados. Nenhum gate de caminho liberado: G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CI, G-CONFIG-DEPLOY e G-AEP-CORE continuam fechados.
- A dependência de compatibilidade auth/rotas da main descrita acima está pendente de decisão/replanejamento específico. O merge deste plano não amplia esses paths nem autoriza corrigi-los implicitamente.
- A preferência humana é autorrevisão Codex. Registrar cobertura, achados e SHA exato como **SELF_REVIEW_NOT_INDEPENDENT**. A dispensa externa de 18/10 foi exclusiva da PR #273/Recovery 001 e não se aplica a este GOAL. Não preencher R fictícia nem dispensar o gate automaticamente. **Decisão formal da revisão do sucessor: PENDING**; manter a exigência padrão até decisão humana específica ou revisão independente autorizada. Não solicitar outra IA autonomamente.
- Preview/R2 isolado: os smokes históricos de 15/16 de outubro são referências do predecessor, com SHA/limitações próprios. Não herdar credenciais, `.env`, banco, bucket, grants ou permissão para criar/configurar/deployar recursos. Obter autorização específica para o ambiente sintético identificado antes de atuar. A preferência de revisão não dispensa teste técnico.
- Antes do aceite/close, comprovar em ambiente autorizado upload-intent→PUT exclusivo→complete→list/reload→download de bytes reais, integridade por hash e isolamento/recusa por Store/empregador/capacidade. Relacionar prova ao HEAD exato; se usar evidência anterior, só por decisão humana formal e equivalência demonstrada, sem promovê-la automaticamente. Sem prova ou autorização, gate PENDING/BLOCKED conforme AEP; PASS local sozinho não conclui o GOAL.
- Depois de todas as provas e gates, `verify --all`, `git diff --check` e `close pessoas` oficiais, respeitando tentativas 1/3–3/3 reais deste sucessor e seu veredito de contexto. Ledger/state/REGISTRY/GATES apenas pela CLI; GOAL/meta não são alterados na execução para forçar fechamento.
- Merge de qualquer implementação continua humano. PR #273 permanece aberta/draft e sem merge. Não habilitar Pessoas em produção, fazer deploy produtivo, usar dados reais ou iniciar a folha/GOAL funcional 002.

## Conferência deste planejamento

Criar somente este GOAL, atualização de TRACK, evidência de planejamento/manifesto e derivados oficiais. Executar `registry`, `verify --all` e diff check; conferir um único READY, dois DONE/dois BLOCKED, cinco eventos e preservação literal do ledger e dos arquivos fechados. Commits separados de reconciliação e planejamento, staging por caminhos explícitos, push normal e PR somente documental para main. Typecheck/build/E2E não se aplicam a esta PR; não foram executados.

Ponto de parada: **HISTÓRICO BLOCKED PRESERVADO E UM ÚNICO SUCESSOR 001B PRONTO PARA AUTORIZAÇÃO**.
