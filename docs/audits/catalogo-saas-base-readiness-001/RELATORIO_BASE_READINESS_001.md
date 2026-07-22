# RELATÓRIO DE AUDITORIA E PRONTIDÃO DE BASE DA PLATAFORMA DE CATÁLOGO — 001 (RECONCILIADO)

**GOAL:** `CATALOGO-SAAS-BASE-READINESS-001-METRICS-MVP-CORRECTIVE`
**Data da Auditoria Original:** 22 de Julho de 2026
**Data da Reconciliação:** 22 de Julho de 2026
**Responsável Técnico:** Engenheiro de Dados Sênior & Auditor Forense de Repositório
**Repositório Base:** `omni-gestao` (OmniGestão Pro)
**Worktree Isolada:** `omni-gestao-catalogo-saas-readiness-001`
**Branch Dedicada:** `audit/catalogo-saas-base-readiness-001`
**Commit-Base da Reconciliação:** `38e643e8d2e825a07c13aa6e09fb5c6d32aa6c3d`

---

## 1. RESUMO EXECUTIVO RECONCILIADO

Esta versão reconciliada do relatório ajusta e clarifica as métricas da auditoria original para evitar qualquer interpretação ambígua ou incorreta dos dados de **modelos de celulares, aliases, películas e capinhas** no ecossistema OmniGestão Pro.

### Principais Diagnósticos Reconciliados:
1. **Modelos Canônicos:** Permanecem **429 modelos canônicos únicos e normalizados**, cobrindo 10 marcas.
2. **Reconciliação das 1.443 Linhas de Película:**
   - O seed `device_compatibilities_seed_001.csv` contém **1.443 linhas técnicas no total**.
   - Destas, **1.026 linhas (`grupo_pelicula`)** representam associações entre modelos de aparelhos e seus respectivos grupos de referência de películas de tela.
   - **417 linhas (`mesmo_modelo`)** representam registros auto-referenciais indicando presença de película específica para o próprio modelo.
   - **86.738 pares únicos combinatórios** entre aparelhos distintos podem ser derivados com segurança dos 117 grupos físicos cadastrados.
3. **Diferenciação Fornecedor vs Bancada:**
   - **Confirmado Fornecedor:** **563 relações** (alta confiança baseada em tabelas de fabricantes/fornecedores).
   - **Confirmado Bancada Física Local:** **0 (ZERO) relações** possuem registros de testes presenciais locais documentados no repositório.
   - **Provável Mercado:** **39 relações** (média confiança).
   - **Precisa Testar (Ocultas no MVP):** **841 relações** (58,3% da base) possuem baixa confiança e estão marcadas como ocultas no MVP.
4. **Reconciliação dos Aliases:**
   - Existem **1.751 aliases totais** no seed `device_aliases_seed_001.csv`.
   - **328 aliases são ambíguos** (`is_ambiguous = true`) e estão **100% protegidos** no motor de busca (`lib/catalogo-aparelhos/catalogo-aparelhos.ts`) que exige obrigatoriamente a especificação da marca (`requires_brand_context`).
   - Os **227 itens na fila de revisão** referem-se a ocorrências prioritárias de curadoria humana contidas conceitualmente na lista de ambíguos.
   - Foram isoladas **21 strings únicas de alias que colidem** entre marcas distintas (ex: `"8"`, `"12"`, `"13"`, `"15"`, `"c55"`, `"c65"`).
5. **Reconciliação Grupos 266 (HTML) vs 117 (Seed Final):**
   - A fonte legada `peliculas_3d_compativeis.html` possui 266 entradas na `const DATA`. Destas, **171 eram modelos individuais no catálogo** e **95 eram grupos/supergrupos**.
   - No processo de normalização do seed, esses registros foram consolidados em **117 grupos físicos de películas de tela**. A transformação detalhada passo a passo é declarada como `NAO_RECONSTRUIDO_COM_EVIDENCIA_COMPLETA` por ausência do script histórico intermediário.
