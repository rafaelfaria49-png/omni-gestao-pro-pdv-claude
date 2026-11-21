import { randomBytes, randomUUID } from "node:crypto"
import { authorize, type Principal } from "./authority"
import { constantTimeHexEqual, hash, sha256Hex, shape, text } from "./codec"
import { check, one, type Database, type Sql } from "./db"
import type { DirectPrintPolicy } from "./activation"
import { THERMAL_PROFILES } from "./renderer"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const AGENT_TOKEN_PREFIX = "opa1"

/** 12 symbols from a 32-char alphabet = 60 bits; single use, expires after policy.pairingMs. */
function pairingCode(): string {
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, b => PAIRING_ALPHABET[b & 31]).join("")
  return chars.slice(0, 4) + "-" + chars.slice(4, 8) + "-" + chars.slice(8, 12)
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "")
const codeHash = (code: string) => hash("pairing-code-v1", normalizeCode(code))
const printerKey = (name: string) => name.normalize("NFC").trim().toLowerCase()

export type InventoryPrinter = { name: string; online: boolean; status: string; isDefault: boolean; portKind: string }
function inventory(value: unknown): InventoryPrinter[] {
  check(Array.isArray(value) && value.length <= 32, "INVALID_INVENTORY", 400)
  return value.map(p => {
    const v = shape(p, ["name", "online", "status", "isDefault", "portKind"])
    return { name: text(v.name, 120), online: v.online === true, status: text(String(v.status ?? "UNKNOWN"), 40),
      isDefault: v.isDefault === true, portKind: text(String(v.portKind ?? "UNKNOWN"), 20) }
  })
}

export class DirectPrintAdmin {
  constructor(private readonly db: Database, readonly policy: DirectPrintPolicy) {}

