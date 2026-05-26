export type PanelTeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  active: boolean;
  initials: string;
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  OPERADOR: "Operador",
  CAIXA: "Caixa",
  TECNICO: "Técnico",
  VENDEDOR: "Vendedor",
};

export function panelMemberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function mapAdminUserToPanelMember(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}): PanelTeamMember {
  const role = String(u.role || "").toUpperCase();
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role,
    roleLabel: ROLE_LABEL[role] ?? role,
    active: u.active !== false,
    initials: panelMemberInitials(u.name),
  };
}
