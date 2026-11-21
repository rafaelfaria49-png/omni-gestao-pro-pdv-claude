# ESTOQUE-MANUAL-KG-NEON-REAL-REHEARSAL-002 — ensaio da estratégia B num branch Neon

Data: 2026-10-26 (12:18–12:25Z). PR #315. HEAD da branch `b00b230` + deltas locais **não commitados**
(R1 → R2 APPROVE). Código funcional aprovado (`cdb1d19`) intocado. Nenhum push, merge, deploy ou migration
em produção.

## Alvo e trava de destino

| | Produção (só leitura) | Clone do ensaio |
| --- | --- | --- |
| projeto | `dry-mouse-36002471` | `dry-mouse-36002471` |
| branch | `br-muddy-meadow-ac7ah2wl` | `br-wispy-mountain-accw2a7p` (`kg-rehearsal-002-temp`, pai = production, LSN `0/191530C0`) |
| endpoint | `ep-summer-tooth-acltc6wi` | `ep-damp-dew-ac4qr1e2` (0,25 CU fixo, autosuspend 300 s) |
| timeline | `917bebec…` | `479ec817…` |

- Toda sessão `psql` no clone começa por um SELECT que divide por zero se `neon.branch_id`,
  `neon.endpoint_id` ou `neon.project_id` não forem os do clone (`harness/neon.cjs`, `guardSql`).
- Todo cliente Prisma que deveria gravar confere os mesmos três valores antes (`guardPrisma`).
- Um host com o endpoint de produção é recusado antes de conectar (`02-isolamento-clone.txt`).
- Produção só com `PGOPTIONS=-c default_transaction_read_only=on`; a sessão reporta `read_only=on`.
- As senhas nunca foram para argv nem para arquivos de evidência. A varredura das três senhas nas evidências deu zero.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `01-producao-antes-readonly.txt` | retrato estrutural da produção antes |
| `02-isolamento-clone.txt` | identidade da sessão direta, pooler e produção; travas recusando host e branch de produção |
| `03-fase-a-pre-janela.txt` | inventário do database clonado (= produção), dados sintéticos, 01/02/06 |
| `04-fase-b-corte.txt` | 03 → 04 → 05 com 4 clientes Prisma antigos (direto, pooler, idle, idle-pooler) e 2 transações em andamento; DML/DDL; caminhos de reabertura |
| `05a/05b` | fase C depois de suspend/start e depois de restart completo |
| `05c/05d/05e` | ACL e posse pós-corte, pós-suspend/start e pós-restart (idênticos, sem contar as linhas em branco) |
| `06-fase-d-99-recorte-migration.txt` | 99 no database errado (recusado) e no certo, novo corte, migration, `migrate resolve/status/diff`, 99 depois da migration (recusado) |
| `07-fase-e-float-e-07.txt` | cliente Float KG (direto e pooler), risco Int + credencial nova sem 07, 07 com VALIDATE sobre a cópia dos dados reais |
| `09-producao-depois-readonly.txt` | retrato estrutural da produção depois (`diff` vazio contra o 01) |
| `harness/` | `neon.cjs` (travas), `rehearsal.cjs` (fases a–e), `snapshot.sql`, `acl-dump.sql` |
| `R1/R2-codex-veredito.md`, `local-*` | revisão independente dos scripts antes do ensaio (R2 APPROVE) |

## Resultados

- **Isolamento:** o clone tem branch, endpoint e timeline próprios; as travas recusaram os alvos de produção.
- **Corte:**
  - O 03 esperou as transações em andamento (7,5 s; as duas commitaram no regime integer).
  - Depois do 03, o papel antigo ainda grava (`pg_write_all_data`), como previsto.
  - Depois do 04, o cold start direto é recusado, mas **o cold start pelo pooler ainda entra**, reaproveitando uma conexão de servidor aberta. As sessões idle continuam gravando.
  - O 05 encerrou 3 sessões na 1ª rodada e chegou a zero.
  - Depois do 05, os 4 clientes e as reconexões ficam recusados (direto: `permission denied for database`; pooler: `server login has been failing, cached error`).
- **Restart:** o compute passou por suspend/start e por restart completo. Posse, ACL e pertencimentos ficaram idênticos, o papel antigo seguiu recusado e o `runtime_v2` seguiu gravando nos dois caminhos.
  - O control plane passou a listar `omnigestao_prod` com dono `omni_owner` e os 3 papéis SQL.
- **runtime_v2:** faz UPDATE, INSERT e DELETE, direto e pelo pooler. DDL é recusada (`permission denied for schema public`, `must be owner`).
- **migrator:** faz DDL com `SET ROLE omni_owner` e também por herança.
- **99:**
  - recusa o database errado;
  - reabre só o CONNECT do papel antigo, que volta a gravar (direto na hora; pooler em ~7 s, pelo erro de login em cache);
  - o corte refeito bloqueia de novo;
  - depois da migration, o 99 recusa (`0 de 5` colunas int4).
- **Migration:** `KG_MIGRATION_OK` em ~1 s, retrato md5 por linha igual nas 3 tabelas e 5 colunas `double precision`.
  - `migrate resolve` gravou o checksum `f07242c4…a06a47e`, e `migrate status` diz "up to date".
  - O `migrate diff` acusa só o nome do índice `storeId_idempotencyKey` (migration 0019), **pré-existente na produção** e fora da PR.
- **KG:** o cliente Float grava 3,96 e incrementa 0,125 (resultado 4,085) pelos dois caminhos; o cliente Int com o papel antigo é recusado.
- **Risco Int + credencial nova sem o 07:** gravar 13 resulta em `6.4e-323`, provado nos sintéticos e depois restaurado.
- **07:** o VALIDATE passou nas 5 constraints sobre a cópia dos dados reais.
  - Recusa 13 (Int), NaN, 4 casas decimais e valores acima de 999999999999999.
  - Aceita 3,96 e o teto exato.
  - O increment do cliente Int passa como no-op (limite conhecido).
  - A mensagem de erro carrega a linha inteira (§6 da remediação).
  - Ao final, 0 linhas fora do contrato nas 3 tabelas.
- **Caminho humano** (testado em transação desfeita):
  - `neondb_owner` tem `ADMIN OPTION` sobre os papéis novos (`grantor=cloud_admin`). Ele consegue `GRANT omni_owner TO neondb_owner`, reabrir CONNECT e trocar a senha do `omni_migrator`.
  - `GRANT CONNECT` direto e `ALTER DATABASE OWNER` são recusados.
  - Os papéis também ficam gerenciáveis pelo Console.
  - Nada disso é automático: nenhum deployment executa GRANT. Fecha com a troca de senha do `neondb_owner` depois da janela (§7, item 7).

## Estado final

- Branch do clone **mantido**, com o compute **suspenso** (`idle` às 12:24:43Z). Excluir exige autorização separada.
- Produção:
  - nenhuma operação do control plane na branch de produção desde as 12:00Z;
  - endpoint com a configuração original;
  - retrato estrutural idêntico antes e depois.
- PG descartável parado; junction `kgproof/node_modules` removida.
