<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-HARDENING-P2-PRE-001B-001",
  "track": "pessoas",
  "title": "Hardening dos três P2 obrigatórios antes do frontend Pessoas 001B",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pessoas-hardening-p2-pre-001b-001",
  "worktree": "C:/Projetos/omni-gestao-pessoas-hardening-p2-pre-001b",
  "test_command": "node scripts/pessoas/run-hardening-tests.mjs",
  "allowlist": [
    "lib/pessoas/**",
    "scripts/pessoas/**",
    "next.config.mjs",
    "docs/pessoas/**",
    "docs/ai-execution/_evidence/**",
    "docs/execution-tracks/pessoas/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md"
  ],
  "gates_liberados": [
    "G-CONFIG-DEPLOY"
  ],
  "read_budget": 80,
  "plan_ref": "OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15",
  "plan_rev": 2,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "git revert das mudanças de domínio, runner e configuração PWA; sem mudança de schema, migration, credenciais ou dados persistentes; revisão independente antes de merge",
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "gate": "G-CONFIG-DEPLOY",
      "paths": ["next.config.mjs"],
      "autorizacao": "Autorização expressa do usuário nesta conversa, declarada em 01/10/2026: modificar exclusivamente next.config.mjs para excluir Pessoas de cache/offline com NetworkOnly. Nenhum outro gate liberado.",
      "registrado_por": "usuário desta conversa",
      "em": "2026-10-01"
    }
  }
}
-->

# PESSOAS-DP-HARDENING-P2-PRE-001B-001

## Objetivo, dependência e ponto de parada

Corrigir exatamente P2-A (P2034/retry), P2-B (jornada/PII em log) e P2-C (cache/offline Pessoas), confirmados pela revisão independente. Este hardening deve ser concluído e revisado antes do frontend 001B.

Predecessor ratificado: `PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A`. A referência pós-merge do 001A é `ed0454d91a5e3e447922068bc9d2dbc0eae88e36`, ancestral da base deste planejamento: `origin/main` em `d63b557d04fe446f3627bfdca6827c2c6e059b8c` (04/10/2026).

Este arquivo é planejamento READY. O PR `plan/pessoas-hardening-p2-pre-001b-001 → main` contém somente governança; não entrega as correções, o runner futuro ou aprovação da implementação. Não executar `open`/`close` durante o planejamento. Merge do plano é humano; execução começa em nova sessão, na branch/worktree do AEP:META, a partir da origin/main corrente já contendo o plano.

## Pre-flight da execução futura

- Ler CLAUDE.md e o AEP vigente; executar `status pessoas` e `open pessoas` somente depois do merge humano do planejamento.
- Registrar base SHA e HEAD; conferir 001A DONE e este GOAL como sucessor READY. Preservar WIPs e worktrees alheios.
- Ler pontualmente `commands.ts`, `domain.ts`, `cadastro-validation.ts`, `cadastro.ts`, testes Pessoas, runner oficial e `next.config.mjs`.
- Conferir a versão instalada pelo lockfile e pela instalação limpa do runner. Inspecionar tipos e implementação real de `@ducanh2912/next-pwa`, SW e worker de navegação antes da alteração. Mudança de contrato exige reavaliação dentro deste escopo.
- Não habilitar DP no ambiente do operador. A flag e as chaves efêmeras usadas pela suíte existente ficam restritas ao processo de testes com dados sintéticos.

## P2-A — replay primeiro e retry bounded da transação inteira

Superfície principal: `lib/pessoas/commands.ts`. Hoje `executarComando` abre uma única transação Serializable e, no catch P2034 sem replay, devolve `VERSION_CONFLICT`.

1. Preservar identidade `(storeId, atorId, comandoId)`, hash do comando e validação de ação/payload/empregador no replay.
2. Limitar a **três tentativas totais** de `prisma.$transaction`, incluindo a inicial, com Serializable e os limites atuais. Cada tentativa reexecuta a unidade completa: leitura idempotente, callback de negócio, checagem de escopo e auditoria.
3. Após cada P2034, consultar primeiro a auditoria fora da transação abortada. Replay válido devolve a entidade existente, inclusive após a terceira tentativa; replay incompatível conserva `IDEMPOTENCIA_CONFLITO`.
4. Sem replay, iniciar nova transação somente se restar tentativa. Após a terceira P2034 sem replay, devolver `PessoasError("VERSION_CONFLICT", 409)`.
5. P2002 conserva a semântica atual: procurar replay válido; sem replay, `DUPLICIDADE` (409), sem retry novo.
6. PessoasError e qualquer erro não-P2034 são propagados; conflitos reais de versão/CAS continuam conflitos de negócio. Não repetir genericamente erros de validação, escopo, timeout, auditoria ou banco.
7. Mutação e auditoria permanecem na mesma transação. Não repetir efeitos externos; não registrar payload, CPF, salário, motivo ou erro Prisma bruto durante retry.

