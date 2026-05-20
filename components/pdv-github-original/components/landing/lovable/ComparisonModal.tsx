import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, Minus } from "lucide-react";

interface ComparisonModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const plans = ["Bronze", "Prata", "Ouro", "Diamante"] as const;

type Row = { category?: boolean; label: string; values: (boolean | string)[] };

const rows: Row[] = [
  { category: true, label: "Gestão e Vendas", values: ["", "", "", ""] },
  { label: "PDV Rápido", values: [true, true, true, true] },
  { label: "Gestão de Estoque", values: ["Básica", "Avançada", "Avançada", "Preditiva IA"] },
  { label: "Emissão de NF-e / NFC-e", values: [false, true, true, true] },
  { label: "Multi-Lojas", values: ["1", "3", "10", "Até 25"] },
  { label: "Usuários inclusos", values: ["1", "3", "10", "50"] },

  { category: true, label: "Inteligência Artificial", values: ["", "", "", ""] },
  { label: "Créditos de IA/mês", values: ["250", "700", "2.000", "7.000"] },
  { label: "IA de Texto (ChatGPT/Claude)", values: [false, true, true, true] },
  { label: "Geração de Imagens (Midjourney)", values: [true, true, true, true] },
  { label: "Avatares em Vídeo (HeyGen)", values: [false, true, true, true] },
  { label: "500+ Prompts Mágicos", values: [false, false, true, true] },

  { category: true, label: "Marketing & Automação", values: ["", "", "", ""] },
  { label: "Estúdio de Marketing IA", values: [true, true, true, true] },
  { label: "Automação WhatsApp", values: [false, false, true, true] },
  { label: "Agendamento de Posts", values: [false, true, true, true] },

  { category: true, label: "Suporte & Integrações", values: ["", "", "", ""] },
  { label: "Suporte", values: ["Chat", "Chat + E-mail", "Prioritário", "Dedicado 24/7"] },
  { label: "Acesso API & Integrações", values: [false, false, false, true] },
  { label: "OmniAcademy", values: [true, true, true, true] },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true)
    return <Check className="mx-auto h-4 w-4 text-neon-green" strokeWidth={3} />;
  if (value === false)
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  if (value === "") return null;
  return <span className="text-xs font-medium text-foreground/90">{value}</span>;
}

export function ComparisonModal({ open, onOpenChange }: ComparisonModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="landing-page bg-slate-950 border border-neon-blue/40 shadow-[0_0_60px_-10px_oklch(0.75_0.22_230_/_0.5)] sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Comparativo completo de recursos</DialogTitle>
          <DialogDescription>
            Veja tudo que está incluído em cada plano do OmniGestão Pro.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-950 z-10">
              <tr className="border-b border-white/10">
                <th className="py-3 text-left font-semibold text-muted-foreground">Recurso</th>
                {plans.map((p) => (
                  <th
                    key={p}
                    className={`py-3 text-center font-bold ${
                      p === "Ouro" ? "text-neon-green" : "text-foreground"
                    }`}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r.category ? (
                  <tr key={i}>
                    <td
                      colSpan={5}
                      className="pt-5 pb-2 text-xs font-bold uppercase tracking-widest text-neon-cyan"
                    >
                      {r.label}
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2.5 text-foreground/90">{r.label}</td>
                    {r.values.map((v, j) => (
                      <td
                        key={j}
                        className={`py-2.5 text-center ${
                          plans[j] === "Ouro" ? "bg-neon-green/5" : ""
                        }`}
                      >
                        <Cell value={v} />
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
