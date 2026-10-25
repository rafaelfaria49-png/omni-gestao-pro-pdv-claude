# Recovery 002 — autorização humana e revisão documental 8

Data: **25/10/2026**, America/Sao_Paulo. GOAL: `PESSOAS-DP-FRONTEND-001B-RECOVERY-002`. Fonte: mensagem/arquivo de missão fornecido diretamente pelo usuário neste chat, “CONCLUIR CADASTRO PESSOAS — RECOVERY FINAL”, seção “AUTORIZAÇÃO HUMANA — 25/10/2026”. Identificador desta decisão: `HUMAN-RECOVERY-002-2026-10-25`.

## Decisão humana específica

Trechos literais da missão, registrados como autorização, sem atribuir revisão a terceiros:

> Autorizo executar o Recovery 002 completo.
>
> Autorizo a integração restrita das rotas Pessoas para usuários STORE legitimamente autorizados.
>
> Não autorizo liberar /dashboard/unidades globalmente nem elevar usuários STORE à autoridade PLATFORM.
>
> Dispenso nova revisão externa para este GOAL, condicionada à autorrevisão Codex sem bloqueadores, testes completos e regularização do gate AEP.
>
> Autorizo reutilizar Neon, R2 e Vercel QA existentes, inclusive renovar credencial exclusivamente QA se necessário, sem contratar serviços adicionais pagos.

A fase 1 determina PR documental separada, `registry`, `verify --all`, diff check e **aguardar merge humano**, sem iniciar execução em branch com plano divergente. Após o merge, a missão autoriza continuar. A fase 7 autoriza commit/push normais e PR funcional exclusiva para main, sem merge automático. Essas permissões não dependem de nova confirmação dos mesmos atos, mas continuam sujeitas ao escopo e aos gates técnicos.

## Base e histórico conferidos

