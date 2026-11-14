/** Internal laboratory port. No application Prisma singleton or environment lookup. */
export type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- raw parameterized PostgreSQL boundary; no wire DTO uses Row
export interface Sql {
  query<T = Row>(text: string, values?: readonly unknown[]): Promise<T[]>
  exec(text: string, values?: readonly unknown[]): Promise<number>
}
export interface Database extends Sql { transaction<T>(body: (sql: Sql) => Promise<T>): Promise<T> }
export async function one(sql: Sql, text: string, values: readonly unknown[] = []): Promise<Row> {
  const rows = await sql.query(text, values)
  if (rows.length !== 1) throw new CoreError("NOT_FOUND", 404)
  return rows[0]
}
export class CoreError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); this.name = "PrintCoreError" }
}
export function check(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new CoreError(code, status)
}
const insertable = new Set(["print_documents", "print_delegations", "print_requests", "print_jobs", "print_copies", "print_attempts", "print_events"])
export async function insert(sql: Sql, table: string, row: Row): Promise<void> {
  check(insertable.has(table), "INTERNAL_TABLE", 500)
  const keys = Object.keys(row)
  check(keys.every(k => /^[a-z_]+$/.test(k)), "INTERNAL_COLUMN", 500)
  const jsonColumns = new Set(["command", "details"])
  const uuidColumns = new Set(["id","document_id","delegation_id","intent_id","job_id","copy_id","attempt_id","destination_id","binding_version_id","browser_context_uuid","previous_job_id","send_key","synthetic_key"])
  const values = keys.map(k => jsonColumns.has(k) && row[k] !== null ? JSON.stringify(row[k]) : row[k])
  await sql.exec('INSERT INTO public."' + table + '" (' + keys.map(k => '"' + k + '"').join(",") + ') VALUES (' + keys.map((k, i) => "$" + (i + 1) + (jsonColumns.has(k) ? "::jsonb" : uuidColumns.has(k) ? "::uuid" : "")).join(",") + ')', values)
}
