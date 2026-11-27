# FISCAL-025B · Offline archive foundation

Scope: `FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001`, ADR-0024 option B.
This module has no operational wiring. Fixtures, memory custody, inventory
proofs and successful preflight are simulations, never production evidence.
Every policy/simulation result has an immutable `OFFLINE_ONLY` capability with
retry, transmission, rearm, activation and write all literally `false`.
No function grants an operational authorization.

## Binary contract

ArchiveBundle/v1 is uncompressed. Integers are unsigned, big endian.

| Offset | Bytes | Meaning |
| --- | ---: | --- |
| 0 | 8 | ASCII `OMNIARCV` |
| 8 | 2 | Version `1` |
| 10 | 2 | Reserved flags `0` |
| 12 | 4 | Canonical manifest byte length |
| 16 | 4 | Original XML byte length |
| 20 | 4 | Canonical privateState byte length |
| 24 | manifest length | ArchiveCanonicalJson/v1 UTF-8 manifest |
| next | XML length | Original XML bytes, including BOM/CRLF/whitespace |
| next | privateState length | ArchiveCanonicalJson/v1 UTF-8 privateState |

Segments must be present and nonempty. Manifest/XML/privateState limits are
1/32/16 MiB, respectively; total length must equal the exact framed sum.
Unknown version/flags, unsafe or excessive length, truncation, extra bytes,
noncanonical or malformed JSON, invalid UTF-8, schema drift, identity/lineage
mismatch or hash disagreement are refusals. XML encoding validation never
parses XML or normalizes/rebuilds its content.

The manifest contains identity, attemptId, sourceFingerprint, lineage,
format/serializer versions and XML/privateState lengths and SHA-256 hashes.
manifestSha256 is external over manifest bytes; bundleSha256 is external over
the complete framed object. No hash includes itself. Decode without external
hashes checks internal consistency; an externally protected reference is
required to detect replacement of an internally consistent complete bundle.
A digest detects change against an anchor; it does not authenticate history.

## Canonical state

ArchiveCanonicalJson/v1 sorts own object keys by UTF-16 code units. Arrays
preserve their order; item ordinals must be contiguous from one and IDs unique.
String and number spellings use ECMAScript JSON.stringify; strings retain
Unicode normalization and reject lone surrogates. Booleans/null and finite
fractional numbers are allowed; integers must be safe. Negative zero,
undefined, bigint, functions, symbols, sparse or exotic arrays, accessors,
nonenumerable properties, nonplain prototypes, cycles, depth over 64 and more
than 100,000 visited nodes are rejected. JSON duplicate keys, BOM or whitespace
outside canonical spelling fail the byte comparison on decode.

Frozen private state is a copied logical JSON value with recursively frozen
objects/arrays. It does not claim equality to historical JSONB serialization.
Historical values use PRESENT/NULL/NOT_PERSISTED explicitly. No missing field
is reconstructed. XML remains a defensive byte copy; Buffers are mutable,
therefore all storage/readback boundaries copy them. The producer must supply
an inventoried, secret-free selection. Known secret field names are rejected
as defense in depth; this is not a general secret detector.

## Identity and custody

attemptId = `ab1_` + SHA-256(canonical `{domain:"ArchiveAttempt/v1", identity}`).
Identity includes all fiscal identifiers, original EMISSAO/dedupe, fiscal
scope, number/key and a proven historical event discriminator. Content changes
cannot create a new identity for the same attempt.

sourceFingerprint hashes canonical domain/identity/lengths/segment hashes,
thus covering original XML and every frozen metadata, original participant,
snapshot/item, B2 event, observed version and lineage value. It does not use
updatedAt alone. capturedAt, receipts, retention observations and storage
versionId exist only in custody and never change logical replay.

The private object key hashes storeId and attemptId; it never contains a
public fiscal identifier or signed URL. The permanent reference stores
identity/hashes/lineage, exact locator/version and custody metadata. It does
not store XML, privateState, complete manifest or bundle bytes: option B.

Ports: putIfAbsent, readExactVersion, verifyRetention,
verifyArchiveIntegrity and resolveProtectedReference, plus an abstract
putReferenceIfAbsent CAS boundary. No concrete remote adapter or DB model
is supplied. Resolve requires the exact store/identity/attempt/fingerprint,
locator/version and hashes; no latest, overwrite, remap or delete path exists.

MemoryArchiveFake checks exclusive creation and compares the existing winner,
reopens its exact version, checks retention/readback and then inserts an atomic
memory reference. A lost PUT response is an unknown outcome; replay inspects
the existing winner first. Failures before reference/CAS leave the object
orphaned. A lost reference response is recovered by exact replay. Divergent
fingerprints preserve the winner, even an orphan. Unknown/insufficient
retention or corrupted readback blocks. This double provides no evidence of
real WORM, policies, permissions, isolation, transactional CAS or restoration.

## Fiscal proof contracts

B2 requires full identity/event/hash/error/detail-code correlation,
NFeAutorizacao4, a proven historical service/matrix/SHA and source version,
completed correlated NOT_FOUND consultation and coherent chronology.
Expected error/code must come from the pinned historical source; never the
current matrix. Historical xMotivo remains exactly NOT_PERSISTED. NOT_FOUND
alone or an error merely containing 588 is insufficient.

B1-R1 requires revalidated exhaustive coverage of every state, A_INUTILIZAR
mark, event, range, indirect link, orphan and ambiguity. Target intersections,
direct/indirect links and unresolved ranges/series/scope block. Inventories
may contain unrelated terminal or unknown-state rows; they cannot filter
those rows out of the declared coverage.

B3-R1 covers both Production projects, crons/workers, the internal queue
route, old deployments, Preview with production credentials and external
processes. Each guarded runtime must have verified credentials, effective
expected SHA/version, all guards and Production READY when applicable.
A proven inability to write is an alternative; declared absence, unknown
credentials and rollback alone are insufficient. All inventory revisions,
protected-reference checks and retention observations must match the
explicit preflight revalidation time/version.

Preflight recomputes the bundle, compares the protected reference/readback,
checks exact retention and CAS observation, then checks B2, original single
nota/EMISSAO identity, B1-R1 and B3-R1. No assertion from these synthetic inputs
certifies the real environment. Success cannot open 025-C, G-F7 or G-F12.

Run the focused suite with `npx vitest run lib/fiscal/archive-offline`.
No Docker, database, storage service, provider, worker or SEFAZ is needed.
