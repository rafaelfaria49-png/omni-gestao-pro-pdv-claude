"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { formatarWhatsappComercial, linkWhatsappComercial } from "@/lib/comercial/gestao-lojas-oferta"

type Props = {
  contatoWhatsapp: string | null
}

const WHATSAPP_MSG = "Olá! Quero conhecer o OmniGestão Pro — Vendas e Estoque."

export function GestaoLojasHeader({ contatoWhatsapp }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => {
    if (!menuAberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAberto(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuAberto])

  const waHref = contatoWhatsapp ? linkWhatsappComercial(contatoWhatsapp, WHATSAPP_MSG) : null
  const waLabel = contatoWhatsapp ? formatarWhatsappComercial(contatoWhatsapp) : null

  return (
    <header className="gl-header gl-dark-zone">
      <div className="gl-wrap gl-header__bar">
        <a className="gl-brand" href="/gestao-lojas" aria-label="OmniGestão Pro, Vendas e Estoque, início da página">
          <Image
            src="/gestao-lojas/omni-logo-icon.webp"
            alt=""
            width={36}
            height={36}
            className="gl-brand__icon"
            priority
          />
          <span className="gl-brand__text">
            <span className="gl-brand__word">
              OmniGestão <span className="gl-brand__pro">Pro</span>
            </span>
            <span className="gl-brand__sub">Vendas e Estoque</span>
          </span>
        </a>

        <nav className="gl-nav" aria-label="Seções da página">
          <a href="#sistema">O sistema</a>
          <a href="#para-quem">Para quem é</a>
          <a href="#acesso">Acesso</a>
          <a href="#oferta">Plano e teste</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>

        <div className="gl-header__actions">
          {waHref && waLabel && (
            <a
              className="gl-header__wa"
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp comercial ${waLabel}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>{waLabel}</span>
            </a>
          )}
          <a className="gl-header__login" href="/login">Entrar</a>
          <a className="gl-btn gl-btn--primary gl-btn--xs" href="#solicitar">Pedir teste</a>
          <button
            type="button"
            className="gl-menu-toggle"
            aria-expanded={menuAberto}
            aria-controls="gl-mobile-drawer"
            aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuAberto((v) => !v)}
          >
            {menuAberto ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div id="gl-mobile-drawer" className="gl-mobile-drawer" hidden={!menuAberto}>
        <nav aria-label="Menu mobile">
          <a href="#sistema" onClick={() => setMenuAberto(false)}>O sistema por dentro</a>
          <a href="#para-quem" onClick={() => setMenuAberto(false)}>Para que tipo de loja</a>
          <a href="#acesso" onClick={() => setMenuAberto(false)}>Navegador e computador</a>
          <a href="#oferta" onClick={() => setMenuAberto(false)}>Plano R$ 69,90 e teste grátis</a>
          <a href="#duvidas" onClick={() => setMenuAberto(false)}>Dúvidas frequentes</a>
          <a href="/baixar" onClick={() => setMenuAberto(false)}>Instalar no computador</a>
          <a href="/login" onClick={() => setMenuAberto(false)}>Entrar no sistema</a>
        </nav>
        <div className="gl-mobile-drawer__foot">
          <a className="gl-btn gl-btn--primary gl-btn--sm" href="#solicitar" onClick={() => setMenuAberto(false)}>
            Pedir 7 dias de teste grátis
          </a>
          {waHref && waLabel && (
            <a className="gl-btn gl-btn--glass gl-btn--sm" href={waHref} target="_blank" rel="noopener noreferrer">
              WhatsApp {waLabel}
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
