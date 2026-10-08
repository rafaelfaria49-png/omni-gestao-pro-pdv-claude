# Validação do backend Pessoas 001A

Base de partida: `origin/main` `77111da450c7d0d2610ec5b1533b6975b2fd0b5d`. Worktree exclusiva: `C:\Projetos\omni-gestao-pessoas-001a-backend`. Nenhuma migration foi aplicada em produção.

## Banco isolado e migration

- PostgreSQL local em `127.0.0.1:55439`, usuário sintético `omni_homolog`, banco `omni_pessoas_001a_homolog`. `scripts/pessoas/check-isolated-db.mjs` conferiu host, porta, usuário, nome do banco e igualdade de `DATABASE_URL`/`DIRECT_URL` antes das escritas de teste.
- Prisma schema validado e Client 6.19.3 gerado na cópia de verificação, fora da worktree AEP. O schema base de `origin/main` foi aplicado primeiro em banco local vazio; `0022_pessoas_cadastro_backend/migration.sql` aplicou depois em transação com `ON_ERROR_STOP=1`.
- A migration final foi reaplicada desde o mesmo baseline em um **segundo** banco local vazio, `omni_pessoas_001a_migrationcheck`, sem resetar o primeiro. Resultado: 14 tabelas `dp_*` criadas; funções, constraints, índices e gatilhos instalados sem erro.
- Os testes de integração usam somente Stores, usuários, empregadores e documentos sintéticos; chaves criptográficas são efêmeras do processo; o transporte R2 é falso nesse teste. Nenhum bucket ou credencial real entrou no teste.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `vitest run lib/pessoas` na cópia com banco isolado verificado | 3 arquivos, 19 testes passaram |
| Typecheck do escopo Pessoas (`tsconfig.pessoas.json` temporário) | Passou |
| ESLint focado em `lib/pessoas`, actions, rotas e script | Passou |
| `npm run build` na cópia de verificação | Passou; `MIGRATION_SKIPPED`, Prisma Client gerado e rotas de documentos presentes |
| Diff check | Sem erros nos arquivos de implementação; verificação global com `core.whitespace=-blank-at-eol` passou. O masterplan original preserva espaços duplos de quebra Markdown e falha na verificação padrão de trailing whitespace. |
| `npm run typecheck` global | Falhou por instalação local incompleta de `@testing-library/react` e `@testing-library/user-event`, ambos declarados no package.json/lockfile; os erros subsequentes de tipos implícitos estão nos testes preexistentes que dependem desses pacotes. Nenhum diagnóstico apontou arquivo Pessoas. |

Cobertura com PostgreSQL real: dois empregadores/lojas com inscrição igual sem fusão, mapeamento adicional de Store condicionado a vínculo comprovado, bootstrap negado, flag OFF, leitura após escrita, isolamento de CPF e matrícula, rascunho sem admissão presumida, preenchimento posterior, reversão de duplicidade sem auditoria, edição inválida com rollback, salário oculto, revogação de grant, IDs cruzados negados, concorrência e supersessão contratual, gatilhos de escopo/histórico, upload com integridade física e download autorizado. Testes de domínio cobrem codec de datas/Decimal, CPF, cifra/HMAC e chaves ausentes.

## AEP

A trilha foi inicializada pela CLI oficial, o plano versionado em commit próprio e status/open pessoas executados antes da implementação. Após o commit de implementação 5ca432d, o check oficial passou em branch, worktree, árvore limpa, ancestralidade, allowlist, gates, ledger e upstream. A tentativa oficial de close foi abortada, sem escrita de estado; .aep-active foi preservado e o GOAL não está ratificado como DONE.

