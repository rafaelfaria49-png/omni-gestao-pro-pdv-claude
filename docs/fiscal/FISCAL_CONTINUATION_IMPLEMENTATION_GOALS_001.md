# GOALs de continuação fiscal — reconstrução reconciliada

> **Proveniência:** reconstrução, não cópia literal do pacote Fable 5 ausente. A sequência abaixo
> deriva do GOAL-001, da auditoria read-only de 2026-07-12 e da reconciliação de 2026-07-13.

| GOAL | Objetivo fechado | Gate/saída |
|---|---|---|
| 001 | Reconciliar Git, código, banco, schema, testes e documentação | este relatório; G-C1 |
| 002 | Dar paridade fiscal ao `upsertProduto` do Cadastros V2, sem ativar emissão | `metadata.fiscal` canônico e testes |
| 003 | Fixar matriz tributária e golden cases com contador | autoridade tributária nomeada |
| 004 | Implementar ST mínima do mix piloto, incluindo CSOSN 500 | testes internos + casos aprovados |
| 005 | Versionar o pacote XSD oficial e sua proveniência | artefatos oficiais verificáveis |
| 006 | Trocar o placeholder por validação XSD real e fail-closed | XML inválido reprova |
| 007 | Substituir o canonicalizador irregular por C14N conforme | **cumprido no GOAL nomeado 003**; vetores independentes verdes |
| 008 | Endurecer XMLDSig com certificado exclusivamente de teste | **cumprido no GOAL nomeado 003**; verificação independente verde |
| 009 | Tornar o dry-run auferível, sem stub indulgente | gate técnico real F4→F5 |
| 010 | Validar retenção, idempotência e imutabilidade de XML/snapshot | P3/P4 comprovados internamente |
| 011 | Preparar decisão comparativa SEFAZ direto × gateway | recomendação para G-F5 |
| 012 | Registrar ADR do provider escolhido | G-F5 decidido por Rafael |
| 013 | Implementar provider real somente em `HOMOLOGACAO` | sem produção, sem caller de venda |
| 014 | Transmitir primeiro documento controlado em homologação | N6, cStat 100, evidência sanitizada |
| 015 | Implementar QR-Code/CSC e validar no portal oficial | prova externa de homologação |
| 016 | Implementar consulta por chave e doutrina de estado incerto | timeout nunca duplica documento |
| 017 | Implementar cancelamento e inutilização em homologação | eventos autorizados e auditados |
| 018 | Implementar produtor/worker idempotente da fila, ainda desconectado | lock/retry/dedupe testados |
| 019 | Implementar DANFCE sobre XML autorizado | representação verificada |
| 020 | Implementar contingência e drenagem/reconciliação | cenários de falha verdes |
| 021 | Observabilidade e bateria ampla por UF/cenário | prontidão para G-F7, sem ativar |
| 022 | Construir ativação auditada por loja-piloto | **somente HOMOLOGACAO**, exige G-F7 |

## Checkpoint da trilha XSD — 14/07/2026 (decisão)

O identificador nomeado `FISCAL-XSD-OFFICIAL-VALIDATION-002` é uma trilha de execução específica e
não renumera a tabela histórica acima. Seu escopo corresponde principalmente aos GOALs 005
(pacote/proveniência XSD) e 006 (validador real/fail-closed).

Decisão humana formalizada na ADR-0010:

- Opção A `xmllint-wasm@5.2.0`: rejeitada na versão avaliada por segurança; versão futura corrigida
  pode ser reavaliada em GOAL próprio;
- B1 `xmllint` do host/PATH: rejeitada por origem e versão imprevisíveis;
- B2: aprovada com condições, exclusivamente como `xmllint` provisionado em worker fiscal
  containerizado;
- Opção C Java/Xerces: não selecionada; contingência arquitetural.

## Fechamento GOAL-002 XSD — 15/07/2026

| Campo | Valor |
|---|---|
| GOAL nomeado | `FISCAL-XSD-OFFICIAL-VALIDATION-002` |
| Estado | **FECHADO** (implementação + integração + fechamento documental) |
| PR | #4 |
| Merge commit | `82c219c4e241b145109a697aa3eb0e5d26a24d93` |
| HEAD fiscal integrado | `d497775e9dd1021d9a54ba6cf8f7b8c0b739f436` |
| Gate | **G-C2 = FECHADO** |
| Nível N (eixo XSD) | **N4** (validação real auferível; **não** N6/N7) |
| Homologação SEFAZ | **não** |
| Produção / emissão | **não** |

Evidências integradas na `main`:

- worker XSD B2 containerizado (`workers/fiscal-xsd`);
- `validarXsd` real e fail-closed (no-op removido);
- pacote oficial `PL_010e_v1.02` + manifesto/hashes;
- libxml2/xmllint 2.15.3; XML assinado validando no XSD;
- ADR-0010 e ADR-0011 (RSA-SHA1/SHA-1 imposto pelo schema);
- CI do HEAD fiscal verde (unit ubuntu/windows + container/supply chain + Vercel);
- Trivy 0 CRITICAL; SBOM SPDX; non-root 10001:10001; read-only; tmpfs; zero-egress;
- testes de integração e segurança no container; suíte e build Next verdes na esteira do PR.

Relatório de fechamento:
[`FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md`](./FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md).

Os itens 005/006 da tabela histórica acima ficam **cumpridos no eixo XSD**. Isso **não** fecha
homologação, produção, C14N, paridade de produto, ST, provider real nem G-F5/G-F7/G-F12.

## Fechamento técnico GOAL-003 C14N/XMLDSig — 15/07/2026

| Campo | Valor |
|---|---|
| GOAL nomeado | `FISCAL-XML-C14N-EXTERNAL-PROOF-003` |
| Estado técnico | **CONCLUÍDO**; aguardando apenas merge readiness desta branch |
| Escopo histórico | GOALs 007–008, eixo C14N/XMLDSig |
| Prova independente | Java 17 / JSR 105, sem importar o signer TypeScript |
| Resultado local | 16/16 testes; 11/11 mutações negativas rejeitadas |
| Nível N (eixo C14N/XMLDSig) | **N4**; não implica N6/N7 |
| Gate | critério C14N/XMLDSig do gate técnico F4→F5 fechado; gate global permanece aberto |
| Homologação SEFAZ | **não** · N6=0 |
| Produção / emissão | **não** · N7=0 |

Relatório técnico:
[`FISCAL_XML_C14N_EXTERNAL_PROOF_003.md`](./FISCAL_XML_C14N_EXTERNAL_PROOF_003.md).

O próximo passo é a **merge readiness documental e de CI do próprio GOAL-003**. O GOAL nomeado
004 **não foi iniciado** e não é autorizado por este fechamento.

A sequência histórica **GOAL 002 — paridade fiscal do `upsertProduto`** permanece backlog de
produto/cadastro, **distinta** do identificador nomeado da trilha XSD já fechada.

## Limites permanentes

- Nenhum GOAL anterior ao 022 liga `fiscalEnabled` ou conecta emissão ao fechamento da venda.
- Nenhum GOAL aponta para `PRODUCAO` antes de G-F12.
- Certificado, senha, CSC e token nunca aparecem em código, log, fixture documental ou relatório.
- GOAL que tocar regra tributária precisa nomear autoridade contábil/tributária; teste interno é N3.
