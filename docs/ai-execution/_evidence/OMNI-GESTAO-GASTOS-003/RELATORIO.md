# OMNI-GESTAO-GASTOS-003 — estado de execução local

GOAL: OMNI-GESTAO-GASTOS-003 — Readers privados, relatórios, documentos e isolamento financeiro.

STATUS: **APPROVED_R2_LOCAL_COMMIT_AUTHORIZED**. Implementacao e gates tecnicos concluidos; R2 real APPROVED com aceite expresso do lint atual e sem achados bloqueantes. Restam somente o unico commit local e sua conferencia.

BRANCH: `codex/omni-gestao-gastos-003`.

BASE_SHA: `bcde32ca83a216c512e5234d599a4bd8471869b0`, também HEAD atual. G001 `55bab9a7a93218433912761d6ce2f07b8b3fdfad` permanece ancestral. Branch deriva exatamente de G002, sem integração de trabalhos paralelos.

COMMIT_SHA: valor final registrado apos o unico commit em E/commit-final.json e E/RELATORIO_FINAL_POS_COMMIT.md. Este documento e pre-commit para evitar auto-inclusao circular do SHA.

Worktree: `C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-003`.

Evidência externa (E): `C:/Users/rafae/.codex/visualizations/2026/10/21/01a1601f-4e52-74a1-8887-2c958c8c5d2b/G003-execution`.

## ARQUIVOS e autorização

66 arquivos de produto/teste/documentação, enumerados por caminho e motivo no `GOAL.md`; conjunto e hashes em `E/final-source-audit.json`. Nenhum caminho fora da allowlist. Os dois arquivos de cache, `next.config.mjs` e `public/client-privacy-cache.js`, receberam autorização humana específica antes da edição. As revisões da allowlist para testes correspondentes também precederam suas edições.

Readers empresariais de Financeiro, APIs, relatórios/exportações, Contador, PDV/venda/caixa/dashboard, projeção OS V4 e Agent passaram a usar fontes empresariais filtradas e gates atuais. Novos `read-scope.ts`, `read-cache.ts`, `documentos.ts` e `documentos-fixture.ts` têm testes correspondentes. O Provider real descarta estado/respostas de sessão/usuário/loja anterior; PWA aplica NetworkOnly, recusa aquecimento e limpa respostas históricas nos caminhos financeiros inventariados, inclusive portal Contador externo.

`auth.ts`, `auth.config.ts`, `proxy.ts`, dependências/lock, G001/G002 SQL e fundação dos writers G002 permanecem preservados. A comparação AST dos corpos protegidos de writers financeiros/rotas e dos hashes dos arquivos integrais está em `E/final-source-audit.json`. Snapshots/logs de auditoria comum foram minimizados como parte da privacidade G003. Regressões reais M1/N10/N11/PDV/OS aprovadas abaixo.

AEP opt-in ausente nesta worktree. ENTRYPOINT e governança consultados; sem registro/estado/ledger ou commit de close adicional. G001/G002 continuam limpas e WIPs da principal preservados. Fetch final somente de leitura remota confirmou origin/main `15cbaac55e0473cc1ca27695c10b2fcf1e4f52a5`; base comum `13700862405a89da3c7d16702318735a88348133`, sem sobreposição de caminhos com os 66 arquivos locais. Sem merge/rebase/cherry-pick/push.

## SCHEMA_MIGRATION

Migration aditiva única: `prisma/migrations/20261021120000_gastos_readers_documentos/migration.sql`.

SHA256: `91469d47e9aaf184ead80bed52ee4a1194ee8e51a7163eb5fdb2bd93b5479c93`.

Adiciona DocumentoGasto/DocumentoVinculo, estados, índices, 10 FKs RESTRICT, 3 CHECKs e triggers de identidade/histórico/vínculo; RLS fechada nas tabelas novas. Não adiciona Gasto/Operação fictícios nem altera os modelos monetários G002. Aplicação real em baselines vazio e com histórico sintético: 6/6 testes em `pg-migration-r4`, incluindo preservação dos IDs/valores anteriores, constraints e papel efetivo não owner/NOBYPASSRLS.

