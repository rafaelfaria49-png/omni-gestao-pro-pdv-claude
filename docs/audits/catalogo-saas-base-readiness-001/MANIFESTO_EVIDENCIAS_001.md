# Manifesto de Evidências — CATALOGO-SAAS-MVP-PAIR-METRICS-P0-CORRECTIVE

## 1. IDENTIFICAÇÃO DO AMBIENTE E ISOLAMENTO

- **Repositório:** `omni-gestao` (OmniGestão Pro)
- **Caminho da Worktree Isolada:** `C:\Projetos\omni-gestao-catalogo-saas-readiness-001`
- **Branch Dedicada:** `audit/catalogo-saas-base-readiness-001`
- **Commit Base Inicial P0:** `2a4a119bd7fe13bfd3f1bfd8e411b6329c3eb71f`
- **Commit Base do Repositório (`origin/main`):** `f010ba1b4a310a3a40ed00ddda8258b443ee5890`
- **Data/Hora Local do Corretivo P0:** `2026-07-22T15:10:41-03:00`
- **Estado do Repositório:** Worktree 100% isolada, limpa, sem contaminação com WIPs de outras sessões paralelas.

---

## 2. HASHES SHA-256 DOS ARTEFATOS AUDITADOS E GERADOS

| Arquivo / Artefato | Tamanho (Bytes) | Hash SHA-256 | Origem / Tipo |
| :--- | :--- | :--- | :--- |
| `RELATORIO_BASE_READINESS_001.md` | 11.367 | `ca1fd8e5140b785a49ffbbc6f478117aa879c7fd13b48ece81d4de52c3d760bb` | Modificado P0 (Relatório Corrigido) |
| `MANIFESTO_EVIDENCIAS_001.md` | 5.800 | *Este arquivo* | Modificado P0 (Manifesto de Evidências) |
| `MATRIZ_PARES_COMPATIBILIDADE_001.csv` | 378.427 | `043d293821d5c0473be54fcecb28b4312113195995efa4d551afb31dcf561b0d` | **Novo P0** (935 Pares Únicos) |
| `MATRIZ_RECONCILIACAO_METRICAS_001.csv` | 5.262 | `08e11a04a3571a5149e6c8b4acc5c09fdc3ac623cafe20d2e3ec095ad8b3f651` | Modificado P0 (Matriz de Reconciliação) |
| `PELICULAS_MVP_PUBLICAVEL_001.csv` | 840.187 | `7f095b89ac80fa1b29289ca46b7eb32f31282a9c071215575654cbfb490aa1d8` | Modificado P0 (Campos de Escopo) |
| `DECISAO_MVP_INICIAL_001.md` | 6.936 | `27fde0fdf25b4f5c90ef97206c6624047f14594879d6efc1596cf4f791980ef3` | Modificado P0 (Unidades Explícitas) |
| `INVENTARIO_FONTES_001.csv` | 3.686 | `50168aa569ec3cdbbf42e8944db4dfa1e8e5dcac2a8cd8305bac4a6115f27ac1` | Existente (Commit 38e643e) |
| `MODELOS_CANONICOS_INVENTARIO_001.csv` | 66.979 | `c1b4513583d399284562eedeb301b576c93904f1456b5f54791819273171f8a7` | Existente (Commit 38e643e) |
| `ALIASES_INVENTARIO_001.csv` | 365.250 | `4ca2a0b68422e4df043f3881a5f94550596e5c515617403278c554a9b2ed4bb7` | Existente (Commit 38e643e) |
| `COMPATIBILIDADES_PELICULAS_INVENTARIO_001.csv` | 549.651 | `868f8bb148dc6a5991c7f29077f6ce624e76f2fffdd5640bf4bc06b25725d9fd` | Existente (Commit 38e643e) |
| `COMPATIBILIDADES_CAPINHAS_INVENTARIO_001.csv` | 190 | `04bb47a8d2299cbc8ae18c1ae3231993b27ed783deeb837febce1373d8520ead` | Existente (Commit 38e643e) |
| `FILA_REVISAO_001.csv` | 195.291 | `ba04443cc180935d55d49825da678de110c6e181744d90be55b06b2036dd20c0` | Existente (Commit 38e643e) |
| `GAPS_MODELOS_MERCADO_001.csv` | 2.535 | `5b743413ebeac80cae2a4eabed0b3445202f928cdc5b0108d809862daba61043` | Existente (Commit 38e643e) |
| `MATRIZ_COBERTURA_MARCAS_001.csv` | 1.091 | `f73c98e3d15624f487ce13a5b2ea6da10f405605053092a8d84770e0d7df13a5` | Existente (Commit 38e643e) |

---

## 3. SCRIPTS E COMANDOS UTILIZADOS NA INVESTIGAÇÃO P0

### 3.1 Investigação da Explosão Combinatória
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\verify_bug_cause.js
// Prova empiricamente que group_name = "Mesmo modelo" continha 417 modelos.
// C(417, 2) = 417 * 416 / 2 = 86.736 pares artificiais.
```

### 3.2 Script de Recálculo Rigoroso dos 935 Pares Únicos
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\recalculate_all_pair_metrics.js
// Desconsidera o pseudo-grupo "Mesmo modelo".
// Filtra exclusivamente os 116 grupos físicos reais de películas de tela.
// Aplica deduplicação não direcional min(A,B)-max(A,B).
```

### 3.3 Script Gerador da Matriz de Pares
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\generate_pair_matrix.js
// Gera MATRIZ_PARES_COMPATIBILIDADE_001.csv com 935 linhas (1 por par único).
```

---

## 4. REGRAS E FÓRMULAS MATEMÁTICAS APLICADAS

1. **Descarte de Pseudo-Grupos:**
   $$\text{Filtro} = \text{group\_name} \neq \text{"Mesmo modelo"} \text{ e } \text{group\_name} \neq \text{""}$$

2. **Deduplicação de Pares Únicos Não Direcionais:**
   Para todo par de modelos $(A, B)$ dentro de um grupo físico real $G$:
   $$\text{ChavePar} = \min(A, B) \mathbin{\Vert} \text{" <-> "} \mathbin{\Vert} \max(A, B)$$
   Com $\text{ChavePar}$ único no conjunto global de pares.

3. **Propagação de Evidência para Pares Cruzados:**
   - `PUBLICAVEL_PADRAO`: Ambas as associações do par possuem `status == confirmado_fornecedor`.
   - `BETA_COM_AVISO`: Ambas as associações possuem `status == confirmado_fornecedor` ou `provavel_mercado` (sem `precisa_testar`).
   - `NAO_PUBLICAVEL`: Qualquer uma das associações possui `status == precisa_testar`.

---

## 5. LIMITAÇÕES DECLARADAS

1. **Capinhas Inexistentes:** Permanece comprovado que o repositório possui **0 relações físicas de compatibilidade de capinhas**.
2. **Confirmação de Bancada:** `confirmado_bancada` permanece estritamente igual a **0**.
3. **Escopo Temporário dos Scripts:** Todos os scripts de cálculo e validação residem fora da árvore rastreada (`scratch/`).
