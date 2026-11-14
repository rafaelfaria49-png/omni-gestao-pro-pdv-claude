# Auditoria do catálogo de aparelhos — Brasil 2023–2026 (COMPAT-CATALOGO-BRASIL-2023-2026-002)

Data de corte: **14/11/2026**. Seeds: `docs/catalogo/seeds/device_*_seed_001.csv`.
Script reprodutível: `scripts/catalogo/atualizar-catalogo-brasil-2023-2026.mjs` (relatório bruto em
`docs/ai-execution/_evidence/COMPAT-CATALOGO-BRASIL-2023-2026-002/relatorio-gerador.json`).

## Resumo

| | Antes | Depois |
|---|---|---|
| Registros de modelo (linhas) | 429 | 693 |
| Modelos operacionais (aparecem na busca) | 429 | 684 |
| Linhas mescladas (mantidas por histórico, fora da busca) | 0 | 9 |
| Aliases | 1.751 | 2.640 |
| Relações de compatibilidade | 1.443 | 1.447 (+4 de acessório específico) |

Nenhuma linha foi apagada; nenhuma `modelKey` existente mudou. Contagem de **linhas ≠ aparelhos físicos**:
as 9 linhas mescladas apontam para o aparelho real (`replaced_by`).

### Contagem final por fabricante (linhas / operacionais)

| Fabricante | Marcas | Linhas | Operacionais | Novos |
|---|---|---|---|---|
| Apple | Apple | 55 | 46 | 6 |
| Samsung | Samsung | 167 | 167 | 43 |
| Motorola | Motorola | 138 | 138 | 35 |
| Xiaomi | Xiaomi · Redmi · POCO | 19 · 84 · 51 | 19 · 84 · 51 | 14 · 19 · 19 |
| realme | Realme | 53 | 53 | 25 |
| Infinix | Infinix | 41 | 41 | 32 |
| Secundárias (ocultas por padrão) | Google, Nothing, CMF, OnePlus, OPPO, HONOR, TECNO, vivo, Nokia, HMD, ASUS, Huawei, Sony, TCL, LG | 85 | 85 | 71 |

**Matriz final gerada dos seeds** (marca × ano, iPhones desde o 6 e as 9 linhas fora da busca):
`docs/ai-execution/_evidence/COMPAT-CATALOGO-BRASIL-2023-2026-002/MATRIZ_FINAL_COBERTURA.md`. O ano das linhas que já
existiam foi preenchido por `scripts/catalogo/preencher-ano-existentes.mjs` (139 linhas; só `release_year`/`sources`;
idempotente); lançamentos de data ambígua ficaram sem ano de propósito.

## Matriz de auditoria — marcas prioritárias (pesquisa)

"Existentes" = lançamentos do ano que **já estavam** no catálogo (por nome). "Adicionados" = linhas novas.
"Pendentes" = nomes citados mas **sem confirmação oficial suficiente** até 14/11/2026 (não cadastrados).

