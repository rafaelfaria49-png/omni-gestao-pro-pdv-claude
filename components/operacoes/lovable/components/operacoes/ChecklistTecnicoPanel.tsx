"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import type { ChecklistTecnicoItem, OrdemServico } from "@/types/os";
import { CHECKLIST_TECNICO_PADRAO } from "@/types/os";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import * as osApi from "@/api/os";
import { useOS } from "@/store/osStore";

function mergeDefaults(saved?: ChecklistTecnicoItem[]): ChecklistTecnicoItem[] {
  const byId = new Map((saved ?? []).map((x) => [x.id, x]));
  return CHECKLIST_TECNICO_PADRAO.map((d) => ({
    id: d.id,
    label: d.label,
    ok: byId.get(d.id)?.ok ?? false,
  }));
}

export function ChecklistTecnicoPanel({ os }: { os: OrdemServico }) {
  const { refresh } = useOS();
  const baseline = useMemo(() => mergeDefaults(os.checklistTecnico), [os.checklistTecnico, os.atualizadoEm, os.id]);
  const [items, setItems] = useState(baseline);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(mergeDefaults(os.checklistTecnico));
  }, [os.checklistTecnico, os.atualizadoEm, os.id]);

  const toggle = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ok: !it.ok } : it)));
  };

  const salvar = async () => {
    setSaving(true);
    try {
      await osApi.salvarChecklistTecnico(os.id, items, "Você");
      await refresh();
      toast.success("Checklist técnico salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar checklist");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        Checklist técnico (bancada)
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Marque os testes realizados após o reparo. Ao concluir todos os itens, um evento é registrado na timeline.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <label
            key={it.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <Checkbox checked={it.ok} onCheckedChange={() => toggle(it.id)} />
            <span>{it.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" onClick={() => void salvar()} disabled={saving}>
          {saving ? "Salvando…" : "Salvar checklist"}
        </Button>
      </div>
    </section>
  );
}
