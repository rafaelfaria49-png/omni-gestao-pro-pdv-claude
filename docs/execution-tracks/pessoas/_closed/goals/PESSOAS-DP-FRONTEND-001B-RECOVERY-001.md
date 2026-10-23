<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-FRONTEND-001B-RECOVERY-001",
  "track": "pessoas",
  "title": "Recuperar e concluir o frontend Pessoas 001B existente",
  "status": "BLOCKED",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pessoas-001b-recovery-001",
  "worktree": "C:/Projetos/omni-gestao-pessoas-001b-recovery-001",
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
    "docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_001.md",
    "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/**",
    "docs/execution-tracks/pessoas/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-001.md",
    "docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-001.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-001-a1.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-001-a2.md",
    "docs/execution-tracks/pessoas/_closed/reports/PESSOAS-DP-FRONTEND-001B-RECOVERY-001-a3.md",
    "docs/execution-tracks/pessoas/LEDGER.jsonl",
    "docs/execution-tracks/pessoas/state.json",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md"
  ],
  "gates_liberados": [],
  "read_budget": 85,
  "plan_ref": "OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15",
  "plan_rev": 6,
  "familia_executor": "openai",
  "revisao_independente": true,
  "dispensa_humana_revisao": {
    "INDEPENDENT_REVIEW": "WAIVED_BY_HUMAN_DECISION",
    "SELF_REVIEW": "CODEX",
    "HUMAN_MERGE_AUTHORIZATION": "PENDING",
    "data": "2026-10-18",
    "escopo": "Exclusivamente a PR #273 e este GOAL; nenhuma dispensa global de R.",
    "condicao": "Autorrevisao integral Codex sem achados bloqueantes remanescentes; todas as verificacoes tecnicas e gates continuam obrigatorios.",
    "condicao_satisfeita": false,
    "motivo": "P2-01 ainda aberto; nao presumir aceite ou ratificacao. Nenhuma nova revisao externa deve ser solicitada.",
    "evidencia": "https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/5eac8be5820f0d9a9ef0374e52bf1603112f78ca/docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FECHAMENTO_TECNICO_CODEX_2026-10-18.md"
  },
  "reversibilidade": "git revert do transporte e das correções locais; preservar histórico cadastral, versões, documentos e auditoria já persistidos. Não há alteração de schema/auth/configuração produtiva.",
  "gate_humano": {
    "requerido": true,
    "pendente": true,
    "motivo": "Merge humano do plano revisao 6, retomada AEP compativel e validacao tecnica efetiva pendentes. Dispensa externa condicional exclusiva da PR #273 registrada, sem autorrevisao como R. Producao e PESSOAS_DP_ENABLED produtivo nao autorizados."
  }
}
-->

# PESSOAS-DP-FRONTEND-001B-RECOVERY-001

## Revisão 6 — ampliação formal P2-01 e condição de retomada — 18/10/2026

Autorização humana direta desta missão: preparar a revisão documental em `plan/pessoas-001b-scope-006`, a partir da main corrente, acrescentando **exatamente um caminho** à allowlist vigente: `lib/pessoas/documentos/service.ts`. Preservar este mesmo GOAL, sua branch/worktree de execução e a PR #273, cujo HEAD de referência é `5eac8be5820f0d9a9ef0374e52bf1603112f78ca`.

**Uso futuro exclusivo desse serviço:** corrigir P2-01 em `refCanonica`, validando `storeId` segundo a gramática de `exigirAtor` (1–100 caracteres permitidos), sem relaxar as validações de `empregadorId` e `documentoId` nem mudar o namespace. A validação atual de oito caracteres rejeita os IDs válidos de seis caracteres `loja-1` e `loja-2`, impedindo upload-intent e afetando os usos do helper em complete/download. Não modificar outra regra, operação documental ou serviço.

