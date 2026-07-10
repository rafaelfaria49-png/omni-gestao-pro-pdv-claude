# Proposta de Expansão da Base de Películas — FABLE 001

GOAL: CATALOGO-PELICULAS-BASE-EXPAND-FABLE-001
Data: 2026-07-10
Base analisada: main `191f7f1` · seeds `device_*_seed_001.csv`
Modo: **proposta para revisão humana — nada foi aplicado nos seeds.**

---

## 1. Método e regras de honestidade

- Toda a análise foi feita sobre os 4 seeds versionados; nenhuma relação existente foi alterada.
- **Nenhuma compatibilidade proposta é apresentada como verdade absoluta.** Regra aplicada:
  - relação amplamente consolidada em tabelas abertas de mercado → `provavel_mercado` + `media`;
  - relação plausível por painel/frente semelhante, mas sem consolidação → `precisa_testar` + `baixa`;
  - **nada** foi proposto como `confirmado_fornecedor` (isso exige fornecedor ou teste físico).
- Toda relação proposta tem `requires_dry_test = true`.
- Modelos novos entram com status `novo` e confidence `media` (existência do aparelho é fato; a linha exata/variante ainda exige conferência no balcão).

## 2. Radiografia da base atual

**Modelos (417):** Samsung 124 · Motorola 102 · Redmi 65 · Apple 49 · POCO 30 · Realme 27 · LG 11 · Xiaomi 5 · Infinix 2 · Tecno 2.

**Grupos de película (95, 999 relações):**

| Tamanho | Grupos |
|---|---|
| 2 membros | 60 |
| 3–4 membros | 25 |
| 5–9 membros | 3 |
| 10+ membros | 7 |

**Status das relações de película:** `precisa_testar` 826 (83%) · `confirmado_fornecedor` 146 (15%) · `provavel_mercado` 27 (3%). Confiança espelha: baixa 826 / alta 146 / media 27.

**Cobertura:** **200 de 417 modelos (48%) não têm nenhum grupo de película** — Samsung 61, Motorola 52, Redmi 32, POCO 16, Apple 14, Realme 12, LG 7, Xiaomi 3, Tecno 2, Infinix 1.

**Aliases:** 1716 no total, 326 ambíguos. 20 aliases normalizados apontam para mais de um modelo — os mais perigosos: `12/13/15/8` (iPhone × Redmi), `C65/C71/C75` (POCO × Realme), `NOTE 9/10` (Redmi × Samsung), `X5` (POCO × um suspeito `redmi_x5`).

## 3. Principais lacunas

1. **Flagships Samsung sem grupo**: S21/S22/S23/S24 (base, Plus e Ultra) — só S23 FE/S24 FE têm grupo. Alta demanda de balcão.
2. **iPhones de alto giro sem grupo**: SE 2020, SE 2022, 12 Mini, 12 Pro Max, 13 Mini, 14 Pro Max*, 15 Plus, 15 Pro Max, 16 e 16 Plus. (*14 Pro Max está no seed mas sem relação.)
3. **Motorola intermediários sem grupo**: G32, G42, G72, G73, G84, E13, E22, Edge 20/30 (todas as variantes).
4. **Xiaomi recentes sem grupo**: Redmi 9, Note 11S, Note 12 (todas as variantes), Note 13 4G, Note 14 (série), POCO C40, X3 NFC.
5. **Infinix/Tecno quase ausentes do catálogo**: só Smart 7, Hot Play, Spark 20/20C — faltam Hot 10–40, Smart 8, Spark 10 (linhas de alto volume em loja popular).
6. **Duplicatas no seed de modelos**: `motorola_one_fusion` × `motorola_moto_one_fusion` (idem `macro` e `zoom`) — mesmos aparelhos com duas chaves.
7. **Modelo suspeito**: `redmi_x5` (Redmi X5 não é um modelo do mercado BR; provável confusão com POCO X5).

## 4. Cobertura da lista prioritária do GOAL

