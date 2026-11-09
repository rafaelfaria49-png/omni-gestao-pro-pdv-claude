# A4 — conexão e privilégios em Production — 2026-10-29

**A4=PASS.** Autorização: `ESTOQUE-KG-PRODUCTION-A4-001`, exclusivamente READ ONLY.
Validação conclusiva do banco: **09:08:11–09:08:14 BRT** (12:08:11–12:08:14 UTC).
Resultado consolidado: `12-final-summary.json`. As tentativas e seus resultados intermediários foram preservados.

```text
A4=PASS
PRODUCTION_IDENTITY=PASS
RUNTIME_DIRECT_LOGIN=PASS
RUNTIME_POOLER_LOGIN=PASS
MIGRATOR_DIRECT_LOGIN=PASS
RUNTIME_DML_GRANTS=PASS
RUNTIME_PRIVILEGE_ISOLATION=PASS
MIGRATOR_MEMBERSHIP=PASS
OLD_RUNTIME_PRESERVED=YES
READ_ONLY_TRANSACTIONS=PASS
STOCK_COLUMNS=INTEGER
COMMERCIAL_DATA_WRITES=0
PRODUCTION_SCHEMA_CHANGES=0
VERCEL_CHANGES=0
MERGE=NO
DEPLOY=NO
NEXT_GATE=Próxima preparação do rollout, mediante autorização separada.
```

## Identidade e credenciais

A API Neon confirmou, antes de qualquer autenticação PostgreSQL, o projeto `dry-mouse-36002471`,
branch `br-muddy-meadow-ac7ah2wl`, database `omnigestao_prod` e endpoint `ep-summer-tooth-acltc6wi`.
Cada conexão conferiu novamente os quatro identificadores no servidor, além de `current_user`,
`session_user`, primário e `transaction_read_only=on`, antes das demais consultas.
Não houve divergência.

As três URLs e duas senhas novas vieram exclusivamente do arquivo A2 existente
`C:\Projetos\secrets\neon-production-kg\.env`. A validação offline permaneceu **30/30** e idêntica à
evidência original A2. O papel antigo usou as URLs existentes de `neon-production.env`.
Os arquivos de segredos e o arquivo de autenticação Vercel permaneceram byte a byte iguais;
os dois arquivos de segredos também conservaram o mtime. Nenhuma credencial foi criada, renovada ou rotacionada.

## Conexões e privilégios

| Conexão | Resultado | Leitura |
| --- | --- | --- |
| `omni_runtime_v2` direta | PASS | catálogo + literal de confirmação em `estoque_produtos`, LIMIT 1 |
| `omni_runtime_v2` pooled | PASS | as mesmas verificações, no host `-pooler` existente do A2 |
| `omni_migrator` direta | PASS | exclusivamente catálogos |
| `neondb_owner` direta e pooled | PASS | verificação anterior/final e leitura mínima pelo pooler |

As sete transações da execução conclusiva terminaram em **ROLLBACK**, com fechamento do cliente.
Todas comprovaram READ ONLY e TLS no cliente por `psql \\conninfo`; nenhuma alocação de XID estava presente
na consulta inicial. A conexão direta também usou `default_transaction_read_only=on`.
No pooler, o READ ONLY foi estabelecido na própria transação.
Só os timeouts foram ajustados por `SET LOCAL`.

- Runtime: **110/110** tabelas com SELECT, INSERT, UPDATE e DELETE, comprovados apenas por
  `has_table_privilege`. Nenhuma tentativa de DML foi executada.
- Runtime: **0** TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, opções de GRANT ou tabelas próprias;
  USAGE em `public`, **0 schemas** com CREATE.
- Sequências em `public`: **0**; a consulta de cobertura USAGE/SELECT/UPDATE retornou zero faltantes.
- Os três papéis novos seguem sem SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB e REPLICATION.
- Runtime não pertence, não herda e não pode assumir outro papel.
  Entre os três papéis novos, o único alcance transitivo é `omni_migrator → omni_owner`.
- Migrator: membership, INHERIT e SET em `omni_owner`, sem ADMIN OPTION;
  nenhum alcance a `neon_superuser`, `pg_write_all_data` ou outro papel adicional.
- Antes da futura transferência de posse, `omni_owner` possui zero relações em `public`;
  migrator não tem SELECT/UPDATE na tabela de estoque. Isso corresponde ao estado A3.
  A autenticação e a membership passaram; a capacidade efetiva de migrar após a transferência
  de posse não foi exercitada no A4.
- O ADMIN OPTION recebido pelo papel antigo sobre os papéis novos continua conforme o A3;
  ele não concede herança inversa aos papéis novos.

O campo `pg_stat_ssl` das evidências descreve a conexão interna vista pelo backend e retornou
`false`; a verificação de TLS do cliente usou a informação da conexão libpq, que confirmou TLS.
Essa adequação foi feita somente no verificador local.

## Verificação final e integridade

O `06-verificacao.sql` foi executado com suas consultas oficiais, acrescentando apenas a trava
de identidade, informações da conexão e timeouts locais logo após seu BEGIN READ ONLY.
O ROLLBACK original foi mantido. Scripts 01–05, 07 e 99 não foram executados.

As cinco colunas seguem `integer`:

