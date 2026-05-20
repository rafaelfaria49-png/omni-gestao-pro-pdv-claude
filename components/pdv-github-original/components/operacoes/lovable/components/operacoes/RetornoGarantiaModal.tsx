import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { useNavigate } from "react-router-dom";
import { dt } from "@/lib/os/format";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const MOTIVOS = [
  { v: "mesma_falha", l: "Mesma falha" },
  { v: "nova_falha", l: "Nova falha" },
  { v: "mau_uso", l: "Mau uso" },
  { v: "queda", l: "Queda" },
  { v: "liquido", l: "Líquido" },
  { v: "outro", l: "Outro" },
];

export function RetornoGarantiaModal({ os, open, onOpenChange }: Props) {
  const { criarOS, storeId } = useOS();
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState("mesma_falha");
  const [obs, setObs] = useState("");
  const [decisao, setDecisao] = useState<"aceitar" | "recusar" | "analisar">("aceitar");

  const fim = os.garantia.inicioEm && os.garantia.prazoDias
    ? new Date(new Date(os.garantia.inicioEm).getTime() + os.garantia.prazoDias * 86400000)
    : null;
  const restanteDias = fim ? Math.ceil((fim.getTime() - Date.now()) / 86400000) : null;

  const handleConfirmar = async () => {
    if (decisao === "recusar") {
      toast("Retorno recusado. Justificativa registrada.");
      onOpenChange(false);
      return;
    }
    const motivoLabel = MOTIVOS.find((m) => m.v === motivo)?.l ?? motivo;
    const nova = await criarOS({
      storeId,
      clienteId: os.clienteId,
      cliente: os.cliente,
      equipamento: { ...os.equipamento, id: `eq_${Date.now()}` },
      status: "aberta",
      prioridade: "alta",
      origem: "balcao",
      sla: { prazo: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), status: "ok" },
      pecas: [],
      observacoes: [{
        id: `ob_${Date.now()}`,
        autor: "Sistema",
        conteudo: `Retorno em garantia da OS ${os.codigo}. Motivo: ${motivoLabel}. ${obs}`,
        interna: true,
        criadoEm: new Date().toISOString(),
      }],
      anexos: [],
      garantia: { ativa: false },
      tags: ["retorno-garantia", `origem:${os.codigo}`],
    });
    toast.success(`Retorno aberto: ${nova.codigo}`);
    onOpenChange(false);
    navigate(`/operacoes/os/${nova.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" /> Retorno em garantia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <Info label="OS original" value={os.codigo} />
            <Info label="Cliente" value={os.cliente.nome} />
            <Info label="Equipamento" value={`${os.equipamento.marca} ${os.equipamento.modelo}`} />
            <Info label="Entregue em" value={dt(os.entregueEm)} />
            <Info label="Prazo da garantia" value={`${os.garantia.prazoDias ?? "—"} dias`} />
            <Info label="Restante" value={restanteDias !== null ? `${restanteDias} dias` : "—"} />
          </div>

          <div>
            <Label>Motivo do retorno</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (<SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observação do atendente</Label>
            <Textarea rows={3} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Descreva o que o cliente relatou no retorno..." />
          </div>

          <div>
            <Label>Decisão</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["aceitar", "analisar", "recusar"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDecisao(d)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    decisao === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d === "aceitar" ? "Aceitar garantia" : d === "recusar" ? "Recusar" : "Em análise"}
                </button>
              ))}
            </div>
          </div>

          {(motivo === "queda" || motivo === "liquido" || motivo === "mau_uso") && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">
              Atenção: motivo geralmente excluído pelo termo de garantia
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirmar}>
            {decisao === "recusar" ? "Registrar recusa" : "Abrir OS de retorno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
