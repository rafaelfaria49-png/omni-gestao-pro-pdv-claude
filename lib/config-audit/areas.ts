import type { ConfigAuditArea } from "./types"

/** Infere a área de filtro a partir do caminho do campo alterado. */
export function inferConfigAuditArea(field: string): ConfigAuditArea {
  const f = field.toLowerCase()

  if (f.includes("maquininha")) return "maquininhas"
  if (f.includes("imposto") || f.includes("aliquota")) return "impostos"
  if (f.includes("modulocontrole") || f.includes("modulo_controle") || f.startsWith("modulo")) {
    return "modulos"
  }
  if (f.includes("credi") || f.includes("fiado") || f.includes("juros") || f.includes("parcela_credi")) {
    return "crediario"
  }
  if (
    f.includes("impressao") ||
    f.includes("impressora") ||
    f.includes("bobina") ||
    f.includes("gaveta") ||
    f.includes("comprovante") ||
    f.includes("viascupom")
  ) {
    return "pdv"
  }
  if (
    f.includes("pdv") ||
    f.includes("v3_pdv") ||
    f.includes("pdvclassic") ||
    f.includes("pdvparams.pdvclassic") ||
    f.includes("layout")
  ) {
    return "pdv"
  }
  if (
    f === "role" ||
    f.includes("allowedstore") ||
    f.includes("storeids") ||
    f.includes("adminuserstore")
  ) {
    return "permissoes"
  }
  if (
    f === "name" ||
    f === "email" ||
    f === "active" ||
    f === "lojaid" ||
    f.includes("password") ||
    f.includes("usuario")
  ) {
    return "usuarios"
  }
  if (f.startsWith("cardfees") || f.includes("metafaturamento") || f.includes("contas") || f.includes("pix")) {
    return "financeiro"
  }
  return "financeiro"
}

export function isConfigAuditArea(value: string): value is ConfigAuditArea {
  return (
    value === "financeiro" ||
    value === "pdv" ||
    value === "impostos" ||
    value === "crediario" ||
    value === "usuarios" ||
    value === "permissoes" ||
    value === "maquininhas" ||
    value === "modulos"
  )
}
