"use client"

import { ACESSORIO_CORES_PADRAO } from "@/lib/acessorios/cores"
import type { ProdutoAcessoriosFormValue } from "@/lib/acessorios/form"
import type { ProdutoAcessorioTipo } from "@/lib/acessorios/types"

type Props = {
  value: ProdutoAcessoriosFormValue
  onChange: (value: ProdutoAcessoriosFormValue) => void
}

const TIPOS: Array<{ value: ProdutoAcessorioTipo; label: string }> = [
  { value: "capinha", label: "Capinha" },
  { value: "pelicula", label: "Película" },
  { value: "acessorio_generico", label: "Acessório genérico" },
]

export function ProdutoAcessoriosConfig({ value, onChange }: Props) {
  const patch = (next: Partial<ProdutoAcessoriosFormValue>) => onChange({ ...value, ...next })
  const toggleCor = (key: ProdutoAcessoriosFormValue["coresPermitidas"][number], checked: boolean) => {
    const selected = new Set(value.coresPermitidas)
    if (checked) selected.add(key)
    else selected.delete(key)
    patch({ coresPermitidas: ACESSORIO_CORES_PADRAO.filter((cor) => selected.has(cor.key)).map((cor) => cor.key) })
  }

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Configuração de acessórios">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary"
          checked={value.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">Configuração de acessórios</span>
          <span className="block text-xs text-muted-foreground">
            Ative apenas para produtos que futuramente solicitarão modelo e/ou cor no PDV.
          </span>
        </span>
      </label>

      {value.enabled ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <label className="block space-y-1 text-sm text-foreground">
            <span className="font-medium">Tipo</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.tipo}
              onChange={(event) => patch({ tipo: event.target.value as ProdutoAcessorioTipo })}
            >
              {TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <BooleanField
              label="Exige modelo do aparelho"
              checked={value.exigeModelo}
              onChange={(checked) => patch({ exigeModelo: checked })}
            />
            <BooleanField
              label="Exige cor"
              checked={value.exigeCor}
              onChange={(checked) => patch({ exigeCor: checked })}
            />
            <BooleanField
              label="Usar cores padrão"
              checked={value.usaCoresPadrao}
              onChange={(checked) => patch({ usaCoresPadrao: checked })}
            />
          </div>

          {value.usaCoresPadrao ? (
            <p className="text-xs text-muted-foreground">As 18 cores canônicas estarão permitidas.</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Cores permitidas</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {ACESSORIO_CORES_PADRAO.map((cor) => (
                  <label key={cor.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={value.coresPermitidas.includes(cor.key)}
                      onChange={(event) => toggleCor(cor.key, event.target.checked)}
                    />
                    {cor.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      ) : null}
    </section>
  )
}

function BooleanField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
