"use client";

import { useState } from "react";
import type { OrdemServico } from "@/types/os";
import type { GerarCobrancaModo } from "@/api/os";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const DEFAULT_AUTOR = "Operador";

export function GerarCobrancaModal({
  os,
  open,
  onOpenChange,
}: {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { gerarCobrancaOS } = useOS();
  const [modo, setModo] = useState<GerarCobrancaModo>("avista");
  const [numParcelas, setNumParcelas] = useState(2);
  const [busy, setBusy] = useState(false);

  const pode =
    os.faturamentoPendente === true &&
    os.faturamentoStatus === "pendente" &&
    Number(os.faturamentoTotal ?? 0) > 0;

  const submit = async () => {
    if (!pode) {
      toast.error("Aprove o orçamento antes de gerar cobrança.");
      return;
    }
    setBusy(true);
    try {
      await gerarCobrancaOS(
        os.id,
        { modo, numParcelas: modo === "parcelado" ? numParcelas : undefined },
        DEFAULT_AUTOR,
      );
      toast.success("Cobrança registrada e financeiro atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a cobrança.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar cobrança</DialogTitle>
          <DialogDescription>
            Registra modo de cobrança e parcelas no payload da OS e atualiza a Conta a Receber vinculada (quando houver
            faturamento pendente).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Modo</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as GerarCobrancaModo)}>
              <SelectTrigger className="h-9 text-left text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avista">À vista</SelectItem>
                <SelectItem value="parcelado">Parcelado</SelectItem>
                <SelectItem value="carteira">Carteira (saldo / conta interna)</SelectItem>
                <SelectItem value="dinheiro_pix_cartao">Dinheiro / PIX / cartão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modo === "parcelado" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Número de parcelas (2–24)</Label>
              <Input
                className="h-9 text-xs"
                type="number"
                min={2}
                max={24}
                value={numParcelas}
                onChange={(e) => setNumParcelas(Math.min(24, Math.max(2, Math.floor(Number(e.target.value) || 2))))}
              />
            </div>
          )}
          {!pode && (
            <p className="text-xs text-muted-foreground">Não há faturamento pendente nesta OS (status ou total).</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !pode}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
