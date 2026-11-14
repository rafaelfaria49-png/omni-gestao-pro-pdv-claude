/**
 * COMPAT-PROFISSIONAL-001 — cliente HTTP (browser) do Compat. Toda escrita leva a loja ativa
 * EXPLÍCITA no header (o servidor recusa escrita sem ela). Nada é guardado em localStorage:
 * a fonte da verdade é o servidor.
 */

import { call, headers } from "@/lib/catalogo-aparelhos/loja-catalogo-client"
import type { HierarquiaAparelho } from "@/lib/catalogo-aparelhos/hierarquia"
import type { LojaCompatCategoria, LojaCompatStatus } from "@/lib/catalogo-aparelhos/loja-catalogo"
import type { PeliculaGrupo } from "@/lib/catalogo-aparelhos/peliculas"
import type { AcessorioModoCaptura } from "@/lib/acessorios/types"
import type { CorEfetiva, CorLoja } from "./cores-loja"
import type { CompatPreferencias } from "./organizacao"
import type { RelatorioCapinhas } from "./capinhas"

type Loja = string | null | undefined

const get = <T>(loja: Loja, url: string) => call<T>(url, { method: "GET", headers: headers(loja) })
const send = <T>(loja: Loja, url: string, method: string, body?: unknown) =>
  call<T>(url, {
    method,
    headers: headers(loja, body !== undefined),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

// ── Tipos de resposta ───────────────────────────────────────────────────────

export interface FileiraDTO {
  id: string
  painelId: string
  nome: string
  descricao: string
  ordem: number
  ativo: boolean
  version: number
  localizacoes: number
}
export interface PainelDTO extends Omit<FileiraDTO, "painelId"> {
  fileiras: FileiraDTO[]
}

export interface ModeloCompatDTO {
  modelKey: string
  canonicalName: string
  brand: string
  source: "global" | "loja"
  active: boolean
  hierarquia: HierarquiaAparelho
  aliases: string[]
}

export interface VinculoDTO {
  modelKey: string
  canonicalName: string
  brand: string
  source: "global" | "loja" | null
  ativo: boolean
  acao: "adicionar" | "suprimir"
  status: LojaCompatStatus
  notes: string
  origem: string
  confirmedBy: string
  confirmedAt: string | null
}

export interface LocalizacaoDTO {
  id: string
  modelKey: string
  produtoId: string | null
  painelId: string
  painelNome: string
  painelAtivo: boolean
  fileiraId: string | null
  fileiraNome: string | null
  fileiraAtiva: boolean
  posicao: string
  principal: boolean
  notes: string
  modeloNome?: string | null
  produtoNome?: string | null
  alvo?: "modelo" | "produto" | "compativel"
  viaModelo?: string | null
  viaStatus?: LojaCompatStatus | null
}

export interface ConsultaCapinhaDTO {
  modelo: ModeloCompatDTO
  capinhaGroups: PeliculaGrupo[]
  localizacoes: LocalizacaoDTO[]
  produtos: {
    detalhados: {
      id: string
      name: string
      sku: string | null
      stock: number
      vinculo: "modelo" | "compativel"
      viaModelo: string | null
      viaStatus: LojaCompatStatus | null
    }[]
    gerais: { id: string; name: string; sku: string | null; stockGeral: number; pedeModeloNaVenda: boolean }[]
  }
  avisos: string[]
}

export interface RelatorioDTO {
  dias: number
  truncado: boolean
  relatorio: RelatorioCapinhas
  estoque: {
    geral: { id: string; name: string; stock: number }[]
    detalhado: { id: string; name: string; stock: number; modelos: number }[]
  }
  movimentacoes: {
    id: string
    produtoId: string | null
    produtoNome: string
    tipo: string
    origem: string
    quantidade: number
    estoqueAntes: number
    estoqueDepois: number
    motivo: string | null
    createdAt: string
  }[]
}

// ── Organização ─────────────────────────────────────────────────────────────

export const carregarOrganizacao = (loja: Loja) =>
  get<{ paineis: PainelDTO[]; preferencias: CompatPreferencias }>(loja, "/api/catalogo/compat/organizacao")

export const criarPainel = (loja: Loja, input: { nome: string; descricao?: string }) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/organizacao", "POST", { tipo: "painel", ...input })

export const criarFileira = (loja: Loja, input: { painelId: string; nome: string; descricao?: string }) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/organizacao", "POST", { tipo: "fileira", ...input })

export const atualizarLocal = (
  loja: Loja,
  tipo: "painel" | "fileira",
  id: string,
  patch: { version: number; nome?: string; descricao?: string; ativo?: boolean },
) => send<{ id: string }>(loja, `/api/catalogo/compat/organizacao/${tipo}/${encodeURIComponent(id)}`, "PATCH", patch)

export const moverLocal = (loja: Loja, tipo: "painel" | "fileira", id: string, mover: "cima" | "baixo") =>
  send<{ id: string }>(loja, `/api/catalogo/compat/organizacao/${tipo}/${encodeURIComponent(id)}`, "PATCH", { mover })

export const excluirLocal = (loja: Loja, tipo: "painel" | "fileira", id: string) =>
  send<{ id: string }>(loja, `/api/catalogo/compat/organizacao/${tipo}/${encodeURIComponent(id)}`, "DELETE")

// ── Preferências ────────────────────────────────────────────────────────────

export const salvarPreferencias = (
  loja: Loja,
  patch: {
    version: number
    posicoesHabilitadas?: boolean
    modoModeloPadrao?: AcessorioModoCaptura
    modoCorPadrao?: AcessorioModoCaptura
  },
) => send<{ preferencias: CompatPreferencias }>(loja, "/api/catalogo/compat/preferencias", "PATCH", patch)

// ── Cores ───────────────────────────────────────────────────────────────────

export const carregarCores = (loja: Loja) =>
  get<{ cores: CorEfetiva[]; linhas: CorLoja[] }>(loja, "/api/catalogo/compat/cores")

export const criarCor = (loja: Loja, label: string) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/cores", "POST", { label })

export const atualizarCor = (loja: Loja, id: string, patch: { version: number; label?: string; ativo?: boolean }) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/cores", "PATCH", { id, ...patch })

export const ativarCorPadrao = (loja: Loja, baseKey: string, ativo: boolean) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/cores", "PATCH", { baseKey, ativo })

// ── Vínculos ────────────────────────────────────────────────────────────────

export const carregarVinculos = (loja: Loja, categoria: LojaCompatCategoria, modelKey: string) =>
  get<{
    modelo: ModeloCompatDTO
    vinculos: VinculoDTO[]
    globais: { modelKey: string; canonicalName: string; brand: string; groupName: string; status: string }[]
  }>(loja, `/api/catalogo/compat/vinculos?${new URLSearchParams({ categoria, modelKey })}`)

export const gravarVinculos = (
  loja: Loja,
  input: {
    categoria: LojaCompatCategoria
    modelKey: string
    otherModelKeys: string[]
    decisao: "adicionar" | "suprimir" | "restaurar"
    status?: LojaCompatStatus
    notes?: string
    origem?: string
    confirmacaoFisica?: boolean
  },
) =>
  send<{ resultados: { modelKey: string; ok: boolean; error?: string }[]; gravados: number; falhas: number }>(
    loja,
    "/api/catalogo/compat/vinculos",
    "POST",
    input,
  )

// ── Consulta / localização ──────────────────────────────────────────────────

export const consultarCapinha = (loja: Loja, modelKey: string) =>
  get<ConsultaCapinhaDTO>(loja, `/api/catalogo/compat/consulta?${new URLSearchParams({ modelKey })}`)

export const listarLocalizacoes = (loja: Loja, filtro: { modelKey?: string; produtoId?: string; painelId?: string }) => {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filtro)) if (v) qs.set(k, v)
  return get<{ localizacoes: LocalizacaoDTO[] }>(loja, `/api/catalogo/compat/localizacoes?${qs}`)
}

export const adicionarLocalizacao = (
  loja: Loja,
  input: {
    modelKey?: string
    produtoId?: string
    painelId: string
    fileiraId?: string | null
    posicao?: string
    principal?: boolean
    notes?: string
  },
) => send<{ id: string; existente: boolean }>(loja, "/api/catalogo/compat/localizacoes", "POST", input)

export const tornarPrincipal = (loja: Loja, id: string) =>
  send<{ id: string }>(loja, "/api/catalogo/compat/localizacoes", "PATCH", { id, principal: true })

export const removerLocalizacao = (loja: Loja, id: string) =>
  send<{ id: string }>(loja, `/api/catalogo/compat/localizacoes?${new URLSearchParams({ id })}`, "DELETE")

// ── Relatório / hierarquia ──────────────────────────────────────────────────

export const carregarRelatorio = (loja: Loja, dias: number) =>
  get<RelatorioDTO>(loja, `/api/catalogo/compat/relatorio?dias=${dias}`)

export const carregarHierarquia = (loja: Loja) =>
  get<{ fabricantes: string[]; arvore: { fabricante: string; marcas: { marca: string; linhas: string[] }[] }[] }>(
    loja,
    "/api/catalogo/compat/hierarquia",
  )
