# Relatório Comparativo: Películas 3D x Modelos de Capinhas 001

Data da análise: 2026-07-09

## Resumo executivo

Foram comparadas duas bases: a planilha de modelos unitários para capinhas e a base HTML de grupos de películas 3D compatíveis. A planilha tem **401 linhas/modelos únicos**. A base de películas tem **266 linhas/grupos**, com **598 menções de modelos** e **335 modelos únicos normalizados**.

O cruzamento encontrou **79 modelos da planilha de capinhas sem correspondência clara na base de películas** e **13 modelos citados na base de películas sem correspondência clara na planilha de capinhas**. Também foram encontrados **226 modelos com aliases curtos potencialmente ambíguos**, **120 modelos repetidos em mais de um grupo de película** e **74 grupos de película que exigem revisão humana por mistura de marcas, uso cruzado ou reaproveitamento amplo**.

Ponto mais sensível: película compatível não é evidência de capinha compatível. A película depende de tela, borda, sensor e câmera frontal; a capinha depende de aro, câmera traseira, botões, furação, espessura e posição de conectores. Portanto, os resultados abaixo devem alimentar cadastro de **modelo/alias** e uma fila de **teste seco**, não venda automática como compatível.

## Arquivos analisados

- docs/imports/catalogo/modelos_celulares_para_capinhas.xlsx
- docs/imports/catalogo/peliculas_3d_compativeis.html

Hashes SHA-256 registrados no pré-flight pós-cópia:

- peliculas_3d_compativeis.html: AE6ED33DA5E759C93735ED4596F9592E5E1396DE1926D36C221767A45F059A1A
- modelos_celulares_para_capinhas.xlsx: 7C66F906181DEED1511E73E8F46D62B19BBCFC12FBD866EBF039FE0953BA3C8B

## Metodologia de normalização

Regras aplicadas para comparação:

- remoção de acentos, pontuação e espaços duplicados;
- caixa alta;
- normalização de hífen e separadores;
- remoção de prefixos comerciais para chave de comparação quando a marca já estava conhecida, por exemplo Samsung Galaxy A05 -> Samsung:A05;
- normalização de Moto G35, Motorola G35 e G35 quando o contexto de marca era Motorola;
- normalização de Apple iPhone 13 Pro Max, iPhone 13 Pro Max e aliases IP 13 Pro Max;
- tratamento de Redmi e POCO como linhas comerciais dentro de Xiaomi/Redmi/POCO, sem apagar a marca comercial do nome exibido;
- identificação de aliases ambíguos como A15, G35, NOTE 13, C75 e K51S quando isolados;
- identificação de variantes 4G/5G como modelos diferentes quando a base não dava equivalência clara.

## Totais por base

### Planilha de capinhas

| Marca | Modelos |
| --- | ---: |
| Samsung | 124 |
| Motorola | 98 |
| Xiaomi/Redmi/POCO | 96 |
| Apple | 41 |
| Realme | 27 |
| LG | 11 |
| Infinix | 2 |
| Tecno | 2 |

### Base de películas

| Marca normalizada | Menções de modelos | Modelos únicos |
| --- | ---: | ---: |
| Motorola | 211 | 84 |
| Samsung | 161 | 101 |
| Xiaomi/Redmi/POCO | 119 | 85 |
| Apple | 57 | 35 |
| Realme | 31 | 19 |
| LG | 18 | 10 |
| Infinix | 1 | 1 |

## A) Modelos de capinhas que não aparecem claramente na base de películas

Total: **79**.

| Marca | Faltantes |
| --- | ---: |
| Samsung | 23 |
| Xiaomi/Redmi/POCO | 23 |
| Motorola | 15 |
| Realme | 8 |
| Apple | 6 |
| Tecno | 2 |
| LG | 1 |
| Infinix | 1 |

### Apple (6)
- iPhone 12 Mini
- iPhone 13 Mini
- iPhone 17e
- iPhone Air
- iPhone SE 2020
- iPhone SE 2022

