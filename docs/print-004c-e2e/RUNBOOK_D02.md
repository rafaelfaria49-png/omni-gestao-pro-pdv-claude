# Roteiro operacional D02-A — aplicação manual das tabelas de impressão

**Situação:** preparado e ensaiado só em PostgreSQL 17 descartável. **Nada foi aplicado em homologação ou produção.**
Executar este roteiro depende de aprovação expressa do proprietário para cada ambiente (janela, executor, ponto de
restauração). A aprovação da estratégia D02-A não autoriza a execução.

Ferramenta: `tools/print-d02/d02.mjs` (Node 24 + `psql` 17). Ela confere o alvo antes de qualquer comando e para com um
código de saída claro:

| Código | Significado | O que fazer |
|---|---|---|
| 0 | concluído | seguir o roteiro |
| 2 | alvo ou pré-condição recusados | nada foi executado; corrigir o alvo ou a ordem |
| 3 | exige decisão humana | parar e consultar §8 |
| 4 | aplicação desistiu | nada ficou parcial (ver mensagem); repetir em momento calmo ou parar |
| 5 | verificação falhou | parar e consultar §8 |

## 1. O que será aplicado

Três pastas no formato do Prisma, geradas por `tools/print-d02/generate.mjs` a partir dos arquivos candidatos e
conferidas byte a byte pelo teste `d02-guard.test.ts`:

| Ordem | Pasta | Conteúdo | Trava |
|---|---|---|---|
| (i) a | `20261105120000_omni_print_d02_idx_vendas` | `CREATE UNIQUE INDEX CONCURRENTLY p004_vendas_id_store_uq` | não bloqueia vendas; `lock_timeout` 5 s |
| (i) b | `20261105120100_omni_print_d02_idx_terminais` | `CREATE UNIQUE INDEX CONCURRENTLY p004_term_id_store_uq` | não bloqueia o PDV; `lock_timeout` 5 s |
| (ii) | `20261105120200_omni_print_d02_core` | 11 tabelas `print_*`, 7 funções `p004_*`, 46 gatilhos, 39 FKs, numa única transação | guarda `CUT_GUARD "01"`: `lock_timeout` 2 s e locks pais no início, `vendas` primeiro |

Nenhuma coluna ou linha existente é alterada. As pastas ficam em `tools/print-d02/migrations/` até o passo 6.5, fora de
`prisma/migrations`, para que nenhum build as aplique.

## 2. Pré-condições (todas obrigatórias)

1. **Aprovação escrita do proprietário** para o ambiente específico, com janela, executor e o plano de backup/rollback
   deste roteiro.
2. **Ensaio em cópia (recomendado antes de produção):** um branch Neon criado a partir da produção, **somente com
   autorização separada**. Executar §6 nele e anotar o tempo de cada índice com o volume real de `vendas`.
3. **Checkout do commit exato** da PR D02: `git status` limpo e `node tools/print-d02/generate.mjs --check` com 3× `OK`.
4. **Ferramentas:** Node 24, `psql` 17 (`PG_BIN` apontando para a pasta `bin`) e `npm ci` feito no checkout. O Prisma
   usado no passo 6.6 é o do repositório.
5. **O recurso continua desligado:** `APPROVED_RELEASE = null` e nenhuma variável `OMNI_PRINT_*` em Production. As
   tabelas sozinhas não ligam nada.

## 3. Identificação do banco e do endpoint

1. No console Neon, anotar o **projeto**, o **branch** (produção) e o **id do endpoint** (`ep-…`).
2. Usar o **endpoint direto** (host **sem** `-pooler`, porta 5432). O pooler quebra `CONCURRENTLY` e os parâmetros de
   sessão, e a ferramenta o recusa.
3. Conectar com o **papel da aplicação** (dono de `public.vendas`). A ferramenta recusa outro papel.
4. **Não** usar o `.env` local: ele aponta para o banco *candidate*, não para a produção.
5. Exportar a URL só na sessão do terminal (nunca em arquivo do repositório). Os comandos deste roteiro são para
   **Git Bash**; a forma equivalente no PowerShell vem logo abaixo.

