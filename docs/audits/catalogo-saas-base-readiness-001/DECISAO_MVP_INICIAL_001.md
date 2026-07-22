# Decisão de Escopo e Elegibilidade do MVP Inicial — 001

**GOAL:** `CATALOGO-SAAS-BASE-READINESS-001-METRICS-MVP-CORRECTIVE`
**Data:** 22 de Julho de 2026
**Documento:** `DECISAO_MVP_INICIAL_001.md`
**Status:** APROVADO PARA PLANEJAMENTO TÉCNICO

---

## 1. O QUE PODE SER USADO IMEDIATAMENTE (PRODUÇÃO / MVP)

1. **Modelos Canônicos de Aparelhos (429 modelos):**
   - Base inteiramente normalizada, sem chaves duplicadas ou colisões de nomes canônicos em `device_models_seed_001.csv`.
   - Suporta a estrutura de navegabilidade por fabricante (Samsung, Motorola, Apple, Redmi, POCO, Realme, LG, Infinix, Xiaomi, Tecno).
2. **Aliases e Nomes Alternativos (1.751 aliases):**
   - Mapeamento completo de nomes curtos, variações de fornecedores e erros comuns de digitação.
   - Os 328 aliases ambíguos (ex: `"8"`, `"12"`, `"c55"`) estão protegidos pelo motor atual (`lib/catalogo-aparelhos/catalogo-aparelhos.ts`) que exige obrigatoriamente a especificação do contexto da marca (`requires_brand_context = true`).
3. **Películas com Confirmação de Fornecedor (563 relações - `PUBLICAVEL_PADRAO`):**
   - Relações de películas 3D originadas de tabelas formais de fornecedores com rastreabilidade completa e sem conflitos estruturais.

---

## 2. O QUE PODE APARECER SOMENTE EM MODO BETA (COM AVISO VISUAL)

1. **Películas Prováveis de Mercado (39 relações - `BETA_COM_AVISO`):**
   - Relações consolidadas por anúncios públicos de mercado (`status = provavel_mercado`).
   - **Regra de Exibição:** Exibir aviso obrigatório na interface da consulta:
     > *"Aviso: Compatibilidade provável de mercado. Recomendado realizar conferência seca do molde antes de destacar a proteção da película."*

---

## 3. O QUE DEVE PERMANECER OCULTO NO MVP

1. **Películas Pendentes de Teste (841 relações - `NAO_PUBLICAVEL`):**
   - Relações derivadas por aproximação de tamanho de tela (`status = precisa_testar`), representando 58,3% da base total de películas.
   - **Decisão:** Devem permanecer **estritamente ocultas** no SaaS comercial inicial até que passem por curadoria técnica ou validação presencial em bancada.

---

## 4. O QUE NÃO EXISTE AINDA (LACUNAS TÉCNICAS E DE DADOS)

1. **Tabela de Compatibilidades Físicas de Capinhas (0 registros):**
   - A base atual possui apenas uma lista de modelos com títulos sugeridos para estoque (`"Capinha iPhone 12 Pro Max"`). **Não existe nenhuma relação cruzada de encaixe de capinhas.**
2. **Registros de Validação em Bancada Física Local (`confirmado_bancada` = 0):**
   - Nenhuma relação da base possui testes presenciais em bancada física documentados no repositório.

---

## 5. QUAIS PROMESSAS COMERCIAIS SÃO PERMITIDAS

- `"Consulta rápida de películas 3D compatíveis por modelo de celular e marca."`
- `"Buscador inteligente por nomes populares, siglas e códigos de fornecedores."`
- `"Montagem de listas de compras e consulta de estoque para lojistas."`
- `"Filtro de películas por grupo físico de tela."`

---

## 6. QUAIS PROMESSAS COMERCIAIS SÃO PROIBIDAS (RISCO DE PROPRAGANDA ENGANOSA E CHURN)

- **PROIBIDO:** Anunciar `"Consulta de compatibilidades de capinhas"` no lançamento do SaaS.
- **PROIBIDO:** Prometer `"100% de garantia de encaixe sem necessidade de conferência física"`.
- **PROIBIDO:** Declarar `"Cobertura completa de todos os lançamentos do mercado 2026"`.

---

## 7. ESCOPO INICIAL RECOMENDADO DO PRODUTO (MVP)

O produto inicial deve ser posicionado e lançado estritamente como:
**SaaS de Consulta de Compatibilidade de Películas e Catálogo Canônico de Celulares.**

### Módulos Incluídos no MVP:
- **Buscador Canônico:** Busca de aparelhos por marca, linha e alias (com trava obrigatoria de marca em termos ambíguos).
- **Consulta de Películas 3D:** Exibição exclusiva das 563 relações `PUBLICAVEL_PADRAO` e 39 relações `BETA_COM_AVISO`.
- **Listas de Estoque e Compras:** Recursos para o lojista salvar modelos consultados e exportar pedidos.

---

## 8. ESCOPO FUTURO DE CAPINHAS

Para incluir o módulo de capinhas em versões futuras do SaaS, será obrigatório executar o `GOAL: CATALOGO-CAPINHAS-BANCADA-SEED-001`, que consiste em:
- Realizar testes físicos de encaixe chassi/câmera/botões com estoques reais em lojas parceiras.
- Cadastrar os grupos de capinhas do zero em uma nova estrutura de seed.

---

## 9. RISCOS JURÍDICOS E COMERCIAIS A EVITAR

1. **Devoluções e Churn:** Vender assinaturas prometendo busca de capinhas geraria cancelamentos e solicitações de reembolso de lojistas frustrados.
2. **Dano Material por Aplicação Incorreta:** Liberar as 841 películas pendentes de teste sem aviso pode fazer o lojista perder peças e culpar o software.

---

## 10. DADOS A CRUZAR COM A PESQUISA DO GROK

- **Validação de Lançamentos 2024-2026:** A amostra inicial de 10 gaps (Moto G85, Edge 50 Series, POCO F6, Realme 12) deverá ser cruzada com o relatório detalhado do Grok por marca para mapeamento completo de variantes regionais e códigos de modelo.
