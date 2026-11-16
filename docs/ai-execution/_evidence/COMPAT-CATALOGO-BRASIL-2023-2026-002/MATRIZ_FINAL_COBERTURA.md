# Matriz final de cobertura — COMPAT-CATALOGO-BRASIL-2023-2026-002

Gerada dos seeds versionados (`docs/catalogo/seeds/device_models_seed_001.csv`) contra `origin/main` por `gerar-matriz-cobertura.ts` (nesta pasta).
Total de linhas: **693** · pesquisáveis: **684** · fora da busca: **9**.

## 1. Linhas fora da busca (todas intencionais)

| modelKey | Nome | Status | Aparelho real (replaced_by) | Real é pesquisável | Busca pelo nome antigo acha o real | Motivo |
|---|---|---|---|---|---|---|
| `apple_iphone_17_air` | Apple iPhone 17 Air | mesclado | `apple_iphone_air` | sim | sim | Nome não oficial: a Apple lançou "iPhone Air" (2025). Linha mantida por histórico. |
| `apple_iphone_7_branco` | Apple iPhone 7 Branco | mesclado | `apple_iphone_7` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_7_plus_branco` | Apple iPhone 7 Plus Branco | mesclado | `apple_iphone_7_plus` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_7_plus_preto` | Apple iPhone 7 Plus Preto | mesclado | `apple_iphone_7_plus` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_7_preto` | Apple iPhone 7 Preto | mesclado | `apple_iphone_7` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_8_branco` | Apple iPhone 8 Branco | mesclado | `apple_iphone_8` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_8_plus_branco` | Apple iPhone 8 Plus Branco | mesclado | `apple_iphone_8_plus` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_8_plus_preto` | Apple iPhone 8 Plus Preto | mesclado | `apple_iphone_8_plus` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |
| `apple_iphone_8_preto` | Apple iPhone 8 Preto | mesclado | `apple_iphone_8` | sim | sim | Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por históric |

Modelos globais `aguardando_lancamento`: 0. Nenhum aparelho comercial válido fica oculto: os 9 são linhas mescladas cujo aparelho real é pesquisável.

## 2. Cobertura 2023–2026 por marca × ano

Célula: modelos pesquisáveis com esse ano de lançamento no seed (+ quantos entraram nesta PR).

| Marca | 2023 | 2024 | 2025 | 2026 | Total 2023–26 | Novos nesta PR | Pesquisáveis sem ano no seed |
|---|---|---|---|---|---|---|---|
| Apple | 4 (+0) | 4 (+0) | 5 (+0) | 4 (+3) | 17 | 3 | 0 |
| Samsung | 20 (+6) | 18 (+8) | 26 (+17) | 13 (+8) | 77 | 39 | 86 |
| Motorola | 12 (+4) | 17 (+8) | 15 (+11) | 13 (+12) | 57 | 35 | 81 |
| Xiaomi | 5 (+5) | 4 (+4) | 5 (+5) | 0 (+0) | 14 | 14 | 5 |
| Redmi | 11 (+3) | 11 (+5) | 8 (+5) | 6 (+6) | 36 | 19 | 48 |
| POCO | 5 (+1) | 9 (+6) | 10 (+7) | 5 (+5) | 29 | 19 | 22 |
| Realme | 6 (+3) | 17 (+11) | 11 (+9) | 2 (+2) | 36 | 25 | 17 |
| Infinix | 11 (+8) | 11 (+11) | 9 (+9) | 4 (+4) | 35 | 32 | 6 |
| Secundárias (ocultas por padrão) | 15 | 38 | 18 | 0 | 71 | 71 | 14 |

Secundárias sem ano: LG 11, Tecno 3 (total de secundárias pesquisáveis: 85).

"Sem ano no seed": linhas antigas (majoritariamente anteriores a 2023) ou de lançamento escalonado/ambíguo (anúncio em dezembro com venda em janeiro; linha Pro China → global; variante 4G × 5G em anos diferentes), deixadas sem ano de propósito por `scripts/catalogo/preencher-ano-existentes.mjs`. Pendências não cadastradas: `docs/catalogo/AUDITORIA_CATALOGO_BRASIL_2023_2026.md`.

## 3. iPhones desde o iPhone 6

