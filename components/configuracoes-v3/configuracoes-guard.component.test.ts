// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import { getPermissionsFromSession, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import { interceptRouteExit } from "@/lib/navigation/route-exit-guard";
import type { GuardaTrocaLoja } from "@/lib/loja-ativa";

const h = vi.hoisted(() => ({
  permissions: null as EnterprisePermissions | null,
  storeId: "loja-a" as string | null,
  lojas: [
    { id: "loja-a", nomeFantasia: "Unidade Alpha QA" },
    { id: "loja-b", nomeFantasia: "Unidade Beta QA" },
  ],
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  registeredStoreGuards: new Set<GuardaTrocaLoja>(),
  navCtx: null as {
    setSectionDirty: (id: "geral", dirty: boolean) => void;
    setSectionSaving: (id: "geral", saving: boolean) => void;
  } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.routerPush, replace: h.routerReplace }),
  usePathname: () => "/dashboard/configuracoes",
  useSearchParams: () => new URLSearchParams("sec=geral"),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    className?: string;
  }) => React.createElement("a", { href, onClick, className }, children),
}));
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({
  useEnterprisePermissions: () => h.permissions,
}));
vi.mock("@/lib/loja-ativa", () => ({
  useLojaAtiva: () => ({
    lojas: h.lojas,
    lojaAtivaId: h.storeId,
    lojaAtivaRaw: h.lojas.find((l) => l.id === h.storeId) ?? null,
    setLojaAtivaId: vi.fn(),
    refreshStoresList: vi.fn(async () => {}),
  }),
  registrarGuardaTrocaLoja: (guarda: GuardaTrocaLoja) => {
    h.registeredStoreGuards.add(guarda);
    return () => {
      h.registeredStoreGuards.delete(guarda);
    };
  },
}));
vi.mock("./contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock("./components/ui/toaster", () => ({
  Toaster: () => null,
}));

import { useConfiguracoesNav } from "./contexts/ConfiguracoesNavContext";

vi.mock("./features/settings/sections/GeralSection", () => ({
  GeralSection: () => {
    const nav = useConfiguracoesNav();
    h.navCtx = {
      setSectionDirty: (id, dirty) => nav.setSectionDirty(id, dirty),
      setSectionSaving: (id, saving) => nav.setSectionSaving(id, saving),
    };
    return React.createElement("div", { "data-testid": "geral-stub" }, "Geral Stub");
  },
}));
vi.mock("./features/settings/sections/LojasSection", () => ({ LojasSection: () => React.createElement("div", null, "Lojas") }));
vi.mock("./features/settings/sections/PlanoSection", () => ({ PlanoSection: () => React.createElement("div", null, "Plano") }));
vi.mock("./features/settings/sections/AparenciaSection", () => ({ AparenciaSection: () => React.createElement("div", null, "Aparencia") }));
vi.mock("./features/settings/sections/PdvSection", () => ({ PdvSection: () => React.createElement("div", null, "PDV") }));
vi.mock("./features/settings/sections/VendasSection", () => ({ VendasSection: () => React.createElement("div", null, "Vendas") }));
vi.mock("./features/settings/sections/FinanceiroSection", () => ({ FinanceiroSection: () => React.createElement("div", null, "Financeiro") }));
vi.mock("./features/settings/sections/FiscalSection", () => ({ FiscalSection: () => React.createElement("div", null, "Fiscal") }));
vi.mock("./features/settings/sections/IaSection", () => ({ IaSection: () => React.createElement("div", null, "IA") }));
vi.mock("./features/settings/sections/IntegracoesSection", () => ({ IntegracoesSection: () => React.createElement("div", null, "Integracoes") }));
vi.mock("./features/settings/sections/ImportacaoSection", () => ({ ImportacaoSection: () => React.createElement("div", null, "Importacao") }));
vi.mock("./features/settings/sections/UsuariosSection", () => ({ UsuariosSection: () => React.createElement("div", null, "Usuarios") }));
vi.mock("./features/settings/sections/AuditoriaSection", () => ({ AuditoriaSection: () => React.createElement("div", null, "Auditoria") }));
vi.mock("./features/settings/sections/SegurancaSection", () => ({ SegurancaSection: () => React.createElement("div", null, "Seguranca") }));

import ConfiguracoesV3Page from "./ConfiguracoesV3Page";

function triggerStoreSwitch(targetId: string, commit: () => void): "livre" | "bloqueada" {
  for (const guarda of h.registeredStoreGuards) {
    if (guarda.temRascunhoSujo()) {
      return guarda.solicitarSaida(commit, `troca de loja para ${targetId}`);
    }
  }
  commit();
  return "livre";
}

