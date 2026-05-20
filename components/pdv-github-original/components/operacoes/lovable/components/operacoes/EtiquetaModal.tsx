import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { dt } from "@/lib/os/format";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EtiquetaModal({ os, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-xl">
        <DialogHeader>
          <DialogTitle>Etiqueta térmica · 50 × 30 mm</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center py-4">
          {/* 50x30mm @ ~6.6 px/mm preview */}
          <div className="relative flex flex-col gap-1 rounded-md border-2 border-dashed border-border bg-card p-2"
               style={{ width: "330px", height: "198px" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[9px] uppercase text-muted-foreground">OmniGestão</div>
                <div className="font-mono text-sm font-bold">{os.codigo}</div>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded border border-border bg-background">
                <QrCode className="h-12 w-12" />
              </div>
            </div>
            <div className="text-[10px] font-semibold leading-tight">{os.cliente.nome}</div>
            <div className="text-[9px] leading-tight text-muted-foreground">
              {os.equipamento.marca} {os.equipamento.modelo}
            </div>
            <div className="mt-auto flex items-end justify-between">
              <div className="text-[8px] text-muted-foreground">Entrada: {dt(os.criadoEm)}</div>
              {os.tecnico && <div className="text-[8px] text-muted-foreground">Téc: {os.tecnico.nome.split(" ")[0]}</div>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