Dos **146 modelos prioritários**: **95 já têm modelo + grupo** · **39 existem mas estão sem grupo** · **12 nem existem no catálogo**:

`motorola_edge_40`, `poco_c55`, `poco_m5`, `realme_c21`, `infinix_hot_10`, `infinix_hot_11`, `infinix_hot_12`, `infinix_hot_20`, `infinix_hot_30`, `infinix_hot_40`, `infinix_smart_8`, `tecno_spark_10`.

## 5. Grupos suspeitos (revisão prioritária)

Os 7 super grupos com 10+ membros são todos `precisa_testar`/multimarca e concentram o maior risco de venda errada:

| Grupo | Membros | Marcas | Nome |
|---|---|---|---|
| pelicula_g001 | 29 | 6 | Super grupo A02/A03/A12/A13/A23/A70 |
| pelicula_g005 | 17 | 4 | Super grupo A20/A30/A50/A30S/M31/Redmi Note 7-8/Moto G8 |
| pelicula_g002 | 12 | 3 | Super grupo A04/A04S/A04E/A13/M12/G30 |
| pelicula_g007 | 11 | 2 | Super grupo A71/M51/A72/M62/Note 9S/Note 11 Pro |
| pelicula_g008 | 11 | 2 | Super grupo Moto G05/G15/G35/G75 + Realme C75 |
| pelicula_g003 | 10 | 4 | Super grupo A05/A05S/A06/Redmi 13C/POCO C65/Realme C51 |
| pelicula_g006 | 10 | 2 | Super grupo A51/A52/A52S/A53/S20 FE/Note 10-11 |

Recomendação: mutirão de **teste seco por amostragem** (2–3 modelos por grupo) antes de qualquer promoção de status.

## 6. Proposta de expansão

Detalhe linha a linha em [`proposta_expansao_peliculas_fable_001.csv`](proposta_expansao_peliculas_fable_001.csv) (52 linhas). Resumo:

### P1 — 12 modelos novos (`novo_modelo`)

Motorola Edge 40 · POCO C55 · POCO M5 · Realme C21 · Infinix Hot 10/11/12/20/30/40 · Infinix Smart 8 · Tecno Spark 10 — cada um com 3–4 aliases sugeridos. Avisos:
- alias `C55` **colide** com `realme_c55` (existente) → `is_ambiguous=true`, `requires_brand_context=true`;
- alias `M5` é curto → ambíguo;
- Infinix/Tecno: as variantes (`Hot 10 Play`, `Spark 10 Pro`, `Hot 40i` etc.) têm frentes **diferentes** — catalogar a variante exata é pré-condição para qualquer grupo.

### P2 — 24 relações/grupos novos (`nova_relacao`)

Nenhuma como confirmada. As mais fortes (`provavel_mercado`+`media`, consolidadas em mercado):

