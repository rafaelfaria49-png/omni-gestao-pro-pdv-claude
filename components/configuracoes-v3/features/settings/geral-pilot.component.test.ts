// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Session } from "next-auth";
import { BASIC_MODULE_ACCESS, MODULES } from "@/lib/auth/access-policy";
import { getPermissionsFromSession, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1";
import type { SectionId } from "./sections";

function makePermissions(kind: "owner" | "client" | "readonly"): EnterprisePermissions {
  const user =
    kind === "owner"
      ? { id: "u-owner", role: "ADMIN", accessScope: "PLATFORM", platformAuthority: true, allowedStoreIds: [], storeModules: {} }
      : kind === "client"
        ? { id: "u-client", role: "ADMIN", accessScope: "STORE", platformAuthority: false, allowedStoreIds: ["loja-a"], storeModules: { "loja-a": [...BASIC_MODULE_ACCESS.modules] } }
        : { id: "u-ro", role: "CAIXA", accessScope: "STORE", platformAuthority: false, allowedStoreIds: ["loja-a"], storeModules: { "loja-a": [...MODULES] } };
  return getPermissionsFromSession(
    { expires: "2099-01-01", user: { ...user, mustChangePassword: false } } as unknown as Session,
    "loja-a",
  );
}

const h = vi.hoisted(() => ({
  permissions: null as EnterprisePermissions | null,
  storeId: "loja-a" as string | null,
  storeName: "NovaTech Sintética",
  storeCnpj: "00.000.000/0001-99",
  storeProfile: "ASSISTENCIA" as "ASSISTENCIA" | "VARIEDADES" | "SUPERMERCADO",
  capabilities: { version: 1, business: { primaryBranch: "assistencia" } } as StoreCapabilitiesV1 | null,
  settingsLoaded: true,
  settingsHydrated: true,
  settingsPrinterConfig: {
    v3PdvSectionCard: "classico",
    pdvParams: { pdvClassicLayout: "lovable", garantiaPadraoDias: 90, validadeOrcamentoDias: 7 },
  } as Record<string, unknown>,
  settingsCardFees: {} as Record<string, unknown>,
  saveBusiness: vi.fn(async (_patch: unknown) => {}),
  refreshSettings: vi.fn(async () => {}),
  refreshStoresList: vi.fn(async () => {}),
  toast: vi.fn(),
  navigateToSection: vi.fn(),
  setSectionDirty: vi.fn(),
  dirtySections: new Set<SectionId>(),
  sessionUser: { id: "u-owner", sessionVersion: 1 } as { id: string; sessionVersion: number } | null,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: h.sessionUser ? { user: h.sessionUser } : null }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({
  useEnterprisePermissions: () => h.permissions,
}));
vi.mock("@/lib/loja-ativa", () => ({
  useLojaAtiva: () => ({
    lojaAtivaId: h.storeId,
    lojaAtivaRaw: h.storeId
      ? { id: h.storeId, nomeFantasia: h.storeName, cnpj: h.storeCnpj, storeProfile: h.storeProfile }
      : null,
    refreshStoresList: h.refreshStoresList,
  }),
}));
vi.mock("@/lib/store-settings-provider", () => ({
  useStoreSettings: () => ({
    storeId: h.storeId ?? "",
    hydrated: h.settingsHydrated,
    loaded: h.settingsLoaded,
    capabilities: h.capabilities,
    settings: h.settingsLoaded
      ? {
          storeId: h.storeId ?? "",
          contactWhatsapp: "",
          printerConfig: h.settingsPrinterConfig,
          cardFees: h.settingsCardFees,
        }
      : null,
    refresh: h.refreshSettings,
    save: h.saveBusiness,
  }),
}));
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));
vi.mock("@/components/configuracoes-v3/contexts/ConfiguracoesNavContext", () => ({
  useConfiguracoesNav: () => ({
    navigateToSection: h.navigateToSection,
    requestExternalNavigation: () => false,
    setSectionDirty: h.setSectionDirty,
    dirtySections: h.dirtySections,
  }),
}));

import { GeralSection } from "./sections/GeralSection";
import { SettingsSidebar } from "./components/SettingsSidebar";

type StoreFixture = {
  id: string;
  name: string;
  cnpj: string;
  phone: string;
  address: Record<string, string>;
  contactEmail: string;
  contactWhatsapp: string;
  contactWhatsappDono: string;
};

