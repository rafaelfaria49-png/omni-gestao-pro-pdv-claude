import Link from "next/link";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { brl } from "@/lib/os/format";
import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import type { CatalogoServico } from "@/types/servico";

export default function ServicosPage() {
  const { servicosCatalogo } = useOS();

  return (
    <OperacoesLayout>
      <div
        role="status"
        className="mb-5 flex gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="font-medium">Catálogo somente leitura neste HUB</p>
          <p className="text-muted-foreground">
            Os serviços abaixo vêm do Cadastros (Prisma). Criar ou editar serviços pelo Operações HUB{" "}
            <span className="font-medium text-foreground">em breve</span> — use Cadastros para alterações reais.
          </p>
          <Link
            href="/dashboard/cadastros-v2"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            Abrir Cadastros
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catálogo de Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Leitura do catálogo da unidade — usado em orçamentos de OS
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Em breve: editar aqui
        </span>
      </div>

      {servicosCatalogo.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum serviço cadastrado nesta unidade</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre serviços em Cadastros para usá-los nos orçamentos de OS.
          </p>
          <Link
            href="/dashboard/cadastros-v2"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Ir para Cadastros
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {servicosCatalogo.map((s) => (
            <ServicoCard key={s.id} servico={s} />
          ))}
        </div>
      )}
    </OperacoesLayout>
  );
}

function ServicoCard({ servico: s }: { servico: CatalogoServico }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{s.nome}</div>
          <div className="text-[11px] text-muted-foreground">{s.categoria ?? "Sem categoria"}</div>
        </div>
        {!s.ativo ? (
          <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            Inativo
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border border-border bg-background/60 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Venda</div>
          <div className="text-sm font-semibold">{brl(s.valorVenda)}</div>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Custo</div>
          <div className="text-sm font-semibold text-amber-600">{brl(s.custoInterno)}</div>
        </div>
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
        <ShieldCheck className="h-3 w-3" /> Garantia {s.prazoGarantiaDias} dias
      </div>
    </div>
  );
}
