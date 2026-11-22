import { RelatoriosHubGrid } from "./RelatoriosHubGrid"

export default function RelatoriosPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-8 px-4 py-8 lg:px-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Central de inteligência</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Relatórios</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Consulte os dados persistidos da loja, compare períodos e confira a origem de cada indicador.
          Valores sem cobertura histórica suficiente aparecem como indisponíveis, com a limitação explicada.
        </p>
      </div>

      <RelatoriosHubGrid />
    </div>
  )
}
