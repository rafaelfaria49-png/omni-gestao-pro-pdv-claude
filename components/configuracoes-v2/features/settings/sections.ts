export type SettingsSectionId =
  | "geral"
  | "usuarios"
  | "seguranca"
  | "aparencia"
  | "integracoes"
  | "ia"
  | "lojas"
  | "pdv"
  | "vendas"
  | "financeiro";

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  label: string;
  description?: string;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "geral", label: "Geral", description: "Preferências e parâmetros do sistema." },
  { id: "usuarios", label: "Usuários", description: "Perfis, permissões e acessos." },
  { id: "seguranca", label: "Segurança", description: "Senha, sessões e validações." },
  { id: "aparencia", label: "Aparência", description: "Tema, layout e identidade." },
  { id: "integracoes", label: "Integrações", description: "Conexões e chaves de serviços." },
  { id: "ia", label: "IA", description: "Recursos inteligentes e automações." },
  { id: "lojas", label: "Lojas", description: "Unidades e parâmetros por loja." },
  { id: "pdv", label: "PDV", description: "Caixa, impressão e atalhos." },
  { id: "vendas", label: "Vendas", description: "Regras e parâmetros comerciais." },
  { id: "financeiro", label: "Financeiro", description: "Contas, conciliação e limites." },
];