Aceite: duas operações independentes concorrentes concluem em condições normais sem falso VERSION_CONFLICT; replay mantém um único efeito/auditoria; falha persistente respeita exatamente três tentativas e não deixa efeito parcial.

## P2-B — jornada compartilhada antes da transação de escrita

Superfície: helper único em `lib/pessoas/domain.ts` ou na validação existente, consumido por `camposInput/criarFuncionario` e `criarVersaoContrato` em `cadastro.ts`. Ambos hoje usam `decimalCanonico` sem conferir o teto 168.

- Aceitar somente jornada válida no intervalo fechado **0 a 168**. No contrato string canônico atual, `"0.00"` e `"168.00"` são válidos.
- Negativa, acima de 168 e formato/tipo inválido devolvem PessoasError 400 com código estável e sem conteúdo do comando; usar `JORNADA_INVALIDA` para a regra de jornada.
- Preservar jornada ausente no cadastro em rascunho e a obrigatoriedade na versão contratual; preservar precisão e DTO string canônico.
- Validar antes de chamar `executarComando`/`$transaction` e de construir/escrever o contrato no banco. As leituras de autorização existentes continuam válidas.
- Não alterar a validação monetária geral. O salário e o motivo de um comando com jornada inválida não chegam à escrita Prisma nem ao CHECK/log de constraint.

Aceite: testar os dois serviços, incluindo 0, 168, negativa, 168.01 e formatos/tipos inválidos. Com jornada inválida, zero transação de negócio, zero nova mutação/auditoria e zero Prisma constraint error; capturar logs com sentinelas sintéticas e provar ausência de salário/motivo.

## P2-C — NetworkOnly same-origin com preservação do PWA

G-CONFIG-DEPLOY foi aprovado pelo usuário em 01/10/2026 **somente para next.config.mjs e somente para excluir Pessoas de cache/offline**. Nenhum outro gate foi liberado; as autorizações históricas do 001A não são herdadas.

### Contrato e artefatos inspecionados no planejamento

- `package-lock.json` e o pacote efetivamente instalado em `C:/Projetos/omni-gestao/node_modules/@ducanh2912/next-pwa/package.json` indicam **10.2.9**.
- `dist/index.d.ts` declara `extendDefaultRuntimeCaching` no nível do plugin e `workboxOptions` para as opções Workbox.
- `dist/index.js:836–843` confirma que, com extensão habilitada, as entradas customizadas vêm antes das padrão; repetir um `options.cacheName` padrão substituiria aquela cache.
- `resolveWorkboxPlugin` recebe `workboxOptions.runtimeCaching`; a rota `start-url` é anteposta, mas corresponde somente a `/`. As caches genéricas incluem `apis`, `pages-rsc-prefetch`, `pages-rsc` e `pages`.
- O SW local existente `C:/Projetos/omni-gestao/public/sw.js` (SHA-256 `9BB7BC16EBD70A44589AF76F33F4E75A914D60C87B13AB020D5FAA9280856721`) contém essas caches NetworkFirst e nenhuma exclusão Pessoas. É artefato anterior; a prova de aceite será um build novo do HEAD da execução.
- `dist/sw-entry.js` envia `__FRONTEND_NAV_CACHE__` ao worker quando `cacheOnFrontEndNav` está ligado. `dist/sw-entry-worker.js` e o `swe-worker-5c72df51bb1f6ee0.js` existente fazem `fetch` + `caches.open("pages").put` diretamente, sem passar pelo roteamento do SW.

### Alteração delimitada

