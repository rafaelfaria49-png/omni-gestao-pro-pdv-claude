// @vitest-environment jsdom
/** PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — overlay em animação de saída não bloqueia atalhos. */
import { afterEach, expect, it } from "vitest"
import { hasPdvShortcutOverlay } from "./pdv-keymap"

afterEach(() => { document.body.innerHTML = "" })

function add(role: string, state?: string) {
  const el = document.createElement("div")
  el.setAttribute("role", role)
  if (state) el.setAttribute("data-state", state)
  document.body.appendChild(el)
}

it.each(["dialog", "alertdialog", "menu", "listbox"])("%s aberto (ou sem data-state) bloqueia; fechando não", (role) => {
  expect(hasPdvShortcutOverlay()).toBe(false)
  add(role, "closed")
  expect(hasPdvShortcutOverlay()).toBe(false)
  add(role, "open")
  expect(hasPdvShortcutOverlay()).toBe(true)
  document.body.innerHTML = ""
  add(role)
  expect(hasPdvShortcutOverlay()).toBe(true)
})

it("flag local continua bloqueando", () => {
  expect(hasPdvShortcutOverlay(true)).toBe(true)
})
