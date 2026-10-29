import { afterEach, describe, expect, it, vi } from "vitest"
import { simulatedScale } from "@/test/scale-device"
import { parseAndScaleFrame, ReadonlyScaleSession, SCALE_PROFILE, SCALE_STALE_MS, ScaleFrameDecoder } from "./scale-readonly"

const bytes = (text: string) => new TextEncoder().encode(text)
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("A&D documentado — frames completos e unidades explícitas", () => {
  it.each([
    ["ST,+00012.40 kg", 12.4, 2, true],
    ["US,+0001.234 kg", 1.234, 3, false],
    ["ST,+0000.000 kg", 0, 3, true],
    ["ST,+000.0001 kg", 0.0001, 4, true],
  ])("valida %s sem perder precisão", (frame, kg, decimalPlaces, stable) => {
    expect(parseAndScaleFrame(String(frame))).toEqual({ kg, decimalPlaces, stable })
  })
  it.each(["1.234", "texto 1.234 kg", "ST,+0001.234 kg lixo", "ST,+0001.234 lb", "ST,+0001.234  g", "ST,+1.234 kg", "ST,-0001.234 kg", "OL,+99999.99 kg", "QT,+00000001 PC", "ST,+00301.00 kg", "ST,+0001,234 kg", "ST,+0001e+3 kg", "\u0002ST,+0001.234 kg"])("recusa dados arbitrários: %s", (frame) => {
    expect(parseAndScaleFrame(frame)).toBeNull()
  })
  it("separa amostras e remonta CR/LF e frames parciais sem reaproveitar o buffer", () => {
    const decoder = new ScaleFrameDecoder()
    expect(decoder.push(bytes("US,+0001."))).toEqual([])
    expect(decoder.push(bytes("234 kg\r"))).toEqual([])
    expect(decoder.push(bytes("\nST,+0000.000 kg\r\n"))).toEqual([
      { kg: 1.234, decimalPlaces: 3, stable: false }, { kg: 0, decimalPlaces: 3, stable: true },
    ])
    expect(decoder.push(bytes(""))).toEqual([])
    expect(decoder.push(bytes("ST,+0001.234 kg\n"))).toEqual([null])
  })
  it("descarta frame longo inteiro, não interpreta seu sufixo e recupera no próximo frame", () => {
    const decoder = new ScaleFrameDecoder()
    expect(decoder.push(bytes("x".repeat(50000) + "ST,+0001.234 kg\r\nST,+00012.40 kg\r\n")))
      .toEqual([null, { kg: 12.4, decimalPlaces: 2, stable: true }])
  })
  it("fragmento vencido não vira leitura nova quando chega o sufixo antigo", () => {
    let now = 1000
    const decoder = new ScaleFrameDecoder(() => now)
    expect(decoder.push(bytes("ST,+0001."))).toEqual([])
    now += SCALE_STALE_MS
    expect(decoder.push(bytes("234 kg\r\nST,+0000.000 kg\r\n"))).toEqual([
      null, { kg: 0, decimalPlaces: 3, stable: true },
    ])
  })
})