```bash
export D02_DATABASE_URL='postgresql://<papel>:<senha>@<ep-xxxx>.<região>.aws.neon.tech/<banco>?sslmode=require'
E="--expect-db <banco> --expect-host <ep-xxxx>.<região>.aws.neon.tech"
node tools/print-d02/d02.mjs status $E
```

```powershell
$env:D02_DATABASE_URL = 'postgresql://<papel>:<senha>@<ep-xxxx>.<região>.aws.neon.tech/<banco>?sslmode=require'
$E = @('--expect-db', '<banco>', '--expect-host', '<ep-xxxx>.<região>.aws.neon.tech')
node tools/print-d02/d02.mjs status @E
```

Esperado: `alvo: banco=<banco> host=<…> papel=<dono> PostgreSQL 17.x` e `"state":"BASELINE"`. Qualquer outro estado:
parar (§8).

## 4. Backup e ponto de restauração

Imediatamente antes da janela:

1. **Ponto de restauração Neon:** criar um branch de segurança a partir da produção (`backup-pre-d02-AAAAMMDD-HHMM`) **ou**
   anotar o instante exato para PITR, conferindo que está dentro da retenção do projeto.
2. **Instante e LSN:** `SELECT now(), pg_current_wal_lsn();` e anotar.
3. **Schema:** `pg_dump --schema-only --no-owner -d "$D02_DATABASE_URL" -f <pasta fora do repo>/schema-pre-d02.sql`.

Restaurar o ponto de restauração **apaga as vendas feitas depois dele**: é o último recurso (§8). O rollback normal é por
desativação (§9).

## 5. Janela de manutenção

- **Quando:** baixo movimento, de preferência antes da abertura da loja.
- **Pior caso por tentativa:** quem grava em `vendas` espera cerca de 2 s enquanto o passo (ii) aguarda uma venda aberta.
  Heartbeat e login só esperam a fração de segundo da execução (ensaio D02, teste 3; `d02-migrations` teste 3).
- **Sem deploy em andamento** na Vercel durante a janela.
- **Duas pessoas:** o executor e alguém observando o caixa (ou o proprietário), com canal aberto.
- **Reserva:** 30 minutos.

## 6. Aplicação segura

Em todos os comandos abaixo, `$E` é o definido no §3 (no PowerShell, `@E`).

1. **Estado inicial:** `node tools/print-d02/d02.mjs status $E` → `BASELINE`.
2. **Índices (i):** `node tools/print-d02/d02.mjs apply-indexes $E`
   - Esperado: duas linhas `criado VÁLIDO em N ms`. Anotar os tempos.
   - **Saída 4** (`Ficou: invalid`): uma venda ficou aberta mais de 5 s. As vendas **não** foram afetadas. Esperar um
     momento calmo e rodar `apply-indexes $E --repair-invalid` (remove o índice inválido com `DROP INDEX CONCURRENTLY` e
     recria).
3. **Núcleo (ii):** `node tools/print-d02/d02.mjs apply-core $E --attempts 3 --spacing-s 60`
   - Esperado: `passo (ii) aplicado em N ms (tentativa k)`.
   - Cada tentativa que desiste não deixa nada aplicado (a ferramenta confere o estado depois de cada falha).
   - **Saída 4** após 3 tentativas: encerrar a janela. Os índices de (i) ficam, sem efeito com o recurso desligado.
     Repetir outro dia ou removê-los (§9).
4. **Verificação:** `node tools/print-d02/d02.mjs verify $E` → `VERIFY PASS`. Confere:
   - 11 tabelas, 7 funções e os 2 índices válidos;
   - 46 gatilhos;
   - todas as restrições validadas;
   - dono correto;
   - nenhum privilégio para `PUBLIC`.
5. **Promoção (no checkout da PR):** `node tools/print-d02/d02.mjs promote`. Ela copia as 3 pastas para
   `prisma/migrations` com os mesmos bytes (LF, garantido por `.gitattributes`) e recusa uma cópia diferente.
6. **Registro no Prisma:** `node tools/print-d02/d02.mjs resolve $E`.
   - Roda `prisma migrate resolve --applied` para as 3 pastas, e só com o banco no estado `CORE_APPLIED`.
   - Termina com `VERIFY PASS`, conferindo também as 3 linhas em `_prisma_migrations` e os checksums iguais aos arquivos.
