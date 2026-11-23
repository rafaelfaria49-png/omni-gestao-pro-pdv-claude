/**
 * Como este executável foi instalado.
 *
 * - "squirrel": Setup.exe (instalação por usuário em %LocalAppData%\OmniGestaoPro). Atualização = novo
 *   Setup.exe; o programa só AVISA pelo manifesto oficial.
 * - "msix": pacote MSIX (Microsoft Store). O Electron marca `process.windowsStore = true` dentro do
 *   contêiner do pacote. Quem atualiza é a Store: sem eventos do Squirrel, sem consultar o manifesto do
 *   Setup.exe e sem AppUserModelID próprio (o pacote já define o dele).
 */
export type DesktopPackageKind = "squirrel" | "msix"

export function packageKind(proc: { windowsStore?: boolean }): DesktopPackageKind {
  return proc.windowsStore === true ? "msix" : "squirrel"
}