### Samsung (23)
- Galaxy A21
- Galaxy A22 5G
- Galaxy A23 5G
- Galaxy A32 5G
- Galaxy A42
- Galaxy A50S
- Galaxy A80
- Galaxy A81
- Galaxy F54
- Galaxy J5 Prime
- Galaxy J7 Prime
- Galaxy M02S
- Galaxy M11
- Galaxy M13
- Galaxy M14
- Galaxy M15
- Galaxy M22
- Galaxy M56
- Galaxy Note 9
- Galaxy Note 10 Lite
- Galaxy S22 Ultra
- Galaxy S23 Ultra
- Galaxy S24 Ultra

### Motorola (15)
- Motorola Edge 20
- Motorola Edge 20 Pro
- Motorola Edge S
- Moto E6 Play
- Moto E7 Play
- Moto E15
- Moto E32S
- Moto G8 Power
- Moto G10 Play
- Moto G25
- Moto G60S
- Moto G86 Power
- Moto G Power
- Motorola One Fusion Plus
- Motorola One Hyper

### Xiaomi/Redmi/POCO (23)
- Redmi 8
- Redmi 8A
- Redmi 9I
- Redmi 9I Sport
- Redmi 9T
- Redmi 10 Power
- Redmi 13 4G
- Redmi 14R
- Redmi A4
- Redmi Note 9 4G
- Redmi Note 9 5G
- Redmi Note 9 Pro Max
- Redmi Note 11T 5G
- Redmi Note 12
- Redmi Note 12 Pro 5G
- Redmi Note 14 Pro
- Redmi Note 14 Pro Plus
- POCO C40
- POCO C71
- POCO M4 Pro 5G
- POCO X3 GT
- POCO X3 NFC
- POCO X7

### Realme (8)
- Realme C30
- Realme C30S
- Realme C33
- Realme C73
- Realme C75 5G
- Realme C75x
- Realme C85 Pro
- Realme Note 60x

### LG (1)
- LG K50S

### Infinix (1)
- Infinix Hot Play

### Tecno (2)
- Tecno Spark 20
- Tecno Spark 20C

## B) Modelos da base de películas que não aparecem claramente na planilha de capinhas

Total: **13**.

### Xiaomi/Redmi/POCO (12)
- Redmi 9A Sport - grupo #1: Super grupo A02 / A03 / A12 / A13 / A23 / A70
- X3 - grupo #166: X3 / X3 Pro
- X3 Pro - grupo #166: X3 / X3 Pro
- X4 - grupo #167: X4 / X4 Pro
- X4 Pro - grupo #167: X4 / X4 Pro
- M4 - grupo #168: M4 / M4 Pro
- M4 Pro - grupo #168: M4 / M4 Pro
- Mi 13T - grupo #169: Mi 13T / 13T Pro
- Mi 13T Pro - grupo #169: Mi 13T / 13T Pro
- X5 - grupo #170: X5 / Note 12 5G
- Redmi 12 4G - grupo #175: Redmi 12 4G / 5G
- Redmi 12 5G - grupo #175: Redmi 12 4G / 5G

### Motorola (1)
- Moto G40 - grupo #96: G40 / G60

## C) Alias fraco, nome divergente ou nomenclatura a revisar

Os casos abaixo aparecem em ambas as bases ou em grupos próximos, mas com nome curto, sem marca ou com divergência de nomenclatura. Eles podem melhorar busca, mas não devem criar compatibilidade física automática.

