import { useState } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@/lib/os/format";
import { Plus, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { CatalogoServico } from "@/types/servico";

export default function ServicosPage() {
  const { servicosCatalogo, storeId, upsertServico } = useOS();
  const [edit, setEdit] = useState<CatalogoServico | null>(null);
  const [open, setOpen] = useState(false);

  const novo = (): CatalogoServico => ({
    id: `sv_${Date.now()}`,
    storeId,
    nome: "",
    custoInterno: 0,
    valorVenda: 0,
    prazoGarantiaDias: 90,
    termoGarantia: "",
    ativo: true,
  });

  const handleSalvar = async () => {
    if (!edit) return;
    if (!edit.nome.trim()) return toast.error("Informe o nome do serviço");
    await upsertServico(edit);
    toast.success("Serviço salvo");
    setOpen(false);
  };

  return (
    <OperacoesLayout>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catálogo de Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Cada serviço aplica termo de garantia automaticamente quando usado em uma OS
          </p>
        </div>
        <Button onClick={() => { setEdit(novo()); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo serviço
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {servicosCatalogo.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{s.nome}</div>
                <div className="text-[11px] text-muted-foreground">{s.categoria ?? "Sem categoria"}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border border-border bg-background/60 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Venda</div>
                <div className="text-sm font-semibold">{brl(s.valorVenda)}</div>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Custo</div>
                <div className="text-sm font-semibold text-amber-600">{brl(s.custoInterno)}</div>
              </div>
            </div>
            <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
              <ShieldCheck className="h-3 w-3" /> Garantia {s.prazoGarantiaDias} dias
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[92vw] max-w-3xl">
          <DialogHeader><DialogTitle>{edit && servicosCatalogo.find((s) => s.id === edit.id) ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><Label>Nome *</Label><Input maxLength={80} value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></div>
                <div><Label>Categoria</Label><Input maxLength={40} value={edit.categoria ?? ""} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} /></div>
                <div><Label>Custo interno (R$)</Label><Input type="number" min={0} step="0.01" value={edit.custoInterno} onChange={(e) => setEdit({ ...edit, custoInterno: Number(e.target.value) })} /></div>
                <div><Label>Valor de venda (R$)</Label><Input type="number" min={0} step="0.01" value={edit.valorVenda} onChange={(e) => setEdit({ ...edit, valorVenda: Number(e.target.value) })} /></div>
                <div className="md:col-span-2"><Label>Prazo de garantia (dias)</Label><Input type="number" min={0} value={edit.prazoGarantiaDias} onChange={(e) => setEdit({ ...edit, prazoGarantiaDias: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Termo de garantia</Label>
                <Textarea rows={8} maxLength={2000} value={edit.termoGarantia} onChange={(e) => setEdit({ ...edit, termoGarantia: e.target.value })} placeholder="Descreva exclusões: queda, líquido, mau uso..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OperacoesLayout>
  );
}
