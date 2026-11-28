/** Fakes SOMENTE unitários. Não sustentam provas de banco, autorização ou RLS. */
type Row = Record<string, unknown>
type Query = { where: Row }
const preparados = new WeakSet<object>()
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v)
async function invoke(fn: unknown, owner: object, arg: unknown): Promise<unknown> {
  return typeof fn === "function" ? Reflect.apply(fn, owner, [arg]) : undefined
}
export function attachG002EmpresaFake<T extends object>(input: T): T {
  if (preparados.has(input)) return input
  preparados.add(input)
  const db = input as Row
  const perfis = new Map<string, Row>()
  db.financeiroPerfil ??= {
    findUnique: async ({ where }: Query) => perfis.get(String(where.storeId)) ?? null,
    createMany: async ({ data }: { data: Row | Row[] }) => {
      let count = 0
      for (const p of Array.isArray(data) ? data : [data]) {
        const storeId = String(p.storeId)
        if (perfis.has(storeId)) continue
        perfis.set(storeId, { ...p, id: `unit-empresa:${storeId}`, ativo: true })
        count++
      }
      return { count }
    },
  }
  db.$transaction ??= async (fn: unknown) => {
    if (typeof fn === "function") return Reflect.apply(fn, undefined, [db])
    if (Array.isArray(fn)) return Promise.all(fn)
    throw new Error("Contrato de transação inválido no fake unitário")
  }
  // Preserva coletores antigos; somente PostgreSQL real prova locks/FKs/RLS/rollback.
  for (const [model, table] of [["contaReceberTitulo", "contas_receber_titulos"], ["contaPagarTitulo", "contas_pagar_titulos"]]) {
    const titulos = db[model]
    if (!isRow(titulos) || typeof titulos.upsert !== "function" || titulos.createMany) continue
    const rows = new Map<string, Row>()
    const originalFind = titulos.findUnique, originalById = titulos.findFirst
    const originalUpdate = titulos.update, originalUpsert = titulos.upsert
    const key = (store: unknown, local: unknown) => `${String(store)}\u0000${String(local)}`
    const findUnique = async (args: Query): Promise<Row | null> => {
      const where = args.where.storeId_localKey
      let result: unknown
      if (isRow(where) && typeof originalFind === "function") result = await invoke(originalFind, titulos, args)
      else if (args.where.id && typeof originalById === "function") result = await invoke(originalById, titulos, args)
      else result = isRow(where) ? rows.get(key(where.storeId, where.localKey))
        : [...rows.values()].find(r => r.id === args.where.id)
      return isRow(result) ? result : null
    }
    titulos.findUnique = findUnique
    titulos.createMany = async ({ data }: { data: Row[] }) => {
      let count = 0
      for (const value of data) {
        const k = key(value.storeId, value.localKey)
        const where = { storeId_localKey: { storeId: value.storeId, localKey: value.localKey } }
        if (await findUnique({ where })) continue
        const result = await invoke(originalUpsert, titulos, { where, create: value, update: {} })
        rows.set(k, { ativo: true, createdAt: new Date(), updatedAt: new Date(), ...value, ...(isRow(result) ? result : {}) })
        count++
      }
      return { count }
    }
    titulos.update = async (args: Query & { data: Row }) => {
      const row = [...rows.values()].find(r => r.id === args.where.id)
      if (typeof originalUpdate === "function") {
        const updated = await invoke(originalUpdate, titulos, args)
        if (row && isRow(updated)) Object.assign(row, updated)
        return updated
      }
      return row ? Object.assign(row, args.data, { updatedAt: new Date() }) : null
    }
    const originalRaw = db.$queryRaw
    db.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings)
      if (sql.includes(`FROM "${table}"`)) {
        const where = sql.includes('WHERE "id"') ? { id: values[0] }
          : { storeId_localKey: { storeId: values[0], localKey: values[1] } }
        const row = await findUnique({ where })
        return row ? [{ id: row.id }] : []
      }
      return typeof originalRaw === "function" ? Reflect.apply(originalRaw, db, [strings, ...values]) : []
    }
  }
  return input
}
