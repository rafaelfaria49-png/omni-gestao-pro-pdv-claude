# A3 — papéis e grants em produção (2026-10-29 09:39Z)

**Autorização do dono:** "GOAL — ESTOQUE-KG-PRODUCTION-A3-001 · AUTORIZAÇÃO EXPRESSA DO PROPRIETÁRIO: A3 SOMENTE".
Alvo exclusivo: Neon `dry-mouse-36002471`, branch `br-muddy-meadow-ac7ah2wl`, endpoint `ep-summer-tooth-acltc6wi`
(conexão direta), databases `neondb` (01) e `omnigestao_prod` (02).

Escrita feita: **só** `rollout/01-papeis.sql` e `rollout/02-grants-runtime.sql`, oficiais, sem cópia nem edição, cada um
numa transação única (`psql -1`) aberta por uma trava de identidade. Nada de 03/04/05/07/99, migration, env da Vercel,
merge, deploy, commit, push, login com os papéis novos ou dado comercial.

```
A3=PASS
NEON_PRODUCTION_IDENTITY=PASS
A2_CREDENTIALS_REUSED=YES
SCRIPT_01=PASS
KG_PAPEIS_OK=YES
SCRIPT_02=PASS
KG_RUNTIME_GRANTS_OK=YES
ROLE_PRIVILEGE_ISOLATION=PASS
OLD_RUNTIME_PRESERVED=YES
STOCK_COLUMNS=INTEGER
COMMERCIAL_DATA_WRITES=0
SCHEMA_MIGRATIONS=0
VERCEL_CHANGES=0
MERGE=NO
DEPLOY=NO
NEXT_GATE=A4, mediante autorização separada
```

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `harness/a3.cjs` | fases `url` (sem conectar) · `pre`/`pos` (read-only) · `s01`/`s02` (exigem `A3_AUTORIZADO=1`) · `pooler` (read-only). Papel antigo de `neon-production.env`; senhas novas do A2 só no ambiente do psql do `s01`; saída redigida |
| `harness/a3-pre.sql`, `harness/a3-pos.sql` | `BEGIN … READ ONLY` + identidade conferida com `\if` antes de qualquer consulta; terminam em `ROLLBACK` |
| `00-a2-revalidacao.txt` | `a2-credenciais.cjs validar` (sem conectar): 30/30, **byte a byte igual** a `PADARIA-GO-LIVE-FASTTRACK-002/01-a2-validacao.txt` |
| `01-preflight-readonly.txt` | preflight em `neondb` e `omnigestao_prod` |
| `02-script-01-papeis.txt` | saída integral do 01 |
| `03-script-02-grants.txt` | saída integral do 02 |
| `04-verificacao-readonly.txt` | verificação pós em `neondb` e `omnigestao_prod` + `06-verificacao.sql` oficial |
| `05-runtime-antigo-pooler-readonly.txt` | papel antigo pelo pooler (caminho do app), transação read-only |

Trava de escrita (`s01`/`s02`), primeiro comando da mesma transação: divide por zero — e desfaz tudo — salvo se
`neon.project_id`, `neon.branch_id`, `neon.endpoint_id`, `current_database()`, `current_user = neondb_owner` e
`NOT pg_is_in_recovery()` forem os esperados. Sessões: `statement_timeout=30s`, `lock_timeout=5s`. Varredura das 9
saídas/harness contra os 10 valores dos dois arquivos de segredo: **0 vazamentos**.

## Preflight (09:38:59Z)

- **Identidade:** `neondb` e `omnigestao_prod` com o mesmo project/branch/endpoint, `timeline_id`
  `917bebec…87b6` e `system_identifier` `7667235400144430878` — o `neondb` é do **mesmo cluster** de produção (o Preview é
  outro projeto, `nameless-frost-19035275`). PG 17.11, primário.
- **A2:** arquivo `C:\Projetos\secrets\neon-production-kg\.env` com as 5 chaves, cabeçalho "gerado offline em
  2026-10-28T14:27:42.360Z" = mtime do arquivo; o gerador recusa sobrescrever; `validar` idêntico ao do A2. Nenhum valor
  impresso, transmitido ou rotacionado.
- **Papéis:** `omni_owner`, `omni_migrator`, `omni_runtime_v2` inexistentes (único `omni*` = `omnigestao_candidate_audit_ro`).
- `neondb_owner`: `CREATEROLE`, `BYPASSRLS`, ∈ `neon_superuser`/`pg_write_all_data`; `createrole_self_grant` vazio.
- `omnigestao_prod`: `datacl` NULL, 110 tabelas, **0 RLS**, 0 sequências, 0 views; 5 colunas `integer`; 23 migrations
  finalizadas, KG ausente.