describe("Sessão serial somente leitura", () => {
  it("não solicita porta ao construir, nem para perfil desconhecido; transmite zero bytes", async () => {
    const device = simulatedScale()
    const session = new ReadonlyScaleSession(device.serial)
    expect(device.serial.requestPort).not.toHaveBeenCalled()
    await session.connect("toledo-prix-3-fit")
    expect(device.serial.requestPort).not.toHaveBeenCalled()
    expect(session.getSnapshot()).toMatchObject({ status: "error", sample: null })
    await session.connect()
    expect(device.port.open).toHaveBeenCalledWith({ baudRate: 2400, dataBits: 7, stopBits: 1, parity: "even", flowControl: "none" })
    expect("writable" in device.port).toBe(false)
    await session.disconnect()
  })
  it("um único frame US nunca se torna estável por consultas; expira e aceita zero em nova amostra", async () => {
    vi.useFakeTimers()
    const device = simulatedScale()
    const session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    device.send("US,+0001.234 kg\r\n")
    await flush()
    const first = session.getSnapshot().sample!
    for (let i = 0; i < 30; i++) expect(session.getSnapshot().status).toBe("unstable")
    await vi.advanceTimersByTimeAsync(SCALE_STALE_MS)
    expect(session.getSnapshot()).toMatchObject({ status: "stale", sample: null })
    device.send("ST,+0000.000 kg\r\n")
    await flush()
    expect(session.getSnapshot()).toMatchObject({ status: "stable", sample: { kg: 0, sequence: 2, stable: true } })
    expect(session.getSnapshot().sample!.receivedAt).toBeGreaterThan(first.receivedAt)
    await session.disconnect()
    expect(device.cancel).toHaveBeenCalledTimes(1)
    expect(device.port.close).toHaveBeenCalledTimes(1)
    expect(device.port.readable).toBeNull()
    expect(device.serial.removeEventListener).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("lixo não renova validade, nem preserva um peso como atual", async () => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    device.send("ST,+0001.234 kg\r\n")
    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    device.send("qualquer coisa 25.00 kg\r\n")
    await flush()
    expect(session.getSnapshot()).toMatchObject({ status: "waiting", sample: null })
    await vi.advanceTimersByTimeAsync(1000)
    expect(session.getSnapshot()).toMatchObject({ status: "stale", sample: null })
    await session.disconnect()
  })
  it.each(["eof", "fail", "unplug"] as const)("detecta %s, limpa amostra, libera e permite reconexão explícita", async (kind) => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    device.send("ST,+0001.234 kg\r\n")
    await flush()
    device[kind]()
    await flush()
    expect(session.getSnapshot()).toMatchObject({ status: kind === "fail" ? "error" : "disconnected", sample: null })
    expect(device.port.close).toHaveBeenCalledTimes(1)
    await session.connect()
    expect(session.getSnapshot()).toMatchObject({ status: "waiting", sample: null })
    expect(device.serial.requestPort).toHaveBeenCalledTimes(2)
    await session.disconnect()
  })
  it.each(["NotFoundError", "NotAllowedError", "SecurityError"])("trata %s sem abrir porta", async (name) => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    vi.mocked(device.serial.requestPort).mockRejectedValueOnce(new DOMException("private_device_data", name))
    await session.connect()
    expect(session.getSnapshot()).toMatchObject({ status: name === "NotFoundError" ? "disconnected" : "error", sample: null })
    expect(session.getSnapshot().message).not.toContain("private_device_data")
    expect(device.port.open).not.toHaveBeenCalled()
    await session.disconnect()
  })
  it("fechar durante o seletor impede uma abertura tardia", async () => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    let select!: (port: typeof device.port) => void
    vi.mocked(device.serial.requestPort).mockImplementationOnce(() => new Promise((resolve) => { select = resolve }))
    const connecting = session.connect()
    await session.disconnect()
    select(device.port)
    await connecting
    expect(device.port.open).not.toHaveBeenCalled()
    expect(session.getSnapshot()).toEqual({ status: "disconnected", sample: null })
  })
  it("fechar durante open aguarda a abertura e fecha sem criar um leitor", async () => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    let opened!: () => void
    vi.mocked(device.port.open).mockImplementationOnce(() => new Promise((resolve) => { opened = resolve }))
    const connecting = session.connect()
    await flush()
    const closing = session.disconnect()
    expect(session.getSnapshot().sample).toBeNull()
    opened()
    await Promise.all([connecting, closing])
    expect(device.port.close).toHaveBeenCalledTimes(1)
    expect(device.serial.addEventListener).not.toHaveBeenCalled()
  })
  it("porta sem stream é fechada; erro ao abrir não deixa recursos ativos", async () => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    vi.mocked(device.port.open).mockResolvedValueOnce()
    await session.connect()
    await flush()
    expect(session.getSnapshot().status).toBe("error")
    expect(device.port.close).toHaveBeenCalledTimes(1)
    vi.mocked(device.port.open).mockRejectedValueOnce(new Error("open failed"))
    await session.connect()
    await session.disconnect()
    expect(device.serial.addEventListener).not.toHaveBeenCalled()
  })
  it("duas sessões não adquirem a mesma porta", async () => {
    const device = simulatedScale(), a = new ReadonlyScaleSession(device.serial), b = new ReadonlyScaleSession(device.serial)
    await a.connect()
    await b.connect()
    expect(device.port.open).toHaveBeenCalledTimes(1)
    expect(b.getSnapshot().status).toBe("error")
    await a.disconnect()
    await b.disconnect()
  })
  it("navegador sem Web Serial falha de forma explícita", async () => {
    vi.stubGlobal("navigator", {})
    const session = new ReadonlyScaleSession()
    await session.connect(SCALE_PROFILE)
    expect(session.getSnapshot()).toMatchObject({ status: "error", sample: null, message: expect.stringContaining("Web Serial") })
  })
})