**Regressão prevista:** `scripts/pessoas/frontend.integration.test.ts`, já incluído na allowlist anterior. Usar Store sintética curta para comprovar o fluxo documental e as recusas de escopo, sem dados/recursos produtivos. Não acrescentar outro path de teste, schema, auth, migrations, adapter R2 ou API documental. `test_command`, reserva mínima de 12 GiB por volume, classe C3, risco ALTO e gates vazios permanecem.

**Decisão humana de revisão:** a revisão externa adicional foi dispensada em 18/10/2026 exclusivamente para a PR #273, condicionada à autorrevisão completa Codex sem achados bloqueantes. Registrar `INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION`, `SELF_REVIEW=CODEX` e `HUMAN_MERGE_AUTHORIZATION=PENDING`. A exigência padrão `revisao_independente=true` continua visível como histórico/política de C3/ALTO; a exceção humana específica está registrada no META e nesta seção. Não representar autorrevisão como R, não solicitar novo GLM, não inferir condição satisfeita enquanto P2-01 ou requisito técnico obrigatório permanecer pendente. As referências à exigência GLM nas seções da revisão 5 abaixo ficam subordinadas a esta decisão específica; não são autorização para pedir outra revisão.

**Retomada ainda impedida pela CLI vigente:** o item 8 de `check` exige que o GOAL não esteja no delta `base_commit..HEAD` da execução. A incorporação futura do plano deve ocorrer por fluxo Git explicitamente autorizado pelo humano e produzir base comum contendo a revisão 6, com blob do GOAL igual nessa base e na execução; copiar apenas o arquivo do GOAL não satisfaz esse requisito. Esta missão não incorpora o plano na branch de execução e não executa merge/rebase.

Além disso, `cmdOpen` usa `existing || {...}` e só atualiza `active.base_commit` quando o marcador já existe; a allowlist do marcador permanece antiga. `registry` não sincroniza `.aep-active`, e `check`/hook usam o snapshot antigo. Portanto **merge do plano + novo open não é estratégia suficiente nem comprovadamente compatível**. Os mecanismos existentes não oferecem atualização oficial da allowlist preservando a sessão aberta/tentativas. Não editar, remover ou recriar o marcador, não reiniciar tentativas, não usar block/close para simular retomada e não modificar a CLI nesta revisão. Antes de tocar o novo caminho, resolver esse impedimento por decisão humana/rito AEP específico que preserve os campos de sessão e o histórico; G-AEP-CORE não é liberado por este plano.

Somente planejamento e diagnóstico de metadados nesta missão. Nenhuma exclusão, limpeza, movimentação, compressão, mudança da worktree de execução, produto, teste, build, Docker, produção ou GOAL 002. O planejamento pode chegar à main apenas por merge humano; ele não equivale a liberação automática do corretivo. Evidência: `docs/ai-execution/_evidence/PESSOAS-001B-SCOPE-006/PLAN_AND_DISK_2026-10-18.md`.

## Missão, autorização e base

Concluir o frontend Pessoas já desenvolvido, reutilizando as telas, componentes, actions/APIs 001A e o hardening P2. Recuperar seletivamente o código funcional sobre a main corrente, corrigir a tipagem conhecida e completar testes/validação visual. Não reconstruir as telas nem criar outro backend ou motor trabalhista.

Este é o único GOAL READY, classe C3, risco ALTO, plan_rev 6. A revisão 5 de recuperação e sua proveniência permanecem documentadas abaixo; a revisão 6 acrescenta somente o recorte P2-01 e a decisão humana específica acima. O sucessor representa recuperação aprovada após esgotamento das tentativas do original; não é tentativa 4 nem reabertura disfarçada.

