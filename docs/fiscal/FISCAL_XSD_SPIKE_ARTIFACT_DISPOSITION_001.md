# Matriz de disposição dos artefatos dos spikes XSD

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-ADR-P01-DECISION-002A` |
| Data | 2026-07-14 |
| Decisão | B2 — `xmllint` provisionado em worker fiscal containerizado |
| Regra | classificar evidências; não copiar nem integrar spikes neste GOAL |

## 1. Legenda

- **PROMOVER:** incorporar deliberadamente em GOAL futuro, após revalidar base, hashes e escopo.
- **REESCREVER:** aproveitar requisitos/casos, mas produzir implementação nova aderente à ADR-0010
  e ao contrato do worker; não copiar o artefato experimental.
- **MANTER SOMENTE COMO EVIDÊNCIA:** preservar na branch do spike e referenciar na trilha de decisão;
  não entra no runtime definitivo.
- **DESCARTAR DA IMPLEMENTAÇÃO:** não usar na solução B2; histórico permanece no Git.

“Promover” não autoriza cherry-pick cego nem cópia nesta tarefa. O GOAL responsável deve conferir a
`origin/main` vigente, a proveniência oficial, os hashes e a allowlist antes de incorporar qualquer
arquivo.

## 2. Branches e commits de evidência

| Branch | HEAD lido | Papel |
|---|---|---|
| `origin/fiscal/goal-002-xsd-official` | `f7026bc165b0789a20c52901e9b57830414a4ddd` | pesquisa oficial e decisão preliminar |
| `origin/fiscal/goal-002-xsd-wasm-spike` | `c0ec48da6a579ffea49d6b7bba87bc87a3b00f95` | spike eliminatório A |
| `origin/fiscal/goal-002-xmllint-native-spike` | `7aee00ec7c81278445a982b85542c89de02957f7` | spike eliminatório B1/B2 |

## 3. Pesquisa e documentação

| Caminho | Branch de origem | Finalidade | Classificação | Justificativa | GOAL futuro responsável |
|---|---|---|---|---|---|
| `docs/fiscal/FISCAL_XSD_RESEARCH_001.md` | oficial; replicado em WASM/nativa | fonte oficial, diagnóstico do no-op e limites do leiaute | **PROMOVER** | evidência de procedência e requisitos ainda necessária à implementação | GOAL-002 · implementação B2 |
| `docs/fiscal/FISCAL_XSD_MANIFEST_001.md` | oficial; replicado em WASM/nativa | hashes, entrypoint e grafo dos cinco XSDs | **PROMOVER** | será fonte do manifesto de integridade, após nova captura oficial | GOAL-002 · empacotamento XSD |
| `docs/fiscal/FISCAL_XSD_VALIDATOR_OPTIONS_001.md` | oficial; replicado em WASM/nativa | comparação A/B/C anterior aos spikes | **PROMOVER** | preserva alternativas e contexto; ADR-0010 registra a decisão posterior | GOAL-002 · integração documental |
| `docs/fiscal/FISCAL_XSD_WASM_SPIKE_001.md` | WASM; replicado na nativa | resultado funcional e rejeição da versão A | **MANTER SOMENTE COMO EVIDÊNCIA** | a implementação escolhida não usa o wrapper testado | integração da ADR / reavaliação WASM futura |
| `docs/fiscal/FISCAL_XSD_SECURITY_REVIEW_001.md` | WASM; replicado na nativa | cadeia npm, libxml2 embutido e CVEs | **MANTER SOMENTE COMO EVIDÊNCIA** | fundamenta a rejeição de `xmllint-wasm@5.2.0` | GOAL futuro de reavaliação WASM |
| `docs/fiscal/FISCAL_XSD_PACKAGING_REPORT_001.md` | WASM; replicado na nativa | tracing Next/Vercel do worker WASM | **MANTER SOMENTE COMO EVIDÊNCIA** | técnica de tracing não é o deployment B2 decidido | GOAL futuro de reavaliação WASM |
| `docs/fiscal/FISCAL_XSD_NATIVE_SPIKE_001.md` | nativa | resultados B1/B2 e contrato experimental | **MANTER SOMENTE COMO EVIDÊNCIA** | comprova a decisão, mas não é especificação de produção | GOAL-002 · implementação B2 |
| `docs/fiscal/FISCAL_XSD_NATIVE_SECURITY_REVIEW_001.md` | nativa | ameaça, controles e risco residual | **MANTER SOMENTE COMO EVIDÊNCIA** | os controles obrigatórios foram consolidados na ADR/contrato | GOAL-002 · segurança/hardening |
| `docs/fiscal/FISCAL_XSD_NATIVE_DEPLOYMENT_REPORT_001.md` | nativa | build, artefatos, métricas e destinos | **MANTER SOMENTE COMO EVIDÊNCIA** | medições são de spike/CI, não SLO nem manifesto produtivo | GOAL-002 · container/CI |

## 4. Schemas oficiais

### 4.1 Candidato a localização canônica

| Caminho | Branch de origem | Finalidade | Classificação | Justificativa | GOAL futuro responsável |
|---|---|---|---|---|---|
| `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/DFeTiposBasicos_v1.00.xsd` | WASM | tipos básicos DF-e oficiais | **PROMOVER** | bytes oficiais necessários ao grafo; recapturar e conferir hash antes de incorporar | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/leiauteNFe_v4.00.xsd` | WASM | leiaute principal NF-e/NFC-e 4.00 | **PROMOVER** | arquivo central do grafo oficial | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd` | WASM | entrypoint do documento `NFe` | **PROMOVER** | entrypoint oficial; destino final pode mudar por decisão de packaging | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/tiposBasico_v4.00.xsd` | WASM | tipos básicos do leiaute 4.00 | **PROMOVER** | dependência oficial hasheada | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/xmldsig-core-schema_v1.01.xsd` | WASM | schema XMLDSig local | **PROMOVER** | dependência oficial; não usar cópia externa | GOAL-002 · empacotamento XSD |

“PROMOVER” aqui significa recapturar o ZIP oficial, verificar o SHA-256 do ZIP e de cada arquivo,
comparar bytes com a evidência e só então versionar. O caminho final deve ser acessível ao build da
imagem, sem amarrar o domínio ao layout de um spike.

### 4.2 Cópias específicas do spike nativo

| Caminho | Branch de origem | Finalidade | Classificação | Justificativa | GOAL futuro responsável |
|---|---|---|---|---|---|
| `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/DFeTiposBasicos_v1.00.xsd` | nativa | cópia isolada para o harness B2 | **DESCARTAR DA IMPLEMENTAÇÃO** | duplicata de caminho experimental; usar uma fonte canônica verificada | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/leiauteNFe_v4.00.xsd` | nativa | cópia isolada para o harness B2 | **DESCARTAR DA IMPLEMENTAÇÃO** | evita dois manifestos/pacotes divergentes | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd` | nativa | entrypoint do harness | **DESCARTAR DA IMPLEMENTAÇÃO** | o entrypoint definitivo vem da fonte canônica | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/tiposBasico_v4.00.xsd` | nativa | cópia isolada para o harness B2 | **DESCARTAR DA IMPLEMENTAÇÃO** | duplicata desnecessária | GOAL-002 · empacotamento XSD |
| `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/xmldsig-core-schema_v1.01.xsd` | nativa | cópia isolada para o harness B2 | **DESCARTAR DA IMPLEMENTAÇÃO** | duplicata desnecessária; manter XMLDSig local na fonte canônica | GOAL-002 · empacotamento XSD |