- iPhone SE 2020 + SE 2022 → grupo do iPhone 7/8 (mesma frente 4,7");
- Moto E32s → grupo do E32/G22 (gêmeo de tela);
- Moto E13 → grupo do G13/G23 (tabela de mercado comum);
- Redmi Note 11S → grupo do Note 11 (mesmo painel 6,43" AMOLED);
- POCO X3 NFC → grupo do X3/X3 Pro (mercado consolidado);
- POCO C55 ↔ Redmi 12C (gêmeos de projeto);
- Realme C21 ↔ Realme C11 (família C11/C20/C21);
- Realme C30 ↔ C30s (gêmeos);
- Redmi Note 12 ↔ Note 12 4G (mesma frente).

As demais (`precisa_testar`+`baixa`, plausíveis mas exigem teste seco): 12 Mini↔13 Mini · 14 Pro Max↔15 Plus↔15 Pro Max · 16↔15 e 16 Plus↔15 Plus · A22 4G↔M22↔M32↔A31 · A15↔A25 · G42↔G31 · Edge 20↔Edge 20 Pro · G72→grupo do G52 (+Edge 30) · G73→grupo do G53 · Redmi 9→grupo do 9A/9C · Note 12 Pro→Note 12 · Note 13 4G→Note 13 · C33↔C30 · Spark 20↔Spark 20C.

### P3 — 15 itens de fila de revisão (`revisao`)

Inclui: duplicatas `one_fusion/macro/zoom` · `redmi_x5` suspeito · **A22 4G×5G e A32 4G×5G nunca agrupar** (painéis diferentes) · **Redmi Note 14 Pro/Pro+ têm tela curva** (película específica) · **Edge 40 tela curva** (não agrupar) · S21–S24 sem grupo (pesquisar fornecedor) · iPhone 12 Pro Max · POCO C40 · POCO M5 · variantes Infinix/Tecno · G84/G32 · mutirão dos 7 super grupos · aliases numéricos puros (12/13/15/8).

## 7. Riscos de compatibilidade

1. **83% da base é `precisa_testar`** — o buscador deve continuar exibindo isso com destaque (já faz). A expansão proposta **não** melhora confiança, só cobertura; confiança só sobe com fornecedor/teste físico.
2. **Tela curva** (Note 14 Pro/Pro+, Edge 40, S-Ultra antigos): película 3D é modelo-específica; agrupar é o erro mais caro.
3. **Gêmeos 4G/5G com telas diferentes** (A22, A32, Note 12 4G×5G em parte): o sufixo confunde o operador; as notas de revisão pedem aviso explícito.
4. **Colisões de alias entre marcas** crescem com a expansão (C55, M5) — o buscador já sinaliza; manter `requires_brand_context`.
5. **Infinix/Tecno**: pouca informação estruturada de fornecedor no BR; entram como modelos SEM grupo até haver evidência (vazio honesto no buscador é melhor que grupo inventado).

## 8. Próximo GOAL recomendado — CATALOGO-PELICULAS-SEEDS-EXPAND-002

Aplicar a expansão nos CSVs **somente após revisão humana deste documento**, com:

**Pré-condições:**
- Revisor marca cada linha do CSV proposto como `aprovar` / `ajustar` / `rejeitar`.
- Nenhuma linha rejeitada entra; linhas ajustadas entram com o texto do revisor.

**Escopo:**
1. Anexar modelos aprovados a `device_models_seed_001.csv` (chaves novas, sem tocar linhas existentes).
2. Anexar aliases aprovados a `device_aliases_seed_001.csv` (com `is_ambiguous`/`requires_brand_context` conforme proposta).
3. Expandir relações aprovadas em pares unidirecionais (i<j) em `device_compatibilities_seed_001.csv`, com chaves `pelicula_p0NN__a__b` (namespace `p` = proposta, não colide com `gNNN`).
4. Anexar itens de revisão a `device_review_queue_seed_001.csv`.
5. Resolver (ou registrar como pendência) as duplicatas `one_*` e o `redmi_x5`.

**Validações:** `npx vitest run lib/catalogo-aparelhos` (os testes ancoram em contagens mínimas — verificar que continuam válidas) · smoke manual no buscador (`A06`, `SE 2020`, `Hot 30`) · `npx tsc --noEmit` não é necessário se só CSVs mudarem, mas rodar por segurança · sem build (não muda rota/config).

**Riscos do 002:** encoding (gravar CSV em UTF-8 sem BOM, sem mojibake novo) · não renumerar chaves existentes · manter pares i<j consistentes.

**Nota de versionamento:** o `.gitignore` do projeto tem regra global `*.csv` (linha 47) — o CSV desta proposta e qualquer CSV novo em `docs/catalogo/` só entram no Git com `git add -f` (os seeds atuais já foram versionados assim). Este arquivo `.md` é versionável normalmente.

## 9. O que esta proposta NÃO faz

- Não altera seeds, código, API, componentes, `next.config.mjs`, schema ou PDV/Caixa/Estoque/Cadastros V2.
- Não promove status de nenhuma relação existente.
- Não cria produto nem toca em estoque/venda.
- Não foi commitada nem publicada — aguarda revisão humana.
