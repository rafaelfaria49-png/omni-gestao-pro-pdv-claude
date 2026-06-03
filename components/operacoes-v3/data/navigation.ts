// ============================================================================
// Operações V3 — Definição das 19 telas (labels, ícones, grupos, nível de dado)
// ============================================================================

import {
  LayoutDashboard,
  ListChecks,
  Zap,
  Hammer,
  Clock,
  ClipboardList,
  CreditCard,
  FileText,
  ShieldCheck,
  RotateCcw,
  Globe,
  Bell,
  Wrench,
  Package,
  MapPin,
  Users,
  History,
  BarChart3,
  Settings,
} from "lucide-react";
import type { NavGroup, NavItem } from "./types";

export const NAV_GROUPS: NavGroup[] = [
  { id: "operacao", label: "Operação" },
  { id: "comercial", label: "Comercial" },
  { id: "pos-venda", label: "Pós-venda" },
  { id: "catalogo", label: "Catálogo" },
  { id: "gestao", label: "Gestão" },
];

export const NAV_ITEMS: NavItem[] = [
  // ── Operação ──────────────────────────────────────────────────────────────
  { id: "dashboard", label: "Dashboard", short: "Painel", icon: LayoutDashboard, group: "operacao", dataLevel: "real", description: "Visão geral operacional do dia" },
  { id: "fila", label: "Fila de OS", short: "Fila", icon: ListChecks, group: "operacao", dataLevel: "real", description: "Kanban e lista de ordens de serviço" },
  { id: "atendimento", label: "Atendimento rápido", short: "Check-in", icon: Zap, group: "operacao", dataLevel: "placeholder", description: "Check-in de entrada do equipamento" },
  { id: "bancada", label: "Bancada por técnico", short: "Bancada", icon: Hammer, group: "operacao", dataLevel: "real", description: "OS agrupadas por técnico" },
  { id: "sla", label: "SLA & atrasos", short: "SLA", icon: Clock, group: "operacao", dataLevel: "real", description: "Prazos em risco e estourados" },
  { id: "workspace", label: "OS Workspace", short: "OS", icon: ClipboardList, group: "operacao", dataLevel: "real", description: "Visão única e contínua da OS" },

  // ── Comercial ─────────────────────────────────────────────────────────────
  { id: "pdv-servico", label: "PDV de serviço", short: "Receber", icon: CreditCard, group: "comercial", dataLevel: "placeholder", description: "Recebimento e fechamento de balcão" },
  { id: "orcamentos", label: "Orçamentos", short: "Orçam.", icon: FileText, group: "comercial", dataLevel: "real", description: "Funil de orçamentos por status" },

  // ── Pós-venda ─────────────────────────────────────────────────────────────
  { id: "garantias", label: "Garantias", short: "Garantia", icon: ShieldCheck, group: "pos-venda", dataLevel: "real", description: "Garantias ativas, vencendo e expiradas" },
  { id: "retornos", label: "Retornos & retrabalho", short: "Retornos", icon: RotateCcw, group: "pos-venda", dataLevel: "placeholder", description: "Retrabalho e reincidência" },
  { id: "portal", label: "Portal do cliente", short: "Portal", icon: Globe, group: "pos-venda", dataLevel: "placeholder", description: "Acompanhamento público da OS" },
  { id: "notificacoes", label: "Notificações", short: "Avisos", icon: Bell, group: "pos-venda", dataLevel: "placeholder", description: "Automações e mensagens" },

  // ── Catálogo ──────────────────────────────────────────────────────────────
  { id: "servicos", label: "Serviços", short: "Serviços", icon: Wrench, group: "catalogo", dataLevel: "parcial", description: "Catálogo de serviços" },
  { id: "pecas", label: "Peças & pedidos", short: "Peças", icon: Package, group: "catalogo", dataLevel: "placeholder", description: "Reserva e pedido de peças" },
  { id: "rastreio", label: "Rastreio físico", short: "Rastreio", icon: MapPin, group: "catalogo", dataLevel: "placeholder", description: "Localização física do aparelho" },

  // ── Gestão ────────────────────────────────────────────────────────────────
  { id: "tecnicos", label: "Técnicos", short: "Técnicos", icon: Users, group: "gestao", dataLevel: "parcial", description: "Equipe e carga de trabalho" },
  { id: "historico", label: "Histórico de clientes", short: "Clientes", icon: History, group: "gestao", dataLevel: "real", description: "Histórico por cliente e aparelho" },
  { id: "relatorios", label: "Relatórios", short: "BI", icon: BarChart3, group: "gestao", dataLevel: "placeholder", description: "Relatórios e indicadores" },
  { id: "configuracoes", label: "Configurações", short: "Config", icon: Settings, group: "gestao", dataLevel: "placeholder", description: "Configuração do módulo" },
];

export const NAV_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.id, n]),
);

export function navItem(id: string): NavItem | undefined {
  return NAV_BY_ID[id];
}

export function navItemsByGroup(groupId: string): NavItem[] {
  return NAV_ITEMS.filter((n) => n.group === groupId);
}
