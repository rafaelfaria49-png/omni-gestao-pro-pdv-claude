/**
 * Contador HUB · Pacote do Contador — compactação ZIP (jszip).
 *
 * GOAL 008. Reutiliza `jszip` (já em package.json, usado pelo importador; tipos próprios,
 * sem dependência nativa). O volume é comprovadamente pequeno — o conteúdo deriva do DTO
 * agregado (KB), nunca de linhas cruas — então manter o ZIP em memória é seguro
 * (limites explícitos aplicados em `seguranca.ts` antes da compactação).
 *
 * Determinístico o suficiente: a data de cada entrada usa `agora` (injetável). Os hashes
 * do manifesto são do CONTEÚDO em UTF-8, independentes dos bytes do container ZIP.
 */
import JSZip from "jszip"
import type { ArquivoPacote } from "./tipos"

/** Compacta os arquivos (na ordem dada) e devolve os bytes do ZIP. */
export async function ziparArquivos(
  arquivos: readonly ArquivoPacote[],
  agora: Date,
): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const arquivo of arquivos) {
    zip.file(arquivo.caminho, arquivo.conteudo, { date: agora })
  }
  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })
  return buffer
}