| Marca | Modelo na planilha | Como aparece em películas | Grupos de película |
| --- | --- | --- | --- |
| Apple | iPhone 7 | iPhone 7 Branco, iPhone 7, iPhone 7 Preto | #231 iPhone 7/8 Branco<br>#232 iPhone 7/8 Preto |
| Apple | iPhone 7 Plus | iPhone 7 Plus, iPhone 7 Plus Preto, iPhone 7 Plus Branco | #221 7 / 8 Plus P/B |
| Apple | iPhone 8 | iPhone 8 Branco, iPhone 8, iPhone 8 Preto | #231 iPhone 7/8 Branco<br>#232 iPhone 7/8 Preto |
| Apple | iPhone 8 Plus | iPhone 8 Plus, iPhone 8 Plus Preto, iPhone 8 Plus Branco | #221 7 / 8 Plus P/B |
| Samsung | Galaxy A01 | A01 | #41 A01 |
| Samsung | Galaxy A01 Core | A01 Core | #42 A01 Core |
| Samsung | Galaxy A02 | Samsung A02, A02 | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#22 A02 / A02S |
| Samsung | Galaxy A02S | A02S | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#22 A02 / A02S |
| Samsung | Galaxy A03 | A03 | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#23 A03 / A03S |
| Samsung | Galaxy A03 Core | A03 Core | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#24 A03 Core |
| Samsung | Galaxy A03S | A03S | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#23 A03 / A03S |
| Samsung | Galaxy A04 | Samsung A04, A04 | #2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#25 A04 / A04S<br>#26 A04 / A04S / A04 Core |
| Samsung | Galaxy A04 Core | A04 Core | #2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#26 A04 / A04S / A04 Core |
| Samsung | Galaxy A04E | A04E | #2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#27 A04E |
| Samsung | Galaxy A04S | A04S | #2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#25 A04 / A04S<br>#26 A04 / A04S / A04 Core |
| Samsung | Galaxy A05 | Samsung A05, A05 | #3 Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51<br>#15 A05 / Redmi 13C<br>#28 A05 / A05S |
| Samsung | Galaxy A05S | A05S | #3 Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51<br>#28 A05 / A05S |
| Samsung | Galaxy A06 | A06 | #3 Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51<br>#11 A06 / A07<br>#87 A06 |
| Samsung | Galaxy A07 | A07 | #11 A06 / A07<br>#86 A07 |
| Samsung | Galaxy A10 | A10 | #19 A10 / A10S |
| Samsung | Galaxy A10S | A10S | #19 A10 / A10S |
| Samsung | Galaxy A11 | A11 | #43 A11 |
| Samsung | Galaxy A12 | A12 | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#29 A12 / M12 |
| Samsung | Galaxy A13 | A13 | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#2 Super grupo A04 / A04S / A04E / A13 / M12 / G30<br>#30 A13 4G / 5G<br>#31 A13 / A23 4G |
| Samsung | Galaxy A13 4G | A13 4G | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#30 A13 4G / 5G |
| Samsung | Galaxy A13 5G | A13 5G | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70<br>#30 A13 4G / 5G |
| Samsung | Galaxy A14 | A14 | #32 A14 |
| Samsung | Galaxy A15 | A15 | #33 A15 |
| Samsung | Galaxy A16 | Samsung A16, A16 | #4 A16 / A17 / A26 / M16 / F16<br>#12 A17 / A16<br>#89 A16 |
| Samsung | Galaxy A17 | A17 | #4 A16 / A17 / A26 / M16 / F16<br>#12 A17 / A16<br>#88 A17 |
| Samsung | Galaxy A20 | Samsung A20, A20 | #5 Super grupo A20 / A30 / A50 / A30S / M31 / Redmi Note 7-8 / Moto G8<br>#20 A20 / A30 / A50 / A30S |
| Samsung | Galaxy A20S | A20S | #44 A20S |
| Samsung | Galaxy A21S | A21S | #45 A21S |
| Samsung | Galaxy A22 4G | A22 4G | #46 A22 4G |
| Samsung | Galaxy A23 | A23 | #1 Super grupo A02 / A03 / A12 / A13 / A23 / A70 |

Aliases curtos ambíguos mais visíveis:

