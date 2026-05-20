import { Bot, AlertTriangle, Wrench, Clock, DollarSign, FlaskConical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { OrdemServico } from "@/types/os";
import { brl } from "@/lib/os/format";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Sugestao {
  causas: string[];
  testes: string[];
  pecas: string[];
  risco: "baixo" | "medio" | "alto";
  tempoEstimadoMin: number;
  orcamentoSugerido: number;
}

// Heurística simples baseada em palavras-chave
function gerar(os: OrdemServico): Sugestao {
  const d = os.equipamento.defeitoRelatado.toLowerCase();
  if (d.includes("carrega") || d.includes("carregar")) {
    return {
      causas: ["Cabo / carregador", "Conector de carga oxidado", "Bateria desgastada", "CI de carga", "Trilha oxidada na placa"],
      testes: ["Testar com cabo/fonte original", "Inspecionar conector com lupa", "Medir consumo em bancada", "Testar com bateria boa"],
      pecas: ["Conector de carga", "Bateria", "CI de carga"],
      risco: "medio",
      tempoEstimadoMin: 90,
      orcamentoSugerido: 220,
    };
  }
  if (d.includes("tela") || d.includes("touch") || d.includes("trincad")) {
    return {
      causas: ["Vidro/tela danificado por queda", "Flat da tela desconectado", "Touch com mau contato"],
      testes: ["Inspeção visual do vidro", "Testar touch após reassentar flat", "Verificar pixels mortos"],
      pecas: ["Tela completa (display + touch)", "Adesivo de vedação"],
      risco: "baixo",
      tempoEstimadoMin: 60,
      orcamentoSugerido: 690,
    };
  }
  if (d.includes("liga") || d.includes("morto")) {
    return {
      causas: ["Bateria zerada", "Curto na placa", "Botão power", "BGA/processador"],
      testes: ["Carregar 30 min e testar", "Medir consumo (curto)", "Inspeção térmica", "Reflow / jumper"],
      pecas: ["Bateria", "Botão power", "Componentes de placa"],
      risco: "alto",
      tempoEstimadoMin: 180,
      orcamentoSugerido: 480,
    };
  }
  if (d.includes("lent") || d.includes("trav")) {
    return {
      causas: ["HD/SSD com defeito", "Memória RAM insuficiente", "Sistema corrompido", "Pasta térmica seca"],
      testes: ["SMART do disco", "Memtest", "Limpeza térmica", "Reinstalar SO"],
      pecas: ["SSD", "Memória RAM", "Pasta térmica"],
      risco: "baixo",
      tempoEstimadoMin: 120,
      orcamentoSugerido: 380,
    };
  }
  return {
    causas: ["Diagnóstico inicial necessário", "Possível falha de hardware", "Possível falha de software"],
    testes: ["Inspeção visual", "Testes de bancada padrão", "Diagnóstico de software"],
    pecas: [],
    risco: "medio",
    tempoEstimadoMin: 60,
    orcamentoSugerido: 150,
  };
}

const RISCO: Record<Sugestao["risco"], { label: string; cls: string }> = {
  baixo: { label: "Risco baixo", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  medio: { label: "Risco médio", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  alto: { label: "Risco alto", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

export function IASugestaoModal({ os, open, onOpenChange }: Props) {
  const s = gerar(os);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Sugestão de diagnóstico (IA)
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Defeito relatado:</span> {os.equipamento.defeitoRelatado}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border bg-card p-3">
            <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold">{s.tempoEstimadoMin} min</div>
            <div className="text-[10px] uppercase text-muted-foreground">Tempo estimado</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <DollarSign className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold">{brl(s.orcamentoSugerido)}</div>
            <div className="text-[10px] uppercase text-muted-foreground">Orçamento sugerido</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <AlertTriangle className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <Badge variant="outline" className={RISCO[s.risco].cls + " text-[10px]"}>{RISCO[s.risco].label}</Badge>
          </div>
        </div>

        <Bloco icon={AlertTriangle} title="Possíveis causas" items={s.causas} />
        <Bloco icon={FlaskConical} title="Testes recomendados" items={s.testes} />
        <Bloco icon={Wrench} title="Peças prováveis" items={s.pecas.length ? s.pecas : ["—"]} />

        <p className="text-[11px] italic text-muted-foreground">
          Sugestões geradas por heurística. A decisão final é sempre do técnico responsável.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ icon: Icon, title, items }: { icon: typeof Bot; title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="space-y-1 rounded-lg border border-border bg-card p-3 text-sm">
        {items.map((i, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="text-primary">•</span>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