## 5. Artefatos do spike WASM

| Caminho | Branch de origem | Finalidade | Classificação | Justificativa | GOAL futuro responsável |
|---|---|---|---|---|---|
| `lib/fiscal/xsd/xmllint-wasm-spike.ts` | WASM | wrapper experimental em Worker Thread | **DESCARTAR DA IMPLEMENTAÇÃO** | versão avaliada foi rejeitada por segurança; B2 usa processo/container | eventual reavaliação WASM |
| `lib/fiscal/xsd/xmllint-wasm-spike.test.ts` | WASM | testes do wrapper WASM | **DESCARTAR DA IMPLEMENTAÇÃO** | acoplado à API e falhas do wrapper rejeitado; casos devem migrar, não o arquivo | GOAL-002 · testes B2 |
| `lib/fiscal/xsd/__fixtures__/nfce-xsd-spike-fixtures.ts` | WASM e nativa | corpus sintético válido, inválido e malicioso | **PROMOVER** | casos são úteis e não contêm dado/segredo real; revisar nomes e contrato | GOAL-002 · testes B2 |
| `scripts/fiscal/xsd-wasm-spike-metrics.test.ts` | WASM | cold/warm/RSS do wrapper WASM | **MANTER SOMENTE COMO EVIDÊNCIA** | números não se aplicam ao worker B2 | eventual reavaliação WASM |
| `scripts/fiscal/verify-xsd-wasm-packaging.mjs` | WASM | verifica tracing de WASM/XSD no Next | **DESCARTAR DA IMPLEMENTAÇÃO** | B2 não executa na função Vercel e não empacota WASM | eventual reavaliação WASM |
| `next.config.mjs` (sentinela `outputFileTracingIncludes`) | WASM | força assets do spike no bundle | **DESCARTAR DA IMPLEMENTAÇÃO** | era sentinela experimental; execução direta na Vercel foi rejeitada | eventual reavaliação WASM |
| `package.json` (`xmllint-wasm@5.2.0`) | WASM | dependência exata do spike | **DESCARTAR DA IMPLEMENTAÇÃO** | pacote/versão rejeitado; B2 não requer dependência npm equivalente | eventual reavaliação WASM |
| `package-lock.json` (lock do spike) | WASM | resolve pacote do spike | **DESCARTAR DA IMPLEMENTAÇÃO** | não integrar lock experimental | eventual reavaliação WASM |

