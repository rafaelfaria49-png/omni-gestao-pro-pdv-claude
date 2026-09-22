# FISCAL-SEFAZ-CSTAT588-COMPACT-MESSAGE-023 — evidência

GOAL 023 · causa mecânica do cStat 588 eliminada offline. Serialização EMBUTÍVEL
compacta (D01e), backstop fail-closed no envelope e matriz 588 versionada.
ZERO transmissão SEFAZ, ZERO Neon writes, nenhum XML/certificado/CSC/secret real.

## Causa e correção

- `CSTAT_588_OFFICIAL_CAUSE=D01e (caracteres de edição no início/fim da mensagem ou entre tags; SEFAZ-SP)`
- `ROOT_CAUSE_REPRODUCED=true` — cadeia `serializeXml` (pretty + join `\n`) →
  `serializeXmlEmbeddable` (reutilizava pretty e aprovava) → signer/enviNFe/envelope
  (preservam bytes) transmitia whitespace de formatação. Prova com documento
  sintético equivalente (snapshot `venda-023`, item `CABO USB C` x2, série 1 nº 42).
- `PRE_FIX_INTERTAG_WHITESPACE=120` (assinável pré-fix, `>([ \t\r\n]+)<`)
- `POST_FIX_INTERTAG_WHITESPACE=0` (embutível, assinado, enviNFe e área de dados SOAP)
- `EMBEDDABLE_COMPACT=true` · `SIGNED_XML_COMPACT=true` · `ENVINFE_COMPACT=true` ·
  `SOAP_DATA_AREA_COMPACT=true` · standalone segue pretty com declaração (preservado)
- `D01E_BACKSTOP=bytes_fiscais_com_espaco_d01e` — envelope recusa pretty/adversarial
  (`</tag>\n<tag>`, `</tag>   <tag>`, TAB/CR/LF, bordas) e aceita `CABO USB C`;
  apenas recusa, nunca limpa bytes assinados (ADR-0017/0018)
- `XMLDSIG=true` (`valido`, `digestConfere`, `assinaturaConfere`, Reference ao infNFe;
  Signature compacta, sem LF introduzida; sem reutilizar assinatura de pretty)
- `XSD=VALIDACAO_APROVADA` (atestado vinculado aos mesmos bytes nos guards; xmllint
  real da B2 roda no CI Ubuntu — local Windows sem xmllint, 3 testes de QR/infNFeSupl
  com falha exclusiva de ambiente, sem relação com a mudança)
- `MATRIX_588=023.0` — `588` em `NFeAutorizacao4`: `REJECTED`/`REJEICAO_FORMATO_D01E`,
  `terminal=true`, `numeroConsumido=false`, `requiresInutilizacao=false`,
  `requiresConsultation=false`, zero retry; em consulta/retorno/evento:
  `SERVICE_MISMATCH` (nunca vira rejeição de documento)
- `EXTERNAL_SEFAZ_CONTACT=false` · `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0` · `NEON_WRITES=0`

## Regressões e validação

- Preservados: 100, 103/105, 108/109, 204, 217 (só consulta), 656, CONSULTA
  022B/022E, one-shot, default deny, Production block, authority opaca, zero retry,
  inutilização, contingência, standalone pretty, evento/inutilização compactos.
- Suíte do GOAL local (`lib/fiscal/xml` + `signing` + `provider/sefaz` +
  `homologation` + `queue` + `scenario-battery`): 940 passed / 3 failed / 19 skipped.
  As 3 falhas são exclusivas de ambiente (`xmllint ausente no PATH` no Windows,
  sem shim e sem skip); zero falha de código. `npm run typecheck` exit 0,
  `eslint` focado zero erros, `git diff --check` limpo.
- E2E offline (`cstat588-compact-message.test.ts`, 25/25): cadeia sintética até
  transporte fake com `D01E_SAFE=true` e pretty parado ANTES do fake socket
  (`send` nunca chamado); `fetch` global com spy prova zero rede externa.

## CI (run 35751426049, work PR #222)

- `Unit and contract (ubuntu-24.04)` = PASS — autoridade XSD: xmllint/libxml2 real
  executado; `nfce-xml-builder.test.ts` 67/67, `sefaz-envelope.test.ts` 107/107,
  `scenario-battery` 13/13.
- `Unit and contract (windows-2022)` = PASS.
- `Vercel` = PASS.
- `Container, offline integration and supply chain` = RED por 14 falhas
  exclusivamente em `app/api/import/advanced/route.test.ts`, causa observada em
  `lib/cadastros/hub-api-gate.ts` (`getVerifiedSubscriptionFromCookies()` null).
  Esses arquivos NÃO pertencem ao diff do PR #222 (só `lib/fiscal/**`,
  `test/fiscal/**` e esta evidência); falha pré-existente fora do escopo Fiscal,
  com precedente no GOAL 022B. Reproduzida localmente idêntica (14/14).

## Publicação

- `PLAN_PR_221=MERGED` · `PLAN_MERGE_SHA=63c902c` (merge normal, plan-only).
- `WORK_COMMIT=b9212e5` (`goal(fiscal-023): mensagem compacta D01e + backstop +
  matriz cStat 588 (zero SEFAZ)`, 11 arquivos, +654/−18, sem amend/squash).
- `WORK_PR=#222 OPEN / UNMERGED` — `WORK_PR_MERGE_AUTHORIZED=false`.
  Revisão independente obrigatória (risco ALTO).
- `HUMAN_WAIVER_SCOPE=review-readiness-only` — waiver humano cobre somente o avanço
  até `READY_FOR_INDEPENDENT_REVIEW_WITH_WAIVER` (container RED pré-existente +
  xmllint local); não autoriza merge, SEFAZ, Production, `fiscalEnabled=true`,
  documento fiscal novo ou G-F7.
