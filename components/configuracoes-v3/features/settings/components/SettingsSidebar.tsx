"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  SETTINGS_CLIENT_GROUPS,
  SETTINGS_PLATFORM_GROUPS,
  SETTINGS_SECTIONS,
  sectionLabel,
  type SectionId,
  type SectionItem,
} from "../sections";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { canAccessSettingsSection } from "@/lib/auth/page-access";
import { usesClientExperience } from "@/lib/navigation/client-experience";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";

interface SettingsSidebarProps {
  active: SectionId;
  onChange: (id: SectionId) => void;
  /** Slot opcional para ação de cabeçalho no drawer mobile/tablet (ex.: SheetClose). */
  headerAction?: ReactNode;
}

export function unitMonogram(name: string | null | undefined): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w));
  if (words.length === 0) return "UN";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function SettingsSidebar({ active, onChange, headerAction }: SettingsSidebarProps) {
  const permissions = useEnterprisePermissions();
  const client = usesClientExperience(permissions);
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const { dirtySections, requestExternalNavigation } = useConfiguracoesNav();

  const hasStore = Boolean(lojaAtivaId?.trim());
  const storeName = hasStore
    ? lojaAtivaRaw?.nomeFantasia?.trim() || "Unidade ativa"
    : "Nenhuma unidade ativa";
  const monogram = hasStore ? unitMonogram(storeName) : "!";

  const allowedSections = SETTINGS_SECTIONS.filter((s) => canAccessSettingsSection(permissions, s.id));
  const groups: ReadonlyArray<{ id: string; label: string; items: SectionItem[] }> = (
    client ? SETTINGS_CLIENT_GROUPS : SETTINGS_PLATFORM_GROUPS
  )
    .map((g) => ({
      id: g.id,
      label: g.label,
      items: allowedSections.filter((s) => (client ? s.clientGroup === g.id : s.platformGroup === g.id)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <aside
      aria-label="Navegação de Configurações"
      className="settings-sidebar-aside border-r border-border lg:w-[228px] lg:shrink-0 select-none"
    >
      <div className="settings-sidebar-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[11px] font-bold tracking-tight"
            style={{
              backgroundColor: hasStore ? "var(--cfg-primary-soft)" : "var(--cfg-warning-soft)",
              borderColor: hasStore ? "var(--cfg-primary-border)" : "var(--cfg-warning-border)",
              color: hasStore ? "var(--cfg-primary-text)" : "var(--cfg-warning-fg)",
            }}
          >
            {monogram}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--cfg-fg)" }}>
              Configurações
            </p>
            <p
              className="mt-0.5 flex items-center gap-1.5 truncate text-[11px]"
              style={{ color: hasStore ? "var(--cfg-muted)" : "var(--cfg-warning-fg)" }}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: hasStore ? "var(--cfg-success-dot)" : "var(--cfg-warning-dot)" }}
              />
              <span className="truncate">{storeName}</span>
            </p>
          </div>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      <nav className="settings-sidebar-nav scroll-elegant">
        {/* Mantém .settings-sidebar-list com <li> exclusivos para os itens de navegação (contrato de DOM/E2E). */}
        <div className="settings-sidebar-list">
          {groups.map((group) => (
            <div key={group.id}>
              <div className="settings-sidebar-group-title">{group.label}</div>
              <ul className="settings-sidebar-group-items">
                {group.items.map((s) => {
                  const isActive = !s.href && active === s.id;
                  const isDirty = !s.href && dirtySections.has(s.id);
                  const Icon = s.icon;
                  const label = sectionLabel(s, client);

                  return (
                    <li key={s.id}>
                      {s.href ? (
                        <Link
                          href={s.href}
                          data-active="false"
                          onClick={(event) => {
                            if (requestExternalNavigation(s.href!, label)) {
                              event.preventDefault();
                            }
                          }}
                          className="settings-sidebar-item-btn"
                        >
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                            style={{ color: "var(--cfg-muted)" }}
                          />
                          <span className="flex-1 truncate">{label}</span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: "var(--cfg-subtle)" }}
                          />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onChange(s.id)}
                          data-active={isActive ? "true" : "false"}
                          aria-current={isActive ? "page" : undefined}
                          className="settings-sidebar-item-btn"
                        >
                          {isActive ? <span aria-hidden="true" className="settings-sidebar-active-bar" /> : null}
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                            style={{ color: isActive ? "var(--cfg-primary-text)" : "var(--cfg-muted)" }}
                          />
                          <span className="flex-1 truncate">{label}</span>
                          {isDirty ? (
                            <span
                              aria-hidden="true"
                              title="Alterações não salvas"
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: "var(--cfg-warning-dot)" }}
                            />
                          ) : null}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}
