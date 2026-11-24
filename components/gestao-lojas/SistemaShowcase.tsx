"use client"

import { useEffect, useId, useRef, useState } from "react"
import Image from "next/image"

export type TelaKey = "pdv" | "caixa" | "estoque" | "clientes"

export const EVENTO_SELECIONAR_TELA = "gl:selecionar-tela"
export const EVENTO_AMPLIAR_TELA = "gl:ampliar-tela"

type TelaConfig = {
  key: TelaKey
  num: string
  tabLabel: string
  titulo: string
  descricao: string
  url: string
  src: string
  width: number
  height: number
  alt: string
  legenda: string
  light?: boolean
  checks: readonly string[]
}

const TELAS: readonly TelaConfig[] = [
  {
    key: "pdv",
    num: "01",
    tabLabel: "PDV e Balcão",
    titulo: "PDV rápido para o ritmo do balcão",
    descricao: "Tela limpa de alto contraste pensada para atendimento ágil, tanto com leitor de código de barras quanto no teclado.",
    url: "omnigestao.pro / pdv",
    src: "/gestao-lojas/pdv.png",
    width: 1216,
    height: 480,
    alt: "Tela real do PDV do OmniGestão Pro com produtos fictícios no carrinho e total de R$ 62,30.",
    legenda: "Tela real do PDV do OmniGestão Pro com produtos fictícios.",
    checks: [
      "Busca rápida por nome ou leitura direta de código de barras.",
      "Atalhos de teclado visíveis (F1 finalizar, F2 cliente, F12 pagamento múltiplo).",
      "Aceita Dinheiro, Pix, Débito, Crédito e venda a prazo vinculada ao cliente.",
    ],
  },
  {
    key: "caixa",
    num: "02",
    tabLabel: "Fechamento de Caixa",
    titulo: "Fechamento de caixa conferido por forma de pagamento",
    descricao: "Saiba exatamente quanto entrou em Dinheiro, Pix, Débito e Crédito e confira o valor esperado na gaveta ao final do expediente.",
    url: "omnigestao.pro / caixa",
    src: "/gestao-lojas/caixa.png",
    width: 1264,
    height: 878,
    alt: "Tela real de fechamento de caixa do OmniGestão Pro com recebido por forma de pagamento e dinheiro esperado na gaveta, com dados fictícios.",
    legenda: "Fechamento de caixa real conferido por forma de pagamento, com dados fictícios.",
    checks: [
      "Separação clara entre dinheiro físico da gaveta e recebimentos digitais.",
      "Registro de abertura, suprimentos e sangrias durante o turno.",
      "Contagem opcional por cédulas e moedas com conferência de diferença.",
    ],
  },
  {
    key: "estoque",
    num: "03",
    tabLabel: "Produtos e Estoque",
    titulo: "Produtos organizados e estoque atualizado a cada venda",
    descricao: "Cadastre produtos com preço, código de barras e categoria, acompanhe custo e margem potencial e veja avisos de estoque baixo.",
    url: "omnigestao.pro / estoque",
    src: "/gestao-lojas/estoque.png",
    width: 1440,
    height: 900,
    alt: "Tela real de produtos e estoque do OmniGestão Pro com itens fictícios.",
    legenda: "Tela real de produtos e estoque do OmniGestão Pro com itens fictícios.",
    light: true,
    checks: [
      "Baixa automática no estoque assim que a venda é finalizada no PDV.",
      "Indicadores claros de estoque baixo, valor em estoque e margem.",
      "Entradas e ajustes gravados no histórico de movimentações.",
    ],
  },
  {
    key: "clientes",
    num: "04",
    tabLabel: "Clientes e Histórico",
    titulo: "Cadastro de clientes e histórico completo de compras",
    descricao: "Mantenha o contato de quem compra na sua loja, consulte o total gasto e acompanhe vendas a prazo ligadas ao cadastro certo.",
    url: "omnigestao.pro / clientes",
    src: "/gestao-lojas/clientes.png",
    width: 1440,
    height: 900,
    alt: "Tela real de clientes do OmniGestão Pro com cadastros fictícios.",
    legenda: "Tela real de clientes do OmniGestão Pro com cadastros fictícios.",
    checks: [
      "Cadastro com nome, telefone, email e CPF ou CNPJ.",
      "Busca rápida por documento, telefone ou nome.",
      "Histórico de compras e ticket médio organizados por cliente.",
    ],
  },
]

