/**
 * Intercept de egress externo da prova FISCAL-DRY-RUN-INTEGRITY-PROOF-005 (FASE 7-8).
 *
 * Bloqueia — ANTES da resolução de DNS ou da abertura de socket — todo tráfego para host
 * público: `fetch`, `http(s).request/get`, `net.connect/createConnection`, `tls.connect`
 * e DNS (`lookup`/`resolve`/`resolve4`/`resolve6`/`resolveAny`/`reverse`).
 *
 * Permitido apenas (allowlist explícita, mínima, testável):
 *   - loopback: `127.0.0.1`, `::1`, `localhost`;
 *   - socket de domínio unix / named pipe local (IPC);
 *   - rede Docker interna (`*.internal`) estritamente necessária ao worker XSD oficial
 *     (mesma allowlist de `lib/fiscal/xsd-worker/client.ts`).
 *
 * Nunca abre conexão externa real para provar o bloqueio: a tentativa é barrada de forma
 * síncrona (ou rejeitada, no caso do `fetch`) e registrada em `attempts`.
 *
 * Instala antes da prova e restaura no `finally` (`withNetGuard`); reinstalar enquanto ativo
 * é rejeitado para não acumular wrappers; `restore()` é idempotente.
 *
 * Notas de runtime:
 *   - `undici` externo é coberto via `globalThis.fetch` (o `fetch` global do Node é undici);
 *     não há import direto de `undici` no harness, logo não há dependência nova a interceptar.
 *   - `child_process` (javac/java do verificador externo) NÃO é rede e NÃO é interceptado.
 *   - Módulos de rede são obtidos via `createRequire` (objeto CJS mutável) — namespaces ESM
 *     são imutáveis. `fetch` é global e sobrescrito diretamente.
 */

import { createRequire } from "node:module"

const nodeRequire = createRequire(import.meta.url)

type AnyFn = (...args: unknown[]) => unknown
type HttpLikeModule = { request: AnyFn; get: AnyFn }
type NetModule = { connect: AnyFn; createConnection: AnyFn }
type TlsModule = { connect: AnyFn }
type DnsModule = {
  lookup: AnyFn
  resolve: AnyFn
  resolve4: AnyFn
  resolve6: AnyFn
  resolveAny: AnyFn
  reverse: AnyFn
}

const httpMod = nodeRequire("node:http") as HttpLikeModule
const httpsMod = nodeRequire("node:https") as HttpLikeModule
const netMod = nodeRequire("node:net") as NetModule
const tlsMod = nodeRequire("node:tls") as TlsModule
const dnsMod = nodeRequire("node:dns") as DnsModule

export type EgressChannel =
  | "fetch"
  | "http.request"
  | "http.get"
  | "https.request"
  | "https.get"
  | "net.connect"
  | "net.createConnection"
  | "tls.connect"
  | "dns.lookup"
  | "dns.resolve"
  | "dns.resolve4"
  | "dns.resolve6"
  | "dns.resolveAny"
  | "dns.reverse"

export type EgressAttempt = { channel: EgressChannel; target: string }

/** Erro lançado/rejeitado quando um canal tenta alcançar host externo durante a prova. */
export class EgressBlockedError extends Error {
  readonly channel: EgressChannel
  readonly target: string
  constructor(channel: EgressChannel, target: string) {
    super(`egress externo bloqueado na prova 005 (${channel} -> ${target || "?"})`)
    this.name = "EgressBlockedError"
    this.channel = channel
    this.target = target
  }
}

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
])

/** Loopback, socket/pipe local ou rede Docker interna do worker XSD oficial. */
export function isLoopbackTarget(target: string | undefined | null): boolean {
  if (target === undefined || target === null) return true // sem host explícito → default localhost do Node
  const host = String(target).trim().toLowerCase()
  if (host === "") return true
  if (host.startsWith("/")) return true // unix domain socket
  if (host.startsWith("\\\\.\\pipe\\") || host.startsWith("\\\\?\\pipe\\")) return true // named pipe (win)
  if (LOOPBACK_HOSTS.has(host)) return true
  if (host.endsWith(".internal")) return true // rede Docker interna (worker XSD oficial)
  return false
}

