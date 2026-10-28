# P2 — procedimento e verificações (preparado, NÃO executado)

Alvo: projeto `nameless-frost-19035275` (`omnigestao-preview`), branch `main` `br-lively-feather-b6esh64a`,
database `omnigestao_preview`. Roteiro: `harness/p2-preparo-preview.cjs`. Prova local:
`04-prova-local-p2.txt` (PASS, 2026-10-26).

## Escopo da autorização P2

Pede-se autorização para o seguinte, e só isto, no projeto preview:
- criar o papel `preview_runtime`;
- aplicar o schema da main (`34b70a1`) e marcar as 23 migrations como aplicadas;
- dar ao runtime grants só de DML;
- semear dados sintéticos: 1 loja, 1 admin `admin@preview.invalid` e o vínculo entre eles;
- criar o branch `pr315-kg` e aplicar nele a migration KG.

Fica de fora:
- Vercel (é a P3);
- Production e Candidate, nem para leitura;
- push e deploy (é a P4).

## Fluxo de segredos (nada no chat, nada no repo, nada em argv)

| Arquivo | Quem escreve | Conteúdo |
| --- | --- | --- |
| `C:\Projetos\secrets\neon-preview.env` | **dono**, com editor de texto | `PREVIEW_MAIN_OWNER_URL=` (e depois `PREVIEW_KG_OWNER_URL=`, `PREVIEW_KG_BRANCH_ID=`) |
| `C:\Projetos\secrets\neon-preview-generated.env` | roteiro | senha do `preview_runtime` e do admin sintético, URLs do runtime para a P3 |
| pasta de trabalho no scratchpad | roteiro | `prisma/` da main extraído e `base.sql`, apagados ao final |

- **URL a copiar:** no console Neon, abrir o projeto `omnigestao-preview`, branch `main`, botão **Connect**:
  - database `omnigestao_preview`;
  - papel dono (o padrão);
  - **pooling desligado** (URL direta, host sem `-pooler`).
- O roteiro só **lê** os arquivos pelo caminho e nunca lista a pasta.
- Recusa arquivo de segredo dentro de repositório git. É fail-closed: só aceita quando o git diz "not a git
  repository".
- Senhas só por `PGPASSWORD`/stdin.
- Saídas passam por redação.
- A prova local varreu o log atrás de cada valor gerado: **0 vazamentos**.

## Travas do roteiro

- **URL:** só aceita endpoint `ep-*.sa-east-1.aws.neon.tech`, direto e diferente de `ep-summer-tooth-acltc6wi`, com
  database `omnigestao_preview`. Recusa pooler e produção antes de conectar (provado).
- **Cada sessão psql** começa por um SELECT que divide por zero (`22012`) se `neon.project_id` ≠
  `nameless-frost-19035275`, se `neon.branch_id` ≠ o branch esperado, se `neon.endpoint_id` ≠ o host da URL ou se
  `current_database()` ≠ `omnigestao_preview` (provado com URL trocada).
- **`main`:** só roda com `public` vazio, sem `preview_runtime` e com arquivo gerado novo. Rodar de novo é
  recusado (provado).
- **`kg`:** exige branch ≠ main e endpoint ≠ main. Só segue se a **única** migration pendente for
  `20261025120000_estoque_quantidade_fracionada`. Rodar de novo é recusado (provado).

## Passos (cada um com parada e relatório)

**P2.0 — FEITA 2026-10-27, PASS, pelo conector Neon do ChatGPT** (`06-p2-0-check.md`). Não repetir.
- Dono real: `omnigestao_preview_owner`.
- Endpoint do main: `ep-purple-morning-b6ajdsfk`.
- Os dois agora são constantes do roteiro, que recusa URL com outro endpoint ou usuário (negativos na prova
  local).

O texto abaixo descreve o `check` do roteiro. Fica disponível, mas não é necessário.

**P2.0 `check` — só leitura** (`default_transaction_read_only=on`).
- Esperado:
  - project, branch e endpoint do preview;
  - PG 17;
  - `tabelas_public=0`;
  - a lista de papéis, só o dono.
- Mostra o nome real do papel dono. A P2.0 confirmou `omnigestao_preview_owner`.
- Se a senha do dono for a mesma de algum papel da produção, a trava de projeto ainda impede o uso cruzado. A
  rotação fica opcional.
- Divergência = parar.

