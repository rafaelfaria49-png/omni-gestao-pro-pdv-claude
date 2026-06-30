/**
 * OPS-V4-REMOVE-DEMO-DATA — garantias de honestidade da Operações V4 Preview.
 *
 * 1) Nenhum dado fabricado (clientes, OS, técnicos, "Unidade Centro", "dados
 *    demonstrativos") permanece no código-fonte da Preview — varre os arquivos
 *    reais do diretório (exceto os próprios testes).
 * 2) "Abrir OS" na Preview NÃO cria OS e NUNCA abre/seleciona uma OS existente por
 *    fallback: limpa a seleção, fecha o modal e avisa de forma honesta — prevenindo
 *    o bug em que cadastrar um cliente e clicar "Abrir OS" revelava a OS aberta atrás
 *    do modal (ex.: a OS real de outro cliente).
 *
 * O encadeamento de server actions (→ Prisma) é cortado por mock: `buildVals` é uma
 * função pura e não exercita os hooks de leitura — só precisamos do comportamento local.
 */
import { describe, it, expect, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, extname } from "node:path"

vi.mock("@/app/actions/ordens", () => ({
  listOrdens: vi.fn(async () => []),
  getOrdem: vi.fn(async () => null),
}))

import { buildVals, type V4DataCtx } from "./use-v4-preview"
import type { V4State } from "./types"
import type { OrdemServico } from "@/types/os"

const DIR = dirname(fileURLToPath(import.meta.url))

/** Coleta recursivamente os .ts/.tsx de origem da Preview, ignorando os próprios testes. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    const ext = extname(name)
    if (ext !== ".ts" && ext !== ".tsx") continue
    if (/\.test\.tsx?$/.test(name)) continue
    out.push(full)
  }
  return out
}

/** Dados fabricados que NÃO podem aparecer na UI operacional da Preview. */
const FAKE_TERMS = [
  // clientes / técnicos demonstrativos
  "Pedro Lima",
  "Sofia Dias",
  "Caio Moraes",
  "Marcos Teles",
  "Mariana Lima",
  "Tiago Reis",
  "Bruno Alves",
  "Carla Menezes",
  "Rafael Pinto",
  "Mariana Costa Lima",
  "Carlos Eduardo Souza",
  "Beatriz Almeida",
  // OS fabricadas
  "OS-0473",
  "OS-0469",
  "OS-0480",
  "OS-0485",
  "OS-0481",
  "OS-0478",
  // unidade / rótulos fabricados
  "Unidade Centro",
  "dados demonstrativos",
]

describe("Operações V4 Preview — sem dados fabricados no código-fonte", () => {
  const files = collectSourceFiles(DIR)

  it("encontra os arquivos de origem da Preview", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const term of FAKE_TERMS) {
    it(`não contém o dado fake "${term}"`, () => {
      const offenders = files.filter((f) => readFileSync(f, "utf8").includes(term))
      expect(offenders, `"${term}" encontrado em: ${offenders.join(", ")}`).toEqual([])
    })
  }
})

function makeState(over: Partial<V4State> = {}): V4State {
  return {
    view: "cockpit",
    module: "workspace",
    stage: "execucao",
    status: "em_execucao",
    left: true,
    right: true,
    menu: null,
    toast: "",
    prioridade: "alta",
    histFilter: "todos",
    novaOS: true,
    novaTab: "novo",
    novaEquip: "celular",
    novaOrigem: "balcao",
    recibo: false,
    selectedOsId: null,
    focus: false,
    authState: "autorizado",
    pin4: 3,
    pin6: 3,
    pattern: [0, 3, 4, 7],
    senha: "",
    motivo: "",
    ...over,
  }
}

const ctx: V4DataCtx = {
  ordens: [],
  ordensLoading: false,
  ordensPrimeiraCarga: false,
  ordensError: null,
  reloadOrdens: () => {},
  realOS: null,
  detailLoading: false,
}

