import ConfiguracoesV3Page from "@/components/configuracoes-v3/ConfiguracoesV3Page"

export default function Page() {
  // [PDV DEBUG] RSC — visível nos logs do servidor (Vercel Functions / terminal dev)
  console.log("[PDV DEBUG]", {
    component: "app/dashboard/configuracoes/page.tsx",
    pathname: "/dashboard/configuracoes",
    note: "rota fixa deste ficheiro",
  })
  return <ConfiguracoesV3Page />
}
