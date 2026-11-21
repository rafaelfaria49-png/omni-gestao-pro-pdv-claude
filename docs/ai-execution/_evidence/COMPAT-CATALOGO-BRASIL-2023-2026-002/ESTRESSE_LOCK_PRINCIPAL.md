# Estresse do advisory lock da localização principal

PostgreSQL 17 descartável (127.0.0.1:55441, banco `compat_test`), pool Prisma de 40 conexões.
2 lojas × 2 modelos × 10 localizações = 4 grupos; por rodada, 40 `setLocalizacaoPrincipal` simultâneos (todas as localizações das duas lojas); 30 rodadas.
Deadlocks medidos pelo contador do próprio PostgreSQL (`pg_stat_database.deadlocks`). Controle = mesmo código sem a linha do `pg_advisory_xact_lock` (arquivo restaurado por hash ao final).

```
SEM_LOCK#1 grupos=4 simultaneas_por_rodada=40 rodadas=30 trocas=1200 falhas=7 grupos_sem_1_principal=0 deadlocks_pg=7 tempo_ms=13767 erros=PrismaClientUnknownRequestError: Invalid `db.compatLocalizac
SEM_LOCK#2 grupos=4 simultaneas_por_rodada=40 rodadas=30 trocas=1200 falhas=36 grupos_sem_1_principal=0 deadlocks_pg=27 tempo_ms=22970 erros=PrismaClientUnknownRequestError: Invalid `db.compatLocalizac / Conflito ao marcar principal.
COM_LOCK#1 grupos=4 simultaneas_por_rodada=40 rodadas=30 trocas=1200 falhas=0 grupos_sem_1_principal=0 deadlocks_pg=0 tempo_ms=5014 erros=
COM_LOCK#2 grupos=4 simultaneas_por_rodada=40 rodadas=30 trocas=1200 falhas=0 grupos_sem_1_principal=0 deadlocks_pg=0 tempo_ms=5831 erros=
COM_LOCK#3 grupos=4 simultaneas_por_rodada=40 rodadas=30 trocas=1200 falhas=0 grupos_sem_1_principal=0 deadlocks_pg=0 tempo_ms=4616 erros=
```

Isolamento entre lojas e grupos: teste `lock do principal: mesma chave na mesma transação; só o grupo da própria loja espera` em `lib/compat/compat-store.integration.test.ts` (loja B e outro grupo da loja A não esperam; o mesmo grupo espera; nenhum lock advisory sobra após o commit; tirar o `storeId` da chave derruba o teste).

Roteiro do estresse:

```ts
import { afterAll, expect, it } from "vitest"
import { appendFileSync } from "node:fs"
import { PrismaClient } from "@/generated/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { addLocalizacao, createPainel, setLocalizacaoPrincipal } from "./compat-store"
const db = new PrismaClient({ datasourceUrl: `${process.env.COMPAT_TEST_DATABASE_URL}?connection_limit=40` })
afterAll(() => db.$disconnect())
const MODELOS = ["samsung_galaxy_a06", "samsung_galaxy_a05"], N = 10, RODADAS = 30
it("estresse do lock do principal", async () => {
  const run = `st-${Date.now()}`
  const lojas = [`${run}-a`, `${run}-b`]
  const global = loadCatalogoIndex()
  const grupos: { s: string; m: string; ids: string[] }[] = []
  for (const s of lojas) {
    await db.store.create({ data: { id: s, name: s, cnpj: "00.000.000/0000-00", phone: "0" } })
    await db.compatPreferenciasLoja.create({ data: { storeId: s, posicoesHabilitadas: true } })
    const p = await createPainel(db, s, "u", { nome: "P" }); if (!p.ok) throw new Error("p")
    for (const m of MODELOS) {
      const ids: string[] = []
      for (let pos = 1; pos <= N; pos++) {
        const l = await addLocalizacao(db, global, s, "u", { modelKey: m, painelId: p.value.id, posicao: String(pos) })
        if (!l.ok) throw new Error("l " + JSON.stringify(l)); ids.push(l.value.id)
      }
      grupos.push({ s, m, ids })
    }
  }
  const dl = async () => (await db.$queryRaw<{ n: number }[]>`SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`)[0].n
  const antes = await dl()
  const t0 = Date.now(); let falhas = 0; let errados = 0; const erros = new Set<string>()
  for (let r = 0; r < RODADAS; r++) {
    const res = await Promise.allSettled(grupos.flatMap((g) => g.ids.map((id) => setLocalizacaoPrincipal(db, g.s, id, global))))
    for (const x of res) {
      if (x.status === "rejected") { falhas++; erros.add(String(x.reason).replace(/\s+/g, " ").slice(0, 60)) }
      else if (!x.value.ok) { falhas++; erros.add(x.value.message.slice(0, 60)) }
    }
    for (const g of grupos) if ((await db.compatLocalizacao.count({ where: { storeId: g.s, modelKey: g.m, principal: true } })) !== 1) errados++
  }
  const ms = Date.now() - t0
  await new Promise((r) => setTimeout(r, 1500))
  const depois = await dl()
  appendFileSync(process.env.OUT_STRESS!, `${process.env.ROTULO} grupos=${grupos.length} simultaneas_por_rodada=${grupos.length * N} rodadas=${RODADAS} trocas=${RODADAS * grupos.length * N} falhas=${falhas} grupos_sem_1_principal=${errados} deadlocks_pg=${depois - antes} tempo_ms=${ms} erros=${[...erros].join(" / ")}\n`)
  await db.compatLocalizacao.deleteMany({ where: { storeId: { in: lojas } } })
  await db.compatPainel.deleteMany({ where: { storeId: { in: lojas } } })
  await db.compatPreferenciasLoja.deleteMany({ where: { storeId: { in: lojas } } })
  await db.store.deleteMany({ where: { id: { in: lojas } } })
  expect(falhas).toBe(0)
  expect(errados).toBe(0)
  expect(depois - antes).toBe(0)
}, 300000)
```