O baseline físico foi gerado do schema Git anterior ao G001; depois aplicados os SQLs exatos G001/G002/G003 no cluster descartável. Não se afirma replay de toda a cadeia de migrations não relacionadas. Provas com app owner e com papel não owner são separadas; não se certifica RLS produtiva com fixture owner. Nenhum dado real, credencial, .env copiado ou banco produtivo.

## READERS_AUDITADOS, READERS_CORRIGIDOS e READERS_EXCLUÍDOS_COM_JUSTIFICATIVA

`INVENTARIO_READERS.json` reconcilia AST, funções, consumidores, autorização efetiva, argumentos, linhas/hashes e referências aos testes reais, além de SQL raw e leitores indiretos/cache. Baseline: 159 consultas Prisma (140 operacionais e 19 offline). Atual: 179 consultas Prisma nos modelos da fundacao, 18 SQL raw e 13 grupos indiretos/cache. Argumentos alterados em 77 consultas e 20 novas; contagens nao equivalem a endpoints.

Os 17 GETs financeiros, serviços de totais/relatórios/exports e leitores diretos/indiretos inventariados aplicam EMPRESA da loja real ou legado perfilId NULL da mesma loja, excluindo PESSOAL/loja estrangeira na fonte. Detalhes por ID/localKey não atravessam o perfil. Predicado SQL não é autorização. Sessão/usuário ativo, membership, papel/permissão e grant empresarial são revalidados; contexto pessoal opaco G001 reconfere o dono global e não muda com a loja.

Contador interno revalida ator/grant no carregamento real. O externo revalida cookie/sessão/vínculo Contador próprios, sem aceitar scope JSON como identidade nem tocar/renovar sessão escondidamente no reader. Agent revalida resumo/histórico financeiro e restringe memória/timeline ao workspace atual, sem inserir dados pessoais.

As 19 consultas offline tem caminho/funcao/motivo individuais e nao foram alteradas como correcao de dados G003. O CLI original scripts/seed-contas-receber-os.mjs foi executado somente no QA sintetico da regressao V3 (v3-g003), nunca em producao. Funcoes puras, DTOs e estado local legado sao classificados pelos consumidores; nenhum motor/UI foi migrado. Lookups internos dos writers preservados sao distintos de endpoints; referencia a teste nao equivale a cobertura de todo branch.

## DOCUMENTOS_PRIVADOS

Ownership de perfil/dono/loja, FKs/validação de alvo real, identidade durável independente de URL, metadados/MIME/tamanho/hash derivados dos bytes, proveniência, versão e histórico ordenado. Deduplicação restrita ao perfil, storage exclusivamente fixture privado e path gerado/validado no servidor. Download exige contexto autorizado e integridade antes da capability opaca com TTL máximo de 60s; DTO comum não expõe owner/hash/path. Capability fixture é bearer temporário; não se afirma reautenticação por sessão no consumo.

Registro/vínculo/consulta/retensão usam contextos G001 revalidados. Órfãos com pelo menos 24h entram em quarentena e revisão em 30 dias, serializando com vínculo pelo lock do documento. Sem apagar histórico/bytes; vinculados têm retenção indeterminada. Alvo inativo e perfil/loja/dono divergentes recusados. Auditoria comum só devolve snapshots técnicos permitidos; histórico dos documentos permanece privado. Não há storage/bucket/canal/mídia real, OCR/STT, UI pessoal ou job produtivo novo.

## TESTES_UNITÁRIOS, TESTES_POSTGRES e REGRESSÕES

