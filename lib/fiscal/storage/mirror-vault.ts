/**
 * Implementação no-op do `XmlStorageMirror` (ADR-0018 · GOAL-013).
 *
 * Estado **atual do projeto**: o bucket privado exclusivo do Fiscal (definido
 * na ADR-0014 para **segredos** e mencionado no GOAL-013 para possível
 * espelho de XML autorizado) **não está provisionado**. Esta implementação
 * inativa é o único backend aceito neste GOAL. Quando um backend real for
 * provisionado (sprint própria), implementar `SupabaseVaultStorageVault` em
 * arquivo próprio NUNCA alterando este no-op — para permitir rollback claro.
 *
 * Garantias:
 * - `active === false` em todas chamadas; `storeMirror` devolve
 *   `xmlStorageRef: null`; nada acessa rede, arquivo, KMS ou bucket.
 * - Nenhuma credencial/role/bucket é criada/consultada.
 * - Não há "silêncio" enganador: o comportamento no-op é **documentado** e
 *   auditável; o caller deixa `xmlStorageRef` em `null` na coluna, conforme
 *   ADR-0018 §2.4.
 */
import type { XmlStorageMirror } from "./types"

export const noopXmlStorageMirror: XmlStorageMirror = {
  active: false,
  async storeMirror() {
    return { xmlStorageRef: null, divergent: false }
  },
  async readMirror() {
    return null
  },
  async verifyAgainstColumn() {
    return {
      divergent: false,
      reason: "mirror_not_provisioned",
    }
  },
}

/**
 * Resolva o espelho ativo. Hoje é **sempre** `noopXmlStorageMirror`. Quando a
 * infra real existir, este factory decide por env/configuração — sem alterar
 * os callers, mantendo a coluna como única fonte da verdade.
 */
export function resolveXmlStorageMirror(): XmlStorageMirror {
  return noopXmlStorageMirror
}