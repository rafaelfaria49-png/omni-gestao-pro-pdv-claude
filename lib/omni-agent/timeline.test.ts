import { describe, expect, it } from "vitest"
import {
  aggregateOmniAgentTimeline,
  mapClienteCadastradoEvent,
  mapCommandToTimelineEvent,
  mapConfigAuditToTimelineEvent,
  mapMemoryToTimelineEvent,
  mapOSEventToTimelineEvent,
  mapOSFallbackCreationEvent,
  OMNI_TIMELINE_MAX_PAGE_SIZE,
  type OmniTimelineEvent,
} from "./timeline"
import type { OmniAgentMemoryDTO } from "./memory"

function memoryDto(overrides: Partial<OmniAgentMemoryDTO> = {}): OmniAgentMemoryDTO {
  return {
    id: "mem-1",
    storeId: "loja-a",
    clienteId: "cli-1",
    tipo: "nota",
    titulo: "Título",
    conteudo: "Conteúdo",
    tags: [],
    origem: "manual",
    criadoPor: "Operador",
    status: "ativo",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  }
}

describe("mapMemoryToTimelineEvent", () => {
  it("mapeia memória ativa com origem/tipo/prioridade coerentes", () => {
    const ev = mapMemoryToTimelineEvent(memoryDto({ tipo: "incidente" }))
    expect(ev.origem).toBe("memoria")
    expect(ev.tipo).toBe("memoria_criada")
    expect(ev.prioridade).toBe("alta")
    expect(ev.clienteId).toBe("cli-1")
    expect(ev.referencia).toEqual({ kind: "omni_agent_memory", id: "mem-1" })
  })

  it("memória arquivada vira tipo memoria_arquivada e usa updatedAt como data", () => {
    const ev = mapMemoryToTimelineEvent(
      memoryDto({ status: "arquivado", updatedAt: "2026-07-02T10:00:00.000Z" }),
    )
    expect(ev.tipo).toBe("memoria_arquivada")
    expect(ev.data).toBe("2026-07-02T10:00:00.000Z")
  })
})

describe("mapCommandToTimelineEvent", () => {
  it("deriva tipo pelo status e extrai clienteId do resultado quando presente (OS_OPEN)", () => {
    const ev = mapCommandToTimelineEvent({
      id: "cmd-1",
      storeId: "loja-a",
      canal: "whatsapp",
      comandoOriginal: "abrir OS para Maria",
      interpretacao: { intent: "OS_OPEN", action: "Abrir ordem de serviço" },
      status: "EXECUTADO",
      resultado: { clienteId: "cli-9", osId: "os-1" },
      executadoEm: "2026-07-01T11:00:00.000Z",
      createdAt: "2026-07-01T10:59:00.000Z",
    })
    expect(ev.tipo).toBe("comando_executado")
    expect(ev.clienteId).toBe("cli-9")
    expect(ev.responsavel).toBe("WhatsApp")
    expect(ev.data).toBe("2026-07-01T11:00:00.000Z")
  })

  it("sem clienteId no resultado, evento fica sem cliente (loja-wide)", () => {
    const ev = mapCommandToTimelineEvent({
      id: "cmd-2",
      storeId: "loja-a",
      canal: "texto_interno",
      comandoOriginal: "financeiro hoje",
      interpretacao: { intent: "FINANCE_SUMMARY", action: "Resumo financeiro" },
      status: "EXECUTADO",
      resultado: {},
      executadoEm: null,
      createdAt: "2026-07-01T09:00:00.000Z",
    })
    expect(ev.clienteId).toBeNull()
    expect(ev.data).toBe("2026-07-01T09:00:00.000Z")
  })

  it("status ERRO vira prioridade alta; AGUARDANDO_CONFIRMACAO vira média", () => {
    const erro = mapCommandToTimelineEvent({
      id: "cmd-3",
      storeId: "loja-a",
      canal: "texto_interno",
      comandoOriginal: "x",
      interpretacao: { intent: "UNKNOWN", action: "x" },
      status: "ERRO",
      resultado: null,
      executadoEm: null,
      createdAt: "2026-07-01T09:00:00.000Z",
    })
    expect(erro.tipo).toBe("comando_erro")
    expect(erro.prioridade).toBe("alta")

    const aguardando = mapCommandToTimelineEvent({
      id: "cmd-4",
      storeId: "loja-a",
      canal: "texto_interno",
      comandoOriginal: "x",
      interpretacao: { intent: "OS_OPEN", action: "x" },
      status: "AGUARDANDO_CONFIRMACAO",
      resultado: null,
      executadoEm: null,
      createdAt: "2026-07-01T09:00:00.000Z",
    })
    expect(aguardando.tipo).toBe("comando_aguardando_confirmacao")
    expect(aguardando.prioridade).toBe("media")
  })
})