describe("Operações V4 Preview — Nova OS honesta (bug Ariane → Eudis)", () => {
  it("abrirOS limpa a seleção, fecha o modal e avisa que nenhuma OS foi criada", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    // Simula uma OS existente já aberta atrás do modal (ex.: a OS real de outro cliente).
    const st = makeState({ selectedOsId: "os-existente-de-outro-cliente", novaOS: true })
    const v = buildVals(
      st,
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctx,
    )

    v.abrirOS()

    // Fecha o modal E zera a seleção — não revela a OS que estava atrás dele.
    expect(patches).toContainEqual({ novaOS: false, selectedOsId: null })
    // Nunca seleciona/abre uma OS existente por fallback: todo patch de seleção é null.
    for (const p of patches) {
      if (p && typeof p === "object" && "selectedOsId" in p) {
        expect(p.selectedOsId).toBeNull()
      }
    }
    // Mensagem honesta e específica (a Preview não cria OS).
    expect(msgs).toContain("Indisponível na Preview — nenhuma OS foi criada.")
  })

  it("osSelected só é verdadeiro com uma OS explicitamente selecionada", () => {
    const semOs = buildVals(makeState({ selectedOsId: null }), () => {}, () => {}, ctx)
    expect(semOs.osSelected).toBe(false)

    const comOs = buildVals(makeState({ selectedOsId: "os-1" }), () => {}, () => {}, ctx)
    expect(comOs.osSelected).toBe(true)
  })
})

function mkOS(p: Record<string, unknown> & { id: string }): OrdemServico {
  return p as unknown as OrdemServico
}

describe("Operações V4 Preview — telas de rail com identidade real (read-only)", () => {
  const ordens = [
    mkOS({ id: "a", status: "aberta", codigo: "OS-A", cliente: { nome: "Cliente A" } }),
    mkOS({ id: "b", status: "em_execucao", codigo: "OS-B", tecnico: { nome: "Ana" } }),
    mkOS({ id: "c", status: "entregue", codigo: "OS-C" }),
  ]
  const ctxReal: V4DataCtx = { ...ctx, ordens }

  it("expõe moduleId espelhando o módulo do estado", () => {
    const v = buildVals(makeState({ module: "fila", novaOS: false }), () => {}, () => {}, ctxReal)
    expect(v.moduleId).toBe("fila")
  })

  it("dashboard/fila derivam da lista real; fila exclui finalizadas", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxReal)
    expect(v.dashboardResumo.temDados).toBe(true)
    expect(v.dashboardResumo.total).toBe(3)
    expect(v.filaItens.map((r) => r.id)).toEqual(["a", "b"]) // "c" (entregue) fora
  })

  it("rails ficam com temDados=false quando não há base real (empty honesto)", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctx) // ctx.ordens = []
    expect(v.dashboardResumo.temDados).toBe(false)
    expect(v.filaItens).toEqual([])
    expect(v.bancadaView.temDados).toBe(false)
    expect(v.slaView.temDados).toBe(false)
    expect(v.pdvView.temDados).toBe(false)
  })

  it("openOSFromRail seleciona a OS por id explícito; id inexistente é no-op", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctxReal)

    v.openOSFromRail("b")
    expect(patches.at(-1)).toMatchObject({ selectedOsId: "b", module: "workspace" })

    const antes = patches.length
    v.openOSFromRail("inexistente")
    expect(patches.length).toBe(antes) // nada selecionado por fallback
  })

  it("goToOSSearch limpa a seleção (leva ao seletor de OS, sem auto-abrir)", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ selectedOsId: "x", novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctxReal)
    v.goToOSSearch()
    expect(patches.at(-1)).toMatchObject({ selectedOsId: null, module: "workspace" })
  })
})

describe("Operações V4 Preview — Modo foco e Segurança (preview/no-op)", () => {
  it("onFoco recolhe rail + as duas gavetas de uma vez", () => {
    const patches: Array<Record<string, unknown>> = []
    let st = makeState({ focus: false, left: true, right: true, novaOS: false })
    const v = buildVals(st, (p) => patches.push(typeof p === "function" ? p(st) : (p as Record<string, unknown>)), () => {}, ctx)
    v.onFoco()
    // ativar foco fecha as duas laterais (o rail é ocultado no componente raiz por focusActive)
    expect(patches.at(-1)).toMatchObject({ focus: true, left: false, right: false })
  })

  it("goSeguranca leva à superfície seguranca; backFromSeguranca volta à Execução", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctx)
    v.goSeguranca()
    expect(patches.at(-1)).toMatchObject({ stage: "seguranca" })
    v.backFromSeguranca()
    expect(patches.at(-1)).toMatchObject({ stage: "execucao" })
  })

  it("Autorizar é no-op honesto: avisa que nada é autenticado nem salvo", () => {
    const msgs: string[] = []
    const v = buildVals(makeState({ stage: "seguranca", novaOS: false }), () => {}, (m) => msgs.push(m), ctx)
    v.seg.onAutorizar()
    expect(msgs.some((m) => /demonstra|preview/i.test(m))).toBe(true)
    // isSeg reflete a superfície ativa
    expect(v.isSeg).toBe(true)
  })
})
