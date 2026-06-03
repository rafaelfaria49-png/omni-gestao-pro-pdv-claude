import { Suspense } from "react";
import { OperacoesV3Shell } from "@/components/operacoes-v3/OperacoesV3Shell";

/**
 * Operações V3 — casca operacional isolada (rota paralela, NÃO substitui a V2).
 *
 * Espelha o padrão de isolamento da Configurações V3: um Server Component fino
 * (Suspense) montando um único Client Component com navegação por estado
 * interno. Não usa SSR de dados — a leitura de OS acontece no cliente via
 * Server Actions (somente leitura). h-full mantém o AppShell como dono do scroll.
 */
function OperacoesV3Fallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Carregando Operações V3…
    </div>
  );
}

export default function OperacoesV3Page() {
  return (
    <div className="h-full w-full min-w-0">
      <Suspense fallback={<OperacoesV3Fallback />}>
        <OperacoesV3Shell />
      </Suspense>
    </div>
  );
}
