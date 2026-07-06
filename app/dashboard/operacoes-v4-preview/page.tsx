import { OperacoesV4Preview } from "@/components/operacoes-v4-preview/OperacoesV4Preview";

/**
 * Operações V4 · Beta operacional (rota isolada, NÃO substitui a V3).
 *
 * Redesign Cloud Design em `design/operacoes-v4/`. Os STAGES da OS leem e
 * ESCREVEM dados REAIS via actions V3 reusadas: "Nova OS" cria uma OS real
 * (`criarOSEnterpriseV3`), e ações como cancelar, diagnóstico, orçamento,
 * execução, entrega, assinatura, garantia e recebimento persistem no banco.
 * As telas de rail (Visão geral/Fila/Bancada/SLA/PDV) têm identidade própria e
 * permanecem somente leitura: mostram dados reais quando há base segura ou um
 * estado vazio honesto e específico do módulo — sem clientes, OS, técnicos, SLA
 * ou números fabricados. Handlers residuais sem persistência avisam via toast
 * honesto no clique. Não importa componentes da V3. `h-full` mantém o AppShell
 * como único dono do scroll.
 */
export default function OperacoesV4PreviewPage() {
  return (
    <div className="h-full w-full min-w-0">
      <OperacoesV4Preview />
    </div>
  );
}