| Tabela | Coluna |
| --- | --- |
| estoque_produtos | stock |
| produto_depositos | quantidade |
| movimentacoes_estoque | quantidade |
| movimentacoes_estoque | estoqueAntes |
| movimentacoes_estoque | estoqueDepois |

O histórico Prisma segue com **23 registros finalizados** e **0 registros** da migration
`20261025120000_estoque_quantidade_fracionada`.

Os fingerprints calculados no servidor e comparados somente em memória confirmaram igualdade,
antes/depois, de todas as linhas de `estoque_produtos`, `produto_depositos`,
`movimentacoes_estoque`, `vendas`, `sessoes_caixa` e `_prisma_migrations`.
Confirmaram também igualdade da estrutura de `public`, colunas, constraints, índices,
triggers, políticas, funções, tipos, enums, schemas, proprietário/ACL do database, papéis e memberships.
Não foram persistidos hashes de linhas, IDs comerciais, saldos, valores, clientes ou dados pessoais.
Outras tabelas comerciais não foram varridas: a ausência de escrita desta execução também é assegurada
pelas transações READ ONLY e pela lista restrita de instruções do harness.

## Vercel e continuidade do papel antigo

A API CLI retornou **403, invalidToken=true**. O token foi preservado e não houve tentativa de renovação.
A conferência foi concluída usando a sessão Edge já autenticada, somente por navegação, filtros
e leitura da página de variáveis do projeto `omni-gestao-pro`.

Os **18 metadados Production observados antes** da validação do banco permaneceram iguais após
recarregar a página e aplicar novamente o filtro Production. Uma linha adicional foi carregada
tardiamente (`BARCODE_LOOKUP_PROVIDERS`, data visível de 10 de julho); isso foi registrado separadamente.
Esta comparação cobre as linhas observadas, e não um inventário integral pela API.

`DATABASE_URL` e `DIRECT_URL` Production continuam mostrando **27 de julho**, anterior à geração
das credenciais A2 em 28 de outubro. O deployment Production `7UqN8Rrkz9Vi7ezB3ArkL6TDcvvW`,
commit `ba010ac`, segue READY, no alias canônico, com o mesmo ID visto no cartão inicial do projeto.
Não houve ação de edição de variável, publicação ou redeploy.

**A continuidade de Production com `neondb_owner` é uma inferência de continuidade** baseada no estado
confirmado pelo proprietário/A3, nas datas inalteradas das variáveis e no deployment preservado,
reforçada pelo login e leitura real do papel antigo. Os valores `sensitive` da Vercel não foram relidos
nem decriptados; não se trata de uma nova leitura direta do usuário contido nesses valores.

## Evidências e ocorrências locais

| Local | Conteúdo |
| --- | --- |
| `00-neon-api-identity.json` | Identidade da API, sanitizada |
| `00-a2-validation.txt` | Revalidação offline A2 |
| `attempt-05/02-owner-preflight.json` | Estado inicial, sem hashes privados |
| `attempt-05/03-runtime-direct.json` | Login runtime direto e catálogo |
| `attempt-05/04-runtime-pooled.json` | Login runtime pooled e catálogo |
| `attempt-05/05-migrator-direct.json` | Login migrator e membership |
| `attempt-05/06-old-runtime-pooled.json` | Preservação do login antigo |
| `attempt-05/07-official-06.json` | Verificação oficial 06 sanitizada |
| `attempt-05/08-owner-final.json` | Estado final |
| `attempt-05/10-final-comparison.json` | Comparações, sem valores comerciais |
| `11-vercel-ui-verification.json` | Suplemento Vercel e limites da inferência |
| `12-final-summary.json` | Resultado consolidado conclusivo |
| `harness/` | Código local e SQL restritos à leitura |

A tentativa inicial parou por DNS do sandbox, antes de autenticar no banco.
A tentativa 02 parou no GET Vercel 403, também antes de autenticar no banco.
A tentativa 03 encontrou um erro no parser local para JSON PostgreSQL multiline; a sessão utilizou
o mesmo SQL READ ONLY e ROLLBACK. A tentativa 04 concluiu o preflight com ROLLBACK, mas o verificador
local tratou incorretamente `pg_stat_ssl` como prova do TLS cliente. Corrigidos somente o parser e
esse critério local, a tentativa 05 concluiu todos os testes do banco.

O `attempt-05/summary.json` preserva A4=FAIL / A4_DATABASE_CHECKS=PASS por não conseguir concluir
a via API Vercel. **O resultado consolidado A4=PASS incorpora o suplemento UI posterior**,
com os limites descritos acima. Nenhuma falha foi corrigida por alteração de privilégios ou configuração produtiva.

Os WIPs e as evidências locais preexistentes foram comparados e preservados.
O AEP permaneceu opt-out, sem `.aep-active` nas duas worktrees; não foi executado `track close`,
que criaria commit. Não houve commit, push, merge, deploy ou alteração de env.
Nenhuma consulta a `cron.job` ou a outro database foi executada.

Referências de método: [privilégios no PostgreSQL 17](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE),
[pooling Neon](https://neon.com/docs/connect/connection-pooling).

Execução encerrada no A4. O próximo gate exige autorização separada.

