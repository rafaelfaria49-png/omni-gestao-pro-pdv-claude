import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MessageCircle, Phone, ShieldCheck, XCircle } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { PIPELINE } from "@/types/os";
import { toast } from "sonner";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PortalClienteModal({ os, open, onOpenChange }: Props) {
  const idx = PIPELINE.findIndex((p) => p.id === os.status);
  const pct = ((idx + 1) / PIPELINE.length) * 100;
  const total = os.orcamento?.total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portal do cliente — visualização pública</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Acompanhamento</div>
            <div className="mt-1 font-mono text-lg font-semibold">{os.codigo}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{os.cliente.telefone ?? "—"}</div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Etapa atual</span>
              <span className="font-semibold">{PIPELINE[idx]?.label ?? "—"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1 text-[9px] text-muted-foreground">
              {PIPELINE.map((p, i) => (
                <span key={p.id} className={i <= idx ? "text-primary font-medium" : ""}>{p.label}</span>
              ))}
            </div>
          </div>

          {total !== undefined && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Orçamento aprovado pelo técnico</div>
              <div className="mt-1 text-2xl font-semibold">{brl(total)}</div>
              {os.orcamento?.validoAte && (
                <div className="text-[11px] text-muted-foreground">Válido até {dt(os.orcamento.validoAte)}</div>
              )}
              {os.orcamento?.status === "enviado" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1 gap-1" onClick={() => toast.success("Orçamento aprovado pelo cliente")}>
                    <CheckCircle2 className="h-4 w-4" /> Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => toast("Orçamento recusado pelo cliente")}>
                    <XCircle className="h-4 w-4" /> Recusar
                  </Button>
                </div>
              )}
            </div>
          )}

          {os.garantia.ativa && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Garantia ativa — {os.garantia.prazoDias} dias
            </div>
          )}

          {os.anexos.filter((a) => a.publico).length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Fotos do equipamento</div>
              <div className="grid grid-cols-3 gap-2">
                {os.anexos.filter((a) => a.publico).slice(0, 6).map((a) => (
                  <div key={a.id} className="aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    {a.mimeType?.startsWith("image/") && <img src={a.url} alt={a.nome} className="h-full w-full object-cover" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Histórico</div>
            <ul className="space-y-1 text-xs">
              {os.timeline
                .filter((e) => e.autorTipo !== "usuario" || e.tipo === "mudanca_status")
                .slice(0, 6)
                .map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 rounded-md border border-border bg-card p-2">
                    <span>{e.conteudo}</span>
                    <span className="shrink-0 text-muted-foreground">{dt(e.criadoEm)}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 gap-1" onClick={() => toast("Abrindo WhatsApp...")}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            {os.cliente.telefone && (
              <Button variant="outline" className="flex-1 gap-1" asChild>
                <a href={`tel:${os.cliente.telefone}`}><Phone className="h-4 w-4" /> Ligar</a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