function urlHost(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function fetchTarget(input: unknown): string {
  if (typeof input === "string") return urlHost(input)
  if (input instanceof URL) return input.hostname
  if (input && typeof input === "object" && "url" in (input as Record<string, unknown>)) {
    return urlHost(String((input as { url: unknown }).url))
  }
  return "" // entrada fora do contrato de fetch → delega ao original (que lança o TypeError próprio)
}

/** Host de `http(s).request/get` (string URL, URL ou options). `socketPath` → IPC local. */
function httpTarget(args: unknown[]): string {
  const a0 = args[0]
  if (typeof a0 === "string") return urlHost(a0)
  if (a0 instanceof URL) return a0.hostname
  if (a0 && typeof a0 === "object") {
    const options = a0 as Record<string, unknown>
    if (options.socketPath) return String(options.socketPath)
    return String(options.hostname ?? options.host ?? "localhost")
  }
  return "localhost"
}

/** Host de `net.connect`/`createConnection` e `tls.connect` (port+host, path ou options). */
function socketTarget(args: unknown[]): string {
  const a0 = args[0]
  if (typeof a0 === "number") {
    const a1 = args[1]
    return typeof a1 === "string" ? a1 : "localhost"
  }
  if (typeof a0 === "string") return a0 // path (unix socket / named pipe)
  if (a0 && typeof a0 === "object") {
    const options = a0 as Record<string, unknown>
    if (options.path) return String(options.path)
    if (options.socketPath) return String(options.socketPath)
    return String(options.host ?? "localhost")
  }
  return "localhost"
}

/** Alvo do primeiro argumento de funções DNS (hostname ou IP em `reverse`). */
function dnsTarget(args: unknown[]): string {
  return String(args[0] ?? "")
}

type Originals = {
  fetch: typeof globalThis.fetch
  httpRequest: AnyFn
  httpGet: AnyFn
  httpsRequest: AnyFn
  httpsGet: AnyFn
  netConnect: AnyFn
  netCreateConnection: AnyFn
  tlsConnect: AnyFn
  dnsLookup: AnyFn
  dnsResolve: AnyFn
  dnsResolve4: AnyFn
  dnsResolve6: AnyFn
  dnsResolveAny: AnyFn
  dnsReverse: AnyFn
}

export type NetGuardHandle = {
  readonly attempts: EgressAttempt[]
  readonly active: boolean
  restore(): void
}

let activeGuard: NetGuardHandle | null = null

/** Há um guard instalado no processo? */
export function isNetGuardActive(): boolean {
  return activeGuard !== null
}

/**
 * Instala os intercepts de egress. Retorna handle com `attempts` e `restore()`.
 * Reinstalar enquanto ativo lança erro (evita acúmulo de wrappers).
 */
export function installNetGuard(): NetGuardHandle {
  if (activeGuard) {
    throw new Error(
      "net guard já está instalado — restaure antes de reinstalar (evita acúmulo de wrappers).",
    )
  }

  const attempts: EgressAttempt[] = []
  const originals: Originals = {
    fetch: globalThis.fetch,
    httpRequest: httpMod.request,
    httpGet: httpMod.get,
    httpsRequest: httpsMod.request,
    httpsGet: httpsMod.get,
    netConnect: netMod.connect,
    netCreateConnection: netMod.createConnection,
    tlsConnect: tlsMod.connect,
    dnsLookup: dnsMod.lookup,
    dnsResolve: dnsMod.resolve,
    dnsResolve4: dnsMod.resolve4,
    dnsResolve6: dnsMod.resolve6,
    dnsResolveAny: dnsMod.resolveAny,
    dnsReverse: dnsMod.reverse,
  }

  function blockSync(
    channel: EgressChannel,
    target: string,
    original: AnyFn,
    thisArg: unknown,
    args: unknown[],
  ): unknown {
    if (isLoopbackTarget(target)) return original.apply(thisArg, args)
    attempts.push({ channel, target })
    throw new EgressBlockedError(channel, target)
  }

  // fetch é assíncrono: rejeita (não lança de forma síncrona) para host externo.
  const guardedFetch = function (this: unknown, input: unknown, init?: unknown): unknown {
    const target = fetchTarget(input)
    if (isLoopbackTarget(target)) {
      return (originals.fetch as unknown as AnyFn).apply(this, [input, init])
    }
    attempts.push({ channel: "fetch", target })
    return Promise.reject(new EgressBlockedError("fetch", target))
  }
  globalThis.fetch = guardedFetch as unknown as typeof globalThis.fetch

  httpMod.request = function (this: unknown, ...args: unknown[]) {
    return blockSync("http.request", httpTarget(args), originals.httpRequest, this, args)
  }
  httpMod.get = function (this: unknown, ...args: unknown[]) {
    return blockSync("http.get", httpTarget(args), originals.httpGet, this, args)
  }
  httpsMod.request = function (this: unknown, ...args: unknown[]) {
    return blockSync("https.request", httpTarget(args), originals.httpsRequest, this, args)
  }
  httpsMod.get = function (this: unknown, ...args: unknown[]) {
    return blockSync("https.get", httpTarget(args), originals.httpsGet, this, args)
  }
  netMod.connect = function (this: unknown, ...args: unknown[]) {
    return blockSync("net.connect", socketTarget(args), originals.netConnect, this, args)
  }
  netMod.createConnection = function (this: unknown, ...args: unknown[]) {
    return blockSync("net.createConnection", socketTarget(args), originals.netCreateConnection, this, args)
  }
  tlsMod.connect = function (this: unknown, ...args: unknown[]) {
    return blockSync("tls.connect", socketTarget(args), originals.tlsConnect, this, args)
  }
  dnsMod.lookup = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.lookup", dnsTarget(args), originals.dnsLookup, this, args)
  }
  dnsMod.resolve = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.resolve", dnsTarget(args), originals.dnsResolve, this, args)
  }
  dnsMod.resolve4 = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.resolve4", dnsTarget(args), originals.dnsResolve4, this, args)
  }
  dnsMod.resolve6 = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.resolve6", dnsTarget(args), originals.dnsResolve6, this, args)
  }
  dnsMod.resolveAny = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.resolveAny", dnsTarget(args), originals.dnsResolveAny, this, args)
  }
  dnsMod.reverse = function (this: unknown, ...args: unknown[]) {
    return blockSync("dns.reverse", dnsTarget(args), originals.dnsReverse, this, args)
  }

  let restored = false
  const handle: NetGuardHandle = {
    attempts,
    get active() {
      return !restored
    },
    restore() {
      if (restored) return
      restored = true
      globalThis.fetch = originals.fetch
      httpMod.request = originals.httpRequest
      httpMod.get = originals.httpGet
      httpsMod.request = originals.httpsRequest
      httpsMod.get = originals.httpsGet
      netMod.connect = originals.netConnect
      netMod.createConnection = originals.netCreateConnection
      tlsMod.connect = originals.tlsConnect
      dnsMod.lookup = originals.dnsLookup
      dnsMod.resolve = originals.dnsResolve
      dnsMod.resolve4 = originals.dnsResolve4
      dnsMod.resolve6 = originals.dnsResolve6
      dnsMod.resolveAny = originals.dnsResolveAny
      dnsMod.reverse = originals.dnsReverse
      activeGuard = null
    },
  }
  activeGuard = handle
  return handle
}

/**
 * Executa `fn` com os intercepts instalados, restaurando SEMPRE no `finally`
 * (inclusive quando `fn` lança). Devolve o resultado e uma cópia das tentativas.
 */
export async function withNetGuard<T>(
  fn: (guard: NetGuardHandle) => Promise<T> | T,
): Promise<{ result: T; attempts: EgressAttempt[] }> {
  const guard = installNetGuard()
  try {
    const result = await fn(guard)
    return { result, attempts: [...guard.attempts] }
  } finally {
    guard.restore()
  }
}