export function SistemaShowcase() {
  const uid = useId()
  const [ativa, setAtiva] = useState<TelaKey>("pdv")
  const [lightboxKey, setLightboxKey] = useState<TelaKey | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const atual = TELAS.find((t) => t.key === ativa) ?? TELAS[0]
  const lbTela = lightboxKey ? TELAS.find((t) => t.key === lightboxKey) ?? TELAS[0] : null

  useEffect(() => {
    const onSelect = (e: Event) => {
      const k = (e as CustomEvent<TelaKey>).detail
      if (TELAS.some((t) => t.key === k)) setAtiva(k)
    }
    const onZoom = (e: Event) => {
      const k = (e as CustomEvent<TelaKey>).detail
      if (TELAS.some((t) => t.key === k)) {
        triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setAtiva(k)
        setLightboxKey(k)
      }
    }
    window.addEventListener(EVENTO_SELECIONAR_TELA, onSelect)
    window.addEventListener(EVENTO_AMPLIAR_TELA, onZoom)
    return () => {
      window.removeEventListener(EVENTO_SELECIONAR_TELA, onSelect)
      window.removeEventListener(EVENTO_AMPLIAR_TELA, onZoom)
    }
  }, [])

  useEffect(() => {
    if (!lightboxKey) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxKey(null)
        triggerRef.current?.focus()
      } else if (e.key === "ArrowRight") {
        setLightboxKey((prev) => {
          const i = TELAS.findIndex((t) => t.key === prev)
          return TELAS[(i + 1) % TELAS.length].key
        })
      } else if (e.key === "ArrowLeft") {
        setLightboxKey((prev) => {
          const i = TELAS.findIndex((t) => t.key === prev)
          return TELAS[(i - 1 + TELAS.length) % TELAS.length].key
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxKey])

  function abrirLightbox(key: TelaKey) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setLightboxKey(key)
  }

  function fecharLightbox() {
    setLightboxKey(null)
    triggerRef.current?.focus()
  }

  function moverLightbox(delta: number) {
    setLightboxKey((prev) => {
      const i = TELAS.findIndex((t) => t.key === prev)
      return TELAS[(i + delta + TELAS.length) % TELAS.length].key
    })
  }

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1
    if (e.key === "ArrowRight") next = (index + 1) % TELAS.length
    else if (e.key === "ArrowLeft") next = (index - 1 + TELAS.length) % TELAS.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = TELAS.length - 1
    if (next < 0) return
    e.preventDefault()
    const target = TELAS[next]
    setAtiva(target.key)
    document.getElementById(`${uid}-tab-${target.key}`)?.focus()
  }

  return (
    <>
      <div className="gl-tabs" role="tablist" aria-label="Módulos do sistema">
        {TELAS.map((t, i) => (
          <button
            key={t.key}
            id={`${uid}-tab-${t.key}`}
            type="button"
            role="tab"
            className="gl-tab"
            aria-selected={ativa === t.key}
            aria-controls={`${uid}-panel`}
            tabIndex={ativa === t.key ? 0 : -1}
            onClick={() => setAtiva(t.key)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
          >
            <span className="gl-tab__num">{t.num}</span>
            {t.tabLabel}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${atual.key}`}
        className="gl-showcase"
      >
        <div className="gl-showcase__info">
          <h3>{atual.titulo}</h3>
          <p>{atual.descricao}</p>
          <ul className="gl-checks">
            {atual.checks.map((item) => (
              <li key={item}>
                <span className="gl-checks__ic" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="gl-showcase__meta">
            <button type="button" className="gl-btn gl-btn--outline gl-btn--sm" onClick={() => abrirLightbox(atual.key)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
              </svg>
              Ampliar captura
            </button>
            <a className="gl-btn gl-btn--navy gl-btn--sm" href="#solicitar">Testar na minha loja</a>
          </div>
        </div>

        <figure className={`gl-showcase__frame ${atual.light ? "gl-showcase__frame--light" : ""}`} style={{ margin: 0 }}>
          <div className="gl-browser-bar">
            <span className="gl-browser-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="gl-browser-url">{atual.url}</span>
            <button type="button" className="gl-zoom-pill" onClick={() => abrirLightbox(atual.key)}>
              Ampliar
            </button>
          </div>

          <button
            type="button"
            className="gl-stage-img-btn"
            onClick={() => abrirLightbox(atual.key)}
            aria-label={`Ampliar captura: ${atual.tabLabel}`}
          >
            <Image
              src={atual.src}
              alt={atual.alt}
              width={atual.width}
              height={atual.height}
              sizes="(min-width: 1024px) 680px, 100vw"
            />
          </button>

          <figcaption className="gl-showcase__caption">
            <span>{atual.legenda}</span>
            <span style={{ color: "#7dd3fc", fontWeight: 600 }}>Clique para ampliar</span>
          </figcaption>
        </figure>
      </div>

      {/* Cobertura dos 6 módulos autorizados: Relatórios operacionais + Comprovantes */}
      <div className="gl-companions">
        <article className="gl-companion">
          <div>
            <span className="gl-companion__badge">Incluído no plano</span>
            <h3>Relatórios operacionais da loja</h3>
            <p>
              Consulte o histórico de vendas, o resumo das movimentações de estoque e os fechamentos de caixa para acompanhar a rotina da loja sem montar planilhas manuais.
            </p>
            <div className="gl-companion__chips">
              <span className="gl-chip">Histórico de vendas</span>
              <span className="gl-chip">Resumo por pagamento</span>
              <span className="gl-chip">Movimentação de estoque</span>
              <span className="gl-chip">Histórico de caixa</span>
            </div>
          </div>
        </article>

        <article className="gl-companion gl-companion--receipt">
          <div>
            <span className="gl-companion__badge">Comprovantes e impressão</span>
            <h3>Comprovante não fiscal na sua impressora</h3>
            <p>
              Ao concluir a venda, imprima o comprovante com itens, total e forma de pagamento pela impressora configurada no computador da loja. Conferimos a compatibilidade do seu modelo durante o teste acompanhado.
            </p>
          </div>
          <div
            className="gl-receipt"
            style={{ width: 176, margin: "0 auto" }}
            role="img"
            aria-label="Miniatura de comprovante não fiscal com dados fictícios: total R$ 62,30."
          >
            <div className="gl-receipt__paper" style={{ fontSize: "10.5px", padding: "11px 11px 9px" }}>
              <div className="gl-receipt__head" aria-hidden="true">
                <strong>Loja Exemplo</strong>
                Comprovante não fiscal
              </div>
              <ul className="gl-receipt__rows" aria-hidden="true">
                <li><span>Caderno 10m</span><span>24,90</span></li>
                <li><span>Cabo USB-C</span><span>29,90</span></li>
              </ul>
              <div className="gl-receipt__total" aria-hidden="true">
                <span>Total</span><span>R$ 62,30</span>
              </div>
              <div className="gl-receipt__foot" aria-hidden="true">Dados fictícios</div>
            </div>
          </div>
        </article>
      </div>

      {lbTela && (
        <div
          className="gl-lightbox gl-dark-zone"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${uid}-lb-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharLightbox()
          }}
        >
          <div className="gl-lightbox__panel">
            <div className="gl-lightbox__head">
              <div>
                <strong id={`${uid}-lb-title`}>{lbTela.titulo}</strong>
                <span>{lbTela.url}</span>
              </div>
              <button ref={closeRef} type="button" className="gl-lightbox__btn" onClick={fecharLightbox}>
                Fechar (Esc)
              </button>
            </div>
            <Image
              src={lbTela.src}
              alt={lbTela.alt}
              width={lbTela.width}
              height={lbTela.height}
              className="gl-lightbox__img"
              sizes="95vw"
            />
            <div className="gl-lightbox__foot">
              <span>{lbTela.legenda}</span>
              <div className="gl-lightbox__nav">
                <button type="button" className="gl-lightbox__btn" onClick={() => moverLightbox(-1)}>
                  ← Anterior
                </button>
                <button type="button" className="gl-lightbox__btn" onClick={() => moverLightbox(1)}>
                  Próxima →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
