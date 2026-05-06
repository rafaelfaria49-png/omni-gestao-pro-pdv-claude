import { CheckCircle2, FileText, Send, XCircle } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { Button } from "@/components/ui/button";
import { useOS } from "@/store/osStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border" },
  enviado: { label: "Enviado ao cliente", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  aprovado: { label: "Aprovado", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  recusado: { label: "Recusado", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  expirado: { label: "Expirado", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};

export function OrcamentoPanel({ os }: { os: OrdemServico }) {
  const { approveOrcamento, rejectOrcamento } = useOS();

  if (!os.orcamento) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">Nenhum orçamento criado</div>
        <p className="mt-1 text-xs text-muted-foreground">Adicione peças e serviços para gerar um orçamento.</p>
        <Button className="mt-4" size="sm" onClick={() => toast("Abrir editor de orçamento")}>
          Criar orçamento
        </Button>
      </div>
    );
  }

  const o = os.orcamento;
  const cfg = STATUS_LABEL[o.status];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Orçamento</div>
          <div className="text-lg font-semibold">{brl(o.total)}</div>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.cls)}>
          {cfg.label}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {o.pecas.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Peças</div>
            {o.pecas.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground/90">
                  {p.quantidade}× {p.nome}
                </span>
                <span className="font-medium">{brl(p.quantidade * p.valorUnitario)}</span>
              </div>
            ))}
          </div>
        )}

        {o.servicos.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Serviços</div>
            {o.servicos.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground/90">{s.descricao}</span>
                <span className="font-medium">{brl(s.valor)}</span>
              </div>
            ))}
          </div>
        )}

        {o.desconto > 0 && (
          <div className="flex items-center justify-between text-sm text-emerald-500">
            <span>Desconto</span>
            <span>− {brl(o.desconto)}</span>
          </div>
        )}

        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Enviado em {dt(o.enviadoEm)} · Válido até {dt(o.validoAte)}
        </div>
      </div>

      {o.status === "enviado" && (
        <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row">
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              approveOrcamento(os.id);
              toast.success("Orçamento aprovado");
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Marcar como aprovado
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              rejectOrcamento(os.id, "Cliente recusou.");
              toast("Orçamento recusado");
            }}
          >
            <XCircle className="h-4 w-4" />
            Recusar
          </Button>
        </div>
      )}

      {o.status === "rascunho" && (
        <div className="border-t border-border p-4">
          <Button className="w-full gap-2" onClick={() => toast("Enviar via WhatsApp (integração futura)")}>
            <Send className="h-4 w-4" />
            Enviar ao cliente (WhatsApp)
          </Button>
        </div>
      )}
    </div>
  );
}
