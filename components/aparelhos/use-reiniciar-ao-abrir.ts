"use client"

import { useEffect, useRef } from "react"

/**
 * Executa `reiniciar` na transição fechado → aberto do diálogo e, se `versao` for informada,
 * também quando ela muda com o diálogo aberto.
 *
 * Os diálogos de aparelhos recebem a política da loja como objeto vindo do resumo do painel. Toda
 * ação concluída recarrega esse resumo e a política chega com nova identidade (mesmo conteúdo):
 * um efeito com `[open, politica]` zerava o formulário aberto — a compra recém-registrada perdia a
 * tela do protocolo e o que o usuário digitava se perdia. A versão mais recente de `reiniciar` é
 * usada, então os valores lidos são os do momento da abertura.
 *
 * `versao` serve ao editor da própria política: reaberto antes de a recarga chegar, ele mostraria a
 * versão anterior e, ao salvar, reverteria os demais campos. Mesma versão = mesmo conteúdo, então
 * uma recarga sem mudança real não apaga a edição em curso.
 */
export function useReiniciarAoAbrir(open: boolean, reiniciar: () => void, versao?: number | string) {
  const aberto = useRef(false)
  const versaoVista = useRef(versao)
  const fn = useRef(reiniciar)
  useEffect(() => { fn.current = reiniciar })
  useEffect(() => {
    if (!open) { aberto.current = false; return }
    if (aberto.current && versaoVista.current === versao) return
    aberto.current = true
    versaoVista.current = versao
    fn.current()
  }, [open, versao])
}
