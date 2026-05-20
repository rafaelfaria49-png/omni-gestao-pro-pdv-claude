import { useMemo } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { Badge } from "@/components/ui/badge";
import { Wrench, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TecnicosPage() {
  const { tecnicos, ordens } = useOS();

  const lista = useMemo(() => {
    return tecnicos.map((t) => {
      const ativas = ordens.filter((o) => o.tecnico?.id === t.id && !["entregue", "cancelada"].includes(o.status));
      const concluidas = ordens.filter((o) => o.tecnico?.id === t.id && o.status === "entregue");
      // tempo médio simulado: diferença entre criação e entrega
      const tempos = concluidas
        .filter((o) => o.entregueEm)
        .map((o) => (new Date(o.entregueEm!).getTime() - new Date(o.criadoEm).getTime()) / 3600000);
      const medio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
      const ocupado = ativas.length > 0;
      return { ...t, ativas: ativas.length, concluidas: concluidas.length, medioH: medio, ocupado };
    });
  }, [tecnicos, ordens]);

  return (
    <OperacoesLayout>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Técnicos / Fila de atendimento</h1>
        <p className="text-sm text-muted-foreground">Distribuição da equipe e produtividade em tempo real</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.nome}</div>
                  <div className="text-[11px] text-muted-foreground">{t.especialidades.join(" · ")}</div>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  t.online
                    ? t.ocupado
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", t.online ? (t.ocupado ? "bg-amber-500" : "bg-emerald-500") : "bg-muted-foreground")} />
                {!t.online ? "Offline" : t.ocupado ? "Ocupado" : "Livre"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border bg-background/60 p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-semibold"><Wrench className="h-3.5 w-3.5 text-muted-foreground" /> {t.ativas}</div>
                <div className="text-[10px] uppercase text-muted-foreground">OS abertas</div>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-2">
                <div className="text-lg font-semibold">{t.concluidas}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Concluídas</div>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-semibold"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {t.medioH || "—"}{t.medioH ? "h" : ""}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Tempo médio</div>
              </div>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum técnico cadastrado.
          </div>
        )}
      </div>
    </OperacoesLayout>
  );
}