| Execução em E | Resultado comprovado | Escopo |
|---|---|---|
| focused-pg-r6 | 122/122, exit 0 | 20 unitarios + 77 readers PG + 25 documentos PG. Inclui transicao grant por writer G002 real, historico nao vazio, totais conhecidos, 24 exports, auditoria SQL e concorrencia/rollback/corridas de documentos. |
| `pg-migration-r4` | 6/6, exit 0 | Migration em baselines novos vazio/histórico, FKs/CHECK/índices/RLS owner e não owner. |
| regression-unit-r4 | 820/820 em 52 arquivos, exit 0 | Financeiro/Contador/Agent/PDV/OS/vendas/importacao e M1, repetidos apos delta R1. |
| `pg-g001-r2` | 24/24, exit 0 | Testes G001 originais sobre schema G001+G002+G003. |
| `pg-g002-r1` | 97/97, exit 0 | Writers 50, rotas/M1 41, migration/histórico/auditoria 6; concorrência, locks, ledger, rollback e snapshots pagar/receber de 8.000 linhas. |
| `pg-pdv-native-r1` | 6/6, exit 0 | PostgreSQL nativo: advisory/row locks, saldo e lotes concorrentes, em chamada separada após writers. |
| `v3-g003` | 109/109, exit 0 | Suíte nativa original de recebimento misto/OS e transitivos, banco novo `ops_v3_misto_qa_gastos_g003`, schema baseline+G001+G002+G003. CLI seed original também executado apenas em fixture QA. |

Total PostgreSQL: **344 testes**, sem skips; 102 G003 atuais mais 6 migration, 24 G001, 97 G002, 6 PDV e 109 OS/V3. Unitarios focados: **20**; regressoes selecionadas: **820**. Migration e suites PG anteriores continuam provas dos mesmos SQLs e corpos de writers preservados; G003 e regressoes pertinentes foram repetidos apos R1. Nao se afirma toda a suite global; mocks nao substituem PG.

Host/portas/usuários/current_database/current_user/data_directory foram conferidos antes de SQL. Cluster exclusivo de E, PostgreSQL 17.10 em loopback; papéis app NOSUPERUSER/NOBYPASSRLS. A fixture G001 recebeu `createrole_self_grant='set'` para seu teste original SET ROLE no PostgreSQL 17, sem alterar o teste ou dar SUPERUSER/BYPASSRLS. App G002/G003 sem CREATEROLE. O cluster foi encerrado após confirmar identidade e zero outros clientes (`cluster-final-stop.json`); bancos e evidências preservados.

Rodadas falhas iniciais e diagnósticos foram preservados. Corrigiram-se fixtures antigas de sessão/membership/composição G002, resolução dos aliases reais de tsconfig no harness externo e o tipo Decimal de uma fixture. Sem pular casos ou alterar assertions de negócio para ocultar regressão. O engine Prisma nativo ausente por limpeza emergencial foi reutilizado com versão/hash idênticos e depois restaurado para o teste CLI V3, sem mocks de engine ou alteração de dependências. A geração normal foi executada e aprovada no build oficial atual.

## TYPECHECK, LINT_GLOBAL, LINT_DELTA e BUILD

TYPECHECK: **PASS**, typecheck-r7, comando oficial integral npm run typecheck, exit 0 e fontes inalteradas. Sem exclusoes/flags para esconder erros.

LINT_FOCADO: **PASS**, lint-focused-r5: 59 arquivos alterados, zero erros e avisos, exit 0.

LINT_GLOBAL: **BASELINE_FAIL**. G002: 105 erros/114 avisos em 4465 arquivos; G003 atual: 105 erros/113 avisos em 4476 arquivos, ambos exit 1. Nao e lint global verde.

LINT_DELTA: **PASS**, zero diagnósticos novos, 218 diagnósticos correspondentes e um aviso removido (dependência estável de emptyRelatorios no Provider). Mesma versão Node, comando/config/lock e node_modules físico. Base integral executada e todas as suas fontes/hashes reconferidos; G003 integral atualizado após o último ajuste de fixture. Resultados brutos, mensagens e comparação individual preservados em `lint-differential*.json`. A normalização limita-se às raízes absolutas e aos offsets UTF-16 de correções na representação LF, com prova de conteúdo integral idêntico salvo CRLF para os diagnósticos atuais afetados; regra, severidade, mensagem, linha/coluna e texto das correções mantidos. Comparação bruta inicial e evidência EOL também preservadas. **Excecao limitada aceita EXPRESSAMENTE pelo R2 real para os hashes atuais; LINT_GLOBAL permanece BASELINE_FAIL.**

