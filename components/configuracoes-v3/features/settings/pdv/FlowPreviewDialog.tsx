"use client";

/** Prévia de um layout de PDV: captura real por tema quando existe; senão, o esquema da disposição. */
import { useEffect, useState } from "react";
import { Check, Info, X } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/configuracoes-v3/components/ui/dialog";
import { useTheme } from "@/components/theme/ThemeProvider";
import { flowById, type PdvFlowId } from "./pdv-station-model";
import { Segmented } from "./pdv-station-controls";
import { FlowGlyph } from "./pdv-station-visuals";

const SHOT_THEMES = [
  { key: "light", label: "Light" },
  { key: "soft-ice", label: "Soft Ice" },
  { key: "midnight", label: "Midnight" },
  { key: "black", label: "Black" },
] as const;
type ShotTheme = (typeof SHOT_THEMES)[number]["key"];

/** A prévia abre no tema mais próximo do tema atual do sistema, como antes. */
function themeShot(mode: string): ShotTheme {
  if (mode === "soft-ice") return "soft-ice";
  if (mode === "midnight") return "midnight";
  if (mode === "black" || mode === "quantum-violet" || mode === "coffee-gold" || mode === "ruby-black") return "black";
  return "light";
}

export function FlowPreviewDialog({
  flowId,
  onClose,
  selected,
  inUse,
  disabled,
  onUse,
}: {
  flowId: PdvFlowId | null;
  onClose: () => void;
  selected: boolean;
  inUse: boolean;
  disabled: boolean;
  onUse: (id: PdvFlowId) => void;
}) {
  const { mode } = useTheme();
  const [shot, setShot] = useState<ShotTheme>(() => themeShot(mode));
  useEffect(() => {
    if (flowId) setShot(themeShot(mode));
  }, [flowId, mode]);
  const f = flowId ? flowById(flowId) : null;
  return (
    <Dialog open={flowId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="cx-root flex max-h-[calc(100dvh-4rem)] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {f ? (
          <>
            <div className="border-b border-border px-6 pb-4 pr-12 pt-5">
              <DialogTitle className="text-base font-semibold">{f.name}</DialogTitle>
              <DialogDescription className="mt-1 text-sm">{f.description}</DialogDescription>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {f.realShots ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p id="pdv-shot-theme-label" className="text-xs text-muted-foreground">
                      Captura real do PDV no tema
                    </p>
                    <Segmented value={shot} onChange={setShot} ariaLabelledby="pdv-shot-theme-label" options={SHOT_THEMES.map((t) => ({ value: t.key, label: t.label }))} />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/images/pdv-${f.id === "next" ? "next" : "assistencia"}/${shot}.png`}
                      alt={`${f.name} no tema ${shot}`}
                      className="block aspect-video w-full object-contain"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto max-w-[640px]">
                    <FlowGlyph id={f.id} large />
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Esquema da disposição da tela. Ainda não há captura real deste PDV no sistema.
                  </p>
                </>
              )}
              <div className="mt-5 rounded-lg border border-border p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Quando usar</p>
                <p className="mt-1 text-sm text-foreground">{f.whenToUse}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
              <Button type="button" variant="ghost" className="cx-touch h-9 px-3 text-[0.8rem]" onClick={onClose}>
                <X className="h-4 w-4" aria-hidden />
                Fechar
              </Button>
              {selected ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[0.8rem] font-medium text-muted-foreground">
                  <Check className="h-4 w-4" aria-hidden />
                  {inUse ? "Em uso" : "Selecionado"}
                </span>
              ) : (
                <Button
                  type="button"
                  className="cx-touch h-9 bg-foreground px-4 text-[0.8rem] font-semibold text-background hover:bg-foreground/90"
                  onClick={() => onUse(f.id)}
                  disabled={disabled}
                >
                  Usar este layout
                </Button>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
