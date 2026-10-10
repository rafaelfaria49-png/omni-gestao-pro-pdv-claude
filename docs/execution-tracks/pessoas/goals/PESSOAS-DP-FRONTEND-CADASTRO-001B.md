<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-FRONTEND-CADASTRO-001B",
  "track": "pessoas",
  "title": "Frontend operacional do cadastro Pessoas sobre 001A e hardening P2",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pessoas-001b-frontend",
  "worktree": "C:/Projetos/omni-gestao-pessoas-001b-frontend",
  "test_command": "node scripts/pessoas/run-frontend-tests.mjs",
  "allowlist": [
    "app/dashboard/pessoas/**",
    "components/dashboard/pessoas/**",
    "app/api/pessoas/disponibilidade/route.ts",
    "lib/navigation/dashboard-nav-items.ts",
    "components/painel-inicial/Sidebar.tsx",
    "components/painel-inicial/MobileNavSheet.tsx",
    "lib/pessoas/readers/disponibilidade.ts",
    "lib/pessoas/adapters/cadastro-ui.ts",
    "scripts/pessoas/run-frontend-tests.mjs",
    "scripts/pessoas/run-official-tests.mjs",
    "scripts/pessoas/frontend.contract.test.ts",
    "scripts/pessoas/frontend.integration.test.ts",
    "scripts/pessoas/frontend.e2e.ts",
    "scripts/pessoas/playwright.frontend.config.ts",
    "docs/pessoas/VALIDACAO_FRONTEND_001B.md",
    "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-CADASTRO-001B/**",
    "docs/execution-tracks/pessoas/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md"
  ],
  "gates_liberados": [],
  "read_budget": 65,
  "plan_ref": "OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15",
  "plan_rev": 3,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "git revert do frontend, reader de disponibilidade e testes; nenhuma mudança de schema/auth/PWA. Revert de código não desfaz comandos DP já persistidos; conservar histórico.",
  "gate_humano": {
    "requerido": true,
    "pendente": true,
    "motivo": "Merge humano deste plano e autorização da execução em nova sessão; evidência da revisão independente P2; preview somente com configuração DP isolada explicitamente autorizada. Autorizados nesta missão apenas commit/push/PR do planejamento."
  }
}
-->

# PESSOAS-DP-FRONTEND-CADASTRO-001B

## Missão e situação verificável

Materializar a interface operacional Pessoas do OmniGestão Pro sobre o backend cadastral 001A e o hardening P2 existentes. Este GOAL é **READY de planejamento**, plan_rev **3**, classe **C3**, risco **ALTO**, revisão independente obrigatória. Nenhuma UI ou runner novo é entregue por este PR.

