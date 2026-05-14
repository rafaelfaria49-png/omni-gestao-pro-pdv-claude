export type SystemEvent =
  | "venda_criada"
  | "venda_finalizada"
  | "os_criada"
  | "os_status_alterado"
  | "os_finalizada"
  | "cliente_criado"
  /** Reservado para jobs/cron ou serviços financeiros — ainda sem emissor universal no app. */
  | "conta_receber_vencida"

export type EventPayload = {
  storeId: string
  entityId?: string
  data?: unknown
}

type Handler = (payload: EventPayload) => void

const handlersByEvent = new Map<SystemEvent, Set<Handler>>()
const wildcardHandlers = new Set<(event: SystemEvent, payload: EventPayload) => void>()

export function emitEvent(event: SystemEvent, payload: EventPayload): void {
  try {
    const set = handlersByEvent.get(event)
    if (set && set.size) {
      for (const h of set) {
        try {
          h(payload)
        } catch (e) {
          // nunca quebrar o fluxo principal por falha de automação
          console.error("[event-bus] handler failed", event, e)
        }
      }
    }
    if (wildcardHandlers.size) {
      for (const h of wildcardHandlers) {
        try {
          h(event, payload)
        } catch (e) {
          console.error("[event-bus] wildcard handler failed", event, e)
        }
      }
    }
  } catch (e) {
    console.error("[event-bus] emit failed", event, e)
  }
}

export function subscribeEvent(event: SystemEvent, handler: Handler): () => void {
  const prev = handlersByEvent.get(event) ?? new Set<Handler>()
  prev.add(handler)
  handlersByEvent.set(event, prev)
  return () => {
    const s = handlersByEvent.get(event)
    if (!s) return
    s.delete(handler)
    if (s.size === 0) handlersByEvent.delete(event)
  }
}

export function subscribeAllEvents(handler: (event: SystemEvent, payload: EventPayload) => void): () => void {
  wildcardHandlers.add(handler)
  return () => wildcardHandlers.delete(handler)
}

