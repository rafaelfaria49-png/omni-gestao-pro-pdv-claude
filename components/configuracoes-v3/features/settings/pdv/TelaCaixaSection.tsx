"use client";

/** Tela do caixa: qual PDV abre na unidade (seleção de layout) e o modo inicial do Clássico (comportamento). */
import type { Dispatch, SetStateAction } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowUpRight, Check, Eye, Info } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import type { CaixaDraft, PdvFlowId, PdvFlowOption } from "./pdv-station-model";
import { PendingDot, Row, SectionHead, Segmented, UndoButton } from "./pdv-station-controls";
import { FlowGlyph } from "./pdv-station-visuals";

export function TelaCaixaSection({
  flows,
  caixa,
  caixaSaved,
  setCaixa,
  disabled,
  flowPending,
  modoPending,
  onUndo,
  onPreview,
}: {
  flows: PdvFlowOption[];
  caixa: CaixaDraft;
  caixaSaved: CaixaDraft;
  setCaixa: Dispatch<SetStateAction<CaixaDraft>>;
  disabled: boolean;
  flowPending: boolean;
  modoPending: boolean;
  onUndo: () => void;
  onPreview: (id: PdvFlowId) => void;
}) {
  return (
    <section id="pdv-tela" className="cx-section" aria-labelledby="tela-title">
      <SectionHead
        id="tela"
        title="Tela do caixa"
        description="Qual PDV abre quando o operador entra no caixa. Vale para todos os computadores desta unidade."
        scope="unidade"
        pending={flowPending || modoPending}
        extra={flowPending || modoPending ? <UndoButton label="Tela do caixa" onClick={onUndo} /> : null}
      />
      <RadioGroupPrimitive.Root
        className="cx-tiles"
        value={caixa.flow}
        onValueChange={(v) => setCaixa((d) => ({ ...d, flow: v as PdvFlowId }))}
        aria-labelledby="tela-title"
        disabled={disabled}
        data-pdv-layout-cards={String(flows.length)}
      >
        {flows.map((f) => {
          const selected = caixa.flow === f.id;
          const inUse = caixaSaved.flow === f.id;
          return (
            <div key={f.id} className="cx-tile" data-selected={selected} data-testid={f.testId}>
              <RadioGroupPrimitive.Item
                value={f.id}
                className="cx-tile__hit"
                aria-labelledby={`flow-${f.id}-name`}
                aria-describedby={`flow-${f.id}-desc`}
              >
                <FlowGlyph id={f.id} />
                <span className="block px-1">
                  <span id={`flow-${f.id}-name`} className="block text-sm font-semibold text-foreground">
                    {f.name}
                    {inUse ? <span className="sr-only"> (em uso)</span> : null}
                  </span>
                  <span id={`flow-${f.id}-desc`} className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {f.description}
                  </span>
                </span>
              </RadioGroupPrimitive.Item>
              {selected ? (
                <span className="cx-check" aria-hidden>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              ) : null}
              <div className="mt-auto flex items-center gap-1 px-2.5 pb-2 pt-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 text-[11px] font-medium text-muted-foreground">
                  {inUse && selected ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Em uso
                    </>
                  ) : inUse ? (
                    "Em uso hoje"
                  ) : selected ? (
                    <>
                      <PendingDot /> Selecionado
                    </>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cx-touch h-8 px-2 text-xs"
                  onClick={() => onPreview(f.id)}
                  aria-label={`Visualizar ${f.name}`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  Ver tela
                </Button>
                <a
                  href={f.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cx-touch inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`Abrir ${f.name} em nova aba`}
                  title="Abrir PDV em nova aba"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>
          );
        })}
      </RadioGroupPrimitive.Root>
      {caixa.flow === "classico" ? (
        <div className="cx-rows mt-6">
          <Row
            label="Modo inicial do Clássico"
            labelId="pdv-modo-label"
            help="Completo é o balcão tradicional. Simplificado abre focado no bipe rápido de itens."
            pending={modoPending}
            testId="pdv-classic-modo-inicial"
          >
            <Segmented
              value={caixa.modo}
              onChange={(modo) => setCaixa((d) => ({ ...d, modo }))}
              ariaLabelledby="pdv-modo-label"
              disabled={disabled}
              options={[
                { value: "normal", label: "Completo" },
                { value: "rapido", label: "Simplificado" },
              ]}
            />
          </Row>
        </div>
      ) : null}
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Um PDV que já esteja aberto passa a usar o novo layout depois de recarregado.
      </p>
    </section>
  );
}
