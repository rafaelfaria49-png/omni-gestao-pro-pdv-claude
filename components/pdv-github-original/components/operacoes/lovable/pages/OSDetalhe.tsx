import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, ExternalLink, MessageCircle, Phone, Printer,
  ShieldCheck, Tag, User, Wrench,
} from "lucide-react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { PrioridadeBadge, SLABadge } from "@/components/operacoes/badges";
import { Timeline } from "@/components/operacoes/Timeline";
import { OrcamentoPanel } from "@/components/operacoes/OrcamentoPanel";
import { AnexosPanel } from "@/components/operacoes/AnexosPanel";
import { ObservacoesPanel } from "@/components/operacoes/ObservacoesPanel";
import { IASugestaoModal } from "@/components/operacoes/IASugestaoModal";
import { RetornoGarantiaModal } from "@/components/operacoes/RetornoGarantiaModal";
import { PortalClienteModal } from "@/components/operacoes/PortalClienteModal";
import { ImpressaoModal } from "@/components/operacoes/ImpressaoModal";
import { EtiquetaModal } from "@/components/operacoes/EtiquetaModal";
import { ModoBancadaModal } from "@/components/operacoes/ModoBancadaModal";
import { ORIGEM_LABEL, PIPELINE, type OSStatus } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ESTADO_BADGE: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ruim: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  nao_testado: "bg-muted text-muted-foreground border-border",
};

