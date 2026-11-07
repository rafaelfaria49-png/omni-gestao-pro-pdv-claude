# P2.0 `check` — PASS (2026-10-27)

**Quem executou:** o dono, pelo **conector Neon do ChatGPT**, em transação READ ONLY. **Não** pelo roteiro
local `harness/p2-preparo-preview.cjs`.

**Por quê:** o arquivo `C:\Projetos\secrets\neon-preview.env` não existia quando esta sessão tentou. O roteiro
parou antes de conectar.

**Origem dos valores:** relato do dono. Esta sessão não os conferiu por conexão própria.

| Item | Esperado | Resultado |
| --- | --- | --- |
| `neon.project_id` | `nameless-frost-19035275` | ✔ |
| `neon.branch_id` | `br-lively-feather-b6esh64a` (main) | ✔ |
| `neon.endpoint_id` | endpoint do main (não conhecido antes) | `ep-purple-morning-b6ajdsfk` (≠ `ep-summer-tooth-acltc6wi` da produção) |
| database | `omnigestao_preview` | ✔ |
| dono do banco | a confirmar (§3 supunha `preview_owner`) | **`omnigestao_preview_owner`** |
| PostgreSQL | 17 | 17.11 |
| `transaction_read_only` | on | on |
| tabelas em `public` | 0 | 0 |
| `_prisma_migrations` | inexistente | inexistente |

**Veredito: PASS** para a identidade do ambiente e as verificações SQL feitas.

Não coberto por esta P2.0, porque o `check` do roteiro inclui e o relato não traz:
- os atributos do dono (`rolcreaterole`, membro de `neon_superuser`);
- a lista de papéis não-sistema, ou seja, se `preview_runtime` ainda não existe.

A fase `main` do roteiro volta a conferir antes de escrever:
- `public` vazio;
- `preview_runtime` inexistente;
- a trava de projeto, branch e endpoint em cada sessão.

Se o `CREATE ROLE` falhar por falta de CREATEROLE, a fase para no primeiro passo, antes da base.

**Consequência para o roteiro:** o endpoint e o dono confirmados passam a ser constantes. O roteiro recusa
URL do main com endpoint ≠ `ep-purple-morning-b6ajdsfk` ou usuário ≠ `omnigestao_preview_owner`.