| Marca | Modelo | Alias ambíguo |
| --- | --- | --- |
| Samsung | Galaxy A01 | A01 |
| Samsung | Galaxy A02 | A02 |
| Samsung | Galaxy A02S | A02S |
| Samsung | Galaxy A03 | A03 |
| Samsung | Galaxy A03S | A03S |
| Samsung | Galaxy A04 | A04 |
| Samsung | Galaxy A04E | A04E |
| Samsung | Galaxy A04S | A04S |
| Samsung | Galaxy A05 | A05 |
| Samsung | Galaxy A05S | A05S |
| Samsung | Galaxy A06 | A06 |
| Samsung | Galaxy A07 | A07 |
| Samsung | Galaxy A10 | A10 |
| Samsung | Galaxy A10S | A10S |
| Samsung | Galaxy A11 | A11 |
| Samsung | Galaxy A12 | A12 |
| Samsung | Galaxy A13 | A13 |
| Samsung | Galaxy A13 4G | A13 4G |
| Samsung | Galaxy A13 5G | A13 5G |
| Samsung | Galaxy A14 | A14 |
| Samsung | Galaxy A15 | A15 |
| Samsung | Galaxy A16 | A16 |
| Samsung | Galaxy A17 | A17 |
| Samsung | Galaxy A20 | A20 |
| Samsung | Galaxy A20S | A20S |
| Samsung | Galaxy A21 | A21 |
| Samsung | Galaxy A21S | A21S |
| Samsung | Galaxy A22 4G | A22 4G |
| Samsung | Galaxy A22 5G | A22 5G |
| Samsung | Galaxy A23 | A23 |
| Samsung | Galaxy A23 4G | A23 4G |
| Samsung | Galaxy A23 5G | A23 5G |
| Samsung | Galaxy A24 | A24 |
| Samsung | Galaxy A25 | A25 |
| Samsung | Galaxy A26 | A26 |
| Samsung | Galaxy A30 | A30 |
| Samsung | Galaxy A30S | A30S |
| Samsung | Galaxy A31 | A31 |
| Samsung | Galaxy A32 4G | A32 4G |
| Samsung | Galaxy A32 5G | A32 5G |

Observações importantes:

- iPhone Air existe na página atual da Apple; a base de películas também contém iPhone 17 Air. Tratar como nomenclatura divergente e validar com fornecedor antes de cadastrar ambos como modelos distintos.
- A05, A15, A16, A17 e semelhantes devem ser aliases de busca sob marca Samsung, não modelos globais soltos.
- G35, G56 e G75 devem ser aliases de Motorola/Moto, não atalhos globais.
- NOTE 14, 13C, 14C e 15C precisam preservar linha comercial Redmi/POCO quando aplicável.
- C75, C85 e Note 70 precisam preservar marca Realme.

## D) Duplicidades e ambiguidades

Na planilha de capinhas não foram encontradas duplicidades exatas pela chave normalizada. Na base de películas, **120 modelos normalizados aparecem em mais de um grupo/linha**, o que é esperado em parte por causa dos super grupos, mas exige decisão de prioridade para importação.

