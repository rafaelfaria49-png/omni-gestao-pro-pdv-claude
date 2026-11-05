import { FixtureCrypto, byteHash } from "./codec"
import { check } from "./db"
export type Start = { storeId: string; documentId: string; jobId: string; copyId: string; attemptId: string; destinationId: string | null; sendKey: string; leaseEpoch: string; payloadHash: string; payload: Uint8Array }
export type Outcome = "ACCEPT" | "NO_EFFECT" | "UNKNOWN" | "CRASH_AFTER_ACCEPT"
/** Only in-process evidence. No network, browser, process, file, device or vendor imports. */
export class SyntheticBoundary {
  readonly mode = "SYNTHETIC_ONLY"
  readonly realTransportCalls = 0
  readonly calls: Array<{ attemptId: string; sendKey: string; payloadHash: string; outcome: Outcome }> = []
  private readonly starts = new Map<string, Start>()
  private readonly effects = new Set<string>()
  constructor(private readonly crypto: FixtureCrypto) {}
  submit(start: Start, outcome: Outcome): string | null {
    check(byteHash(start.payload) === start.payloadHash, "PAYLOAD_HASH_MISMATCH")
    check(!this.starts.has(start.attemptId), "ATTEMPT_ALREADY_SUBMITTED")
    this.starts.set(start.attemptId, { ...start, payload: new Uint8Array() })
    this.calls.push({ attemptId: start.attemptId, sendKey: start.sendKey, payloadHash: start.payloadHash, outcome })
    if (outcome === "ACCEPT" || outcome === "CRASH_AFTER_ACCEPT") {
      check(!this.effects.has(start.sendKey), "SIMULATED_DUPLICATE_EFFECT"); this.effects.add(start.sendKey)
    }
    if (outcome === "CRASH_AFTER_ACCEPT") return null
    return this.proof(start.attemptId, outcome === "ACCEPT" ? "ACCEPT" : outcome)
  }
  /** Harness-only reconciliation channel; never a user/command capability. */
  proof(attemptId: string, result: "ACCEPT" | "NO_EFFECT" | "UNKNOWN", release = result !== "UNKNOWN"): string {
    const s = this.starts.get(attemptId)
    check(s, "UNOBSERVED_SYNTHETIC_ATTEMPT")
    check(!(result === "NO_EFFECT" && this.effects.has(s.sendKey)), "EFFECT_ALREADY_POSSIBLE")
    return this.crypto.sign("synthetic-proof-v1", { storeId: s.storeId, documentId: s.documentId, jobId: s.jobId,
      copyId: s.copyId, attemptId, destinationId: s.destinationId, sendKey: s.sendKey, leaseEpoch: s.leaseEpoch,
      payloadHash: s.payloadHash, result, release, evidenceKey: result + ":" + release, synthetic: true })
  }
}