1. Em `next.config.mjs`, usar `extendDefaultRuntimeCaching: true` e fornecer a regra customizada em `workboxOptions.runtimeCaching`, com `handler: "NetworkOnly"` para GET e sem reutilizar nome de cache padrão.
2. O callback usa `sameOrigin` e `url.pathname`: corresponder a `/api/pessoas/` e descendentes (também proteger a raiz `/api/pessoas`), à raiz exata `/dashboard/pessoas` e a `/dashboard/pessoas/` e descendentes. Query string não muda o resultado. Não corresponder a prefixos vizinhos, como `/api/pessoas-extra`, nem a outra origem.
3. Antepor a regra a toda cache conflitante, inclusive genéricas de assets/data, API, HTML, RSC e prefetch. Preservar integralmente as regras padrão dos demais módulos, seus handlers, nomes, timeouts e expirações.
4. Manter PWA, registro e `cacheOnFrontEndNav: true`. A versão inspecionada não oferece filtro nativo por rota para as gravações do worker de navegação: incluir guarda específica Pessoas no worker emitido mediante hook de build em `next.config.mjs`, antes de qualquer `fetch`/acesso a caches nesses casos. O comportamento original permanece para os demais caminhos.
5. Para essa guarda, o pacote emite o worker via ChildCompilationPlugin; Workbox GenerateSW registra processAssets em `PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER - 10`. Fazer a transformação do asset antes da geração do manifesto, preservando referência/revision coerentes. Detectar ausência/mudança inesperada do worker e falhar; não aplicar substituição silenciosa em bundle arbitrário.
6. Não editar node_modules, usar opção não suportada, criar UI/rota/sidebar, trocar config global de navegação nem versionar `public/sw.js`, `swe-worker-*.js` ou `workbox-*.js`. Toda transformação é específica à exclusão Pessoas e fica na configuração autorizada.

### Prova obrigatória no build gerado

Executar **npm run build em modo de produção** no workspace isolado do HEAD, sem autoridade de migration. Ler o `public/sw.js` recém-gerado e os workers referenciados; coletar os registros em sua ordem real e avaliar os callbacks efetivamente compilados, em vez de procurar apenas texto "NetworkOnly".

| Caso same-origin, GET | Primeira regra/resultado obrigatório |
| --- | --- |
| `/api/pessoas/documentos` | NetworkOnly |
| `/api/pessoas/documentos?categoria=contrato` | NetworkOnly |
| `/dashboard/pessoas` | NetworkOnly |
| `/dashboard/pessoas/funcionarios` | NetworkOnly |
| Pessoas com headers RSC/prefetch e query `_rsc` | NetworkOnly, antes de pages-rsc/prefetch |
| `/api/version` | NetworkFirst, cache apis e parâmetros anteriores |
| `/dashboard/estoque` | NetworkFirst, cache pages e parâmetros anteriores |
| Navegação não-Pessoas com headers RSC/prefetch | Comportamento anterior preservado |
| URL de outra origem e prefixos vizinhos | Não entram na exclusão Pessoas; comportamento anterior |

Para Pessoas, nenhuma regra cacheadora anterior pode aceitar o request; falha de rede de NetworkOnly não pode cair no cache genérico/offline. Confirmar ausência desses documentos/URLs no precache e de plugins de fallback na regra Pessoas. O runner falha se NetworkOnly estiver ausente ou depois de qualquer regra conflitante.

Exercitar também o worker de navegação realmente emitido com mensagens para a raiz/subrota Pessoas, com query e com URL absoluta same-origin: zero cache read/write e zero fetch de aquecimento. Uma mensagem equivalente não-Pessoas deve conservar o fetch e a gravação em pages. Conferir integridade da referência/revision do worker transformado no manifesto.

## Runner oficial de hardening a implementar na execução

`test_command = node scripts/pessoas/run-hardening-tests.mjs`.

- Chamar ou reutilizar o fluxo de `run-official-tests.mjs` com alterações limitadas a `scripts/pessoas/**`, preservando as garantias existentes e adicionando build/inspeção PWA. Não duplicar um runner que enfraqueça os guards.
- Testar o **HEAD commitado** via git archive, em workspace temporário externo; instalar por `npm ci` usando o lockfile e gerar Prisma Client nesse workspace. Funcionar com worktree sem node_modules.
- Usar apenas PostgreSQL descartável local e dados sintéticos, porta desocupada e guard `check-isolated-db.mjs`; conservar drift e invariantes reais do 001A. Como a base já inclui 001A, a fixture deve reconstruir e conferir também CHECKs, índices parciais e triggers já ratificados que o prisma migrate diff de schema não representa. Não criar/alterar/aplicar migration em ambiente persistente.
- Remover banco/storage/segredos e autoridade de produção do ambiente filho, incluindo VERCEL_ENV/VERCEL_PROJECT_ID/MIGRATION_AUTHORITY_ENABLED. Build local deve registrar MIGRATION_SKIPPED; nenhuma migration de ambiente nem destino real é autorizado.
- Rodar toda a suíte `lib/pessoas` e as regressões abaixo, recusando skipped/todo, relatório ausente, integração não executada ou saída não zero.
- Fazer npm run build de produção com o PWA habilitado nesse mesmo conteúdo imutável; inspecionar o SW e o worker novos. Build/artefato inexistente ou teste de roteamento/precedência que falhe impede PASS.
- Limpar cluster, workspace, node_modules, .next, SW/workers e relatórios temporários em finally, também em falha; verificar remoção e porta liberada. Guardar somente evidência saneada nos paths autorizados.

