# PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A — tentativa 2

- trilha: `pessoas`
- resultado: **DONE**
- ratificado em: 2026-10-01T17:34:30.933Z
- branch: `goal/pessoas-001a-fundacao-backend`
- base_commit: `e65630f9943b53aaf5983111faf62f54d45dc095`
- head_commit: `cc6cd01f3833b0fe8a60489379865efa52e497d3`
- teste: `node scripts/pessoas/run-official-tests.mjs` → exit 0
- upstream: ok

## Caminhos alterados

- `.env.example`
- `app/actions/pessoas/index.ts`
- `app/api/pessoas/documentos/[id]/download/route.ts`
- `app/api/pessoas/documentos/complete/route.ts`
- `app/api/pessoas/documentos/route.ts`
- `app/api/pessoas/documentos/upload-intent/route.ts`
- `docs/pessoas/CONTRATOS_BACKEND_001A.md`
- `docs/pessoas/DELTA_001A.md`
- `docs/pessoas/OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15.md`
- `docs/pessoas/VALIDACAO_001A.md`
- `lib/pessoas/admin.ts`
- `lib/pessoas/cadastro-validation.ts`
- `lib/pessoas/cadastro.ts`
- `lib/pessoas/commands.ts`
- `lib/pessoas/documentos/download-url.test.ts`
- `lib/pessoas/documentos/intent.test.ts`
- `lib/pessoas/documentos/intent.ts`
- `lib/pessoas/documentos/politica.ts`
- `lib/pessoas/documentos/service.ts`
- `lib/pessoas/domain.test.ts`
- `lib/pessoas/domain.ts`
- `lib/pessoas/flag-off.test.ts`
- `lib/pessoas/http.ts`
- `lib/pessoas/integration.test.ts`
- `lib/pessoas/scope.ts`
- `prisma/migrations/0022_pessoas_cadastro_backend/migration.sql`
- `prisma/schema.prisma`
- `scripts/pessoas/check-isolated-db.mjs`
- `scripts/pessoas/run-official-tests.mjs`

## Tentativas anteriores

- tentativa 1 (2026-10-01T16:45:43.387Z): revisão independente REQUEST_CHANGES: P1-01 autorização contratual e P2-01/P2-02 privacidade documental

## Evidência do check

- [PASS] branch atual = branch do GOAL — `git rev-parse --abbrev-ref HEAD` → goal/pessoas-001a-fundacao-backend (esperado goal/pessoas-001a-fundacao-backend)
- [PASS] worktree = a registrada no open — `git rev-parse --show-toplevel` → C:/Projetos/omni-gestao-pessoas-001a-backend (esperado C:/Projetos/omni-gestao-pessoas-001a-backend)
- [PASS] árvore limpa — `git status --porcelain` → (vazio)
- [PASS] HEAD aponta para um commit — `git rev-parse --verify HEAD^{commit}` → cc6cd01f3833b0fe8a60489379865efa52e497d3
- [PASS] base_commit é ancestral da branch — `git merge-base --is-ancestor e65630f9943b53aaf5983111faf62f54d45dc095 goal/pessoas-001a-fundacao-backend` → ancestral confirmado
- [PASS] caminhos do diff dentro da allowlist — `git diff --name-only e65630f9943b53aaf5983111faf62f54d45dc095..HEAD` → 29 caminho(s), todos dentro
- [PASS] nenhum gate de caminho não liberado — `git diff --name-only e65630f9943b53aaf5983111faf62f54d45dc095..HEAD` → nenhum gate tocado
- [PASS] docs/execution-tracks/*/goals/** não alterado — `git diff --name-only e65630f9943b53aaf5983111faf62f54d45dc095..HEAD` → caminho quente intocado
- [PASS] LEDGER.jsonl sem deleções — `git diff --numstat e65630f9943b53aaf5983111faf62f54d45dc095..HEAD -- docs/execution-tracks/pessoas/LEDGER.jsonl` → 0 linha removida
- [PASS] teste do GOAL passa — `node scripts/pessoas/run-official-tests.mjs` → exit 0
- [PASS] upstream origin/main no escopo — `git fetch origin && git log e65630f9943b53aaf5983111faf62f54d45dc095..origin/main` → ok: sem commits upstream no escopo
- [AVISO] próximo GOAL elegível (informativo) — `ls docs/execution-tracks/pessoas/goals/` → nenhum — fechar o último GOAL da trilha é permitido
