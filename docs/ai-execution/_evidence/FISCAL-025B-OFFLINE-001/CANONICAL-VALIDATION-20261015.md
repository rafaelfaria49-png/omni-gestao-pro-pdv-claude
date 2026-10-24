# Canonical validation · 2026-10-15 · FISCAL-025B

This supersedes the local-dependency blocker recorded in the initial
VALIDATION.md; the original 274-test supplemental report is preserved unchanged.
PR #275 remains draft. Scope is certification of the existing offline module.

## Preflight and local preparation

Validated starting HEAD: 34a9f3ab0e62b209b340e16044fec645b0159c82.
Base: 4a85dd95202b56873487b31c318fc2d751fc26f5.
Branch/worktree and active AEP child GOAL match the human request.
The tree was clean before preparation. Parent 025 and ledger are unchanged.

The goal and original checkout have the same package-lock SHA-256:
210481039035ba8679791dd204bf864e0454c5645176cae5edc9ae6a0b085665.
All 960 installed packages present for win32/x64 match locked versions,
integrity and resolved metadata; no required package is missing and no extra
installed package is recorded in the hidden lock. Dependency/devDependency/
optional/peer/override declarations agree. The sole package.json difference
is engines: GOAL requires Node 24.x; the original checkout and lock-root metadata
say 20.x. Actual Node v24.14.1 satisfies the GOAL. Package versions themselves
are identical; no install or package change was performed.

Under the explicit human exception, created only:
C:/Projetos/omni-gestao-fiscal-025b-archive-001/node_modules
as an ignored junction to C:/Projetos/omni-gestao/node_modules.
The destination was absent and git check-ignore confirmed it before creation.
No directory was overwritten; no original checkout source/dependency was edited,
cleaned or installed. No generated Prisma directory was linked, copied or generated.

## Canonical focused suite

Executed in the Fiscal worktree:
```text
npx vitest run lib/fiscal/archive-offline --no-cache --configLoader native
```

PASS, exit 0: Vitest 4.1.4, 274 passed tests in 5 passed files.
The repository vitest.config.ts was loaded unchanged. The two additional flags
disable cache and use Node's native config loader so the shared node_modules
does not receive Vite config bundles/cache. No test selection, setup, alias or
assertion was replaced. A module-type inference warning from Node was harmless;
package.json was not changed to suppress it.

## Global and module types

Executed exactly npm run typecheck. Exit 2, 815 diagnostics in 237 paths:
190 TS2307, 3 TS2322, 44 TS2339, 4 TS2345, 532 TS7006,
1 TS7019, 2 TS7031, 1 TS7053 and 38 TS18046.
None is in lib/fiscal/archive-offline/.

A separate TypeScript program used the canonical tsconfig strict options,
ordinary local module resolution through the authorized junction, all 14 module
TS/test files and incremental=false: zero diagnostics. No dependency remapping
or generated-client substitution was used for this module check.

Baseline proof used the exact same tree, config and dependency environment,
omitting the 14 newly added TypeScript roots from the GOAL. Every changed source
file is an addition; all baseline source/config/schema files match BASE_MAIN.
The baseline has 3,080 root files and the same 815 diagnostics, including identical
path, line, column, code and normalized message. Zero new or resolved diagnostics.
Both normalized lists have SHA-256:
ef0c91e86416362af57509aa06af390208a3b2d94f7f8820fecc0e3f7558b2cc.

CANONICAL-DIAGNOSTICS-20261015.json contains the per-path/per-code grouping and
baseline comparison, without duplicating the full diagnostic messages.

The worktree's generated/prisma/index.d.ts is absent. lib/prisma.ts imports
@/generated/prisma, and 190 diagnostics name that missing generated module.
The existing shared client was inspected as files only, never instantiated:
its schema lacks the 14 Dp* models present in the GOAL schema. Linking it would
also introduce a stale client, so no generated-client link was made.
Shared schema hash:
ee73ea360c14174d9bd85b0d21e73df3d0373677b787c4fdb7ef6db692678fee.
GOAL schema hash:
ef68dd97b7a46c2f8ed6d6a8f9da7806ca97660ab02629a60960e0ba5db68297.

These are inherited diagnostics under the permitted local environment, not
regressions from this GOAL. This does not certify a globally green repository
or waive its typecheck gate. Pessoas and all other modules remain untouched.
No prisma generate, npm ci, mass reinstall, database, Docker or build ran.

## Integrity and conditional closure

git diff BASE_MAIN..HEAD --check: PASS.
node scripts/track.mjs verify --all: PASS.
Runtime code remains restricted to lib/fiscal/archive-offline/**.
No schema/migration/production adapter, parent GOAL or ledger change.

GLOBAL_TYPECHECK=FAIL_EXTERNAL_BASELINE_IDENTICAL
MODULE_TYPECHECK=PASS_14_FILES_ZERO_DIAGNOSTICS
CANONICAL_FOCUSED_TESTS=PASS_274
AEP_CHECK=NOT_EXECUTED_VALIDATION_GATE
AEP_CLOSE=NOT_EXECUTED
IMPLEMENTATION_CHANGES_ADDITIONAL=false

Global typecheck is not PASS. As explicitly required by the human, check/close
must wait for a specific human decision on this external validation blocker,
in addition to independent R approval. No test or R result can waive that gate.

R will inspect the full published PR HEAD with these canonical results.
No commit is to be created merely for an unavailable review attempt; those
outcomes belong in sanitized PR comments. Anthropic's stated reset is 11:00
America/Sao_Paulo; Google via available Antigravity is the authorized alternative.

SCHEMA_CHANGED=false; DB_WRITES=0; STORAGE_PROVISIONED=false;
SEFAZ_TRANSMISSIONS=0; PARENT_GOAL_PRESERVED=true;
G_F7=BLOCKED; G_F12=BLOCKED.
STOP=AWAITING_025B_VALIDATION_GATE