- Branch deste planejamento: `plan/pessoas-001b-frontend → main`.
- Execução futura: branch/worktree do AEP:META, criada da origin/main corrente após merge humano do plano e autorização da execução.
- Base inspecionada em 10/10/2026: `origin/main = 7cd2c65c0bc23a9f1922cbc280494e62257251ff`, atualizada por fetch.
- `status pessoas`: dois DONE, zero BLOCKED, duas linhas de ledger, nenhum GOAL aberto.
- 001A: `PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A`, HEAD ratificado `cc6cd01f3833b0fe8a60489379865efa52e497d3`, ancestral da base.
- P2: `PESSOAS-DP-HARDENING-P2-PRE-001B-001`, HEAD ratificado `5465ba9d2999848c3e937457d7458fa7f59900e4`, ancestral da base; merge [PR #255](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/255), `c1736651864bed3959d50af302fd1ed88c7b4d89`.
- Lacuna documental: o relatório `docs/pessoas/HARDENING_P2_PRE_001B_001.md` ainda declara revisão independente pendente; o PR #255 mergeado não contém reviews/comments na consulta desta sessão. DONE/merge não comprovam R. Vincular evidência de R do P2 antes de executar 001B; não reabrir nem reclassificar os GOALs DONE.
- Fontes: CLAUDE.md, AEP ENTRYPOINT/EXECUTION_PROTOCOL/TASK_LEVELS, masterplan de 15/09/2026, `docs/pessoas/CONTRATOS_BACKEND_001A.md` e os contratos efetivos abaixo. O recorte atual substitui sugestões históricas de acrescentar Pessoas à matriz enterprise.

Ponto de parada desta missão: **PESSOAS 001B — PLANO AEP PRONTO PARA MERGE HUMANO**. Somente commit, push e PR do planejamento estão autorizados agora. Sem open/close, implementação, merge ou ambiente produtivo.

## Pre-flight e sequência da execução futura

1. Após os gates humanos, atualizar origin/main, registrar base/HEAD e confirmar os dois predecessors DONE e este único sucessor READY. Não reaproveitar branches/worktrees de outras tarefas.
2. Ler CLAUDE.md/ENTRYPOINT, rodar `status pessoas` e então `open pessoas` na branch/worktree futura. Respeitar os 65 arquivos de leitura e a allowlist; replanejar antes de ampliá-los.
3. Inspecionar pontualmente actions Pessoas, scope/admin/cadastro, domain/validação, política e serviço documental, nav/Sidebar/MobileNavSheet, `lib/loja-ativa.tsx`, tokens e runners. Arquivos de negócio existentes são leitura, não superfície para reimplementação.
4. Implementar disponibilidade e seus testes, navegação, shell/estados, setup, lista/ficha/formulários, histórico e documentos nesta ordem. Cada controle deve ter operação real e capacidade correspondente.
5. Implementar o runner descrito neste GOAL, commitar o código por paths explícitos e validar o HEAD imutável. Corrigir dentro da allowlist e repetir as provas afetadas.
6. Exigir revisão R, evidência de preview autorizado e aceite humano antes da liberação. Na execução futura, check/close pela CLI conforme AEP; nenhum close neste planejamento.

## Superfícies e contratos reais

Todas as mutações cadastrais usam exclusivamente `app/actions/pessoas/index.ts`. Nenhum novo CRUD, REST de funcionários, repositório, modelo ou serviço de negócio. Tipos do cliente derivados das assinaturas/retornos das actions por imports de tipo; não importar Prisma, crypto ou scope para o bundle cliente.

| Superfície | Rota/comportamento | Contrato 001A e limite |
| --- | --- | --- |
| Visão geral | `/dashboard/pessoas`; contexto empregador/unidade, resumo cadastral, atalhos de trabalho | `listarEmpregadores` + `listarFuncionarios`; contagens reais de ATIVO/RASCUNHO/ARQUIVADO apenas do empregador e Store atuais. Erro não é zero. Sem KPIs de folha/pagamento ou soma salarial. |
| Lista/pesquisa/filtros | `/dashboard/pessoas/funcionarios`; nome/matrícula, cargo, status e admissão; CTA Novo funcionário | `listarFuncionarios(empregadorId)`; busca por nome/matrícula e filtros status/cargo em memória sobre a lista recebida. Não prometer paginação/pesquisa server-side inexistente nem buscar CPF pela ficha de cada linha. Resultado sem correspondência distinto de cadastro vazio. |
| Cadastro | `/dashboard/pessoas/funcionarios/novo`; seções pessoal, vínculo e contrato, salvar rascunho real | `criarFuncionario`; nome/CPF/nascimento, matrícula/admissão original/regime/categoria, campos contratuais permitidos. Não assumir admissão hoje, regime, CBO, salário, jornada ou divisor. |
| Ficha e edição | `/dashboard/pessoas/funcionarios/[id]`; dados pessoais, vínculo/contrato, histórico, documentos | `obterFuncionario`, `atualizarDadosPessoais`, `completarVinculoRascunho`; edição por seção, sem fingir transação única entre actions. CPF apenas nesta superfície autorizada, com exibição discreta. |
| Contrato, remuneração e jornada | Seção da ficha e formulário de nova versão | `criarVersaoContrato`; cargo/CBO/tipoContrato/salarioBase/unidadeSalario/jornadaSemanal/divisor/cctRef/vigência/motivo. Sem cálculo de folha, salário/hora ou direitos. |
| Histórico | Seção da ficha | `listarHistorico`; linha do tempo de versões pessoais/contratuais, vigência versus recordedAt, supersedesId/supersededAt, autorId e motivo conforme DTO e capacidade. Salário sem permissão não aparece em comparação, tooltip ou resumo. |
| Documentos privados | Seção da ficha, ligada ao vínculo selecionado | APIs existentes upload-intent/complete/list/download; sem galeria global que varra vínculos nem cadastro fictício de documentos. |
| Setup/estabelecimento | `/dashboard/pessoas/configuracoes`; formulário inicial e manutenção autorizada | `setupEmpregador`, `obterEmpregador`, `editarEmpregador`, `criarEstabelecimento`, `editarEstabelecimento`. Bootstrap cria empregador, estabelecimento, vínculo de unidade e acesso do gestor atomicamente. Store nunca vira empregador por inferência. |
| Acesso DP | Estados globais e resumo das capacidades do próprio usuário no escopo atual | Reader mínimo descrito abaixo. Sem painel novo de gestão de grants: 001A não expõe listagem de usuários/acessos para uma experiência segura completa. |

IDs de empregador/vínculo podem selecionar contexto de rota; nunca conferem autorização. Validar toda leitura/mutação pelo contrato existente. O seletor de empregador usa somente `listarEmpregadores`; nenhum fallback para primeiro empregador desconhecido. Trocar Store invalida seleção e dados, inclusive quando o mesmo empregador cobre várias Stores.

**Limites de edição reais:** `completarVinculoRascunho` só preenche lacunas de RASCUNHO; não altera campos já definidos nem vínculo ATIVO. Mostrar os demais como leitura e explicar a limitação, sem habilitar salvar que será sempre recusado. Edição pessoal continua permitida pelo contrato. Arquivamento, associação com usuário/técnico, gestão de grants e associação de Stores adicionais não ganham novos controles neste recorte; não confundir arquivar com rescisão.

## Disponibilidade DP e integração mínima do menu

Evidência: `filterDashboardNav` recebe apenas EnterprisePermissions e libera os itens quando `perms === null`. Sidebar (incluindo focus mode) e MobileNavSheet são os únicos consumidores encontrados. A sessão/role no cliente não comprova DpAcesso. `listarEmpregadores` retorna [] tanto para ausência de grants como antes do primeiro bootstrap; seu resultado sozinho esconderia o setup do administrador.

A menor extensão segura consiste em:

1. **`lib/pessoas/readers/disponibilidade.ts`**, server-only, sem query Prisma própria nem nova política de autorização. Compor `listarEscopos("viewCadastro")` e `exigirBootstrap()` existentes; somente `BOOTSTRAP_NEGADO` significa canBootstrap=false. Flag OFF, sessão/Store inválidas e falha interna preservam código tipado e fecham a disponibilidade, sem transformar erro em sucesso vazio.
2. DTO enxuto: `{disponivel, podeConfigurarEmpregador, escopos:[{empregadorId, capacidades}]}`. Sem nome, inscrição, CPF, salário, matrícula, userId, credenciais ou modelos completos. `disponivel = escopos.length > 0 || podeConfigurarEmpregador`. A segunda alternativa só libera a entrada/bootstrap; não concede leitura de empregadores existentes.
3. **Path adicional precisamente necessário: `app/api/pessoas/disponibilidade/route.ts`**, GET autenticado read-only, runtime nodejs, force-dynamic/revalidate=0 e `respostaJson/respostaErro` existentes (`private, no-store`). Não aceita ator/role/Store/capacidades do cliente. Não altera nenhuma API do 001A. Este é só o transporte do reader para os menus client-side, não um backend cadastral alternativo.
4. Hook em `components/dashboard/pessoas/**` consome esse endpoint com credentials same-origin e cache no-store. Estado inicial/erro = oculto. Revalidar em montagem, troca de sessão, `useLojaAtiva().lojaAtivaId`, retorno de foco/visibilidade e após setup. Usar identidade da requisição/abort para ignorar respostas atrasadas; nunca exibir a resposta da Store anterior durante a troca. Nenhum cache global persistente.
5. Em `dashboard-nav-items.ts`, inserir Pessoas entre Financeiro HUB e Contador HUB e aplicar disponibilidade DP como filtro separado **antes** do fallback de perms null. Parâmetro opcional novo deve defaultar false para Pessoas; preservar decisões enterprise de todos os outros itens. Nenhum `p.hubs.financeiro`, GERENTE, FULL ou role isolado decide Pessoas.
6. Sidebar normal, rail de focus mode (expandido/recolhido) e MobileNavSheet recebem o mesmo estado de disponibilidade. Não modificar AppShell, Topbar, auth, enterprise-permissions ou provider de loja. Links Pessoas usam `prefetch={false}`.
7. Entrada por URL direta repete a verificação server-side; menu é conveniência, nunca barreira de segurança. Layout e páginas Pessoas dinâmicos, sem cache compartilhado; ações/apis revalidam por chamada como no 001A.

| Ator/estado | Menu e tela |
| --- | --- |
| Flag OFF; loading; sessão ausente/inválida; Store ausente/sem membership; falha ao consultar | Item oculto; URL direta explica o código apropriado, sem consultar DP após OFF. |
| ADMIN/SUPER_ADMIN ativo, Store autorizada, nenhum DpAcesso | Entrada visível para configurar empregador, comprovada por exigirBootstrap. Nenhuma listagem privilegiada implícita. |
| GERENTE/FULL/Financeiro sem DpAcesso | Oculto/acesso ao cadastro negado. Não criar grants nem sugerir que vazio significa “nenhum funcionário”. |
| viewCadastro com escopo vigente | Lista/ficha autorizadas; demais controles seguem capacidades. |
| Grant revogado, empregador inativo ou mapeamento vencido | Reconsulta fecha o escopo; limpar dados na falha, não manter tela antiga. Backend nega imediatamente cada chamada. |

Capacidades: criar/editar pessoal e completar rascunho exigem editCadastro; contrato inicial/versões exigem editContrato e pressupõem viewCadastro+viewRemuneracao no grant válido. Setup de manutenção exige manageAccess e leitura viewCadastro. viewDocumento não concede viewCadastro nem vice-versa. Grants exclusivamente documentais sem viewCadastro não abrem a UI cadastral 001B; não ampliar capacidades para contornar isso.

## Comandos, edição e consistência

- Novo comando recebe UUID de `crypto.randomUUID()` (ASCII 8–100 caracteres). Congelar payload+comandoId durante a tentativa; bloquear duplo envio. Timeout com resultado desconhecido permite repetir **o mesmo** comando/payload; alteração deliberada do formulário começa outro comando. Nunca trocar ID automaticamente para contornar IDEMPOTENCIA_CONFLITO.
- Cadastro novo usa `FuncionarioInput`. Omitir todos os campos contratuais sem editContrato, inclusive cargo, CBO e jornada. Não enviar campos desconhecidos ou estabelecimentoId: estabelecimento vem do mapeamento da Store no servidor.
- Dados pessoais: `expectedPersonVersion = ficha.pessoaVersaoAtual`. Completar vínculo e criar contrato: `expectedVersion = ficha.versaoAtual`, **não** contrato.versao. Contrato: `supersedesId = ficha.contrato.id` e escolha explícita ALTERACAO/CORRECAO.
- Empregador/estabelecimento: expectedVersion do respectivo versaoAtual retornado por obterEmpregador. Motivo e vigência explícitos em cada action que os exige.
- `VERSION_CONFLICT`, `SUPERSESSAO_INVALIDA`, `VIGENCIA_SOBREPOSTA`: reler ficha/histórico, mostrar versão atual e permitir revisar/reaplicar por decisão do usuário com novo comando; nunca overwrite silencioso/retry cego. Se perdeu autorização, limpar o rascunho sensível.
- A UI salva uma seção por vez; após cada sucesso usa o DTO retornado e relê dependências/lista/histórico. Não enviar todas as seções em paralelo com versões antigas. Se uma etapa posterior falhar, dizer quais seções já foram persistidas.
- Não retirar RASCUNHO nem calcular pendências pela nulidade do salário exibido. Usar `status` e `pendencias[]` do servidor na ficha. Pendência contratual sem capacidade orienta procurar responsável autorizado.
- Datas civis: string AAAA-MM-DD preservada no input/DTO; apresentação DD/MM/AAAA sem conversão por timezone local. recordedAt é timestamp e aparece como tal. Inscrições permanecem strings (inclusive alfanuméricas).
- Dinheiro/jornada: input local pode aceitar vírgula, adapter textual gera decimal canônico de duas casas sem parseFloat/arredondamento binário. Valores vazios continuam ausentes; validar precisão/faixa segundo domain atual, jornada 0.00–168.00, divisor inteiro 1–1000. Sem novo cálculo trabalhista.
- Salário oculto: `remuneracaoOculta=true` ou ausência de viewRemuneracao → “Remuneração restrita”, sem valor no DOM/props extras/aria/tooltip/comparações. Salário null autorizado → “Não informado”. `"0.00"` autorizado → zero legítimo. Nunca usar `Number(null)`, `|| 0` ou nulidade como permissão. Sem viewRemuneracao, também não renderizar motivo contratual livre, pois pode conter valor salarial; conservar os marcadores de versão/vigência. Isso não altera o DTO backend; qualquer vazamento comprovado no próprio contrato deve ser reportado para replanejamento, sem corrigir P3 fora do recorte.

## Documentos e privacidade

Fluxo: selecionar arquivo/categoria/origem → validar MIME/extensão/tamanho → SHA-256 dos bytes → POST upload-intent → PUT bruto para signedUrl com **todos** os headersObrigatorios → POST complete com o mesmo uploadIntent → refazer listagem. Só anunciar “Documento salvo” após complete confirmado; PUT sozinho não publica metadados.

- Upload e complete: editCadastro + viewDocumento; categorias remuneratórias também viewRemuneracao. Listagem/download: viewDocumento, somado a viewRemuneracao para remuneratórios.
- Só identificacao é COMUM. contrato, holerite_externo, comprovante e outro são REMUNERATORIO. Reutilizar política pura existente, sem classificar pelo nome/extensão. Não renderizar metadata/botão de categorias proibidas.
- PDF/PNG/JPG, máximo 25 MiB, hash lowercase de 64 caracteres; origem INTERNO ou CONTADOR_EXTERNO. holerite_externo exige CONTADOR_EXTERNO e rótulo “Documento recebido do contador”; não gerar holerite. Sem dados/arquivos de saúde.
- Tratar progresso por etapa (não inventar percentual), falha/cancelamento do PUT, headers recusados, integridade inválida, intent expirado (10 min) e resposta perdida do complete. Retry idêntico de complete reutiliza intent ainda válido; não repetir PUT consumido nem criar intents em loop. Após expiração, consultar lista e iniciar novo envio somente por ação do usuário.
- Download somente após POST autorizado a /api/pessoas/documentos/{id}/download; URL por até 300 s, usar imediatamente e descartar. DOCUMENTO_INDISPONIVEL, NAO_ENCONTRADO, STORAGE_INDISPONIVEL e ESCOPO_NEGADO têm mensagens próprias. Nada de reutilizar URL vencida: nova autorização.
- Não salvar signed URLs, uploadIntent, bytes, CPF, salário, rascunhos ou respostas em localStorage/sessionStorage/IndexedDB/CacheStorage/service worker, store Zustand persistido, analytics ou logs. Sem CPF/salário/nome de arquivo em URL de aplicação. Estado React apenas transitório; limpar na troca de usuário/Store/empregador e ao desmontar.
- Erros de APIs/actions não podem imprimir request/response bruto, exception ou URL assinada. Download externo com política no-referrer, sem prefetch; revokeObjectURL se algum preview local for usado.
- NetworkOnly já cobre /api/pessoas e /dashboard/pessoas, subrotas, HTML/RSC/prefetch e worker de navegação. Não alterar next.config.mjs/PWA; provar no build que a regra permanece válida. Offline mostra indisponível, sem ficha/documento antigo.
- Em retorno pelo histórico/bfcache (pageshow) ou retomada de aba, ocultar dados anteriores enquanto revalida o contexto/capacidades. Uma resposta tardia de outra identidade/Store/empregador não pode repopular a tela. Não tratar estado em memória como autorização duradoura.

## Direção visual, responsividade e acessibilidade

Interface nova **dentro do design system existente**: mesa de trabalho cadastral clara, sóbria, densa na medida para DP, com prioridade à próxima pendência real. Elemento distintivo: faixa de completude na ficha, derivada de pendencias[], que leva ao campo/seção autorizado e acompanha o histórico sem confundir versão com progresso.

- Tipografia herdada: Inter no corpo, Space Grotesk/font-display nos títulos; escala/densidade global respeitadas. Tokens semânticos background/card/panel/foreground/muted/border/primary, raios e componentes shadcn já presentes; sem cores/fontes globais novas, gradientes decorativos ou dashboard de cards repetidos.
- Quatro temas oficiais: light, soft-ice, midnight e black-edition. Nenhuma branch CSS só para light/dark; respeitar variáveis, focus-ring, contraste de textos secundários e estados disabled nos quatro.
- Desktop: título/contexto/CTA, resumo compacto e tabela legível com status textual; ficha com seções de leitura e edição contextual. Histórico mostra vigência e registro em colunas distintas; sem gráfico salarial decorativo.
- Mobile: lista em linhas/cartões compactos com nome/matrícula/status e ação explícita; formulários em uma coluna, labels visíveis e ações alcançáveis sem cobrir conteúdo/teclado. Navegação local acessível sem depender de hover; drawer/dialog com foco e retorno corretos.
- AppShell permanece único scroll owner da página; min-w-0 em flex/grid, sem h-screen/scroll vertical concorrente. Não alterar tokens/globals, AppShell ou preferências de tema.
- Loading sem dados fictícios; erro com tentar novamente; vazio com CTA condicionado à capacidade; acesso negado/OFF distintos. Rascunho, conflito e indisponibilidade documental mantêm contexto e informam próximo passo.
- Teclado completo, labels/descrições/erros vinculados, foco no primeiro erro e no resultado de salvar, aria-live moderado, status não comunicado só por cor. Dialogs preservam foco; controles móveis com área de toque adequada, reduced-motion respeitado.

## Allowlist justificada e exclusões

A allowlist do META é o limite de escrita da execução futura, não a lista de arquivos a alterar neste PR.

| Path(s) | Necessidade e limite |
| --- | --- |
| app/dashboard/pessoas/** | Somente layout/page/loading/error/not-found e rotas visão geral, funcionarios, funcionarios/novo, funcionarios/[id], configuracoes; sem folha/holerites. |
| components/dashboard/pessoas/** | Shell local, formulários, lista/ficha/histórico/documentos, estados e hook de disponibilidade. Não inclui componentes globais ou outro HUB. |
| app/api/pessoas/disponibilidade/route.ts | Único transporte adicional, read-only, do reader/guards 001A para desktop/mobile/focus. |
| lib/navigation/dashboard-nav-items.ts; Sidebar.tsx; MobileNavSheet.tsx | Inserção na ordem pedida e filtro DP explícito; nenhum redesenho do menu. |
| lib/pessoas/readers/disponibilidade.ts | Composição dos guards atuais, sem Prisma direto, concessão ou alteração de capacidades. |
| lib/pessoas/adapters/cadastro-ui.ts | Conversão/formatadores puros de DTO civil/decimal e montagem dos comandos, sem negócio/crypto/DB. |
| scripts/pessoas/run-frontend-tests.mjs; run-official-tests.mjs | Entrada futura e extensão limitada do ciclo isolado existente; preservar modo oficial/hardening e seus guards. |
| scripts/pessoas/frontend.contract.test.ts; frontend.integration.test.ts | RTL/jsdom, DTOs/actions/reader/menu e integração PostgreSQL; arquivos .test.ts compatíveis com o include atual, JSX via createElement quando necessário. |
| scripts/pessoas/frontend.e2e.ts; playwright.frontend.config.ts | Playwright focado com testMatch próprio (.e2e.ts não é coletado pelo Vitest), autenticação real, sem depender do config global que carrega .env/reusa servidor. |
| docs/pessoas/VALIDACAO_FRONTEND_001B.md; evidence deste GOAL | Evidências saneadas, checklist, limitações e referência R/preview. Sem alterar masterplan ou declarar funcionalidade antes de validar. |
| docs/execution-tracks/pessoas/**; REGISTRY.md; GATES.md | Somente ratificação CLI/relatório AEP na execução; não editar planejamento/ledger/state à mão para fazer check passar. |

**Excluídos:** app/actions/pessoas/index.ts, APIs documentais, scope/admin/cadastro/domain/commands e serviços do 001A/P2; auth.ts/auth.config.ts/proxy.ts/app/actions/auth.ts/lib/auth/**; schema/migrations/seeds persistentes; .env*, package.json/lockfile, next.config.mjs, config PWA, CI/AEP core; AppShell/Topbar/provider de loja/globals; Financeiro/Contador/PDV/OS. Também fora: P3s residuais, folha, holerites próprios, férias, 13º, rescisão, eSocial, pagamentos e GOAL 002. Se evidência exigir um desses paths, parar e replanejar; não “corrigir aproveitando”.

## Test command futuro e provas executáveis

`test_command = node scripts/pessoas/run-frontend-tests.mjs`, executado na raiz da worktree futura, inclusive sem node_modules. **O arquivo será implementado no 001B; não existe nesta entrega de planejamento.** Não substituir esse comando por um echo, validação só de docs ou runner que ignora as novas suítes.

Extensão estreita de `runOfficialTests` com modo frontend, preservando o comportamento dos modos atuais:
1. Capturar HEAD/base, git archive do HEAD commitado em workspace externo, npm ci do lock e prisma generate ali. Não ler .env/node_modules/credenciais da worktree.
2. Reutilizar PostgreSQL local descartável/porta livre, guard check-isolated-db, baseline, drift e restauração dos CHECKs/índices/triggers 001A. Fixture sintética dentro do runner/testes, nunca seed/migration de ambiente. Não reaproveitar servidor/banco existente.
3. Reutilizar safeEnvironment; gerar AUTH_SECRET e três chaves DP aleatórias apenas nos processos isolados. Para E2E, criar usuários sintéticos ativos com bcrypt, Stores/memberships/grants distintos e login normal pelo formulário NextAuth; selecionar Store pelo fluxo existente. Nenhum bypass/JWT de produção, mudança em auth ou sessão do operador.
4. Vitest roda **lib/pessoas inteira** e **os dois frontend.*.test.ts explicitamente**, sem file parallelism para integração. Usar jsdom por anotação/config de teste local somente na suíte de UI; não alterar vitest.config.ts global. Reprovar skipped/todo/only, suite ausente, contagem zero e integração não executada.
5. Executar npm run build (MIGRATION_SKIPPED, nunca autoridade Vercel/migration), inspectPwaBuild sobre SW/workers recém-gerados e npm run typecheck global. ESLint focado nas rotas/componentes/adapters/readers/endpoint/menu e scripts modificados, --max-warnings=0. Diagnóstico global npm run lint registrado, sem atribuir dívida prévia ao 001B nem ocultar falhas novas.
6. Playwright com config local --config=scripts/pessoas/playwright.frontend.config.ts, servidor Next do HEAD isolado em loopback/porta livre, reuseExistingServer=false, workers=1, retries=0, report JSON obrigatório. Start/stop pelo runner; portas/URLs coerentes com NEXTAUTH_URL local. Browser disponível é pré-condição verificada; ausência falha, não skip.
7. Rodar E2E ON e OFF em processos separados, sem flag pública; desktop 1440x900, mobile 390x844 e 360x800, quatro temas; incluir menu focus/normal/mobile e navegação direta. Testar reload real, não só re-render.
8. Relatar etapas/exits, HEAD/base, suites/contagens, evidência visual sintética e inspeção PWA; saída !=0 se qualquer prova local obrigatória faltar. Limpar browser, processos, cluster, workspace/node_modules/.next/SW, cookies e relatórios brutos em finally, com checagem de alvo absoluto e porta livre.

**Transporte documental e limites da prova local:** o adapter R2 fixa endpoint *.r2.cloudflarestorage.com e não oferece endpoint local. Não mudar o Contador/storage/config nem fingir que mock comprova R2. Testes de componente exercitam upload-intent → PUT com headers → complete/list/download com transporte controlado; integração usa services/actions reais + PostgreSQL, substituindo somente storage/identidade nos testes unitários de fronteira existentes. E2E local usa sessão/actions reais e prova inclusive STORAGE_INDISPONIVEL; não interceptar cadastro ou autorização para fazê-lo passar. O sucesso documental ponta a ponta com bytes reais exige o smoke isolado autorizado abaixo e é gate separado de aceite, nunca declarado PASS pelo runner local.

| Prova obrigatória | Resultado esperado |
| --- | --- |
| Bootstrap | ADMIN/SUPER_ADMIN com membership, sem grant prévio, abre Pessoas/configura/salva; reload lista empregador real. GERENTE e ADMIN sem membership recusados. |
| Cadastro e persistência | Criar rascunho sintético, salvar, reload, achar pela pesquisa, abrir ficha, preencher lacunas, obter ATIVO do servidor; banco confirma IDs/versões. |
| Versionamento | Alteração e correção contratual com motivo/vigência, supersedesId e expectedVersion corretos; histórico anterior conservado após reload. Duas sessões: uma vence, outra recebe conflito sem overwrite. |
| Idempotência/erros | Duplo clique, resposta perdida, replay igual e payload diferente; erro de campo/duplicidade/jornada/CPF, sucesso parcial entre seções e nova leitura. |
| Isolamento | Usuário A/B, empregador A/B, Store A/B, mesmo empregador em duas Stores; IDs adulterados e troca de Store não revelam objeto alheio; respostas atrasadas descartadas. |
| Salário | viewCadastro sem viewRemuneracao, com viewRemuneracao, editCadastro sem editContrato; conferir DOM/respostas/lista/ficha/histórico e ausência de salário oculto/zero fictício. Revogar grant antes da chamada seguinte. |
| Documentos | COMUM versus REMUNERATORIO por combinação de capacidades, upload também exige editCadastro; download por ID proibido; intent expirado, integridade, PUT/complete/retry e arquivo ausente. |
| Navegação | Ordem Financeiro/Pessoas/Contador quando todos visíveis; DP independente do Financeiro; perms null/FULL não abrem Pessoas; bootstrap continua alcançável; focus rail e mobile equivalentes. |
| Cache e privacidade | SW/workers NetworkOnly reais; offline não recupera ficha; sem PII/URL/intent em client storage, logs ou analytics. Novo endpoint fica no prefixo protegido. |
| Visual/acessibilidade | Quatro temas nos três viewports; sem overflow da página, foco/teclado/labels, textos longos, erro/rascunho/empty, controles sem sobreposição. Evidência em dados sintéticos. |
| Regressão | Toda suíte Pessoas 001A/P2, build/inspectPwaBuild, typecheck, lint, git diff --check e verify --all. |

## Gates de aceite e entrega futura

- **Gates de caminho:** gates_liberados vazio. G-AUTH, G-DADOS-SCHEMA, G-DADOS-SEED, G-CONFIG-DEPLOY, G-CI e G-AEP-CORE não liberados; aprovação PWA do P2 não é herdada.
- **Antes de executar:** merge humano do plano, autorização da nova sessão e referência da revisão R do P2. READY não autoriza automaticamente execução ou deploy.
- **Antes de aceitar a implementação:** test_command local PASS no HEAD commitado, critérios da tabela, revisão R por família declarada diferente de openai (ou humano) com evidência vinculada ao SHA, sem findings impeditivos.
- **Smoke preview:** somente depois de autorização explícita da configuração isolada: banco DP sintético identificado, Store/empregador/usuários de teste, chaves efêmeras, bucket R2 privado exclusivo e credenciais de teste com escopo mínimo/CORS válido. Não herdar .env nem bucket/chaves do operador/produção; não criar recursos/deploy nem alterar configuração nesta missão.
- Smoke autenticado deve provar **Abrir Pessoas → configurar empregador autorizado → cadastrar funcionário → salvar → recarregar → abrir ficha → completar pendências → alterar contrato com histórico → consultar documentos**, incluindo upload-intent/PUT assinado/complete/list/download com bytes reais e isolamento por capacidades. Guardar somente evidências saneadas; limpar dados/objetos exclusivamente sintéticos conforme autorização.
- Preview sem configuração/autorização = PENDENTE, não PASS; não concluir GOAL sem essa evidência ou replanejamento humano explícito. Produção e PESSOAS_DP_ENABLED produtivo permanecem OFF/não autorizados.
- Merge da implementação depende de decisão humana em fluxo próprio. Revert de UI não reverte dados já gravados: preservar versões/documentos/auditoria. Não deletar cadastros para “desfazer” release.
