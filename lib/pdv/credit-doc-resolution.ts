/**
 * Resolução compartilhada de crédito/vale (meta.creditDoc) — N5-B1 R2 (P2-02).
 *
 * Fonte: audit GAP-P2-02 — o fallback `creditDoc`→doc da venda + seed local
 * existia só no Classic (e Black); Assistência descartava `meta.creditDoc` e
 * Super/VC não consumiam. O servidor debita `ClienteCredito` pelo
 * `customerCpf` da venda (`ops-upsert-venda` passo 5) — não há campo separado
 * de devedor de crédito, então o doc da venda É o doc do débito.
 *
 * Contrato R2:
 * - cliente explicitamente selecionado tem precedência quando aplicável
 *   (crédito é dele ou não houve lookup de terceiro): venda carrega
 *   doc/nome/clienteId DELE;
 * - crédito/vale de TERCEIRO usa o documento correto (creditDoc) como doc da
 *   venda — e NUNCA herda o clienteId de pessoa diferente;
 * - sem crédito na venda → identidade é do cliente selecionado (ou ausente);
 * - storeId continua autoridade fora daqui (motor/servidor); saldo/ledger não
 *   são alterados por este helper — ele só REPORTA o seed local opcional
 *   (`sincronizarCreditoLocal`) que a superfície aplica para o guard de
 *   saldo do motor não rejeitar em navegador frio;
 * - capability `pdv.customerStoreCredit` continua obrigatória (chegada ao
 *   helper com vale usado já pressupõe o gate do modal/lookup);
 * - cupom/enrich/audit recebem o MESMO doc/nome da venda (sem cliente errado).
 */

export type CreditDocMeta = {
  creditDoc?: string
  creditNome?: string
  creditSaldo?: number
}

export type SelectedCustomerIdentity = {
  id?: string
  name?: string
  cpf?: string
}

export type CreditAttribution = {
  /** Doc (só dígitos) que a venda carrega = doc debitado pelo servidor. */
  saleDoc?: string
  /** Nome exibido em cupom/enrich/audit — coerente com `saleDoc`. */
  saleName?: string
  /**
   * true ⇒ venda pertence ao cliente explicitamente selecionado (clienteId
   * pode ir); false ⇒ titular do vale é terceiro (clienteId NUNCA vai).
   */
  belongsToSelectedCustomer: boolean
  /** Seed local do saldo do titular (navegador frio) — null quando desnecessário. */
  seedLocalCredit?: { doc: string; nome: string; saldo: number } | null
}

/** CPF/CNPJ só dígitos (comparação e valor enviado ao servidor). */
function digitsOnly(doc: string | undefined | null): string {
  return typeof doc === "string" ? doc.replace(/\D/g, "") : ""
}

export function resolveCreditAttribution(input: {
  /** Alguma linha `credito_vale` foi usada na venda. */
  usedCredit: boolean
  /** Meta do PaymentModal (preenchida quando o lookup localizou titular). */
  meta?: CreditDocMeta
  selectedCustomer?: SelectedCustomerIdentity | null
}): CreditAttribution {
  const selected = input.selectedCustomer ?? null
  const selectedDoc = digitsOnly(selected?.cpf)
  const creditDoc = digitsOnly(input.meta?.creditDoc)

  if (!input.usedCredit) {
    return {
      ...(selectedDoc ? { saleDoc: selectedDoc } : {}),
      ...(selected?.name?.trim() ? { saleName: selected.name.trim() } : {}),
      belongsToSelectedCustomer: Boolean(selected),
      seedLocalCredit: null,
    }
  }

  // Crédito usado SEM doc de titular localizado: só é possível quando o saldo
  // veio do próprio cliente selecionado (prop customerStoreCredit) — a venda
  // segue dele, com clienteId.
  if (!creditDoc) {
    return {
      ...(selectedDoc ? { saleDoc: selectedDoc } : {}),
      ...(selected?.name?.trim() ? { saleName: selected.name.trim() } : {}),
      belongsToSelectedCustomer: Boolean(selected),
      seedLocalCredit: null,
    }
  }

  // Titular localizado é o próprio cliente selecionado: precedência do
  // selecionado — identidade dele intacta (doc/nome/clienteId), seed local só
  // se o servidor reportou saldo.
  if (selectedDoc && creditDoc === selectedDoc) {
    const saldo = typeof input.meta?.creditSaldo === "number" && Number.isFinite(input.meta.creditSaldo)
      ? input.meta.creditSaldo
      : undefined
    return {
      saleDoc: selectedDoc,
      ...(selected?.name?.trim() ? { saleName: selected.name.trim() } : {}),
      belongsToSelectedCustomer: true,
      seedLocalCredit:
        saldo !== undefined
          ? { doc: creditDoc, nome: input.meta?.creditNome ?? selected?.name ?? "Cliente", saldo }
          : null,
    }
  }

  // Terceiro: o doc da venda vira o doc do TITULAR (é o que o servidor debita);
  // clienteId do selecionado NUNCA herda para a venda de outra pessoa.
  const holderName = input.meta?.creditNome?.trim() || ""
  return {
    saleDoc: creditDoc,
    ...(holderName ? { saleName: holderName } : {}),
    belongsToSelectedCustomer: false,
    seedLocalCredit:
      typeof input.meta?.creditSaldo === "number" && Number.isFinite(input.meta.creditSaldo)
        ? { doc: creditDoc, nome: holderName || "Cliente", saldo: input.meta.creditSaldo }
        : null,
  }
}
