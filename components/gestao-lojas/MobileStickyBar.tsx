"use client"

import { useEffect, useState } from "react"
import { OFERTA_COMERCIAL_GESTAO_LOJAS, formatarPrecoMensal, linkWhatsappComercial } from "@/lib/comercial/gestao-lojas-oferta"

type Props = {
  contatoWhatsapp: string | null
}

export function MobileStickyBar({ contatoWhatsapp }: Props) {
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    const alvo = document.getElementById("solicitar")
    if (!alvo || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        setOculto(entries.some((entry) => entry.isIntersecting))
      },
      { threshold: 0.12 },
    )
    observer.observe(alvo)
    return () => observer.disconnect()
  }, [])

  const waHref = contatoWhatsapp
    ? linkWhatsappComercial(contatoWhatsapp, "Olá! Quero conhecer o OmniGestão Pro — Vendas e Estoque.")
    : null

  return (
    <div
      className={`gl-mobile-dock gl-dark-zone ${oculto ? "gl-mobile-dock--hidden" : ""}`}
      aria-label="Ação rápida mobile"
      aria-hidden={oculto || undefined}
    >
      <div className="gl-mobile-dock__info">
        <strong>{formatarPrecoMensal(OFERTA_COMERCIAL_GESTAO_LOJAS.precoMensalCentavos)}/mês</strong>
        <span>{OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias grátis acompanhados</span>
      </div>
      <div className="gl-mobile-dock__btns">
        {waHref && (
          <a
            className="gl-mobile-dock__wa"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar no WhatsApp comercial"
            tabIndex={oculto ? -1 : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </a>
        )}
        <a className="gl-btn gl-btn--primary gl-btn--xs" href="#solicitar" tabIndex={oculto ? -1 : undefined}>
          Pedir teste
        </a>
      </div>
    </div>
  )
}
