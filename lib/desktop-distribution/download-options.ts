/**
 * Opções de download por versão do Windows na página /baixar — puro e testável.
 *
 * Um único instalador x64 (Electron 45: "Windows 10 and up", binários x64/arm64) atende
 * Windows 10 e 11. Por isso as duas opções apontam para o MESMO artefato oficial, com a
 * mesma versão e o mesmo SHA-256 — não existem instaladores separados.
 *
 * O botão de uma opção só fica ativo quando as duas condições valem:
 *  1. há release pública válida (`getDesktopDownloadState` → manifesto assinado e conferido);
 *  2. aquele Windows está HOMOLOGADO em `compatibility.ts` (evidência de teste real).
 * Biblioteca suportar a plataforma não conta como homologação.
 */

import { DESKTOP_COMPATIBILIDADE, type CompatStatus } from "./compatibility"
import type { DesktopRelease } from "./release-manifest"
import type { PlatformInfo } from "./platform"

export type WindowsOptionId = "windows-10" | "windows-11"

export interface WindowsDownloadOption {
  id: WindowsOptionId
  titulo: string
  arquitetura: string
  botao: string
  status: CompatStatus
  detalhe: string
  /** URL https do instalador oficial; null = botão desativado. */
  installerUrl: string | null
  /** Motivo exibido quando o botão está desativado. */
  bloqueio: string | null
}

const OPCOES: { id: WindowsOptionId; titulo: string; sistema: string }[] = [
  { id: "windows-10", titulo: "Windows 10", sistema: "Windows 10 22H2 (64 bits, x64)" },
  { id: "windows-11", titulo: "Windows 11", sistema: "Windows 11 (64 bits, x64)" },
]

export function resolveWindowsOptions(
  release: Pick<DesktopRelease, "installerUrl"> | null,
  compat = DESKTOP_COMPATIBILIDADE,
): WindowsDownloadOption[] {
  return OPCOES.map(({ id, titulo, sistema }) => {
    const entry = compat.find((c) => c.sistema === sistema)
    const status: CompatStatus = entry?.status ?? "em-validacao"
    const homologado = status === "verificado"
    let bloqueio: string | null = null
    if (!release) bloqueio = "Download público ainda não liberado."
    else if (!homologado) bloqueio = `Em validação no ${titulo}. Até a confirmação, use pelo navegador.`
    return {
      id,
      titulo,
      arquitetura: "64 bits",
      botao: `Baixar para ${titulo}`,
      status,
      detalhe: entry?.detalhe ?? "Ainda não testado em computador real.",
      installerUrl: release && homologado ? release.installerUrl : null,
      bloqueio,
    }
  })
}

/** Sugestão pela detecção — só orienta, nunca escolhe pelo usuário. */
export function suggestedWindowsOption(info: PlatformInfo | null): WindowsOptionId | null {
  if (!info || info.kind !== "windows-x64") return null
  if (info.windowsVersion === "11") return "windows-11"
  if (info.windowsVersion === "10") return "windows-10"
  return null
}
