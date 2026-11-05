/** No shared DATABASE_URL fallback: only an explicitly selected operator credential is accepted. */
export function retentionOptions(args, env) {
  const flags = new Map()
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!["--execute", "--dry-run", "--store", "--expect-host", "--expect-db", "--batch-size", "--after"].includes(name) || flags.has(name)) throw new Error("INVALID_OPTIONS")
    if (["--execute", "--dry-run"].includes(name)) flags.set(name, true)
    else { const v = args[++i]; if (!v || v.startsWith("--")) throw new Error("INVALID_OPTIONS"); flags.set(name, v) }
  }
  if (flags.has("--execute") && flags.has("--dry-run")) throw new Error("INVALID_OPTIONS")
  const dryRun = !flags.has("--execute")
  if (!dryRun && env.OMNI_PRINT_RETENTION_ENABLED !== "1") throw new Error("RETENTION_DISABLED")
  const url = new URL(env.OMNI_PRINT_RETENTION_DATABASE_URL ?? "")
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hostname !== flags.get("--expect-host") ||
    decodeURIComponent(url.pathname.slice(1)) !== flags.get("--expect-db") || !url.username || url.hash) throw new Error("TARGET_MISMATCH")
  // Session/target overrides in libpq-style options must not defeat the explicitly selected target.
  for (const key of url.searchParams.keys()) if (!["sslmode", "connection_limit", "connect_timeout", "pool_timeout", "schema"].includes(key)) throw new Error("TARGET_OPTIONS_REFUSED")
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") throw new Error("TARGET_OPTIONS_REFUSED")
  const storeId = flags.get("--store"), batchSize = flags.has("--batch-size") ? Number(flags.get("--batch-size")) : 25
  if (typeof storeId !== "string" || !storeId.length || storeId.length > 160 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("INVALID_OPTIONS")
  const afterDocumentId = flags.get("--after")
  if (afterDocumentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(afterDocumentId)) throw new Error("INVALID_OPTIONS")
  return { url: url.toString(), options: { storeId, batchSize, dryRun, afterDocumentId } }
}
