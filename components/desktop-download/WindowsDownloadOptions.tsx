"use client"

import { PlatformNotice, usePlatformInfo } from "@/components/desktop-download/PlatformNotice"
import { suggestedWindowsOption, type WindowsDownloadOption } from "@/lib/desktop-distribution/download-options"
import type { CompatStatus } from "@/lib/desktop-distribution/compatibility"

const STATUS_LABEL: Record<CompatStatus, string> = {
  verificado: "Homologado",
  "em-validacao": "Em validação",
  "nao-suportado": "Não suportado",
}

export interface ReleaseSummary {
  version: string
  sizeLabel: string
  publishedLabel: string
}

/** Duas opções (Windows 10 / Windows 11). A detecção só destaca uma sugestão. */
export function WindowsDownloadOptions({
  options,
  release,
}: {
  options: WindowsDownloadOption[]
  release: ReleaseSummary | null
}) {
  const info = usePlatformInfo()
  const suggested = suggestedWindowsOption(info)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {options.map((o) => {
          const isSuggested = suggested === o.id
          return (
            <article
              key={o.id}
              aria-labelledby={`opt-${o.id}`}
              className={`flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground ${isSuggested ? "border-primary ring-1 ring-primary" : "border-border"}`}
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 id={`opt-${o.id}`} className="text-lg font-semibold">{o.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{o.arquitetura} (x64)</p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${o.status === "verificado" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              {isSuggested ? <p className="text-xs font-medium text-primary">Sugerido para este computador</p> : null}
              <p className="text-sm leading-relaxed text-muted-foreground">{o.detalhe}</p>
              {release ? (
                <p className="text-sm text-muted-foreground">
                  Versão {release.version} · {release.sizeLabel} · publicada em {release.publishedLabel}
                </p>
              ) : null}
              <div className="mt-auto flex min-w-0 flex-col gap-2">
                {o.installerUrl ? (
                  <a
                    href={o.installerUrl}
                    download
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  >
                    {o.botao}
                  </a>
                ) : (
                  <>
                    <span
                      aria-disabled="true"
                      className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-md border border-border bg-muted px-5 py-3 text-sm font-semibold text-muted-foreground"
                    >
                      {o.botao}
                    </span>
                    {o.bloqueio ? <p className="text-xs text-muted-foreground">{o.bloqueio}</p> : null}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <PlatformNotice info={info} />
    </div>
  )
}
