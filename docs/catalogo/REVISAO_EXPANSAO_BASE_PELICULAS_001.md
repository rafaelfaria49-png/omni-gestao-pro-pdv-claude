# Revisão da Expansão da Base de Películas — FABLE 001

GOAL: `CATALOGO-PELICULAS-PROPOSTA-REVIEW-001`  
Data da revisão: 2026-07-10  
Base: `main` / `origin/main` em `36482ff`

## Resultado

Foram revisadas as 51 linhas efetivas de `proposta_expansao_peliculas_fable_001.csv`.

| Decisão | Quantidade |
| --- | ---: |
| aprovar | 37 |
| ajustar | 12 |
| rejeitar | 2 |
| **total** | **51** |

## Itens seguros para o próximo GOAL

- Os 10 novos modelos sem alias curto ambíguo: Edge 40, Realme C21, Infinix Hot 10/11/12/20/30/40, Infinix Smart 8 e Tecno Spark 10. Eles entram sem grupo automático.
- Relações consolidadas e delimitadas: iPhone 7/8/SE 2020/SE 2022, Moto E32s/E32, Redmi Note 11S/Note 11, POCO X3 NFC/X3 e POCO C55/Redmi 12C.
- Os 15 registros de fila de revisão, pois não promovem compatibilidade e deixam riscos explícitos.

## Itens que exigem ajuste

- POCO C55 e POCO M5: os aliases curtos `C55` e `M5` devem ser ambíguos e exigir marca.
- iPhone 12 Mini/13 Mini, 15/16 e 15 Plus/16 Plus: manter somente como candidatos a teste seco, com alertas sobre notch e molduras.
- A22 4G/M22/M32/A31: testar primeiro o par A22 4G/M22; não ampliar o grupo sem evidência física.
- A15/A25 e Moto E13/G13: conservar baixa confiança; no segundo caso, validar o recorte frontal antes de qualquer relação.
- Note 12, Note 12 Pro e Note 13: identificar explicitamente a variante 4G/5G e não promover confiança sem teste físico.
- Tecno Spark 20/20C: manter como teste por variante, sem compatibilidade promovida.

## Itens rejeitados

- `pelicula_p003` — iPhone 14 Pro Max / 15 Plus / 15 Pro Max: mistura molduras e recortes de gerações diferentes sem molde comum comprovado.
- `pelicula_p012` — Moto G72 / Edge 30 / G52: mistura telas de 6,5 e 6,6 polegadas e molduras distintas.

## Riscos e testes físicos

O próximo GOAL deve preservar `requires_dry_test=true` onde já indicado e priorizar os testes abaixo:

- telas curvas: Edge 40, Redmi Note 14 Pro/Pro+ e Samsung Ultra;
- pares Samsung A22 4G/A22 5G e A32 4G/A32 5G, que não podem ser agrupados;
- variantes Infinix/Tecno (Play, Pro, i, C, HD e 5G);
- os sete supergrupos multimarca, sem promoção de status antes de amostragem física;
- aliases numéricos ou curtos, sempre com contexto de marca.

## Recomendação final

Aplicar no `CATALOGO-PELICULAS-SEEDS-EXPAND-002` somente as linhas aprovadas e as ajustadas após incorporar literalmente os ajustes desta revisão. Não aplicar as duas relações rejeitadas. Nenhuma relação de tela curva, variante 4G/5G incerta ou supergrupo deve receber promoção de status por esta proposta.