| Ano | Marca | Oficiais encontrados | Existentes | Adicionados | Pendentes |
|---|---|---|---|---|---|
| 2023 | Apple | 4 (15/15 Plus/15 Pro/15 Pro Max) | 4 | 0 | — |
| 2024 | Apple | 4 (16/16 Plus/16 Pro/16 Pro Max) | 4 | 0 | — |
| 2025 | Apple | 5 (16e/17/Air/17 Pro/17 Pro Max) | 5 | 0 | — |
| 2026 | Apple | 4 (17e/18 Pro/18 Pro Max/Duo) | 1 | 3 | iPhone 18 base não existe na página oficial |
| 2023 | Samsung | 24 | 18 | 6 | — |
| 2024 | Samsung | 17 | 9 | 8 | Z Fold Special Edition (só Coreia) |
| 2025 | Samsung | 29 | 12 | 17 | Galaxy F07 5G / F57 5G (sem ano na fonte) |
| 2026 | Samsung | 13 | 5 | 8 | Z Fold8 Ultra (citação sem confirmação); **Galaxy S27: não anunciada** |
| 2023 | Motorola | 14 | 10 | 4 | — |
| 2024 | Motorola | 17 | 9 | 8 | Edge (2024), G Stylus/Power (EUA) |
| 2025 | Motorola | 22 | 11 | 11 | Razr 60 Plus (sem confirmação BR) |
| 2026 | Motorola | 15 | 3 | 12 | Edge 70 Pro+ / Edge 70 Max / Razr 70 Plus; nenhum Moto E 2026 encontrado |
| 2023 | Xiaomi | 7 | 2 | 5 | — |
| 2024 | Xiaomi | 4 | 0 | 4 | Xiaomi 14 Civi (Índia) |
| 2025 | Xiaomi | 5 | 0 | 5 | 15 Pro / 17 Pro / 17 Pro Max (China) |
| 2026 | Xiaomi | 0 | 0 | 0 | Xiaomi 17T / 17T Pro (sem anúncio encontrado) |
| 2023 | Redmi | 13 | 10 | 3 | Note 12 Turbo (China; virou POCO F5) |
| 2024 | Redmi | 15 | 10 | 5 | K80 (China) |
| 2025 | Redmi | 8 | 3 | 5 | 15C 5G |
| 2026 | Redmi | 7 | 1 | 6 | Redmi 16, Redmi 17, Note 16, Note 17 (só rumores) |
| 2023 | POCO | 7 | 6 | 1 | — |
| 2024 | POCO | 9 | 3 | 6 | X6 Neo (Índia) |
| 2025 | POCO | 11 | 4 | 7 | C85 5G (só data anunciada) |
| 2026 | POCO | 5 | 0 | 5 | POCO F8 base, POCO C81 (sem confirmação), M8 Power (Índia) |
| 2023 | realme | 6 | 3 | 3 | — |
| 2024 | realme | 17 | 6 | 11 | Série P / Narzo (Índia) |
| 2025 | realme | 17 | 8 | 9 | — |
| 2026 | realme | 2 | 0 | 2 | realme 16 base |
| 2023 | Infinix | 11 | 3 | 8 | — |
| 2024 | Infinix | 12 | 1 | 11 | — |
| 2025 | Infinix | 9 | 0 | 9 | — |
| 2026 | Infinix | 4 | 0 | 4 | Smart 11, GT 40 Pro (sem confirmação) |

Notas: Redmi Note 15 Pro existente cobre a variante 4G global (mesma regra já usada no Note 14 Pro); POCO C81 Pro
e Redmi A7 Pro são o mesmo hardware segundo a imprensa, mas ficam como **aparelhos distintos sem compatibilidade
presumida**; o mesmo vale para Moto G Max × G87.

## Reconciliações (sem apagar)

- **iPhone 7/8 e 7/8 Plus "Branco/Preto" (8 linhas):** eram a cor da **borda da película 3D** (grupos #221/#231/#232
  da base de películas), não modelos. Status `mesclado` + `replaced_by` para o aparelho real; os grupos de película
  continuam com o nome original ("iPhone 7/8 Branco") e passam a ligar iPhone 7 ↔ iPhone 8 sem modelos falsos.
- **iPhone 17 Air → iPhone Air:** nome oficial é "iPhone Air" (2025). `apple_iphone_17_air` mesclado; a busca por
  "iPhone 17 Air" devolve uma única entrada.
- **Xiaomi Mi 12 Lite / Mi 13T / Mi 13T Pro → Xiaomi 12 Lite / 13T / 13T Pro** (a Xiaomi abandonou o "Mi" na série
  12); chave mantida e nome antigo como alias. Mi 10 Lite e Mi 11 Lite mantidos (nome oficial com "Mi").
- **Moto G87:** existência confirmada (abr/2026), fonte registrada.
- **iPhone Air, 16e, 17e, SE 2020/2022, 12 mini, 13 mini:** ano e fonte oficial registrados; aliases "iPhone SE 2ª
  geração", "SE 2", "iPhone SE 3ª geração", "SE 3".
- **Galaxy A37/A57, S24 FE, S25 FE:** confirmados (status `novo` → `ativo`).
- **LG (11 linhas, marca descontinuada):** nível secundário — oculta por padrão, reativável por loja.

**O que a loja gravou com chave mesclada continua valendo (nada é regravado):** produtos com
`deviceModelKeys` antigas, vínculos/supressões de película e capinha e localizações são lidos pela chave
canônica (consulta de capinha, vínculos, busca de películas). Decisão nova vai para a chave canônica; quando
o mesmo par existe nas duas formas, vale a canônica; "restaurar" desfaz também a decisão antiga.