describe("mapConfigAuditToTimelineEvent / mapClienteCadastradoEvent", () => {
  it("evento de configuração nunca tem cliente associado", () => {
    const ev = mapConfigAuditToTimelineEvent({
      id: "log-1",
      storeId: "loja-a",
      action: "OMNI_AGENT_CONFIG_SAVE",
      detail: "Configuração do agente atualizada",
      createdAt: "2026-07-01T08:00:00.000Z",
    })
    expect(ev.clienteId).toBeNull()
    expect(ev.origem).toBe("auditoria")
  })

  it("cliente cadastrado usa nome e createdAt reais, sem inventar conteúdo", () => {
    const ev = mapClienteCadastradoEvent({
      id: "cli-1",
      storeId: "loja-a",
      nome: "Maria Silva",
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    expect(ev.descricao).toBe("Maria Silva")
    expect(ev.data).toBe("2026-01-01T00:00:00.000Z")
  })
})

describe("mapOSEventToTimelineEvent / mapOSFallbackCreationEvent", () => {
  it("usa o evento real do payload.timeline quando existe", () => {
    const ev = mapOSEventToTimelineEvent({
      storeId: "loja-a",
      clienteId: "cli-1",
      osId: "os-1",
      osNumero: "OS-100",
      evento: {
        id: "ev1",
        tipo: "servico_concluido",
        autor: "Técnico João",
        conteudo: "Troca de tela concluída.",
        criadoEm: "2026-07-01T12:00:00.000Z",
      },
    })
    expect(ev.titulo).toBe("Serviço concluído")
    expect(ev.responsavel).toBe("Técnico João")
    expect(ev.referencia).toEqual({ kind: "ordem_servico", id: "os-1" })
  })

  it("tipo desconhecido cai para label humanizado a partir do próprio tipo", () => {
    const ev = mapOSEventToTimelineEvent({
      storeId: "loja-a",
      clienteId: null,
      osId: "os-2",
      osNumero: null,
      evento: { id: "ev2", tipo: "algo_novo_futuro", autor: "Sistema", conteudo: "x", criadoEm: "2026-07-01T00:00:00.000Z" },
    })
    expect(ev.titulo).toBe("algo novo futuro")
  })

  it("fallback de criação é usado quando a OS não tem timeline (ex.: importação legada)", () => {
    const ev = mapOSFallbackCreationEvent({
      storeId: "loja-a",
      clienteId: "cli-1",
      osId: "os-3",
      osNumero: "OS-3",
      createdAt: "2026-06-01T00:00:00.000Z",
    })
    expect(ev.tipo).toBe("os_criacao")
    expect(ev.descricao).toBe("OS OS-3")
  })
})

describe("aggregateOmniAgentTimeline", () => {
  function ev(overrides: Partial<OmniTimelineEvent>): OmniTimelineEvent {
    return {
      id: overrides.id ?? "e",
      storeId: "loja-a",
      clienteId: null,
      origem: "memoria",
      tipo: "memoria_criada",
      titulo: "T",
      descricao: "D",
      referencia: null,
      data: "2026-07-01T00:00:00.000Z",
      responsavel: "x",
      icone: "brain",
      prioridade: "baixa",
      payloadResumo: null,
      ...overrides,
    }
  }

  it("timeline vazia retorna page vazia sem erro", () => {
    const page = aggregateOmniAgentTimeline([])
    expect(page).toEqual({ events: [], total: 0, page: 1, pageSize: 30, hasMore: false })
  })

  it("ordena por data desc entre múltiplas origens", () => {
    const events = [
      ev({ id: "a", origem: "memoria", data: "2026-07-01T00:00:00.000Z" }),
      ev({ id: "b", origem: "comando", data: "2026-07-03T00:00:00.000Z" }),
      ev({ id: "c", origem: "ordem_servico", data: "2026-07-02T00:00:00.000Z" }),
    ]
    const page = aggregateOmniAgentTimeline(events)
    expect(page.events.map((e) => e.id)).toEqual(["b", "c", "a"])
  })

  it("filtra por clienteId, nunca cruzando cliente", () => {
    const events = [
      ev({ id: "a", clienteId: "cli-1" }),
      ev({ id: "b", clienteId: "cli-2" }),
      ev({ id: "c", clienteId: null }),
    ]
    const page = aggregateOmniAgentTimeline(events, { clienteId: "cli-1" })
    expect(page.events.map((e) => e.id)).toEqual(["a"])
  })

  it("filtra por origem e por tipo", () => {
    const events = [
      ev({ id: "a", origem: "memoria", tipo: "memoria_criada" }),
      ev({ id: "b", origem: "comando", tipo: "comando_executado" }),
      ev({ id: "c", origem: "memoria", tipo: "memoria_arquivada" }),
    ]
    expect(aggregateOmniAgentTimeline(events, { origens: ["comando"] }).events.map((e) => e.id)).toEqual(["b"])
    expect(aggregateOmniAgentTimeline(events, { tipos: ["memoria_arquivada"] }).events.map((e) => e.id)).toEqual(["c"])
  })

  it("filtra por período (de/ate)", () => {
    const events = [
      ev({ id: "a", data: "2026-06-01T00:00:00.000Z" }),
      ev({ id: "b", data: "2026-07-01T00:00:00.000Z" }),
      ev({ id: "c", data: "2026-08-01T00:00:00.000Z" }),
    ]
    const page = aggregateOmniAgentTimeline(events, { de: "2026-06-15T00:00:00.000Z", ate: "2026-07-15T00:00:00.000Z" })
    expect(page.events.map((e) => e.id)).toEqual(["b"])
  })

  it("busca por termo no título ou na descrição, case-insensitive", () => {
    const events = [
      ev({ id: "a", titulo: "Prefere PIX", descricao: "x" }),
      ev({ id: "b", titulo: "Outro", descricao: "prefere pix também" }),
      ev({ id: "c", titulo: "Nada a ver", descricao: "y" }),
    ]
    const page = aggregateOmniAgentTimeline(events, { q: "pix" })
    expect(page.events.map((e) => e.id).sort()).toEqual(["a", "b"])
  })

  it("pagina resultados e informa hasMore corretamente", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ id: `e${i}`, data: new Date(2026, 0, i + 1).toISOString() }),
    )
    const page1 = aggregateOmniAgentTimeline(events, { page: 1, pageSize: 2 })
    expect(page1.events).toHaveLength(2)
    expect(page1.total).toBe(5)
    expect(page1.hasMore).toBe(true)

    const page3 = aggregateOmniAgentTimeline(events, { page: 3, pageSize: 2 })
    expect(page3.events).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
  })

  it("pageSize é limitado a OMNI_TIMELINE_MAX_PAGE_SIZE", () => {
    const events = Array.from({ length: 5 }, (_, i) => ev({ id: `e${i}` }))
    const page = aggregateOmniAgentTimeline(events, { pageSize: 99999 })
    expect(page.pageSize).toBe(OMNI_TIMELINE_MAX_PAGE_SIZE)
  })

  it("combina múltiplas origens no mesmo resultado ordenado", () => {
    const events = [
      ev({ id: "mem", origem: "memoria", data: "2026-07-01T00:00:00.000Z" }),
      ev({ id: "cmd", origem: "comando", data: "2026-07-02T00:00:00.000Z" }),
      ev({ id: "aud", origem: "auditoria", data: "2026-07-03T00:00:00.000Z" }),
      ev({ id: "os", origem: "ordem_servico", data: "2026-07-04T00:00:00.000Z" }),
      ev({ id: "cli", origem: "cliente", data: "2026-07-05T00:00:00.000Z" }),
    ]
    const page = aggregateOmniAgentTimeline(events)
    expect(page.total).toBe(5)
    expect(page.events.map((e) => e.origem)).toEqual(["cliente", "ordem_servico", "auditoria", "comando", "memoria"])
  })
})
