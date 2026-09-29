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

A trilha foi inicializada pela CLI oficial, o plano versionado em commit próprio e `status/open pessoas` executados antes da implementação. O check preliminar falhou no item 8: `base_commit..HEAD` inclui `docs/execution-tracks/pessoas/goals/.gitkeep` e o GOAL recém-criado pelo bootstrap, enquanto a regra exige `goals/**` intocado. Isso impede `close` sem mudar a regra ou incluir o plano em `main`, ações fora da autorização deste GOAL. O item 10 também falha nessa worktree porque `npx vitest` não dispõe de `node_modules`/Prisma Client e a allowlist não autoriza escrever esses artefatos nela; a suíte foi executada em cópia temporária com o banco local verificado. O check preliminar apontou ainda árvore suja antes do commit e impossibilidade de escrever `FETCH_HEAD` sob o sandbox; o resultado após commit será relatado separadamente. Nenhum PASS AEP é afirmado aqui.

## Antes de uso real

Provisionar as chaves e o transporte privado apenas no servidor, revisar independentemente o diff e a migration, autorizar merge e aplicação em produção em fluxo próprio. A flag permanece OFF por padrão. O GOAL 001 completo aguarda 001B; este backend não calcula folha nem publica holerite do Omni.