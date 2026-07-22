/**
 * Fixtures do GATE do Dry-Run fiscal (GOAL-007) — material de TESTE, descartável, SEM VALOR FISCAL.
 *
 * Uma fixture POSITIVA (mix piloto RafaCell — acessórios de celular, Simples Nacional CSOSN 102)
 * que passa a esteira a seco de ponta a ponta, e fixtures DEFEITUOSAS que reprovam no item exato:
 *   - produto fiscal incompleto  → item 2 (diagnóstico do snapshot).
 *   - CSOSN 500 sem fiação de ST  → item 3 (tributação pendente/ST incompleta — fail-closed correto,
 *                                   ver ADR-0012 §2; a fiação end-to-end da ST é GOAL separado).
 * As fixtures de "XML inválido no XSD", "assinatura corrompida" e "localKey duplicado" são dirigidas
 * por adapter/injeção de falha do gate (não por dado de entrada) — ver dry-run-gate.test.ts.
 *
 * Tudo determinístico e offline. O CNPJ do emitente casa com o `.pfx` de teste padrão (item 6).
 */
import {
  buildVendaFiscalSnapshot,
  type BuildSnapshotInput,
  type SnapshotItemInput,
  type SnapshotLojaInput,
  type VendaFiscalSnapshot,
} from "../venda-fiscal-snapshot"
import { sanitizeProdutoFiscal } from "@/lib/produto-fiscal"

/** CNPJ do emitente do mix piloto — casa com `makeTestPfx()` padrão (item 6, CNPJ×loja). */
export const GATE_PILOT_CNPJ = "11.222.333/0001-81"

const LOJA_PILOTO: SnapshotLojaInput = {
  cnpj: GATE_PILOT_CNPJ,
  razaoSocial: "RafaCell Comércio LTDA",
  nomeFantasia: "RafaCell",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  regimeTributario: "SIMPLES_NACIONAL",
  crt: 1,
  ambiente: "HOMOLOGACAO",
  modeloFiscal: "NFCE",
  fiscalEnabled: false,
  logradouro: "Rua das Flores",
  numero: "100",
  complemento: "",
  bairro: "Centro",
  codigoMunicipioIbge: "3550308",
  municipio: "São Paulo",
  uf: "SP",
  cep: "01001-000",
  codigoPais: "1058",
  fone: "",
  email: "",
}

function acessorio(over: Partial<SnapshotItemInput> & { fiscal: SnapshotItemInput["fiscal"] }): SnapshotItemInput {
  return {
    itemVendaId: null,
    produtoId: null,
    codigoProduto: "SKU",
    descricao: "Acessório",
    gtin: "7891234567890",
    quantidade: 1,
    valorUnitario: 0,
    valorDesconto: 0,
    valorTotal: 0,
    ...over,
  }
}

/** Mix piloto emitível (CSOSN 102 — imposto no DAS). Três acessórios distintos. */
const ITENS_PILOTO: SnapshotItemInput[] = [
  acessorio({
    itemVendaId: "iv-cabo",
    codigoProduto: "CABO-USBC",
    descricao: "Cabo USB-C 1m",
    quantidade: 2,
    valorUnitario: 25,
    valorTotal: 50,
    fiscal: sanitizeProdutoFiscal({ ncm: "85444200", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
  }),
  acessorio({
    itemVendaId: "iv-pelicula",
    codigoProduto: "PEL-3D",
    descricao: "Película 3D vidro",
    quantidade: 3,
    valorUnitario: 20,
    valorTotal: 60,
    fiscal: sanitizeProdutoFiscal({ ncm: "70071900", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
  }),
  acessorio({
    itemVendaId: "iv-carregador",
    codigoProduto: "CARR-20W",
    descricao: "Carregador 20W",
    quantidade: 1,
    valorUnitario: 90,
    valorTotal: 90,
    fiscal: sanitizeProdutoFiscal({ ncm: "85044090", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
  }),
]

function pilotoInput(over: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    storeId: "loja-1",
    vendaId: "venda-gate-piloto",
    loja: LOJA_PILOTO,
    cliente: null,
    venda: {
      pedidoId: "VDA-GATE-PILOTO",
      data: "2026-07-22T12:00:00.000Z",
      total: 200,
      desconto: 0,
      operador: "João",
      terminal: "PDV1",
      paymentBreakdown: { dinheiro: 200 },
    },
    itens: ITENS_PILOTO,
    ...over,
  }
}

function buildOrThrow(input: BuildSnapshotInput): VendaFiscalSnapshot {
  const r = buildVendaFiscalSnapshot(input)
  if (!r.ok) throw new Error(`fixture do gate inválida: ${r.code} — ${r.error}`)
  return r.snapshot
}

/** POSITIVA — mix piloto emitível (deve passar 1,2,3,5,6,7,8,9,10,11; e 4 com worker XSD real). */
export function gatePilotSnapshot(): VendaFiscalSnapshot {
  return buildOrThrow(pilotoInput())
}

/** NEGATIVA — um item sem CSOSN/CST (produto fiscal incompleto) ⇒ reprova no item 2. */
export function gateProdutoIncompletoSnapshot(): VendaFiscalSnapshot {
  return buildOrThrow(
    pilotoInput({
      vendaId: "venda-gate-produto-incompleto",
      itens: [
        ITENS_PILOTO[0]!,
        acessorio({
          itemVendaId: "iv-sem-fiscal",
          codigoProduto: "SEM-FISCAL",
          descricao: "Acessório sem CSOSN",
          quantidade: 1,
          valorUnitario: 30,
          valorTotal: 30,
          // NCM/CFOP/origem presentes, mas SEM CSOSN/CST → produto fiscal incompleto (item 2).
          fiscal: sanitizeProdutoFiscal({ ncm: "85444200", cfop: "5102", origem: "0", unidade: "UN" }),
        }),
      ],
    }),
  )
}

/**
 * BOUNDARY — item CSOSN 500 (ST) sem identificação de ST retida ⇒ tributação pendente
 * (`st_incompleta`, ADR-0012) ⇒ reprova no item 3 (XML bloqueado). Prova que o gate NÃO fica verde
 * com um 500 "vazio": a fiação end-to-end da ST (venda→snapshot→XML) é GOAL separado.
 */
export function gateCsosn500Snapshot(): VendaFiscalSnapshot {
  return buildOrThrow(
    pilotoInput({
      vendaId: "venda-gate-csosn500",
      itens: [
        acessorio({
          itemVendaId: "iv-st",
          codigoProduto: "FONE-ST",
          descricao: "Fone bluetooth (ST)",
          quantidade: 1,
          valorUnitario: 120,
          valorTotal: 120,
          fiscal: sanitizeProdutoFiscal({ ncm: "85183000", cfop: "5405", csosn: "500", origem: "0", unidade: "UN" }),
        }),
      ],
    }),
  )
}
