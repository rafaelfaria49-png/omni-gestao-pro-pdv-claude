import { useMemo } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { brl } from "@/lib/os/format";
import { slaRestante } from "@/lib/os/format";
import { Activity, CheckCircle2, Clock, DollarSign, ShieldCheck, TrendingUp, Wrench, AlertTriangle } from "lucide-react";

export default function DashboardOperacionalPage() {
  const { ordens } = useOS();

  const m = useMemo(() => {
    const abertas = ordens.filter((o) => !["entregue", "cancelada"].includes(o.status));
    const atrasadas = abertas.filter((o) => slaRestante(o.sla.prazo).status === "estourado").length;
    const aguardando = ordens.filter((o) => o.status === "aguardando_aprovacao").length;
    const prontas = ordens.filter((o) => o.status === "pronta").length;
    const entregues = ordens.filter((o) => o.status === "entregue");
    const valores = ordens.filter((o) => o.orcamento).map((o) => o.orcamento!.total);
    const ticket = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    const tempos = entregues
      .filter((o) => o.entregueEm)
      .map((o) => (new Date(o.entregueEm!).getTime() - new Date(o.criadoEm).getTime()) / 3600000);
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
    const totalOrcs = ordens.filter((o) => o.orcamento).length;
    const aprov = ordens.filter((o) => o.orcamento?.status === "aprovado").length;
    const taxa = totalOrcs ? Math.round((aprov / totalOrcs) * 100) : 0;
    const garantias = ordens.filter((o) => o.garantia.ativa).length;
    const retrabalho = ordens.filter((o) => o.tags?.includes("retorno-garantia")).length;
    // Receita ESTIMADA = pipeline de todas as OS não-canceladas (não só as entregues),
    // senão uma OS recém-criada com valor aparece como R$ 0,00.
    const receita = ordens
      .filter((o) => o.status !== "cancelada")
      .reduce((s, o) => s + (o.orcamento?.total ?? 0), 0);
    return { abertas: abertas.length, atrasadas, aguardando, prontas, ticket, tempoMedio, taxa, garantias, retrabalho, receita };
  }, [ordens]);

  return (
    <OperacoesLayout>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard Operacional</h1>
        <p className="text-sm text-muted-foreground">Métricas em tempo real do módulo de assistência</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI icon={Activity} label="OS abertas" value={m.abertas} />
        <KPI icon={AlertTriangle} label="Atrasadas (SLA)" value={m.atrasadas} accent="text-rose-500" />
        <KPI icon={Clock} label="Aguardando aprovação" value={m.aguardando} accent="text-amber-500" />
        <KPI icon={CheckCircle2} label="Prontas para entrega" value={m.prontas} accent="text-emerald-500" />
        <KPI icon={DollarSign} label="Ticket médio" value={brl(m.ticket)} />
        <KPI icon={Wrench} label="Tempo médio reparo" value={`${m.tempoMedio}h`} />
        <KPI icon={TrendingUp} label="Taxa aprovação" value={`${m.taxa}%`} accent="text-emerald-500" />
        <KPI icon={ShieldCheck} label="Garantias ativas" value={m.garantias} accent="text-emerald-500" />
        <KPI icon={AlertTriangle} label="Retrabalho (retornos)" value={m.retrabalho} accent="text-amber-500" />
        <KPI icon={DollarSign} label="Receita estimada" value={brl(m.receita)} accent="text-primary" />
      </div>
    </OperacoesLayout>
  );
}

function KPI({ icon: Icon, label, value, accent = "text-foreground" }: { icon: typeof Activity; label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
