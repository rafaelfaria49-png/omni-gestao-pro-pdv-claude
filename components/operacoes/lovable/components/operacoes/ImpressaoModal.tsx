"use client";

import { useState } from "react";
import { Copy, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OrdemServico } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { registrarDocumentoImpressoAction } from "@/app/actions/operacoes";

type Modelo = "entrada" | "orcamento" | "garantia" | "entrega" | "operacional";

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
  { id: "operacional", label: "Documento operacional" },
];

function buildResumoOperacional(os: OrdemServico): string {
  const lines: string[] = [
    `OmniGestão Pro — ${os.codigo}`,
    `Cliente: ${os.cliente.nome}`,
    `Equipamento: ${os.equipamento.tipo} · ${os.equipamento.marca} ${os.equipamento.modelo}`,
    `IMEI/S/N: ${os.equipamento.numeroSerie ?? "—"}`,
    `Defeito: ${os.equipamento.defeitoRelatado}`,
  ];
  if (os.orcamento) {
    lines.push("— Peças —");
    for (const p of os.orcamento.pecas) {
      lines.push(`${p.quantidade}× ${p.nome} · ${brl(p.valorUnitario * p.quantidade)}`);
    }
    lines.push("— Serviços —");
    for (const s of os.orcamento.servicos) {
      lines.push(`${s.descricao} · ${brl(s.valor)}`);
    }
    lines.push(`TOTAL: ${brl(os.orcamento.total)}`);
  }
  if (os.checklistTecnico?.length) {
    lines.push("— Checklist técnico —");
    for (const c of os.checklistTecnico) {
      lines.push(`${c.ok ? "[x]" : "[ ]"} ${c.label}`);
    }
  }
  if (os.garantia.ativa) {
    lines.push(`— Garantia — ${os.garantia.prazoDias ?? "?"} dias · até ${os.garantia.fimEm ? dt(os.garantia.fimEm) : "—"}`);
  }
  if (os.retirada?.confirmado) {
    lines.push(
      `— Retirada — ${os.retirada.retiradoPor ?? "—"} em ${os.retirada.retiradoEm ? dt(os.retirada.retiradoEm) : "—"}`,
    );
    if (os.retirada.assinaturaTexto) lines.push(`Assinatura: ${os.retirada.assinaturaTexto}`);
  }
  lines.push("", "Documento operacional — não fiscal.");
  return lines.join("\n");
}

export function ImpressaoModal({ os, open, onOpenChange, modeloInicial = "entrada" }: Props) {
  const [modelo, setModelo] = useState<Modelo>(modeloInicial);

  const registrarImpresso = async () => {
    try {
      await registrarDocumentoImpressoAction(os.storeId, os.id, "Operador");
    } catch {
      // best-effort: impressão ainda ocorre
    }
  };

  const handlePrint = async () => {
    await registrarImpresso();
    window.print();
  };

  const handleCopy = async () => {
    const text = buildResumoOperacional(os);
    try {
      await navigator.clipboard.writeText(text);
      await registrarImpresso();
      toast.success("Resumo copiado para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar o resumo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; }
          .no-print { display: none !important; }
        }
      `,
        }}
      />
      <DialogContent className="no-print w-[92vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Imprimir documento
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 no-print">
          {MODELOS.map((m) => (
            <button
              key={m.id}
              type="button"
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

        <div className="print-area mx-auto w-full max-w-[600px] rounded-lg border border-border bg-card p-6 text-[11px] leading-relaxed text-foreground shadow-inner">
          <header className="flex items-start justify-between border-b border-border pb-3">
            <div>
              <div className="text-base font-bold">OmniGestão Pro · Assistência Técnica</div>
              <div className="text-muted-foreground">Documento operacional (não fiscal)</div>
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
            <div>
              {os.cliente.nome} {os.cliente.documento && `· ${os.cliente.documento}`}
            </div>
            <div className="text-muted-foreground">{os.cliente.telefone}</div>
          </Section>

          <Section title="Equipamento">
            <div>
              {os.equipamento.tipo} · {os.equipamento.marca} {os.equipamento.modelo}
            </div>
            {os.equipamento.numeroSerie && <div className="text-muted-foreground">IMEI / S/N: {os.equipamento.numeroSerie}</div>}
            {os.equipamento.acessorios && os.equipamento.acessorios.length > 0 && (
              <div className="text-muted-foreground">Acessórios: {os.equipamento.acessorios.join(", ")}</div>
            )}
          </Section>

          {(modelo === "entrada" || modelo === "garantia" || modelo === "operacional") && (
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

          {(modelo === "orcamento" || modelo === "entrega" || modelo === "operacional") && os.orcamento && (
            <Section title="Peças e serviços">
              <table className="w-full text-[10px]">
                <tbody>
                  {os.orcamento.pecas.map((p) => (
                    <tr key={p.id} className="border-b border-border/40">
                      <td>
                        {p.quantidade}× {p.nome}
                      </td>
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

          {modelo === "operacional" && os.checklistTecnico && os.checklistTecnico.length > 0 && (
            <Section title="Checklist técnico">
              <ul className="list-inside list-disc text-[10px]">
                {os.checklistTecnico.map((c) => (
                  <li key={c.id}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(modelo === "garantia" || modelo === "operacional") && os.garantia.termo && (
            <Section title={`Garantia (${os.garantia.prazoDias ?? 0} dias)`}>
              <p className="whitespace-pre-line text-[10px]">{os.garantia.termo}</p>
            </Section>
          )}

          {modelo === "operacional" && os.garantiasOperacionais && os.garantiasOperacionais.length > 0 && (
            <Section title="Garantias registradas (banco)">
              <ul className="space-y-1 text-[10px]">
                {os.garantiasOperacionais.map((g) => (
                  <li key={g.id}>
                    {g.status} · {g.prazoDias}d · {dt(g.dataInicio)} → {dt(g.dataFim)}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {modelo === "operacional" && (
            <Section title="Retirada">
              {os.retirada?.confirmado ? (
                <div className="text-[10px]">
                  <div>Confirmado: sim</div>
                  <div>Por: {os.retirada.retiradoPor ?? "—"}</div>
                  <div>Em: {os.retirada.retiradoEm ? dt(os.retirada.retiradoEm) : "—"}</div>
                  {os.retirada.observacao && <div>Obs.: {os.retirada.observacao}</div>}
                  {os.retirada.assinaturaTexto && <div>Assinatura: {os.retirada.assinaturaTexto}</div>}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground">Retirada ainda não confirmada.</div>
              )}
            </Section>
          )}

          <Section title="Termos gerais">
            <ul className="list-inside list-disc text-[10px] text-muted-foreground">
              <li>Equipamento não retirado em 90 dias poderá ser considerado abandonado, conforme política da loja.</li>
              <li>A loja não se responsabiliza por dados não comunicados previamente.</li>
              <li>Este documento é operacional e não substitui nota fiscal.</li>
            </ul>
          </Section>

          <div className="mt-8 grid grid-cols-2 gap-6 pt-6">
            <div className="border-t border-border pt-1 text-center text-[10px]">Assinatura do cliente</div>
            <div className="border-t border-border pt-1 text-center text-[10px]">Responsável da loja</div>
          </div>
        </div>

        <div className="no-print mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => void handleCopy()}>
            <Copy className="h-4 w-4" /> Copiar resumo
          </Button>
          <Button onClick={() => void handlePrint()} className="gap-2">
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
