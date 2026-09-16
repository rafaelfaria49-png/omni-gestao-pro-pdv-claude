/**
 * N5-B1 (GAP-P2-02) — Resolução do titular do crédito/vale na venda.
 *
 * Contrato útil extraído do PDV Classic (`pdv-classic.tsx`, bloco
 * `usouValeLoc`): o PaymentModal compartilhado localiza o vale por
 * documento/código e devolve `meta.creditDoc/creditNome/creditSaldo`.
 * Quando um pagamento `credito_vale` foi aplicado sobre esse vale
 * localizado, a venda precisa carregar o documento que o servidor vai
 * debitar (ClienteCredito é chaveado por CPF/CNPJ) — que pode diferir do
 * cliente selecionado — e o saldo local precisa ser semeado para o guard
 * do finalize não rejeitar em navegador frio.
 *
 * Regras (sem ampliar autoridade financeira):
 * - normalização de documento é a existente (`normalizeDocDigits`);
 * - nenhum cliente é inventado: sem vale localizado+usado, vale o cliente
 *   selecionado explicitamente (precedência dele preservada);
 * - sem fallback cross-store (o lookup já é escopado por loja no modal);
 * - sem tocar saldo/ledger aqui — só se resolve QUEM é o titular e QUAL
 *   semente local o caller deve aplicar via `sincronizarCreditoLocal`;
 * - com `pdv.customerStoreCredit` desabilitada, nunca resolve via documento.
 */
import { normalizeDocDigits } from "@/lib/cpf"

export type SaleCreditPaymentType = { type: string }

export type SaleCreditHolderInput = {
  payments: readonly SaleCreditPaymentType[]
  /** Documento/código localizado pelo PaymentModal (`meta.creditDoc`). */
  creditDoc?: string | null
  creditNome?: string | null
  creditSaldo?: number | null
  /** Cliente selecionado explicitamente na superfície (precedência fora do vale). */
  selectedCpf?: string | null
  selectedName?: string | null
  storeCreditEnabled: boolean
}

export type SaleCreditHolderResolution = {
  /** Documento a gravar na venda (`customerCpf`). */
  cpf?: string
  /** Nome a gravar na venda/cupom (`customerName`). */
  nome?: string
  /**
   * Semente de saldo local a aplicar via `sincronizarCreditoLocal`
   * (só quando o vale localizado foi usado). Null = não semear.
   */
  seedLocal: { doc: string; nome: string; saldo: number } | null
}

export function resolveSaleCreditHolder(input: SaleCreditHolderInput): SaleCreditHolderResolution {
  const docNorm = input.creditDoc ? normalizeDocDigits(input.creditDoc) : ""
  const usouValeLocalizado =
    input.storeCreditEnabled &&
    docNorm.length > 0 &&
    input.payments.some((p) => p?.type === "credito_vale")
  if (!usouValeLocalizado) {
    return {
      ...(input.selectedCpf ? { cpf: input.selectedCpf } : {}),
      ...(input.selectedName ? { nome: input.selectedName } : {}),
      seedLocal: null,
    }
  }
  return {
    cpf: docNorm,
    nome: input.creditNome?.trim() || input.selectedName || undefined,
    seedLocal: {
      doc: docNorm,
      nome: input.creditNome ?? "",
      saldo: typeof input.creditSaldo === "number" ? input.creditSaldo : 0,
    },
  }
}
