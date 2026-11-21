import "server-only"
import { Prisma } from "@/generated/prisma"
import type { ReportQuery } from "./contracts"

export type ReportDb = Pick<Prisma.TransactionClient, "$queryRaw" | "venda" | "itemVenda" | "devolucaoVenda" | "produto" | "categoriaProduto">
export const like = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`
/** Malformed numeric JSON never causes a cast failure or silently becomes money. */
export function numeric(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE WHEN (${expression}) ~ '^-?[0-9]+([.][0-9]+)?$' THEN (${expression})::numeric ELSE NULL END`
}
/** Only complete ISO instants with an offset are usable for time-to-completion. */
export function instant(expression: Prisma.Sql): Prisma.Sql {
  // JSON is not trusted: validate the calendar using make_date before casting its day.
  return Prisma.sql`CASE WHEN (${expression}) ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])$'
    THEN CASE WHEN substring((${expression}),9,2)::int <= extract(day from (make_date(substring((${expression}),1,4)::int,substring((${expression}),6,2)::int,1)+interval '1 month - 1 day'))
      THEN (${expression})::timestamptz END END`
}
export function bucket(expression: Prisma.Sql, q: ReportQuery): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc(${q.grain}, ((${expression}) AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD')`
}
/** Prisma TIMESTAMP(3) columns contain UTC without an offset. Emit unambiguous ISO text. */
export function utcText(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char((${expression}), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
}
export function paginate(q: ReportQuery): Prisma.Sql { return Prisma.sql`LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}` }
export function emptyArray(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE WHEN jsonb_typeof(${expression})='array' THEN ${expression} ELSE '[]'::jsonb END`
}
