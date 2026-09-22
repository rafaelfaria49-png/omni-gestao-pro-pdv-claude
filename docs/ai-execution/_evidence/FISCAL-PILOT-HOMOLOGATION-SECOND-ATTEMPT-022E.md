# FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E — evidência

GOAL 022E · segunda e única tentativa controlada de NFC-e em HOMOLOGACAO sobre o
runtime 022D. Halt G-F7-2 observado; após autorização textual, UMA emissão;
resultado incerto após boundary → somente CONSULTA, que classificou `NOT_FOUND`
(217). Nenhuma segunda EMISSAO, nenhum retry. Kill-switch OFF. Janela versionada
dormente. Production OFF. Segredos não versionados nem impressos.

## Identidade

- `GOAL=FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E`
- `BASE_MAIN=469b3aa2ce9fd2bd35abc10856fea4f4dc8dac16` (origin/main com PR #217 / plan 022E)
- `TRACK=fiscal` · attempt 1/3
- `DATABASE_MATCH=true` · Neon `omnigestao_prod` · loja-1
- `SECRETS_EXPOSED=false`
- `PILOT_EMISSION_HOMOLOGATION_WINDOW` no git permanece `{null,null,null}`
- Runtime 022D intacto: `4f72e606` ancestral; `verify --all` verde; suíte do GOAL
  746 passed / 3 skipped antes da preparação externa

## Documento piloto (writers canônicos)

| Peça | Id | Prova |
| --- | --- | --- |
| Produto | `cmubufygs0001h2mcjk4ws5p1` | ProductWriteService · SKU `GOAL022ENFCEHOMOLOG` · sem barcode · NCM 85176200/CFOP 5102/CSOSN 102/origem 0/UN/UN · inativo ao final |
| Venda | `cmubufz1v000ch2mc5fknbpy6` | persistSaleV2 · pedido `VDA-L01-2026-000488` · total R$ 1,00 · dinheiro · cashTendered 1,00 · tPag=01 |
| Caixa dedicado | `cmubufytz000ch2mcib062l0n` | terminal `HOMOLOG-022E` · abertura R$ 0,00 · fechado · saldoFinal=1 · sessão RAFAEL preservada |
| NotaFiscal | `cmubufzhb000mh2mcvwan5e2m` | requestFiscalEmissionWithJob + allocateFiscalNumber · série 1 número 2 · modelo NFCE · tpAmb 2 · UF SP · snapshot hash `76c12494…` = preparado |
| Job EMISSAO | `cmubufzmf000ph2mcu6act9zk` | dedupe `fiscal:emissao:v1:venda:cmubufz1v000ch2mc5fknbpy6` · AGUARDANDO_RETRY tentativas=1 (uma tentativa, zero retry executado) |
| Job CONSULTA | `cmuchau0k0009h21ck7yhtf7x` | dedupe `fiscal:consulta:v1:nota:cmubufzhb000mh2mcvwan5e2m` · CONCLUIDO tentativas=1 |
| Chave | `35260948241205000195650010000000021026842710` | 44 dígitos · re-derivada idêntica pré-rede (builder determinístico) · distinta da 022B |

## Offline pré-SEFAZ (halt G-F7-2)

- modelo 65 · tpAmb 2 · UF SP · tPag 01
- XML preparado em memória pelo preparer canônico (snapshot congelado + A1 + QR HOMOLOGACAO)
- XMLDSig `valido=true` (`digestConfere=true`, `assinaturaConfere=true`, `verifyNfceSignature`)
- XSD worker run `34833154637` (imagem `goal005a`, sem rebuild) · `health=200` · `ready=200` · `VALIDACAO_APROVADA` sobre os bytes preparados
- `transmissions=0` · `budget=1` · `Production=false` · `fiscalEnabled=false` · janela dormente

## Transmissão (uma) + classificação

1. Revalidação total pré-rede: job PENDENTE/tentativas=0, nota RASCUNHO série 1 nº 2, hash igual, chave re-derivada idêntica, config inalterada, transmissions=0.
2. Janela runtime ≤10min (só via `deps`, nunca no código) + `fiscalEnabled=true` (loja-1) + `executePilotHomologationEmissionTransmission` UMA vez.
3. Ledger one-shot consumido (`pilot-emissao-022e-…`); `persist_before_transmission` gravou XML/chave; provider retornou desfecho incerto (`cStat 588 não consta da matriz 018.2`).
4. Outcome `consulta`: EMISSAO estacionada (`AGUARDANDO_RETRY`, tentativas=1, sem retry executado); CONSULTA deduplicada criada pelo fluxo canônico (não é segunda EMISSAO).
5. `executePilotHomologationConsultationTransmission` UMA vez (authority `NFeConsultaProtocolo4`): CONCLUIDO — `consulta_not_found` / `NOT_FOUND` (217).
6. Log `fiscal.pilot.consulta_not_found_sem_retransmissao`: retransmissão bloqueada neste GOAL. Nenhuma segunda EMISSAO criada nem autorizada em uso.

`NotaFiscal.status` permanece `TRANSMITINDO` (SEFAZ não conhece a chave). `cStat`/`protocolo` não foram gravados na nota — classificação vive no job CONSULTA + FiscalLog.

## Kill-switch / rede

- `fiscalEnabled` final = `false`
- janela git = dormente
- `PRODUCTION_CONTACT=false` (ambiente HOMOLOGACAO ponta a ponta, nenhum tpAmb=1)
- `SECOND_EMISSION_CREATED=false` (jobs da venda: exatamente 1 EMISSAO + 1 CONSULTA)
- `SALE_ROLLBACK=false`
- `AUTOMATIC_RETRIES` executados = 0 (EMISSAO tentativas=1 da tentativa única; CONSULTA tentativas=1)

## Código publicado (allowlist)

- Nenhuma semântica nova em `lib/fiscal/**` (zero diff em código). Herança de revisão
  independente 022C/022D preservada — sem `NEEDS_INDEPENDENT_REVIEW`.
- Esta evidência + adendo de status. Orquestradores efêmeros em `import/` (gitignored).

## Gates locais

- testes GOAL: 746 passed / 3 skipped (`lib/fiscal/homologation` · `lib/fiscal/queue` · `lib/fiscal/provider/sefaz` · `test/fiscal/scenario-battery`)
- `npm run typecheck`: exit 0
- ESLint focado: zero erros
- diff-check: só `docs/ai-execution/_evidence/**` (+ status se tocado)
