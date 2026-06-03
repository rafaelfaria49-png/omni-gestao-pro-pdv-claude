"use client";

// ============================================================================
// Operações V3 — Fotos & anexos (item 8) · estrutura MVP.
// Organiza os anexos existentes em ANTES / DEPOIS / outros. O upload real fica
// para fase futura — "Adicionar" é honesto (toast de construção), sem mock.
// ============================================================================

import { Camera, ImageIcon, Paperclip, Plus } from "lucide-react";
import type { Anexo, OrdemServico } from "@/types/os";
import { ButtonV3 } from "./UiV3";

const SLOTS_ANTES = ["Foto frontal", "Foto traseira", "Foto lateral"];
const SLOTS_DEPOIS = ["Aparelho reparado"];

function anexosPorTipo(anexos: Anexo[], tipos: Anexo["tipo"][]): Anexo[] {
  return anexos.filter((a) => tipos.includes(a.tipo));
}

function Slot({ label }: { label: string }) {
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/20 p-2 text-center">
      <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden />
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function Grupo({
  titulo,
  icon,
  slots,
  anexos,
  onAdd,
}: {
  titulo: string;
  icon: React.ReactNode;
  slots: string[];
  anexos: Anexo[];
  onAdd: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{icon} {titulo}</p>
        <ButtonV3 variant="ghost" className="px-2 py-1 text-xs" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
        </ButtonV3>
      </div>
      {anexos.length > 0 ? (
        <ul className="space-y-1">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground">
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">{a.nome}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => <Slot key={s} label={s} />)}
        </div>
      )}
    </div>
  );
}

export function AnexosV3({ os, onAcao }: { os: OrdemServico; onAcao: (label: string) => void }) {
  const anexos = os.anexos ?? [];
  const antes = anexosPorTipo(anexos, ["foto_antes", "foto_defeito"]);
  const depois = anexosPorTipo(anexos, ["foto_depois"]);

  return (
    <section id="anexos" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Camera className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">Fotos & anexos</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{anexos.length} arquivo(s)</span>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <Grupo titulo="Antes" icon={<Camera className="h-3.5 w-3.5" aria-hidden />} slots={SLOTS_ANTES} anexos={antes} onAdd={() => onAcao("Adicionar foto (antes)")} />
        <Grupo titulo="Depois" icon={<Camera className="h-3.5 w-3.5" aria-hidden />} slots={SLOTS_DEPOIS} anexos={depois} onAdd={() => onAcao("Adicionar foto (depois)")} />
      </div>
      <p className="px-4 pb-4 text-[11px] text-muted-foreground">Upload real de imagens chega em fase futura — a estrutura de antes/depois já está pronta.</p>
    </section>
  );
}