- Planejamento: plan/pessoas-001b-recovery-001 → main; somente documentação, derivados CLI, commit/push/PR autorizados. Merge humano.
- Base confirmada por fetch em 12/10/2026: origin/main **857e24dfd81d2471d1a5cf448495e66d52a5073c**.
- [PR #264](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/264) mergeada nessa base.
- Pré-edição: status pessoas = dois DONE, um BLOCKED, quatro eventos, nenhum READY, nenhuma sessão aberta; verify --all sem divergências.
- DONE preservados: PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A e PESSOAS-DP-HARDENING-P2-PRE-001B-001.
- Original: PESSOAS-DP-FRONTEND-CADASTRO-001B, **BLOCKED**, arquivado em _closed/goals/. Preservar integralmente o arquivo e os dois eventos reconciliados, inclusive tentativas, motivos e previous_attempts. Referências narrativas antigas nesse arquivo são históricas e não autorizam execução.
- READY vive apenas em goals/; este planejamento não anexa evento ao ledger. Após registry: dois DONE, um BLOCKED, quatro eventos e somente este READY. O estado RUNNING derivado identifica o sucessor elegível; last_goal/last_result continuam registrando o BLOCKED original.

Nesta missão não executar open/close, transportar produto, criar a branch/worktree de execução, testar produto, fazer merge ou iniciar folha/holerites/GOAL 002.

Ponto de parada: **PESSOAS RECOVERY 001B — PLANO PRONTO PARA MERGE HUMANO.**

## Proveniência e transporte seletivo futuro

| Referência | SHA fixado / função |
| --- | --- |
| Origem | origin/goal/pessoas-001b-frontend |
| HEAD remoto reconciliado | 25b5fda2612b35b6daccd2103fb69060f5107f73 |
| Snapshot funcional | fde0794c4f11712034e60d785904cec14ce99216 |
| Base histórica do delta | 9f1b511a21ab98a924513428d465725e6839fdc2 |
| Nova base | origin/main corrente após merge humano deste plano; registrar SHA na execução |

O delta base histórica → snapshot tem **31 paths de produto/testes**, enumerados no manifesto abaixo e cobertos pela allowlist. São 26 adições e cinco modificações: os três consumidores/itens de navegação, lib/pessoas/cadastro.ts e scripts/pessoas/run-official-tests.mjs. Nenhum desses 31 paths mudou entre a base histórica e a main inspecionada; repetir a comparação contra a main corrente na execução.

Manifesto exato de transporte de produto/testes (não inclui documentação/AEP):

~~~text
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
~~~

1. Depois do merge humano e da autorização da execução, fazer fetch, conferir os SHAs/proveniência, a ancestralidade base histórica → snapshot → HEAD de origem e a preservação do ledger. Se o tip remoto divergir do HEAD fixado, parar para decisão humana; não substituir silenciosamente a fonte.
2. Criar a branch goal/pessoas-001b-recovery-001 e a worktree C:/Projetos/omni-gestao-pessoas-001b-recovery-001 da origin/main corrente. Ler CLAUDE.md/ENTRYPOINT; status pessoas e open pessoas somente nessa futura sessão. Ler este GOAL, com orçamento de 85 arquivos.
3. Gerar e revisar o delta Git **somente dos 31 paths explícitos** contra a base histórica; aplicar como patch seletivo sobre a nova base. Conferir colisões nas adições e conciliar qualquer mudança posterior da main nos cinco arquivos modificados. Preservar as mudanças da main; conflito fora da allowlist exige replanejamento humano.
4. Não fazer merge/cherry-pick da sequência inteira nem restaurar a árvore da branch antiga. Excluir do transporte docs/execution-tracks/**, ledger/state/REGISTRY/GATES antigos, GOAL original, commits AEP BLOCKED, relatórios e evidências antigos. O delta HEAD de origem após o snapshot é documental/AEP e não contém código funcional adicional.
5. Reutilizar as evidências antigas apenas como referência com SHA/autoria/data; nenhuma contagem antiga vira PASS novo. Revisão R do predecessor P2: documento fixado no snapshot em docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-CADASTRO-001B/REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md; não alterar esse histórico nem confundi-lo com R da recuperação.
6. Retargetar as saídas do runner.json e das imagens do runner oficial para **docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/**; a validação nova usa docs/pessoas/VALIDACAO_FRONTEND_001B_RECOVERY_001.md. Não escrever no diretório de evidências do GOAL bloqueado.
7. Inspecionar o diff final contra a nova base: apenas paths da allowlist, sem importação de histórico AEP, sem regressão 001A/P2 e sem reconstrução da interface. Adicionar/commitar sempre por paths explícitos.

## Correção inicial e privacidade preservada

Antes do runner completo, corrigir **scripts/pessoas/frontend.contract.test.ts**, nas três consultas getByRole do snapshot original, linhas **108, 110 e 113**: remover somente a opção exact: true.

~~~ts
screen.getByRole("link", { name: "Pessoas" }).getAttribute("data-prefetch")
~~~

Preservar a identificação por role link/nome Pessoas e a asserção de data-prefetch igual a "false" nos modos desktop, focus recolhido e focus expandido. Não enfraquecer o teste para um link arbitrário. A opção exact nas consultas Playwright de frontend.e2e.ts pertence a outra API e permanece válida.

Executar **npm run typecheck**, script canônico com heap de 4 GB, após commitar o transporte/correção e antes de node scripts/pessoas/run-frontend-tests.mjs. Usar instalação limpa do lockfile e Prisma gerado no ambiente de validação isolado, sem .env da worktree. Erro de tipo impede iniciar a bateria completa; registrar a falha, corrigir dentro da allowlist, commitar e repetir o typecheck. O próprio runner frontend também deve fazer typecheck antes das suítes completas/build/E2E.

Em lib/pessoas/cadastro.ts, preservar exatamente o fix de leitura de listarHistorico: sem viewRemuneracao, salário e **motivo pessoal e contratual** são redigidos no DTO; criarFuncionario pode ter gravado o mesmo motivo livre nas duas versões. Com permissão, a leitura continua completa. Nunca apagar/reescrever o motivo armazenado, versões, vigências, supersessões ou auditoria.

A exceção desse arquivo é exclusivamente transportar/manter essa redação de leitura; não autoriza refactor ou regra de negócio nova. Transportar lib/pessoas/historico-privacidade.test.ts e exigir sua execução real: sem remuneração na resposta serializada/DOM, leitura autorizada preservada, storeId/empregadorId no escopo e revogação negada antes da consulta.

## Escopo funcional e critérios de aceite

As mutações usam app/actions/pessoas/index.ts e documentos usam as APIs 001A existentes. Esses contratos são leitura; não criar CRUD alternativo, grants novos ou política de autorização própria. Reutilizar o endpoint/reader de disponibilidade do snapshot como transporte read-only, no-store, composto dos guards 001A.

| Superfície | Conclusão exigida e evidência |
| --- | --- |
| Visão geral e cadastro real | /dashboard/pessoas com empregador/Store atuais, contagens reais e atalhos. Criar funcionário com criarFuncionario, salvar rascunho real e localizar após reload. Sem KPI de folha, valor fictício ou inferência de empregador pela Store. |
| Lista e filtros | /dashboard/pessoas/funcionarios: listarFuncionarios, pesquisa nome/matrícula, filtros status/cargo; distinguir cadastro vazio, nenhum resultado e erro. Não prometer paginação server-side inexistente nem buscar CPF para cada linha. |
| Ficha e edição | /dashboard/pessoas/funcionarios/[id]: obterFuncionario, atualizarDadosPessoais e completarVinculoRascunho por seção/capacidade. Completar apenas lacunas permitidas do RASCUNHO; preservar leitura de campos imutáveis e mostrar o estado retornado pelo servidor. |
| Contrato versionado e histórico | criarVersaoContrato/listarHistorico com expectedVersion, supersedesId, vigência, motivo e ALTERACAO/CORRECAO explícitos. Duas sessões demonstram conflito sem overwrite; versões e histórico persistem após reload. |
| Documentos privados | Upload-intent → PUT com todos os headersObrigatorios → complete → list/download autorizados. Só anunciar sucesso após complete. COMUM/REMUNERATORIO conforme política 001A; negar metadata/download sem capacidades; estados de expiração/integridade/storage indisponível e retry do mesmo intent. Sucesso com bytes reais depende do gate preview/R2 abaixo. |
| Setup de empregador | /dashboard/pessoas/configuracoes: bootstrap autorizado com setupEmpregador e manutenção por obter/editarEmpregador, criar/editarEstabelecimento. Atomicidade inicial do backend, versões/motivos explícitos; nenhum grant implícito para GERENTE/FULL. |
| Navegação | Financeiro HUB → Pessoas → Contador HUB em desktop/mobile/focus recolhido/expandido. Disponibilidade DP independente de EnterprisePermissions/Financeiro; negar por padrão inclusive perms null; preservar bootstrap autorizado e prefetch=false. URL direta revalida no servidor. |
| Estados e privacidade | Loading sem dados fictícios, vazio com CTA por capacidade, erro com retry, OFF/negado/rascunho/conflito distintos. Troca de sessão/Store/empregador, pageshow/bfcache e foco ocultam dados e descartam respostas atrasadas durante revalidação. |
| Tipagem e validação visual | Typecheck verde antes da bateria, runner completo e evidências do mesmo HEAD. Quatro temas, teclado/foco, responsividade e overflow na matriz abaixo, sem reconstrução de telas ou alterações globais. |

Manter os contratos: expectedPersonVersion da ficha para edição pessoal; expectedVersion do vínculo para completar rascunho/contrato; versões do empregador/estabelecimento para setup/manutenção. Salvar uma seção por vez e reler dependências; conflito exige revisão humana do formulário. UUID/payload congelados no replay idempotente; payload alterado inicia comando novo, sem contornar IDEMPOTENCIA_CONFLITO.

Datas civis preservam AAAA-MM-DD sem timezone; adapter decimal textual preserva ausência, zero e precisão sem parseFloat/arredondamento binário. Salário oculto aparece como “Remuneração restrita”, sem valor/motivo em DOM, aria, tooltip, props excedentes, comparação, log ou resposta. null autorizado é “Não informado”; zero autorizado continua zero.

viewCadastro, editCadastro, editContrato, viewRemuneracao, viewDocumento e manageAccess seguem os guards existentes. Upload exige editCadastro + viewDocumento, com viewRemuneracao para categorias remuneratórias. Grants documentais não concedem cadastro. Não guardar CPF/salário/rascunhos/bytes/intents/signed URLs em storage cliente, caches, analytics ou logs; limpar estado transitório na mudança de escopo.

## Allowlist exata e exclusões

A lista do META é a única superfície de escrita da execução futura, limitada também pelos usos documentados aqui. A gramática AEP rejeita colchetes mesmo em paths literais; por isso o único prefixo de produto, app/dashboard/pessoas/funcionarios/**, cobre exclusivamente as três páginas existentes de lista/novo/[id] enumeradas no manifesto. Não autoriza novas páginas/arquivos sob esse prefixo; necessidade adicional exige replanejamento. Os outros 29 paths de produto são individuais (28 do transporte original e o serviço P2-01 da revisão 6), sem autorização genérica para app/, components/, lib/pessoas/ ou scripts/pessoas/.

| Grupo do META | Limite |
| --- | --- |
| Oito arquivos de app/dashboard/pessoas e nove de components/dashboard/pessoas | Transportar e finalizar as telas/formulários/estados existentes. Novas rotas ou componentes fora desses arquivos exigem replanejamento. |
| Endpoint, reader, adapter e três arquivos de navegação | Disponibilidade composta dos guards, conversões puras e inserção/filtro DP; nenhum redesenho global. |
| cadastro.ts e historico-privacidade.test.ts | Exclusivamente preservar o fix salarial de leitura e sua regressão. |
| lib/pessoas/documentos/service.ts — exceção da revisão 6 | Exclusivamente P2-01 em refCanonica: storeId conforme exigirAtor, preservando validações de empregadorId/documentoId e namespace. Regressão no frontend.integration.test.ts já permitido; retomada depende da compatibilidade AEP descrita acima. |
| Seis arquivos scripts/pessoas enumerados | Recuperar runner/suítes e corrigir tipagem, preflight, ordem de typecheck, cobertura pendente e destino de evidências. Preservar modos oficial 001A e hardening P2 e seus guards. |
| Relatório novo e subtree de evidências desta recuperação | Provas sintéticas saneadas, HEAD/base/contagens/etapas/infraestrutura/cleanup e revisões; nunca credenciais ou PII real. |
| GOAL atual/fechado, três relatórios a1/a2/a3, LEDGER/state/REGISTRY/GATES | Somente ciclo oficial de ratificação CLI. Nenhuma edição manual de derivados/ledger nem mudança de GOAL/relatório histórico de 001A/P2/001B. O ledger só recebe novos eventos reais deste sucessor durante sua execução. |

Fora da allowlist: actions/APIs documentais 001A, scope/admin/domain/commands e demais serviços (única exceção: lib/pessoas/documentos/service.ts no recorte P2-01 da revisão 6), schema/migrations/seeds de ambiente, auth/proxy, AppShell/Topbar/provider de Store/tokens/globals, next.config.mjs/PWA, package.json/lockfile/.env*, CI e core AEP. Sem novo backend, motor/fechamento de folha, holerites próprios, férias/13º/rescisão/eSocial, pagamentos, integrações Financeiro/Contador, P3s residuais ou GOAL 002. Necessidade de path/gate adicional exige replanejamento humano antes de escrever.

## Runner obrigatório, preflight e evidências

**Test command:** node scripts/pessoas/run-frontend-tests.mjs.

O runner já existe no snapshot; recuperar e concluir, sem substituí-lo por validação documental. O runner frontend reutiliza runOfficialTests({ hardening: true, frontend: true }); os modos 001A/P2 devem manter seu comportamento. Cada PASS se refere ao HEAD commitado novo; os 111 testes antigos não homologam esta recuperação.

**Preflight anterior à bateria completa:**

1. Registrar HEAD/base, Node 24/npm, SO, diretórios absolutos de workspace temporário/cache/evidência e espaço livre por volume. Exigir reserva mínima de **12 GiB livres em cada volume utilizado**, reavaliada após instalação e antes do build; se a estimativa medida para npm ci/.next/banco exceder a reserva, exigir o valor maior. Insuficiência/ENOSPC falha com diagnóstico; não remover arquivos de outras tarefas nem transformar ausência em PASS.
2. Materializar o HEAD por git archive no workspace externo, instalar com npm ci + prisma generate e exigir typecheck prévio PASS. Não ler .env/node_modules/credenciais da worktree. Sem downloads/provisionamento produtivo; resolver dependências de teste apenas no ambiente descartável.
3. Conferir PostgreSQL local: initdb, pg_ctl, psql e postgres executáveis, versões registradas, porta dedicada livre (55439 no runner recuperado), cluster temporário exclusivo iniciável e guard check-isolated-db. Não reutilizar cluster/serviço/banco existente nem conectar ao banco do operador. Falha de binário/permissão/porta/guard impede a bateria.
4. Com as dependências isoladas instaladas, conferir o Chromium da versão Playwright do lock: executablePath existente e smoke real launch → página loopback/vazia → close com o mesmo ambiente sanitizado; registrar versões. Não depender do navegador do operador/reuseExistingServer. Ausência de browser/dependências é falha de infraestrutura, nunca skip.

**Contrato da execução completa:**

- Arquivar o HEAD imutável por git archive em workspace temporário externo. Reutilizar safeEnvironment/runner-environment, PostgreSQL descartável, baseline, guard, drift e CHECKs/índices/triggers 001A. Fixtures exclusivamente sintéticas; nenhuma migration/seed de ambiente.
- Gerar AUTH_SECRET e chaves DP aleatórias somente para processos locais; banco/portas/URLs identificados. Usuários sintéticos ativos, bcrypt, Stores/memberships/grants distintos e login pelo formulário NextAuth normal; nenhum bypass/JWT produtivo ou alteração de auth.
- Exigir typecheck antes das suítes completas e build/E2E. Executar Vitest lib/pessoas inteira (001A, P2 e historico-privacidade) e frontend.contract.test.ts/frontend.integration.test.ts explicitamente, sem file parallelism. Relatório JSON por suíte; reprovar suíte ausente, coleta zero, only, skipped/todo ou integração não executada.
- Executar npm run build com MIGRATION_SKIPPED; inspectPwaBuild sobre artefatos novos prova NetworkOnly para /dashboard/pessoas e /api/pessoas, HTML/RSC/prefetch e workers. Manter configuração PWA existente. ESLint focado --max-warnings=0 para os paths recuperados e diagnóstico global npm run lint registrado; falha nova não vira dívida histórica nem PASS silencioso.
- Playwright com playwright.frontend.config.ts local: loopback/porta livre, NEXTAUTH_URL consistente, reuseExistingServer=false, workers=1, retries=0, forbidOnly=true e relatório JSON. Executar **ON e OFF em processos separados**, flag apenas no ambiente sintético. Nenhum teste flaky/skipped/ausente passa.
- Provar reload real e consulta ao banco confirmando histórico/IDs/versões; isolamento usuário/empregador/Store, revogação, troca de contexto e respostas tardias. Provar navegação desktop/mobile/focus com teclado e validação da privacidade salarial nas respostas e DOM.
- Registrar etapas/exits/infraestrutura/HEAD/base/contagens, matriz visual e limitações. Local PASS só quando todas as provas locais obrigatórias passaram. Preview/R2 permanece PENDENTE_NAO_AUTORIZADO; seu status não é promovido por mocks.
- Finally deve encerrar browser/servidor/cluster, liberar portas e remover somente os diretórios absolutos temporários próprios após conferir seus limites. Preservar no subtree autorizado imagens sintéticas saneadas e resumo; apagar cookies, chaves, relatórios brutos, node_modules/.next/SW temporários. Cleanup incompleto falha.

| Prova obrigatória | Critério verificável |
| --- | --- |
| Regressão 001A/P2 | Toda suíte do lib/pessoas, integração PostgreSQL e invariantes/retry/PII/cache executados; zero skipped/todo, sem reduzir cobertura ou alterar contratos. |
| Frontend e isolamento | Cadastro real, busca/filtros, ficha/edição/setup, capacidades combinadas, IDs adulterados, revogação e respostas atrasadas; DB e backend reais nas integrações/E2E. |
| Histórico salarial | Motivo pessoal/contratual e valores ausentes sem viewRemuneracao, inclusive resposta serializada/DOM; leitura autorizada e versões armazenadas preservadas. |
| Persistência | Criar → salvar → recarregar → localizar → editar → versionar → recarregar histórico; ALTERACAO/CORRECAO, conflito de duas sessões, replay idêntico e payload conflitante. |
| Documentos locais | Componentes com transporte controlado provam intent/PUT/headers/complete/retry; serviços reais + PostgreSQL provam política; E2E local prova também STORAGE_INDISPONIVEL. Nenhum mock comprova R2 ou autorização. |
| E2E ON/OFF | Login real sintético; ON permite só grants/bootstrap corretos; OFF oculta menu, nega endpoint/URL direta sem dados. JSON de ambos os processos com contagem positiva e zero inesperados/skipped/flaky. |
| Navegação | Desktop normal e focus expandido/recolhido, drawer mobile, ordem Financeiro/Pessoas/Contador, prefetch=false e acesso direto autorizado; DP independente das permissões enterprise. |
| Visual e acessibilidade | light, soft-ice, midnight e black-edition, cada um em 1440x900, 390x844 e 360x800. Conferir visão geral, lista, cadastro, ficha/histórico, documentos, setup e loading/vazio/erro. Imagens e inspeção humana/visual, além de asserts, para cada combinação; nenhum overflow horizontal da página/sobreposição. |
| Teclado/foco | Tab/Shift+Tab, Enter/Escape, labels/erros vinculados, foco no primeiro erro/resultado, dialog/drawer com retorno de foco, área de toque adequada, contraste e reduced-motion. AppShell único scroll owner, min-w-0 e tokens semânticos. |
| Build/PWA/tipos/lint | Typecheck antecipado, build real/MIGRATION_SKIPPED, SW/workers inspecionados, lint focado verde e diagnóstico global explicado. Sem cache/offline de ficha/documento ou PII em storage/logs. |
| Governança | git diff --check e verify --all sem divergência; diff de execução dentro da allowlist, histórico BLOCKED preservado e nenhum dado/teste omitido apresentado como PASS. |

## Gates e entrega futura

- **Planejamento agora:** commit/push/abertura da PR plan/pessoas-001b-recovery-001 → main autorizados. O próximo gate é **HUMAN_MERGE_PLAN**; não fazer merge nem iniciar execução nesta missão.
- **Gates de caminho:** gates_liberados vazio. G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CONFIG-DEPLOY, G-CI e G-AEP-CORE não liberados; gates históricos não são herdados.
- **Execução:** merge humano do plano e autorização em nova sessão, branch/worktree corretas e preflight satisfeito. Tentativas reais deste sucessor seguem o teto AEP; o custo/histórico do original continua visível, sem tentativa 4.
- **Revisão R da implementação:** obrigatória por **GLM 5.3**, família declarada **zai/GLM-5.3**, independente de openai. Relatório com autor/modelo/família/data, SHA exato revisado, diff contra allowlist, evidências do runner e findings/resultados. Não reutilizar R da PR #264/P2 como aprovação deste frontend; não inventar review formal no GitHub.
- **Preview/R2 isolado:** autorização separada **PENDENTE**. Antes de criar recursos/configurar/deployar, obter autorização humana específica para banco sintético identificado, Store/empregador/usuários de teste, bucket R2 privado exclusivo, credenciais mínimas/CORS e limpeza. Não herdar .env/bucket/chaves de produção.
- Depois dessa autorização, smoke autenticado deve provar abrir Pessoas → configurar empregador → cadastrar → salvar/recarregar → ficha/edição → contrato/histórico → documentos, com **upload-intent/PUT assinado/complete/list/download de bytes reais**, integridade e isolamento por capacidades. Evidência saneada vinculada ao HEAD; armazenamento controlado local não satisfaz esse gate.
- Sem infraestrutura/autorização/prova real, marcar o gate PENDENTE ou a execução FAIL/BLOCKED conforme AEP; **não concluir este GOAL** sem preview/R2 e revisão R satisfatórios, salvo replanejamento humano explícito. PASS local sozinho não autoriza close/aceite final.
- **Produção e PESSOAS_DP_ENABLED produtivo NÃO AUTORIZADOS.** Nenhum deploy produtivo, dados reais, configuração produtiva, folha, holerites ou GOAL 002. Merge da implementação permanece decisão humana em fluxo próprio; revert de código preserva dados/histórico já gravados.

## Validação e relatório desta missão de planejamento

Criar somente este GOAL e atualizar TRACK; gerar state.json/REGISTRY.md/GATES.md por node scripts/track.mjs registry. Executar verify --all e git diff --check, confirmar um READY, dois DONE, um BLOCKED, quatro eventos, arquivo fechado original/ledger intactos e nenhum código de produto alterado.

Reportar PLAN_PR, PLAN_HEAD, MAIN_BASE, OLD_001B_BLOCKED=PRESERVED, RECOVERY_GOAL, GOAL_READY, VERIFY_ALL, PRODUCT_CODE_CHANGED=NO e NEXT_GATE=HUMAN_MERGE_PLAN. Typecheck/build/runner/visual de produto não são executados neste PR documental e continuam obrigatórios na execução futura.
