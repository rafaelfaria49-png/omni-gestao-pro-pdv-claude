/**
 * Permissões do domínio de aparelhos (OMNI-APARELHOS-ENDTOEND-001).
 * Derivadas do papel enterprise canônico — sem ACL nova no banco. O servidor é a
 * autoridade; a UI só usa o mesmo cálculo para esconder ações.
 *
 * - admin (proprietário): tudo, inclusive política da loja.
 * - gerente: aprova aquisições de OUTROS operadores, vê custo/dados sensíveis.
 * - vendedor: cadastra, registra compra (sem aprovar), reserva, vende — sem custo.
 * - caixa: consulta para venda, reserva, vende e reimprime — sem custo, sem cadastro.
 * - tecnico: cadastra/avalia (checklist), sem venda e sem custo.
 */
import { enterpriseRoleFromUserRole, type EnterpriseRole } from "@/lib/auth/enterprise-permissions"

export type AparelhoPermissions = {
  role: EnterpriseRole
  consultar: boolean
  cadastrar: boolean
  editar: boolean
  comprarDeCliente: boolean
  aprovarAquisicao: boolean
  verCusto: boolean
  definirCusto: boolean
  definirPreco: boolean
  reservar: boolean
  vender: boolean
  configurarGarantia: boolean
  reimprimir: boolean
  dadosSensiveis: boolean
  alterarStatus: boolean
}

const NONE: Omit<AparelhoPermissions, "role"> = {
  consultar: false, cadastrar: false, editar: false, comprarDeCliente: false, aprovarAquisicao: false,
  verCusto: false, definirCusto: false, definirPreco: false, reservar: false, vender: false,
  configurarGarantia: false, reimprimir: false, dadosSensiveis: false, alterarStatus: false,
}

export function aparelhoPermissionsForRole(rawRole: string | null | undefined, opts?: { platform?: boolean }): AparelhoPermissions {
  const role: EnterpriseRole = opts?.platform ? "admin" : enterpriseRoleFromUserRole(rawRole)
  switch (role) {
    case "admin":
      return { role, consultar: true, cadastrar: true, editar: true, comprarDeCliente: true, aprovarAquisicao: true,
        verCusto: true, definirCusto: true, definirPreco: true, reservar: true, vender: true,
        configurarGarantia: true, reimprimir: true, dadosSensiveis: true, alterarStatus: true }
    case "gerente":
      return { role, consultar: true, cadastrar: true, editar: true, comprarDeCliente: true, aprovarAquisicao: true,
        verCusto: true, definirCusto: true, definirPreco: true, reservar: true, vender: true,
        configurarGarantia: false, reimprimir: true, dadosSensiveis: true, alterarStatus: true }
    case "vendedor":
      return { ...NONE, role, consultar: true, cadastrar: true, editar: true, comprarDeCliente: true,
        definirPreco: false, reservar: true, vender: true, reimprimir: true }
    case "caixa":
      return { ...NONE, role, consultar: true, reservar: true, vender: true, reimprimir: true }
    case "tecnico":
      return { ...NONE, role, consultar: true, cadastrar: true, editar: true }
    default:
      return { ...NONE, role }
  }
}

/** Segregação de funções: gerente não aprova a própria aquisição; proprietário pode. */
export function podeAprovarAquisicao(p: AparelhoPermissions, criadorId: string, aprovadorId: string): boolean {
  if (!p.aprovarAquisicao) return false
  if (p.role === "admin") return true
  return criadorId.trim() !== "" && criadorId !== aprovadorId
}
