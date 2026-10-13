# 025-A · Validação da ratificação documental B

Data: 2026-10-12 (America/Sao_Paulo).
PR #265, branch codex/fiscal-025-a-architecture.
Base inicial/revisada: 1fd90905e05656444576cf83c9df6c46919a917a.
Base reconciliada de main: 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d.
Merge de drift independente, sem conflitos: 4bb7025ffc5d9384701ce242377dff6289155df6.
SHA final, R incremental, checks e eventual merge são identificados na publicação do PR, evitando referência circular de HEAD.

## Checagens documentais

| Checagem | Resultado e limite |
| --- | --- |
| node scripts/track.mjs verify --all | PASS após reconciliar main: dez trilhas, REGISTRY.md e GATES.md sem divergências; repetir antes da publicação |
| git diff --check | PASS; verificar também staging e commit completo antes de publicar |
| Integridade Markdown | PASS nos nove documentos: links locais existentes, tabelas consistentes, blocos fechados e UTF-8 sem BOM; repetir após registrar esta validação |
| Scan de segredos | PASS em nove categorias sobre documentos completos; valores de matches nunca impressos |
| Escopo próprio contra main reconciliada | Somente nove documentos: ADR aceita, índice, ponte da proposta, matriz, fase e quatro evidências 025-A |
| Contrato lógico original | Seção 2.2 integral da ADR idêntica ao documento revisado em e3c9d4a416972a65b1283b568ae5b13d3897b5c8 |
| Invariantes de B | ArchiveBundle/v1, XML bruto, manifesto/hashes sem ciclos, cadeia B2/588, identidade/linhagem, versionId permanente, criação exclusiva, CAS, replay, órfãos e recuperação preservados |
| Plano e contratos vigentes | GOAL 025/evidência PLAN, schema e ADR-0017/0018 com os mesmos blobs protegidos abaixo; nenhum módulo fiscal executado |
| AEP/ledger/derivados | Iguais à base reconciliada, sem edição manual; mudança de REGISTRY vem exclusivamente de main |
| Sessão AEP | .aep-active ausente; recusa original de open por branch preservada; nenhum open/close/DONE do pai |
| Typecheck/build/testes fiscais/storage/DB | NOT_RUN: escopo exclusivamente Markdown; dispensados typecheck/build pelo DELIVERY_CHECKLIST; nenhuma prova de backend produzida |

O checkout Windows aplica filtros LF/CRLF. As âncoras conferem git hash-object --path com filtros do caminho contra o blob da base; o contrato lógico é comparado normalizando exclusivamente CRLF/LF, sem normalizar XML ou qualquer conteúdo fiscal privado.

## Âncoras preservadas

| Arquivo | Blob Git no checkout e na base reconciliada |
| --- | --- |
| GOAL 025 canônico rev. 5 | e184fa675e96f77535fd280872dd4bd4c0043723 |
| Evidência 025-PLAN | 654a3b53bea6cd7af092c44064f9ebe5b5f40475 |
| fiscal/LEDGER.jsonl | 8f96d5a1484cf71629763cb57ae9f567c720d471 |
| fiscal/state.json | 47796f28a04f9703fa3dbda149e193e83d6ef6aa |
| execution-tracks/REGISTRY.md | 71ac097349954b57bc3cfd8d4fcc8b5abb512bf8 |
| ai-execution/GATES.md | fc635bdfc0d2e4ffa59f70e044464b2456045a49 |
| ai-execution/protocol.json | a3a9f93204f9d4400620bb8e565ba722c8e3772c |
| prisma/schema.prisma | 63283f20f3a65ff168bb73d667699083e38392c3 |
| ADR-0017 | 30aa62153cb47a711e3d7916b629a3e194061abc |
| ADR-0018 | 5dd185a842a5ae713e7ab58a9ff4a5b9dc196c4e |

Exceto REGISTRY.md, as oito âncoras originais também coincidem com a base inicial. REGISTRY.md era 6a4bec770d03c7d81eead6e13595d5641f0511cd; o novo blob é herdado das PRs #264/#266 integradas em main. O merge incorpora os demais arquivos independentes de Pessoas/governança sem alterá-los. O diff desta PR contra main reconciliada não contém código ou derivados.

## Scan, revisão e publicação

Scan por padrões: PEM/chaves/certificados, tokens GitHub, chaves OpenAI/Anthropic, access keys AWS, chaves Google, JWT, DSNs com credenciais, URLs assinadas e XML fiscal com identificação/dados privados. A revisão documental complementa a ausência de payload/snapshots/QR integrais. O resultado se limita ao escopo/padrões; não é certificado global de ausência de segredos.

A [R Google/Gemini anterior](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719) aprovou e3c9d4a416972a65b1283b568ae5b13d3897b5c8 e recomendou B. A decisão humana posterior aprovou B. A nova revisão incremental deve examinar o HEAD exato, delta desde a R anterior, documentos completos, contratos e diff integral contra a base reconciliada; [pedido](REVIEW_REQUEST.md), [proveniência](REVIEW_STATUS.md).

A publicação exige R incremental efetiva atribuível e conferência dos checks/regras remotos antes do merge documental. O comentário identifica revisor Google e publicador OpenAI, sem representar review nativa GitHub. Resultado/SHA/modelo/família e URL são registrados no PR; não se presume aprovação do delta neste commit.

## Resultado de escopo

HUMAN_ARCHITECTURE_DECISION=B_APPROVED.
IMMUTABLE_ARCHIVE_STRATEGY=WORM_OBJECTS_WITH_PROTECTED_REFERENCE.
IMPLEMENTATION_AUTHORIZED=false; STORAGE_PROVISIONING_AUTHORIZED=false.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_CONNECTIONS=0; DB_WRITES=0;
SEFAZ_CONTACTS=0; SEFAZ_TRANSMISSIONS=0; G_F7=BLOCKED; G_F12=BLOCKED.
FINAL_DECISION=B_APPROVED_DOCUMENTARY_ONLY.
STOP=AWAITING_025_B_AUTHORIZATION, após gates de encerramento documental; 025-B não iniciada.
