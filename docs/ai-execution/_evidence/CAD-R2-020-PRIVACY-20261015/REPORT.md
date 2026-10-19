# CAD-R2-020 — privacidade de Clientes

Status técnico: implementação concluída e validada em branch de entrega. Publicação em produção não realizada; entrega por PR para revisão. Pendências administrativas/jurídicas permanecem fail-closed e não são declaradas resolvidas.

## Pré-requisito CAD-R2-019

PR #276 revisada integralmente: 33 arquivos exclusivamente documentais, sem credenciais, documentos ou PII de clientes identificados; hashes agregados e metadados de infraestrutura não concedem acesso. Contagens antes/depois, 49 chaves preenchidas, 51 documentos fortes, rerun written=0, UNIQUE e histórico de migrations consistem entre relatório e JSONs. O resultado intermediário PENDING foi preservado como evidência cronológica, com resultado final posterior PASS. Checks Vercel success, sem revisões bloqueantes e diff-check limpo. PR retirada de draft e mergeada com expected head b7d55b5; main resultante 466c397. Nenhum backfill, migration ou consulta de produção foi reexecutado.

## Resultado implementado

- Fronteiras REST/Actions com papéis explícitos, loja autorizada, projeções por operação e sem dump legado de Cliente/documentKey. Buscas ativas por POST; seleção comercial mantém documento necessário ao PDV, mas não email, histórico ou metadata.
- Metadados de importação/financeiros/RG não transitam no editor HUB. ClientWriteService preserva campos ocultos server-side na transação; client-identity e ClientMergeService permanecem canônicos.
- Duplicidade administrativa, chave de grupo sem PII, relações históricas filtradas por loja, respostas no-store e eliminação de exceções brutas de Clientes. Telemetria usa lista fechada; logging automático Prisma foi desativado por poder incluir valores.
- Imports e leitura de auditoria protegidos; mensagens de validação não repetem CPF/CNPJ; auditoria conserva o ator da sessão, não aceita userLabel de caller como autoria.
- Exclusão física genérica bloqueada por retenção. Inativação continua canônica e transacional. Encaminhamento de acesso/correção/exclusão é auditável, pendente, sem atender automaticamente o direito.
- Política e formulário deixam de simular consentimento. /privacy e o asset de limpeza são públicos por match exato; subrotas e telas de dados continuam privadas.
- Cache HTTP/PWA e respostas assíncronas por loja protegidos; worker compilado e script de limpeza verificados.

Inventário completo e justificativa de cada conjunto de dados: [INVENTORY.md](INVENTORY.md). Procedimento disponível e decisões ainda pendentes: [GOVERNANCE.md](GOVERNANCE.md).

## Validação

- **906 testes PASS**, zero falhas, em 59 arquivos. 20 integrações opt-in não executadas: 4 de concorrência UNIQUE PostgreSQL e 16 de listagem SQL de produtos. Nenhum teste escreveu em produção; datasource fictício de loopback e mocks.
- Comando de suíte: node --max-old-space-size=6144 node_modules/vitest/vitest.mjs run lib/cadastros app/api/clientes app/actions/cadastros app/api/import/advanced lib/importador-avancado lib/auth/proxy-session-gate.test.ts --maxWorkers=2.
- Typecheck completo PASS, exit 0. Primeira tentativa sem heap ampliado esgotou memória; execução final usou 6144 MB e passou. Build ignora tipos por configuração preexistente, por isso a prova de tipos é separada.
- Lint focado: zero erros; 5 avisos preexistentes em linhas não alteradas de pdv-classic.tsx. Lint suplementar dos últimos arquivos: zero avisos/erros. O único ajuste no PDV é transporte da busca de Clientes por POST, sem mudança de motor.
- Build completo PASS por scripts/vercel-build.mjs, Node 24, VERCEL=0, VERCEL_ENV=development, datasource fictício; evento MIGRATION_SKIPPED confirmado. Sem .env de produção ou deploy.
- Smoke do build local PASS: nove endpoints privados sem sessão retornam 401; /privacy retorna 200 e explicita pendências; asset de limpeza retorna JavaScript 200. PWA gerado contém regra de Clientes, import do cleanup e guarda de navegação. [smoke.json](smoke.json).
- git diff --check PASS; schema, migrations, backfill e preflight CAD-R2-019 sem diferenças.

## Self-review R5

1. **Autoridade/isolamento:** revisão de todos os adapters inventariados; negativos sem sessão/role, IDOR e outra loja; filtro também em relações; request não define autor nem autoridade de loja. Allowlist pública testada para não abrir prefixos privados.
2. **Minimização/exposição:** selects e DTOs, tagsRaw, documento de faturamento, match telefônico, erros/Prisma, logs de import, chaves de grupos, auditoria e telemetria revistos. Eliminados raw dumps, valores em erros e checkbox de consentimento não persistido.
3. **Integridade/retencão:** escrita, identidade e merge existentes mantidos. Metadados ocultos preservados sob opção interna do writer; testes de omit/clear originais continuam passando. Exclusões bloqueadas, históricos e UNIQUE inalterados; sem banco real.
4. **Frontend/transporte/cache:** consumidores de busca migrados, estados remount/cancelamento na troca de loja; no-store, NetworkOnly, bloqueio do worker auxiliar e purga de entradas antigas. Smoke detectou a política/asset barrados por login; corrigido por match exato e revalidado no build.
5. **Regressões/evidência:** suíte ampliada corrigiu fixtures legadas de autenticação e um caso de documento sem dígitos que não exercitava a validação. Testes adversariais reais, tipos, lint, build, smoke e diff-check finais passaram. Sem blocker técnico identificado na revisão própria.

## Limites de entrega

Não foi realizado smoke autenticado com base real ou ensaio de concorrência PostgreSQL; essas integrações ficam explicitamente fora da evidência executada. O smoke local confirma o build e a recusa anônima; casos positivos/negativos autenticados são testados com dependências simuladas.

Sem atestado de conformidade LGPD plena, sem prazos/bases jurídicas inventados e sem fluxo de destruição ou exportação automática. A mudança não elimina dados já existentes em logs/backups externos. Publicar esta branch é uma etapa de release distinta; nenhuma implantação produtiva faz parte desta execução.

Worktree isolada, sem .aep-active; ENTRYPOINT lido e opt-in respeitado. A checkout original e WIP de outras frentes foram preservados. CAD-R2-018-A, 008, 018-B e 019 não foram reabertos.
