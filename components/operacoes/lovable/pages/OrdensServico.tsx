import { useState } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { OSKanban } from "@/components/operacoes/OSKanban";
import { NovaOSModal } from "@/components/operacoes/NovaOSModal";
import { Button } from "@/components/ui/button";
import { Filter, PlusCircle } from "lucide-react";
import { toast } from "sonner";

export default function OrdensServicoPage() {
  const [novaOpen, setNovaOpen] = useState(false);

  return (
    <OperacoesLayout>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">Pipeline operacional · arraste para mover entre status</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => toast("Filtros (em breve)")}>
            <Filter className="h-4 w-4" /> Filtros
          </Button>
          <Button className="gap-2" onClick={() => setNovaOpen(true)}>
            <PlusCircle className="h-4 w-4" /> Nova OS
          </Button>
        </div>
      </div>
      <OSKanban />
      <NovaOSModal open={novaOpen} onOpenChange={setNovaOpen} />
    </OperacoesLayout>
  );
}