Hashes dos resultados globais atuais: G002 bf2016bf41b3c15acd12c7684d50dc899fc212be5fb859fbcc1094b7448a17f6; G003 6ed21705100b489f656506e08c6e61b885f4cbffebde3556bf40f0be1ac618cc; comparacao d48280e8e5cccea8ec29655c293f8e22316c504a6a940e83ded7a4ba94ab434c. R2 aceitou EXPRESSAMENTE estes hashes atuais. O aceite antigo do R1 nao foi herdado.

Runtime local: Node `v26.12.1`, pacote declara `24.x`; a diferença é registrada, sem mudar configuração. Typecheck, lint e build oficiais passaram nesse runtime; não se certifica outro runtime por inferência.

BUILD: **PASS**, build-r3, npm run build integral oficial, exit 0/MIGRATION_SKIPPED e geracao Prisma normal. Fontes inalteradas. built-worker-validation.json executa funcoes do SW REAL compilado: 21 URLs privadas, NetworkOnly na primeira regra, precache sem privados, recusa de aquecimento HTML/RSC e cleanup em 3 caches. VM/CacheStorage sintetico, sem alegacao de E2E navegador ou producao.

DIFF_CHECK: **PASS**, sem alteração de corpo dos writers protegidos, caminhos fora da allowlist ou staged WIPs (`final-source-audit.json`). Rodadas pesadas sequenciais; nenhum .env copiado.

## REVISÃO_R, GATES_EXTERNOS e PENDÊNCIAS_REAIS

REVISÃO_R: **APPROVED R2 real**, 2.1.288 (Claude Code), modelo efetivo claude-sonnet-5-5, sessao ccf81443-42bb-4a6d-b9bb-a5e589d14eb1, 70 ferramentas Read/Glob/Grep, 2026-10-22T05:12:33.090Z a 2026-10-22T05:17:43.606Z. ApprovedForLocalCommit=true, lintExceptionAccepted=true e productionApproval=false. Manifesto 41d8c4c4e4c32b0c95d6a2fbd5fd7ae063cec84ccf6a124acf58cf1009898611; eventos 9354f7c3e434d1f45ed27d32ac39db459de9a3a10e3b640c065a4c5634ef1430. Parecer integral/historico em REVISAO_R.json e E/review-r2-submission. R1 CHANGES_REQUESTED preservado e F1-F8 tratados; nenhuma aprovacao G002/R5 herdada.

GATES_EXTERNOS: implantação não autorizada neste GOAL. Antes de qualquer implantação é obrigatória a concessão/revisão explícita de PerfilMembro por operador autorizado: writers G002 podem criar EMPRESA sem grant, passando leituras de 200 a 403 até a concessão. O contrato de segurança permanece; não há autoatribuição, backfill ou SQL produtivo. Essa pré-condição de implantação não bloqueia artificialmente o commit local nem exige G004. Storage produtivo, canal, STT/OCR e reconciliação geral continuam fora do escopo.

PENDÊNCIAS_REAIS:

1. Criar e conferir um unico commit local com caminhos exatos; registrar o SHA no recibo externo pos-commit. Nenhuma alteracao de produto, schema, migration ou teste apos R2.
2. Antes de qualquer implantacao, operador autorizado deve conceder/revisar explicitamente PerfilMembro; implantacao continua fora deste GOAL. Nao e pendencia para o commit local.

Observacoes R2 N1-N3 sao nao bloqueantes: fixtures da auditoria comprovam defesas combinadas, sem isolar cada ramo do lateral; suites PG originais anteriores nao foram repetidas apos delta restrito a leitura; arquivo schema.prisma integral nao foi copiado ao pacote, embora o diff completo, hash constante, migration, geracao Prisma/typecheck/build e ensaios de migration estejam presentes. O parecer nao certifica leitura integral dos 66 arquivos, execucao pelo revisor, RLS produtiva ou navegador E2E. Nao ha correcao obrigatoria pendente no G003.

O primeiro build (`build-r1`) passou, mas a conferência das rotas comprovou páginas SSR/RSC reais do Contador externo faltantes na matriz. `cache-portal-negative-r1` reproduziu 4 falhas e o worker original também falhou com a matriz ampliada. A correção dos mesmos dois arquivos autorizados foi retestada e recompilada no build atual, cobrindo `/api/contador-externo/lojas`, `/contador-externo` e `/contador-externo/lojas/**`, inclusive `?_rsc`. Não foram alteradas páginas, autenticação ou permissões para resolver cache.

