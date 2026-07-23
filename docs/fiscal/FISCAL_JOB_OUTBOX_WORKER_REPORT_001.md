# FISCAL_JOB_OUTBOX_WORKER_REPORT_001

## Identificação

- GOAL: `FISCAL-JOB-OUTBOX-WORKER-011`
- Branch autorizada: `fiscal/goal-011-outbox-worker`
- Worktree isolada: `C:\Projetos\wt-fiscal-011`
- Base verificada: `origin/main` em `8cd84624cff8e75b2408f4b1908975be3775cd18`
- PR fiscal #26: confirmado como merged; merge commit
  `8cd84624cff8e75b2408f4b1908975be3775cd18`, presente na base.

## Pré-flight e decisões de implementação

O schema existente de `FiscalEmissaoJob` já contém dedupe, status, prioridade, tentativas,
próxima tentativa, `lockOwner`, `lockedAt`, `lockExpiresAt` e índices de drenagem. A pausa pôde
usar `FiscalLog` append-only e um kill switch de ambiente. Portanto, não houve alteração de schema
ou migration.

A infraestrutura real é Next.js/Vercel serverless com PostgreSQL/Supabase e não possui processo
dedicado ou cron fiscal configurado. O modelo escolhido foi um endpoint interno Node protegido para
drenagem de lotes. Ele é fail-closed sem `FISCAL_QUEUE_INTERNAL_SECRET`; aceita autenticação
server-side por bearer/header comparado em tempo constante. Nenhum cron, scheduler ou recurso foi
provisionado neste GOAL.

Não foi criada ADR: não havia duas alternativas operacionais já suportadas pela infraestrutura.
Um daemon exigiria infraestrutura nova, enquanto o endpoint interno utiliza o mecanismo serverless
existente e estava expressamente previsto no checkpoint.

## Produtor transacional

A solicitação de emissão não chama mais o pipeline de forma síncrona. Depois de congelar ou
reutilizar o snapshot vigente, uma única transação Prisma:

1. relê a venda no `storeId` autorizado;
2. faz upsert do job `EMISSAO`;
3. muda `Venda.fiscalStatus` de `NAO_FISCAL` para `PENDENTE` por compare-and-swap.

Falha ao gravar o job aborta a transação e não deixa a venda parcialmente `PENDENTE`. A chave:

`fiscal:emissao:v1:venda:{vendaId}`

é combinada com a restrição existente `@@unique([storeId, dedupeKey])`. Solicitações repetidas
convergem para o mesmo job e o `storeId` nunca é implícito ou fixo.

## Drenagem, lock e recuperação

Jobs elegíveis são filtrados por status, `proximaTentativaEm`, lock vencido e pausa por loja. A
ordem é determinística: prioridade decrescente, próxima tentativa, criação e ID. O lote tem teto
50.

A aquisição usa seleção seguida de `updateMany` compare-and-swap que revalida integralmente a
elegibilidade e incrementa `tentativas` no banco. Dois workers podem observar o mesmo candidato,
mas somente um atualiza a linha. O lease possui owner, início e expiração. Heartbeat estende a
expiração; conclusão, retry, falha e marcador de transmissão exigem status `PROCESSANDO`, o mesmo
`lockOwner` e lease ainda válido. Worker diferente não libera lock alheio.

Se o processo morrer, outro worker só assume depois de `lockExpiresAt`. O takeover incrementa a
tentativa e gera auditoria. O kill-test cobre morte logo após aquisição, antes do marcador de
transmissão: após a expiração, o segundo worker assume, executa uma vez e converge para
`CONCLUIDO`, sem perda ou duplicidade simulada.

## Retry, dead-letter e transmissão

Erro transitório retorna a `PENDENTE` com `proximaTentativaEm`. O backoff exponencial
determinístico começa em 30 segundos e tem teto padrão de 30 minutos. Erro terminal ou esgotamento
de `maxTentativas` (default 5) resulta em `FALHA`/dead-letter.

Mensagens persistidas são compactadas, limitadas e sanitizadas para remover XML/markup e valores
de campos como autorização, senha, token, segredo, certificado, PFX e chave privada.

O payload mantém uma fronteira explícita de transmissão. Uma tentativa externa que começou sem
conclusão só admite retry quando uma consulta autorizadora registrar autorização ainda não
consumida. A consulta real permanece para GOAL futuro. Neste GOAL, o adapter só aceita
`STUB_HOMOLOGACAO + NFC-e + HOMOLOGACAO + fiscalEnabled já habilitado` e bloqueia qualquer outro
contexto antes de invocar emissão. Todo resultado aceito confirma `simulado=true` e
`externalTransmissionAttempted=false`.

## Operações administrativas

- Reprocessamento: somente `FALHA`, transacional, com ator, motivo e data; limpa lock e erro,
  preserva `tentativas` e concede exatamente uma tentativa adicional quando o teto já foi
  alcançado.
- Cancelamento: somente `PENDENTE`, `AGUARDANDO_RETRY` ou `FALHA`, e apenas sem owner; job
  `PROCESSANDO` é rejeitado. O registro não é apagado.
- Pausa: eventos append-only em `FiscalLog` para escopo global ou por `storeId`. O kill switch
  emergencial `FISCAL_QUEUE_GLOBAL_PAUSED=1` tem precedência. A pausa impede novas aquisições;
  jobs já adquiridos terminam normalmente e jobs pendentes não são perdidos.
- Métricas: profundidade, idade do pendente mais antigo, quantidade por status, contagem de
  falhas, locks vencidos e estado de pausa, globalmente ou por loja.

## Fluxo ponta a ponta

O teste local valida:

`solicitar emissão → snapshot → job deduplicado + Venda PENDENTE → lock do worker → emissão
simulada → job CONCLUIDO`.

Também há provas focadas de concorrência entre workers, lock alheio, heartbeat, takeover,
kill-test, retry/backoff, dead-letter, reprocessamento, cancelamento, pausa/despausa global e por
loja, dedupe, rollback do produtor, métricas, autenticação do endpoint e bloqueio de produção ou
provider real.

## Validações finais

Resultados da matriz completa:

- testes focados da fila/produtor/endpoint: `33/33`, zero falha;
- suíte `lib/fiscal`: `409 passed`, `16 skipped`, zero falha;
- `npm run test:fiscal-gate`: `12/12`, incluindo a evidência positiva `11/11`;
- `npx tsc --noEmit`: aprovado;
- ESLint dos arquivos alterados: aprovado;
- `npm run build`: aprovado, incluindo a nova rota dinâmica e 103 páginas estáticas;
- `git diff --check`: aprovado.

Aviso não bloqueante do ambiente local: a worktree foi validada com Node `24.14.1`, enquanto
`package.json` declara Node `20.x`. Instalação, geração Prisma, testes, typecheck, lint e build
concluíram com sucesso; o pipeline oficial deve continuar usando a versão declarada.

## Limites confirmados

- provider exclusivamente simulado;
- zero chamada externa e zero SEFAZ;
- zero certificado, CSC ou credencial real;
- zero produção;
- zero alteração ou ativação de `fiscalEnabled`;
- zero mudança em signing, XML ou tax-engine;
- zero reconciliador real;
- zero schema ou migration;
- zero UI de PDV;
- zero provisionamento de cron, scheduler ou worker dedicado.
