"use client";

/** Leitor de código de barras: o que o caixa faz com código não cadastrado, e como isso aparece no caixa. */
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { TriangleAlert } from "lucide-react";
import type { PdvScanUnregisteredAction } from "@/lib/pdv-scan-unregistered-action";
import { DEFAULT_SCAN, SCAN_OPTIONS, type PdvFailure } from "./pdv-station-model";
import { BlockAlert, SectionHead, UndoButton } from "./pdv-station-controls";

export function LeitorSection({
  scan,
  onChange,
  disabled,
  pending,
  onUndo,
  failure,
}: {
  scan: PdvScanUnregisteredAction;
  onChange: (scan: PdvScanUnregisteredAction) => void;
  disabled: boolean;
  pending: boolean;
  onUndo: () => void;
  failure?: PdvFailure;
}) {
  return (
    <section id="pdv-leitor" className="cx-section" aria-labelledby="leitor-title" data-testid="pdv-scan-unregistered-action">
      <SectionHead
        id="leitor"
        title="Leitor de código de barras"
        description="O que o caixa faz quando o código bipado não está cadastrado. Vale para Clássico, Assistência, Rápido e Venda Completa."
        scope="unidade"
        pending={pending}
        extra={pending ? <UndoButton label="Leitor" onClick={onUndo} /> : null}
      />
      <RadioGroupPrimitive.Root
        className="grid gap-1"
        value={scan}
        onValueChange={(v) => onChange(v as PdvScanUnregisteredAction)}
        aria-labelledby="leitor-title"
        disabled={disabled}
      >
        {SCAN_OPTIONS.map((o) => (
          <RadioGroupPrimitive.Item
            key={o.id}
            value={o.id}
            className="cx-choice"
            aria-labelledby={`scan-${o.id}-t`}
            aria-describedby={o.id === DEFAULT_SCAN ? `scan-${o.id}-p scan-${o.id}-d` : `scan-${o.id}-d`}
          >
            <span className="cx-radio" aria-hidden />
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span id={`scan-${o.id}-t`}>{o.title}</span>
              {o.id === DEFAULT_SCAN ? (
                <span id={`scan-${o.id}-p`} className="rounded border border-border px-1.5 text-[11px] font-medium text-muted-foreground">
                  Padrão
                </span>
              ) : null}
            </span>
            <span aria-hidden />
            <span id={`scan-${o.id}-d`} className="text-xs leading-relaxed text-muted-foreground">
              {o.description}
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <ScanPreview action={scan} />
      <BlockAlert failure={failure} />
    </section>
  );
}

function ScanPreview({ action }: { action: PdvScanUnregisteredAction }) {
  const code = "7891000315507";
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Como aparece no caixa</p>
      <div className="relative h-11 overflow-hidden rounded-lg border border-border bg-background" aria-hidden>
        {/* Mesma composição do aviso real (components/dashboard/vendas/pdv-scan-inline-feedback.tsx) */}
        <div className="absolute inset-0 flex items-center gap-1.5 overflow-hidden bg-background px-2.5 text-[13px] font-semibold text-destructive">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Produto não cadastrado · <span className="font-mono">{code}</span>
            {action === "warn_offer_avulso" ? (
              <>
                {" · "}
                <kbd className="rounded border border-destructive/30 bg-destructive/10 px-1 py-px font-sans text-[10px] font-bold uppercase">Insert</kbd> para
                Item Avulso
              </>
            ) : null}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {action === "warn_continue"
          ? "O campo continua vazio e focado: o próximo bipe entra direto."
          : action === "warn_offer_avulso"
            ? "Com o campo vazio, Insert abre o Item Avulso já com este código."
            : "Em seguida o Item Avulso abre sozinho com este código; o operador completa descrição e preço."}
      </p>
    </div>
  );
}
