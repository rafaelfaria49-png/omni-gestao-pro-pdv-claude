import {
  LucideIcon,
  Settings,
  Store,
  Palette,
  Monitor,
  ShoppingCart,
  Wallet,
  Sparkles,
  Plug,
  Upload,
  Users,
  ShieldCheck,
  CreditCard,
  ClipboardList,
  ReceiptText,
} from "lucide-react";

export type SectionId =
  | "geral"
  | "lojas"
  | "plano"
  | "aparencia"
  | "pdv"
  | "vendas"
  | "financeiro"
  | "fiscal"
  | "ia"
  | "integracoes"
  | "importacao"
  | "usuarios"
  | "auditoria"
  | "seguranca";

export type PlatformGroupId = "unidade" | "operacao" | "financas" | "governanca";
export type ClientGroupId = "sua-loja" | "operacao-conta";

export interface SectionItem {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Grupo de domínio exibido na sidebar para visão Plataforma. */
  platformGroup: PlatformGroupId;
  /** Grupo de domínio exibido na sidebar para visão Cliente. */
  clientGroup: ClientGroupId;
  /** Quando definido, o item do menu navega para esta rota em vez de trocar a seção interna. */
  href?: string;
  /** Nome exibido na experiência do cliente; id e rota não mudam. */
  clientLabel?: string;
}

export const SETTINGS_PLATFORM_GROUPS: ReadonlyArray<{ id: PlatformGroupId; label: string }> = [
  { id: "unidade", label: "Unidade e conta" },
  { id: "operacao", label: "Operação e PDV" },
  { id: "financas", label: "Finanças, fiscal e IA" },
  { id: "governanca", label: "Equipe e governança" },
];

export const SETTINGS_CLIENT_GROUPS: ReadonlyArray<{ id: ClientGroupId; label: string }> = [
  { id: "sua-loja", label: "Sua loja" },
  { id: "operacao-conta", label: "Operação e conta" },
];

export const SETTINGS_SECTIONS: SectionItem[] = [
  {
    id: "geral",
    label: "Geral",
    description: "Dados da empresa e preferências",
    icon: Settings,
    platformGroup: "unidade",
    clientGroup: "sua-loja",
    clientLabel: "Dados da loja",
  },
  {
    id: "lojas",
    label: "Lojas",
    description: "Gerencie suas unidades",
    icon: Store,
    platformGroup: "unidade",
    clientGroup: "sua-loja",
  },
  {
    id: "plano",
    label: "Plano e Assinatura",
    description: "Assinatura, créditos e cobrança",
    icon: CreditCard,
    platformGroup: "unidade",
    clientGroup: "sua-loja",
    href: "/dashboard/billing",
  },
  {
    id: "aparencia",
    label: "Aparência",
    description: "Tema visual do sistema",
    icon: Palette,
    platformGroup: "unidade",
    clientGroup: "sua-loja",
  },
  {
    id: "pdv",
    label: "PDV",
    description: "Layout do ponto de venda",
    icon: Monitor,
    platformGroup: "operacao",
    clientGroup: "operacao-conta",
    clientLabel: "PDV e impressão",
  },
  {
    id: "vendas",
    label: "Vendas",
    description: "Regras de operação",
    icon: ShoppingCart,
    platformGroup: "operacao",
    clientGroup: "operacao-conta",
    clientLabel: "Vendas e pagamentos",
  },
  {
    id: "financeiro",
    label: "Financeiro",
    description: "Juros, parcelas e relatórios",
    icon: Wallet,
    platformGroup: "financas",
    clientGroup: "operacao-conta",
  },
  {
    id: "fiscal",
    label: "Identidade Fiscal",
    description: "Dados fiscais, certificado e CSC por loja",
    icon: ReceiptText,
    platformGroup: "financas",
    clientGroup: "operacao-conta",
  },
  {
    id: "ia",
    label: "IA e Créditos",
    description: "Saldo e modelos de IA",
    icon: Sparkles,
    platformGroup: "financas",
    clientGroup: "operacao-conta",
  },
  {
    id: "integracoes",
    label: "Integrações",
    description: "Conecte serviços externos",
    icon: Plug,
    platformGroup: "financas",
    clientGroup: "operacao-conta",
  },
  {
    id: "importacao",
    label: "Importação",
    description: "Planilhas e dados externos",
    icon: Upload,
    platformGroup: "financas",
    clientGroup: "operacao-conta",
  },
  {
    id: "usuarios",
    label: "Usuários e Permissões",
    description: "Equipe e acessos",
    icon: Users,
    platformGroup: "governanca",
    clientGroup: "operacao-conta",
    clientLabel: "Equipe",
  },
  {
    id: "auditoria",
    label: "Auditoria",
    description: "Histórico de alterações críticas",
    icon: ClipboardList,
    platformGroup: "governanca",
    clientGroup: "operacao-conta",
  },
  {
    id: "seguranca",
    label: "Segurança",
    description: "Senha e sessões",
    icon: ShieldCheck,
    platformGroup: "governanca",
    clientGroup: "operacao-conta",
    clientLabel: "Segurança da conta",
  },
];

export function sectionLabel(section: SectionItem | undefined, client: boolean | null): string {
  if (!section) return "";
  return client ? section.clientLabel ?? section.label : section.label;
}
