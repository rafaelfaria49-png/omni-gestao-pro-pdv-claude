# FISCAL_UNCERTAIN_DRILL_001

## Identificação

- GOAL: `FISCAL-UNCERTAIN-STATE-RECONCILIATION-012`
- Branch: `fiscal/goal-012-uncertain-state`
- Worktree: `C:\Projetos\wt-fiscal-012`
- Base: `origin/main` / merge do PR #27 em
  `88ad22a2b4b016a55d24acabe3cf113362116480`
- Decisão ratificada: ADR-P07 no comando atual, registrada no próximo número global livre,
  **ADR-0017**, aceita por Rafael Faria em 2026-07-23.
- Referência histórica P08: preservada sem reescrita.
- Estado: validações finais pós-ratificação concluídas; artefato pronto para publicação somente na
  branch autorizada.

## Doutrina implementada

O pipeline seguro possui uma única fronteira de transmissão. Antes dela, a aplicação persiste
`storeId`, `vendaId`, `notaFiscalId`, modelo, ambiente, série, número, chave de acesso, XML assinado
e SHA-256 dos bytes UTF-8, com a nota em `TRANSMITINDO`.

Em retomada, o coordenador relê o XML persistido, confere o hash e não chama preparador, builder,
signer ou allocator. Timeout é `uncertain`, não erro transitório: o job de emissão fica
`AGUARDANDO_RETRY` com `proximaTentativaEm=null`, enquanto uma `CONSULTA` deduplicada passa a ser a
única autoridade.

O reconciliador cobre a janela em que o processo morre antes de criar a consulta: varre
`TRANSMITINDO` envelhecidas, com threshold mínimo/configurável, isolamento por `storeId`, pausa
global/por loja e respeito a lease válido.

## Matriz do drill

| Caso | Sequência simulada | Resultado esperado |
|---|---|---|
| A | transmissão → timeout → worker da consulta morre → takeover → consulta `AUTHORIZED` | nota autorizada; nenhuma retransmissão |
| B | transmissão → timeout → worker morre → takeover → consulta `NOT_FOUND` → retomada | segunda transmissão usa exatamente os bytes persistidos |
| C | transmissão → timeout → worker morre → takeover → consulta `REJECTED` | nota rejeitada; número consumido; `requiresInutilizacao=true` |

Todos os valores de loja, documento, chave, protocolo e XML do drill são sintéticos. O stub não
abre socket e declara `simulado=true`.

## Evidências automatizadas

- Drills A/B/C: `3/3` verdes.
- Cada caso prova takeover após expiração do lease de um worker morto.
- A chamada ao stub observa a nota já `TRANSMITINDO`, com chave e SHA-256 persistidos.
- Caso A: uma transmissão, uma consulta, zero retry.
- Caso B:
  - tentativa direta antes da consulta retorna `CONSULTATION_REQUIRED`;
  - duas capturas de transmissão possuem o mesmo base64, SHA-256 e chave;
  - `prepare`, builder, signer e allocator executam exatamente uma vez;
  - o número permanece `42` na fixture antes e depois da retomada.
- Caso C:
  - uma transmissão, uma consulta;
  - nota `REJEITADA`;
  - emissão em `FALHA` com `requiresInutilizacao=true`;
  - número preservado e nunca devolvido ao contador.
- Reconciliador: upsert concorrente converge para um único job; pausa e lease válido impedem
  criação prematura; threshold abaixo do mínimo falha fechado.
- Métricas: backlog `TRANSMITINDO`, idade da mais antiga, consultas pendentes, autorizadas por
  consulta, `NOT_FOUND` com retry liberado e rejeitadas aguardando inutilização.

## Destinos dos resultados

- `AUTHORIZED`: persiste os campos de autorização já existentes e conclui a nota/job. A política
  legal completa de retenção/storage do XML autorizado permanece no **GOAL-013**.
- `NOT_FOUND`: grava autorização consumível e agenda uma única retomada dos bytes exatos.
- `REJECTED`: mantém série/número consumidos, bloqueia reutilização e registra a necessidade de
  inutilização futura no **GOAL-019**; nenhuma chamada de inutilização existe neste GOAL.

## Limites confirmados

- zero SEFAZ e zero rede fiscal;
- zero provider real; somente stub/teste;
- zero produção e zero `tpAmb=1`;
- zero certificado, CSC ou credencial real;
- zero mudança de XML, signing ou tax-engine;
- zero mudança de schema ou migration;
- zero UI, KMS ou alteração de `fiscalEnabled`;
- zero provisionamento.

## Validações finais pós-ratificação

- testes focados de estado incerto, reconciliador, worker, adapter Prisma e produtor:
  **29/29**, zero falha;
- kill-tests A/B/C incluídos nos testes focados: três takeovers após expiração do lease, zero
  duplicidade;
- suíte completa `lib/fiscal`: **418 passed**, **16 skipped**, zero falha;
- `npm run test:fiscal-gate`: **12/12**, incluindo a evidência executável **11/11**;
- `npx tsc --noEmit`: aprovado;
- ESLint dos arquivos TypeScript alterados: aprovado;
- `npm run build`: aprovado, com Prisma Client gerado e build otimizado do Next.js concluído;
- `git diff --check`: aprovado;
- diff restrito à allowlist: confirmado;
- schema/migration: zero alteração.

O build e a suíte não deixaram artefatos versionados fora da allowlist. O snapshot do tax-engine
foi relido pelo Vitest, mas seu hash permaneceu idêntico ao `HEAD` e o metadata cache do Git foi
reconciliado sem alteração de conteúdo.
