/**
 * P1-2 evidence: the parent UNIQUE index on `vendas` must not stall sales writes when it is created in the future.
 * Plain CREATE UNIQUE INDEX (SHARE lock) waiting behind an open sale transaction makes new INSERTs queue (lock timeout);
 * CREATE UNIQUE INDEX CONCURRENTLY (SHARE UPDATE EXCLUSIVE) lets new INSERTs through while it waits.
 * Disposable PostgreSQL only; database reset with PRINT_LAB_LAYOUT=baseline (no print objects).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { labPrisma } from "./lab-env"

const URL_ = process.env.PRINT_PG_URL
// Small pools: three clients must not exhaust the lab server connections.
const small = (u?: string) => (u ?? "postgresql://x@127.0.0.1/print_lab_unused") + "?connection_limit=2"
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe.skipIf(!URL_)("estratégia do índice UNIQUE(vendas.id, storeId)", { timeout: 60_000 }, () => {
  const holder = labPrisma(small(URL_))
  const builder = labPrisma(small(URL_))
  const writer = labPrisma(small(URL_))
  let n = 0
  const insertSale = (c: typeof writer) => c.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1500ms'")
    await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'idx-lab',$2,1)`, "idx-v-" + ++n, "IDX-" + n)
  })
  /** An in-flight sale transaction (uncommitted INSERT) that the index build must wait for. */
  const openSale = () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const done = holder.$transaction(async tx => {
      await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'idx-lab',$2,1)`, "idx-hold-" + ++n, "IDX-H-" + n)
      await gate
    }, { maxWait: 5000, timeout: 30000 })
    return { release, done }
  }
  /** Wait until the index build is really blocked on a lock (proved by pg_stat_activity, not by a sleep). */
  const waitBlocked = async (pattern: string) => {
    for (let i = 0; i < 100; i++) {
      const rows = await writer.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE $1`, pattern)
      if (rows[0].n > 0) return
      await sleep(100)
    }
    const act = await writer.$queryRawUnsafe(`SELECT state,wait_event_type,wait_event,left(query,80) q FROM pg_stat_activity WHERE datname=current_database()`)
    throw new Error("index build never blocked " + JSON.stringify(act))
  }
  beforeAll(async () => {
    await writer.$executeRawUnsafe(`INSERT INTO public.stores(id,name,"updatedAt") VALUES ('idx-lab','Lab índice',now())`)
  })
  afterAll(async () => { await Promise.all([holder.$disconnect(), builder.$disconnect(), writer.$disconnect()]) })

  it("CREATE UNIQUE INDEX comum: novas vendas ficam presas atrás do índice (lock_timeout)", async () => {
    const sale = openSale()
    await sleep(1000)
    const build = Promise.resolve(builder.$executeRawUnsafe(`CREATE UNIQUE INDEX "idx_lab_plain" ON public.vendas ("id","storeId")`)) // Prisma promises are lazy
    await waitBlocked("CREATE UNIQUE INDEX \"idx_lab_plain\"%")
    await expect(insertSale(writer)).rejects.toThrow(/lock timeout|55P03/i)
    sale.release(); await sale.done; await build
    await builder.$executeRawUnsafe(`DROP INDEX public."idx_lab_plain"`)
  })

  it("CREATE UNIQUE INDEX CONCURRENTLY: novas vendas continuam gravando enquanto o índice aguarda; índice termina VÁLIDO", async () => {
    const sale = openSale()
    await sleep(1000)
    const build = Promise.resolve(builder.$executeRawUnsafe(`CREATE UNIQUE INDEX CONCURRENTLY "p004_vendas_id_store_uq" ON public.vendas ("id","storeId")`))
    await waitBlocked("CREATE UNIQUE INDEX CONCURRENTLY%")
    await expect(insertSale(writer)).resolves.toBeUndefined()
    await expect(insertSale(writer)).resolves.toBeUndefined()
    sale.release(); await sale.done; await build
    const [idx] = await writer.$queryRawUnsafe<Array<{ valid: boolean; unique: boolean }>>(`SELECT i.indisvalid valid,i.indisunique "unique" FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='p004_vendas_id_store_uq'`)
    expect(idx).toEqual({ valid: true, unique: true })
  })
})
