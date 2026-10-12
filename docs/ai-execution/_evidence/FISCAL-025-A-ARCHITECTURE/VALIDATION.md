# 025-A · Registro de validação documental

Data: 2026-10-12. Base 1fd90905e05656444576cf83c9df6c46919a917a.
Commit revisável e PR são identificados na publicação, evitando referência circular de HEAD.

## Verificações executadas antes da publicação

| Checagem | Resultado e limite |
| --- | --- |
| node scripts/track.mjs verify --all | PASS: dez trilhas, REGISTRY.md e GATES.md sem divergências |
| git diff --check | PASS; repetido para staging e commit completo antes de publicar |
| Integridade Markdown | PASS nos cinco documentos de conteúdo: 45 links locais existentes, oito tabelas consistentes, blocos fechados e UTF-8 sem BOM |
| Scan de segredos | PASS nos documentos novos: nove categorias, nenhuma ocorrência; valores de matches nunca impressos |
| Escopo | Somente docs/decisions/drafts, docs/execution-tracks/fiscal/phases e pasta de evidência 025-A; este registro é documento adicional |
| Plano aprovado | Mesmo blob Git do GOAL 025 e da evidência PLAN; READY/plan_rev=5/PLAN_ONLY/gates vazios/implementação negada |
| AEP/ledger/derivados/schema | Mesmo blob Git da base nos oito arquivos verificados abaixo; sem edição manual/regeneração |
| Sessão AEP | .aep-active ausente; open recusou precondição de branch, sem escrita; execução/close funcional não abertos |
| Typecheck/build/fiscal/storage/DB | NOT_RUN: nenhuma mudança de código, schema, configuração ou runtime; testes reais continuam futuros |

O checkout Windows converte LF/CRLF. A primeira comparação literal com git show encontrou somente essa diferença de representação em arquivos preexistentes; não houve edição desses arquivos. A validação conferiu simultaneamente git hash-object com filtros do caminho == blob da base e igualdade do texto após normalizar exclusivamente CRLF/LF. Não se alterou o checkout para forçar uma comparação.

## Âncoras dos arquivos preservados

| Arquivo | Blob Git na base e no checkout, após filtros Git |
| --- | --- |
| GOAL 025 canônico | e184fa675e96f77535fd280872dd4bd4c0043723 |
| Evidência 025-PLAN | 654a3b53bea6cd7af092c44064f9ebe5b5f40475 |
| fiscal/LEDGER.jsonl | 8f96d5a1484cf71629763cb57ae9f567c720d471 |
| fiscal/state.json | 47796f28a04f9703fa3dbda149e193e83d6ef6aa |
| execution-tracks/REGISTRY.md | 6a4bec770d03c7d81eead6e13595d5641f0511cd |
| ai-execution/GATES.md | fc635bdfc0d2e4ffa59f70e044464b2456045a49 |
| ai-execution/protocol.json | a3a9f93204f9d4400620bb8e565ba722c8e3772c |
| prisma/schema.prisma | 63283f20f3a65ff168bb73d667699083e38392c3 |

O diff integral também deve conter somente os documentos declarados. Nenhuma afirmação é feita sobre conteúdo do banco/backups/cloud.

## Método do scan e reprodução

Checagem por padrões sobre o conteúdo integral de cada documento novo, não apenas linhas visíveis no diff: PEM/chaves/certificados; tokens GitHub; chaves OpenAI/Anthropic; access keys AWS; chaves Google; JWT; DSNs com credenciais; URLs com assinatura/token; XML fiscal bruto. Complementarmente, revisão documental de ausência de payload/snapshots/QR integrais e valores privados. Resultado se limita aos padrões e escopo; não é certificado global de ausência de segredos.

Reproduzir verify --all, git diff --check base..HEAD, git diff --name-only base..HEAD e git rev-parse base:caminho / HEAD:caminho para âncoras. Inspecionar links relativos, delimitadores de blocos/tabelas e conteúdo dos documentos declarados; não executar módulos fiscais.

## Resultado

AEP_VERIFY=PASS; DIFF_CHECK=PASS; SECRET_SCAN=PASS_PATTERN_SCAN_DOCUMENTS.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_CONNECTIONS=0; DB_WRITES=0;
SEFAZ_CONTACTS=0; SEFAZ_TRANSMISSIONS=0.
HUMAN_ARCHITECTURE_DECISION=PENDING.
FINAL_DECISION=AWAITING_025_A_ARCHITECTURE_REVIEW.
STOP=AWAITING_025_A_ARCHITECTURE_REVIEW.