6. **Capinhas (Achado Crítico):** **ZERO RELAÇÕES FÍSICAS DE COMPATIBILIDADE DE CAPINHAS**. O arquivo `modelos_celulares_para_capinhas.xlsx` (401 linhas) é uma lista de modelos de aparelhos para títulos de produtos no PDV (`"Capinha iPhone 12 Pro Max"`).
7. **Pesquisa Externa e Gaps:** Os 10 modelos ausentes identificados representam uma **`AMOSTRA_INICIAL_DE_GAPS`** e serão posteriormente cruzados com a pesquisa completa por marca (Grok).
8. **Seleção de Elegibilidade do MVP:**
   - **`PUBLICAVEL_PADRAO`:** 563 relações (liberação imediata).
   - **`BETA_COM_AVISO`:** 39 relações (liberação em modo beta com aviso em tela).
   - **`NAO_PUBLICAVEL`:** 841 relações (ocultas por baixa confiança).

---

## 2. METODOLOGIA DE AUDITORIA E PRÉ-FLIGHT

Para a auditoria e o corretivo documental, a worktree isolada foi mantida sem qualquer contaminação:

```bash
git status --short           # Limpo
git branch --show-current     # audit/catalogo-saas-base-readiness-001
git rev-parse HEAD           # 38e643e8d2e825a07c13aa6e09fb5c6d32aa6c3d
git diff --check             # Limpo
```

---

## 3. ESCOPO AUTORIZADO E RECONCILIAÇÃO DE ARTEFATOS

### Artefatos Reconciliados e Novos no Escopo:
- `RELATORIO_BASE_READINESS_001.md` (Atualizado com reconciliações)
- `MANIFESTO_EVIDENCIAS_001.md` (Atualizado com novas fórmulas e hashes)
- `MATRIZ_RECONCILIACAO_METRICAS_001.csv` (**Novo:** Matriz de correções de métricas)
- `PELICULAS_MVP_PUBLICAVEL_001.csv` (**Novo:** Projeção derivada de elegibilidade para o MVP)
- `DECISAO_MVP_INICIAL_001.md` (**Novo:** Decisão executiva de escopo e promessas comerciais)

---

## 4. INVENTARIO RECONCILIADO DAS FONTES DE DADOS

| ID | Caminho do Arquivo / Fonte | Tipo | Tamanho | Registros | Status de Qualidade | Finalidade Principal |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SRC-001** | `docs/imports/catalogo/modelos_celulares_para_capinhas.xlsx` | Excel | 27.275 B | 401 | PARCIAL | Lista de modelos para títulos de capinhas (sem relações físicas). |
| **SRC-002** | `docs/imports/catalogo/peliculas_3d_compativeis.html` | HTML/JSON | 107.437 B | 266 | PARCIAL | Buscador HTML legado (95 grupos + 171 modelos individuais). |
| **SRC-003** | `docs/catalogo/seeds/device_models_seed_001.csv` | CSV Seed | 44.821 B | 429 | PRONTO | Base canônica de 429 modelos normalizados (10 marcas). |
| **SRC-004** | `docs/catalogo/seeds/device_aliases_seed_001.csv` | CSV Seed | 107.391 B | 1.751 | PRONTO_COM_RESSALVAS | 1.751 aliases de busca (328 ambíguos com trava de marca). |
| **SRC-005** | `docs/catalogo/seeds/device_compatibilities_seed_001.csv` | CSV Seed | 179.917 B | 1.443 | PARCIAL | 1.443 linhas no seed (1.026 grupos + 417 mesmo modelo; 0 capinhas). |
| **SRC-006** | `docs/catalogo/seeds/device_review_queue_seed_001.csv` | CSV Seed | 74.453 B | 527 | PRONTO | 527 itens mapeados para revisão e curadoria. |

---

## 5. RECONCILIAÇÃO DETALHADA DAS MÉTRICAS

### 5.1 Reconciliação das 1.443 Linhas de Películas:
- **Linhas Técnicas Totais no Seed:** 1.443 linhas.
- **Associações a Grupos (`grupo_pelicula`):** 1.026 linhas (onde um modelo de aparelho é associado a um grupo físico).
- **Registros de Mesmo Modelo (`mesmo_modelo`):** 417 linhas (registros auto-referenciais `source == target` indicando presença de película específica).
- **Relações com Aparelhos Distintos:** 1.026 linhas (`source_model_key != target_model_key`).
- **Pares Únicos Cruzados Derivados:** **86.738 pares combinatórios únicos** entre modelos distintos derivados dos 117 grupos físicos.

