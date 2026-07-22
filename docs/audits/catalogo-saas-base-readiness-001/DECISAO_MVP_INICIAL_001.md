# Decisão de Escopo e Elegibilidade do MVP Inicial — 001 (REVISIONADA P0)

**GOAL:** `CATALOGO-SAAS-MVP-PAIR-METRICS-P0-CORRECTIVE`
**Data:** 22 de Julho de 2026
**Documento:** `DECISAO_MVP_INICIAL_001.md`
**Status:** APROVADO PARA PLANEJAMENTO TÉCNICO COM MÉTRICAS RECONCILIADAS

---

## 1. NÚMEROS E UNIDADES EXPLÍCITAS DO PRODUTO

Para evitar qualquer ambiguidade entre registros de código, linhas de seed, modelos e pares cruzados, o escopo do MVP adota estritamente as unidades abaixo:

| Dimensão do Produto | Valor Exato | Unidade Explícita | Descrição / Regra de Negócio |
| :--- | :--- | :--- | :--- |
| **Modelos Canônicos Cobertos** | **419** | modelos | Modelos de celulares com pelo menos um registro de película de tela cadastrado. |
| **Linhas Técnicas no Seed** | **1.443** | linhas | Total de linhas no arquivo `device_compatibilities_seed_001.csv`. |
| **Linhas Técnicas Publicáveis** | **563** | linhas | Linhas com `status = confirmado_fornecedor` (`PUBLICAVEL_PADRAO`). |
| **Linhas de Cobertura Própria** | **417** | linhas | Registros `mesmo_modelo` (`source == target`), indicando película para o próprio aparelho. |
| **Grupos Físicos de Película** | **116** | grupos | Grupos físicos reais de molde/tela (excluindo o pseudo-grupo `Mesmo modelo`). |
| **Pares Cruzados Únicos Totais** | **935** | pares | Pares únicos não direcionais min(A,B)-max(A,B) entre aparelhos distintos em `MATRIZ_PARES`. |
| **Pares Cruzados Publicáveis (MVP)**| **136** | pares | Pares únicos não direcionais onde ambos os modelos possuem `confirmado_fornecedor`. |
| **Pares Cruzados Beta (Com Aviso)** | **34** | pares | Pares únicos não direcionais derivados de `provavel_mercado` (`BETA_COM_AVISO`). |
| **Pares Cruzados Ocultos (Bancada)** | **765** | pares | Pares únicos não direcionais dependentes de teste seco (`NAO_PUBLICAVEL`). |
| **Resultados Direcionais de Busca** | **272** | resultados | Respostas direcionais de busca no MVP Padrão ($136 \text{ pares} \times 2$). |
| **Modelos Isolados (Sem Pares)** | **172** | modelos | Modelos com película específica que não possuem par cruzado com outro modelo (ex: iPhone 12 Pro Max). |

---

## 2. O QUE PODE SER USADO IMEDIATAMENTE (PRODUÇÃO / MVP PADRÃO)

1. **Modelos Canônicos de Aparelhos (429 modelos normalizados / 419 com película):**
   - Suporta a estrutura de navegabilidade por fabricante (Samsung, Motorola, Apple, Redmi, POCO, Realme, LG, Infinix, Xiaomi, Tecno).
2. **Aliases e Nomes Alternativos (1.751 aliases):**
   - Os 328 aliases ambíguos (ex: `"8"`, `"12"`, `"c55"`) estão protegidos pelo motor atual (`lib/catalogo-aparelhos/catalogo-aparelhos.ts`) que exige obrigatoriamente a especificação do contexto da marca (`requires_brand_context = true`).
3. **Pares Cruzados Publicáveis (136 pares únicos / 272 resultados direcionais):**
   - Compatibilidades cruzadas entre modelos distintos sustentadas por fornecedores e sem conflito estrutural.
4. **Linhas de Cobertura Própria (417 linhas `mesmo_modelo`):**
   - Respostas de busca indicando a película específica cadastrada para o próprio modelo.

---

## 3. O QUE PODE APARECER SOMENTE EM MODO BETA (COM AVISO VISUAL)

