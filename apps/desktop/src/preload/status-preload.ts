/**
 * Preload SOMENTE da tela local de status (arquivo dentro do pacote).
 * O sistema remoto (OmniGestão na nuvem) não recebe preload algum.
 *
 * Expõe 3 ações fixas, sem argumentos vindos da página, e um ouvinte de estado.
 */
import { contextBridge, ipcRenderer } from "electron"

// Sandbox: o preload não pode importar módulos locais — constantes duplicadas de status-protocol.ts.
const CH = {
  state: "omni-status:state",
  retry: "omni-status:retry",
  close: "omni-status:close",
  openUpdate: "omni-status:open-update",
}

contextBridge.exposeInMainWorld("omniStatus", {
  retry: () => ipcRenderer.send(CH.retry),
  close: () => ipcRenderer.send(CH.close),
  openUpdate: () => ipcRenderer.send(CH.openUpdate),
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on(CH.state, (_e, state) => cb(state))
  },
})