| Modelo normalizado | Qtd. grupos | Exemplos |
| --- | ---: | --- |
| Samsung:A13 | 4 | #1 A13 (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 A13 (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#30 A13 (A13 4G / 5G)<br>#31 A13 (A13 / A23 4G) |
| Xiaomi/Redmi/POCO:REDMI A3 | 4 | #3 Redmi A3 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#10 Redmi A3 (Super grupo Redmi 10C / 12C / A3 / 11A)<br>#159 Redmi A3 (Redmi 10C / Redmi 12C / Redmi A3)<br>#182 Redmi A3 (Redmi A3) |
| Samsung:A03S | 3 | #1 A03S (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 A03S (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#23 A03S (A03 / A03S) |
| Samsung:M12 | 3 | #1 M12 (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 M12 (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#29 M12 (A12 / M12) |
| Motorola:G30 | 3 | #1 Moto G30 (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 Moto G30 (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#90 Moto G30 (G10 / G20 / G30)<br>#90 G30 (G10 / G20 / G30) |
| Motorola:E20 | 3 | #1 Moto E20 (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 Moto E20 (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#130 Moto E20 (E20)<br>#130 E20 (E20) |
| Motorola:E7 PLUS | 3 | #1 Moto E7 Plus (Super grupo A02 / A03 / A12 / A13 / A23 / A70)<br>#2 Moto E7 Plus (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#152 Moto E7 Plus (E7 Plus)<br>#152 E7 Plus (E7 Plus) |
| Samsung:A04 | 3 | #2 Samsung A04 (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#25 A04 (A04 / A04S)<br>#26 A04 (A04 / A04S / A04 Core) |
| Samsung:A04S | 3 | #2 A04S (Super grupo A04 / A04S / A04E / A13 / M12 / G30)<br>#25 A04S (A04 / A04S)<br>#26 A04S (A04 / A04S / A04 Core) |
| Samsung:A05 | 3 | #3 Samsung A05 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#15 A05 (A05 / Redmi 13C)<br>#28 A05 (A05 / A05S) |
| Samsung:A06 | 3 | #3 A06 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#11 A06 (A06 / A07)<br>#87 A06 (A06) |
| Xiaomi/Redmi/POCO:REDMI 13C | 3 | #3 Redmi 13C (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#15 Redmi 13C (A05 / Redmi 13C)<br>#184 Redmi 13C (Redmi 13C) |
| Xiaomi/Redmi/POCO:REDMI 15C | 3 | #3 Redmi 15C (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#162 Redmi 15C (Redmi 15C / Poco C65)<br>#186 Redmi 15C (Redmi 15C) |
| Xiaomi/Redmi/POCO:POCO C65 | 3 | #3 Poco C65 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#162 Poco C65 (Redmi 15C / Poco C65)<br>#208 Poco C65 (Poco C65) |
| Realme:C53 | 3 | #3 Realme C53 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#250 Realme C53 (Realme C53 / C63)<br>#265 Realme C53 (Realme Note 50 / C51 / C53) |
| Realme:NOTE 50 | 3 | #3 Realme Note 50 (Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51)<br>#255 Realme Note 50 (Realme Note 50)<br>#265 Realme Note 50 (Realme Note 50 / C51 / C53) |
| Samsung:A16 | 3 | #4 Samsung A16 (A16 / A17 / A26 / M16 / F16)<br>#12 A16 (A17 / A16)<br>#89 A16 (A16) |
| Samsung:A17 | 3 | #4 A17 (A16 / A17 / A26 / M16 / F16)<br>#12 A17 (A17 / A16)<br>#88 A17 (A17) |
| Samsung:A52 | 3 | #6 A52 (Super grupo A51 / A52 / A52S / A53 / S20 FE / Note 10-11)<br>#21 A52 (A51 / A52 / A53 / S20 FE)<br>#50 A52 (A52) |
| Samsung:A53 | 3 | #6 A53 (Super grupo A51 / A52 / A52S / A53 / S20 FE / Note 10-11)<br>#21 A53 (A51 / A52 / A53 / S20 FE)<br>#51 A53 (A53) |

## E) Grupos multi-marca ou de revisão humana

Foram encontrados **74 grupos** com mistura de marcas, marca composta, super grupo ou reaproveitamento amplo. Eles são úteis para balcão, mas perigosos para capinha.