### 5.2 Reconciliação Grupos Legados (266) vs Seed Final (117):
- Na fonte HTML legada (`peliculas_3d_compativeis.html`), existiam 266 entradas na `const DATA`.
- **Análise dos 266 Registros Legados:**
  - 165 entradas do tipo `"Modelo individual no catálogo"`.
  - 6 entradas do tipo `"Modelo individual"`.
  - 85 entradas do tipo `"Grupo compatível"`.
  - 9 entradas do tipo `"Super grupo cruzado"`.
  - 1 entrada do tipo `"Grupo compatível ampliado"`.
- **Resultado no Seed Final:** Os modelos individuais foram consolidados nos 429 modelos canônicos e os agrupamentos de tela resultaram em **117 grupos físicos únicos** de películas no seed final.
- **Declaração de Transparência:** Devido à ausência do script histórico intermediário de transformação, declara-se `NAO_RECONSTRUIDO_COM_EVIDENCIA_COMPLETA`.

### 5.3 Fornecedor vs Bancada Física Local:
- **`confirmado_fornecedor`:** **563 relações** (alta confiança derivada de tabelas formais de fornecedores).
- **`confirmado_bancada`:** **0 (ZERO) relações**. Declara-se zero por ausência de registros de testes presenciais locais documentados.
- **`provavel_mercado`:** **39 relações**.
- **`precisa_testar`:** **841 relações** (58,3% da base, derivadas de telas com dimensões similares).

### 5.4 Reconciliação dos Aliases:
- **1.751 Aliases Totais:** Total de registros no CSV de aliases.
- **328 Aliases Ambíguos:** Possuem `is_ambiguous = true` / `requires_brand_context = true` e estão protegidos no motor de busca pela exigência de contexto de marca.
- **227 Aliases na Fila de Revisão:** Trata-se da priorização de curadoria para as ocorrências dos aliases numéricos/curtos, contidas nos 328 ambíguos.
- **21 Strings Colidentes Únicas:** As 21 palavras/siglas que provocam colisão entre marcas diferentes (ex: `"8"`, `"12"`, `"13"`, `"15"`, `"c55"`, `"c65"`, `"x5"`).

---

## 6. CLASSIFICAÇÃO DE ELEGIBILIDADE PARA O MVP DE PELÍCULAS

Com base nos critérios de elegibilidade definidos em `PELICULAS_MVP_PUBLICAVEL_001.csv`:

| Categoria de Elegibilidade | Quantidade de Relações | Visibilidade no SaaS | Regra de Exibição / Filtro |
| :--- | :--- | :--- | :--- |
| **`PUBLICAVEL_PADRAO`** | **563 relações (39,0%)** | `visible` (Público) | Liberação imediata para consulta de balcão e listas. |
| **`BETA_COM_AVISO`** | **39 relações (2,7%)** | `beta_only` (Beta) | Exibir aviso visual: *"Recomendado teste seco antes da aplicação"*. |
| **`NAO_PUBLICAVEL`** | **841 relações (58,3%)** | `hidden` (Oculto) | Permanecem ocultas no MVP por baixa confiança (`precisa_testar`). |

---

## 7. PESQUISA EXTERNA E GAPS (AMOSTRA INICIAL)

Declaramos formalmente que os 10 modelos ausentes catalogados em `GAPS_MODELOS_MERCADO_001.csv` representam uma **`AMOSTRA_INICIAL_DE_GAPS`** (ex: Moto G85, Edge 50 Series, POCO F6, Realme 12).

### Disclaimers da Pesquisa Externa:
- A pesquisa completa por marca ainda não foi concluída.
- A estimativa genérica de ~20 modelos ausentes não está comprovada numericamente.
- Os dados deverão ser cruzados posteriormente com a pesquisa completa de mercado (Grok).
- Cada modelo externo precisará de validação contra a base canônica para verificar variantes de rede (4G/5G) e nomes equivalentes.

