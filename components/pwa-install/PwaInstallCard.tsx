"use client"

import { useEffect, useState } from "react"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"
import {
  INSTALLED_EVENT,
  INSTALLED_GLOBAL,
  NOME_BROWSER,
  PASSOS_MANUAIS,
  PROMPT_EVENT,
  PROMPT_GLOBAL,
  resolveInstallMode,
  TITULO_PASSOS_MANUAIS,
  type InstallMode,
  type ManualInstallKind,
} from "@/lib/pwa-install/install-state"

/** Evento `beforeinstallprompt` (Chromium) — não está nos tipos padrão do DOM. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type Win = Window & {
  [PROMPT_GLOBAL]?: InstallPromptEvent | null
  [INSTALLED_GLOBAL]?: boolean
}

type Nav = Navigator & {
  userAgentData?: { brands?: { brand: string }[]; mobile?: boolean }
  standalone?: boolean
}

/**
 * Script inline (sem dependências) que guarda `beforeinstallprompt` e `appinstalled` antes da
 * hidratação do React: navegadores Chromium podem disparar o evento logo no carregamento.
 */
export const CAPTURE_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.${PROMPT_GLOBAL}=e;window.dispatchEvent(new Event("${PROMPT_EVENT}"))});window.addEventListener("appinstalled",function(){window.${PROMPT_GLOBAL}=null;window.${INSTALLED_GLOBAL}=true;window.dispatchEvent(new Event("${INSTALLED_EVENT}"))})}catch(_){}})();`

function readEnvironment(promptAvailable: boolean, promptAccepted: boolean, justInstalled: boolean) {
  const nav = navigator as Nav
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    Boolean(nav.standalone) ||
    false
  return {
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands?.map((b) => b.brand),
    mobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone,
    promptAvailable,
    promptAccepted,
    justInstalled,
  }
}

function isManualMode(mode: InstallMode): mode is Extract<InstallMode, { kind: ManualInstallKind }> {
  return (
    mode.kind === "manual-edge" ||
    mode.kind === "manual-chrome" ||
    mode.kind === "manual-android-chrome" ||
    mode.kind === "manual-android-edge" ||
    mode.kind === "manual-ios-safari"
  )
}

export function PwaInstallCard() {
  const [mode, setMode] = useState<InstallMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const w = window as Win
    let accepted = false
    let installed = Boolean(w[INSTALLED_GLOBAL])

    const update = () => {
      setMode(resolveInstallMode(readEnvironment(Boolean(w[PROMPT_GLOBAL]), accepted, installed)))
    }
    const onInstalled = () => {
      installed = true
      accepted = false
      w[PROMPT_GLOBAL] = null
      w[INSTALLED_GLOBAL] = true
      const env = readEnvironment(false, false, true)
      const resolved = resolveInstallMode(env)
      const isMob = "mobile" in resolved && resolved.mobile
      setMessage(
        isMob
          ? `${APP_DISPLAY_NAME} instalado. Abra pelo ícone adicionado na tela inicial.`
          : `${APP_DISPLAY_NAME} instalado. Abra pelo atalho da Área de Trabalho ou do Menu Iniciar.`,
      )
      setMode(resolved)
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      w[PROMPT_GLOBAL] = e as InstallPromptEvent
      update()
    }

    update()
    window.addEventListener(PROMPT_EVENT, update)
    window.addEventListener(INSTALLED_EVENT, onInstalled)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener(PROMPT_EVENT, update)
      window.removeEventListener(INSTALLED_EVENT, onInstalled)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function install() {
    const w = window as Win
    const evt = w[PROMPT_GLOBAL]
    if (!evt) return
    setBusy(true)
    setMessage(null)
    try {
      await evt.prompt()
      const choice = await evt.userChoice
      // O pedido do navegador só pode ser usado uma vez.
      w[PROMPT_GLOBAL] = null
      if (choice.outcome === "accepted") {
        // Não afirma "instalado" antes do evento `appinstalled`: o navegador ainda conclui a criação do atalho.
        if (w[INSTALLED_GLOBAL]) {
          const resolved = resolveInstallMode(readEnvironment(false, false, true))
          const isMob = "mobile" in resolved && resolved.mobile
          setMessage(
            isMob
              ? `${APP_DISPLAY_NAME} instalado. Abra pelo ícone adicionado na tela inicial.`
              : `${APP_DISPLAY_NAME} instalado. Abra pelo atalho da Área de Trabalho ou do Menu Iniciar.`,
          )
          setMode(resolved)
        } else {
          setMessage("Instalação confirmada no navegador. Aguarde a conclusão para abrir pelo atalho criado.")
          setMode(resolveInstallMode(readEnvironment(false, true, false)))
        }
      } else {
        setMessage("Instalação cancelada. Você pode instalar depois pelo menu do navegador abaixo.")
        setMode(resolveInstallMode(readEnvironment(false, false, false)))
      }
    } catch {
      w[PROMPT_GLOBAL] = null
      setMessage("O navegador não abriu a instalação. Use os passos do menu abaixo.")
      setMode(resolveInstallMode(readEnvironment(false, false, false)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-primary bg-card p-5 text-card-foreground"
      data-testid="pwa-install-card"
      data-mode={mode?.kind ?? "carregando"}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="instalar-app" className="text-xl font-semibold">
          Aplicativo pelo navegador (PWA){" "}
          <span className="text-sm font-medium text-primary">· disponível hoje</span>
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Grátis, sem baixar arquivo executável e sem senha de administrador. O navegador cria o atalho e abre o sistema
          em janela própria, com o nome e o ícone do {APP_DISPLAY_NAME}. É a mesma conta e os mesmos dados do acesso web.
        </p>
      </div>

      {mode === null ? (
        <p className="text-sm text-muted-foreground">Verificando o navegador…</p>
      ) : mode.kind === "instalado" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="font-medium">
            {mode.mobile ? "Instalado neste dispositivo." : "Instalado neste computador."}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar no sistema
            </a>
          </div>
        </div>
      ) : mode.kind === "instalacao-aceita" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {mode.mobile
              ? "O navegador iniciou a criação do atalho na tela inicial."
              : "O navegador iniciou a criação do atalho na Área de Trabalho e no Menu Iniciar."}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar no sistema
            </a>
          </div>
        </div>
      ) : mode.kind === "um-clique" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={install}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              {busy ? "Abrindo a instalação…" : `Instalar ${APP_DISPLAY_NAME}`}
            </button>
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar pelo navegador
            </a>
          </div>
          <p className="text-xs text-muted-foreground">O {NOME_BROWSER[mode.browser]} vai pedir confirmação.</p>
        </div>
      ) : isManualMode(mode) ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium">{TITULO_PASSOS_MANUAIS[mode.kind]}</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {PASSOS_MANUAIS[mode.kind].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          {mode.kind === "manual-edge" || mode.kind === "manual-chrome" ? (
            <p className="text-xs text-muted-foreground">
              Se a opção não aparecer, o sistema já pode estar instalado: procure {APP_DISPLAY_NAME} no Menu Iniciar.
            </p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar pelo navegador
            </a>
          </div>
        </div>
      ) : mode.kind === "manual-ios-outro" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            No iPhone e no iPad, o {NOME_BROWSER[mode.browser]} não cria o atalho direto de aplicativo. Abra esta página
            no <strong>Safari</strong> para usar <em>Compartilhar → Adicionar à Tela de Início</em> — ou continue
            acessando normalmente pelo navegador.
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar pelo navegador
            </a>
          </div>
        </div>
      ) : mode.kind === "manual-android-outro" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            O {NOME_BROWSER[mode.browser]} não oferece instalação nativa direta aqui. No Android, abra esta página no{" "}
            <strong>Google Chrome</strong> ou no <strong>Microsoft Edge</strong> para instalar como aplicativo — ou
            continue usando pelo navegador.
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar pelo navegador
            </a>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            O {NOME_BROWSER[mode.browser]} não instala sites como aplicativo no computador. Abra esta página no{" "}
            <strong>Microsoft Edge</strong> (já vem no Windows 10 e 11) ou no <strong>Google Chrome</strong> para
            instalar — ou continue usando normalmente pelo navegador.
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Entrar pelo navegador
            </a>
          </div>
        </div>
      )}

      {message ? (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      ) : null}
    </div>
  )
}
