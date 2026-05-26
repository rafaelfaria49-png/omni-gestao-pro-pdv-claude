"use client";

import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as osApi from "@/api/os";
import { useOS } from "@/store/osStore";
import { dt } from "@/lib/os/format";

export function RetiradaPanel({ os }: { os: OrdemServico }) {
  const { refresh, storeId } = useOS();
  const r0 = os.retirada;
  const [confirmado, setConfirmado] = useState(Boolean(r0?.confirmado));
  const [retiradoPor, setRetiradoPor] = useState(r0?.retiradoPor ?? "");
  const [observacao, setObservacao] = useState(r0?.observacao ?? "");
  const [assinaturaTexto, setAssinaturaTexto] = useState(r0?.assinaturaTexto ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const r = os.retirada;
    setConfirmado(Boolean(r?.confirmado));
    setRetiradoPor(r?.retiradoPor ?? "");
    setObservacao(r?.observacao ?? "");
    setAssinaturaTexto(r?.assinaturaTexto ?? "");
  }, [os.retirada, os.atualizadoEm, os.id]);

  const salvar = async () => {
    if (confirmado && !retiradoPor.trim()) {
      toast.error("Informe o nome de quem retirou.");
      return;
    }
    setSaving(true);
    try {
      await osApi.confirmarRetirada(storeId, os.id, {
        confirmado,
        retiradoPor: retiradoPor.trim() || undefined,
        observacao: observacao.trim() || undefined,
        assinaturaTexto: assinaturaTexto.trim() || undefined,
      });
      await refresh();
      toast.success("Retirada atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar retirada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserCheck className="h-4 w-4 text-muted-foreground" />
        Retirada / conferência
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Registro simples de entrega na mão. Assinatura textual por ora (sem canvas).
      </p>
      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox id="ret-ok" checked={confirmado} onCheckedChange={(v) => setConfirmado(Boolean(v))} />
          <Label htmlFor="ret-ok" className="cursor-pointer text-sm font-normal">
            Cliente retirou o equipamento
          </Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ret-nome">Nome de quem retirou</Label>
          <Input
            id="ret-nome"
            value={retiradoPor}
            onChange={(e) => setRetiradoPor(e.target.value)}
            placeholder="Nome completo"
            disabled={!confirmado}
          />
        </div>
        {os.retirada?.retiradoEm && (
          <div className="text-xs text-muted-foreground">Registrado em {dt(os.retirada.retiradoEm)}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="ret-obs">Observação (opcional)</Label>
          <Textarea
            id="ret-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Observações sobre a retirada"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ret-ass">Assinatura (texto)</Label>
          <Input
            id="ret-ass"
            value={assinaturaTexto}
            onChange={(e) => setAssinaturaTexto(e.target.value)}
            placeholder="Ex.: Li e concordo — Nome"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => void salvar()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar retirada"}
          </Button>
        </div>
      </div>
    </section>
  );
}
