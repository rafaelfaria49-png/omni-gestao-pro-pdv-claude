import { useMemo, useState, type DragEvent } from "react";
import { useOS } from "@/store/osStore";
import { PIPELINE, type OSStatus, type OSPrioridade } from "@/types/os";
import { getOperacaoStatusMeta } from "@/components/operacoes/lovable/utils/os-status";
import { OSCard } from "./OSCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, ClipboardList, PlusCircle } from "lucide-react";
import { slaRestante } from "@/lib/os/format";
import { useNavigate } from "react-router-dom";

export function OSKanban() {
  const { ordens, moveStatus, tecnicos, loading } = useOS();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState<OSStatus | null>(null);
  const [, setDraggingId] = useState<string | null>(null);

  const [fTecnico, setFTecnico] = useState<string>("");
  const [fPrioridade, setFPrioridade] = useState<string>("");
  const [fTipo, setFTipo] = useState<string>("");
  const [fSla, setFSla] = useState<string>(""); // "atraso"
  const [fGar, setFGar] = useState<string>("");
  const [fAgPeca, setFAgPeca] = useState<string>("");

  const tipos = useMemo(() => Array.from(new Set(ordens.map((o) => o.equipamento.tipo))), [ordens]);

  const filtradas = useMemo(() => {
    return ordens.filter((o) => {
      if (fTecnico && o.tecnico?.id !== fTecnico) return false;
      if (fPrioridade && o.prioridade !== fPrioridade) return false;
      if (fTipo && o.equipamento.tipo !== fTipo) return false;
      if (fSla === "atraso" && slaRestante(o.sla.prazo).status !== "estourado") return false;
      if (fGar === "ativa" && !o.garantia.ativa) return false;
      if (fAgPeca === "sim" && !["aguardando_aprovacao", "aguardando_peca"].includes(o.status)) return false;
      return true;
    });
  }, [ordens, fTecnico, fPrioridade, fTipo, fSla, fGar, fAgPeca]);

  const limpar = () => {
    setFTecnico(""); setFPrioridade(""); setFTipo(""); setFSla(""); setFGar(""); setFAgPeca("");
  };
  const ativos = !!(fTecnico || fPrioridade || fTipo || fSla || fGar || fAgPeca);

  const handleDrop = (e: DragEvent<HTMLDivElement>, status: OSStatus) => {
    e.preventDefault();
    const osId = e.dataTransfer.getData("text/os-id");
    setDragOver(null);
    setDraggingId(null);
    if (!osId) return;
    const os = ordens.find((o) => o.id === osId);
    if (!os || os.status === status) return;
    void (async () => {
      try {
        await moveStatus(osId, status);
        toast.success(`${os.codigo} movida para ${getOperacaoStatusMeta(status).label}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível mover a OS.");
      }
    })();
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-[140px] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {PIPELINE.map((col) => (
            <div key={col.id} className="flex flex-col rounded-2xl border border-border bg-card/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-5 w-7 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="flex flex-col gap-2">
                {Array.from({ length: col.id === "aberta" ? 2 : 1 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!loading && ordens.length === 0) {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
          <ClipboardList className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <h3 className="mt-5 text-base font-semibold text-foreground">Nenhuma ordem de serviço cadastrada</h3>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          Crie a primeira OS para começar a acompanhar o pipeline operacional desta unidade.
        </p>
        <Button
          className="mt-6 gap-2"
          onClick={() => navigate("/operacoes")}
        >
          <PlusCircle className="h-4 w-4" />
          Criar primeira OS
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <FilterSelect value={fTecnico} onChange={setFTecnico} placeholder="Técnico"
          options={tecnicos.map((t) => ({ v: t.id, l: t.nome }))} />
        <FilterSelect value={fPrioridade} onChange={setFPrioridade} placeholder="Prioridade"
          options={(["baixa", "media", "alta", "critica"] as OSPrioridade[]).map((p) => ({ v: p, l: p }))} />
        <FilterSelect value={fTipo} onChange={setFTipo} placeholder="Tipo equipamento"
          options={tipos.map((t) => ({ v: t, l: t }))} />
        <FilterSelect value={fSla} onChange={setFSla} placeholder="SLA"
          options={[{ v: "atraso", l: "Atrasadas" }]} />
        <FilterSelect value={fGar} onChange={setFGar} placeholder="Garantia"
          options={[{ v: "ativa", l: "Sob garantia" }]} />
        <FilterSelect value={fAgPeca} onChange={setFAgPeca} placeholder="Aguardando peça"
          options={[{ v: "sim", l: "Sim" }]} />
        {ativos && (
          <Button size="sm" variant="ghost" onClick={limpar} className="gap-1">
            <X className="h-3 w-3" /> Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtradas.length} de {ordens.length} OS</span>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {PIPELINE.map((col) => {
          const items = filtradas.filter((o) => o.status === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={() => setDragOver((prev) => (prev === col.id ? null : prev))}
              onDrop={(e) => handleDrop(e, col.id)}
              className={cn(
                "flex flex-col rounded-2xl border border-border bg-card/50 p-3 transition-colors",
                dragOver === col.id && "border-primary/60 bg-primary/5",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{col.label}</div>
                  <div className="text-[11px] text-muted-foreground">{col.descricao}</div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                    Solte uma OS aqui
                  </div>
                )}
                {items.map((os) => (
                  <OSCard key={os.id} os={os} onDragStart={setDraggingId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: { v: string; l: string }[];
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder} (todos)</SelectItem>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
