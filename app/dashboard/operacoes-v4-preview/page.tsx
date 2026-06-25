import { OperacoesV4Preview } from "@/components/operacoes-v4-preview/OperacoesV4Preview";

/**
 * Operações V4 — Preview (rota isolada, NÃO substitui a V3).
 *
 * Tela 100% visual gerada a partir do redesign Cloud Design em
 * `design/operacoes-v4/`. Dados mockados locais; nenhuma integração real
 * (sem Server Actions, APIs, Prisma ou componentes da V3). `h-full` mantém o
 * AppShell como único dono do scroll.
 */
export default function OperacoesV4PreviewPage() {
  return (
    <div className="h-full w-full min-w-0">
      <OperacoesV4Preview />
    </div>
  );
}
