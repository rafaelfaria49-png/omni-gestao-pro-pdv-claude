# FISCAL-025B-OFFLINE-001 · Validation evidence

Date: 2026-10-15, America/Sao_Paulo. Executor: Codex / OpenAI (openai).
Scope: offline foundation only, ADR-0024 option B. No operational integration.

## Entry and scope

- Fetch confirmed origin/main and bootstrap PR #274 merge:
  4a85dd95202b56873487b31c318fc2d751fc26f5.
- Branch: goal/fiscal-025b-archive-foundation-001.
- Worktree: C:/Projetos/omni-gestao-fiscal-025b-archive-001.
- status fiscal, verify --all and open fiscal ran in that order.
- Selected/open goal: FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001.
- .aep-active is local/ignored; attempt 1/3. No gate released.
- All versioned changes are confined to lib/fiscal/archive-offline/** and
  docs/ai-execution/_evidence/FISCAL-025B-OFFLINE-001/**.
- Parent 025 and fiscal ledger have no diff. Base blobs:
  parent e184fa675e96f77535fd280872dd4bd4c0043723;
  ledger 8f96d5a1484cf71629763cb57ae9f567c720d471.
- WIPs in the original checkout were preserved. No checkout/stash/reset there.

## Actual results

| Check | Result |
| --- | --- |
| npx vitest run lib/fiscal/archive-offline | Attempted; blocked by missing local dependencies, ENOTCACHED with npm offline/no-install approval |
| Supplemental focused Vitest 4.1.4 | PASS: 274 tests, 5 files; full machine report focused-tests.json |
| npm run typecheck | Attempted; exit 1, MODULE_NOT_FOUND for the worktree node_modules/typescript/lib/tsc.js |
| Supplemental module typecheck, canonical strict options | PASS: 14 TS files, zero diagnostics; types.json |
| git diff --check | PASS |
| node scripts/track.mjs verify --all | PASS: all 11 tracks, registry and gates consistent |
| node scripts/track.mjs check fiscal | NOT_EXECUTED: canonical GOAL requires independent R first |
| node scripts/track.mjs close fiscal | NOT_EXECUTED: R and canonical checks remain required |

The focused supplemental runner executes the actual five new test files with
the existing Vitest package, Node environment and local aliases, without
installing packages or linking files outside the allowlist. It uses
config:false because the checkout has no dependencies for config loading;
the repository config contains Node environment and aliases, without setup
or other test hooks. The module does not import repository aliases.
Any runner cache stays under archive-offline/node_modules (ignored).
This is an explicit fallback, not a claim that the canonical invocation passed.

Reproduce the saved supplemental reports:
```text
node docs/ai-execution/_evidence/FISCAL-025B-OFFLINE-001/run-offline-checks.mjs C:/Projetos/omni-gestao focused
node --max-old-space-size=4096 docs/ai-execution/_evidence/FISCAL-025B-OFFLINE-001/run-offline-checks.mjs C:/Projetos/omni-gestao types
```

An exploratory read-only full graph check with the existing shared client
reported 137 diagnostics: four local type diagnostics subsequently corrected
and 133 outside this module, involving Pessoas and missing dp* models in the
existing generated Prisma client. The later module check has zero diagnostics.
The full global graph was not certified green. No schema, generated client,
Pessoas code, package/config or infrastructure was changed to address this.

Permission to create ignored local dependency/client links outside the GOAL
allowlist was requested asynchronously and remains pending at publication.
No such links were created. The canonical command failures are retained as
limitations, not converted to PASS by the supplemental checks.

## Focused coverage

- bundle.test.ts: 67 tests — framing/limits, XML byte identity, canonical JSON,
  all segment corruption/removal, truncation/extra bytes, external/internal
  hashes, version/schema drift, missing snapshots, secret-field rejection.
- identity.test.ts: 48 tests — all identity fields, original job/dedupe,
  deterministic attempt/key, complete-source fingerprints and single nota/job.
- memory-fake.test.ts: 29 tests — exclusive/concurrent creation, identical
  replay, divergent fingerprint, lost response, failure before/after PUT/CAS,
  orphan preservation, exact version, retention, readback and store isolation.
- policies.test.ts: 129 tests — positive B2 and each missing/divergent proof,
  exact historical error, xMotivo NOT_PERSISTED, exhaustive B1-R1/B3-R1,
  all writer categories/guards and fail-closed preflight.
- purity.test.ts: 1 AST import/call boundary check — local/crypto imports only,
  no operational adapters, environment, network, logging or live clock.

Initial tests exposed shared fixture identity aliases; fixtures now copy each
historical event identity independently. Negative cases exercise actual
identity mismatch rather than mutating the target together with the proof.
Errors contain stable codes and never interpolate private inputs.

## Acceptance boundaries

ARCHIVE_BUNDLE_IMPLEMENTED=true
CANONICAL_MANIFEST_IMPLEMENTED=true
IDENTITY_CONTRACTS_IMPLEMENTED=true
FAKE_STORAGE_IMPLEMENTED=true
OFFLINE_POLICIES_IMPLEMENTED=true
CODE_CHANGED=true
SCHEMA_CHANGED=false
DB_WRITES=0
STORAGE_PROVISIONED=false
SEFAZ_TRANSMISSIONS=0
PARENT_GOAL_PRESERVED=true
G_F7=BLOCKED
G_F12=BLOCKED

Every capability remains OFFLINE_ONLY with retry/transmission/rearm/activation/
write false, including success, refusal, replay, concurrency and failure.
All fixtures are synthetic; no production record/XML/snapshot was accessed.
No Docker, database, storage, queue, worker, provider or SEFAZ test ran.
No build is required by this GOAL (no config/routes/Prisma/wiring changes).
CURRENT_STATUS, CHANGELOG and MASTER_CONTEXT are unchanged: no operational
feature/readiness was delivered, and they are outside this GOAL allowlist.

Memory-only proofs do not certify WORM, actual retention, permissions, CAS,
runtime deployment, isolation or restoration. Future operational work requires
its own gates and evidence. This foundation does not complete 025-B/C/D or 025.

## Review and closure

Independent R must come from declared google or anthropic family, on the full
published implementation SHA, diff, tests and limitations. OpenAI cannot
satisfy R. The PR request records exact SHA and diff URLs after publication.
Until a valid review and the required checks are satisfied:
AEP_CLOSE=NOT_EXECUTED
STOP=AWAITING_025B_OFFLINE_INDEPENDENT_REVIEW