function stubStoreApi(
  stores: Record<string, StoreFixture>,
  opts: {
    failSettingsPut?: boolean;
    usersStatus?: number;
    usersBody?: { users: Array<{ role: string; active: boolean }> };
    delayStorePut?: () => Promise<void>;
  } = {},
) {
  const puts: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string, init?: RequestInit) => {
      const url = String(rawUrl);
      if (url.includes("/api/admin/users")) {
        const status = opts.usersStatus ?? 200;
        if (status !== 200) return Response.json({ error: "denied" }, { status });
        return Response.json(opts.usersBody ?? { users: [{ role: "CAIXA", active: true }] });
      }
      const match = url.match(/\/api\/stores\/([^/]+)(\/settings)?/);
      const id = match?.[1] ?? "loja-a";
      const isSettings = Boolean(match?.[2]);
      const record = stores[id];
      if (!record) return Response.json({ error: "not found" }, { status: 404 });

      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        puts.push({ url, body });
        if (isSettings) {
          if (opts.failSettingsPut) return Response.json({ error: "erro sintético" }, { status: 500 });
          if (typeof body.contactEmail === "string") record.contactEmail = body.contactEmail;
          if (typeof body.contactWhatsapp === "string") record.contactWhatsapp = body.contactWhatsapp;
          if (typeof body.contactWhatsappDono === "string") record.contactWhatsappDono = body.contactWhatsappDono;
          return Response.json({ ok: true });
        }
        if (opts.delayStorePut) await opts.delayStorePut();
        if (typeof body.name === "string") record.name = body.name;
        if (typeof body.cnpj === "string") record.cnpj = body.cnpj;
        if (typeof body.phone === "string") record.phone = body.phone;
        if (body.address && typeof body.address === "object") {
          record.address = { ...record.address, ...(body.address as Record<string, string>) };
        }
        return Response.json({ ok: true });
      }

      if (isSettings) {
        return Response.json({
          settings: {
            storeId: record.id,
            contactEmail: record.contactEmail,
            contactWhatsapp: record.contactWhatsapp,
            contactWhatsappDono: record.contactWhatsappDono,
          },
        });
      }
      return Response.json({
        store: {
          id: record.id,
          name: record.name,
          cnpj: record.cnpj,
          phone: record.phone,
          address: record.address,
        },
      });
    }),
  );
  return { puts };
}

