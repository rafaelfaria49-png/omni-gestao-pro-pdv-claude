"use client"

import Image from "next/image"
import { EVENTO_AMPLIAR_TELA, EVENTO_SELECIONAR_TELA, type TelaKey } from "./SistemaShowcase"

export function HeroStage() {
  function irParaTela(key: TelaKey) {
    window.dispatchEvent(new CustomEvent<TelaKey>(EVENTO_SELECIONAR_TELA, { detail: key }))
    document.getElementById("sistema")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function ampliarPdv() {
    window.dispatchEvent(new CustomEvent<TelaKey>(EVENTO_AMPLIAR_TELA, { detail: "pdv" }))
  }

  return (
    <div className="gl-hero__stage">
      <div className="gl-stage-frame">
        <div className="gl-browser-bar">
          <span className="gl-browser-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="gl-browser-url">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.4" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            omnigestao.pro / pdv
          </span>
          <button type="button" className="gl-zoom-pill" onClick={ampliarPdv} aria-label="Ampliar captura real do PDV">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
            </svg>
            Ampliar
          </button>
        </div>

        <button type="button" className="gl-stage-img-btn" onClick={ampliarPdv} aria-label="Abrir visualização ampliada da tela real do PDV">
          <Image
            src="/gestao-lojas/pdv.png"
            alt="Tela real do PDV do OmniGestão Pro com produtos fictícios no carrinho e total de R$ 62,30."
            width={1216}
            height={480}
            priority
            sizes="(min-width: 1024px) 680px, 100vw"
          />
        </button>

        <div className="gl-stage-footer">
          <button type="button" className="gl-stage-pill" onClick={() => irParaTela("caixa")}>Ver Caixa</button>
          <button type="button" className="gl-stage-pill" onClick={() => irParaTela("estoque")}>Ver Estoque</button>
          <button type="button" className="gl-stage-pill" onClick={() => irParaTela("clientes")}>Ver Clientes</button>
        </div>
      </div>

      <p className="gl-stage-caption">Captura real do PDV do OmniGestão Pro preenchida com produtos fictícios.</p>

      <div
        className="gl-receipt gl-receipt--hero gl-receipt--animate"
        role="img"
        aria-label="Exemplo de comprovante com dados fictícios: 3 itens, total R$ 62,30 pago no Pix."
      >
        <div className="gl-receipt__paper">
          <div className="gl-receipt__head" aria-hidden="true">
            <strong>Loja Exemplo</strong>
            Comprovante de venda
          </div>
          <ul className="gl-receipt__rows" aria-hidden="true">
            <li><span>Caderno 10 mat.</span><span>24,90</span></li>
            <li><span>3 x Caneta azul</span><span>7,50</span></li>
            <li><span>Cabo USB-C 1 m</span><span>29,90</span></li>
          </ul>
          <div className="gl-receipt__total" aria-hidden="true">
            <span>Total</span><span>R$ 62,30</span>
          </div>
          <div className="gl-receipt__foot" aria-hidden="true">
            Pago no Pix<br />Exemplo com dados fictícios
          </div>
        </div>
      </div>
    </div>
  )
}
