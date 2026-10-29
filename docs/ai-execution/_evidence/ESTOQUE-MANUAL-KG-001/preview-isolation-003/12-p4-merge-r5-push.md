# P4 — conflito com a main, R5, push e preview da #315 (2026-10-28)

Autorização do dono (chat, 2026-10-27): "Authorize P4". O pedido apresentado era: resolver os conflitos da #315,
fazer a revisão R5 e o push.

## Merge de `origin/main` (`34b70a1`) — commit `02bed64`

O conflito apareceu em 4 arquivos. A #317 (`pdv-padaria-kg-guard-ux-003`) e esta branch bloqueiam a venda por peso
com campos diferentes, ambos derivados de `modoVenda === "peso"`:

- **main:** `vendaPorPeso`, só no Clássico;
- **esta branch:** `vendaPesoIndisponivel`, nos 6 PDVs, com guard do carrinho e 409 no servidor.

A resolução foi a **união** dos dois:

- as rotas `/api/ops/inventory` e `/api/ops/inventory/lookup` projetam os dois campos;
- `lib/pdv-scan-lookup.ts` repassa os dois;
- o `addToCart` do Clássico mantém os dois guards antes do estoque.

`prisma/` não mudou entre `5e1feb9` e o merge, então a P2.3 continua válida.

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | exit 0 |
| Vitest, suítes dos dois lados | 9 arquivos, 130 testes, todos passaram (`pdv-weight-sale-guard`, `weight-sale-guard-surfaces`, `classic-weight-sale-guard`, `inventory-commercial-guard`, `ops-upsert-venda-fractional`, `pdv-scan*`) |
| Vitest completo | 74 arquivos / 296 testes falham, **exatamente os mesmos em `5e1feb9`** (worktree temporária, mesmos arquivos). Dependem de `TEST_DATABASE_URL`/PG descartável local. 0 regressões |
| `npm run build` | "Compiled successfully", `MIGRATION_SKIPPED`, `PROXY_PRISMA_ARTIFACT_VERIFIED` |
| R5 (Codex gpt-6.1-sol, read-only) | **APPROVE**, nenhum achado P0–P3 (`../r5-merge-main/`) |

## Commits enviados (`b00b230..2731097`)

| Commit | Conteúdo |
| --- | --- |
| `5e1feb9` | ensaio Neon 002 (já existia local) |
| `02bed64` | merge da main |
| `c736ac9` | plano e evidências do isolamento do Preview (P1–P3). Varredura: 0 senha/URL/token reais; o único valor coincidente com o arquivo de segredos é o e-mail sintético `admin@preview.invalid` |
| `ff95073` | evidência da R5 |
| `2731097` | `eslint.config.mjs` ignora `docs/ai-execution/_evidence/**` (ver abaixo) |

O CI de `ff95073` reprovou em "Cadastros Cliente assistido / validate", com o erro `could not find plugin
"react-hooks"`.

- **Causa:** os roteiros `.cjs` de evidência, `neon-rehearsal-002` e esta pasta. O bloco de regras do projeto não tem
  `files`, aplica `react-hooks/*` a `.cjs` e o `eslint-config-next` não carrega o plugin para essa extensão.
- **Reprodução:** local.
- **Correção:** ignorar a pasta de evidências, que não é código da app.
- **Conferência:** o comando do CI deu exit 0 localmente, com 0 erros e 85 avisos. Em `2731097`, o check passou.

## Deployments de Preview criados após a P3 (22:05Z)

| Deployment | Branch / commit | Estado |
| --- | --- | --- |
| `dpl_4hLbKk4UPtGfdmb83SCPKfjaEgEd` | `claude/estoque-manual-kg-001` `ff95073` | READY, log com `MIGRATION_SKIPPED` |
| `dpl_4NqDo13fVkBdPDd7Z3XxrN6utSLC` | `claude/estoque-manual-kg-001` `2731097` | READY |
| `dpl_FbaaVBoTuVagTk14TFXfoNAmw6gu` | `feat/relatorios-produtos-vendidos-real-001` `cc67ad7` (PR #318, outra sessão) | READY. Genérico → main do preview |

Todos foram criados depois da troca das envs, então nenhum retrato novo carrega a credencial de produção.
`OLD_DEPLOYMENT_RISK=HIGH` continua para os 55 anteriores.

Antes do push, o `plan` da P3 mostrou o override da branch presente: ids `VUjVxPk2VgPGdjEW` e `BWFYesLFr0hAJWjT`, sem
nenhum POST e sem override ops-v4 restante.

## Destino do runtime (`harness/p4-conexoes.cjs`, dono, somente leitura, trava de projeto/branch/endpoint)

| Branch | `preview_runtime` conectado | Colunas KG | Migrations |
| --- | --- | --- | --- |
| main `br-lively-feather-b6esh64a` | 0 | 5× `integer` | 23, KG ausente |
| `pr315-kg` `br-wandering-band-b6ov7vmt` | 0 | 5× `double precision` | 24, KG aplicada |

Os GETs anônimos ao preview (`/login`, `/`, `/api/version`, `/api/auth/providers`) responderam 200 e **não abrem
conexão com o banco**: 0 sessões depois deles. A prova de que o runtime do preview conecta no `pr315-kg` exige uma
requisição autenticada (login do admin sintético) ou uma escrita sintética. Isso é a P5, ainda não autorizada.

## Resultado

```
P4_MERGE_MAIN=DONE (02bed64, união dos guards de peso)
R5=APPROVE (0 achados)
TYPECHECK=PASS · BUILD=PASS · VITEST_REGRESSIONS=0 (74 falhas pré-existentes, idênticas em 5e1feb9)
PUSHED=b00b230..2731097
PR315=MERGEABLE · CLEAN em 2731097 (CI 11/11 SUCCESS, inclusive e2e-authenticated)
PREVIEW_DEPLOYMENT=READY (dpl_4NqDo13fVkBdPDd7Z3XxrN6utSLC), MIGRATION_SKIPPED
RUNTIME_DB_TARGET_PROVEN=NO (exige login/escrita sintética → P5)
PREVIEW_MAIN_UNCHANGED=YES · PR315_KG_UNCHANGED=YES · PRODUCTION_UNTOUCHED=YES
```
