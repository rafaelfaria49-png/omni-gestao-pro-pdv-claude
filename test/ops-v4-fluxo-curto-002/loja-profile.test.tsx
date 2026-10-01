import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Profile() {
  const { lojaAtivaRemota } = useLojaAtiva();
  return <output data-testid="empresa-remota">{JSON.stringify(lojaAtivaRemota)}</output>;
}

it("lê somente a identidade persistida da unidade ativa, sem herdar dados de outra loja", async () => {
  window.localStorage.setItem("assistec-pro-loja-ativa-v1", "loja-b");
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (String(url) === "/api/stores") {
      return {
        ok: true,
        json: async () => ({ stores: [
          { id: "loja-a", name: "Outra loja", cnpj: "11.111.111/0001-11", phone: "1111" },
          { id: "loja-b", name: "Loja B real", cnpj: "22.222.222/0001-22", phone: "2222", address: { rua: "Rua B" } },
        ] }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }));

  render(<ConfigEmpresaProvider><LojaAtivaProvider><Profile /></LojaAtivaProvider></ConfigEmpresaProvider>);
  await waitFor(() => expect(screen.getByTestId("empresa-remota").textContent).toContain("Loja B real"));
  const perfil = JSON.parse(screen.getByTestId("empresa-remota").textContent || "null");
  expect(perfil).toMatchObject({
    id: "loja-b",
    nomeFantasia: "Loja B real",
    cnpj: "22.222.222/0001-22",
    telefone: "2222",
    endereco: { rua: "Rua B" },
  });
  expect(JSON.stringify(perfil)).not.toContain("Outra loja");
  expect(JSON.stringify(perfil)).not.toContain("11.111.111/0001-11");
});
