# Manifesto do pacote XSD oficial da NFC-e — GOAL-002

## 1. Identificação da captura

| Item | Valor |
|---|---|
| Autoridade | Portal Nacional da NF-e |
| Índice oficial | `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D` |
| URL oficial do arquivo | `https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=akib2DRpJN4%3D` |
| Nome HTTP do arquivo | `PL_010e_v1.02.zip` |
| Rótulo no Portal | `Schemas XML NF-e - 010e v.1.02 - NT 2025.002 v.1.40, NT 2026.002 v.1.0 e NT 2026.003 v.1.0` |
| Publicação informada | 10/07/2026 |
| Captura | 13/07/2026, `America/Sao_Paulo` |
| Tipo de conteúdo recebido | `application/zip` |
| Tamanho do ZIP | 41.335 bytes |
| SHA-256 do ZIP | `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1` |

O download foi feito diretamente do domínio oficial, validado como ZIP pelo tipo de conteúdo e pela assinatura `PK`, e extraído somente em diretório temporário. No spike posterior autorizado, os cinco XSDs necessários foram copiados byte a byte para `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/` e conferidos contra este manifesto. Nenhum executável desconhecido foi baixado.

## 2. Arquivos necessários e hashes

Todos os arquivos estão sob `PL_010e_v1.02/NFe/` dentro do ZIP oficial.

| Arquivo | Tamanho | SHA-256 | Papel |
|---|---:|---|---|
| `nfe_v4.00.xsd` | 716 bytes | `adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df` | entrypoint; declara o elemento raiz `NFe` |
| `leiauteNFe_v4.00.xsd` | 352.527 bytes | `598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7` | estrutura principal NF-e/NFC-e 4.00 |
| `tiposBasico_v4.00.xsd` | 22.532 bytes | `772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047` | tipos básicos do leiaute 4.00 |
| `DFeTiposBasicos_v1.00.xsd` | 61.958 bytes | `7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2` | tipos básicos compartilhados de DF-e |
| `xmldsig-core-schema_v1.01.xsd` | 3.747 bytes | `f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac` | schema da assinatura XML DSig |

Os cinco arquivos são necessários. O validador não deve buscar uma cópia externa de `xmldsig-core-schema_v1.01.xsd`, mesmo que reconheça seu namespace; deve usar exclusivamente o arquivo hasheado do pacote.

Os hashes da tabela usam os bytes brutos oficiais. O ZIP mistura finais de linha: `nfe_v4.00.xsd` e `xmldsig-core-schema_v1.01.xsd` usam CRLF, enquanto os demais usam LF. Como o Git pode normalizar XML textual por plataforma, o spike primeiro aceita o hash bruto e, como único fallback, canonicaliza `CRLF` para `LF`. Os hashes LF dos dois arquivos originalmente CRLF são, respectivamente, `920fd7c04a35b49d0b7f56792e650e63cef76cf1b23f10995b1bbec1f0202774` e `78f924e7c9cbeb1e4be900b3b1e7faf2d901972635842980fd43dabb533c512b`. Qualquer outra diferença continua falhando fechado; os bytes entregues ao parser não são reescritos.

## 3. Grafo de imports/includes

```text
nfe_v4.00.xsd
└── xs:include leiauteNFe_v4.00.xsd
    ├── xs:import xmldsig-core-schema_v1.01.xsd
    │   namespace: http://www.w3.org/2000/09/xmldsig#
    ├── xs:include tiposBasico_v4.00.xsd
    └── xs:include DFeTiposBasicos_v1.00.xsd
```

Não foram encontrados outros `xs:include` ou `xs:import` nos três arquivos folha. A compilação local de pesquisa do entrypoint, com resolução relativa em disco, terminou com sucesso e produziu dois namespaces compilados: NF-e e XMLDSig.

## 4. Entry point e regra de resolução offline

Para validar o XML da NFC-e assinado como documento `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">`, o entrypoint é `nfe_v4.00.xsd`.

Na futura implementação, a resolução deve seguir uma allowlist fechada:

| Referência solicitada | Recurso permitido |
|---|---|
| `leiauteNFe_v4.00.xsd` | arquivo local com hash `598c…bf7` |
| `tiposBasico_v4.00.xsd` | arquivo local com hash `7726…047` |
| `DFeTiposBasicos_v1.00.xsd` | arquivo local com hash `7fe1…6d2` |
| `xmldsig-core-schema_v1.01.xsd` | arquivo local com hash `f567…1ac` |

Qualquer URL, caminho absoluto, traversal (`..`), DTD, entidade externa ou nome fora da allowlist deve falhar fechado. A validação em produção não deve depender do Portal Nacional nem de qualquer outra rede.

## 5. Procedência e reprodutibilidade

Procedimento reproduzível de atualização futura, ainda não executado no repositório:

1. consultar a página oficial de Esquemas XML;
2. registrar o rótulo, a publicação, a URL e a data/hora de captura;
3. baixar o ZIP sem executar conteúdo;
4. verificar formato e listar entradas antes da extração;
5. rejeitar caminho absoluto ou traversal dentro do ZIP;
6. calcular SHA-256 do ZIP e de cada XSD;
7. extrair imports/includes e comprovar que o grafo fecha localmente;
8. compilar o entrypoint com rede bloqueada;
9. revisar a diferença contra o pacote versionado anterior;
10. só então, mediante aprovação aplicável, versionar os arquivos e atualizar este manifesto.

Uma mudança de bytes com o mesmo nome de pacote deve ser tratada como incidente de proveniência, não como atualização automática.

## 6. Status neste ciclo

- Manifesto documental criado: sim.
- Pacote identificado e hasheado: sim.
- Grafo fechado e compilado localmente: sim.
- Arquivos XSD copiados para o repositório: sim, no diretório versionado indicado acima.
- Dependência de spike adicionada: sim, `xmllint-wasm@5.2.0`, versão exata.
- Validador de produção implementado: não; existe apenas uma camada experimental isolada.
- Integridade local dos cinco arquivos: aprovada.
- Integração com `validarXsd` ou emissão: não.