function defaultFixtures(): Record<string, StoreFixture> {
  return {
    "loja-a": {
      id: "loja-a",
      name: "NovaTech Sintética",
      cnpj: "00.000.000/0001-99",
      phone: "(11) 3000-0100",
      address: { rua: "Av. Exemplo", numero: "100", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01000-000" },
      contactEmail: "contato@novatech.invalid",
      contactWhatsapp: "",
      contactWhatsappDono: "",
    },
    "loja-b": {
      id: "loja-b",
      name: "Filial B Sintética",
      cnpj: "00.000.000/0002-80",
      phone: "(11) 3000-0200",
      address: { rua: "Rua B", numero: "200", bairro: "Jardins", cidade: "Campinas", estado: "SP", cep: "13000-000" },
      contactEmail: "filialb@novatech.invalid",
      contactWhatsapp: "(11) 98888-7777",
      contactWhatsappDono: "",
    },
  };
}

beforeEach(() => {
  h.permissions = makePermissions("owner");
  h.storeId = "loja-a";
  h.storeName = "NovaTech Sintética";
  h.storeCnpj = "00.000.000/0001-99";
  h.storeProfile = "ASSISTENCIA";
  h.capabilities = { version: 1, business: { primaryBranch: "assistencia" } };
  h.settingsLoaded = true;
  h.settingsHydrated = true;
  h.settingsCardFees = {};
  h.saveBusiness.mockReset().mockResolvedValue(undefined);
  h.refreshSettings.mockClear();
  h.refreshStoresList.mockClear();
  h.toast.mockClear();
  h.navigateToSection.mockClear();
  h.setSectionDirty.mockClear();
  h.dirtySections = new Set();
  h.sessionUser = { id: "u-owner", sessionVersion: 1 };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Piloto Omni Premium — Sidebar agrupada e contratos de DOM", () => {
  it("mantém .settings-sidebar-list com <li> exclusivos para itens e respeita grupos Cliente vs Plataforma", () => {
    h.permissions = makePermissions("client");
    const { container } = render(React.createElement(SettingsSidebar, { active: "geral", onChange: () => {} }));
    const liTexts = Array.from(container.querySelectorAll(".settings-sidebar-list li")).map((li) =>
      li.textContent?.trim(),
    );
    expect(liTexts).toEqual([
      "Dados da loja",
      "Aparência",
      "PDV e impressão",
      "Vendas e pagamentos",
      "Equipe",
      "Segurança da conta",
    ]);
    expect(screen.getByText("Sua loja")).toBeTruthy();
    expect(screen.getByText("Operação e conta")).toBeTruthy();
    expect(screen.queryByText(/v3\.12\.0/)).toBeNull();

    cleanup();
    h.permissions = makePermissions("owner");
    h.dirtySections = new Set(["geral"]);
    const ownerView = render(React.createElement(SettingsSidebar, { active: "geral", onChange: () => {} }));
    expect(ownerView.getByText("Unidade e conta")).toBeTruthy();
    expect(ownerView.getByText("Equipe e governança")).toBeTruthy();
    expect(ownerView.container.querySelector('[title="Alterações não salvas"]')).toBeTruthy();
  });
});

describe("Piloto Omni Premium — Aba Geral (dirty state, descarte, falha parcial e isolamento)", () => {
  it("reverter campo editado ao baseline limpa dirty; Descartar restaura valores confirmados", async () => {
    stubStoreApi(defaultFixtures());
    render(React.createElement(GeralSection));

    const nameInput = (await screen.findByLabelText("Nome da empresa", { exact: true })) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("NovaTech Sintética"));

    const saveBtn = screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement;
    const discardBtn = within(document.getElementById("dados-empresa")!).getByRole("button", {
      name: "Descartar",
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(discardBtn.disabled).toBe(true);
    expect(screen.queryByRole("region", { name: "Alterações pendentes" })).toBeNull();

    fireEvent.change(nameInput, { target: { value: "NovaTech Editada" } });
    expect(saveBtn.disabled).toBe(false);
    expect(discardBtn.disabled).toBe(false);
    expect(screen.getByRole("region", { name: "Alterações pendentes" })).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: "NovaTech Sintética" } });
    expect(saveBtn.disabled).toBe(true);
    expect(screen.queryByRole("region", { name: "Alterações pendentes" })).toBeNull();

    fireEvent.change(nameInput, { target: { value: "Rascunho temporário" } });
    fireEvent.click(discardBtn);
    expect(nameInput.value).toBe("NovaTech Sintética");
    expect(saveBtn.disabled).toBe(true);
  });

  it("checklist usa apenas dados confirmados pelo servidor (rascunho não conclui etapas) e trata 403 com honestidade", async () => {
    stubStoreApi(defaultFixtures(), { usersStatus: 403 });
    render(React.createElement(GeralSection));

    const whatsappInput = (await screen.findByLabelText("WhatsApp (loja)", { exact: true })) as HTMLInputElement;
    await waitFor(() => expect(whatsappInput.disabled).toBe(false));

    const toggleBtn = screen.getByRole("button", { name: /para revisar|Prontidão/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText("Checklist de prontidão operacional")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("Sem permissão")).toBeTruthy());
    expect(document.body.textContent).toContain("Sem permissão para listar usuários");
    expect(document.body.textContent).not.toMatch(/\b(utilizadores|equipa)\b/i);

    const waRowBefore = screen.getByText("WhatsApp configurado").closest("li")!;
    expect(within(waRowBefore).getByText("Revisar")).toBeTruthy();
    fireEvent.change(whatsappInput, { target: { value: "(11) 99999-8888" } });
    expect(within(waRowBefore).getByText("Revisar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Concluídos/ }));
    expect(screen.queryByText("WhatsApp configurado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Para revisar/ }));
    expect(screen.getByText("WhatsApp configurado")).toBeTruthy();
  });

  it("coordena alterações simultâneas nos dois formulários e sinaliza falha parcial sem confirmação global falsa", async () => {
    const stores = defaultFixtures();
    stubStoreApi(stores);
    h.saveBusiness.mockRejectedValueOnce(new Error("Falha sintética em recursos"));
    render(React.createElement(GeralSection));

    const nameInput = (await screen.findByLabelText("Nome da empresa", { exact: true })) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("NovaTech Sintética"));

    fireEvent.change(nameInput, { target: { value: "NovaTech Atualizada" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }));

    const dock = screen.getByRole("region", { name: "Alterações pendentes" });
    expect(dock.textContent).toContain("Dados da empresa e Ramo e recursos");

    fireEvent.click(within(dock).getByRole("button", { name: "Salvar pendentes" }));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Salvamento parcial",
          variant: "destructive",
        }),
      ),
    );
    expect(stores["loja-a"].name).toBe("NovaTech Atualizada");
    expect((screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("previne submissão duplicada em Dados da empresa durante salvamento em andamento", async () => {
    let releasePut!: () => void;
    const { puts } = stubStoreApi(defaultFixtures(), {
      delayStorePut: () =>
        new Promise<void>((resolve) => {
          releasePut = resolve;
        }),
    });
    render(React.createElement(GeralSection));

    const nameInput = (await screen.findByLabelText("Nome da empresa", { exact: true })) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("NovaTech Sintética"));

    fireEvent.change(nameInput, { target: { value: "Sem Duplicidade" } });
    const saveBtn = screen.getByRole("button", { name: "Salvar alterações" });
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(puts).toHaveLength(1));
    releasePut();
    await waitFor(() => expect(screen.getByText("Dados básicos salvos e conferidos.")).toBeTruthy());
    expect(puts).toHaveLength(1);
  });

  it("troca de unidade isola completamente rascunhos entre lojas", async () => {
    stubStoreApi(defaultFixtures());
    const view = render(React.createElement(GeralSection));

    const nameInput = (await screen.findByLabelText("Nome da empresa", { exact: true })) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("NovaTech Sintética"));
    fireEvent.change(nameInput, { target: { value: "Rascunho Loja A" } });
    expect(nameInput.value).toBe("Rascunho Loja A");

    h.storeId = "loja-b";
    h.storeName = "Filial B Sintética";
    h.storeCnpj = "00.000.000/0002-80";
    view.rerender(React.createElement(GeralSection));

    await waitFor(() => {
      const nextInput = screen.getByLabelText("Nome da empresa", { exact: true }) as HTMLInputElement;
      expect(nextInput.value).toBe("Filial B Sintética");
    });
    expect(screen.queryByRole("region", { name: "Alterações pendentes" })).toBeNull();
  });

  it("oculta Preferências regionais e checklist na visão Cliente e respeita permissões somente leitura", async () => {
    stubStoreApi(defaultFixtures());
    h.permissions = makePermissions("client");
    render(React.createElement(GeralSection));

    await waitFor(() =>
      expect((screen.getByLabelText("Nome da empresa", { exact: true }) as HTMLInputElement).value).toBe(
        "NovaTech Sintética",
      ),
    );
    expect(screen.getByRole("heading", { name: "Dados da loja" })).toBeTruthy();
    expect(screen.queryByText("Preferências regionais")).toBeNull();
    expect(screen.queryByText("Checklist de prontidão operacional")).toBeNull();

    cleanup();
    h.permissions = makePermissions("readonly");
    render(React.createElement(GeralSection));
    await waitFor(() =>
      expect((screen.getByLabelText("Nome da empresa", { exact: true }) as HTMLInputElement).disabled).toBe(true),
    );
    expect(screen.getByText("Somente leitura")).toBeTruthy();
  });

  it("exibe banner unificado de ausência de unidade sem falso erro de carregamento", () => {
    h.storeId = null;
    stubStoreApi(defaultFixtures());
    render(React.createElement(GeralSection));
    expect(screen.getAllByText("Nenhuma unidade ativa").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Selecionar em Lojas" })).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar os dados da unidade/)).toBeNull();
  });

  it("revalidação em segundo plano da mesma loja preserva rascunho de Ramo e recursos (B2) e reversão de ramo limpa override redundante (M4)", async () => {
    stubStoreApi(defaultFixtures());
    const view = render(React.createElement(GeralSection));

    const branchSelect = (await screen.findByRole("combobox", { name: "Ramo principal" })) as HTMLSelectElement;
    // Muda ramo para padaria, liga Assistência técnica (override) e volta ramo para assistencia
    fireEvent.change(branchSelect, { target: { value: "padaria" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Assistência técnica/ }));
    fireEvent.change(branchSelect, { target: { value: "assistencia" } });
    // Como Assistência técnica já é sugestão do ramo assistencia, override redundante é podado e dirty zera
    expect((screen.getByRole("button", { name: "Salvar ramo e recursos" }) as HTMLButtonElement).disabled).toBe(true);

    // Agora marca IMEI e simula refresh em segundo plano da mesma loja (hydrated=false temporariamente)
    fireEvent.click(screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }));
    expect((screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }) as HTMLInputElement).checked).toBe(true);
    h.settingsHydrated = false;
    h.settingsLoaded = false;
    view.rerender(React.createElement(GeralSection));
    // Formulário permanece montado com a escolha preservada
    expect((screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }) as HTMLInputElement).checked).toBe(true);
    h.settingsHydrated = true;
    h.settingsLoaded = true;
    view.rerender(React.createElement(GeralSection));
    expect((screen.getByRole("checkbox", { name: /Aparelhos por IMEI/ }) as HTMLInputElement).checked).toBe(true);
  });
});