- Item 8 FAIL: o diff desde origin/main inclui docs/execution-tracks/pessoas/goals/.gitkeep e o GOAL criado pelo bootstrap obrigatório, mas o check exige que goals/** esteja intocado. A origem é estrutural neste fluxo de trilha nova; não alteramos a lógica do protocolo nem incluímos o plano em main.
- Item 10 FAIL: o comando registrado no GOAL, npx vitest run lib/pessoas, não encontra Vitest na worktree sem node_modules nem Prisma Client gerado. A allowlist não autoriza escrever esses artefatos ali. A suíte de 19 testes foi executada em cópia temporária com banco PostgreSQL local isolado e guard de destino.
- Item 12 AVISO é apenas informativo: não há GOAL seguinte elegível. Nenhum outro item falhou no check após o commit.

A revisão independente deverá resolver o fluxo de bootstrap/execução de testes do AEP antes de ratificar o fechamento. Nenhum PASS AEP ou aprovação independente é afirmado aqui.

## Tentativa 2 (2026-10-01)

Origem: a revisão independente pediu mudanças (REQUEST_CHANGES), com um P1 (P1-01) e dois P2 (P2-01 e P2-02). O plano foi integrado à main pelo PR #229, por merge commit, preservando `b4ea73d`. Esta branch recebeu `origin/main` `e65630f` por merge normal (`8c8b550`). O `.aep-active` obsoleto (tentativa 1, `attempts_log` vazio) foi recriado com `open`; o novo `base_commit` é `e65630f` e o `test_command` é `node scripts/pessoas/run-official-tests.mjs`. A falha da tentativa 1 foi registrada com `attempt --fail`, abrindo a tentativa 2/3. O commit funcional é `d5706e0`.

### Correções

- **P1-01:** em `criarFuncionario`, qualquer campo do contrato inicial passa a exigir `editContrato`: `cargo`, `cbo`, `tipoContrato`, `salarioBase`, `unidadeSalario`, `jornadaSemanal`, `divisor`, `cctRef` e `contractValidFrom`.
  - Sem essa capacidade, a operação inteira é recusada com `CONTRATO_NAO_AUTORIZADO` (403).
  - Chave desconhecida no input recusa com `CAMPO_DESCONHECIDO`; o estabelecimento contratual não vem do cliente. Nenhum campo é descartado em silêncio.
  - `editCadastro` continua criando pessoa, vínculo e contrato v1 em rascunho.
  - A leitura salarial continua dependendo só de `viewRemuneracao`.
- **P2-01:** o download assinado usa o nome `documento.pdf|png|jpg`, derivado do MIME validado (`nomeDownloadNeutro`). O nome original fica apenas no metadado autorizado.
- **P2-02:** a política server-side fica em `lib/pessoas/documentos/politica.ts` e é deny-by-default.
  - Só `identificacao` é `COMUM`.
  - `holerite_externo`, `contrato` (traz salário), `comprovante` (pode comprovar pagamento) e `outro` (conteúdo livre) são `REMUNERATORIO`. Para enviar, listar ou baixar por ID, exigem `viewDocumento` + `viewRemuneracao`.
  - A classificação é gravada pela política e a autorização é aplicada no serviço, não na interface.
- **Runner oficial:** `scripts/pessoas/run-official-tests.mjs`. Testa o HEAD commitado, extraído com `git archive` para um workspace temporário externo.
  - Instala dependências com `npm ci` e gera o Prisma Client nesse workspace.
  - Sobe um PostgreSQL efêmero em `127.0.0.1:55439` e recusa a porta se ela já estiver ocupada.
  - Aplica o schema da base e as migrations novas, com gate de drift, e passa pelo guard `check-isolated-db.mjs`.
  - Recusa teste pulado ou integração não executada, limpa tudo ao final e propaga o exit code.

### Evidências

| Verificação | Resultado |
| --- | --- |
| `node scripts/pessoas/run-official-tests.mjs` (test_command oficial) em `d5706e0` | exit 0 em 5m59s. 0022 aplicada sem drift; 5 arquivos, 26 testes, 0 falhas, 0 pulados, 15 de integração executados. Temporário removido e porta liberada. |
| `node scripts/track.mjs check pessoas` em `d5706e0` | PASSOU: itens 1–11 PASS, incluindo item 8 (caminho quente intocado) e item 10 (test_command com exit 0). Item 12 é aviso informativo. |
| Prova de mutação: `cadastro.ts` e `service.ts` de `a569abc` num workspace externo | As três regressões novas falham: P1-01, P2-02 e P2-01. Com o código corrigido, passam. |
| Regressões já aprovadas (testes adversariais da revisão, fora da branch) | 11/11. Cobrem Store compartilhada por dois empregadores, download e intent cruzados, membership removida e usuário desativado, chaves ausentes, CPF/matrícula, concorrência e idempotência, supersessão e imutabilidade, e rollback com falha forçada da auditoria. |
| Flag OFF (`lib/pessoas/flag-off.test.ts`) | 21 serviços, 4 rotas e 1 action, para 6 valores diferentes de `on`: nenhum acesso a sessão ou banco. |
| P2-01 com o adaptador R2 real (`download-url.test.ts`) | `response-content-disposition` = `attachment; filename="documento.pdf"`. Nome, sobrenome e CPF ausentes da URL; também ausentes de log e de erro no teste de integração. |
| Migration 0022 do zero em banco vazio (baseline `e65630f`) | 14 tabelas, 10 gatilhos e 4 funções. Drift contra `schema.prisma`: nenhum. |
| `prisma validate` · ESLint focado · `git diff --check` | Passou · passou · limpo |
| `npm run typecheck` global (workspace externo, `npm ci` completo) | Passou: exit 0 em 7m55s |
| `npm run build` (workspace externo idêntico a `d5706e0`) | Passou: `MIGRATION_SKIPPED`, compilado em 4,8 min, 4 rotas `/api/pessoas/documentos*` |
| `node scripts/track.mjs verify --all` | Sem divergências |

Ambiente: Node 24.14.1 (`engines` 24.x herdado da main) e PostgreSQL 17.10 descartável. Dados, chaves e credenciais são sintéticos. Nenhum banco, bucket ou dado de produção foi usado.

### P3 mantidos como follow-up (não ampliados)

1. Não há comando para encerrar `DpUnidadeVinculo`.
2. A supersessão não grava `validTo` nem `tipoMudanca`; o fim é derivado da próxima versão.
3. Serializable sem retry: P2034 vira `VERSION_CONFLICT`.
4. IDs não-string viram filtro Prisma, mas presos ao escopo.
5. Com flag OFF, `/complete` responde 403/503 em vez de 404.
6. R2 sem configuração vira `FALHA_INTERNA` em vez de 503.
7. `jornadaSemanal` acima de 168 vira `FALHA_INTERNA` em vez de 400.
8. CPF em claro no retorno de mutação.
9. CPF existente ignora `nome`/`nascimento` enviados.
10. `hashComando` usa a chave HMAC do CPF.
11. A autorização é checada antes da transação, o que deixa uma janela TOCTOU curta.
12. `schema.prisma` sem newline final e `titulo` `<PREENCHER>` no protocolo.

## Antes de uso real

Provisionar as chaves e o transporte privado apenas no servidor, revisar independentemente o diff e a migration, autorizar merge e aplicação em produção em fluxo próprio. A flag permanece OFF por padrão. O GOAL 001 completo aguarda 001B; este backend não calcula folha nem publica holerite do Omni.