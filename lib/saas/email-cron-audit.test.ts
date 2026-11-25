import { afterEach, describe, expect, it, vi } from "vitest"
import { autorizarCron } from "@/lib/saas/cron-auth"
import { destinoPermitido, lerDestinosTeste, remetenteValido, resolverConfiguracaoEmail } from "@/lib/saas/email/config"
import { renderizarModelo } from "@/lib/saas/email/modelos"
import { criarAdaptadorRegistro, criarAdaptadorTeste } from "@/lib/saas/email/registro"
import { classificarRespostaResend, criarAdaptadorResend, RESEND_ENDPOINT } from "@/lib/saas/email/resend"
import { calcularBackoffMs, validarNovaNotificacao } from "@/lib/saas/outbox"
import { registrarAuditoriaPlataforma, sanitizarParaAuditoria, validarRegistroAuditoria } from "@/lib/saas/platform-audit"

const MSG = { para: "qa@teste.invalid", assunto: "A", texto: "B", idempotencyKey: "outbox:1" }
const SEGREDO = "re_chave_sintetica_que_nunca_pode_vazar"

afterEach(() => vi.restoreAllMocks())

describe("adaptador Resend", () => {
  it("monta o pedido com Idempotency-Key e sem vazar a chave para fora do cabeçalho", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ id: "msg_1" }) }))
    const r = await criarAdaptadorResend({ apiKey: SEGREDO, remetente: "OmniGestão <no-reply@exemplo.invalid>", fetchImpl }).enviar(MSG)
    expect(r).toEqual({ ok: true, provedor: "resend", mensagemId: "msg_1", enviadoDeVerdade: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }]
    expect(url).toBe(RESEND_ENDPOINT)
    expect(init.headers["Idempotency-Key"]).toBe("outbox:1")
    expect(init.body).not.toContain(SEGREDO)
    expect(JSON.parse(init.body)).toEqual({ from: "OmniGestão <no-reply@exemplo.invalid>", to: ["qa@teste.invalid"], subject: "A", text: "B" })
  })
  it.each([
    [429, "transitorio"], [500, "transitorio"], [503, "transitorio"], [401, "transitorio"], [403, "transitorio"], [409, "transitorio"],
    [400, "permanente"], [404, "permanente"], [422, "permanente"],
  ])("HTTP %i → %s", (status, tipo) => {
    expect(classificarRespostaResend(status)).toMatchObject({ ok: false, tipo })
  })
  it("timeout/conexão → resultado desconhecido (pode ter chegado)", async () => {
    const r = await criarAdaptadorResend({ apiKey: SEGREDO, remetente: "a@b.invalid", fetchImpl: async () => { throw new Error("aborted") } }).enviar(MSG)
    expect(r).toEqual({ ok: false, tipo: "desconhecido", codigo: "sem_resposta" })
  })
  it("2xx sem id ainda conta como aceito (não reenviar)", async () => {
    const r = await criarAdaptadorResend({ apiKey: SEGREDO, remetente: "a@b.invalid", fetchImpl: async () => ({ status: 200, json: async () => { throw new Error("x") } }) }).enviar(MSG)
    expect(r).toMatchObject({ ok: true, mensagemId: "resend:sem-id" })
  })
})

describe("configuração de email — envio real falha fechado", () => {
  const completo = { SAAS_EMAIL_ENVIO: "on", RESEND_API_KEY: SEGREDO, SAAS_EMAIL_REMETENTE: "no-reply@exemplo.invalid", SAAS_EMAIL_DESTINOS_TESTE: "qa@teste.invalid,@caixa-teste.invalid" }
  it("sem flag = registro", () => {
    expect(resolverConfiguracaoEmail({ ...completo, SAAS_EMAIL_ENVIO: undefined })).toMatchObject({ modo: "registro", motivo: "flag_desligada" })
  })
  it.each(["RESEND_API_KEY", "SAAS_EMAIL_REMETENTE", "SAAS_EMAIL_DESTINOS_TESTE"])("flag ligada sem %s = registro", (k) => {
    expect(resolverConfiguracaoEmail({ ...completo, [k]: "" })).toMatchObject({ modo: "registro", motivo: "config_incompleta" })
  })
  it("configurado: só destinos de teste chegam ao provedor; cliente real cai no registro", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ id: "m" }) }))
    const cfg = resolverConfiguracaoEmail(completo, { fetchImpl })
    expect(cfg.modo).toBe("real_restrito")
    expect(await cfg.adaptador.enviar({ ...MSG, para: "cliente@loja-real.com.br" })).toMatchObject({ ok: true, provedor: "registro", enviadoDeVerdade: false })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await cfg.adaptador.enviar({ ...MSG, para: "x@caixa-teste.invalid" })).toMatchObject({ provedor: "resend", enviadoDeVerdade: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it("listas e remetente", () => {
    expect(lerDestinosTeste(" A@B.invalid , lixo, @dom.invalid,@semponto ")).toEqual(["a@b.invalid", "@dom.invalid"])
    expect(destinoPermitido("Z@DOM.invalid", ["@dom.invalid"])).toBe(true)
    expect(destinoPermitido("z@outro.invalid", ["@dom.invalid"])).toBe(false)
    expect(destinoPermitido("z@sub.dom.invalid", ["@dom.invalid"])).toBe(false)
    expect(remetenteValido("OmniGestão <no-reply@x.invalid>")).toBe(true)
    expect(remetenteValido("sem-arroba")).toBe(false)
  })
  it("adaptador de registro nunca envia e não registra o destino", async () => {
    const log = vi.fn()
    expect(await criarAdaptadorRegistro(log).enviar(MSG)).toEqual({ ok: true, provedor: "registro", mensagemId: "registro:outbox:1", enviadoDeVerdade: false })
    expect(JSON.stringify(log.mock.calls)).not.toContain("qa@teste.invalid")
  })
  it("adaptador de teste captura e segue o roteiro", async () => {
    const t = criarAdaptadorTeste([{ ok: false, tipo: "transitorio", codigo: "x" }])
    expect((await t.adaptador.enviar(MSG)).ok).toBe(false)
    expect((await t.adaptador.enviar(MSG)).ok).toBe(true)
    expect(t.enviados).toHaveLength(2)
  })
  it("modelo desconhecido não renderiza", () => {
    expect(renderizarModelo("inexistente", {})).toBeNull()
    expect(renderizarModelo("saas.teste_infra", { referencia: "r1" })?.texto).toContain("r1")
  })
})