describe("ConfiguracoesV3Page — proteção de troca de unidade, navegação, saída e salvamento", () => {
  beforeEach(() => {
    h.permissions = getPermissionsFromSession(
      {
        expires: "2099-01-01",
        user: {
          id: "u-owner",
          role: "ADMIN",
          accessScope: "PLATFORM",
          platformAuthority: true,
          allowedStoreIds: [],
          storeModules: {},
          mustChangePassword: false,
        },
      } as unknown as Session,
      "loja-a",
    );
    h.storeId = "loja-a";
    h.routerPush.mockReset();
    h.routerReplace.mockReset();
    h.registeredStoreGuards.clear();
    h.navCtx = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("troca de unidade com alterações pendentes pede confirmação: Cancelar mantém loja e rascunho; Confirmar executa troca", () => {
    render(React.createElement(ConfiguracoesV3Page));
    act(() => {
      h.navCtx!.setSectionDirty("geral", true);
    });

    const commit = vi.fn();
    let status: "livre" | "bloqueada" = "livre";
    act(() => {
      status = triggerStoreSwitch("loja-b", commit);
    });
    expect(status).toBe("bloqueada");
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText("Alterações não salvas em Geral")).toBeTruthy();
    expect(screen.getByText("Unidade Beta QA")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(commit).not.toHaveBeenCalled();

    // Segunda tentativa: confirmar descarte e trocar unidade
    act(() => {
      status = triggerStoreSwitch("loja-b", commit);
    });
    expect(status).toBe("bloqueada");
    fireEvent.click(screen.getByRole("button", { name: "Descartar e trocar unidade" }));
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("intercepta clique em link do shell global (<a>) e saída programática (⌘K) quando dirty", () => {
    render(
      React.createElement(
        "div",
        null,
        React.createElement("a", { href: "/dashboard/cadastros-v2" }, "Cadastros HUB"),
        React.createElement(ConfiguracoesV3Page),
      ),
    );
    act(() => {
      h.navCtx!.setSectionDirty("geral", true);
    });

    const globalLink = screen.getByRole("link", { name: "Cadastros HUB" });
    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      globalLink.dispatchEvent(clickEvent);
    });
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(screen.getByText("Alterações não salvas em Geral")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(h.routerPush).toHaveBeenCalledWith("/dashboard/cadastros-v2");

    // Reativa dirty e testa saída programática (Command Menu ⌘K)
    act(() => {
      h.navCtx!.setSectionDirty("geral", true);
    });
    let intercepted = false;
    act(() => {
      intercepted = interceptRouteExit("/dashboard/vendas", "Nova Venda");
    });
    expect(intercepted).toBe(true);
    expect(screen.getByText("Nova Venda")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(h.routerPush).toHaveBeenCalledWith("/dashboard/vendas");
  });

  it("durante salvamento em andamento bloqueia troca de unidade e desabilita saída destrutiva até concluir", () => {
    render(React.createElement(ConfiguracoesV3Page));
    act(() => {
      h.navCtx!.setSectionDirty("geral", true);
      h.navCtx!.setSectionSaving("geral", true);
    });

    const commit = vi.fn();
    let status: "livre" | "bloqueada" = "livre";
    act(() => {
      status = triggerStoreSwitch("loja-b", commit);
    });
    expect(status).toBe("bloqueada");
    expect(screen.getByText("Salvamento em andamento em Geral")).toBeTruthy();
    const disabledAction = screen.getByRole("button", { name: "Salvando…" }) as HTMLButtonElement;
    expect(disabledAction.disabled).toBe(true);
    fireEvent.click(disabledAction);
    expect(commit).not.toHaveBeenCalled();

    // Quando o salvamento conclui com sucesso, o diálogo libera a continuação segura
    act(() => {
      h.navCtx!.setSectionSaving("geral", false);
      h.navCtx!.setSectionDirty("geral", false);
    });
    expect(screen.getByText("Salvamento concluído")).toBeTruthy();
    const proceed = screen.getByRole("button", { name: "Trocar para Unidade Beta QA" }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(false);
    fireEvent.click(proceed);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("ativa beforeunload enquanto dirty ou salvando e desativa quando limpo", () => {
    render(React.createElement(ConfiguracoesV3Page));

    const cleanEvt = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvt);
    expect(cleanEvt.defaultPrevented).toBe(false);

    act(() => {
      h.navCtx!.setSectionSaving("geral", true);
    });
    const savingEvt = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savingEvt);
    expect(savingEvt.defaultPrevented).toBe(true);

    act(() => {
      h.navCtx!.setSectionSaving("geral", false);
    });
    const afterEvt = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterEvt);
    expect(afterEvt.defaultPrevented).toBe(false);
  });
});
