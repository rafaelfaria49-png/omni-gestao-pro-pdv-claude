/** Raw, parameterized PostgreSQL port for the direct-print ledger (004C candidate). */
export type Row = Record<string, any>
export interface Sql {
  query<T = Row>(text: string, values?: readonly unknown[]): Promise<T[]>
  exec(text: string, values?: readonly unknown[]): Promise<number>
}
export interface Database extends Sql { transaction<T>(body: (sql: Sql) => Promise<T>): Promise<T> }

export class PrintError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); this.name = "PrintError" }
}
export function check(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new PrintError(code, status)
}
export async function one(sql: Sql, text: string, values: readonly unknown[] = []): Promise<Row> {
  const rows = await sql.query(text, values)
  if (rows.length !== 1) throw new PrintError("NOT_FOUND", 404)
  return rows[0]
}

const insertable = new Set(["print_documents", "print_delegations", "print_requests", "print_jobs", "print_copies", "print_attempts", "print_events"])
const jsonColumns = new Set(["command", "details"])
const uuidColumns = new Set(["id", "document_id", "delegation_id", "intent_id", "job_id", "copy_id", "attempt_id", "destination_id", "binding_version_id", "previous_job_id", "send_key", "synthetic_key"])
export async function insert(sql: Sql, table: string, row: Row): Promise<void> {
  check(insertable.has(table), "INTERNAL_TABLE", 500)
  const keys = Object.keys(row)
  check(keys.every(k => /^[a-z_]+$/.test(k)), "INTERNAL_COLUMN", 500)
  const values = keys.map(k => jsonColumns.has(k) && row[k] !== null ? JSON.stringify(row[k]) : row[k])
  await sql.exec('INSERT INTO public."' + table + '" (' + keys.map(k => '"' + k + '"').join(",") + ") VALUES (" +
    keys.map((k, i) => "$" + (i + 1) + (jsonColumns.has(k) ? "::jsonb" : uuidColumns.has(k) ? "::uuid" : "")).join(",") + ")", values)
}

type RawClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}
type TransactionalClient = RawClient & {
  $transaction<T>(fn: (tx: RawClient) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>
}

function rawSql(client: RawClient): Sql {
  return {
    query: <T = Row>(text: string, values: readonly unknown[] = []) => client.$queryRawUnsafe<T[]>(text, ...values),
    exec: (text: string, values: readonly unknown[] = []) => client.$executeRawUnsafe(text, ...values),
  }
}

/** Adapter for the application Prisma client (or a lab client pointed at a disposable database). */
export function prismaDatabase(client: TransactionalClient): Database {
  return {
    ...rawSql(client),
    transaction: body => client.$transaction(tx => body(rawSql(tx)), { maxWait: 5000, timeout: 15000 }),
  }
}

/** Trigger/constraint failures surface as a stable code; internal SQL text is never returned to clients. */
export function ledgerFailure(error: unknown): PrintError {
  if (error instanceof PrintError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/p004 /.test(message)) return new PrintError("LEDGER_GUARD", 409)
  if (/could not serialize|deadlock|lock timeout|Transaction already closed|Unable to start a transaction/i.test(message)) return new PrintError("LEDGER_BUSY", 503)
  return new PrintError("INTERNAL", 500)
}
