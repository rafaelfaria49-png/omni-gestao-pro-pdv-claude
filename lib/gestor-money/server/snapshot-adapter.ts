import "server-only"
import { consultarCartoesGasto } from "@/lib/gastos/cartoes"
import { consultarFinanceiro, filtroConsultaFinanceira } from "@/lib/gastos/query"
import { comLeituraFinanceira, leituraPerfilWhere } from "@/lib/gastos/read-scope"
import { listarDocumentosGasto } from "@/lib/gastos/documentos"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { diagnosticarStorageComprovantes } from "./documents-adapter"
import {
  CATEGORIAS_PADRAO_DESPESA,
  GESTOR_MONEY_BASE,
  GESTOR_MONEY_CURRENCY,
  GESTOR_MONEY_TIMEZONE,
  type CartaoCicloResumo,
  type CartaoCreditoResumo,
  type CategoriaGestorMoney,
  type CompraParceladaCartao,
  type ConsultaFinanceiraSnapshot,
  type ContaCarteira,
  type DividaResumo,
  type DocumentoComprovante,
  type EvolucaoMensalPonto,
  type GastoPorCategoriaResumo,
  type HistoricoCartaoItem,
  type MeioPagamentoGasto,
  type PagamentoDividaHistoricoItem,
  type PerfilResumo,
  type ProximoVencimentoItem,
  type StatusTitulo,
  type TipoContaCarteira,
  type TituloFinanceiroResumo,
} from "@/lib/gestor-money/contracts"
import {
  diasEntreDatasCivil,
  hojeSaoPaulo,
  normalizarNomeCategoria,
  parseBigIntCentavos,
  percentualCentavos,
  somarCentavos,
  subtrairCentavos,
} from "@/lib/gestor-money/money"

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function rotuloMes(ym: string): string {
  const [y, m] = ym.split("-")
  const idx = Number(m) - 1
  return `${MESES_CURTOS[idx] ?? m}/${y?.slice(2) ?? ""}`
}

function mapTipoContaVisual(tipoDb: string, identificador?: string | null): TipoContaCarteira {
  const idLower = (identificador ?? "").toLowerCase()
  if (idLower.includes("pix")) return "pix"
  if (tipoDb === "dinheiro") return "dinheiro"
  if (tipoDb === "caixa") return "caixa"
  if (tipoDb === "debito") return "carteira_digital"
  if (tipoDb === "investimento") return "investimento"
  return "banco"
}

function corTipoConta(tipo: TipoContaCarteira, corDb?: string | null): string {
  if (corDb && /^#[0-9a-fA-F]{6}$/.test(corDb)) return corDb
  const mapa: Record<TipoContaCarteira, string> = {
    dinheiro: "#10b981",
    banco: "#3b82f6",
    pix: "#8b5cf6",
    carteira_digital: "#0ea5e9",
    caixa: "#f59e0b",
    investimento: "#6366f1",
  }
  return mapa[tipo] ?? "#6366f1"
}

function mapStatusTitulo(raw: string, vencimento: string, hoje: string, restante: bigint): StatusTitulo {
  if (raw === "cancelado" || raw === "estornado") return "cancelado"
  if (restante <= BigInt(0) || raw === "pago" || raw === "recebido" || raw === "liquidado") return "pago"
  if (raw === "parcial") return "parcial"
  if (diasEntreDatasCivil(hoje, vencimento) < 0) return "vencido"
  return "aberto"
}

function extrairParcelasPayload(payload: unknown): { numero: number | null; total: number | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { numero: null, total: null }
  }
  const obj = payload as Record<string, unknown>
  const numero = typeof obj.parcelaNumero === "number" && Number.isInteger(obj.parcelaNumero) ? obj.parcelaNumero : null
  const total = typeof obj.parcelaTotal === "number" && Number.isInteger(obj.parcelaTotal) ? obj.parcelaTotal : null
  return { numero, total }
}

