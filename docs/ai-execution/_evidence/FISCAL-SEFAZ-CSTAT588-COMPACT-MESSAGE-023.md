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
- `XSD=VALIDACAO_APROVADA_XSD_OFICIAL_XMLLINT` (P1-followup da revisão
  independente, sem tautologia e sem mock como prova): os EXATOS bytes fiscais
  do cenário 588 passam por `xmllint --noout --nonet --schema nfe_v4.00.xsd`
  versionado (`lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/`), antes de
  enviNFe/SOAP — `assertExactBytesPassamNoXsdOficial` em
  `lib/fiscal/xml/cstat588-compact-message.test.ts`. Sem xmllint no PATH o
  teste falha explicitamente como limitação de ambiente (mesmo padrão da B2,
  sem shim e sem skip); no CI Ubuntu o xmllint real executa e precisa passar.
  O mock de `readXsdAttestation` permanece APENAS para exercitar a fiação do
  guard 8, nunca como prova XSD.
- `MATRIX_588=023.0` — `588` em `NFeAutorizacao4`: `REJECTED`/`REJEICAO_FORMATO_D01E`,
  `terminal=true`, `numeroConsumido=false`, `requiresInutilizacao=false`,
  `requiresConsultation=false`, zero retry; em consulta/retorno/evento:
  `SERVICE_MISMATCH` (nunca vira rejeição de documento).
  Autoridade oficial versionada em
  `docs/fiscal/FISCAL_CSTAT588_AUTORIDADE_OFICIAL_023.md` (P1-followup):
  SEFAZ-SP FAQ oficial — rejeitada NÃO é gravada no banco (vs denegada:
  gravada, número morto); rejeição de formato → mesmo número e série,
  sanar e retransmitir (sustenta `numeroConsumido=false`,
  `requiresInutilizacao=false`, `terminal=true`, zero auto retry).
  MOC 7.0 Anexo I verbatim NÃO versionado no repo (lacuna explícita no doc);
  matriz inalterada (`CSTAT_588_MATRIX_CHANGED=false`), sem contradição
  oficial encontrada.
- `ENTITY_WHITESPACE_P2_DEFERRED=true` — backstop NÃO ampliado para
  `&#32;`/`&#10;` etc. (hardening futuro; produtores internos nunca emitem;
  semântica D01e oficial não prova cobertura de entidades).
- `EXTERNAL_SEFAZ_CONTACT=false` · `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0` · `NEON_WRITES=0`

## Regressões e validação

- Preservados: 100, 103/105, 108/109, 204, 217 (só consulta), 656, CONSULTA
  022B/022E, one-shot, default deny, Production block, authority opaca, zero retry,
  inutilização, contingência, standalone pretty.
- Evento/inutilização D01e-compactos PROVADOS (P2-followup):
  `lib/fiscal/xml/cstat588-produtores-compactos.test.ts` (8/8) — `envEvento`
  e `inutNFe` com `INTERTAG_FORMATTING_WHITESPACE=0`, sem CR/LF/TAB de
  formatação, conteúdo fiscal e estrutura preservados, compactos também após
  assinatura (splice); sem refatorar os módulos.
- Suíte do GOAL local (`lib/fiscal/xml` + `signing` + `provider/sefaz` +
  `homologation` + `queue` + `scenario-battery`): ver números atualizados no
  bloco follow-up abaixo. Falhas exclusivas de ambiente (`xmllint ausente no
  PATH` no Windows, sem shim e sem skip); zero falha de código.
  `npm run typecheck` exit 0, `eslint` focado zero erros, `git diff --check`
  limpo.
- E2E offline (`cstat588-compact-message.test.ts`): cadeia sintética até
  transporte fake com `D01E_SAFE=true`, XSD oficial real sobre os bytes exatos
  e pretty parado ANTES do fake socket (`send` nunca chamado); `fetch` global
  com spy prova zero rede externa.

## Follow-up P1/P2/P3 (revisão independente — `INDEPENDENT_REVIEW_VERDICT=CLEAR_FOR_MERGE_DECISION`, `P0=0`)

- `P1_XSD_TAUTOLOGY_REMOVED=true` — tautologia
  `const XSD = "VALIDACAO_APROVADA"` eliminada; perna XSD do e2e agora é
  xmllint real sobre os bytes exatos (mesmo pipeline até enviNFe/SOAP).
  Validação total no Windows: 24/25 (1 falha = `xmllint ausente`, ambiente
  por desenho); prova total requer CI Ubuntu verde (seção CI abaixo).
- `P1_588_OFFICIAL_DOC_VERSIONED=true` —
  `docs/fiscal/FISCAL_CSTAT588_AUTORIDADE_OFICIAL_023.md` (fatos oficiais
  A+B com verbatim SEFAZ-SP verificado em 2026-09-22, corroboração 022E,
  lacuna MOC explícita, reconciliação com ADR-0017).
  `NUMBER_REUSE_OFFICIAL_SUPPORT=true` (questões 2 e 32 do FAQ SEFAZ-SP).
  `CSTAT_588_MATRIX_CHANGED=false`.
- `EVENT_COMPACT_TEST=8/8` (`cstat588-produtores-compactos.test.ts`:
  evento 4/4 + inutilização 4/4) · `INUTILIZACAO_COMPACT_TEST=4/4`.
- `ENTITY_WHITESPACE_P2_DEFERRED=true` (ver bloco causa/correção).
- `EVIDENCE_CI_RUN_FIXED=true` — este arquivo agora referencia o run final.

## CI (run 35755411332 — `CI_RUN_FINAL`, work PR #222)

> Último run observado antes do follow-up (run 35751426049) para referência;
> após o push do follow-up exige-se run novo com Ubuntu Fiscal/XSD verde e
> assinatura idêntica no vermelho conhecido de `import/advanced`.

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