| Grupo | Nome | Marcas detectadas | Prioridade |
| --- | --- | --- | --- |
| #1 | Super grupo A02 / A03 / A12 / A13 / A23 / A70 | Samsung, Motorola, LG, Realme, Infinix, Xiaomi/Redmi/POCO | Muito alta |
| #2 | Super grupo A04 / A04S / A04E / A13 / M12 / G30 | Samsung, Motorola, Xiaomi/Redmi/POCO | Alta |
| #3 | Super grupo A05 / A05S / A06 / Redmi 13C / POCO C65 / Realme C51 | Samsung, Xiaomi/Redmi/POCO, Realme | Muito alta |
| #5 | Super grupo A20 / A30 / A50 / A30S / M31 / Redmi Note 7-8 / Moto G8 | Samsung, Motorola, Xiaomi/Redmi/POCO, LG | Média |
| #6 | Super grupo A51 / A52 / A52S / A53 / S20 FE / Note 10-11 | Samsung, Xiaomi/Redmi/POCO | Alta |
| #7 | Super grupo A71 / M51 / A72 / M62 / Note 9S / Note 11 Pro | Samsung, Xiaomi/Redmi/POCO | Média |
| #8 | Super grupo Moto G05 / G15 / G35 / G75 + Realme C75 | Motorola, Realme | Muito alta |
| #9 | Super grupo Redmi 14C / Redmi A5 / POCO C75 | Xiaomi/Redmi/POCO | Muito alta |
| #10 | Super grupo Redmi 10C / 12C / A3 / 11A | Xiaomi/Redmi/POCO | Alta |
| #15 | A05 / Redmi 13C | Samsung, Xiaomi/Redmi/POCO | Alta |
| #157 | Redmi 9A / 9C | Xiaomi/Redmi/POCO | Média |
| #158 | 9A / 9C / 10A | Xiaomi/Redmi/POCO | Média |
| #159 | Redmi 10C / Redmi 12C / Redmi A3 | Xiaomi/Redmi/POCO | Alta |
| #160 | Redmi 12 / Redmi 13 | Xiaomi/Redmi/POCO | Alta |
| #161 | Redmi 14C / Redmi A5 / Poco C75 | Xiaomi/Redmi/POCO | Muito alta |
| #162 | Redmi 15C / Poco C65 | Xiaomi/Redmi/POCO | Muito alta |
| #163 | Redmi Note 11 4G / Note 12S | Xiaomi/Redmi/POCO | Alta |
| #164 | Poco X3 / X3 Pro | Xiaomi/Redmi/POCO | Média |
| #165 | Poco X6 / X6 Pro | Xiaomi/Redmi/POCO | Alta |
| #166 | X3 / X3 Pro | Xiaomi/Redmi/POCO | Média |
| #167 | X4 / X4 Pro | Xiaomi/Redmi/POCO | Média |
| #168 | M4 / M4 Pro | Xiaomi/Redmi/POCO | Média |
| #169 | Mi 13T / 13T Pro | Xiaomi/Redmi/POCO | Alta |
| #170 | X5 / Note 12 5G | Xiaomi/Redmi/POCO | Média |
| #171 | Note 13 / Note 13 Pro | Xiaomi/Redmi/POCO | Alta |
| #172 | Note 10 4G / M5S | Xiaomi/Redmi/POCO | Média |
| #173 | M3 / M3 Pro | Xiaomi/Redmi/POCO | Média |
| #174 | Redmi 11A / 12C | Xiaomi/Redmi/POCO | Média |
| #175 | Redmi 12 4G / 5G | Xiaomi/Redmi/POCO | Alta |
| #176 | Redmi 9 | Xiaomi/Redmi/POCO | Baixa |
| #177 | Redmi 10 | Xiaomi/Redmi/POCO | Média |
| #178 | Redmi 10A | Xiaomi/Redmi/POCO | Média |
| #179 | Redmi 13 | Xiaomi/Redmi/POCO | Alta |
| #180 | Redmi 15 | Xiaomi/Redmi/POCO | Nova |
| #181 | Redmi A2 Plus | Xiaomi/Redmi/POCO | Média |
| #182 | Redmi A3 | Xiaomi/Redmi/POCO | Alta |
| #183 | Redmi A5 | Xiaomi/Redmi/POCO | Muito alta |
| #184 | Redmi 13C | Xiaomi/Redmi/POCO | Muito alta |
| #185 | Redmi 14C | Xiaomi/Redmi/POCO | Muito alta |
| #186 | Redmi 15C | Xiaomi/Redmi/POCO | Muito alta |

## Pesquisa externa de existência de modelos

A pesquisa externa confirma existência comercial de aparelhos, não compatibilidade de película nem capinha.