describe("outbox — validação e backoff", () => {
  const ok = { dedupeKey: "k1", canal: "email" as const, modelo: "saas.teste_infra", destino: "a@b.invalid" }
  it("recusa dados sensíveis e chaves inválidas", () => {
    expect(validarNovaNotificacao(ok)).toBeNull()
    expect(validarNovaNotificacao({ ...ok, dados: { link: { token: "x" } } })).toBe("dados_sensiveis")
    expect(validarNovaNotificacao({ ...ok, dados: { senha: "x" } })).toBe("dados_sensiveis")
    expect(validarNovaNotificacao({ ...ok, dedupeKey: " k" })).toBe("dedupe_key_invalida")
    expect(validarNovaNotificacao({ ...ok, canal: "sms" as never })).toBe("canal_invalido")
    expect(validarNovaNotificacao({ ...ok, maxTentativas: 0 })).toBe("max_tentativas_invalido")
  })
  it("espera crescente com teto de 1 h", () => {
    expect([1, 2, 3, 4, 5, 10].map(calcularBackoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000, 3_600_000])
  })
})

describe("autorização do cron", () => {
  const S = "s".repeat(32)
  it("sem segredo (ou curto) → 503, falha fechada", () => {
    expect(autorizarCron(`Bearer ${S}`, undefined)).toEqual({ ok: false, status: 503, erro: "cron_nao_configurado" })
    expect(autorizarCron("Bearer curto", "curto")).toMatchObject({ status: 503 })
  })
  it.each([null, "", "Bearer", `Bearer ${S}x`, `bearer ${S}`, S, `Basic ${S}`, "Bearer  "])("cabeçalho %j → 401", (h) => {
    expect(autorizarCron(h, S)).toEqual({ ok: false, status: 401, erro: "nao_autorizado" })
  })
  it("segredo correto → ok", () => {
    expect(autorizarCron(`Bearer ${S}`, S)).toEqual({ ok: true })
    expect(autorizarCron(`Bearer ${S}`, ` ${S} `)).toEqual({ ok: true })
  })
})

describe("auditoria da plataforma", () => {
  const base = { atorId: "plat-1", acao: "teste.estender" as const, motivo: "Cliente pediu mais prazo" }
  it("exige ator, ação conhecida e motivo", () => {
    expect(validarRegistroAuditoria(base)).toBeNull()
    expect(validarRegistroAuditoria({ ...base, atorId: " " })).toBe("ator_obrigatorio")
    expect(validarRegistroAuditoria({ ...base, acao: "apagar.tudo" as never })).toBe("acao_invalida")
    expect(validarRegistroAuditoria({ ...base, motivo: "ok" })).toBe("motivo_obrigatorio")
  })
  it("remove campos sensíveis de antes/depois", () => {
    expect(sanitizarParaAuditoria({ status: "a", senhaHash: "x", nested: { tokenHash: "y", ok: 1 }, quando: new Date("2026-01-01T00:00:00Z") }))
      .toEqual({ status: "a", nested: { ok: 1 }, quando: "2026-01-01T00:00:00.000Z" })
  })
  it("grava só INSERT com dados sanitizados", async () => {
    const create = vi.fn(async () => ({ id: "a1" }))
    await registrarAuditoriaPlataforma({ platformAuditLog: { create } } as never, { ...base, antes: { trialEndsAt: "x", password: "p" }, depois: { trialEndsAt: "y" } })
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ atorId: "plat-1", acao: "teste.estender", antes: { trialEndsAt: "x" }, depois: { trialEndsAt: "y" } }), select: { id: true } })
    await expect(registrarAuditoriaPlataforma({ platformAuditLog: { create } } as never, { ...base, motivo: "" })).rejects.toThrow("PLATFORM_AUDIT_MOTIVO_OBRIGATORIO")
  })
})
