"use client"

import { useEffect, useRef } from "react"

/**
 * Executa `reiniciar` só na transição fechado → aberto do diálogo.
 *
 * Os diálogos de aparelhos recebem a política da loja como objeto vindo do resumo do painel. Toda
 * ação concluída recarrega esse resumo e a política chega com nova identidade (mesmo conteúdo):
 * um efeito com `[open, politica]` zerava o formulário aberto — a compra recém-registrada perdia a
 * tela do protocolo e o que o usuário digitava se perdia. A versão mais recente de `reiniciar` é
 * usada, então os valores lidos são os do momento da abertura.
 */
export function useReiniciarAoAbrir(open: boolean, reiniciar: () => void) {
  const aberto = useRef(false)
  const fn = useRef(reiniciar)
  useEffect(() => { fn.current = reiniciar })
  useEffect(() => {
    if (!open) { aberto.current = false; return }
    if (aberto.current) return
    aberto.current = true
    fn.current()
  }, [open])
}
