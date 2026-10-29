import { vi } from "vitest"
import type { ReadonlyScalePort, ScaleSerial } from "@/services/scale-readonly"

/** Dispositivo sintético; não expõe writer. close falha se o leitor não foi liberado. */
export function simulatedScale() {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const port: ReadonlyScalePort = {
    readable: null,
    open: vi.fn(async () => {
      port.readable = new ReadableStream<Uint8Array>({ start(value) { controller = value }, cancel })
    }),
    close: vi.fn(async () => {
      if (port.readable?.locked) throw new Error("reader_not_released")
      port.readable = null
    }),
  }
  const target = new EventTarget()
  const serial: ScaleSerial = {
    requestPort: vi.fn(async () => port),
    addEventListener: vi.fn((name, listener) => target.addEventListener(name, listener)),
    removeEventListener: vi.fn((name, listener) => target.removeEventListener(name, listener)),
  }
  return {
    port, serial, cancel,
    send: (frame: string) => controller.enqueue(new TextEncoder().encode(frame)),
    eof: () => controller.close(),
    fail: () => controller.error(new Error("synthetic_transport_failure")),
    unplug: () => { const event = new Event("disconnect"); Object.defineProperty(event, "port", { value: port }); target.dispatchEvent(event) },
  }
}