## 6. Artefatos do spike nativo B1/B2

| Caminho | Branch de origem | Finalidade | Classificação | Justificativa | GOAL futuro responsável |
|---|---|---|---|---|---|
| `lib/fiscal/xsd-native/xmllint-native-spike.ts` | nativa | runner isolado e controles do processo | **REESCREVER** | requisitos são válidos, mas o adaptador definitivo deve obedecer ao contrato de job/container e não expor detalhes do spike | GOAL-002 · worker/adaptador B2 |
| `lib/fiscal/xsd-native/xmllint-native-spike.test.ts` | nativa | testes unitários do runner/harness | **REESCREVER** | migrar casos para contratos definitivos e novos estados; não promover módulo experimental | GOAL-002 · testes B2 |
| `lib/fiscal/xsd-native/xmllint-native-spike.integration.test.ts` | nativa | execução real do binário provisionado | **REESCREVER** | manter prova real, acrescentando imagem, fila, limites externos, idempotência e health | GOAL-002 · integração/container |
| `scripts/fiscal/xsd-native-spike-metrics.test.ts` | nativa | métricas cold/warm/concurrency do spike | **MANTER SOMENTE COMO EVIDÊNCIA** | baseline útil, mas RSS não mede pico do filho e não define SLO | GOAL-002 · performance/capacity |
| `.github/workflows/fiscal-xsd-native-spike.yml` | nativa | build source+patch e matriz Windows/Linux | **REESCREVER** | pipeline produtivo precisa imagem Linux por digest, SBOM, scan, assinatura, limites e canário; Windows pode permanecer teste de desenvolvimento | GOAL-002 · supply chain/CI |

## 7. Disposição por categoria

| Categoria | Resultado arquitetural |
|---|---|
| documentos | promover pesquisa/manifesto/opções; manter relatórios dos spikes como evidência |
| código WASM | descartar da implementação B2 |
| código nativo | reescrever como adaptador/worker definitivo |
| fixtures | promover após revisão e manter somente dados sintéticos |
| testes | reescrever contra contrato, estados e container reais |
| workflow CI | reescrever para supply chain de imagem, SBOM e scan |
| métricas | manter como baseline de evidência; repetir em ambiente definitivo |
| manifests | promover o manifesto XSD; criar manifestos novos de imagem/binário/SBOM |
| schemas | promover uma única cópia canônica após recaptura oficial; descartar duplicata do spike |
| scripts | descartar scripts WASM; reescrever automação B2 quando necessária |

## 8. Guardrails para o GOAL de implementação

- partir de `origin/main`, não de uma branch de spike;
- não fazer merge/rebase/cherry-pick do spike inteiro;
- criar arquivos com nomes definitivos, sem sufixo `spike`;
- recapturar fonte/libxml2, patch e XSDs oficiais e rever hashes/data;
- manter `validarXsd` desconectado até o worker e seus gates passarem por revisão humana;
- não reutilizar a sentinela Vercel ou a dependência WASM rejeitada;
- tratar B1 apenas como caso negativo de teste;
- manter a branch nativa e seus runs como evidência auditável.
