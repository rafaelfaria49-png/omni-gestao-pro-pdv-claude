// ============================================================================
// Operações V3 — Tipos locais da casca (sem tocar nos DTOs reais de OS)
// ----------------------------------------------------------------------------
// Estes tipos descrevem APENAS a navegação/estrutura visual da V3.
// O domínio real de OS continua em `@/types/os` (OrdemServico, OSStatus…).
// ============================================================================

import type { LucideIcon } from "lucide-react";

/** As 19 telas navegáveis da Operações V3. */
export type ScreenId =
  | "dashboard"
  | "fila"
  | "atendimento"
  | "bancada"
  | "sla"
  | "workspace"
  | "pdv-servico"
  | "orcamentos"
  | "garantias"
  | "retornos"
  | "portal"
  | "notificacoes"
  | "servicos"
  | "pecas"
  | "rastreio"
  | "tecnicos"
  | "historico"
  | "relatorios"
  | "configuracoes";

/**
 * Nível de dado de cada tela NESTA sprint (casca):
 * - `real`        → leitura de dados reais (Server Actions de OS)
 * - `parcial`     → parte real + parte honestamente "a conectar"
 * - `placeholder` → estrutura visual honesta, sem dados reais
 */
export type DataLevel = "real" | "parcial" | "placeholder";

export type NavGroupId = "operacao" | "comercial" | "pos-venda" | "catalogo" | "gestao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
}

export interface NavItem {
  id: ScreenId;
  label: string;
  /** Rótulo curto para chips de navegação no mobile. */
  short: string;
  icon: LucideIcon;
  group: NavGroupId;
  dataLevel: DataLevel;
  description: string;
}
