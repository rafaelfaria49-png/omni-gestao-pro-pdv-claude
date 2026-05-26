import { prisma } from "@/lib/prisma"
import { createOS } from "@/app/actions/operacoes"
import { listClientes, listProdutos } from "@/app/actions/cadastros"
import { buildFiltroPreset, getResumoExecutivo } from "@/lib/financeiro/services/relatorios-financeiros-service"
import { createMovimentacaoSaidaFromOmniAgent } from "@/lib/financeiro/services/movimentacoes-service"
import { omniAgentAuditMetadata } from "@/lib/omni-agent/audit-log"
import type { OmniAgentInterpretacao, OmniAgentExecutorResult } from "./types"
import type { EventoTimeline, OrdemServico } from "@/types/os"
import { CHECKLIST_PADRAO } from "@/types/os"

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

function matchClientes(query: string, storeId: string): Promise<{ id: string; nome: string; telefone: string }[]> {
  return listClientes(storeId).then((rows) => {
    const q = norm(query)
    if (!q) return []
    return rows
      .filter((c) => norm(c.nome).includes(q) || norm(c.telefone).replace(/\D/g, "").includes(q.replace(/\D/g, "")))
      .slice(0, 8)
      .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone }))
  })
}

function matchProdutos(query: string, storeId: string) {
  return listProdutos(storeId).then((rows) => {
    const q = norm(query)
    if (!q) return []
    return rows
      .filter((p) => norm(p.nome).includes(q) || norm(p.sku || "").includes(q))
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        estoque: p.estoque,
        preco: p.preco,
      }))
  })
}

function defaultChecklist() {
  return CHECKLIST_PADRAO.map((c) => ({ ...c, estado: "nao_testado" as const }))
}

function criacaoTimeline(): EventoTimeline[] {
  const now = new Date().toISOString()
  return [
    {
      id: `ev_omni_${Date.now()}`,
      tipo: "criacao",
      autor: "Omni Agent HUB",
      autorTipo: "sistema",
      conteudo: "OS criada via comando Omni Agent (Fase 1).",
      criadoEm: now,
    },
  ]
}

function buildMinimalOSPayload(
  storeId: string,
  cliente: { id: string; nome: string; telefone?: string },
  equip: { marca: string; modelo: string; defeito: string },
): Omit<OrdemServico, "id" | "codigo" | "criadoEm" | "atualizadoEm"> {
  const prazoMs = 48 * 3600 * 1000
  const tipo = "Smartphone"
  const marca = equip.marca.trim() || "—"
  const modelo = equip.modelo.trim() || "—"
  return {
    storeId,
    clienteId: cliente.id,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      whatsapp: cliente.telefone,
    },
    equipamento: {
      id: `eq_agent_${Date.now()}`,
      tipo,
      marca,
      modelo,
      defeitoRelatado: equip.defeito,
      acessorios: [],
    },
    status: "aberta",
    prioridade: "media",
    origem: "balcao",
    sla: { prazo: new Date(Date.now() + prazoMs).toISOString(), status: "ok" },
    pecas: [],
    observacoes: [],
    anexos: [],
    garantia: { ativa: false },
    checklist: defaultChecklist(),
    servicosCatalogo: [],
    timeline: criacaoTimeline(),
  }
}

export type OmniAgentExecutorWideResult = OmniAgentExecutorResult | { ok: false; actionLabel: string; error: string; ambiguousClientes?: { id: string; nome: string; telefone: string }[] }

