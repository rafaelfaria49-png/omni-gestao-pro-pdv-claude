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

/**
 * Pasta de perfil do canal MSIX (dentro de %AppData%). Precisa ser um nome que o Setup.exe nunca usa:
 * no Windows 10 1903+, o app empacotado grava ARQUIVOS JÁ EXISTENTES de %AppData% no lugar real e só
 * redireciona os novos para a área privada do pacote. Reusar "OmniGestão Pro" (perfil do Setup.exe)
 * dividiria o perfil entre os dois lugares conforme a máquina. Pasta nova = sempre privada do pacote.
 */
export const MSIX_PROFILE_DIR = "OmniGestão Pro Store"
