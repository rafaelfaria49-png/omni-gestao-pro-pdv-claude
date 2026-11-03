# Independent R request · FISCAL-025B offline foundation

Implementer: Codex / OpenAI, family openai.
Required independent reviewer family: google or anthropic, declared explicitly.
Target: full published implementation SHA named in the PR review request.
Base: 4a85dd95202b56873487b31c318fc2d751fc26f5.
Review the exact commit and its complete diff; do not reuse prior plan/025-A R.

Review:
1. Allowlist and preservation of parent 025/ledger; zero operational wiring.
2. ArchiveBundle/v1 exact bytes, canonical state/manifest, lengths, UTF-8,
   version, all hashes, strict decoding and no self-containing digest.
3. Full fiscal identity, original EMISSAO/dedupe, deterministic attempt/key and
   sourceFingerprint covering original state/snapshots/B2/observed versions.
4. Option B: all bytes in abstract storage, metadata-only protected reference,
   exact version/hash/identity resolution and no latest/overwrite/delete.
5. Sequential/concurrent idempotency and conflict; fail before/after PUT,
   response loss, CAS and retained orphans, retention and readback refusals.
6. Pure B2, B1-R1, B3-R1 and preflight, missing/divergent proof rejection,
   xMotivo NOT_PERSISTED, no operational authorization on any path.
7. Actual tests and evidence, including canonical dependency/typecheck blockers.
   Supplemental tests: 274 passed; module types: 14 files/zero diagnostics.
   Global canonical checks are not claimed green.

Inputs: active GOAL, accepted ADR-0024, lib/fiscal/archive-offline/README.md,
complete implementation diff and VALIDATION.md/focused-tests.json/types.json.
Fixtures are synthetic; no real private XML/history/snapshot is included.

Return:
R_EXECUTOR=
R_MODEL=
R_FAMILY=google|anthropic
R_REVIEWED_SHA=<full exact SHA>
R_VERDICT=APPROVE|REQUEST_CHANGES|NOT_ISSUED
NEW_BLOCKERS=
Findings with exact file/line and concrete failure conditions.

This is a request, not an approval. Reviewer must not write code, run DB/cloud/
Docker/storage/SEFAZ actions, alter authentication/trust/permissions, merge or
close AEP. If quota/access is unavailable, report NOT_ISSUED; do not loop.
