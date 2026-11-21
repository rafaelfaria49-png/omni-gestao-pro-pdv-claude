"use client"

import { useEffect, useState } from "react"
import { ACESSORIO_CORES_PADRAO } from "@/lib/acessorios/cores"
import { withModoCaptura, type ProdutoAcessoriosFormValue } from "@/lib/acessorios/form"
import { isAcessorioModoCaptura } from "@/lib/acessorios/metadata"
import type { AcessorioModoCaptura, ProdutoAcessorioTipo } from "@/lib/acessorios/types"
import { carregarCores, carregarOrganizacao } from "@/lib/compat/compat-client"
import type { CorEfetiva } from "@/lib/compat/cores-loja"

type Props = {
  /** Loja do produto (header explícito). Sem loja: só paleta padrão, sem preferências da loja. */
  lojaHeader?: string | null
  value: ProdutoAcessoriosFormValue
  onChange: (value: ProdutoAcessoriosFormValue) => void
}

const TIPOS: Array<{ value: ProdutoAcessorioTipo; label: string }> = [
  { value: "capinha", label: "Capinha" },
  { value: "pelicula", label: "Película" },
  { value: "acessorio_generico", label: "Acessório genérico" },
]

const MODOS: Array<{ value: AcessorioModoCaptura; label: string }> = [
  { value: "obrigatorio", label: "Obrigatório — o PDV não adiciona sem informar" },
  { value: "opcional", label: "Opcional — pergunta, mas dá para pular" },
  { value: "desativado", label: "Desativado — não pergunta" },
]

function modoAtual(value: ProdutoAcessoriosFormValue, campo: "modelo" | "cor"): AcessorioModoCaptura {
  const explicito = campo === "modelo" ? value.modoModelo : value.modoCor
  if (explicito) return explicito
  return (campo === "modelo" ? value.exigeModelo : value.exigeCor) ? "obrigatorio" : "desativado"
}

/**
 * Configuração de acessórios do produto. COMPAT-PROFISSIONAL-001: modelo e cor viram
 * obrigatório / opcional / desativado (produtos antigos abrem com o equivalente dos booleanos)
 * e as cores próprias da loja podem ser escolhidas por produto. O estoque continua único no
 * produto — modelo/cor informados na venda são histórico, não saldo.
 */
// Recebe a loja por prop (não usa o provider de loja ativa): o formulário roda também em
// harness isolado, sem sessão NextAuth.
export function ProdutoAcessoriosConfig({ lojaHeader: lojaProp, value, onChange }: Props) {
  const patch = (next: Partial<ProdutoAcessoriosFormValue>) => onChange({ ...value, ...next })
  const lojaHeader = (lojaProp ?? "").trim() || null
  const [coresLoja, setCoresLoja] = useState<CorEfetiva[]>([])

  useEffect(() => {
    if (!lojaHeader || !value.enabled) return
    let vivo = true
    void carregarCores(lojaHeader).then((r) => {
      // Resposta sem a lista (servidor antigo/harness) = sem cores próprias, nunca quebra o formulário.
      if (vivo && r.ok && Array.isArray(r.cores)) setCoresLoja(r.cores.filter((c) => c.origem === "loja" && c.ativo))
    })
    return () => {
      vivo = false
    }
  }, [lojaHeader, value.enabled])

  const toggleCor = (key: ProdutoAcessoriosFormValue["coresPermitidas"][number], checked: boolean) => {
    const selected = new Set(value.coresPermitidas)
    if (checked) selected.add(key)
    else selected.delete(key)
    patch({ coresPermitidas: ACESSORIO_CORES_PADRAO.filter((cor) => selected.has(cor.key)).map((cor) => cor.key) })
  }

  const toggleCorLoja = (id: string, checked: boolean) => {
    const atual = value.coresLoja ?? coresLoja.map((c) => c.id)
    const next = checked ? [...new Set([...atual, id])] : atual.filter((x) => x !== id)
    patch({ coresLoja: next })
  }

  // Padrão da loja (Compat › Preferências), carregado antes: ativar a configuração é síncrono.
  const [padraoLoja, setPadraoLoja] = useState<{ modelo: AcessorioModoCaptura; cor: AcessorioModoCaptura } | null>(null)
  useEffect(() => {
    if (!lojaHeader || value.enabled) return
    let vivo = true
    void carregarOrganizacao(lojaHeader).then((r) => {
      if (vivo && r.ok && isAcessorioModoCaptura(r.preferencias?.modoModeloPadrao) && isAcessorioModoCaptura(r.preferencias?.modoCorPadrao)) {
        setPadraoLoja({ modelo: r.preferencias.modoModeloPadrao, cor: r.preferencias.modoCorPadrao })
      }
    })
    return () => {
      vivo = false
    }
  }, [lojaHeader, value.enabled])

  // Ao ativar a configuração pela 1ª vez, sugere o padrão da loja.
  const ativar = (checked: boolean) => {
    if (!checked || value.modoModelo || value.modoCor || !padraoLoja) {
      patch({ enabled: checked })
      return
    }
    onChange(withModoCaptura(withModoCaptura({ ...value, enabled: true }, "modelo", padraoLoja.modelo), "cor", padraoLoja.cor))
  }

  const modoCor = modoAtual(value, "cor")

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Configuração de acessórios">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary"
          checked={value.enabled}
          onChange={(event) => ativar(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">Configuração de acessórios</span>
          <span className="block text-xs text-muted-foreground">
            Para capinhas, películas e acessórios que pedem modelo e/ou cor no PDV. O estoque continua único neste produto.
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

          <div className="grid gap-3 sm:grid-cols-2">
            {(["modelo", "cor"] as const).map((campo) => (
              <label key={campo} className="block min-w-0 space-y-1 text-sm text-foreground">
                <span className="font-medium">{campo === "modelo" ? "Modelo do aparelho na venda" : "Cor na venda"}</span>
                <select
                  aria-label={campo === "modelo" ? "Modelo do aparelho na venda" : "Cor na venda"}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={modoAtual(value, campo)}
                  onChange={(event) => onChange(withModoCaptura(value, campo, event.target.value as AcessorioModoCaptura))}
                >
                  {MODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            ))}
          </div>

          {modoCor !== "desativado" && (
            <>
              <BooleanField
                label="Usar cores padrão"
                checked={value.usaCoresPadrao}
                onChange={(checked) => patch({ usaCoresPadrao: checked })}
              />
              {value.usaCoresPadrao ? (
                <p className="text-xs text-muted-foreground">
                  As cores padrão ativas da loja{coresLoja.length ? " e as cores próprias" : ""} estarão disponíveis.
                </p>
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
                  {coresLoja.length > 0 && (
                    <>
                      <p className="pt-1 text-xs font-medium text-muted-foreground">Cores da loja</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {coresLoja.map((cor) => (
                          <label key={cor.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={(value.coresLoja ?? coresLoja.map((c) => c.id)).includes(cor.id)}
                              onChange={(event) => toggleCorLoja(cor.id, event.target.checked)}
                            />
                            {cor.label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </fieldset>
              )}
            </>
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
