import { useState } from "react";
import { Lock, Send } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ObservacoesPanel({ os }: { os: OrdemServico }) {
  const { addObservacao } = useOS();
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(true);

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    addObservacao(os.id, t, interna);
    setTexto("");
    toast.success(interna ? "Observação interna registrada" : "Observação registrada");
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="text-sm font-semibold">Observações técnicas</div>
        <div className="text-[11px] text-muted-foreground">
          Registros internos auditáveis · {os.observacoes.length} no total
        </div>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto p-4">
        {os.observacoes.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">Nenhuma observação ainda.</p>
        )}
        {os.observacoes.map((o) => (
          <div
            key={o.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              o.interna ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-background/50",
            )}
          >
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{o.autor}</span>
              <span className="flex items-center gap-1">
                {o.interna && <Lock className="h-3 w-3" />} {dt(o.criadoEm)}
              </span>
            </div>
            <p className="mt-1 text-foreground/90">{o.conteudo}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        <Textarea
          rows={2}
          placeholder="Escreva uma observação técnica..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={interna}
              onChange={(e) => setInterna(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Interna (não visível ao cliente)
          </label>
          <Button size="sm" onClick={enviar} className="gap-2">
            <Send className="h-3.5 w-3.5" /> Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
