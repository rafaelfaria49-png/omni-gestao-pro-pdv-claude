import { useMemo, useState } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { ShieldCheck, AlertTriangle, ExternalLink, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/os/format";
import { RetornoGarantiaModal } from "@/components/operacoes/RetornoGarantiaModal";
import type { OrdemServico } from "@/types/os";

export default function GarantiasPage() {
  const { ordens } = useOS();
  const [retorno, setRetorno] = useState<OrdemServico | null>(null);

  const items = useMemo(() => {
    return ordens
      .filter((o) => o.garantia.ativa || (o.garantia.prazoDias && o.status === "entregue"))
      .map((o) => {
        const inicio = o.garantia.inicioEm ? new Date(o.garantia.inicioEm) : o.entregueEm ? new Date(o.entregueEm) : null;
        const fim = inicio && o.garantia.prazoDias ? new Date(inicio.getTime() + o.garantia.prazoDias * 86400000) : null;
        const restanteDias = fim ? Math.ceil((fim.getTime() - Date.now()) / 86400000) : null;
        return { os: o, fim, restanteDias };
      });
  }, [ordens]);

  const ativas = items.filter((i) => i.restanteDias === null || i.restanteDias > 7);
  const vencendo = items.filter((i) => i.restanteDias !== null && i.restanteDias > 0 && i.restanteDias <= 7);
  const expiradas = items.filter((i) => i.restanteDias !== null && i.restanteDias <= 0);
  const retornos = ordens.filter((o) => o.tags?.includes("retorno-garantia"));

  return (
    <OperacoesLayout>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Garantias e pós-venda</h1>
        <p className="text-sm text-muted-foreground">A garantia é gerada automaticamente quando a OS é entregue</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Garantias ativas" value={ativas.length} accent="text-emerald-600" />
        <KPI label="Vencendo (7 dias)" value={vencendo.length} accent="text-amber-600" />
        <KPI label="Expiradas" value={expiradas.length} accent="text-muted-foreground" />
        <KPI label="Retornos em análise" value={retornos.length} accent="text-rose-500" />
      </div>

      <Bloco titulo="Vencendo nos próximos 7 dias" itens={vencendo} onRetorno={setRetorno} accent="amber" />
      <Bloco titulo="Garantias ativas" itens={ativas} onRetorno={setRetorno} accent="emerald" />
      {retornos.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 text-sm font-semibold">Retornos em garantia</div>
          <div className="divide-y divide-border">
            {retornos.map((o) => (
              <Link key={o.id} to={`/operacoes/os/${o.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{o.cliente.nome} · <span className="font-mono text-[11px] text-muted-foreground">{o.codigo}</span></div>
                    <div className="text-[11px] text-muted-foreground">{o.equipamento.marca} {o.equipamento.modelo}</div>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {expiradas.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 text-sm font-semibold">Garantias expiradas</div>
          <div className="divide-y divide-border">
            {expiradas.map(({ os }) => (
              <Link key={os.id} to={`/operacoes/os/${os.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{os.cliente.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{os.codigo}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Encerrada</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {retorno && <RetornoGarantiaModal os={retorno} open={!!retorno} onOpenChange={(v) => !v && setRetorno(null)} />}
    </OperacoesLayout>
  );
}

function Bloco({ titulo, itens, onRetorno, accent }: {
  titulo: string;
  itens: { os: OrdemServico; fim: Date | null; restanteDias: number | null }[];
  onRetorno: (os: OrdemServico) => void;
  accent: "emerald" | "amber";
}) {
  if (itens.length === 0) return null;
  const cls = accent === "emerald" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600";
  return (
    <section className="mt-6 rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 text-sm font-semibold">{titulo}</div>
      <div className="divide-y divide-border">
        {itens.map(({ os, fim, restanteDias }) => (
          <div key={os.id} className="flex items-center justify-between gap-3 p-4">
            <Link to={`/operacoes/os/${os.id}`} className="flex flex-1 items-center gap-3 hover:text-primary">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${cls}`}>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{os.cliente.nome} · <span className="font-mono text-[11px] text-muted-foreground">{os.codigo}</span></div>
                <div className="text-[11px] text-muted-foreground">{os.equipamento.marca} {os.equipamento.modelo}</div>
              </div>
            </Link>
            <div className="text-right">
              <div className="text-xs">Vence em {dt(fim?.toISOString())}</div>
              <div className="text-[11px] text-muted-foreground">{restanteDias ?? "—"} dias restantes</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onRetorno(os)} className="gap-1">
              <Repeat className="h-3.5 w-3.5" /> Retorno
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function KPI({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
