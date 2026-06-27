import { OperacoesV4Preview } from "@/components/operacoes-v4-preview/OperacoesV4Preview";

/**
 * Operações V4 — Preview (rota isolada, NÃO substitui a V3).
 *
 * Redesign Cloud Design em `design/operacoes-v4/`. Os STAGES da OS leem dados
 * REAIS (somente leitura, via Server Actions `listOrdens`/`getOrdem` com
 * `readOnly: true` — sem efeito colateral de escrita). As telas de rail
 * (Visão geral/Fila/Bancada/SLA/PDV) são protótipo e exibem estado vazio honesto —
 * sem clientes, OS, técnicos, SLA ou números fabricados; "Nova OS" não cria OS real.
 * Nenhuma persistência: ações de escrita só pré-visualizam. Não importa componentes
 * da V3. `h-full` mantém o AppShell como único dono do scroll.
 */
export default function OperacoesV4PreviewPage() {
  return (
    <div className="h-full w-full min-w-0">
      <OperacoesV4Preview />
    </div>
  );
}