- Main atual após fetch: `57cab7cd2935ce040be6b0342aab686e46d9d91e`, merge da [PR #305](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/305), em 25/10/2026. Contém o planejamento revisão 7 e a reconciliação oficial do predecessor.
- Branch documental desta revisão: `codex/pessoas-001b-recovery-002-auth-plan`, criada da main acima na worktree de planejamento limpa `C:/Projetos/omni-gestao/.worktrees/pessoas-001b-recovery-002-plan`. Branch anterior `plan/pessoas-001b-recovery-002` preservada; worktree principal com trabalho alheio não alterada.
- Origem preservada: `7a6df145e68bfea7eac14bf057a0904bb985dc02`. Recovery 001 oficialmente **BLOCKED 3/3**, evento com `previous_attempts` 1/2/3, não reaberto. Não há quarta tentativa nem novo GOAL criado por esta revisão.
- Estado a preservar: dois DONE, dois BLOCKED, cinco linhas no ledger, somente Recovery 002 READY. `last_goal`/`last_result` continuam no Recovery 001 BLOCKED. Nenhum marcador `.aep-active` na worktree documental.
- [PR #273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273) conferida aberta/draft no SHA de origem; permanece assim, sem edição, marcação ready ou merge.

## Delta exato do plano

Mesmo GOAL/plan_ref, revisão **7 → 8**. Classe **C3**, risco **ALTO**, família **openai**, runner `node scripts/pessoas/run-frontend-tests.mjs`, orçamento de leitura, branch/worktree futuras e gates técnicos mantidos. Únicas adições à allowlist:

| Path | Uso autorizado na execução futura |
| --- | --- |
| `lib/auth/page-access.ts` | Passagem externa restrita de `/dashboard/pessoas` e subrotas; dados/operações continuam sujeitos aos guards reais DP. |
| `lib/auth/page-access.test.ts` | Regressões de limite de rota, passagem/negação na camada externa e preservação das demais rotas. O arquivo ainda não existe na main; somente sua criação futura é autorizada. |
| `lib/auth/proxy-enterprise-dashboard.test.ts` | Cobertura dos consumidores existentes e bloqueios de Unidades/Plataforma/Financeiro e demais módulos. |

Todos os demais paths anteriores permanecem, sem remoção/reordenação. `auth.ts`, `auth.config.ts`, `proxy.ts`, schema/migrations, política global de módulos e consumidores globais não são adicionados. O gate mecânico G-AUTH cobre os três arquivos globais excluídos, não esses novos paths; continua fechado, assim como os demais gates de caminho. A decisão humana autoriza a integração restrita exigida por CLAUDE/CORE_RULES, sem mudar o protocolo ou a governança global.

`lib/auth/proxy-enterprise-dashboard.ts` e `app/dashboard/layout.tsx` consomem `canAccessPage`; verificar o comportamento completo sem edição desses consumidores. Se uma prova exigir outro path protegido, apresentar arquivo/linha, pré-condição, resultado e impacto, e interromper no gate humano. Nenhuma suposição de compatibilidade autoriza editar paths adicionais.

O manifesto `transport-manifest.json` da revisão 7 permanece literal: **32 arquivos**, origem/base/blobs/proveniência preservados; três arquivos de navegação exigem integração por trechos. Esta PR não transporta produto, estado AEP histórico ou evidência da origem.

## Condições de execução e revisão

- Após merge humano da revisão 8, criar `goal/pessoas-001b-recovery-002` e `C:/Projetos/omni-gestao-pessoas-001b-recovery-002` da main contendo o plano aprovado. Executar `status/open` oficiais; GOAL idêntico ao da base. Não usar refresh do predecessor, editar marcador ou ampliar allowlist durante execução.
- Fixture STORE sintética sem autoridade PLATFORM, memberships explícitos A/B, grants DP independentes e login real sem injeção. Correlacionar sessão saneada, GET `/api/stores`, URL final e DOM. O diagnóstico histórico A3 permanece **HYPOTHESIS**, sem prova retroativa fabricada.
- Seleção canônica de Store por fluxo permitido ao ator STORE; seletor local Pessoas é permitido nos componentes já autorizados se necessário, sem depender da página administrativa Unidades. Provar A→B→A, cookie ativo, releitura e isolamento real. Não mockar autorização, promover usuário ou afrouxar asserts.
- Runner oficial completo no novo HEAD: typecheck/lint focado, regressões backend/frontend e auth adicionadas, PostgreSQL descartável, 20 regressões documentais preservadas, dois builds/PWA, E2E ON/OFF, quatro temas/três viewports, teclado/foco/acessibilidade, cleanup e `verify --all`. Não executar nem atribuir PASS de produto nesta fase documental; PASS histórico não é PASS do sucessor.
- **INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION** por decisão nova e específica deste GOAL. Exceção condicional à autorrevisão final Codex sem bloqueadores, testes completos e regularização AEP. Requisito padrão `revisao_independente=true` permanece explícito com a exceção formal no META; não declarar R executada. **SELF_REVIEW=CODEX / SELF_REVIEW_NOT_INDEPENDENT**. Não herdar dispensa da PR #273 nem acionar outra IA autonomamente.
- `condicao_satisfeita=false` no plano registra a ausência atual de prova. O cumprimento futuro deve constar das evidências finais vinculadas ao HEAD, sem editar GOAL/META na execução. `check/close` somente após todos os requisitos; nenhum fechamento nesta fase documental. Merge funcional continua humano.

## QA privado autorizado

| Recurso existente | Limite |
| --- | --- |
| Neon `pessoas_001b_qa`, projeto `orange-voice-83394974` | Somente QA sintético existente. |
| R2 `omni-gestao-pessoas-001b-qa` | Bucket privado; conferir token com expiração informada em 23/10/2026 e, se inválido, renovar/rotacionar somente credencial QA limitada ao bucket. |
| Vercel `omni-gestao-pessoas-001b-qa` | Preview privado do novo HEAD; `PESSOAS_DP_ENABLED=on` somente QA. |

Validar novamente cadastro/reload/contrato/histórico, upload/complete/download de bytes reais, integridade e isolamento A/B. Registrar URL privada real e evidências saneadas do novo HEAD. Smokes antigos não substituem a prova. Não contratar serviços adicionais pagos; não tocar bucket Contador produtivo, DNS ou produção. Não registrar segredos, cookies ou URLs assinadas. Nenhum recurso QA é consultado, rotacionado ou implantado nesta fase documental.

## Verificação desta fase e ponto de parada

Resultados efetivos desta fase:

| Conferência | Resultado |
| --- | --- |
| `node scripts/track.mjs registry` | PASS, exit 0. Derivados regenerados pela CLI, sem delta lógico em relação à main; nenhum derivado precisa integrar o commit. |
| `node scripts/track.mjs verify --all` | PASS, exit 0, todas as 11 trilhas e REGISTRY/GATES sem divergências. |
| Allowlist/META | PASS: **41 → 44** padrões; exatamente os três paths listados adicionados; demais paths na mesma ordem, identidade/classe/risco/runner/gates/orçamento preservados. |
| Transporte | PASS: manifesto literal preservado; 32/32 caminhos cobertos, origem fixada intacta. Transporte ainda não executado. |
| Histórico/estado | PASS: blobs Git de ledger, state Pessoas e todos os arquivos fechados idênticos à main; BLOCKED 3/3 com tentativas 1/2/3; dois DONE/dois BLOCKED/cinco eventos/um único READY. `.gitkeep` é apenas placeholder, não GOAL. |
| Diff check | `git diff --check` PASS; conjunto final e índice serão conferidos novamente antes do commit. |
| Autorrevisão documental Codex | Sem bloqueadores no diff documental e na correspondência com a autorização. Não constitui autorrevisão funcional, revisão independente ou PASS técnico do Recovery 002. |

Arquivos da entrega: este registro novo, `docs/execution-tracks/pessoas/TRACK.md` e `docs/execution-tracks/pessoas/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-002.md`. Nenhum arquivo de produto, manifesto, histórico fechado, ledger, política global, trabalho alheio ou recurso QA alterado. Staging somente por esses três caminhos explícitos, commit de planejamento `aep(pessoas): plan ...`, push normal e PR documental para main; merge permanece humano.

Typecheck, build, runner, E2E, visual, QA, autorrevisão funcional e `close`: **NOT_RUN** nesta fase exclusivamente documental. `CURRENT_STATUS.md`, changelog e memória global não exigem atualização: nenhum estado funcional do módulo mudou.

**NEXT_GATE=HUMAN_MERGE_SCOPE_PLAN_REV_8**. Não iniciar implementação antes do merge humano desta PR. Depois do merge autorizado, continuar esta missão até Recovery 002 concluído com PR funcional pronta para decisão humana ou gate real identificado. Preservar PR #273 draft; sem ativação produtiva ou folha/holerites neste GOAL. Próximo GOAL funcional: PESSOAS-002 — FOLHA MENSAL CALCULÁVEL.
