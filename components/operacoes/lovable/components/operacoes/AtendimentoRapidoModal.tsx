import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useOS } from "@/store/osStore";
import { toast } from "sonner";

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

  const reset = () => { setCliente(""); setTelefone(""); setProblema(""); setAcao(""); };

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
    toast.success("Atendimento registrado");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-xl">
        <DialogHeader><DialogTitle>Atendimento rápido</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Use para registrar dúvidas, orçamentos verbais ou consultas que não viram OS.
        </p>
        <div className="space-y-3 pt-2">
          <div><Label>Cliente *</Label><Input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={120} /></div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} placeholder="(11) 99999-0000" /></div>
          <div><Label>Problema *</Label><Textarea value={problema} onChange={(e) => setProblema(e.target.value)} rows={3} maxLength={500} /></div>
          <div><Label>Ação tomada</Label><Textarea value={acao} onChange={(e) => setAcao(e.target.value)} rows={2} maxLength={500} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
