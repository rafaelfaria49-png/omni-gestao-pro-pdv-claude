import { ImageResponse } from "next/og"
import { OFERTA_COMERCIAL_GESTAO_LOJAS, formatarPrecoMensal } from "@/lib/comercial/gestao-lojas-oferta"

export const alt = "OmniGestão Pro — Vendas e Estoque: PDV, caixa, produtos, estoque, clientes e relatórios para lojas."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const NAVY = "#061428"
const NAVY_CARD = "#0b2444"
const ELECTRIC = "#0ea5e9"
const SKY = "#7dd3fc"
const WHITE = "#ffffff"
const SOFT = "#cbd5e1"

export default function OpenGraphImage() {
  const preco = formatarPrecoMensal(OFERTA_COMERCIAL_GESTAO_LOJAS.precoMensalCentavos)
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: `linear-gradient(145deg, ${NAVY} 0%, ${NAVY_CARD} 100%)`,
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: ELECTRIC,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: WHITE,
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            O
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: WHITE }}>OmniGestão Pro</span>
            <span style={{ fontSize: 22, color: SKY }}>Vendas e Estoque</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 66, fontWeight: 800, color: WHITE, lineHeight: 1.06, letterSpacing: -2 }}>
            O balcão da sua loja, sob controle profissional.
          </span>
          <span style={{ fontSize: 28, color: SOFT }}>
            PDV, caixa, produtos, estoque, clientes e relatórios pelo navegador.
          </span>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: WHITE,
              background: ELECTRIC,
              padding: "10px 22px",
              borderRadius: 12,
            }}
          >
            {preco}/mês · Até {OFERTA_COMERCIAL_GESTAO_LOJAS.usuariosInclusos} usuários
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: SKY,
              border: "2px solid rgba(125,211,252,0.4)",
              padding: "10px 22px",
              borderRadius: 12,
            }}
          >
            {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias de teste grátis acompanhado
          </span>
        </div>
      </div>
    </div>,
    size,
  )
}
