# FISCAL-PILOT-EMISSION-AUTHORIZATION-HANDOFF-022C — evidência

GOAL 022C · sucessor do 022B DONE (022 BLOCKED permanece). Handoff de autorização
entre o executor armado do piloto e o freio GOAL-011 no queue-worker: SOMENTE uma
EMISSAO de piloto comprovadamente autorizada preserva o resultado real do provider
sem ser reescrita para `provider_real_bloqueado`. **Zero transmissão SEFAZ.**

## Causa confirmada (auditoria pré-edição, HEAD `94cb339`)

- `lib/fiscal/queue/queue-worker.ts` (HEAD): o freio GOAL-011 isenta apenas
  `maisRestritivoQueTerminal`, `repeticaoDeConsultaSegura` (só CONSULTA),
  `inutilizacaoRealAutorizada`, `provaTipadaCoerente` (só CONTINGÊNCIA/CONSULTA do
  drill GOAL 020), `consultaResolvidaPeloPipeline` (só CONSULTA `consulta_*`) e
  `execution.simulado`. **Nenhuma exceção para EMISSAO real** — por isso a única
  EMISSAO do 022B (`cmu5exmz7000th24sz4fsb6yi`) foi reescrita para
  `FALHA`/`provider_real_bloqueado`, enquanto a CONSULTA posterior classificou
  `NOT_FOUND`/217 pelo contrato existente.
- `GOAL011_BLOCK_CONFIRMED=true`: EMISSAO armada (ativação one-shot + capability +
  authority válidas, `simulado=false`, `providerInvoked=true`) caía no
  `provider_real_bloqueado` porque o worker não reconhecia prova alguma do piloto.
- Estado 022B somente lido; evidência 022B imutável; nenhum job/nota do 022B
  reutilizado; `fiscalEnabled=false`; janela dormente; Production bloqueada.

## Implementação (diff restrito a `lib/fiscal/queue/**` + `lib/fiscal/homologation/**`)

1. `lib/fiscal/homologation/pilot-emission-gate.ts`
   - Binding da ativação passa a reter `notaFiscalId` (antes só loja+job).
   - `createPilotEmissionAuthorizationProof(activation, {jobId,storeId,notaFiscalId})`:
     nasce SOMENTE de ativação opaca consumida pelo ledger persistente one-shot,
     para o trio exato do consumo; vincula activationId + serviço literal
     `NFeAutorizacao4` + ambiente literal `HOMOLOGACAO` + janela vigente.
     Token opaco (`Symbol` + `WeakMap` privado + `Object.freeze`): objeto
     estrutural, spread, JSON ou booleano genérico NÃO são provas.
   - `consumePilotEmissionAuthorizationProof(proof, {trio, now})`: valida E consome
     (one-shot em memória). Falha de validação NÃO queima a prova.
2. `lib/fiscal/homologation/nfce-homologation-pilot-armed-wiring.ts`
   - Executor armado cria a prova da MESMA ativação consumida e a anexa ao
     resultado SOMENTE quando `providerInvoked === true`. Flags de auditoria
     (`simulado`/`externalTransmissionAttempted`) seguem exatamente as do
     boundary de transporte — nada fabricado.
3. `lib/fiscal/queue/queue-worker.ts` + `queue.types.ts`
   - Freio GOAL-011 continua DEFAULT DENY; nova isenção
     `provaPilotoEmissaoCoerente` EXCLUSIVA para job `EMISSAO` com prova válida e
     coerente (campo `pilotEmissionExternalAuthorization?: unknown` — a forma
     nunca é inspecionada, só a identidade).
   - Revisão independente (R1): `execution.providerInvoked === true` reconferido
     no freio ANTES de tocar na prova — prova válida isolada com
     `providerInvoked=false` continua `provider_real_bloqueado` e nem queima o
     one-shot. `externalTransmissionAttempted` não substitui `providerInvoked`.
   - Revisão independente (R2): o instante de referência da janela é o INÍCIO da
     execução (`startedAt`, relógio próprio do worker, anterior ao boundary) —
     resposta que chega após `expiresAt` NÃO invalida retroativamente a
     transmissão legitimamente autorizada; execução que começa após o expiry
     continua bloqueada. Sem flag booleana global.
   - Preservação: success/uncertain-after-boundary (via `maisRestritivo`)/
     throttled/processing/terminal atravessam com a semântica existente.

## Testes novos (41 its)

- `lib/fiscal/queue/queue-worker-goal022c-prova.test.ts` (29): A–I no nível do
  freio — success com prova ⇒ concluído; uncertain ⇒ consulta; sem prova ⇒
  bloqueado; forjadas (vazio/plausível/contingência/spread/JSON) ⇒ bloqueadas;
  mismatch job/store/nota/ativação + janela expirada ⇒ bloqueados; dormente
  incapaz; executor genérico e `allowRealProvider` ⇒ bloqueados; reuso ⇒
  bloqueado; CONSULTA 022B só no contrato existente (prova ignorada e não
  queimada); INUTILIZACAO/CONTINGÊNCIA intactas; piloto não autoriza outros tipos;
  R1 (prova válida + `providerInvoked=false` ⇒ bloqueado, sem queimar); R2
  (resposta após expiry ⇒ success preservado e uncertain ⇒ consulta; início
  pós-expiry ⇒ bloqueado). Discriminação provada: R1 e R2-cross-expiry falham
  contra o código pré-fix.
- `lib/fiscal/homologation/pilot-emission-authorization-handoff-022c.test.ts` (12):
  ciclo de vida da prova + integração offline
  consume→capability→authority→executor→worker→loopback (104+100 com chave
  ecoada) ⇒ concluído, com `simulado=false` asseverado (sem o que o teste seria
  trivial); incerto ⇒ consulta; PRODUCAO e kill-switch desarmado negam antes da
  rede sem consumir; spy em `globalThis.fetch` garante zero rede externa.

## Validações

- Suíte do GOAL: 40 arquivos / 746 passed / 3 skipped (pós-R1+R2; baseline pré-022C: 705).
- `npm run typecheck`: zero erros.
- ESLint focado nos 6 arquivos + `git diff --check`: limpos.
- `node scripts/track.mjs verify --all`: ver relatório final.

## Rede / produção

- `EXTERNAL_SEFAZ_CONTACT=false` · `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0`.
- Transportes reais nunca construídos nos testes (fakes injetados); autoridade
  produtiva `nodeSefazHttpsRuntimePorts` intocada; `PILOT_EMISSION_HOMOLOGATION_WINDOW`
  permanece `{null,null,null}` no git.