| Marca | Modelos recentes pesquisados | Fonte/resultado | Classificação operacional |
| --- | --- | --- | --- |
| Apple | iPhone 17 Pro, iPhone Air, iPhone 17, iPhone 17e, iPhone 16 | Página oficial da Apple lista a linha atual com iPhone 17 Pro, iPhone Air, iPhone 17, iPhone 17e e iPhone 16. | Pode cadastrar modelo/alias; compatibilidade precisa fonte/teste. |
| Apple | iPhone 17 Air | Não apareceu como nome oficial na página atual da Apple; a nomenclatura oficial visível é iPhone Air. | Não cadastrar como compatível confirmado; tratar como alias ruim/legado de fornecedor. |
| Samsung | Galaxy A17 5G, A26 5G, A36 5G, A37 5G, A56 5G, A57 5G, S24 FE, S25 FE | Páginas oficiais Samsung US/UK confirmam esses aparelhos ou suas páginas de produto. | Pode cadastrar modelos; compatibilidade por película/capinha exige fonte/teste. |
| Motorola | Moto G75 5G, Moto G35 5G, Moto G56, linha Moto G 2026 | Pesquisa encontrou cobertura de mercado e guias recentes; fonte oficial Motorola não ficou estável na busca desta sessão. | Provável mercado; exigir fornecedor/teste antes de compatibilidade. |
| Xiaomi/Redmi/POCO | Redmi A5, Redmi 15C, POCO C75, POCO C71, POCO X7 | Páginas oficiais Xiaomi Global confirmam modelos recentes. | Pode cadastrar modelos/aliases; compatibilidade precisa teste. |
| Xiaomi/Redmi/POCO | Redmi 14C, Redmi 14R, Redmi A4 | Encontrados em bases abertas/notícias, mas sem página oficial estável capturada nesta sessão para todos. | Provável mercado; testar e confirmar fornecedor. |
| Realme | Realme C75, C71, C85, Note 70 | Páginas oficiais realme Global confirmam modelos e linha. | Pode cadastrar modelos/aliases; compatibilidade precisa teste. |
| Tecno | Spark 40 | Página oficial TECNO confirma Spark 40 e variantes. | Pode cadastrar modelo; não inferir compatibilidade com Spark 20/20C. |
| Infinix | Smart 7, Smart 10, Hot Play | Pesquisa encontrou referência aberta, mas fonte oficial não ficou estável nesta sessão. | Provável/legado; cadastrar só com fonte melhor ou demanda real. |
| LG | K9, K10, K11, K12, K41S, K51S | Linha legada; foco deve ser manutenção/assistência, não compra agressiva. | Baixa prioridade; manter aliases claros. |

Fontes principais consultadas:

- Apple: https://www.apple.com/iphone/
- Samsung A17: https://www.samsung.com/us/smartphones/galaxy-a17-5g/
- Samsung A26: https://www.samsung.com/us/smartphones/galaxy-a26-5g/
- Samsung A36: https://www.samsung.com/us/smartphones/galaxy-a36-5g/
- Samsung A37: https://www.samsung.com/us/smartphones/galaxy-a37-5g/
- Samsung A56: https://www.samsung.com/us/smartphones/galaxy-a56-5g/
- Samsung A57: https://www.samsung.com/us/smartphones/galaxy-a57-5g/
- Samsung S24 FE: https://www.samsung.com/us/smartphones/galaxy-s24-fe/
- Samsung S25 FE: https://www.samsung.com/us/smartphones/galaxy-s25-fe/
- Xiaomi Redmi A5: https://www.mi.com/global/product/redmi-a5/
- Xiaomi Redmi 15C: https://www.mi.com/global/product/redmi-15c/
- Xiaomi POCO C75: https://www.mi.com/global/product/poco-c75/
- Xiaomi POCO C71: https://www.mi.com/global/product/poco-c71/
- Xiaomi POCO X7: https://www.mi.com/global/product/poco-x7/
- realme C75: https://www.realme.com/global/realme-c75
- realme C71: https://www.realme.com/global/realme-c71
- realme C85: https://www.realme.com/global/realme-c85
- realme Note 70: https://www.realme.com/global/realme-note-70
- TECNO Spark 40: https://www.tecno-mobile.com/phones/product-detail/product/spark-40/
- Motorola G75, referência de mercado: https://cincodias.elpais.com/smartlife/smartphones/2024-10-01/moto-g75-5g-nuevo-caracteristicas-precio.html
- Motorola linha recente, referência de mercado: https://www.techradar.com/news/best-moto-phones

## Lista 1 - Pode cadastrar como modelo/alias com segurança

Critério: o aparelho existe ou já está presente de forma clara nas bases; o cadastro sugerido é de **modelo e aliases de busca**, não de compatibilidade física.

- Apple: iPhone 16e, iPhone 17, iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air, iPhone 17e.
- Samsung: Galaxy A17, A26, A36, A37, A56, A57, S24 FE, S25 FE, A06, A07.
- Xiaomi/Redmi/POCO: Redmi A5, Redmi 15C, POCO C75, POCO C71, POCO X7.
- Realme: Realme C71, C75, C85, Note 70, C75x, Note 60x quando o fornecedor/local confirmar demanda.
- Tecno: Tecno Spark 40.
- Aliases seguros como busca, sempre com marca: Samsung A05, Galaxy A05, Moto G35, Motorola G35, Redmi Note 14 Pro, POCO C75, Realme C75.