function visualCategoria(nome: string, index: number): { icone: string; cor: string; padrao: boolean } {
  const norm = normalizarNomeCategoria(nome)
  const padrao = CATEGORIAS_PADRAO_DESPESA.find((c) => normalizarNomeCategoria(c.nome) === norm)
  if (padrao) return { icone: padrao.icone, cor: padrao.cor, padrao: true }
  const cores = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1"]
  return { icone: "Tag", cor: cores[index % cores.length], padrao: false }
}

/**
 * Monta o `ConsultaFinanceiraSnapshot` exclusivamente a partir dos serviços canônicos
 * G003 (`comLeituraFinanceira`, `listarDocumentosGasto`) e G005 (`consultarFinanceiro`).
 * Zero motor financeiro paralelo; zero tabelas duplicadas.
 */
export async function obterSnapshotReal(
  contexto: FinanceiroContextoAutorizado,
  periodo?: { dataInicio?: string; dataFim?: string }
): Promise<ConsultaFinanceiraSnapshot> {
  const filtro = filtroConsultaFinanceira({
    ...(periodo?.dataInicio ? { dataInicio: periodo.dataInicio } : {}),
    ...(periodo?.dataFim ? { dataFim: periodo.dataFim } : {}),
  })

  const [consulta, cartoesCanonicos, extras, documentosRaw] = await Promise.all([
    consultarFinanceiro(contexto, filtro),
    consultarCartoesGasto(contexto, { incluirInativos: false, incluirHistoricoLimites: true }),
    comLeituraFinanceira(contexto, async (db, ctx) => {
      const wherePerfil = leituraPerfilWhere(ctx)
      const [categorias, contasMeta, cartoesDetalhes, pagarExtra] = await Promise.all([
        db.categoriaGasto.findMany({
          where: { perfilId: ctx.perfilId, storeId: ctx.tipo === "EMPRESA" ? ctx.storeId : null },
          orderBy: [{ natureza: "asc" }, { nome: "asc" }],
        }),
        db.carteiraFinanceira.findMany({
          where: wherePerfil,
          select: { id: true, instituicao: true, identificadorInstrumento: true, tipo: true },
        }),
        db.cartaoInstrumento.findMany({
          where: { perfilId: ctx.perfilId, storeId: ctx.tipo === "EMPRESA" ? ctx.storeId : null, ativo: true },
          select: {
            id: true,
            ciclos: {
              orderBy: [{ competencia: "asc" }, { vencimento: "asc" }, { id: "asc" }],
              select: {
                id: true,
                competencia: true,
                titulos: {
                  where: { ativo: true },
                  select: {
                    id: true,
                    descricao: true,
                    valor: true,
                    valorCentavos: true,
                    categoriaId: true,
                    payload: true,
                    createdAt: true,
                    categoria: { select: { id: true, nome: true } },
                    gasto: { select: { id: true, descricao: true, dataGasto: true, valorCentavos: true } },
                    alocacoesPagamento: {
                      select: {
                        id: true,
                        valorCentavos: true,
                        pagamento: {
                          select: {
                            id: true,
                            tipo: true,
                            formaPagamento: true,
                            pagoEm: true,
                            carteiraId: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        db.contaPagarTitulo.findMany({
          where: { ...wherePerfil, ativo: true },
          select: {
            id: true,
            cartaoCicloId: true,
            payload: true,
            gastoId: true,
            gasto: { select: { contraparteTexto: true } },
            alocacoesPagamento: {
              select: {
                id: true,
                valorCentavos: true,
                pagamento: {
                  select: {
                    id: true,
                    tipo: true,
                    formaPagamento: true,
                    pagoEm: true,
                    carteiraId: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        }),
      ])
      return { categorias, contasMeta, cartoesDetalhes, pagarExtra }
    }),
    listarDocumentosGasto(contexto),
  ])

  const hoje = hojeSaoPaulo(new Date(consulta.asOf))
  const perfil: PerfilResumo =
    contexto.tipo === "PESSOAL"
      ? {
          tipo: "PESSOAL",
          perfilId: contexto.perfilId,
          ownerAdminUserId: contexto.ownerAdminUserId,
          nomeExibicao: "Pessoal (Cofre Privado)",
          subtitulo: "Independente de loja · Sem storeId · G001",
          ativo: true,
        }
      : {
          tipo: "EMPRESA",
          perfilId: contexto.perfilId,
          storeId: contexto.storeId,
          nomeExibicao: `Empresa · ${consulta.lojaNome ?? contexto.storeId}`,
          subtitulo: `Store ID: ${contexto.storeId} · Escopo Empresarial G001`,
          ativo: true,
        }

  const contaMetaMap = new Map(extras.contasMeta.map((c) => [c.id, c]))
  const contas: ContaCarteira[] = consulta.contas.map((c) => {
    const meta = contaMetaMap.get(c.id)
    const tipoVisual = mapTipoContaVisual(c.tipo, meta?.identificadorInstrumento)
    return {
      id: c.id,
      perfilId: contexto.perfilId,
      tipoPerfil: contexto.tipo,
      storeId: contexto.tipo === "EMPRESA" ? contexto.storeId : null,
      nome: c.nome,
      tipo: tipoVisual,
      tipoG002: (["caixa", "banco", "dinheiro", "credito", "debito", "investimento"].includes(c.tipo)
        ? c.tipo
        : "banco") as ContaCarteira["tipoG002"],
      instituicao: meta?.instituicao ?? null,
      identificadorInstrumento: meta?.identificadorInstrumento ?? null,
      cor: corTipoConta(tipoVisual, c.cor),
      ativo: c.ativo,
      saldoInicialCentavos: c.saldoInicialCentavos,
      saldoCentavos: c.saldoCentavos,
      entradasCentavos: c.entradasCentavos,
      saidasCentavos: c.saidasCentavos,
      quantidadeMovimentos: c.quantidadeMovimentos,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }
  })

  const contaNomeMap = new Map(contas.map((c) => [c.id, c.nome]))

  const catTotalsMap = new Map(
    consulta.porCategoria.map((pc) => [pc.categoriaId, pc])
  )
  const categorias: CategoriaGestorMoney[] = extras.categorias.map((c, idx) => {
    const vis = visualCategoria(c.nome, idx)
    const stat = catTotalsMap.get(c.id)
    const total =
      c.natureza === "DESPESA"
        ? stat?.despesaCentavos ?? "0"
        : stat?.receitaCentavos ?? "0"
    return {
      id: c.id,
      perfilId: contexto.perfilId,
      tipoPerfil: contexto.tipo,
      nome: c.nome,
      nomeNormalizado: c.nomeNormalizado,
      natureza: c.natureza === "RECEITA" ? "RECEITA" : "DESPESA",
      icone: vis.icone,
      cor: vis.cor,
      padrao: vis.padrao,
      ativo: c.ativo,
      totalPeriodoCentavos: total,
      quantidadeRegistros: stat?.quantidade ?? 0,
    }
  })

  const catColorMap = new Map(categorias.map((c) => [c.id, c.cor]))

  const pagarExtraMap = new Map(extras.pagarExtra.map((t) => [t.id, t]))

  const pagar: TituloFinanceiroResumo[] = consulta.pagar.map((t) => {
    const rest = parseBigIntCentavos(t.restanteCentavos)
    return {
      id: t.id,
      natureza: "PAGAR",
      descricao: t.descricao,
      contraparte: t.contraparte || t.apresentacao.fornecedor || "Não informado",
      categoriaId: t.categoriaId,
      categoriaNome: t.apresentacao.categoria || "Sem categoria",
      carteiraId: t.carteiraId,
      valorCentavos: t.valorCentavos,
      pagoCentavos: t.pagoCentavos,
      restanteCentavos: t.restanteCentavos,
      vencimento: t.vencimento,
      status: mapStatusTitulo(t.status, t.vencimento, hoje, rest),
      parcelaTexto: t.apresentacao.parcela || undefined,
      documentoIds: [],
      createdAt: t.createdAt,
    }
  })

  const receber: TituloFinanceiroResumo[] = consulta.receber.map((t) => {
    const rest = parseBigIntCentavos(t.restanteCentavos)
    return {
      id: t.id,
      natureza: "RECEBER",
      descricao: t.descricao,
      contraparte: t.contraparte || t.apresentacao.cliente || "Não informado",
      categoriaId: t.categoriaId,
      categoriaNome: t.apresentacao.categoria || "Sem categoria",
      carteiraId: t.carteiraId,
      valorCentavos: t.valorCentavos,
      pagoCentavos: t.pagoCentavos,
      restanteCentavos: t.restanteCentavos,
      vencimento: t.vencimento,
      status: mapStatusTitulo(t.status, t.vencimento, hoje, rest),
      parcelaTexto: t.apresentacao.parcela || undefined,
      documentoIds: [],
      createdAt: t.createdAt,
    }
  })

  // Dívidas: projeção direta sobre contas_pagar_titulos (sem fatura de cartão e sem duplicar tabelas)
  const dividas: DividaResumo[] = consulta.pagar
    .filter((t) => {
      const ex = pagarExtraMap.get(t.id)
      return !ex?.cartaoCicloId && !t.cancelado
    })
    .map((t) => {
      const ex = pagarExtraMap.get(t.id)
      const rest = parseBigIntCentavos(t.restanteCentavos)
      const pago = parseBigIntCentavos(t.pagoCentavos)
      const status: DividaResumo["status"] =
        rest <= BigInt(0)
          ? "quitada"
          : pago > BigInt(0)
            ? "parcial"
            : diasEntreDatasCivil(hoje, t.vencimento) < 0
              ? "vencida"
              : "aberta"

      const historico: PagamentoDividaHistoricoItem[] = [
        {
          id: `criacao-${t.id}`,
          tipo: "CRIACAO",
          valorCentavos: t.valorCentavos,
          dataPagamento: t.createdAt.slice(0, 10),
          observacao: t.apresentacao.observacao || undefined,
        },
      ]

      for (const aloc of ex?.alocacoesPagamento ?? []) {
        if (aloc.pagamento.tipo !== "PAGAMENTO") continue
        const valor = aloc.valorCentavos.toString()
        historico.push({
          id: aloc.id,
          tipo: rest <= BigInt(0) && valor === t.valorCentavos ? "QUITACAO" : "PAGAMENTO_PARCIAL",
          valorCentavos: valor,
          dataPagamento: aloc.pagamento.pagoEm.toISOString().slice(0, 10),
          formaPagamento: aloc.pagamento.formaPagamento as MeioPagamentoGasto,
          carteiraId: aloc.pagamento.carteiraId,
          carteiraNome: contaNomeMap.get(aloc.pagamento.carteiraId),
        })
      }

      const parcelasInfo = extrairParcelasPayload(ex?.payload)
      const parcelasTotal = parcelasInfo.total ?? 1
      const parcelasPagas =
        status === "quitada"
          ? parcelasTotal
          : Math.min(parcelasTotal, (ex?.alocacoesPagamento.filter((a) => a.pagamento.tipo === "PAGAMENTO").length ?? 0))

      return {
        id: t.id,
        perfilId: contexto.perfilId,
        credor: ex?.gasto?.contraparteTexto || t.contraparte || t.apresentacao.fornecedor || "Credor não informado",
        descricao: t.descricao,
        categoriaId: t.categoriaId,
        categoriaNome: t.apresentacao.categoria || "Sem categoria",
        valorOriginalCentavos: t.valorCentavos,
        valorPagoCentavos: t.pagoCentavos,
        saldoRestanteCentavos: t.restanteCentavos,
        vencimento: t.vencimento,
        parcelasPagas,
        parcelasTotal,
        status,
        observacao: t.apresentacao.observacao || undefined,
        createdAt: t.createdAt,
        historico,
      }
    })

  // Cartões de crédito: valores financeiros (limite, utilizado, disponível, excedido, percentual, ciclos e histórico de limites)
  // vêm EXCLUSIVAMENTE do contrato canônico `consultarCartoesGasto` (G004/G005), sem recálculo paralelo.
  const gradientes = [
    "from-violet-700 via-purple-700 to-slate-900",
    "from-amber-600 via-orange-600 to-zinc-900",
    "from-rose-700 via-red-700 to-slate-950",
    "from-slate-800 via-zinc-800 to-emerald-900",
  ]
  const detalhesCartaoMap = new Map(extras.cartoesDetalhes.map((c) => [c.id, c]))
  const cartoes: CartaoCreditoResumo[] = cartoesCanonicos.map((card, idx) => {
    const detalhes = detalhesCartaoMap.get(card.id)
    const comprasParceladas: CompraParceladaCartao[] = []
    const historico: HistoricoCartaoItem[] = []

    for (const cicloDetalhe of detalhes?.ciclos ?? []) {
      for (const titulo of cicloDetalhe.titulos) {
        const valor = BigInt(titulo.valorCentavos?.toString() ?? Math.round(titulo.valor * 100))
        let pagoTitulo = BigInt(0)
        for (const a of titulo.alocacoesPagamento) {
          const av = BigInt(a.valorCentavos.toString())
          pagoTitulo += a.pagamento.tipo === "PAGAMENTO" ? av : -av
          if (a.pagamento.tipo === "PAGAMENTO") {
            historico.push({
              id: `pag-${a.id}`,
              cartaoId: card.id,
              tipo: "PAGAMENTO_FATURA",
              descricao: `Pagamento Fatura ${cicloDetalhe.competencia}`,
              valorCentavos: av.toString(),
              data: a.pagamento.pagoEm.toISOString().slice(0, 10),
              competencia: cicloDetalhe.competencia,
            })
          }
        }
        if (pagoTitulo < BigInt(0)) pagoTitulo = BigInt(0)

        const parcelasTitulo = extrairParcelasPayload(titulo.payload)
        historico.push({
          id: `comp-${titulo.id}`,
          cartaoId: card.id,
          tipo: "COMPRA",
          descricao: titulo.descricao,
          valorCentavos: valor.toString(),
          data: (titulo.gasto?.dataGasto ?? titulo.createdAt).toISOString().slice(0, 10),
          competencia: cicloDetalhe.competencia,
          parcelaTexto:
            parcelasTitulo.numero && parcelasTitulo.total
              ? `${parcelasTitulo.numero}/${parcelasTitulo.total}`
              : "À vista",
          categoriaNome: titulo.categoria?.nome,
        })

        if (parcelasTitulo.total && parcelasTitulo.total > 1 && parcelasTitulo.numero) {
          comprasParceladas.push({
            id: titulo.id,
            cartaoId: card.id,
            cicloId: cicloDetalhe.id,
            descricao: titulo.gasto?.descricao ?? titulo.descricao,
            estabelecimento: titulo.descricao,
            categoriaId: titulo.categoriaId,
            categoriaNome: titulo.categoria?.nome ?? "Sem categoria",
            dataCompra: (titulo.gasto?.dataGasto ?? titulo.createdAt).toISOString().slice(0, 10),
            valorTotalCentavos: (titulo.gasto?.valorCentavos ?? valor).toString(),
            valorParcelaCentavos: valor.toString(),
            parcelaAtual: parcelasTitulo.numero,
            parcelasTotal: parcelasTitulo.total,
            ativa: valor > pagoTitulo,
          })
        }
      }
    }

    const ciclos: CartaoCicloResumo[] = card.ciclos.map((ciclo) => {
      const totalCiclo = parseBigIntCentavos(ciclo.totalCentavos)
      const restanteCiclo = parseBigIntCentavos(ciclo.restanteCentavos)
      const fechIso = ciclo.fechamentoEm ?? ciclo.vencimento
      const status: CartaoCicloResumo["status"] =
        totalCiclo > BigInt(0) && restanteCiclo === BigInt(0)
          ? "paga"
          : ciclo.competencia > hoje.slice(0, 7)
            ? "futura"
            : fechIso < hoje
              ? "fechada"
              : "aberta"

      return {
        id: ciclo.id,
        cartaoId: card.id,
        identificador: ciclo.identificador,
        competencia: ciclo.competencia,
        fechamentoEm: fechIso,
        vencimento: ciclo.vencimento,
        totalCentavos: ciclo.totalCentavos,
        pagoCentavos: ciclo.pagoCentavos,
        restanteCentavos: ciclo.restanteCentavos,
        quantidadeTitulos: ciclo.quantidadeTitulos,
        status,
      }
    })

    const ultimoCiclo = ciclos[ciclos.length - 1]
    const fechamentoDia = ultimoCiclo ? Number(ultimoCiclo.fechamentoEm.slice(8, 10)) || 5 : 5
    const vencimentoDia = ultimoCiclo ? Number(ultimoCiclo.vencimento.slice(8, 10)) || 12 : 12

    return {
      id: card.id,
      perfilId: contexto.perfilId,
      nome: card.nome,
      bandeira: card.bandeira ?? "Cartão",
      ultimos4: card.ultimos4 ?? "0000",
      corGradiente: gradientes[idx % gradientes.length],
      politicaComprometimento: card.politicaComprometimento,
      limiteCentavos: card.limiteCentavos,
      usadoCentavos: card.limiteUtilizadoCentavos,
      disponivelCentavos: card.limiteDisponivelCentavos,
      limiteExcedidoCentavos: card.limiteExcedidoCentavos,
      limiteComprometidoPercentual: card.limiteComprometidoPercentual,
      limitePersistenciaDisponivel: true,
      fechamentoDia,
      vencimentoDia,
      ativo: card.ativo,
      ciclos,
      comprasParceladas,
      historico: historico.sort((a, b) => (a.data < b.data ? 1 : -1)),
      historicoLimites: [...card.historicoLimites].reverse(),
    }
  })

  const gastosPorCategoria: GastoPorCategoriaResumo[] = consulta.porCategoria
    .filter((pc) => parseBigIntCentavos(pc.despesaCentavos) > BigInt(0))
    .map((pc, idx) => ({
      categoriaId: pc.categoriaId,
      categoria: pc.categoria,
      cor: (pc.categoriaId ? catColorMap.get(pc.categoriaId) : undefined) ?? visualCategoria(pc.categoria, idx).cor,
      despesaCentavos: pc.despesaCentavos,
      receitaCentavos: pc.receitaCentavos,
      quantidade: pc.quantidade,
      participacaoPercentual: percentualCentavos(pc.despesaCentavos, consulta.despesaRealizadaCentavos),
    }))
    .sort((a, b) => Number(parseBigIntCentavos(b.despesaCentavos) - parseBigIntCentavos(a.despesaCentavos)))

  const evolucaoMensal: EvolucaoMensalPonto[] = [...consulta.calendario]
    .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0))
    .slice(-6)
    .map((m) => ({
      mes: m.mes,
      label: rotuloMes(m.mes),
      receitaCentavos: m.receitaCentavos,
      despesaCentavos: m.despesaCentavos,
      resultadoCentavos: subtrairCentavos(m.receitaCentavos, m.despesaCentavos),
    }))

  const mesAtualYm = hoje.slice(0, 7)
  const mesAnteriorDate = new Date(Date.UTC(Number(mesAtualYm.slice(0, 4)), Number(mesAtualYm.slice(5, 7)) - 2, 1))
  const mesAnteriorYm = mesAnteriorDate.toISOString().slice(0, 7)
  const despMesAtual = consulta.calendario.find((m) => m.mes === mesAtualYm)?.despesaCentavos ?? "0"
  const despMesAnterior = consulta.calendario.find((m) => m.mes === mesAnteriorYm)?.despesaCentavos ?? "0"

  const proximosVencimentos: ProximoVencimentoItem[] = []
  for (const d of dividas) {
    if (d.status === "quitada") continue
    const dias = diasEntreDatasCivil(hoje, d.vencimento)
    proximosVencimentos.push({
      id: d.id,
      origem: "DIVIDA",
      titulo: d.descricao,
      contraparte: d.credor,
      vencimento: d.vencimento,
      valorCentavos: d.saldoRestanteCentavos,
      diasRestantes: dias,
      vencido: dias < 0,
      status: d.status,
    })
  }
  for (const card of cartoes) {
    for (const ciclo of card.ciclos) {
      if (parseBigIntCentavos(ciclo.restanteCentavos) <= BigInt(0)) continue
      const dias = diasEntreDatasCivil(hoje, ciclo.vencimento)
      proximosVencimentos.push({
        id: ciclo.id,
        origem: "FATURA",
        titulo: `Fatura ${card.nome} (${ciclo.competencia})`,
        contraparte: card.bandeira,
        vencimento: ciclo.vencimento,
        valorCentavos: ciclo.restanteCentavos,
        diasRestantes: dias,
        vencido: dias < 0,
        status: ciclo.status,
      })
    }
  }
  proximosVencimentos.sort((a, b) => a.diasRestantes - b.diasRestantes)

  const eventos = consulta.eventos.map((e) => ({
    id: e.id,
    movimentoId: e.movimentoId,
    carteiraId: e.carteiraId,
    carteiraNome: (e.carteiraId ? contaNomeMap.get(e.carteiraId) : undefined) ?? "Sem conta",
    categoriaId: e.categoriaId,
    categoria: e.categoria,
    descricao: e.descricao,
    contraparte: "",
    origem: e.origem,
    dia: e.dia,
    ocorridoEm: e.ocorridoEm,
    tipo: (e.tipo === "entrada" ? "entrada" : "saida") as "entrada" | "saida",
    valorCentavos: e.valorCentavos,
    transferencia: e.transferencia,
    despesaCentavos: e.despesaCentavos,
    receitaCentavos: e.receitaCentavos,
  }))

  const documentos: DocumentoComprovante[] = documentosRaw.map((d) => ({
    id: d.id,
    perfilId: contexto.perfilId,
    nomeArquivo: d.nomeArquivo,
    mime: d.mime as DocumentoComprovante["mime"],
    bytes: d.bytes,
    estado: d.estado as DocumentoComprovante["estado"],
    criadoEm: d.criadoEm,
  }))

  const dividasAbertasCentavos = somarCentavos(
    dividas.filter((d) => d.status !== "quitada").map((d) => d.saldoRestanteCentavos)
  )

  return {
    proveniencia: "REAL",
    base: GESTOR_MONEY_BASE,
    moeda: GESTOR_MONEY_CURRENCY,
    timezone: GESTOR_MONEY_TIMEZONE,
    asOf: consulta.asOf,
    perfil,
    periodo: {
      dataInicio: consulta.periodo.dataInicio,
      dataFim: consulta.periodo.dataFim,
    },
    saldoDisponivelCentavos: consulta.saldoCentavos,
    receitasCentavos: consulta.receitaRealizadaCentavos,
    despesasCentavos: consulta.despesaRealizadaCentavos,
    resultadoCentavos: consulta.resultadoCentavos,
    dividasAbertasCentavos,
    contasPagarCentavos: consulta.pagarAbertoCentavos,
    contasReceberCentavos: consulta.receberAbertoCentavos,
    quantidadeRegistros: consulta.quantidadeRegistros,
    proximosVencimentos,
    evolucaoMensal,
    gastosPorCategoria,
    comparativos: {
      criterio: consulta.comparativos.criterio,
      receitaMesAtualCentavos: consulta.comparativos.receitaMesAtualCentavos,
      receitaMesAnteriorCentavos: consulta.comparativos.receitaMesAnteriorCentavos,
      despesaMesAtualCentavos: despMesAtual,
      despesaMesAnteriorCentavos: despMesAnterior,
      receitaAnoAtualCentavos: consulta.comparativos.receitaAnoAtualCentavos,
      receitaAnoAnteriorCentavos: consulta.comparativos.receitaAnoAnteriorCentavos,
    },
    contas,
    pagar,
    receber,
    dividas,
    cartoes,
    categorias,
    eventos,
    documentos,
    storageDiagnostico: diagnosticarStorageComprovantes(),
  }
}
