import { describe, expect, it, vi } from "vitest"
import { applyBasicsIntent, basicsIntent, parseStoreBasics, readStoreBasics, saveStoreBasics, type BasicsFetch } from "./store-basics"

function fixture() {
  const store = { id: "synthetic-a", name: "Padaria sintética", cnpj: "", phone: "11999990001", logoUrl: "/logo-preservado.svg", address: { rua: "Rua A", complemento: "Fundos", cityCode: "preservado" }, profile: "VARIEDADES", moduleAccess: { version: 1, modules: ["home", "settings"] } }
  const settings = { storeId: store.id, contactEmail: "contato@synthetic.invalid", contactWhatsapp: "11999990002", contactWhatsappDono: "11999990003", printerConfig: { pdvMainLayout: "classic", capabilities: { version: 1, business: { primaryBranch: "padaria" }, overrides: { "catalog.weight": true } }, custom: { preserved: true } } }
  const puts: Array<{ url: string; body: Record<string, unknown> }> = []
  let failContacts = false, uncertain = false, failReads = false
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body))
      puts.push({ url, body })
      if (url.endsWith("/settings") && failContacts) return Response.json({ error: "private internal database message" }, { status: 500 })
      Object.assign(url.endsWith("/settings") ? settings : store, body)
      if (uncertain) { uncertain = false; throw new Error("network response lost") }
      return Response.json({ ok: true })
    }
    if (failReads) return Response.json({ error: "private host" }, { status: 403 })
    return Response.json(url.endsWith("/settings") ? { settings } : { store })
  }) as unknown as ReturnType<typeof vi.fn> & BasicsFetch
  return { store, settings, puts, request, signal: new AbortController().signal,
    contactsFail: (value: boolean) => { failContacts = value }, uncertain: () => { uncertain = true }, readsFail: () => { failReads = true } }
}

describe("Dados básicos — leitores e writers canônicos", () => {
  it("hidrata contatos e envia só edições, preservando logo, endereço não exposto, ramo, módulos e layout", async () => {
    const f = fixture(), settingsBefore = structuredClone(fixture().settings)
    const baseline = await readStoreBasics(f.store.id, f.signal, f.request)
    expect(baseline).toMatchObject({ phone: "11999990001", contactEmail: "contato@synthetic.invalid", contactWhatsapp: "11999990002" })
    const intent = basicsIntent(baseline, { ...baseline, cnpj: "00.000.000/0001-00", address: { ...baseline.address, numero: "12" } })
    const result = await saveStoreBasics(f.store.id, intent, f.signal, f.request)
    expect(result.ok).toBe(true)
    expect(f.puts).toEqual([{ url: "/api/stores/synthetic-a", body: { cnpj: "00.000.000/0001-00", address: { rua: "Rua A", numero: "12", complemento: "Fundos", cityCode: "preservado" } } }])
    expect(f.store.logoUrl).toBe("/logo-preservado.svg")
    expect(f.store.profile).toBe("VARIEDADES")
    expect(f.settings).toEqual(settingsBefore)
  })
  it("editar rua conserva número JSON numérico, null e chaves ausentes sem normalizá-los na escrita", async () => {
    const f = fixture()
    Object.assign(f.store.address, { numero: 42, cep: null })
    const baseline = await readStoreBasics(f.store.id, f.signal, f.request)
    expect(baseline.address.numero).toBe("42")
    const intent = basicsIntent(baseline, { ...baseline, address: { ...baseline.address, rua: "Rua B" } })
    expect(intent).toEqual({ address: { rua: "Rua B" } })
    expect((await saveStoreBasics(f.store.id, intent, f.signal, f.request)).ok).toBe(true)
    expect(f.store.address).toEqual({ rua: "Rua B", numero: 42, cep: null, complemento: "Fundos", cityCode: "preservado" })
  })
  it("falha em contatos não conclui; retry reconcilia e grava apenas o que falta", async () => {
    const f = fixture()
    f.contactsFail(true)
    const intent = { cnpj: "identificacao-sintetica", contactEmail: "novo@synthetic.invalid" }
    const partial = await saveStoreBasics(f.store.id, intent, f.signal, f.request)
    expect(partial.ok).toBe(false)
    expect(partial.message).toMatch(/incompleto/)
    expect(partial.message).not.toMatch(/private|database/)
    expect(partial.current).toMatchObject({ cnpj: intent.cnpj, contactEmail: "contato@synthetic.invalid" })
    f.contactsFail(false); f.puts.length = 0
    const retried = await saveStoreBasics(f.store.id, intent, f.signal, f.request)
    expect(retried.ok).toBe(true)
    expect(f.puts).toEqual([{ url: "/api/stores/synthetic-a/settings", body: { contactEmail: intent.contactEmail } }])
  })
  it("resposta perdida após commit é resolvida por releitura, sem repetir a gravação", async () => {
    const f = fixture(); f.uncertain()
    const intent = { name: "Padaria alterada" }
    expect((await saveStoreBasics(f.store.id, intent, f.signal, f.request)).ok).toBe(true)
    expect((await saveStoreBasics(f.store.id, intent, f.signal, f.request)).ok).toBe(true)
    expect(f.puts).toHaveLength(1)
  })
  it("nenhum PUT quando a reconciliação autorizada falha", async () => {
    const f = fixture(); f.readsFail()
    const result = await saveStoreBasics(f.store.id, { name: "Nova loja" }, f.signal, f.request)
    expect(result).toMatchObject({ ok: false, current: null })
    expect(result.message).not.toContain("private")
    expect(f.puts).toHaveLength(0)
  })
  it("resposta incerta e releitura indisponível não produzem sucesso", async () => {
    const f = fixture()
    const request: BasicsFetch = async (url, options) => {
      const result = await f.request(url, options)
      if (options?.method === "PUT") { f.readsFail(); throw new Error("lost response") }
      return result
    }
    const result = await saveStoreBasics(f.store.id, { name: "Nova loja" }, f.signal, request)
    expect(result).toMatchObject({ ok: false, current: null })
    expect(f.puts).toHaveLength(1)
  })
  it("não aceita envelope ausente nem resposta de outra loja como hidratação", async () => {
    const f = fixture()
    for (const settings of [undefined, { storeId: "synthetic-b" }]) {
      const request: BasicsFetch = async (url) => Response.json(String(url).endsWith("/settings") ? { settings } : { store: f.store })
      await expect(readStoreBasics(f.store.id, f.signal, request)).rejects.toThrow()
    }
  })
  it("invalida a operação durante PUT de A, sem despachar contatos ou releitura tardios", async () => {
    const f = fixture(), pending = new AbortController()
    const request: BasicsFetch = async (url, options) => {
      const result = await f.request(url, options)
      if (options?.method === "PUT") pending.abort()
      return result
    }
    await expect(saveStoreBasics(f.store.id, { name: "A", contactEmail: "a@synthetic.invalid" }, pending.signal, request)).rejects.toThrow()
    expect(f.puts.map(({ url }) => url)).toEqual(["/api/stores/synthetic-a"])
  })
  it("limpa somente um campo explicitamente alterado e conserva atualização remota não editada", () => {
    const before = parseStoreBasics({ name: "Loja", phone: "111" }, { contactEmail: "a@synthetic.invalid" })
    const intent = basicsIntent(before, { ...before, phone: "" })
    const fresh = { ...before, contactEmail: "novo@synthetic.invalid" }
    expect(applyBasicsIntent(fresh, intent)).toMatchObject({ phone: "", contactEmail: "novo@synthetic.invalid" })
    expect(intent).toEqual({ phone: "" })
  })
})
