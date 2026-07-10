import type { Metadata } from "next"
import { BuscadorPeliculas } from "@/components/dashboard/catalogo/buscador-peliculas"

/**
 * CATALOGO-PELICULAS-BUSCADOR-MVP-002 — tela isolada de CONSULTA do catálogo.
 * Sem venda, sem estoque, sem cadastro: apenas o buscador de películas.
 */

export const metadata: Metadata = {
  title: "Catálogo de Aparelhos · OmniGestão Pro",
  description: "Busque compatibilidade de películas por modelo, alias ou marca.",
}

export default function CatalogoAparelhosPage() {
  return <BuscadorPeliculas />
}