export async function executeOmniAgentIntent(
  storeId: string,
  interp: OmniAgentInterpretacao,
  opts?: { clienteId?: string; commandId?: string },
): Promise<OmniAgentExecutorWideResult> {
  const { intent, fields } = interp

  try {
    if (intent === "UNKNOWN") {
      return {
        ok: false,
        actionLabel: interp.action,
        error:
          "Sem correspondência automática. Reformule ou use a Inbox para triagem manual (ex.: abrir OS para [nome], buscar cliente, financeiro hoje).",
      }
    }

    if (intent === "CLIENT_SEARCH") {
      const query = (fields.query ?? "").trim()
      const matches = await matchClientes(query, storeId)
      return {
        ok: true,
        actionLabel: interp.action,
        payload: { query, total: matches.length, clientes: matches },
      }
    }

    if (intent === "PRODUCT_SEARCH") {
      const query = (fields.query ?? "").trim()
      const produtos = await matchProdutos(query, storeId)
      return {
        ok: true,
        actionLabel: interp.action,
        payload: { query, total: produtos.length, produtos },
      }
    }

    if (intent === "CASHBOX_QUERY") {
      const aberta = await prisma.sessaoCaixa.findFirst({
        where: { storeId, status: "ABERTA" },
        orderBy: { abertaEm: "desc" },
        select: {
          id: true,
          operador: true,
          saldoInicial: true,
          abertaEm: true,
          status: true,
          _count: { select: { operacoes: true } },
        },
      })
      return {
        ok: true,
        actionLabel: interp.action,
        payload: {
          sessaoAberta: aberta,
          mensagem: aberta
            ? `Caixa aberto desde ${aberta.abertaEm.toISOString()}; saldo inicial R$ ${Number(aberta.saldoInicial).toFixed(2)}; ${aberta._count.operacoes} operações registradas.`
            : "Nenhuma sessão de caixa aberta para esta unidade.",
        },
      }
    }

    if (intent === "FINANCE_SUMMARY") {
      const preset = (fields.preset ?? "hoje").trim() || "hoje"
      const filtro = buildFiltroPreset(preset)
      const resumo = await getResumoExecutivo(storeId, filtro)
      return {
        ok: true,
        actionLabel: interp.action,
        payload: {
          periodo: resumo.periodo,
          indicadores: resumo.indicadores,
          topReceitas: resumo.topReceitas.slice(0, 5),
          topDespesas: resumo.topDespesas.slice(0, 5),
        },
      }
    }

    if (intent === "EXPENSE_CREATE") {
      const commandId = (opts?.commandId ?? "").trim()
      if (!commandId) {
        return {
          ok: false,
          actionLabel: interp.action,
          error: "ID do comando obrigatório para lançar despesa (confirme pela Inbox).",
        }
      }
      const valor = Number.parseFloat(String(fields.valor ?? "").replace(",", "."))
      if (!Number.isFinite(valor) || valor <= 0) {
        return { ok: false, actionLabel: interp.action, error: "Valor da despesa inválido." }
      }
      const descricao = String(fields.descricao ?? "").trim() || "Despesa"
      const categoria = String(fields.categoria ?? "").trim()

      const mov = await createMovimentacaoSaidaFromOmniAgent({
        storeId,
        commandId,
        valor,
        descricao,
        categoria: categoria || undefined,
      })

      if (!mov.ok) {
        return { ok: false, actionLabel: interp.action, error: mov.reason }
      }

      const movimentacaoId =
        mov.action === "created"
          ? mov.movimentacao.id
          : (
              await prisma.movimentacaoFinanceira.findFirst({
                where: {
                  storeId,
                  referenciaId: commandId,
                  tipo: "saida",
                  origem: "omni_agent",
                },
                select: { id: true, valor: true, descricao: true },
              })
            )?.id

      await prisma.logsAuditoria.create({
        data: {
          action: "OMNI_AGENT_DESPESA",
          userLabel: "Omni Agent HUB",
          detail: `Despesa R$ ${valor.toFixed(2)} — ${descricao}`.slice(0, 4000),
          metadata: omniAgentAuditMetadata(storeId, {
            commandId,
            movimentacaoId,
            valor,
            descricao,
            categoria: categoria || null,
            idempotent: mov.action === "skipped_idempotent",
          }),
          source: "omni_agent",
        },
      })

      return {
        ok: true,
        actionLabel: interp.action,
        payload: {
          movimentacaoId,
          valor,
          descricao,
          categoria: categoria || undefined,
          tipo: "saida",
          origem: "omni_agent",
          idempotentReplay: mov.action === "skipped_idempotent",
        },
      }
    }

    if (intent === "REMINDER_CREATE") {
      const titulo = (fields.titulo ?? fields.detalhe ?? "Lembrete").slice(0, 200)
      const detalhe = (fields.detalhe ?? titulo).slice(0, 2000)
      const sid = storeId.trim()
      if (!sid) {
        return { ok: false, actionLabel: interp.action, error: "Unidade ativa obrigatória." }
      }
      await prisma.logsAuditoria.create({
        data: {
          action: "OMNI_AGENT_LEMBRETE",
          userLabel: "Omni Agent HUB",
          detail: titulo,
          metadata: omniAgentAuditMetadata(sid, { detalhe, source: "omni_agent_fase1" }),
          source: "omni_agent",
        },
      })
      return {
        ok: true,
        actionLabel: interp.action,
        payload: { titulo, registradoEmAuditoria: true },
      }
    }

    if (intent === "OS_OPEN") {
      const nome = (fields.clienteNome ?? "").trim()
      if (!nome) {
        return { ok: false, actionLabel: interp.action, error: "Informe o nome do cliente (ex.: “abrir OS para João”)." }
      }
      let cliente: { id: string; nome: string; telefone: string } | undefined
      if (opts?.clienteId) {
        const rows = await listClientes(storeId)
        const found = rows.find((c) => c.id === opts.clienteId)
        if (!found) return { ok: false, actionLabel: interp.action, error: "Cliente selecionado não encontrado." }
        cliente = { id: found.id, nome: found.nome, telefone: found.telefone }
      } else {
        const matches = await matchClientes(nome, storeId)
        if (matches.length === 0) {
          return {
            ok: false,
            actionLabel: interp.action,
            error: `Nenhum cliente encontrado para “${nome}”. Cadastre o cliente no Cadastros HUB ou refine o nome.`,
          }
        }
        if (matches.length > 1) {
          return {
            ok: false,
            actionLabel: interp.action,
            error: "Múltiplos clientes correspondem à busca. Confirme escolhendo o cliente na lista.",
            ambiguousClientes: matches,
          }
        }
        cliente = matches[0]!
      }
      const marca = (fields.marca ?? "").trim() || "—"
      const modelo = (fields.modelo ?? "").trim() || "—"
      const defeito = (fields.defeito ?? "").trim() || "a definir pelo técnico"
      const osInput = buildMinimalOSPayload(storeId, cliente, { marca, modelo, defeito })
      const created = await createOS(storeId, osInput as Parameters<typeof createOS>[1])
      return {
        ok: true,
        actionLabel: interp.action,
        payload: { osId: created.id, codigo: created.codigo, clienteId: cliente.id },
      }
    }

    return { ok: false, actionLabel: interp.action, error: "Intenção não suportada nesta fase." }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, actionLabel: interp.action, error: msg }
  }
}
