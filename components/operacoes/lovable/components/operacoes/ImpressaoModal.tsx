import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";

type Modelo = "entrada" | "orcamento" | "garantia" | "entrega";

interface Props {
  os: OrdemServico;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modeloInicial?: Modelo;
}

const MODELOS: { id: Modelo; label: string }[] = [
  { id: "entrada", label: "OS de entrada" },
  { id: "orcamento", label: "Orçamento" },
  { id: "garantia", label: "Termo de garantia" },
  { id: "entrega", label: "Comprovante de entrega" },
];

export function ImpressaoModal({ os, open, onOpenChange, modeloInicial = "entrada" }: Props) {
  const [modelo, setModelo] = useState<Modelo>(modeloInicial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Imprimir documento
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {MODELOS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModelo(m.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                modelo === m.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Preview A4 */}
        <div className="mx-auto w-full max-w-[600px] rounded-lg border border-border bg-card p-6 text-[11px] leading-relaxed text-foreground shadow-inner">
          <header className="flex items-start justify-between border-b border-border pb-3">
            <div>
              <div className="text-base font-bold">OmniGestão Pro · Assistência Técnica</div>
              <div className="text-muted-foreground">Rua das Flores, 123 — São Paulo/SP · CNPJ 12.345.678/0001-90</div>
              <div className="text-muted-foreground">Tel: (11) 4002-8922 · contato@omnigestao.pro</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold">{os.codigo}</div>
              <div className="text-muted-foreground">{dt(os.criadoEm)}</div>
            </div>
          </header>

          <h2 className="mt-3 text-center text-sm font-bold uppercase tracking-wide">
            {MODELOS.find((m) => m.id === modelo)?.label}
          </h2>

          <Section title="Cliente">
            <div>{os.cliente.nome} {os.cliente.documento && `· ${os.cliente.documento}`}</div>
            <div className="text-muted-foreground">{os.cliente.telefone}</div>
          </Section>

          <Section title="Equipamento">
            <div>{os.equipamento.tipo} · {os.equipamento.marca} {os.equipamento.modelo}</div>
            {os.equipamento.numeroSerie && <div className="text-muted-foreground">S/N: {os.equipamento.numeroSerie}</div>}
            {os.equipamento.acessorios && os.equipamento.acessorios.length > 0 && (
              <div className="text-muted-foreground">Acessórios: {os.equipamento.acessorios.join(", ")}</div>
            )}
          </Section>

          {(modelo === "entrada" || modelo === "garantia") && (
            <Section title="Defeito relatado">
              <p>{os.equipamento.defeitoRelatado}</p>
            </Section>
          )}

          {modelo === "entrada" && os.checklist && os.checklist.length > 0 && (
            <Section title="Checklist de entrada">
              <table className="w-full text-[10px]">
                <tbody>
                  {os.checklist.map((c) => (
                    <tr key={c.id} className="border-b border-border/40">
                      <td className="py-1">{c.label}</td>
                      <td className="py-1 text-right font-medium uppercase">{c.estado.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {(modelo === "orcamento" || modelo === "entrega") && os.orcamento && (
            <Section title="Itens">
              <table className="w-full text-[10px]">
                <tbody>
                  {os.orcamento.pecas.map((p) => (
                    <tr key={p.id} className="border-b border-border/40">
                      <td>{p.quantidade}× {p.nome}</td>
                      <td className="text-right">{brl(p.valorUnitario * p.quantidade)}</td>
                    </tr>
                  ))}
                  {os.orcamento.servicos.map((s) => (
                    <tr key={s.id} className="border-b border-border/40">
                      <td>{s.descricao}</td>
                      <td className="text-right">{brl(s.valor)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="pt-2">TOTAL</td>
                    <td className="pt-2 text-right">{brl(os.orcamento.total)}</td>
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          {modelo === "garantia" && os.garantia.termo && (
            <Section title={`Termo de garantia (${os.garantia.prazoDias ?? 0} dias)`}>
              <p className="whitespace-pre-line text-[10px]">{os.garantia.termo}</p>
            </Section>
          )}

          <Section title="Termos gerais">
            <ul className="list-inside list-disc text-[10px] text-muted-foreground">
              <li>Equipamento não retirado em 90 dias será considerado abandonado.</li>
              <li>A loja não se responsabiliza por dados não previamente comunicados.</li>
              <li>Garantia válida apenas mediante apresentação desta OS.</li>
            </ul>
          </Section>

          <div className="mt-8 grid grid-cols-2 gap-6 pt-6">
            <div className="border-t border-border pt-1 text-center text-[10px]">Assinatura do cliente</div>
            <div className="border-t border-border pt-1 text-center text-[10px]">Responsável da loja</div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-0.5">{children}</div>
    </section>
  );
}
