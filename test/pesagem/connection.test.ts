import { afterEach, describe, expect, it, vi } from "vitest"
import { ScaleConnection, transportForOpenPort, transportForStream } from "../../services/pesagem"
import { fixture, flush, frame, simulatedStream } from "./helpers"

afterEach(() => vi.useRealTimers())

describe("transporte simulado e lifecycle de recursos", () => {
  it("conecta, recebe fragmentos/múltiplas mensagens e libera leitor antes da porta", async () => {
    const source = simulatedStream()
    const f = fixture()
    const close = vi.fn(async () => { expect(source.stream.locked).toBe(false); await source.close() })
    const port = { readable: source.stream, close }
    const c = new ScaleConnection(f.session, transportForOpenPort(port), 1000)
    const done = c.run()
    expect(c.run()).toBe(done)
    source.send("SIM|ST|NET|350|"); await flush()
    expect(f.session.snapshot().status).toBe("incomplete")
    source.send("g\n" + frame("0.351", "ST")); await flush()
    expect(f.session.measurementCandidate()).toMatchObject({ sequence: 2, packetSequence: 2, mass: { kilograms: "0.351" } })
    await c.stop()
    expect((await done).status).toBe("cancelled")
    expect(source.stats()).toEqual({ cancellations: 1, closes: 1, locked: false })
    await c.stop()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it.each(["disconnected", "read_error"] as const)("%s remove peso e encerra o loop", async (reason) => {
    const source = simulatedStream()
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(source.stream, source.close), 1000)
    const done = c.run()
    source.send(frame("0.350", "ST")); await flush()
    if (reason === "disconnected") source.disconnect(); else source.fail()
    const final = await done
    expect(final).toMatchObject({ status: reason, reading: null, usable: false })
    expect(source.stats()).toMatchObject({ closes: 1, locked: false })
  })

  it("timeout sem novos dados cancela read pendente e não oferece último peso", async () => {
    vi.useFakeTimers()
    const source = simulatedStream()
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(source.stream, source.close), 250)
    const done = c.run()
    source.send(frame("0.350", "ST")); await flush()
    expect(f.session.snapshot().usable).toBe(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(await done).toMatchObject({ status: "timeout", reading: null, usable: false })
    expect(source.stats()).toEqual({ cancellations: 1, closes: 1, locked: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("pacotes vazios não estendem timeout", async () => {
    vi.useFakeTimers()
    const source = simulatedStream()
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(source.stream, source.close), 100)
    const done = c.run()
    await vi.advanceTimersByTimeAsync(80)
    source.send(""); await flush()
    await vi.advanceTimersByTimeAsync(20)
    expect((await done).status).toBe("timeout")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("recebimento real renova o timeout de inatividade", async () => {
    vi.useFakeTimers()
    const source = simulatedStream()
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(source.stream, source.close), 100)
    const done = c.run()
    await vi.advanceTimersByTimeAsync(80)
    source.send(frame("0.350", "ST")); await flush()
    await vi.advanceTimersByTimeAsync(80)
    expect(f.session.snapshot().status).toBe("ready")
    await vi.advanceTimersByTimeAsync(20)
    expect((await done).status).toBe("timeout")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejeição de cancel não impede releaseLock nem fechamento", async () => {
    vi.useFakeTimers()
    const stream = new ReadableStream<Uint8Array>({ cancel() { throw new Error("cancel_failed") } })
    const close = vi.fn(async () => { expect(stream.locked).toBe(false) })
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(stream, close), 1000)
    const done = c.run(); await c.stop()
    expect(await done).toMatchObject({ status: "cancelled", reading: null, detail: "reader_cancel_failed; resources_released" })
    expect(close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("AbortSignal e troca de contexto cancelam imediatamente sem loop órfão", async () => {
    vi.useFakeTimers()
    for (const reason of ["cancelled", "context_changed"] as const) {
      const source = simulatedStream()
      const f = fixture(reason)
      const abort = new AbortController()
      const c = new ScaleConnection(f.session, transportForStream(source.stream, source.close), 1000)
      const done = c.run(abort.signal)
      source.send(frame("0.350", "ST")); await flush()
      if (reason === "cancelled") abort.abort(); else await c.stop(reason)
      expect(f.session.measurementCandidate()).toBeNull()
      expect((await done).status).toBe(reason)
      expect(source.stats()).toEqual({ cancellations: 1, closes: 1, locked: false })
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancelamento prévio não adquire recurso nem solicita porta", async () => {
    const acquire = vi.fn(() => { throw new Error("must_not_acquire") })
    const f = fixture()
    const abort = new AbortController(); abort.abort()
    const c = new ScaleConnection(f.session, { resource: {}, acquire }, 1000)
    expect((await c.run(abort.signal)).status).toBe("cancelled")
    expect(acquire).not.toHaveBeenCalled()
    const beforeRun = new ScaleConnection(fixture().session, { resource: {}, acquire }, 1000)
    await beforeRun.stop()
    expect((await beforeRun.run()).status).toBe("cancelled")
    expect(acquire).not.toHaveBeenCalled()
  })

  it("reserva a mesma porta mesmo quando há dois adaptadores distintos", async () => {
    const source = simulatedStream()
    const port = { readable: source.stream, close: vi.fn(source.close) }
    const first = new ScaleConnection(fixture("one").session, transportForOpenPort(port), 1000)
    const second = new ScaleConnection(fixture("two").session, transportForOpenPort(port), 1000)
    const done = first.run()
    expect((await second.run()).status).toBe("port_in_use")
    expect(port.close).not.toHaveBeenCalled()
    expect(source.stream.locked).toBe(true)
    await first.stop(); await done
    expect(port.close).toHaveBeenCalledTimes(1)
  })

  it("sessões em streams distintos são isoladas e reconexão começa sem peso", async () => {
    const a = simulatedStream(), b = simulatedStream()
    const fa = fixture("a"), fb = fixture("b")
    const ca = new ScaleConnection(fa.session, transportForStream(a.stream, a.close), 1000)
    const cb = new ScaleConnection(fb.session, transportForStream(b.stream, b.close), 1000)
    const da = ca.run(), db = cb.run()
    a.send(frame("0.350", "ST")); b.send(frame("1.250", "ST")); await flush()
    expect(fa.session.measurementCandidate()?.mass.kilograms).toBe("0.350")
    expect(fb.session.measurementCandidate()?.mass.kilograms).toBe("1.250")
    await ca.stop()
    expect(fb.session.snapshot().usable).toBe(true)
    await cb.stop(); await Promise.all([da, db])
    const reconnected = fixture("reconnected")
    reconnected.session.markConnected()
    expect(reconnected.session.measurementCandidate()).toBeNull()
  })

  it("falha de acquire não fecha recurso que não foi adquirido", async () => {
    const close = vi.fn(async () => {})
    const c = new ScaleConnection(fixture().session, transportForOpenPort({ readable: null, close }), 1000)
    expect((await c.run()).status).toBe("connection_error")
    expect(close).not.toHaveBeenCalled()
  })

  it("porta com leitor externo permanece sob controle do seu dono", async () => {
    const source = simulatedStream()
    const reader = source.stream.getReader()
    const close = vi.fn(source.close)
    const c = new ScaleConnection(fixture().session, transportForOpenPort({ readable: source.stream, close }), 1000)
    expect((await c.run()).status).toBe("connection_error")
    expect(close).not.toHaveBeenCalled()
    expect(source.stream.locked).toBe(true)
    await reader.cancel(); reader.releaseLock()
  })

  it("a mesma sessão não pode controlar dois loops ou recursos", async () => {
    const a = simulatedStream(), b = simulatedStream()
    const f = fixture()
    const first = new ScaleConnection(f.session, transportForStream(a.stream, a.close), 1000)
    const second = new ScaleConnection(f.session, transportForStream(b.stream, b.close), 1000)
    const done = first.run()
    await expect(second.run()).rejects.toThrow("session_is_single_use")
    a.send(frame("0.350", "ST")); await flush()
    expect(f.session.snapshot().usable).toBe(true)
    expect(b.stats()).toEqual({ cancellations: 0, closes: 0, locked: false })
    await first.stop(); await done
  })

  it("falha ao fechar mantém reserva e permite retry explícito", async () => {
    const source = simulatedStream()
    let fail = true
    const close = vi.fn(async () => { if (fail) throw new Error("close_failed") })
    const port = { readable: source.stream, close }
    const c = new ScaleConnection(fixture("one").session, transportForOpenPort(port), 1000)
    const done = c.run(); await c.stop()
    expect((await done).status).toBe("cleanup_error")
    const competitor = new ScaleConnection(fixture("two").session, transportForOpenPort(port), 1000)
    expect((await competitor.run()).status).toBe("port_in_use")
    fail = false; await c.retryClose()
    expect(close).toHaveBeenCalledTimes(2)
    expect(source.stream.locked).toBe(false)
  })

  it("stop de um controlador rejeitado não encerra a sessão do dono", async () => {
    const a = simulatedStream(), b = simulatedStream()
    const f = fixture()
    const first = new ScaleConnection(f.session, transportForStream(a.stream, a.close), 1000)
    const second = new ScaleConnection(f.session, transportForStream(b.stream, b.close), 1000)
    const done = first.run()
    try {
      await expect(second.run()).rejects.toThrow("session_is_single_use")
      await second.stop("context_changed")
      a.send(frame("0.350", "ST")); await flush()
      expect(f.session.measurementCandidate()?.mass.kilograms).toBe("0.350")
      expect(b.stats()).toEqual({ cancellations: 0, closes: 0, locked: false })
    } finally { await first.stop(); await done }
  })

  it("cancel que nunca conclui tem prazo e conserva reserva para retryClose", async () => {
    vi.useFakeTimers()
    let finishCancel!: () => void
    const cancelled = new Promise<void>((resolve) => { finishCancel = resolve })
    const stream = new ReadableStream<Uint8Array>({ cancel: () => cancelled })
    const close = vi.fn(async () => {})
    const port = { readable: stream, close }
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForOpenPort(port), 100)
    let final: Awaited<ReturnType<typeof c.run>> | undefined
    const done = c.run().then((snapshot) => { final = snapshot; return snapshot })
    const stopped = c.stop()
    await vi.advanceTimersByTimeAsync(5000)
    try {
      expect(final).toMatchObject({ status: "cleanup_error", usable: false, reading: null })
      expect(close).not.toHaveBeenCalled()
      expect((await new ScaleConnection(fixture("other").session, transportForOpenPort(port), 100).run()).status).toBe("port_in_use")
      expect(vi.getTimerCount()).toBe(0)
    } finally { finishCancel(); await flush(); await stopped; await done; await c.retryClose() }
    expect(close).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it("close pendente tem prazo; retryClose não duplica fechamento nem libera outra sessão", async () => {
    vi.useFakeTimers()
    const source = simulatedStream()
    let finishClose!: () => void
    const closing = new Promise<void>((resolve) => { finishClose = resolve })
    const close = vi.fn(() => closing)
    const port = { readable: source.stream, close }
    const c = new ScaleConnection(fixture().session, transportForOpenPort(port), 100)
    let final: Awaited<ReturnType<typeof c.run>> | undefined
    const done = c.run().then((snapshot) => { final = snapshot; return snapshot })
    const stopped = c.stop()
    await vi.advanceTimersByTimeAsync(5000)
    try {
      expect(final).toMatchObject({ status: "cleanup_error", usable: false })
      const retry = c.retryClose()
      await vi.advanceTimersByTimeAsync(5000)
      await retry
      expect(close).toHaveBeenCalledTimes(1)
      expect((await new ScaleConnection(fixture("other").session, transportForOpenPort(port), 100).run()).status).toBe("port_in_use")
      expect(vi.getTimerCount()).toBe(0)
    } finally { finishClose(); await flush(); await stopped; await done; await c.retryClose() }
    expect(close).toHaveBeenCalledTimes(1)
  })

  it.each(["resolve", "reject", "throw"] as const)("read pendente não impede stop quando cancel %s", async (cancelMode) => {
    vi.useFakeTimers()
    let rejectRead!: (error: Error) => void
    const pending = new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => { rejectRead = reject })
    const reader = { read: vi.fn(() => pending), releaseLock: vi.fn(), cancel: vi.fn(() => {
      if (cancelMode === "throw") throw new Error("cancel_threw")
      return cancelMode === "reject" ? Promise.reject(new Error("cancel_failed")) : Promise.resolve()
    }) } as unknown as ReadableStreamDefaultReader<Uint8Array>
    const close = vi.fn(async () => {})
    const f = fixture()
    const c = new ScaleConnection(f.session, { resource: {}, acquire: () => ({ reader, close }) }, 100, 25)
    const done = c.run()
    await c.stop()
    expect(await done).toMatchObject({ status: "cancelled", reading: null, usable: false })
    expect(reader.releaseLock).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    const final = f.session.snapshot()
    rejectRead(new Error("late_read_failure")); await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.session.snapshot()).toEqual(final)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("read eterno termina pelo timeout sem aguardar o driver", async () => {
    vi.useFakeTimers()
    const reader = { read: () => new Promise(() => {}), cancel: async () => {}, releaseLock() {} } as unknown as ReadableStreamDefaultReader<Uint8Array>
    const close = vi.fn(async () => {})
    const c = new ScaleConnection(fixture().session, { resource: {}, acquire: () => ({ reader, close }) }, 100, 25)
    const done = c.run()
    await vi.advanceTimersByTimeAsync(100)
    expect(await done).toMatchObject({ status: "timeout", reading: null })
    expect(close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("falha de releaseLock conserva a reserva e retryClose tenta liberar antes de fechar", async () => {
    const source = simulatedStream()
    const reader = source.stream.getReader()
    const originalRelease = reader.releaseLock.bind(reader)
    let failRelease = true
    vi.spyOn(reader, "releaseLock").mockImplementation(() => { if (failRelease) throw new Error("release_failed"); originalRelease() })
    const close = vi.fn(source.close)
    const resource = {}
    const c = new ScaleConnection(fixture().session, { resource, acquire: () => ({ reader, close }) }, 100)
    const done = c.run(); await c.stop()
    expect(await done).toMatchObject({ status: "cleanup_error", detail: "release_failed; resources_retained" })
    expect(close).not.toHaveBeenCalled()
    const competitor = new ScaleConnection(fixture("other").session, { resource, acquire: () => ({ reader, close }) }, 100)
    expect((await competitor.run()).status).toBe("port_in_use")
    failRelease = false
    await Promise.all([c.retryClose(), c.retryClose()])
    expect(close).toHaveBeenCalledTimes(1)
    expect(source.stream.locked).toBe(false)
  })

  it("reserva o stream também quando o fechamento da porta falha", async () => {
    const source = simulatedStream()
    let failClose = true
    const port = { readable: source.stream, close: vi.fn(async () => { if (failClose) throw new Error("close_failed") }) }
    const c = new ScaleConnection(fixture().session, transportForOpenPort(port), 100)
    const done = c.run(); await c.stop(); await done
    const foreignClose = vi.fn(async () => {})
    const other = new ScaleConnection(fixture("other").session, transportForStream(source.stream, foreignClose), 100)
    expect((await other.run()).status).toBe("port_in_use")
    await other.retryClose()
    expect(foreignClose).not.toHaveBeenCalled()
    failClose = false; await c.retryClose()
    expect(port.close).toHaveBeenCalledTimes(2)
  })

  it("run reentrante durante acquire reutiliza a Promise e adquire somente uma vez", async () => {
    const source = simulatedStream()
    let c!: ScaleConnection
    let reentrant: ReturnType<ScaleConnection["run"]> | undefined
    const acquire = vi.fn(() => { reentrant = c.run(); return { reader: source.stream.getReader(), close: source.close } })
    c = new ScaleConnection(fixture().session, { resource: source.stream, acquire }, 100)
    const done = c.run()
    expect(reentrant).toBe(done)
    expect(acquire).toHaveBeenCalledTimes(1)
    await c.stop(); await done
  })

  it("cada read remove seu listener de aborto; nenhum acumula após encerramento", async () => {
    const added = vi.spyOn(AbortSignal.prototype, "addEventListener")
    const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener")
    const source = simulatedStream()
    const c = new ScaleConnection(fixture().session, transportForStream(source.stream, source.close), 1000)
    const done = c.run()
    try {
      for (let i = 0; i < 30; i++) { source.send(frame("350", "ST", "NET", "g")); await flush() }
      expect(added.mock.calls.length - removed.mock.calls.length).toBe(1)
      await c.stop(); await done
      expect(added.mock.calls.length).toBe(removed.mock.calls.length)
    } finally { await c.stop(); added.mockRestore(); removed.mockRestore() }
  })

  it("retryClose anterior a run não fecha o canal da execução que começa em seguida", async () => {
    const source = simulatedStream()
    const close = vi.fn(source.close)
    const f = fixture()
    const c = new ScaleConnection(f.session, transportForStream(source.stream, close), 1000)
    const retry = c.retryClose()
    const done = c.run()
    try {
      await retry
      expect(close).not.toHaveBeenCalled()
      source.send(frame("350", "ST", "NET", "g")); await flush()
      expect(f.session.measurementCandidate()?.mass.kilograms).toBe("0.350")
    } finally { await c.stop(); await done }
    expect(close).toHaveBeenCalledTimes(1)
  })
})
