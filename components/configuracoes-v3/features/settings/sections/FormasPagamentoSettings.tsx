"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import {
  FORMA_PAGAMENTO_COLOR_OPTIONS,
  FORMA_PAGAMENTO_ICON_OPTIONS,
  getFormaPagamentoIcon,
  type FormaPagamentoConfig,
  type FormaPagamentoConfigId,
} from "@/lib/pdv-formas-pagamento";
import { cn } from "@/lib/utils";

type Props = {
  value: FormaPagamentoConfig[];
  onChange: (next: FormaPagamentoConfig[]) => void;
  disabled?: boolean;
};

function reorder(list: FormaPagamentoConfig[], id: FormaPagamentoConfigId, dir: -1 | 1): FormaPagamentoConfig[] {
  const sorted = [...list].sort((a, b) => a.ordem - b.ordem);
  const idx = sorted.findIndex((f) => f.id === id);
  if (idx < 0) return list;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return list;
  const next = sorted.map((f, i) => {
    if (i === idx) return { ...sorted[swapIdx]!, ordem: idx };
    if (i === swapIdx) return { ...sorted[idx]!, ordem: swapIdx };
    return { ...f, ordem: i };
  });
  return next.sort((a, b) => a.ordem - b.ordem);
}

function patchItem(
  list: FormaPagamentoConfig[],
  id: FormaPagamentoConfigId,
  patch: Partial<FormaPagamentoConfig>,
): FormaPagamentoConfig[] {
  return list.map((f) => (f.id === id ? { ...f, ...patch } : f));
}

export function FormasPagamentoSettings({ value, onChange, disabled }: Props) {
  const [expanded, setExpanded] = useState<FormaPagamentoConfigId | null>(null);
  const sorted = [...value].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ative, ordene e configure regras das formas exibidas nos PDVs desta unidade. Carnê e boleto usam o mesmo fluxo
        parcelado; múltiplo abre o modal de divisão de pagamento.
      </p>
      <div className="space-y-2">
        {sorted.map((forma, index) => {
          const Icon = getFormaPagamentoIcon(forma.icon);
          const isOpen = expanded === forma.id;
          return (
            <div
              key={forma.id}
              className="rounded-xl border border-border bg-card-muted/50 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{forma.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {forma.shortLabel}
                      {forma.hotkey ? ` · ${forma.hotkey}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === 0}
                    onClick={() => onChange(reorder(value, forma.id, -1))}
                    aria-label={`Subir ${forma.label}`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === sorted.length - 1}
                    onClick={() => onChange(reorder(value, forma.id, 1))}
                    aria-label={`Descer ${forma.label}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={forma.ativo}
                    disabled={disabled}
                    onCheckedChange={(ativo) => onChange(patchItem(value, forma.id, { ativo: ativo === true }))}
                    aria-label={`Ativar ${forma.label}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={disabled}
                    onClick={() => setExpanded(isOpen ? null : forma.id)}
                  >
                    {isOpen ? "Fechar" : "Editar"}
                  </Button>
                </div>
              </div>
              {isOpen ? (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Rótulo no PDV</Label>
                      <Input
                        value={forma.label}
                        disabled={disabled}
                        onChange={(e) => onChange(patchItem(value, forma.id, { label: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Rótulo curto</Label>
                      <Input
                        value={forma.shortLabel}
                        disabled={disabled}
                        onChange={(e) => onChange(patchItem(value, forma.id, { shortLabel: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ícone</Label>
                      <Select
                        value={forma.icon}
                        disabled={disabled}
                        onValueChange={(icon) =>
                          onChange(
                            patchItem(value, forma.id, {
                              icon: icon as FormaPagamentoConfig["icon"],
                            }),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMA_PAGAMENTO_ICON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cor</Label>
                      <Select
                        value={forma.cor}
                        disabled={disabled}
                        onValueChange={(cor) =>
                          onChange(
                            patchItem(value, forma.id, {
                              cor: cor as FormaPagamentoConfig["cor"],
                            }),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMA_PAGAMENTO_COLOR_OPTIONS.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Atalho (opcional)</Label>
                      <Input
                        value={forma.hotkey ?? ""}
                        disabled={disabled}
                        placeholder="Ex.: F2"
                        onChange={(e) =>
                          onChange(patchItem(value, forma.id, { hotkey: e.target.value.trim() || undefined }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FlagRow
                      label="Exigir cliente"
                      checked={forma.exigirCliente}
                      disabled={disabled}
                      onCheckedChange={(v) => onChange(patchItem(value, forma.id, { exigirCliente: v }))}
                    />
                    <FlagRow
                      label="Exigir CPF/CNPJ"
                      checked={forma.exigirCpf}
                      disabled={disabled}
                      onCheckedChange={(v) => onChange(patchItem(value, forma.id, { exigirCpf: v }))}
                    />
                    <FlagRow
                      label="Exigir autorização (supervisor)"
                      checked={forma.exigirAutorizacao}
                      disabled={disabled}
                      onCheckedChange={(v) => onChange(patchItem(value, forma.id, { exigirAutorizacao: v }))}
                    />
                    <FlagRow
                      label="Permitir troco"
                      checked={forma.permitirTroco}
                      disabled={disabled || forma.id !== "dinheiro"}
                      onCheckedChange={(v) => onChange(patchItem(value, forma.id, { permitirTroco: v }))}
                    />
                    <FlagRow
                      label="Permitir no pagamento múltiplo"
                      checked={forma.permitirNoMultiplo}
                      disabled={disabled || forma.id === "multiplo"}
                      onCheckedChange={(v) => onChange(patchItem(value, forma.id, { permitirNoMultiplo: v }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlagRow({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <Label className="text-sm font-normal text-foreground">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} />
    </div>
  );
}
