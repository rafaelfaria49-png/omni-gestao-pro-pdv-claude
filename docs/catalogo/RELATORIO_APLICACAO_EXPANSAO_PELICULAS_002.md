# Relatório de Aplicação da Expansão de Películas — 002

GOAL: `CATALOGO-PELICULAS-SEEDS-EXPAND-002`
Data: 2026-07-10
Base usada: `origin/main` em `b5b6d0a` (contém a revisão de películas `7cf356b`)
Revisão aplicada: `CATALOGO-PELICULAS-PROPOSTA-REVIEW-001`

## Resultado

As 51 linhas efetivas da proposta revisada foram processadas de forma conservadora:

| Decisão da revisão | Linhas processadas | Resultado nos seeds |
| --- | ---: | --- |
| aprovar | 37 | aplicadas |
| ajustar | 12 | aplicadas com o ajuste incorporado |
| rejeitar | 2 | não aplicadas |
| **total** | **51** | **49 aplicadas e 2 excluídas** |

Nenhuma relação recebeu `confirmado_fornecedor`. Todas as 27 novas linhas de compatibilidade mantêm `requires_dry_test=true` e usam somente `provavel_mercado` + `media` ou `precisa_testar` + `baixa`.

## Arquivos alterados

- `docs/catalogo/seeds/device_models_seed_001.csv`
- `docs/catalogo/seeds/device_aliases_seed_001.csv`
- `docs/catalogo/seeds/device_compatibilities_seed_001.csv`
- `docs/catalogo/seeds/device_review_queue_seed_001.csv`
- `docs/catalogo/RELATORIO_APLICACAO_EXPANSAO_PELICULAS_002.md`

## Modelos novos

Foram adicionados 12 modelos que ainda não existiam no seed:

- `motorola_edge_40`
- `poco_c55`
- `poco_m5`
- `realme_c21`
- `infinix_hot_10`
- `infinix_hot_11`
- `infinix_hot_12`
- `infinix_hot_20`
- `infinix_hot_30`
- `infinix_hot_40`
- `infinix_smart_8`
- `tecno_spark_10`

Os modelos Infinix/Tecno foram cadastrados como modelos base e não absorvem variantes Play, Pro, Lite, i, C, HD ou 5G. O Edge 40 foi mantido sem grupo automático por causa da tela curva.

## Aliases

Foram adicionados 35 aliases únicos. As variantes `Poco C55`/`POCO C55` e `Poco M5`/`POCO M5`, que diferem apenas por caixa, foram deduplicadas pela forma normalizada.

Os aliases curtos receberam as proteções revisadas:

- `C55`: `is_ambiguous=true` e `requires_brand_context=true` por colidir com Realme C55;
- `M5`: `is_ambiguous=true` e `requires_brand_context=true` por ser curto e insuficiente sem a marca POCO.

Os aliases de Infinix/Tecno identificam somente o modelo base e registram explicitamente que não incluem variantes silenciosas.

## Relações de película

Foram aplicadas 22 propostas de relação aprovadas ou ajustadas. A expansão determinística em pares unidirecionais gerou 27 linhas no seed:

- `pelicula_p001`: 6 pares entre iPhone 7, iPhone 8, SE 2020 e SE 2022;
- `pelicula_p002`, `p004`, `p005`, `p007`–`p011` e `p013`–`p024`: 1 par cada;
- `pelicula_p006`: somente A22 4G/M22, conforme o ajuste; M32 e A31 ficaram fora até evidência física.

Ajustes conservadores incorporados:

- iPhone 12 Mini/13 Mini, 15/16 e 15 Plus/16 Plus ficaram como candidatos de teste físico com baixa confiança e alertas de notch/moldura;
- A15/A25 permaneceu em `precisa_testar` + `baixa`;
- E13/G13 foi rebaixado para `precisa_testar` + `baixa` e exige validação do recorte frontal;
- Note 12, Note 12 Pro e Note 13 registram a variante incerta no próprio grupo/notas e permanecem em `precisa_testar` + `baixa`;
- Spark 20/20C permaneceu somente como teste físico por variante;
- A22 5G e A32 4G/5G não foram incluídos em qualquer nova relação.

## Relações rejeitadas

Foram aplicadas 0 linhas rejeitadas. Não existem chaves novas `pelicula_p003` ou `pelicula_p012` no seed:

- `pelicula_p003` — iPhone 14 Pro Max / 15 Plus / 15 Pro Max: não aplicada;
- `pelicula_p012` — Moto G72 / Edge 30 / G52: não aplicada.

## Fila de revisão

Foram adicionados 15 itens com namespace `review_p001`–`review_p015`:

- duplicatas One Fusion/Macro/Zoom;
- `redmi_x5` suspeito;
- separação obrigatória A22 4G/5G e A32 4G/5G;
- telas curvas do Note 14 Pro/Pro+ e Edge 40;
- S21–S24 sem grupo e iPhone 12 Pro Max sem grupo;
- POCO C40 e POCO M5 sem família de película validada;
- variantes Infinix/Tecno;
- Moto G84 e G32 sem grupo;
- mutirão dos sete supergrupos multimarca;
- aliases numéricos/curtos que exigem marca.

## Riscos preservados

- tela curva não gera grupo automático;
- variante 4G/5G incerta não recebe promoção;
- relações sem fornecedor/teste físico continuam com teste seco obrigatório;
- supergrupos multimarca continuam aguardando amostragem física;
- modelos Infinix/Tecno não herdam aliases ou compatibilidades de variantes;
- aliases curtos ou multimarcas permanecem condicionados ao contexto de marca.

## Smoke tests sugeridos

1. Buscar `Edge 40` e confirmar modelo sem grupo de película.
2. Buscar `C55` sem marca e confirmar ambiguidade; repetir com `POCO C55` e `Realme C55`.
3. Buscar `M5` sem marca e confirmar exigência de contexto; repetir com `POCO M5`.
4. Buscar `Hot 30` e confirmar que o resultado não inclui Hot 30i/Play.
5. Buscar `SE 2020` e confirmar o grupo iPhone 7/8/SE com status `provavel_mercado` e teste seco.
6. Confirmar que iPhone 14 Pro Max/15 Plus/15 Pro Max não formam `pelicula_p003`.
7. Confirmar que Moto G72/Edge 30/G52 não formam `pelicula_p012`.
8. Confirmar que A22 4G/M22 é o único par de `pelicula_p006`.

## Validação estrutural

Os quatro CSVs foram reimportados após a alteração. Foram verificados: número de colunas, chaves únicas, aliases normalizados por modelo, referências de compatibilidade, ausência de autorrelações, ausência das duas rejeições e flags conservadoras. O resultado foi consistente sem chaves duplicadas ou referências ausentes.

## Testes automatizados executados

- `npx vitest run lib/catalogo-aparelhos`: 54 de 55 testes passaram. A única falha é a asserção preexistente em `peliculas.test.ts` que exige que `apple_iphone_12_mini` continue sem grupo; a revisão aprovada adiciona deliberadamente `pelicula_p002` para iPhone 12 Mini/13 Mini como `precisa_testar` + `baixa` e `requires_dry_test=true`. O teste não foi alterado porque código está fora do escopo deste GOAL.
- `npx tsc --noEmit --incremental false`: concluído com sucesso (`exit 0`) após disponibilizar na worktree isolada os tipos Prisma já gerados. Nenhum arquivo versionado foi criado ou alterado por essa validação.