## Lista 2 - Pode entrar como compatibilidade provável

Critério: aparece em fornecedor/mercado ou em super grupo de película, mas precisa teste seco/fonte antes de vender como compatível.

- Samsung A16/A17/A26/M16/F16 em grupo ampliado.
- Samsung A36/A56/S24 FE/S25 FE em grupo de fornecedor.
- Samsung A05/A05S/A06 com Redmi 13C/POCO C65/Realme C51 nos super grupos de película.
- Moto G05/G15/G35/G75 com Realme C75, Realme C55/C65/C67/C63 5G.
- Redmi 14C/Redmi A5/POCO C75.
- Redmi 10C/12C/A3/11A.
- Realme Note 50/C51/C53 e Realme C61/C63/C65/C67/C75.
- iPhone 17/17 Pro/16 Pro e iPhone 17 Pro Max/16 Pro Max conforme fornecedor, sempre com teste seco.

## Lista 3 - Não cadastrar como compatível ainda

Critério: compatibilidade física incerta, nome divergente ou ausência na outra base.

- Todos os **79 modelos faltantes da planilha de capinhas** listados na seção A, até que fornecedor/teste confirme película/capinha.
- iPhone 17 Air como nome oficial separado de iPhone Air; tratar como alias ruim até revisão.
- Samsung S22 Ultra, S23 Ultra, S24 Ultra: aparecem na planilha de capinhas, mas não têm correspondência clara na base de películas analisada.
- Motorola Edge 20/20 Pro/Edge S/One Hyper/One Fusion Plus: não inferir por grupos Moto G/E.
- Realme C75 5G, C75x, C85 Pro e Note 60x: exigem confirmação separada do modelo base.
- Tecno Spark 20 e Spark 20C: não inferir a partir de Spark 40.
- Xiaomi/POCO com sufixos GT, NFC, 5G ou Pro Plus quando a base só cita versão comum.

## Riscos e guardrails obrigatórios

- Película compatível não é igual a capinha compatível.
- Capinha exige encaixe, câmera traseira, aro, botões, furação, espessura e conectores.
- Película exige tela, borda, sensor, câmera frontal e alto-falante.
- Tela, bateria e conector exigem regra ainda mais rígida que película/capinha.
- IA pode sugerir relacionamento, mas humano confirma.
- Fornecedor pode errar ou misturar grupos por molde aproximado.
- Nunca vender como compatível confirmado sem teste seco ou fonte confiável.
- Aliases ajudam busca, mas não podem criar compatibilidade automática.
- Modelos 4G/5G, Pro, Plus, Max, Ultra, NFC e GT devem ser tratados como variantes diferentes quando não houver fonte explícita.

## Recomendação para importar no OmniGestão

- Importar a planilha como catálogo de modelos unitários de aparelho, com marca, linha/família, nome comercial e aliases.
- Criar relação separada para compatibilidade de produto/acessório, com campos como tipo_acessorio, fonte, confianca, status_validacao e observacao_teste.
- Não transformar super grupo de película em compatibilidade de capinha.
- Guardar aliases curtos apenas vinculados à marca/modelo canônico.
- Exibir no PDV um aviso de precisa testar para grupos cruzados e modelos novos.
- Criar fila operacional para compra/teste: primeiro Samsung A/A5x/A3x novos, iPhone Air/17e, Redmi/POCO entrada, Moto G atual e Realme C atual.

## Próximo GOAL recomendado

Criar um GOAL específico para transformar este relatório em uma proposta de importação controlada:

1. definir schema operacional de aliases e compatibilidades sem mexer em Prisma ainda;
2. produzir CSV de importação de modelos canônicos;
3. produzir CSV separado de aliases;
4. produzir CSV separado de compatibilidade por acessório com status confirmado_fornecedor, provavel_mercado, precisa_testar e nao_recomendado;
5. validar 20 casos de balcão antes de qualquer alteração no sistema.