1. **Pares Cruzados Beta (34 pares únicos / 68 resultados direcionais):**
   - Pares cruzados derivados de relações de mercado (`status = provavel_mercado`).
   - **Regra de Exibição:** Exibir aviso obrigatório na interface da consulta:
     > *"Aviso: Compatibilidade provável de mercado. Recomendado realizar conferência seca do molde antes de destacar a proteção da película."*

---

## 4. O QUE DEVE PERMANECER OCULTO NO MVP

1. **Pares Cruzados Ocultos (765 pares únicos - `NAO_PUBLICAVEL`):**
   - Pares onde uma ou ambas as associações dependem de `status = precisa_testar`.
   - **Decisão:** Devem permanecer **estritamente ocultos** no SaaS comercial inicial até que passem por curadoria técnica ou validação presencial em bancada.

---

## 5. O QUE NÃO EXISTE AINDA (LACUNAS TÉCNICAS E DE DADOS)

1. **Tabela de Compatibilidades Físicas de Capinhas (0 registros / 0 pares):**
   - A base atual possui apenas uma lista de modelos com títulos sugeridos para estoque (`"Capinha iPhone 12 Pro Max"`). **Não existe nenhuma relação cruzada de encaixe de capinhas.**
2. **Registros de Validação em Bancada Física Local (`confirmado_bancada` = 0):**
   - Nenhuma relação da base possui testes presenciais em bancada física documentados no repositório.

---

## 6. QUAIS PROMESSAS COMERCIAIS SÃO PERMITIDAS

- `"Consulta rápida de películas 3D compatíveis por modelo de celular e marca."`
- `"Buscador inteligente por nomes populares, siglas e códigos de fornecedores."`
- `"Montagem de listas de compras e consulta de estoque para lojistas."`
- `"Filtro de películas por grupo físico de tela."`

---

## 7. QUAIS PROMESSAS COMERCIAIS SÃO PROIBIDAS (RISCO DE PROPAGANDA ENGANOSA E CHURN)

- **PROIBIDO:** Anunciar `"Consulta de compatibilidades de capinhas"` no lançamento do SaaS.
- **PROIBIDO:** Prometer `"100% de garantia de encaixe sem necessidade de conferência física"`.
- **PROIBIDO:** Declarar `"Cobertura completa de todos os lançamentos do mercado 2026"`.

---

## 8. ESCOPO INICIAL RECOMENDADO DO PRODUTO (MVP)

O produto inicial deve ser posicionado e lançado estritamente como:
**SaaS de Consulta de Compatibilidade de Películas e Catálogo Canônico de Celulares.**

### Módulos Incluídos no MVP:
- **Buscador Canônico:** Busca de aparelhos por marca, linha e alias (com trava obrigatoria de marca em termos ambíguos).
- **Consulta de Películas 3D:** Exibição exclusiva dos 136 pares cruzados `PUBLICAVEL_PADRAO` (272 resultados direcionais), 417 coberturas próprias e 34 pares `BETA_COM_AVISO`.
- **Listas de Estoque e Compras:** Recursos para o lojista salvar modelos consultados e exportar pedidos.

---

## 9. ESCOPO FUTURO DE CAPINHAS

Para incluir o módulo de capinhas em versões futuras do SaaS, será obrigatório executar o `GOAL: CATALOGO-CAPINHAS-BANCADA-SEED-001`, que consiste em:
- Realizar testes físicos de encaixe chassi/câmera/botões com estoques reais em lojas parceiras.
- Cadastrar os grupos de capinhas do zero em uma nova estrutura de seed.

---

## 10. RISCOS JURÍDICOS E COMERCIAIS A EVITAR

1. **Devoluções e Churn:** Vender assinaturas prometendo busca de capinhas geraria cancelamentos e solicitações de reembolso de lojistas frustrados.
2. **Dano Material por Aplicação Incorreta:** Liberar os 765 pares cruzados pendentes de teste sem aviso pode fazer o lojista perder peças e culpar o software.

---

## 11. DADOS A CRUZAR COM A PESQUISA DO GROK

- **Validação de Lançamentos 2024-2026:** A amostra inicial de 10 gaps (Moto G85, Edge 50 Series, POCO F6, Realme 12) deverá ser cruzada com o relatório detalhado do Grok por marca para mapeamento completo de variantes regionais e códigos de modelo.
