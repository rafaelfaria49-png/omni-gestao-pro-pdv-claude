import { describe, expect, it, vi } from "vitest"

// Flag OFF: nenhuma operação pode tocar sessão ou banco. Prisma e auth viram armadilhas.
const toques = vi.hoisted(() => ({ banco: 0, sessao: 0 }))
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get(_t, p) { toques.banco += 1; throw new Error("DB_TOCADO:" + String(p)) } }),
}))
vi.mock("@/auth", () => ({ auth: async () => { toques.sessao += 1; return { user: { id: "usuario-0001" } } } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "loja-000001" }) }) }))

import * as actions from "@/app/actions/pessoas"
import { GET as listarDocumentosRoute } from "@/app/api/pessoas/documentos/route"
import { POST as downloadRoute } from "@/app/api/pessoas/documentos/[id]/download/route"
import { POST as completeRoute } from "@/app/api/pessoas/documentos/complete/route"
import { POST as intentRoute } from "@/app/api/pessoas/documentos/upload-intent/route"
import * as admin from "./admin"
import * as cadastro from "./cadastro"
import * as documentos from "./documentos/service"

describe("Pessoas: flag OFF", () => {
  it("recusa todas as operações antes de sessão e banco", async () => {
    const anterior = process.env.PESSOAS_DP_ENABLED
    try {
      for (const valor of [undefined, "", "off", "ON", "true", "1"]) {
        if (valor === undefined) delete process.env.PESSOAS_DP_ENABLED
        else process.env.PESSOAS_DP_ENABLED = valor
        const E = "empregador-0001", V = "vinculo-00001", D = "documento-0001"
        const operacoes: Array<() => Promise<unknown>> = [
          () => admin.criarEmpregador({} as never), () => admin.listarEmpregadores(), () => admin.obterEmpregador(E),
          () => admin.atualizarEmpregador({ empregadorId: E } as never), () => admin.criarEstabelecimento({ empregadorId: E } as never),
          () => admin.atualizarEstabelecimento({ empregadorId: E } as never), () => admin.vincularUnidade({ empregadorId: E } as never),
          () => admin.concederAcesso({ empregadorId: E } as never), () => admin.revogarAcesso({ empregadorId: E } as never),
          () => cadastro.criarFuncionario({ empregadorId: E } as never), () => cadastro.listarFuncionarios(E),
          () => cadastro.obterFuncionario(E, V), () => cadastro.atualizarDadosPessoais({ empregadorId: E } as never),
          () => cadastro.completarVinculoRascunho({ empregadorId: E } as never),
          () => cadastro.criarVersaoContrato({ empregadorId: E } as never), () => cadastro.arquivarVinculo({ empregadorId: E } as never),
          () => cadastro.listarHistorico(E, V), () => cadastro.vincularIdentidade({ empregadorId: E } as never),
          () => documentos.criarUploadIntent({ empregadorId: E } as never), () => documentos.listarDocumentos(E, V),
          () => documentos.autorizarDownload(E, D),
        ]
        for (const operacao of operacoes) {
          await expect(operacao()).rejects.toMatchObject({ code: "PESSOAS_DESABILITADO", status: 404 })
        }
        const respostas = [
          await listarDocumentosRoute(new Request(`http://x/api/pessoas/documentos?empregadorId=${E}&vinculoId=${V}`)),
          await intentRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ empregadorId: E }) })),
          await downloadRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ empregadorId: E }) }),
            { params: Promise.resolve({ id: D }) }),
        ]
        for (const r of respostas) {
          expect(r.status).toBe(404)
          expect(r.headers.get("cache-control")).toContain("no-store")
        }
        // complete valida o intent assinado antes da flag; segue sem tocar sessão/banco.
        const complete = await completeRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ uploadIntent: "a.b" }) }))
        expect([403, 404, 503]).toContain(complete.status)
        expect(await actions.listarEmpregadores()).toEqual({ ok: false, code: "PESSOAS_DESABILITADO" })
        expect(toques).toEqual({ banco: 0, sessao: 0 })
      }
    } finally {
      if (anterior === undefined) delete process.env.PESSOAS_DP_ENABLED
      else process.env.PESSOAS_DP_ENABLED = anterior
    }
  })
})
