# Manifesto de Evidências — CATALOGO-SAAS-BASE-READINESS-001-METRICS-MVP-CORRECTIVE

## 1. IDENTIFICAÇÃO DO AMBIENTE E ISOLAMENTO

- **Repositório:** `omni-gestao` (OmniGestão Pro)
- **Caminho da Worktree Isolada:** `C:\Projetos\omni-gestao-catalogo-saas-readiness-001`
- **Branch Dedicada:** `audit/catalogo-saas-base-readiness-001`
- **Commit Base da Auditoria Original:** `38e643e8d2e825a07c13aa6e09fb5c6d32aa6c3d`
- **Commit Base do Repositório (`origin/main`):** `f010ba1b4a310a3a40ed00ddda8258b443ee5890`
- **Data/Hora Local da Reconciliação:** `2026-07-22T14:39:27-03:00`
- **Estado do Repositório:** Worktree 100% isolada, limpa, sem contaminação com WIPs de outras sessões parallel.

---

## 2. HASHES SHA-256 DOS ARTEFATOS NA PASTA AUTORIZADA

| Arquivo / Artefato | Tamanho (Bytes) | Hash SHA-256 | Origem / Tipo |
| :--- | :--- | :--- | :--- |
| `RELATORIO_BASE_READINESS_001.md` | 14.283 | `2246826d2eb745ba4d7b2594da14dac52c90bc755fa140a5378dfd924f5f90e8` | Modificado (Relatório Reconciliado) |
| `MANIFESTO_EVIDENCIAS_001.md` | 7.850 | *Este arquivo* | Modificado (Manifesto de Evidências) |
| `MATRIZ_RECONCILIACAO_METRICAS_001.csv` | 5.857 | `9cc8894f6a44b1972b0053055b4e3f788add8d4e69b804da14d78d96b0b75ad1` | **Novo** (Matriz de Reconciliação) |
| `PELICULAS_MVP_PUBLICAVEL_001.csv` | 771.606 | `c06b747a1b693cd906a2fde7efc01f4a9b2f94942ec37b26db93aad75daad635` | **Novo** (Elegibilidade para MVP) |
| `DECISAO_MVP_INICIAL_001.md` | 5.061 | `07fa879fe90221d22637b4014797c033e950d3ec768183c6e38bb24670ab4b34` | **Novo** (Decisão de MVP) |
| `INVENTARIO_FONTES_001.csv` | 3.686 | `50168aa569ec3cdbbf42e8944db4dfa1e8e5dcac2a8cd8305bac4a6115f27ac1` | Existente (Commit 38e643e) |
| `MODELOS_CANONICOS_INVENTARIO_001.csv` | 66.979 | `c1b4513583d399284562eedeb301b576c93904f1456b5f54791819273171f8a7` | Existente (Commit 38e643e) |
| `ALIASES_INVENTARIO_001.csv` | 365.250 | `4ca2a0b68422e4df043f3881a5f94550596e5c515617403278c554a9b2ed4bb7` | Existente (Commit 38e643e) |
| `COMPATIBILIDADES_PELICULAS_INVENTARIO_001.csv` | 549.651 | `868f8bb148dc6a5991c7f29077f6ce624e76f2fffdd5640bf4bc06b25725d9fd` | Existente (Commit 38e643e) |
| `COMPATIBILIDADES_CAPINHAS_INVENTARIO_001.csv` | 190 | `04bb47a8d2299cbc8ae18c1ae3231993b27ed783deeb837febce1373d8520ead` | Existente (Commit 38e643e) |
| `FILA_REVISAO_001.csv` | 195.291 | `ba04443cc180935d55d49825da678de110c6e181744d90be55b06b2036dd20c0` | Existente (Commit 38e643e) |
| `GAPS_MODELOS_MERCADO_001.csv` | 2.535 | `5b743413ebeac80cae2a4eabed0b3445202f928cdc5b0108d809862daba61043` | Existente (Commit 38e643e) |
| `MATRIZ_COBERTURA_MARCAS_001.csv` | 1.091 | `f73c98e3d15624f487ce13a5b2ea6da10f405605053092a8d84770e0d7df13a5` | Existente (Commit 38e643e) |

---

## 3. SCRIPTS E COMANDOS UTILIZADOS NA RECONCILIAÇÃO

### 3.1 Script de Reconciliação das 1.443 Relações de Película
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\reconcile_relations.js
// Avalia as 1.443 linhas técnicas do seed device_compatibilities_seed_001.csv:
// 1.026 grupo_pelicula + 417 mesmo_modelo (source == target)
// Calcula os 86.738 pares únicos cruzados combinatórios entre modelos distintos.
```

### 3.2 Script de Reconciliação dos Grupos 266 (HTML) vs 117 (Seed)
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\reconcile_groups.js
// Avalia as 266 entradas na const DATA do HTML peliculas_3d_compativeis.html:
// 171 modelos individuais + 95 grupos/supergrupos -> consolidados nos 117 grupos finais.
```

### 3.3 Script de Isolamento de Aliases e Colisões de Marca
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\reconcile_aliases.js
// Analisa os 1.751 aliases, isolando os 328 ambíguos, os 227 itens na fila de revisão
// e as 21 strings únicas de alias que colidem entre marcas diferentes.
```

### 3.4 Script Gerador dos Artefatos Derivados
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\generate_corrective_artifacts.js
// Constrói os CSVs PELICULAS_MVP_PUBLICAVEL_001.csv e MATRIZ_RECONCILIACAO_METRICAS_001.csv.
```

---

## 4. FÓRMULAS E REGRAS DE CÁLCULO APLICADAS

1. **Pares Únicos Cruzados Combinatórios:**
   Para cada grupo de película composto por $N$ modelos únicos de celulares, a quantidade de pares de compatibilidade cruzada bi-direcional é dada por:
   $$\text{Pares} = \frac{N \times (N - 1)}{2}$$
   O somatório de todos os 117 grupos resulta em **86.738 pares únicos combinatórios**.

2. **Reconciliação de Linhas Técnicas:**
   $$\text{Linhas Totais (1.443)} = \text{Associações a Grupos (1.026)} + \text{Mesmo Modelo (417)}$$

3. **Elegibilidade para MVP de Películas:**
   - `PUBLICAVEL_PADRAO`: `status == confirmado_fornecedor` (563 registros)
   - `BETA_COM_AVISO`: `status == provavel_mercado` (39 registros)
   - `NAO_PUBLICAVEL`: `status == precisa_testar` (841 registros)

---

## 5. LIMITAÇÕES DECLARADAS

1. **Transformação Histórica Legada:** A consolidação exata das 266 entradas da fonte HTML para os 117 grupos finais do seed é declarada como `NAO_RECONSTRUIDO_COM_EVIDENCIA_COMPLETA` por ausência do script intermediário no repositório.
2. **Capinhas Inexistentes:** A base física de compatibilidade de capinhas permanece em **0 registros** (o arquivo Excel é apenas cadastro unificado de aparelhos).
3. **Teste de Bancada Local:** A métrica `confirmado_bancada` é declarada como **0** por ausência de registros de testes presenciais locais documentados.
