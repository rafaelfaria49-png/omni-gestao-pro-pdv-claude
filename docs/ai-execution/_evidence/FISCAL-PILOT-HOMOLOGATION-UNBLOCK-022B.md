# FISCAL-PILOT-HOMOLOGATION-UNBLOCK-022B — evidência

GOAL 022B · sucessor do 022 BLOCKED. Documento piloto canônico criado; uma
transmissão de documento em HOMOLOGACAO; CONSULTA classificou `NOT_FOUND`
(217). Nenhuma segunda EMISSAO. Kill-switch OFF. Janela versionada dormente.
Production OFF. Segredos não versionados nem impressos.

## Identidade

- `GOAL=FISCAL-PILOT-HOMOLOGATION-UNBLOCK-022B`
- `BASE_MAIN=239f9f6034edd51d55d8c6f7e45515f11ab42cc1` (origin/main com PR #197 / plan 022B e runtime 022 PR #196)
- `TRACK=fiscal` · attempt 1/3
- `DATABASE_MATCH=true` · Neon `omnigestao_prod` · loja-1
- `SECRETS_EXPOSED=false`
- `PILOT_EMISSION_HOMOLOGATION_WINDOW` no git permanece `{null,null,null}`

## Documento piloto (writers canônicos)

| Peça | Id | Prova |
| --- | --- | --- |
| Produto | `cmu5exl5d0003h24smn7wqm3h` | ProductWriteService · SKU `GOAL022BNFCEHOMOLOG` · sem barcode · NCM/CFOP/CSOSN/origem da fixture · inativo ao final |
| Venda | `cmu5exm1s000eh24sjfhdvf7u` | persistSaleV2 · pedido `VDA-L01-2026-000473` · total R$ 1,00 · tPag=01 · estoque Δ=1 |
| Caixa dedicado | `cmu5exllw000ch24s8fkc4vzl` | terminal `HOMOLOG-022B` · abertura R$ 0,00 · fechado · saldoFinal=1 · sessão RAFAEL preservada |
| NotaFiscal | `cmu5exmri000qh24suft83gdc` | requestFiscalEmissionWithJob · série 1 número 1 · modelo NFCE · tpAmb 2 · XML 7340 B · XMLDSig ok · XSD `VALIDACAO_APROVADA` |
| Job EMISSAO | `cmu5exmz7000th24sz4fsb6yi` | dedupe `fiscal:emissao:v1:venda:cmu5exm1s000eh24sjfhdvf7u` · FALHA tentativas=1 |
| Job CONSULTA | `cmu5ffjvc000fh2t8avuxmznf` | dedupe `fiscal:consulta:v1:nota:cmu5exmri000qh24suft83gdc` · CONCLUIDO tentativas=3 |

## Offline pré-SEFAZ

- modelo 65 · tpAmb 2 · cUF 35 · UF SP
- hash snapshot persistido = preparado (`d582d2f6…`)
- tributação MEI CRT 4 / CSOSN 102 (motor F2 passou a aceitar MEI na família Simples)
- pagamento tPag=01
- XSD worker run `34833154637` · libxml2 2.15.3 · sem rebuild
- endpoint Production recusado pelo catálogo

## Transmissão (uma) + classificação

1. `executePilotHomologationEmissionTransmission` uma vez (após correção de lookup `select.id`).
2. Ledger one-shot consumido (`pilot-emissao-022b-20260917T110849-30a049d6`).
3. `persist_before_transmission` gravou XML/chave; o worker GOAL-011 reescreveu o job EMISSAO para `FALHA` (`provider_real_bloqueado`) e criou CONSULTA.
4. CONSULTA via `executePilotHomologationConsultationTransmission` + authority `NFeConsultaProtocolo4` (não é segunda EMISSAO).
5. Desfecho persistido: `consulta_not_found` / `consultationOutcome=NOT_FOUND`.
6. Wrapper recusou `authorizeExactRetransmission` (`fiscal.pilot.consulta_not_found_sem_retransmissao`).
7. EMISSAO permanece `FALHA` · `retryAuthorizedAt=null` · `emissaoCount=1`.

`NotaFiscal.status` permanece `TRANSMITINDO` (SEFAZ não conhece a chave). `cStat`/`protocolo` não foram gravados na nota — classificação vive no job CONSULTA + FiscalLog.

## Kill-switch / rede

- `fiscalEnabled` final = `false`
- janela git = dormente
- `PRODUCTION_CONTACT=false`
- `SECOND_EMISSION_CREATED=false`
- `SALE_ROLLBACK=false`
- `AUTOMATIC_RETRIES` de EMISSAO = 0
- CONSULTA teve duas tentativas pré-boundary (XML/UF no `load`) e uma leitura SOAP que classificou NOT_FOUND

## Código publicado (allowlist)

- MEI no motor F2 (CSOSN 102 / DAS)
- lookup do executePilot inclui `id`
- authority + wiring de CONSULTA homologação (one-shot, HOMOLOGACAO, sem ledger de documento)
- GOAL-011 aceita `consulta_*` com provider invocado
- `load()` rederiva hash do XML persistido e restaura `uf`/`correlationId` (payload do job EMISSAO pode perder `document` no rewrite GOAL-011)

## Gates locais

- testes GOAL: 780 passed / 3 skipped
- `npm run typecheck`: zero erros (orquestradores gitignored `import/022b/*.ts` com `@ts-nocheck`; não versionados)
- ESLint focado: zero erros
- diff-check: apenas `lib/fiscal/**`, `docs/ai/CURRENT_STATUS.md`, `docs/ai-execution/_evidence/**`
