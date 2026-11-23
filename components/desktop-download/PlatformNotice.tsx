"use client"

import { useEffect, useState } from "react"
import { classifyPlatform, type PlatformInfo } from "@/lib/desktop-distribution/platform"

type UAData = {
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>
}

/** Plataforma de quem visita (null até detectar). Só orienta; nunca bloqueia a escolha manual. */
export function usePlatformInfo(): PlatformInfo | null {
  const [info, setInfo] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    let alive = true
    const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
    const base = { userAgent: navigator.userAgent, platform: uaData?.platform }
    if (!uaData?.getHighEntropyValues) {
      setInfo(classifyPlatform(base))
      return
    }
    uaData
      .getHighEntropyValues(["architecture", "bitness", "platformVersion"])
      .then((v) => alive && setInfo(classifyPlatform({ ...base, ...v })))
      .catch(() => alive && setInfo(classifyPlatform(base)))
    return () => {
      alive = false
    }
  }, [])

  return info
}

/** Mensagem conforme o computador de quem visita. */
export function PlatformNotice({ info }: { info: PlatformInfo | null }) {
  if (!info) return null
  const message = noticeFor(info)
  if (!message) return null
  return (
    <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  )
}

export function noticeFor(info: PlatformInfo): string | null {
  switch (info.kind) {
    case "windows-x64":
      if (info.windowsVersion === "11") return "Detectamos Windows 11 de 64 bits. Destacamos a opção do seu computador, mas você pode escolher a outra."
      if (info.windowsVersion === "10") return "Detectamos Windows 10 de 64 bits. Destacamos a opção do seu computador, mas você pode escolher a outra."
      return "Detectamos Windows de 64 bits (x64). Escolha abaixo a versão do seu Windows."
    case "windows-arm":
      return "Este computador usa processador ARM. O instalador é só para x64 — use o OmniGestão Pro pelo navegador."
    case "windows-32":
      return "Este Windows parece ser de 32 bits. O instalador exige Windows de 64 bits (x64) — use pelo navegador."
    case "windows-desconhecido":
      return "Não foi possível confirmar a versão deste Windows. Para conferir, aperte as teclas Windows + R e digite winver. O instalador é para Windows 64 bits (x64); em processador ARM, use pelo navegador."
    case "mac":
    case "linux":
    case "outro":
      return "Este computador não é Windows. Use o OmniGestão Pro pelo navegador, com a mesma conta."
    case "android":
    case "ios":
      return "No celular ou tablet, use o OmniGestão Pro pelo navegador. O instalador é para computadores Windows."
  }
}
