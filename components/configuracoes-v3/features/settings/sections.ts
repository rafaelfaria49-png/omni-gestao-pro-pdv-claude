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
} from "lucide-react";

export type SectionId =
  | "geral"
  | "lojas"
  | "plano"
  | "aparencia"
  | "pdv"
  | "vendas"
  | "financeiro"
  | "ia"
  | "integracoes"
  | "importacao"
  | "usuarios"
  | "seguranca";

export interface SectionItem {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Quando definido, o item do menu navega para esta rota em vez de trocar a seção interna. */
  href?: string;
}

export const SETTINGS_SECTIONS: SectionItem[] = [
  { id: "geral", label: "Geral", description: "Dados da empresa e preferências", icon: Settings },
  { id: "lojas", label: "Lojas", description: "Gerencie suas unidades", icon: Store },
  {
    id: "plano",
    label: "Plano e Assinatura",
    description: "Assinatura, créditos e cobrança",
    icon: CreditCard,
    href: "/dashboard/billing",
  },
  { id: "aparencia", label: "Aparência", description: "Tema visual do sistema", icon: Palette },
  { id: "pdv", label: "PDV", description: "Layout do ponto de venda", icon: Monitor },
  { id: "vendas", label: "Vendas", description: "Regras de operação", icon: ShoppingCart },
  { id: "financeiro", label: "Financeiro", description: "Juros, parcelas e relatórios", icon: Wallet },
  { id: "ia", label: "IA e Créditos", description: "Saldo e modelos de IA", icon: Sparkles },
  { id: "integracoes", label: "Integrações", description: "Conecte serviços externos", icon: Plug },
  { id: "importacao", label: "Importação", description: "Planilhas e dados externos", icon: Upload },
  { id: "usuarios", label: "Usuários e Permissões", description: "Equipe e acessos", icon: Users },
  { id: "seguranca", label: "Segurança", description: "Senha e sessões", icon: ShieldCheck },
];
