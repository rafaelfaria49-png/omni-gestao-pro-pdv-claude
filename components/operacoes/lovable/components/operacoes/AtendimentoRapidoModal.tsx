import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useOS } from "@/store/osStore";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AtendimentoRapidoModal({ open, onOpenChange }: Props) {
  const { storeId, criarAtendimento } = useOS();
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [problema, setProblema] = useState("");
  const [acao, setAcao] = useState("");

  const reset = () => {
    setCliente("");
    setTelefone("");
    setProblema("");
    setAcao("");
  };

  const handleSalvar = async () => {
    if (!cliente.trim()) return toast.error("Informe o cliente");
    if (!problema.trim()) return toast.error("Descreva o problema");
    await criarAtendimento({
      storeId,
      clienteNome: cliente.trim(),
      telefone: telefone.trim() || undefined,
      problema: problema.trim(),
      acaoTomada: acao.trim() || "—",
      atendente: "Você",
    });
    toast.success("Registrado nesta sessão — não salvo no servidor");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-xl">
        <DialogHeader>
          <DialogTitle>Atendimento rápido (rascunho local)</DialogTitle>
        </DialogHeader>
        <div
          role="note"
          className="flex gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-muted-foreground">
            Rascunho <span className="font-medium text-foreground">somente nesta sessão do navegador</span>.
            Ao recarregar a página, os registros somem. Para histórico real, abra uma OS.
          </p>
        </div>
        <div className="space-y-3 pt-1">
          <div>
            <Label>Cliente *</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              maxLength={20}
              placeholder="(11) 99999-0000"
            />
          </div>
          <div>
            <Label>Problema *</Label>
            <Textarea value={problema} onChange={(e) => setProblema(e.target.value)} rows={3} maxLength={500} />
          </div>
          <div>
            <Label>Ação tomada</Label>
            <Textarea value={acao} onChange={(e) => setAcao(e.target.value)} rows={2} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar}>Registrar rascunho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
