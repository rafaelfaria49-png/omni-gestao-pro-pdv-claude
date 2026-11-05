/**
 * Real Windows spooler adapter WITHOUT a printer: read-only inventory + a submit to a queue name that does not exist.
 * It never sends bytes to an existing printer (the target name is random and asserted absent first).
 * Opt-in: PRINT_WINDOWS_SPOOLER_TEST=1 on win32.
 */
import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { WindowsSpooler } from "./spooler-windows.mjs"

const enabled = process.platform === "win32" && process.env.PRINT_WINDOWS_SPOOLER_TEST === "1"
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }

describe("WindowsSpooler — gestão do host (P2-2), com host falso no mesmo protocolo", { timeout: 60_000 }, () => {
  const make = () => new WindowsSpooler({ requestTimeoutMs: 5000, hostCommand: { command: process.execPath, args: [path.join(__dirname, "test-fake-host.mjs")] } })
  it("timeout → reset espera o host morrer; o host novo atende sem ser rejeitado pelo antigo; nenhum órfão", async () => {
    const sp = make()
    const first = await sp.status("Fake")
    expect(first.exists).toBe(true)
    const oldPid: number = sp.host!.pid!
    // Drive the timeout through request() exactly like an agent submit that hangs.
    await expect(sp.request("send", { printer: "HANG" }, 300)).rejects.toMatchObject({ timeout: true })
    const resetting = sp.reset(30_000) // a busy machine may need more than the default 10 s to reap the host
    const next = sp.request("status", { printer: "Fake" }, 2000) // new host starts while the old one is still dying
    expect(await resetting).toBe(true)
    expect((await next).ok).toBe(true)
    expect(alive(oldPid)).toBe(false)
    expect(sp.host!.pid).not.toBe(oldPid)
    expect(await sp.reset(30_000)).toBe(true)
  })
  it("exceção no host durante o envio → AFTER/WRITE_FAILED (incerto), nunca 'nada enviado'", async () => {
    const sp = make()
    await expect(sp.submit("THROW", Uint8Array.from([0x41]), "t")).rejects.toMatchObject({ phase: "AFTER", reason: "WRITE_FAILED" })
    await sp.close()
  })
})

describe.skipIf(!enabled)("WindowsSpooler (real PowerShell host, no hardware)", { timeout: 120_000 }, () => {
  const sp = new WindowsSpooler({ dir: path.join(os.tmpdir(), "p004c-spooler-test") })
  const ghost = `OmniGestao-Inexistente-004C-${randomUUID()}`
  afterAll(() => sp.close())

  it("lista filas do Windows pelo host persistente (somente leitura)", async () => {
    const list = await sp.listPrinters()
    expect(Array.isArray(list)).toBe(true)
    for (const p of list) expect(typeof p.name).toBe("string")
    expect(list.some((p: { name: string }) => p.name === ghost)).toBe(false)
  })
  it("status de fila inexistente → exists=false (agente reportaria PRINTER_NOT_FOUND / NO_EFFECT)", async () => {
    expect(await sp.status(ghost)).toMatchObject({ exists: false })
  })
  it("envio RAW para fila inexistente falha ANTES de criar job (OpenPrinter) → NO_EFFECT comprovado", async () => {
    await expect(sp.submit(ghost, Uint8Array.from([0x41, 0x0a, 0x1d, 0x56, 0x00]), "omni-test")).rejects.toMatchObject({ phase: "BEFORE", reason: "OPEN_FAILED" })
  })
  it("o host é reutilizado entre chamadas (sem recompilar Add-Type a cada job)", async () => {
    const t0 = Date.now()
    await sp.status(ghost)
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})