| Ano | Modelo | modelKey | Status | Pesquisável | Busca pelo nome acha |
|---|---|---|---|---|---|
| 2014 | Apple iPhone 6 | `apple_iphone_6` | ativo | sim | sim |
| 2014 | Apple iPhone 6 Plus | `apple_iphone_6_plus` | legado | sim | sim |
| 2015 | Apple iPhone 6s | `apple_iphone_6s` | ativo | sim | sim |
| 2015 | Apple iPhone 6s Plus | `apple_iphone_6s_plus` | ativo | sim | sim |
| 2016 | Apple iPhone 7 | `apple_iphone_7` | legado | sim | sim |
| 2016 | Apple iPhone 7 Branco | `apple_iphone_7_branco` | mesclado → `apple_iphone_7` | não (mesclado) | sim |
| 2016 | Apple iPhone 7 Plus | `apple_iphone_7_plus` | legado | sim | sim |
| 2016 | Apple iPhone 7 Plus Branco | `apple_iphone_7_plus_branco` | mesclado → `apple_iphone_7_plus` | não (mesclado) | sim |
| 2016 | Apple iPhone 7 Plus Preto | `apple_iphone_7_plus_preto` | mesclado → `apple_iphone_7_plus` | não (mesclado) | sim |
| 2016 | Apple iPhone 7 Preto | `apple_iphone_7_preto` | mesclado → `apple_iphone_7` | não (mesclado) | sim |
| 2017 | Apple iPhone 8 | `apple_iphone_8` | legado | sim | sim |
| 2017 | Apple iPhone 8 Branco | `apple_iphone_8_branco` | mesclado → `apple_iphone_8` | não (mesclado) | sim |
| 2017 | Apple iPhone 8 Plus | `apple_iphone_8_plus` | legado | sim | sim |
| 2017 | Apple iPhone 8 Plus Branco | `apple_iphone_8_plus_branco` | mesclado → `apple_iphone_8_plus` | não (mesclado) | sim |
| 2017 | Apple iPhone 8 Plus Preto | `apple_iphone_8_plus_preto` | mesclado → `apple_iphone_8_plus` | não (mesclado) | sim |
| 2017 | Apple iPhone 8 Preto | `apple_iphone_8_preto` | mesclado → `apple_iphone_8` | não (mesclado) | sim |
| 2017 | Apple iPhone X | `apple_iphone_x` | legado | sim | sim |
| 2018 | Apple iPhone XR | `apple_iphone_xr` | legado | sim | sim |
| 2018 | Apple iPhone XS | `apple_iphone_xs` | legado | sim | sim |
| 2018 | Apple iPhone XS Max | `apple_iphone_xs_max` | legado | sim | sim |
| 2019 | Apple iPhone 11 | `apple_iphone_11` | ativo | sim | sim |
| 2019 | Apple iPhone 11 Pro | `apple_iphone_11_pro` | ativo | sim | sim |
| 2019 | Apple iPhone 11 Pro Max | `apple_iphone_11_pro_max` | ativo | sim | sim |
| 2020 | Apple iPhone 12 | `apple_iphone_12` | ativo | sim | sim |
| 2020 | Apple iPhone 12 Mini | `apple_iphone_12_mini` | ativo | sim | sim |
| 2020 | Apple iPhone 12 Pro | `apple_iphone_12_pro` | ativo | sim | sim |
| 2020 | Apple iPhone 12 Pro Max | `apple_iphone_12_pro_max` | ativo | sim | sim |
| 2020 | Apple iPhone SE 2020 | `apple_iphone_se_2020` | legado | sim | sim |
| 2021 | Apple iPhone 13 | `apple_iphone_13` | ativo | sim | sim |
| 2021 | Apple iPhone 13 Mini | `apple_iphone_13_mini` | ativo | sim | sim |
| 2021 | Apple iPhone 13 Pro | `apple_iphone_13_pro` | ativo | sim | sim |
| 2021 | Apple iPhone 13 Pro Max | `apple_iphone_13_pro_max` | ativo | sim | sim |
| 2022 | Apple iPhone 14 | `apple_iphone_14` | ativo | sim | sim |
| 2022 | Apple iPhone 14 Plus | `apple_iphone_14_plus` | ativo | sim | sim |
| 2022 | Apple iPhone 14 Pro | `apple_iphone_14_pro` | ativo | sim | sim |
| 2022 | Apple iPhone 14 Pro Max | `apple_iphone_14_pro_max` | ativo | sim | sim |
| 2022 | Apple iPhone SE 2022 | `apple_iphone_se_2022` | legado | sim | sim |
| 2023 | Apple iPhone 15 | `apple_iphone_15` | ativo | sim | sim |
| 2023 | Apple iPhone 15 Plus | `apple_iphone_15_plus` | ativo | sim | sim |
| 2023 | Apple iPhone 15 Pro | `apple_iphone_15_pro` | ativo | sim | sim |
| 2023 | Apple iPhone 15 Pro Max | `apple_iphone_15_pro_max` | ativo | sim | sim |
| 2024 | Apple iPhone 16 | `apple_iphone_16` | novo | sim | sim |
| 2024 | Apple iPhone 16 Plus | `apple_iphone_16_plus` | novo | sim | sim |
| 2024 | Apple iPhone 16 Pro | `apple_iphone_16_pro` | novo | sim | sim |
| 2024 | Apple iPhone 16 Pro Max | `apple_iphone_16_pro_max` | novo | sim | sim |
| 2025 | Apple iPhone 16e | `apple_iphone_16e` | novo | sim | sim |
| 2025 | Apple iPhone 17 | `apple_iphone_17` | novo | sim | sim |
| 2025 | Apple iPhone 17 Air | `apple_iphone_17_air` | mesclado → `apple_iphone_air` | não (mesclado) | sim |
| 2025 | Apple iPhone 17 Pro | `apple_iphone_17_pro` | novo | sim | sim |
| 2025 | Apple iPhone 17 Pro Max | `apple_iphone_17_pro_max` | novo | sim | sim |
| 2025 | Apple iPhone Air | `apple_iphone_air` | ativo | sim | sim |
| 2026 | Apple iPhone 17e | `apple_iphone_17e` | novo | sim | sim |
| 2026 | Apple iPhone 18 Pro | `apple_iphone_18_pro` | ativo | sim | sim |
| 2026 | Apple iPhone 18 Pro Max | `apple_iphone_18_pro_max` | ativo | sim | sim |
| 2026 | Apple iPhone Duo | `apple_iphone_duo` | ativo | sim | sim |

iPhones reais pesquisáveis: 46 (sem ano: 0). Anteriores ao 6, SE 1ª geração ou "iPhone 8 SE": 0.