- Caixas `ABERTA`: **`loja-1`=1** (no A1/A1.1 era a `loja-2`; hoje a `loja-2` está fechada). Não afeta o A3.

## Execução

| Script | Database | Início | Duração | Resultado |
| --- | --- | --- | --- | --- |
| `01-papeis.sql` | `neondb` | 09:39:15Z | 0,45 s | `A3_GUARD_OK` → 3× `CREATE ROLE` + `GRANT ROLE` → `NOTICE: KG_PAPEIS_OK`, exit 0 |
| `02-grants-runtime.sql` | `omnigestao_prod` | 09:39:25Z | 0,27 s | `A3_GUARD_OK` → 4× `GRANT` → `NOTICE: KG_RUNTIME_GRANTS_OK`, exit 0 |

## Verificação (09:39:36Z)

| Item | Lido | |
| --- | --- | --- |
| Papéis | `omni_owner` NOLOGIN; `omni_migrator`, `omni_runtime_v2` LOGIN; os três sem SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB, REPLICATION | PASS |
| Memberships | só `omni_migrator` → `omni_owner` (INHERIT, SET; grantor `neondb_owner`) + ADMIN do `neondb_owner` sobre os papéis novos (ver observação 1) | PASS |
| Alcance a papel privilegiado (`neon_superuser`, `pg_write_all_data`, `pg_read_all_data`, `neondb_owner`, super/bypassrls/createrole…) | nenhum, para os três | PASS |
| Runtime × `omni_owner` | `USAGE=false`, `SET=false`; runtime não alcança o migrator | PASS |
| CONNECT | `omni_runtime_v2=c`, `omni_migrator=c` na ACL de `omnigestao_prod` | PASS |
| DML do runtime | 110/110 tabelas com SELECT/INSERT/UPDATE/DELETE; 0 TRUNCATE/REFERENCES/TRIGGER; `USAGE` no schema, sem `CREATE`; 0 sequências | PASS |
| Posse | 0 objetos de `omni_owner`; os objetos seguem do `neondb_owner` (06: 540) | PASS (corte de posse é o J6) |
| Papel antigo | `connect=true`, `escreve_estoque=true`, login; pelo **pooler** (caminho do app): login aceito, `estoque_produtos` = 14.127 | PASS |
| Colunas | 5 `integer` | PASS |
| Migrations | 23, KG = 0 | PASS |
| Agregados | `estoque_produtos` 14.127/69.318 · `produto_depositos` 13.744/70.070 · `movimentacoes_estoque` 2.580 (última 2026-10-28 21:55:23Z) — **iguais antes e depois** | PASS |
| Sessões | só as do próprio harness (`kg-a3-*`) | — |

## Observações

1. **`neondb_owner` tem ADMIN OPTION sobre os três papéis novos** (grantor `cloud_admin`, sem INHERIT/SET): efeito do
   `CREATE ROLE` por um papel `CREATEROLE` no PG 16+/Neon. Já visto no ensaio 002 ("caminho humano de reabertura"); o
   runbook o fecha só na P3 (troca de senha do papel antigo). Não dá ao papel antigo nada que ele já não tenha hoje.
2. A ACL de `omnigestao_prod` deixou de ser NULL: o `GRANT` materializou o padrão (`=Tc/neondb_owner`,
   `neondb_owner=CTc/neondb_owner`) e acrescentou os dois papéis. **PUBLIC e o papel antigo mantêm CONNECT/TEMP**; o
   corte é o `04` (J6). Por isso `omni_owner` aparece com `connect=true` (via PUBLIC) apesar de NOLOGIN.
3. O runbook pede "`06` antes e depois" no A3, mas o `06` chama `pg_has_role(..., 'omni_owner', ...)` e falha enquanto o
   papel não existe; o "antes" foi o `a3-pre.sql`, equivalente e read-only. Ajuste de texto do runbook fica fora deste GOAL.
4. O `01` não é idempotente (recusa papel existente): **não rodar de novo**. O `02` é idempotente: se surgir tabela nova
   antes do J3, rodar outra vez.
5. Nenhum login com `omni_runtime_v2`/`omni_migrator` foi feito: a prova de login (direto e pooler) é o A4.
