import { ImageResponse } from "next/og"

export const alt = "OmniGestão Pro — Vendas e Estoque: PDV, caixa, estoque e clientes para lojas."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/* Mesmos tokens de components/gestao-lojas/gestao-lojas.css (ImageResponse não lê CSS externo). */
const INK = "#0b2a3f"
const PAPER = "#f6f9fb"
const BRAND = "#0369a1"
const SOFT = "#33566d"

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, padding: 72, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: BRAND, display: "flex" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: INK }}>OmniGestão Pro</span>
            <span style={{ fontSize: 24, color: SOFT }}>Vendas e Estoque</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 76, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: -2 }}>O balcão da sua loja, organizado.</span>
          <span style={{ fontSize: 32, color: SOFT }}>PDV, caixa, estoque, clientes e comprovantes.</span>
        </div>
      </div>
    </div>,
    size,
  )
}