  /** Creates a LOCAL_AGENT installation for this store and returns the one-time pairing code (shown once, stored hashed). */
  async createInstallation(auth: Principal, storeId: string, label: unknown) {
    const name = text(label, 80)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId, "CONFIGURE")
      const id = randomUUID(), code = pairingCode(), expires = new Date(Date.now() + this.policy.pairingMs)
      await sql.exec("INSERT INTO public.print_installations(id,identity_hash,proof_mode) VALUES($1::uuid,$2,'LOCAL_AGENT')", [id, hash("installation-v1", randomUUID())])
      await sql.exec(`INSERT INTO public.print_agent_links(installation_id,store_id,label,created_by_id,pairing_code_hash,pairing_expires_at)
        VALUES($1::uuid,$2,$3,$4,$5,$6)`, [id, storeId, name, actor.principalId, codeHash(code), expires])
      return { installationId: id, pairingCode: code, pairingExpiresAt: expires.toISOString() }
    })
  }

  async listInstallations(auth: Principal, storeId: string) {
    await this.db.transaction(sql => authorize(sql, auth, storeId, "CONFIGURE"))
    const rows = await this.db.query(`SELECT l.installation_id,l.label,l.paired_at,l.pairing_expires_at,l.last_seen_at,l.agent_version,l.inventory,i.revoked_at
      FROM public.print_agent_links l JOIN public.print_installations i ON i.id=l.installation_id WHERE l.store_id=$1 ORDER BY l.created_at`, [storeId])
    const bindings = await this.db.query(`SELECT b.id,b.terminal_id,b.installation_id,b.transport_destination_ref,b.profile_id,b.profile->>'deviceHash' device_hash,t.name terminal_name,t.code terminal_code
      FROM public.print_bindings b JOIN public.pdv_terminais t ON t.id=b.terminal_id AND t."storeId"=b.store_id
      WHERE b.store_id=$1 AND b.state='ACTIVE' AND b.family='SALE_RECEIPT' ORDER BY t.code`, [storeId])
    const now = Date.now()
    return {
      installations: rows.map(r => ({ installationId: r.installation_id, label: r.label, revoked: !!r.revoked_at,
        paired: !!r.paired_at, pairingPending: !r.paired_at && !!r.pairing_expires_at && new Date(r.pairing_expires_at).getTime() > now,
        online: !!r.last_seen_at && now - new Date(r.last_seen_at).getTime() <= this.policy.agentOnlineMs,
        lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null, agentVersion: r.agent_version ?? null,
        printers: Array.isArray(r.inventory) ? r.inventory : [] })),
      bindings: bindings.map(b => ({ bindingId: b.id, terminalId: b.terminal_id, terminalLabel: b.terminal_name || b.terminal_code,
        installationId: b.installation_id, printerName: b.transport_destination_ref, profileId: b.profile_id, restrictedToBrowser: !!b.device_hash })),
    }
  }

  /** Revocation is final: the credential stops working, every binding on it is revoked, held egress stays held (no forged release). */
  async revokeInstallation(auth: Principal, storeId: string, installationId: unknown) {
    const id = text(installationId, 64); check(UUID.test(id), "NOT_FOUND", 404)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId, "CONFIGURE")
      await one(sql, "SELECT installation_id FROM public.print_agent_links WHERE installation_id=$1::uuid AND store_id=$2", [id, storeId])
      const i = await one(sql, "SELECT * FROM public.print_installations WHERE id=$1::uuid FOR UPDATE", [id])
      if (!i.revoked_at) await sql.exec("UPDATE public.print_installations SET revoked_at=clock_timestamp(),revoked_by_id=$1,revocation_epoch=revocation_epoch+1 WHERE id=$2::uuid", [actor.principalId, id])
      const active = await sql.query("SELECT id FROM public.print_bindings WHERE installation_id=$1::uuid AND state='ACTIVE' FOR UPDATE", [id])
      for (const b of active) await this.revokeBindingRow(sql, storeId, b.id, actor.principalId)
      return { revoked: true }
    })
  }

  private async revokeBindingRow(sql: Sql, storeId: string, bindingId: string, actorId: string) {
    await sql.exec("UPDATE public.print_bindings SET state='REVOKED',revoked_at=clock_timestamp(),revoked_by_id=$1 WHERE id=$2::uuid AND state<>'REVOKED'", [actorId, bindingId])
    await sql.exec(`INSERT INTO public.print_events(id,store_id,scope_kind,binding_version_id,event_type,proof_kind,actor_kind,actor_user_id)
      VALUES($1::uuid,$2,'BINDING',$3::uuid,'BINDING_REVOKED','NONE','USER',$4)`, [randomUUID(), storeId, bindingId, actorId])
  }

  /** Terminal → (installation, printer) binding. The printer must be one the paired agent reported for this store. */
  async bindTerminal(auth: Principal, storeId: string, input: unknown, deviceHash: string | null = null) {
    const v = shape(input, ["terminalId", "installationId", "printerName", "profileId", "restrictToThisBrowser"])
    // Optional server-side tie between the terminal and the cashier's browser (P3-4). Requires the browser identity header.
    check(v.restrictToThisBrowser !== true || deviceHash, "DEVICE_ID_REQUIRED", 400)
    const terminalId = text(v.terminalId, 160), installationId = text(v.installationId, 64), printerName = text(v.printerName, 120)
    check(UUID.test(installationId), "NOT_FOUND", 404)
    const profile = THERMAL_PROFILES[v.profileId as keyof typeof THERMAL_PROFILES]
    check(profile, "THERMAL_PROFILE_UNSUPPORTED", 400)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId, "CONFIGURE")
      await one(sql, 'SELECT id FROM public.pdv_terminais WHERE id=$1 AND "storeId"=$2 AND status=$3', [terminalId, storeId, "ACTIVE"])
      const link = await one(sql, `SELECT l.*,i.revoked_at FROM public.print_agent_links l JOIN public.print_installations i ON i.id=l.installation_id
        WHERE l.installation_id=$1::uuid AND l.store_id=$2 FOR UPDATE OF l`, [installationId, storeId])
      check(link.paired_at && !link.revoked_at, "INSTALLATION_UNAVAILABLE")
      const reported = (Array.isArray(link.inventory) ? link.inventory : []) as InventoryPrinter[]
      const printer = reported.find(p => p.name === printerName)
      check(printer, "PRINTER_NOT_REPORTED_BY_AGENT")
      const destinationIdentity = hash("destination-v1", { installationId, printer: printerKey(printerName) })
      await sql.exec(`INSERT INTO public.print_destinations(id,identity_hash,serialization_mode) VALUES($1::uuid,$2,'LOCAL_AGENT_SERIAL')
        ON CONFLICT(identity_hash) DO NOTHING`, [randomUUID(), destinationIdentity])
      const destination = await one(sql, "SELECT id,serialization_mode FROM public.print_destinations WHERE identity_hash=$1", [destinationIdentity])
      check(destination.serialization_mode === "LOCAL_AGENT_SERIAL", "DESTINATION_MODE")
      const chain = await sql.query("SELECT binding_id FROM public.print_bindings WHERE store_id=$1 AND terminal_id=$2 AND family='SALE_RECEIPT' ORDER BY created_at LIMIT 1", [storeId, terminalId])
      const bindingId = chain[0]?.binding_id ?? randomUUID()
      const active = await sql.query("SELECT id FROM public.print_bindings WHERE store_id=$1 AND terminal_id=$2 AND family='SALE_RECEIPT' AND state='ACTIVE' FOR UPDATE", [storeId, terminalId])
      for (const b of active) await this.revokeBindingRow(sql, storeId, b.id, actor.principalId)
      const [{ version }] = await sql.query("SELECT COALESCE(max(version),0)+1 AS version FROM public.print_bindings WHERE binding_id=$1::uuid", [bindingId])
      const id = randomUUID(), profileJson = { id: profile.id, version: profile.version, columns: profile.columns, drawer: false, encoding: "WINDOWS_1252",
        ...(v.restrictToThisBrowser === true ? { deviceHash } : {}) }
      await sql.exec(`INSERT INTO public.print_bindings(id,store_id,binding_id,version,terminal_id,installation_id,destination_id,transport_destination_ref,
        profile_id,profile_version,profile_hash,profile,state,family,configured_by_id) VALUES($1::uuid,$2,$3::uuid,$4,$5,$6::uuid,$7::uuid,$8,$9,$10,$11,$12::jsonb,'ACTIVE','SALE_RECEIPT',$13)`,
        [id, storeId, bindingId, Number(version), terminalId, installationId, destination.id, printerName, profile.id, profile.version, hash("profile-v1", profileJson), JSON.stringify(profileJson), actor.principalId])
      await sql.exec(`INSERT INTO public.print_events(id,store_id,scope_kind,binding_version_id,event_type,proof_kind,actor_kind,actor_user_id)
        VALUES($1::uuid,$2,'BINDING',$3::uuid,'BINDING_ACTIVATED','NONE','USER',$4)`, [randomUUID(), storeId, id, actor.principalId])
      return { bindingId: id, terminalId, installationId, printerName, profileId: profile.id, restrictedToBrowser: v.restrictToThisBrowser === true }
    })
  }

  async revokeTerminalBinding(auth: Principal, storeId: string, terminalId: unknown) {
    const t = text(terminalId, 160)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId, "CONFIGURE")
      const active = await sql.query("SELECT id FROM public.print_bindings WHERE store_id=$1 AND terminal_id=$2 AND family='SALE_RECEIPT' AND state='ACTIVE' FOR UPDATE", [storeId, t])
      for (const b of active) await this.revokeBindingRow(sql, storeId, b.id, actor.principalId)
      return { revoked: active.length }
    })
  }

  /** Terminal availability for the PDV (ISSUE permission): never exposes credentials or other stores' data. */
  async terminalStatus(auth: Principal, storeId: string, terminalId: unknown) {
    const t = text(terminalId, 160)
    await this.db.transaction(sql => authorize(sql, auth, storeId, "ISSUE"))
    const rows = await this.db.query(`SELECT b.transport_destination_ref printer,b.profile_id,l.last_seen_at,l.inventory,i.revoked_at,q.held_attempt_id
      FROM public.print_bindings b JOIN public.print_agent_links l ON l.installation_id=b.installation_id
      JOIN public.print_installations i ON i.id=b.installation_id JOIN public.print_destinations q ON q.id=b.destination_id
      WHERE b.store_id=$1 AND b.terminal_id=$2 AND b.family='SALE_RECEIPT' AND b.state='ACTIVE' AND l.store_id=$1`, [storeId, t])
    if (!rows.length || rows[0].revoked_at) return { configured: false as const }
    const r = rows[0]
    const online = !!r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() <= this.policy.agentOnlineMs
    const printer = (Array.isArray(r.inventory) ? r.inventory : []).find((p: InventoryPrinter) => p.name === r.printer) as InventoryPrinter | undefined
    return { configured: true as const, printerName: r.printer as string, profileId: r.profile_id as string, agentOnline: online,
      printerOnline: online ? !!printer?.online : null, destinationBlocked: !!r.held_attempt_id }
  }

  // ── Agent side (no browser session; authenticated by installation credential) ──

  async pair(input: unknown) {
    const v = shape(input, ["code", "agentVersion"])
    const code = text(v.code, 20), version = text(String(v.agentVersion ?? "unknown"), 40)
    check(normalizeCode(code).length === 12, "PAIRING_INVALID", 401)
    return this.db.transaction(async sql => {
      const rows = await sql.query(`SELECT l.*,i.revoked_at FROM public.print_agent_links l JOIN public.print_installations i ON i.id=l.installation_id
        WHERE l.pairing_code_hash=$1 FOR UPDATE OF l`, [codeHash(code)])
      check(rows.length === 1 && !rows[0].revoked_at && !rows[0].paired_at && new Date(rows[0].pairing_expires_at).getTime() > Date.now(), "PAIRING_INVALID", 401)
      const l = rows[0]
      const token = `${AGENT_TOKEN_PREFIX}.${l.installation_id}.${randomBytes(32).toString("base64url")}`
      await sql.exec(`UPDATE public.print_agent_links SET credential_hash=$1,paired_at=clock_timestamp(),pairing_code_hash=NULL,pairing_expires_at=NULL,agent_version=$2
        WHERE installation_id=$3::uuid`, [sha256Hex(token), version, l.installation_id])
      return { installationId: l.installation_id as string, storeId: l.store_id as string, token }
    })
  }

  /** Bearer credential → installation. Constant-time hash comparison; revoked installations are refused. */
  async authenticateAgent(authorization: string | null): Promise<{ installationId: string; storeId: string }> {
    const m = /^Bearer (opa1\.([0-9a-f-]{36})\.[A-Za-z0-9_-]{43})$/.exec(authorization ?? "")
    check(m && UUID.test(m[2]), "AGENT_UNAUTHENTICATED", 401)
    const rows = await this.db.query(`SELECT l.store_id,l.credential_hash,i.revoked_at FROM public.print_agent_links l
      JOIN public.print_installations i ON i.id=l.installation_id WHERE l.installation_id=$1::uuid`, [m[2]])
    check(rows.length === 1 && rows[0].credential_hash && constantTimeHexEqual(String(rows[0].credential_hash), sha256Hex(m[1])), "AGENT_UNAUTHENTICATED", 401)
    check(!rows[0].revoked_at, "AGENT_REVOKED", 401)
    return { installationId: m[2], storeId: rows[0].store_id }
  }

  async heartbeat(installationId: string, input: unknown) {
    const v = shape(input, ["printers", "agentVersion"])
    const printers = inventory(v.printers)
    await this.db.exec(`UPDATE public.print_agent_links SET last_seen_at=clock_timestamp(),inventory=$1::jsonb,inventory_at=clock_timestamp(),agent_version=COALESCE($2,agent_version)
      WHERE installation_id=$3::uuid`, [JSON.stringify(printers), v.agentVersion == null ? null : text(String(v.agentVersion), 40), installationId])
    return { ok: true }
  }

  async touch(installationId: string) {
    await this.db.exec("UPDATE public.print_agent_links SET last_seen_at=clock_timestamp() WHERE installation_id=$1::uuid", [installationId])
  }
}