---

## 8. AVALIAÇÃO DE PRONTIDÃO RECONCILIADA

| Categoria Auditada | Classificação Reconciliada | Justificativa / Evidência | Esforço Estima |
| :--- | :--- | :--- | :--- |
| **A. Modelos Canônicos** | `PRONTO_COM_RESSALVAS` | 429 modelos normalizados. Necessita inclusão dos lançamentos 2024-2026. | Pequeno (1-2 dias) |
| **B. Aliases** | `PRONTO_COM_RESSALVAS` | 1.751 aliases, com 328 ambíguos protegidos por trava de marca no engine. | Pequeno (1 dia) |
| **C. Películas** | `PARCIAL` | 563 prontas para MVP (`PUBLICAVEL_PADRAO`), 39 para Beta e 841 ocultas. | Médio (1-2 semanas) |
| **D. Capinhas** | `INSUFICIENTE` | **0 relações físicas de compatibilidade de capinhas cadastradas.** | Grande (3-4 semanas) |
| **E. Rastreabilidade** | `PRONTO` | Hashes SHA-256 e commits mapeados em `INVENTARIO_FONTES_001.csv`. | Concluído |
| **F. Qualidade dos Dados** | `PARCIAL` | 527 itens organizados e priorizados na fila de revisão. | Médio (3-5 dias) |
| **G. Cobertura de Mercado** | `PARCIAL` | Boa para modelos até 2023; lacunas amostradas em lançamentos 2024-2026. | Pequeno (2-3 dias) |
| **H. Prontidão para Importação**| `PRONTO_COM_RESSALVAS` | Arquitetura TypeScript em `lib/catalogo-aparelhos/` 100% pronta. | Pequeno (1 dia) |
| **I. Comercialização SaaS** | **`BLOQUEADO`** | **Inviável cobrar assinaturas sem o módulo de capinhas e com 58% das películas sem bancada.** | Grande |

---

## 9. REFERÊNCIA AOS NOVOS ARTEFATOS AUDITADOS

Todos os arquivos estão consolidados na pasta autorizada:
[docs/audits/catalogo-saas-base-readiness-001/](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/)

1. [RELATORIO_BASE_READINESS_001.md](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/RELATORIO_BASE_READINESS_001.md) (Este relatório reconciliado)
2. [MANIFESTO_EVIDENCIAS_001.md](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/MANIFESTO_EVIDENCIAS_001.md)
3. [MATRIZ_RECONCILIACAO_METRICAS_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/MATRIZ_RECONCILIACAO_METRICAS_001.csv) (**Novo**)
4. [PELICULAS_MVP_PUBLICAVEL_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/PELICULAS_MVP_PUBLICAVEL_001.csv) (**Novo**)
5. [DECISAO_MVP_INICIAL_001.md](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/DECISAO_MVP_INICIAL_001.md) (**Novo**)
6. [INVENTARIO_FONTES_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/INVENTARIO_FONTES_001.csv)
7. [MODELOS_CANONICOS_INVENTARIO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/MODELOS_CANONICOS_INVENTARIO_001.csv)
8. [ALIASES_INVENTARIO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/ALIASES_INVENTARIO_001.csv)
9. [COMPATIBILIDADES_PELICULAS_INVENTARIO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/COMPATIBILIDADES_PELICULAS_INVENTARIO_001.csv)
10. [COMPATIBILIDADES_CAPINHAS_INVENTARIO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/COMPATIBILIDADES_CAPINHAS_INVENTARIO_001.csv)
11. [FILA_REVISAO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/FILA_REVISAO_001.csv)
12. [GAPS_MODELOS_MERCADO_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/GAPS_MODELOS_MERCADO_001.csv)
13. [MATRIZ_COBERTURA_MARCAS_001.csv](file:///C:/Projetos/omni-gestao-catalogo-saas-readiness-001/docs/audits/catalogo-saas-base-readiness-001/MATRIZ_COBERTURA_MARCAS_001.csv)
