import { RelatoriosHubGrid } from "./RelatoriosHubGrid"

export default function RelatoriosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Central de inteligência</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Relatórios</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Acompanhe em um único lugar os relatórios liberados para sua conta. Os relatórios disponíveis já
          conectam com dados reais do banco.
        </p>
      </div>

      <RelatoriosHubGrid />
    </div>
  )
}