7. **Registro da execução:** preencher `tools/print-d02/APLICACAO.json`:
   - `status`: `APLICADA_E_REGISTRADA`;
   - banco, endpoint, executor, aprovação, janela, ponto de restauração, commit e saída do `verify --prisma`.
8. **Commit e merge:**
   - Commitar com caminhos explícitos: as 3 pastas em `prisma/migrations` e `APLICACAO.json`.
   - **Manter** `tools/print-d02/migrations`: o `d02-guard`, o `generate.mjs --check` e a ferramenta comparam as pastas
     promovidas com elas.
   - O teste `d02-guard` (workflow `Omni Print D02 — guarda`) só aceita as pastas em `prisma/migrations` com esse
     registro preenchido.
   - **Só então** a PR pode seguir para merge. O build de produção encontra as 3 já aplicadas e não executa nada.

## 7. Validação de integridade

Depois do §6:

| Verificação | Comando | Esperado |
|---|---|---|
| Objetos e registro | `d02.mjs verify $E --prisma` | `VERIFY PASS` |
| Prisma em dia | `npx prisma migrate status` (com `DATABASE_URL`/`DIRECT_URL` do endpoint direto só na sessão) | `Database schema is up to date!` |
| Paridade com o schema | `npx prisma migrate diff --from-url "$D02_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | saída 0 (sem diferença) |
| Vendas | uma venda de teste numa loja de homologação (nunca na loja real com cliente real) | grava normalmente |
| Recurso | tela de configuração | impressão direta continua indisponível (gate desligado) |

## 8. Critérios de parada e recuperação

Parar imediatamente, sem novas tentativas, se:

- qualquer venda falhar ou o caixa relatar lentidão além de alguns segundos;
- `status` mostrar `INCONSISTENT` (não deveria ocorrer: (ii) é uma transação);
- a ferramenta sair com 3 ou 5;
- o alvo exibido não for o anotado no §3.

| Situação | Recuperação |
|---|---|
| Índice inválido (saída 4 em (i)) | `apply-indexes --repair-invalid` em momento calmo; se repetir, encerrar a janela |
| Núcleo desistiu 3 vezes | encerrar; nada a desfazer além dos índices (opcional, §9) |
| `INDEXES_PARTIAL` (parada entre os dois índices) | `apply-indexes` de novo: mantém o válido e cria o que falta |
| Aplicado mas não registrado (`verify --prisma` acusa ausência) | `promote` + `resolve`; **nunca** registrar o que não existe (a ferramenta recusa) |
| Checksum diferente em `_prisma_migrations` | arquivo com CRLF ou alterado: apagar as 3 linhas D02 de `_prisma_migrations`, recuperar o checkout limpo e repetir `promote` + `resolve` |
| `prisma migrate deploy` rodou o núcleo e falhou (ver §10) | `prisma migrate resolve --rolled-back 20261105120200_omni_print_d02_core` e reaplicar pelo §6 |
| Vendas paradas além do previsto | interromper o `psql` (Ctrl+C) ou `SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='omni-print-d02'`. A transação (ii) volta inteira |
| Dano real (último recurso) | restaurar o ponto do §4 **com aprovação do proprietário**, ciente de que vendas posteriores a ele se perdem |

## 9. Rollback

- **Preferido: desativação.** Manter (ou voltar) o gate desligado: `APPROVED_RELEASE = null`, sem
  `OMNI_PRINT_DIRECT_ENABLED` em Production. Não toca o banco, é instantâneo e preserva o registro de impressão.
- **Remoção das tabelas (só se necessário e só com a loja fechada):**
  1. Se houver dados de impressão, exportar antes: `pg_dump --data-only -t 'public.print_*'`. O registro é a prova de
     "não imprimir duas vezes".
  2. **Se as pastas já estiverem na `main`:** reverter primeiro o commit que as promoveu e publicar. Do contrário, o
     próximo deploy de produção as **reaplica** (`d02-migrations` teste 8).
  3. Conferir o alvo com `node tools/print-d02/d02.mjs status $E` e só então
     `psql -d "$D02_DATABASE_URL" -v ON_ERROR_STOP=1 -X -f tools/print-004c-e2e/d02/rollback_print_candidate.sql`,
     **sem** `-1`. Repetir o `status` depois. Remover as FKs
     exige `ACCESS EXCLUSIVE` em `vendas`, `stores`, `pdv_terminais` e `admin_users`. Com movimento, desiste inteiro em
     cerca de 2 s.
  4. Apagar o registro: `DELETE FROM public._prisma_migrations WHERE migration_name LIKE '%\_omni\_print\_d02\_%'`.
     O `prisma migrate resolve --rolled-back` **não** serve aqui: só vale para migration que falhou (teste 8).
  5. `d02.mjs status` → `BASELINE` e as 3 linhas ausentes.

## 10. Prisma: registro, build e riscos

- **Registro manual:** feito por `d02.mjs resolve` (§6.6). O checksum gravado é o SHA-256 dos bytes do arquivo; por isso
  as pastas são LF em qualquer checkout (`.gitattributes`), e `promote` recusa cópia com CRLF.
- **Proteção do build:**
  - `scripts/vercel-build.mjs` roda `prisma migrate deploy` em Production quando a autoridade de migration está ligada.
  - As pastas D02 ficam fora de `prisma/migrations` até estarem aplicadas e registradas.
  - O teste `d02-guard` falha se alguma delas aparecer lá sem `APLICACAO.json` preenchido, ou se qualquer outra
    migration criar objetos `p004_`/`print_`. Ele roda no workflow `omni-print-d02-guard.yml` em toda PR que toque
    `prisma/migrations` ou `tools/print-d02`.
  - Entre o `resolve` e o merge, um deploy da `main` (sem as pastas) contra o banco já registrado responde
    `No pending migrations to apply` (`d02-migrations` teste 1).
- **Compatibilidade com `prisma migrate deploy` (medido, Prisma 6.19.3):**
  - aplica as 3 pastas num banco de homologação, cada índice como comando único fora de transação;
  - com as 3 registradas, responde `No pending migrations to apply`;
  - se o núcleo desistir por lock dentro do deploy, a transação volta inteira, mas o Prisma deixa a linha **sem
    `finished_at`**. A mensagem é `current transaction is aborted`, porque ele não consegue gravar o próprio log na
    sessão abortada;
  - os deploys seguintes param com `P3009` até `migrate resolve --rolled-back`. Por isso a aplicação em produção é pelo
    §6, não pelo build.
- **`prisma migrate dev` / `reset`:**
  - **nunca** apontar para um banco compartilhado;
  - o histórico deste repositório já não recria um banco vazio: `0005_multitenant_product_sku_composite` falha com
    `estoque_produtos does not exist`. É pré-existente e não tem relação com o D02;
  - por isso `migrate dev` (banco sombra) não funciona hoje e pode propor `reset`, que apaga o banco inteiro;
  - `prisma db push` criaria as tabelas sem registro e não deve ser usado fora do laboratório.
- **Índice inválido:**
  - `CREATE INDEX CONCURRENTLY` que desiste deixa o índice `indisvalid = false`;
  - repetir sem limpar falha com `already exists`;
  - recuperação: `DROP INDEX CONCURRENTLY` e recriar, que é o que `apply-indexes --repair-invalid` faz;
  - se isso ocorrer dentro de um `migrate deploy`, fazer o mesmo e depois `migrate resolve --rolled-back <pasta>`.

## 11. Registro de execução

Cada linha começa **NÃO EXECUTADO** e só muda com evidência (saída da ferramenta, print do console Neon) e o nome de
quem executou.

| Ambiente | Etapa | Resultado | Evidência | Executor / data |
|---|---|---|---|---|
| Cópia (branch Neon) | §6 completo + tempos dos índices | NÃO EXECUTADO | | |
| Produção | §3 identificação | NÃO EXECUTADO | | |
| Produção | §4 backup | NÃO EXECUTADO | | |
| Produção | §6.2 índices | NÃO EXECUTADO | | |
| Produção | §6.3 núcleo | NÃO EXECUTADO | | |
| Produção | §6.4–6.6 verify, promote, resolve | NÃO EXECUTADO | | |
| Produção | §7 validação | NÃO EXECUTADO | | |
