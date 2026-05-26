/** Áreas de filtro da Central de Auditoria (Config V3). */
export type ConfigAuditArea =
  | "financeiro"
  | "pdv"
  | "impostos"
  | "crediario"
  | "usuarios"
  | "permissoes"
  | "maquininhas"
  | "modulos"

export const CONFIG_AUDIT_AREAS: ConfigAuditArea[] = [
  "financeiro",
  "pdv",
  "impostos",
  "crediario",
  "usuarios",
  "permissoes",
  "maquininhas",
  "modulos",
]

export const CONFIG_AUDIT_AREA_LABELS: Record<ConfigAuditArea, string> = {
  financeiro: "Financeiro",
  pdv: "PDV",
  impostos: "Impostos",
  crediario: "Crediário",
  usuarios: "Usuários",
  permissoes: "Permissões",
  maquininhas: "Maquininhas",
  modulos: "Módulos",
}

/** Seção da UI Config V3 onde a alteração ocorreu. */
export type ConfigAuditSection =
  | "geral"
  | "pdv"
  | "vendas"
  | "financeiro"
  | "usuarios"
  | "seguranca"

export const CONFIG_AUDIT_SOURCE = "configuracoes-v3"
export const CONFIG_AUDIT_ACTION_PREFIX = "config:"

export type ConfigAuditActor = {
  userId: string | null
  userLabel: string
  userEmail?: string | null
}

export type ConfigAuditChangeInput = {
  field: string
  oldValue: unknown
  newValue: unknown
  area?: ConfigAuditArea
}

export type ConfigAuditMetadataV1 = {
  v: 1
  storeId: string
  section: ConfigAuditSection
  area: ConfigAuditArea
  field: string
  oldValue: string
  newValue: string
  userId: string | null
  userEmail?: string | null
  ip: string | null
  userAgent: string | null
}

export type ConfigAuditLogRow = {
  id: string
  at: string
  action: string
  userLabel: string
  detail: string
  area: ConfigAuditArea
  section: ConfigAuditSection
  storeId: string
  field: string
  oldValue: string
  newValue: string
  ip: string | null
  userAgent: string | null
}