**Cadastro manual da loja × global novo (ex.: G47):** a busca da loja troca o resultado global pelo
cadastro dela, preservando o casamento por nome/alias ("Moto G47", "MotoG47") — inclusive com a marca oculta.
"Aguardando lançamento" só existe na gestão de modelos; nos fluxos operacionais (PDV, produto, películas) o
modelo criado é selecionado na hora e por isso é sempre gravado como lançado.

## Modelos futuros

Nenhum modelo especulativo foi criado. **Galaxy S27** não tem anúncio oficial verificado (só aparece em linha do
tempo da Wikipedia, sem datas): **não cadastrada**. A arquitetura suporta:
- global: status `aguardando_lancamento` no CSV → fora das buscas, resolvível por chave;
- loja: "Aguardando lançamento oficial" no cadastro manual → aparece só na gestão até a loja confirmar.

## Compatibilidades documentadas (película, acessório específico)

Gravadas como `compatibility_type = acessorio_especifico`, status `confirmado_fornecedor`, com aviso de escopo
("Documentado só para o acessório X") — **não** são equivalência geral de molde.

| Acessório | Modelos | Fonte |
|---|---|---|
| Belkin UltraGlass 2 (OVA193fq) | iPhone 18 Pro ↔ iPhone 17 Pro | [Apple Store AU](https://www.apple.com/au/shop/product/hs832zm/a/belkin-ultraglass-2-screen-protector-for-iphone-18-pro-iphone-17-pro) · [Belkin](https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-18-pro-%2F-iphone-17-pro/OVA193fq.html) |
| Belkin UltraGlass 2 (OVA194fq) | iPhone 18 Pro Max ↔ iPhone 17 Pro Max | [Belkin](https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-18-pro-max-%2F-iphone-17-pro-max/OVA194fq.html) |
| Belkin UltraGlass 2 (OVA157fq) | iPhone 17 ↔ iPhone 16 Pro | [Apple Store US](https://www.apple.com/shop/product/hru02zm/a/belkin-ultraglass-2-screen-protector-for-iphone-17-iphone-16-pro) · [Belkin](https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-17-iphone-16-pro/OVA157fq.html) |
| Belkin UltraGlass (OVA079zz) | iPhone 14 Plus ↔ iPhone 13 Pro Max | [Belkin](https://www.belkin.com/p/ultraglass-treated-screen-protector-for-iphone-14-plus-iphone-13-pro-max/OVA079zz.html) |

**Aguardando documentação/teste:** UltraGlass 2 para iPhone 15 ↔ 16 e 15 Plus ↔ 16 Plus (não encontrei página
oficial); demais marcas (Samsung, Motorola, Xiaomi, Redmi, POCO, realme, Infinix) — sem documentação de fabricante
de acessório localizada nesta rodada. **Capinhas:** nenhuma relação global criada (exige prova de encaixe físico).
Nada foi marcado como "confirmada pela loja".

## Fontes principais

- Apple — Identificar o modelo do iPhone: https://support.apple.com/pt-br/108044
- Samsung Newsroom US — Galaxy S26 FE: https://news.samsung.com/us/samsung-galaxy-s26-fe
- Wikipedia: Samsung Galaxy A/S/Z/M, Moto G, Motorola Edge, Motorola Razr, List of Xiaomi products
- TechTudo — lançamentos Motorola no Brasil em 2026; Oficina da Net — Moto G47/G37
- GSMArena (notícias): Redmi Note 15 global, POCO M8/M8 Pro, POCO F8 Pro/Ultra, POCO C85
- Xiaomi Global — POCO X8 Pro Series; 91mobiles — Redmi 15 5G, Xiaomi 17 global; Beebom — Redmi A7 Pro × POCO C81 Pro
- Croma — realme 16 Pro/16 Pro+; Malay Mail — Infinix NOTE 60; BrandSpur — Infinix HOT 70

Cada linha nova carrega a fonte na coluna `sources`. Linhas com confiança `media` usam nome/ano do anúncio público
do fabricante conhecido até jun/2026, sem reconsulta individual nesta rodada (indicado na própria fonte).
