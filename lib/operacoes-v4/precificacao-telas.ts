// Regra comercial opt-in para telas. Sem loja implícita, I/O ou configuração salva.
// A aplicação desta regra depende da escolha explícita no formulário do orçamento.

/** Fronteira R$ → centavos: não arredonda valores com fração de centavo. */
export function reaisParaCentavosV4(valor: number | null | undefined): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(valor));
  if (!partes) return null;
  const centavos = Number(`${partes[1]}${(partes[2] ?? "").padEnd(2, "0")}`);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Preço sugerido em centavos; custo ausente/zero/inválido não produz sugestão. */
export function sugerirPrecoTelaCentavos(custo: number | null | undefined): number | null {
  if (typeof custo !== "number" || !Number.isSafeInteger(custo) || custo <= 0) return null;
  if (custo <= 20_000) return custo + 20_000;
  if (custo <= 70_000) return custo * 2;
  if (custo <= 100_000) return custo + 70_000;

  // 170%, arredondamento de meio centavo para cima, sem ponto flutuante.
  const preco = (BigInt(custo) * BigInt(170) + BigInt(50)) / BigInt(100);
  return preco <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(preco) : null;
}

export const CORTESIAS_TELA_V4 = {
  capinha: { descricao: "Capinha", custoCentavos: 350 },
  pelicula: { descricao: "Película", custoCentavos: 150 },
} as const;

export type CortesiaTelaV4 = keyof typeof CORTESIAS_TELA_V4;
