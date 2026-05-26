import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pause, Play, Square, Camera, Plus, Wrench } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { toast } from "sonner";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function fmt(s: number) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function ModoBancadaModal({ os, open, onOpenChange }: Props) {
  const { addObservacao, moveStatus } = useOS();
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [obs, setObs] = useState("");
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (ref.current) {
      window.clearInterval(ref.current);
    }
    return () => { if (ref.current) window.clearInterval(ref.current); };
  }, [running]);

  const finalizar = () => {
    setRunning(false);
    void (async () => {
      try {
        await moveStatus(os.id, "pronta");
        if (obs.trim()) addObservacao(os.id, `[Bancada · ${fmt(seconds)}] ${obs}`, true);
        toast.success("Reparo finalizado e movido para Pronto");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível mover a OS para Pronta.");
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Modo Bancada · {os.codigo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="text-sm font-semibold">{os.cliente.nome}</div>
            <div className="text-xs text-muted-foreground">{os.equipamento.marca} {os.equipamento.modelo} · {os.tecnico?.nome ?? "Sem técnico"}</div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo de reparo</div>
            <div className="font-mono text-5xl font-bold tabular-nums text-primary">{fmt(seconds)}</div>
            <div className="mt-4 flex justify-center gap-2">
              {!running ? (
                <Button onClick={() => setRunning(true)} className="gap-2"><Play className="h-4 w-4" /> Iniciar</Button>
              ) : (
                <Button variant="outline" onClick={() => setRunning(false)} className="gap-2"><Pause className="h-4 w-4" /> Pausar</Button>
              )}
              <Button variant="destructive" onClick={finalizar} className="gap-2"><Square className="h-4 w-4" /> Finalizar</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" onClick={() => toast("Câmera (em breve)")}><Camera className="h-4 w-4" /> Foto rápida</Button>
            <Button variant="outline" className="gap-2" onClick={() => toast("Adicionar peça (em breve)")}><Plus className="h-4 w-4" /> Adicionar peça</Button>
          </div>

          <div>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="Observação técnica do reparo..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