## Regressões obrigatórias e aceite

| Regressão | Prova exigida |
| --- | --- |
| 1. Duas operações independentes concorrentes | PostgreSQL real, chaves/entidades distintas no mesmo escopo; ambas concluem, duas mutações e duas auditorias |
| 2. Replay da mesma idempotency key | Repetição e concorrência devolvem o mesmo resultado; uma mutação/auditoria; payload incompatível conserva 409 |
| 3. P2034 persistente | Injeção controlada, exatamente três tentativas; VERSION_CONFLICT 409, nenhum efeito parcial/duplicado |
| 4. Jornada 168 aceita | Helper e os dois serviços aceitam 168.00; também conferir 0.00 |
| 5. Jornada >168 em criarFuncionario | 400 tipado antes da transação/escrita, sem efeito/auditoria |
| 6. Jornada >168 em criarVersaoContrato | Mesmo resultado, versão anterior intacta |
| 7. Ausência de constraint error/PII | Negativa e formato inválido também; CHECK real presente na fixture, nenhuma escrita inválida/erro Prisma nem salário/motivo em logs |
| 8. NetworkOnly Pessoas no sw.js | Build real, callbacks/primeiro match/query/RSC, sem fallback cacheador; worker de navegação não grava Pessoas |
| 9. Caches externas ao módulo | API e navegação não-Pessoas preservam estratégia, options, ordem relativa e gravação legítima no worker |

Complementar P2-A com P2034 transitório seguido de sucesso, replay materializado após P2034 (inclusive na última tentativa), replay incompatível, P2002 com/sem replay e PessoasError/erro não-P2034 sem retry. Manter o teste de conflito contratual verdadeiro: uma versão vigente e uma auditoria. Usar sincronização determinística na primeira tentativa, sem bloquear os retries; não depender de sleeps para produzir a corrida. Falha injetada depois de mutação/auditoria precisa abortar a transação real e comprovar rollback.

Além do test_command, executar no mesmo HEAD: **npm run typecheck** global (heap canônico), ESLint focado em lib/pessoas, scripts/pessoas e next.config.mjs, **npm run build**, **git diff --check** e **node scripts/track.mjs verify --all**. Instalação incompleta, infraestrutura indisponível ou teste pulado são falha/pendência explícita; nunca PASS. Registrar comandos, exits, HEAD, contagens, ordem/estratégias do SW e limpeza, sem PII nem credenciais.

## Fronteiras, revisão e encerramento futuro

- Não corrigir os 13 P3, separar chave HMAC, alterar DTO de CPF, habilitar PESSOAS_DP_ENABLED no ambiente, implementar frontend/sidebar/rota Pessoas, iniciar folha/holerite/GOAL 002 ou frontend 001B.
- Proibido editar prisma/schema.prisma, prisma/migrations/**, package.json/lockfile, .env*, auth.ts, auth.config.ts, proxy.ts, componentes/frontend, Financeiro, Contador e PDV. Sem migration de ambiente, deploy, produção ou dados reais.
- Somente G-CONFIG-DEPLOY está liberado, no escopo exato declarado. G-DADOS-SCHEMA, G-DADOS-SEED, G-AUTH, G-CI e G-AEP-CORE permanecem fechados.
- Na execução, não editar state.json, LEDGER ou REGISTRY manualmente, nem alterar este planejamento no caminho quente. Derivados/fechamento seguem somente a CLI oficial; staging sempre por caminho explícito.
- Antes do merge da implementação, exigir revisão R por família declarada diferente de openai, avaliando allowlist, os três P2, evidências do runner/PWA e preservação das fronteiras. Autorização humana de merge em fluxo próprio.
- Encerramento da execução: testes e check/close AEP aprovados, revisão independente concluída e relatório de hardening. Só então o planejamento específico do frontend 001B pode prosseguir.
