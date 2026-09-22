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
- Suíte do GOAL local: `lib/fiscal/xml` + `signing` + `provider/sefaz` +
  `homologation` + `queue` + `scenario-battery` — 939 passed; 4 failed sendo
  3 `xmllint ausente no PATH` (ambiente Windows) + 0 de código (versão da bateria
  já atualizada para 023.0). `typecheck`, `eslint` focado e `git diff --check` verdes.
- E2E offline (`cstat588-compact-message.test.ts`, 25 testes): cadeia sintética até
  transporte fake com `D01E_SAFE=true` e pretty parado ANTES do fake socket
  (`send` nunca chamado); `fetch` global com spy prova zero rede externa.

## Publicação

- Plan PR #221 (plan-only) aberto; trabalho (código + testes + esta evidência) ainda
  NÃO commitado localmente nesta sessão — commit `goal(fiscal-023): ...`, push, work PR
  e `close` seguem após merge do #221 + sync + re-open (precedente #217/#220).
  Sem merge do work PR. Revisão independente obrigatória (risco ALTO).