**Antes da P2.1 — arquivo local (dono), sem conexão ao banco:**
1. No console Neon, abrir `omnigestao-preview` → branch `main` → **Connect**:
   - database `omnigestao_preview`;
   - papel `omnigestao_preview_owner`;
   - **Connection pooling desligado**.
2. Copiar a string. O host tem de ser `ep-purple-morning-b6ajdsfk.sa-east-1.aws.neon.tech`, sem `-pooler`.
3. No Explorador, com **Exibir → Extensões de nomes de arquivos** ligado, criar
   `C:\Projetos\secrets\neon-preview.env`, nome exato e sem `.txt`.
4. Escrever uma linha: `PREVIEW_MAIN_OWNER_URL=<string>`. Pode ter `?sslmode=require&channel_binding=require`.
   O roteiro tira `channel_binding` só para o Prisma.
5. Esta sessão roda `node harness/p2-preparo-preview.cjs url`. Ele **não conecta**: só confere formato,
   endpoint, usuário e database, e informa `senha_presente`.

Não repete a P2.0. Com `url: OK`, a P2.1 pode rodar assim que for autorizada.

**Feito em 2026-10-27:** URL_CHECK=PASS (`07-p2-url-check.md`).
- O arquivo real ficou em `C:\Projetos\secrets\neon-preview\.env` e é passado em `P2_SECRETS_FILE`.
- O host do console tem a célula `.c-2`, que o validador agora aceita.

**P2.1 `main` — FEITA 2026-10-27, PASS** (`08-p2-1-main.md`). O arquivo gerado está em
`C:\Projetos\secrets\neon-preview\generated.env`. Esperado, conforme a prova local:
- `main=34b70a1 migrations=23`;
- `base aplicada` em uma transação;
- `resolvidas=23`, `up to date`, `drift main 0`;
- `tabelas=110 sem_dml_runtime=0 rls=0`;
- runtime `create_public=false create_db=false super=false bypassrls=false createrole=false membros=-`;
- 5 colunas KG `integer`;
- `seed: lojas=1 admins=1 bcrypt_confere=true`;
- `runtime_login=preview_runtime · ddl_recusado=42501`.

**P2.2 — dono, no console Neon:**
- Criar o branch `pr315-kg` **a partir do `main` no estado atual, depois do P2.1**. O branch copia papéis,
  senhas, schema e seed.
- Compute 0,25 CU, suspensão de 5 min.
- Acrescentar ao arquivo de segredos `PREVIEW_KG_OWNER_URL` (direta) e `PREVIEW_KG_BRANCH_ID`.
- O Free comporta 10 branches por projeto.

**P2.3 `kg` — FEITA 2026-10-27, PASS** (`09-p2-3-kg.md`).
- Branch `br-wandering-band-b6ov7vmt`, endpoint `ep-red-wave-b6bbj667`.
- O roteiro foi ampliado com checksum, histórico, md5 dos saldos e a prova KG em rollback.

Esperado:
- `prisma da PR @ 5e1feb9`;
- `pendentes: 20261025120000_…`, `All migrations have been successfully applied`, `drift kg 0`;
- 5 colunas `double precision`;
- `sem_dml_runtime=0` (o `ALTER COLUMN TYPE` preserva os grants);
- runtime loga e recebe `42501` em DDL;
- **`main segue integer`**.

**P2.4 — registro:** saída de cada fase em `06-p2-execucao.txt` (já redigida). Só nomes das chaves do arquivo
gerado.

## Se algo falhar

- **P2.0:** nada escrito.
- **P2.1:**
  - o papel é criado antes da base, que roda em uma transação;
  - o estado parcial possível é papel e/ou base sem resolve;
  - limpeza só no preview e com OK do dono: `DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP ROLE preview_runtime;`;
  - depois, apagar o arquivo gerado e rodar de novo.
- **P2.3:** excluir o branch `pr315-kg` no console e recriar a partir do `main`.

## Limites conhecidos

- O preview fica sem histórico (retenção 0, sem PITR). O banco é recriável pelo roteiro.
- O `preview_runtime` tem a mesma senha no `main` e no `pr315-kg`, porque o branch copia papéis. É aceitável:
  os dois são preview e só têm dados sintéticos.
- Produtos UN/KG não entram no seed. São criados pela UI na P5, junto com a prova de destino, porque o cadastro
  real exercita o fluxo.
- O `pr315-kg` recebe a migration do prisma da PR em `5e1feb9`. Se a resolução do conflito com a main (§5 do
  plano) tocar `prisma/`, refazer o P2.3 em branch novo.