export default function OSDetalhe() {
  const { id = "" } = useParams();
  const { getOS, moveStatus, updateChecklist } = useOS();
  const os = getOS(id);

  const [iaOpen, setIaOpen] = useState(false);
  const [retornoOpen, setRetornoOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [etiqOpen, setEtiqOpen] = useState(false);
  const [bancadaOpen, setBancadaOpen] = useState(false);

  if (!os) {
    return (
      <OperacoesLayout>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="text-sm font-medium">OS não encontrada</div>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/operacoes/os">Voltar ao Kanban</Link>
          </Button>
        </div>
      </OperacoesLayout>
    );
  }

  const currentIndex = PIPELINE.findIndex((p) => p.id === os.status);
  const cycle = (s: "ok" | "ruim" | "nao_testado"): "ok" | "ruim" | "nao_testado" =>
    s === "nao_testado" ? "ok" : s === "ok" ? "ruim" : "nao_testado";

  return (
    <OperacoesLayout>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/operacoes/os" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Kanban
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            {os.codigo} · Criada em {dt(os.criadoEm)} · Origem: {ORIGEM_LABEL[os.origem]}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{os.cliente.nome}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {os.equipamento.tipo} · {os.equipamento.marca} {os.equipamento.modelo}
            {os.equipamento.numeroSerie && ` · S/N ${os.equipamento.numeroSerie}`}
          </div>
          {os.tags && os.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {os.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrioridadeBadge value={os.prioridade} />
          <SLABadge prazo={os.sla.prazo} />
          {os.garantia.ativa && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
              <ShieldCheck className="h-3 w-3" /> Garantia ativa
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBancadaOpen(true)}>
          <Wrench className="h-3.5 w-3.5" /> Modo Bancada
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIaOpen(true)}>
          <Bot className="h-3.5 w-3.5" /> Sugerir solução (IA)
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPortalOpen(true)}>
          <ExternalLink className="h-3.5 w-3.5" /> Ver Portal Cliente
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEtiqOpen(true)}>
          <Tag className="h-3.5 w-3.5" /> Etiqueta
        </Button>
        {os.garantia.ativa && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRetornoOpen(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Abrir retorno em garantia
          </Button>
        )}
      </div>

      {/* Pipeline */}
      <div className="mt-5 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-2">
        {PIPELINE.map((p, i) => {
          const active = p.id === os.status;
          const past = i < currentIndex;
          return (
            <button
              key={p.id}
              onClick={() => {
                moveStatus(os.id, p.id as OSStatus);
                toast.success(`Movido para ${p.label}`);
              }}
              className={cn(
                "flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active && "bg-primary text-primary-foreground",
                past && !active && "bg-primary/10 text-primary",
                !active && !past && "text-muted-foreground hover:bg-muted",
              )}
            >
              {i + 1}. {p.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="text-sm font-semibold">Defeito relatado</div>
            <p className="mt-2 text-sm text-foreground/90">{os.equipamento.defeitoRelatado}</p>
            {os.equipamento.acessorios && os.equipamento.acessorios.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                Acessórios entregues: {os.equipamento.acessorios.join(", ")}
              </div>
            )}
            {os.senhaEquipamento && (
              <div className="mt-2 text-xs text-muted-foreground">Senha do equipamento: <span className="font-mono">{os.senhaEquipamento}</span></div>
            )}
          </section>

          {os.checklist && os.checklist.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 text-sm font-semibold">Checklist de entrada</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {os.checklist.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-2 text-xs">
                    <span>{c.label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = os.checklist?.map((it) => it.id === c.id ? { ...it, estado: cycle(it.estado) } : it);
                        updateChecklist(os.id, next, "Você");
                        toast.success("Checklist atualizado");
                      }}
                      className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase", ESTADO_BADGE[c.estado])}
                      title="Clique para alternar"
                    >
                      {c.estado === "nao_testado" ? "N/T" : c.estado}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {os.servicosCatalogo && os.servicosCatalogo.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 text-sm font-semibold">Serviços contratados</div>
              <ul className="space-y-2">
                {os.servicosCatalogo.map((s) => (
                  <li key={s.servicoId} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-3">
                    <div>
                      <div className="text-sm font-medium">{s.descricao}</div>
                      <div className="text-[11px] text-muted-foreground">Garantia: {s.prazoGarantiaDias} dias</div>
                    </div>
                    <div className="text-sm font-semibold">{brl(s.valorVenda)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ObservacoesPanel os={os} />

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="text-sm font-semibold">Histórico auditável</div>
            </div>
            <div className="p-5">
              <Timeline eventos={os.timeline} />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="mt-1 text-sm font-semibold">{os.cliente.nome}</div>
            {os.cliente.documento && (
              <div className="text-xs text-muted-foreground">{os.cliente.documento}</div>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {os.cliente.telefone && (
                <a href={`tel:${os.cliente.telefone}`} className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary">
                  <Phone className="h-3 w-3" /> {os.cliente.telefone}
                </a>
              )}
              {os.cliente.whatsapp && (
                <button
                  onClick={() => toast("Abrir conversa WhatsApp (integração futura)")}
                  className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary"
                >
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Técnico responsável</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{os.tecnico?.nome ?? "Não atribuído"}</div>
                {os.tecnico && (
                  <div className="text-[11px] text-muted-foreground">
                    {os.tecnico.especialidades.join(" · ")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {os.garantia.ativa && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Garantia vinculada
              </div>
              <div className="mt-2 text-sm">
                {os.garantia.prazoDias} dias · início {dt(os.garantia.inicioEm)}
              </div>
              {os.garantia.fimEm && (
                <div className="text-[11px] text-muted-foreground">Vence em {dt(os.garantia.fimEm)}</div>
              )}
            </div>
          )}

          <OrcamentoPanel os={os} />
          <AnexosPanel os={os} />
        </aside>
      </div>

      <IASugestaoModal os={os} open={iaOpen} onOpenChange={setIaOpen} />
      <RetornoGarantiaModal os={os} open={retornoOpen} onOpenChange={setRetornoOpen} />
      <PortalClienteModal os={os} open={portalOpen} onOpenChange={setPortalOpen} />
      <ImpressaoModal os={os} open={printOpen} onOpenChange={setPrintOpen} />
      <EtiquetaModal os={os} open={etiqOpen} onOpenChange={setEtiqOpen} />
      <ModoBancadaModal os={os} open={bancadaOpen} onOpenChange={setBancadaOpen} />
    </OperacoesLayout>
  );
}
