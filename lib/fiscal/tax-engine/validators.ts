/**
 * Validação de entrada do Motor Tributário (Tax Engine) — Fase F2. Pura, sem efeitos.
 *
 * Define a FRONTEIRA do escopo: rejeita explicitamente o que ainda não é suportado (regime
 * normal, interestadual, contribuinte, DIFAL/FCP-próprio/IPI/ISS, CSOSN 201/202/203/900, origem
 * fora de 0–8). CSOSN 500 (ST substituído) é aceito, exigindo identificação mínima da ST retida
 * (fail-closed). Erros bloqueiam o cálculo (`ok:false`); avisos são informativos e não bloqueiam.
 */
import type {
  TaxEngineError,
  TaxEngineInput,
  TaxEngineItemInput,
} from "./types"
import { isNonNegativeFinite, num, onlyDigits } from "./helpers"
import { isCsosnStNaoSuportado, isCsosnStSuportado, isCsosnSuportado, isSimplesRegime } from "./rules"

/** Identificação MÍNIMA de ST retida presente no item (CSOSN 500 — fail-closed). */
function temIdentificacaoSt(item: TaxEngineItemInput): boolean {
  const pos = (v: number | undefined) => num(v) > 0
  return (
    pos(item.vICMSSubstituto) ||
    pos(item.vICMSSTRet) ||
    pos(item.vBCSTRet) ||
    pos(item.vICMSEfet) ||
    (pos(item.vBCEfet) && pos(item.pICMSEfet))
  )
}

export type ValidationResult = {
  errors: TaxEngineError[]
  warnings: string[]
}

function err(
  code: TaxEngineError["code"],
  mensagem: string,
  itemIndex: number | null = null,
  campo: string | null = null,
): TaxEngineError {
  return { code, mensagem, itemIndex, campo }
}

/** Valida a nota + cada item. Coleta TODOS os erros (não para no primeiro). */
export function validateInput(input: TaxEngineInput): ValidationResult {
  const errors: TaxEngineError[] = []
  const warnings: string[] = []

  // ── Nível da nota ─────────────────────────────────────────────────────────────────
  if (!isSimplesRegime(input.regime)) {
    errors.push(
      err(
        "regime_nao_suportado",
        `Regime "${input.regime}" não suportado na F2 (apenas Simples Nacional). Regime normal/MEI virão em fase futura.`,
        null,
        "regime",
      ),
    )
  }

  const ambito = input.ambito ?? "interna"
  if (ambito !== "interna") {
    errors.push(
      err("ambito_nao_suportado", `Operação "${ambito}" não suportada na F2 (apenas interna/estadual).`, null, "ambito"),
    )
  }

  const destino = input.destino ?? "consumidor_final"
  if (destino !== "consumidor_final") {
    errors.push(
      err(
        "destino_nao_suportado",
        `Destino "${destino}" não suportado na F2 (apenas consumidor final). Contribuinte exige DIFAL/ST.`,
        null,
        "destino",
      ),
    )
  }

  const flags = input.flags ?? {}
  const flagsLigadas = [
    flags.temSubstituicaoTributaria && "ST",
    flags.temDifal && "DIFAL",
    flags.temFcp && "FCP",
    flags.temIpi && "IPI",
    flags.temIss && "ISS",
  ].filter(Boolean) as string[]
  if (flagsLigadas.length > 0) {
    errors.push(
      err(
        "operacao_nao_suportada",
        `Operação com ${flagsLigadas.join("/")} não suportada na F2 (baseline sem ST/DIFAL/FCP/IPI/ISS).`,
        null,
        "flags",
      ),
    )
  }

  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    errors.push(err("sem_itens", "A venda fiscal não tem itens para calcular.", null, "itens"))
    return { errors, warnings } // sem itens não há o que validar adiante
  }

  // Acessórios de nota não podem ser negativos.
  for (const [campo, v] of [
    ["descontoTotal", input.descontoTotal],
    ["freteTotal", input.freteTotal],
    ["seguroTotal", input.seguroTotal],
    ["outrasDespesasTotal", input.outrasDespesasTotal],
  ] as const) {
    if (!isNonNegativeFinite(v)) {
      errors.push(err("valor_invalido", `Valor de "${campo}" inválido (deve ser número ≥ 0).`, null, campo))
    }
  }

  // ── Por item ──────────────────────────────────────────────────────────────────────
  input.itens.forEach((item, i) => {
    const idx = i + 1
    errors.push(...validateItem(item, idx))
  })

  // Desconto da NOTA não pode exceder a soma dos brutos (evita total negativo no rateio).
  const somaBrutos = input.itens.reduce((a, it) => a + num(it.quantidade) * num(it.valorUnitario), 0)
  if (num(input.descontoTotal) > somaBrutos + 1e-9) {
    errors.push(
      err(
        "desconto_maior_que_bruto",
        `Desconto da nota (${num(input.descontoTotal)}) maior que a soma dos itens (${somaBrutos}).`,
        null,
        "descontoTotal",
      ),
    )
  }

  return { errors, warnings }
}