`focused-pg-r4` passou 81/82 e interrompeu um caso no beforeEach de fixture aos 10s, sem executar a Action; o reteste anterior focused-pg-r5 passou 82/82 com `--hookTimeout=60000` apenas para hooks de preparação/limpeza. Nenhum skip ou assertion afrouxada. `typecheck-r5` ficou sem processo/handle e sem recibo terminal na troca do ambiente; preservado e substituído pela execução integral atual comprovada.

`E/build-preflight-blocked.json` e snapshots antigos de disco são históricos. `E/current-gates.json`, recibos atuais, `RESUME_G003.json` e este relatório prevalecem. Não reaplicar migrations em bancos já migrados nem tratar revisão/commit pendentes como aprovados.

## Resposta comprovada a R1

F1: o teste percorre legado200 -> writer G002 real cria EMPRESA/grant0 ->403 -> concessao explicita de fixture ->200, mantendo titulo legado NULL. Conceder/revisar PerfilMembro por operador autorizado continua pre-condicao bloqueante de QUALQUER implantacao, inclusive novos perfis dos writers; nenhuma autoatribuicao ou acao produtiva neste GOAL.

F2: fixtures de conciliacao/fechamento/auditoria nao vazias, E1/legado positivos e P1/P2/E2 negativos. P2 repete nomes e valores de E1. Assertions exatas de fontes/totais em resumo, indicadores, DRE, fluxo, categorias, rankings, carteiras e 12 tipos x CSV/XLSX. Fechamento/PDV sao modelos empresariais por loja, sem perfil pessoal ficticio. O diagnostico r2 reproduziu vazamento de entidadeId/valor da auditoria historica; lista/detalhe/export agora validam origem no SQL lateral. Eventos sem origem comprovada conservam somente metadados, sem ID/snapshot; detalhe desconhecido devolve a mesma resposta vazia de ausente. Testes verificam conteudo tecnico persistido e devolvido.

F3: seis uploads concorrentes no mesmo perfil/hash produzem uma linha/objeto; outro perfil permanece independente. Falha PostgreSQL real depois do upload causa rollback/limpeza de storage; trigger de falha exclusivo da fixture foi revisado antes e removido em finally. As duas ordens da corrida por lock vinculo/quarentena passaram, sem QUARENTENA vinculada ou perda de bytes.

F4: inspecao dos consumidores atuais em E/r1-f4-consumer-proof.json e testes reais positivos ADMIN/GERENTE/CAIXA/VENDEDOR. O GET comercial acrescenta hubs.vendas; TECNICO atual com token ADMIN antigo e recusado. A consulta financeira de OS V4 continua positiva ADMIN/TECNICO pela propria Action operacoes.editarOs; Operacoes/api/vendas usa Server Actions, sem esse GET. Nao e prova de navegador E2E.

F5-F8: limites declarados na decisao: quarentena terminal/dedup; sem API delete, sem garantia contra DELETE/TRUNCATE por SQL owner; minimizacao tecnica deliberada da auditoria; cookie entre abas pode causar403 e exigir remontagem/reload do Provider. Nenhum requisito futuro de G004-G010 foi antecipado.

Diagnosticos r1/r2/r3 preservados com falhas reais e correcoes: relacao categoria da fixture, vazamento historico e sessao OS que precisava incluir as duas lojas ja autorizadas. Assertions de negocio mantidas; rodada atual focused-pg-r6 inteiramente verde.

## Fechamento R2

Apos o parecer, somente estes quatro registros de evidencias recebem modelo/sessao/veredito/hashes e estado: GOAL.md, RELATORIO.md, INVENTARIO_READERS.json e REVISAO_R.json. R2 autoriza expressamente essa transcricao. Codigo, schema, migration, testes e decisao permanecem byte a byte iguais ao conjunto revisado; comprovacao em E/post-review-metadata-delta.json. Nenhum commit previo, push, merge, deploy ou G004.
