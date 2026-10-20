/**
 * Motor SIMULADO de reconhecimento local para testes (CAD-R2-021).
 * Não captura áudio nem reconhece fala: só imita a superfície on-device do
 * Web Speech (`processLocally`, `available`, `install`) e permite disparar
 * eventos sintéticos. Testes com este motor NÃO valem como captura real.
 */

type Availability = "available" | "downloadable" | "downloading" | "unavailable"

export type FakeLocalSpeechOptions = {
  availability?: Availability | "reject-not-allowed" | "reject" | "never"
  /** Disponibilidade após `install()` resolver true. */
  afterInstall?: Availability
  installResult?: boolean
  /** false = instância ignora `processLocally = true` (motor que não garante local). */
  acceptsProcessLocally?: boolean
  startThrows?: boolean
}

export type FakeRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  processLocally: boolean
  onresult: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
  started: boolean
  stopped: boolean
  aborted: boolean
  configAtStart: { processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean } | null
  start: () => void
  stop: () => void
  abort: () => void
  result: (text: string, isFinal: boolean) => void
  error: (code: string) => void
  end: () => void
}

export function createFakeLocalSpeech(opts: FakeLocalSpeechOptions = {}) {
  const state = { availability: opts.availability ?? "available" }
  const instances: FakeRecognition[] = []
  const calls = { available: [] as unknown[], install: [] as unknown[] }

  class LocalRecognition {
    lang = ""
    continuous = false
    interimResults = false
    maxAlternatives = 1
    onresult: ((e: Event) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    onend: (() => void) | null = null
    started = false
    stopped = false
    aborted = false
    configAtStart: FakeRecognition["configAtStart"] = null
    #local = false

    constructor() {
      instances.push(this as unknown as FakeRecognition)
    }
    get processLocally() { return this.#local }
    set processLocally(value: boolean) { if (opts.acceptsProcessLocally !== false) this.#local = value }

    start() {
      if (opts.startThrows) throw new Error("InvalidStateError")
      this.started = true
      this.configAtStart = { processLocally: this.#local, lang: this.lang, continuous: this.continuous, interimResults: this.interimResults }
    }
    stop() { this.stopped = true }
    abort() { this.aborted = true }

    result(text: string, isFinal: boolean) {
      const results = { length: 1, 0: { length: 1, isFinal, 0: { transcript: text } } }
      this.onresult?.({ resultIndex: 0, results } as unknown as Event)
    }
    error(code: string) { this.onerror?.({ error: code } as unknown as Event) }
    end() { this.onend?.() }

    static available(options: unknown): Promise<string> {
      calls.available.push(options)
      if (state.availability === "never") return new Promise(() => {})
      if (state.availability === "reject-not-allowed") return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }))
      if (state.availability === "reject") return Promise.reject(new Error("synthetic failure"))
      return Promise.resolve(state.availability)
    }
    static install(options: unknown): Promise<boolean> {
      calls.install.push(options)
      const ok = opts.installResult ?? true
      if (ok && opts.afterInstall) state.availability = opts.afterInstall
      return Promise.resolve(ok)
    }
  }

  return { Ctor: LocalRecognition, instances, calls, state, last: () => instances[instances.length - 1] }
}

/** Reconhecimento genérico (sem API local): pode ser remoto, nunca é aceito. */
export function createGenericSpeech() {
  const instances: unknown[] = []
  class GenericRecognition {
    lang = ""
    continuous = false
    interimResults = false
    onresult = null
    onerror = null
    onend = null
    constructor() { instances.push(this) }
    start() { throw new Error("Generic engine must never start") }
    stop() {}
    abort() {}
  }
  return { Ctor: GenericRecognition, instances }
}