function validateItem(item: TaxEngineItemInput, idx: number): TaxEngineError[] {
  const out: TaxEngineError[] = []

  if (!isNonNegativeFinite(item.quantidade) || num(item.quantidade) < 0) {
    out.push(err("item_invalido", `Item ${idx}: quantidade inválida (≥ 0).`, idx, "quantidade"))
  }
  if (!isNonNegativeFinite(item.valorUnitario)) {
    out.push(err("item_invalido", `Item ${idx}: valor unitário inválido (≥ 0).`, idx, "valorUnitario"))
  }

  for (const [campo, v] of [
    ["descontoValor", item.descontoValor],
    ["freteValor", item.freteValor],
    ["seguroValor", item.seguroValor],
    ["outrasDespesasValor", item.outrasDespesasValor],
  ] as const) {
    if (!isNonNegativeFinite(v)) {
      out.push(err("valor_invalido", `Item ${idx}: "${campo}" inválido (número ≥ 0).`, idx, campo))
    }
  }

  // Desconto do item não pode exceder o bruto do item.
  const bruto = num(item.quantidade) * num(item.valorUnitario)
  if (num(item.descontoValor) > bruto + 1e-9) {
    out.push(
      err(
        "desconto_maior_que_bruto",
        `Item ${idx}: desconto (${num(item.descontoValor)}) maior que o valor bruto (${bruto}).`,
        idx,
        "descontoValor",
      ),
    )
  }

  // CFOP: baseline é interno (5xxx). 6xxx (interestadual) / outros → fora do escopo F2.
  const cfop = onlyDigits(item.cfop)
  if (cfop && !cfop.startsWith("5")) {
    out.push(
      err("cfop_nao_suportado", `Item ${idx}: CFOP ${cfop} não suportado na F2 (apenas operação interna 5xxx).`, idx, "cfop"),
    )
  }

  // Origem da mercadoria: matriz 0–8 (um dígito). 9 e demais → fora da matriz suportada.
  const origem = onlyDigits(item.origemMercadoria)
  if (origem.length > 0) {
    const d = Number(origem)
    if (origem.length !== 1 || !(d >= 0 && d <= 8)) {
      out.push(
        err("origem_nao_suportada", `Item ${idx}: origem "${origem}" fora da matriz suportada (use 0–8).`, idx, "origemMercadoria"),
      )
    }
  }

  // CSOSN: precisa ser um dos suportados; 500 (ST substituído) é aceito; 201/202/203/900 barrados.
  if (item.csosn != null && onlyDigits(item.csosn).length > 0) {
    const csosn = onlyDigits(item.csosn)
    if (isCsosnStNaoSuportado(item.csosn)) {
      out.push(
        err(
          "csosn_nao_suportado",
          `Item ${idx}: CSOSN ${csosn} (ST/antecipação) não suportado (use 500; 201/202/203/900 são trilha futura).`,
          idx,
          "csosn",
        ),
      )
    } else if (isCsosnStSuportado(item.csosn)) {
      // CSOSN 500 — exige identificação mínima da ST retida (fail-closed: nunca emite 500 "vazio").
      if (!temIdentificacaoSt(item)) {
        out.push(
          err(
            "st_incompleta",
            `Item ${idx}: CSOSN 500 exige identificação de ST retida (informe vICMSSubstituto/vICMSSTRet/vBCSTRet ou ICMS efetivo vBCEfet+pICMSEfet).`,
            idx,
            "csosn",
          ),
        )
      }
    } else if (!isCsosnSuportado(item.csosn)) {
      out.push(
        err(
          "csosn_nao_suportado",
          `Item ${idx}: CSOSN ${csosn} não suportado (use 101/102/103/300/400 ou 500).`,
          idx,
          "csosn",
        ),
      )
    }
  }

  return out
}