describe("Continuidade serial com frames parciais", () => {
  it("preserva o frame válido seguido do início do próximo e atualiza somente ao completar", async () => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    try {
      device.send("ST,+0001.234 kg\r\nST,+0002.")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "stable", sample: { kg: 1.234, stable: true, sequence: 1 } })
      const first = session.getSnapshot().sample!
      await vi.advanceTimersByTimeAsync(100)
      device.send("000 kg\r\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({
        status: "stable", sample: { kg: 2, stable: true, sequence: 2, receivedAt: first.receivedAt + 100 },
      })
    } finally { await session.disconnect() }
  })

  it("publica cada frame do mesmo chunk e conserva o último zero estável diante de uma cauda parcial", async () => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    const observed: ReturnType<ReadonlyScaleSession["getSnapshot"]>[] = []
    const unsubscribe = session.subscribe((snapshot) => observed.push(snapshot))
    observed.length = 0
    try {
      device.send("ST,+0001.234 kg\r\nUS,+0002.500 kg\r\nST,+0000.000 kg\r\nST,+0003.")
      await flush()
      expect(observed.map(({ status, sample }) => ({ status, kg: sample?.kg, sequence: sample?.sequence }))).toEqual([
        { status: "stable", kg: 1.234, sequence: 1 },
        { status: "unstable", kg: 2.5, sequence: 2 },
        { status: "stable", kg: 0, sequence: 3 },
      ])
      const last = session.getSnapshot().sample!
      expect(last).toMatchObject({ kg: 0, stable: true, sequence: 3 })
      await vi.advanceTimersByTimeAsync(50)
      device.send("250 kg\r\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({
        status: "stable", sample: { kg: 3.25, stable: true, sequence: 4, receivedAt: last.receivedAt + 50 },
      })
    } finally { unsubscribe(); await session.disconnect() }
  })

  it("frame dividido entre vários chunks não promove US a ST nem altera sequência ou timestamp antes do LF", async () => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    try {
      device.send("US,+0001.")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "waiting", sample: null })
      device.send("234 kg\r\n")
      await flush()
      const first = session.getSnapshot()
      expect(first).toMatchObject({ status: "unstable", sample: { kg: 1.234, stable: false, sequence: 1 } })
      device.send("ST,+000")
      await flush()
      expect(session.getSnapshot()).toEqual(first)
      await vi.advanceTimersByTimeAsync(200)
      device.send("0.000 kg\r")
      await flush()
      expect(session.getSnapshot()).toEqual(first)
      device.send("\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({
        status: "stable", sample: { kg: 0, stable: true, sequence: 2, receivedAt: first.sample!.receivedAt + 200 },
      })
    } finally { await session.disconnect() }
  })

  it("tráfego parcial não renova frescor e o sufixo de fragmento vencido não vira leitura nova", async () => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    try {
      device.send("ST,+0001.234 kg\r\nST,+0002.")
      await flush()
      const first = session.getSnapshot()
      expect(first).toMatchObject({ status: "stable", sample: { kg: 1.234, sequence: 1 } })
      await vi.advanceTimersByTimeAsync(1000)
      device.send("0")
      await flush()
      await vi.advanceTimersByTimeAsync(SCALE_STALE_MS - 1001)
      expect(session.getSnapshot()).toEqual(first)
      await vi.advanceTimersByTimeAsync(1)
      expect(session.getSnapshot()).toMatchObject({ status: "stale", sample: null })
      device.send("00 kg\r\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "waiting", sample: null })
      device.send("ST,+0000.000 kg\r\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({
        status: "stable", sample: { kg: 0, stable: true, sequence: 2, receivedAt: first.sample!.receivedAt + SCALE_STALE_MS },
      })
    } finally { await session.disconnect() }
  })

  it("frame completo inválido ainda apaga a leitura anterior, mesmo com outro fragmento pendente", async () => {
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    try {
      device.send("ST,+0001.234 kg\r\nOL,+99999.99 kg\r\nUS,+0002.")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "waiting", sample: null })
      device.send("500 kg\r\n")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "unstable", sample: { kg: 2.5, stable: false, sequence: 2 } })
    } finally { await session.disconnect() }
  })

  it.each(["disconnect", "eof", "unplug"] as const)("%s durante a espera pelo próximo fragmento apaga o peso e libera a porta", async (kind) => {
    vi.useFakeTimers()
    const device = simulatedScale(), session = new ReadonlyScaleSession(device.serial)
    await session.connect()
    try {
      device.send("ST,+0001.234 kg\r\nST,+0002.")
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "stable", sample: { kg: 1.234 } })
      if (kind === "disconnect") await session.disconnect()
      else device[kind]()
      await flush()
      expect(session.getSnapshot()).toMatchObject({ status: "disconnected", sample: null })
      // EOF já encerrou a fonte; cancelar o reader não chama seu callback novamente.
      expect(device.cancel).toHaveBeenCalledTimes(kind === "eof" ? 0 : 1)
      expect(device.port.close).toHaveBeenCalledTimes(1)
      expect(device.port.readable).toBeNull()
      expect(device.serial.removeEventListener).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally { await session.disconnect() }
  })
})
