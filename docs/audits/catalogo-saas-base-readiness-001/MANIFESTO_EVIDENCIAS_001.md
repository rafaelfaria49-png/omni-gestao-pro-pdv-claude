# Manifesto de Evidências — CATALOGO-SAAS-PELICULAS-CAPINHAS-BASE-READINESS-001

## 1. IDENTIFICAÇÃO DO AMBIENTE E ISOLAMENTO

- **Repositório:** `omni-gestao` (OmniGestão Pro)
- **Caminho da Worktree Isolada:** `C:\Projetos\omni-gestao-catalogo-saas-readiness-001`
- **Branch Dedicada:** `audit/catalogo-saas-base-readiness-001`
- **Commit Base (`origin/main`):** `f010ba1b4a310a3a40ed00ddda8258b443ee5890`
- **HEAD Local:** `f010ba1b4a310a3a40ed00ddda8258b443ee5890`
- **Data/Hora Local da Análise:** `2026-07-22T15:45:35-03:00`
- **Estado do Repositório:** Worktree 100% isolada, limpa, sem contaminação com WIPs de outras sessões parallel.

---

## 2. HASHES SHA-256 DAS FONTES PRIMÁRIAS E SEEDS INVESTIGADOS

| Arquivo / Fonte | Tamanho (Bytes) | Hash SHA-256 | Data/Commit Origem |
| :--- | :--- | :--- | :--- |
| `docs/imports/catalogo/modelos_celulares_para_capinhas.xlsx` | 27.275 | `3fcbb7846506f3630f9a562916b7102e3b2e3bc01b44ecbd379d7d11f71f6540` | `3f867cb` (Thu Jul 9 2026) |
| `docs/imports/catalogo/peliculas_3d_compativeis.html` | 107.437 | `1074e0d4bbbc6b3cbb7b2123d6a2f4cfdfb828751fa0ef846b0eb38eb8eb079c` | `3f867cb` (Thu Jul 9 2026) |
| `docs/catalogo/seeds/device_models_seed_001.csv` | 44.821 | `dcd61ed2ee16d10c0e7fe7c2299bbcd31bb7bf3fd3eb92ebfc0bca1387d853e8` | `19c2589` (Thu Jul 9 2026) |
| `docs/catalogo/seeds/device_aliases_seed_001.csv` | 107.391 | `ef205d8f6d7ddf9b33a5dd1caefef79ce41fb7bf771f251c888dcaadab7dc454` | `19c2589` (Thu Jul 9 2026) |
| `docs/catalogo/seeds/device_compatibilities_seed_001.csv` | 179.917 | `94ff67d30d1f7be0174092d6e326c06a8f152d192cf2dc539828e67a0fecbf8c` | `19c2589` (Thu Jul 9 2026) |
| `docs/catalogo/seeds/device_review_queue_seed_001.csv` | 74.453 | `c0ceb2a4726ef3faee5fbd0eaee7a7ea7aae7f6314ff94d4554b73fb47f9a888` | `19c2589` (Thu Jul 9 2026) |
| `docs/catalogo/seeds/README_DEVICE_SEEDS_001.md` | 3.943 | `d3639c3ee622fa6908038c2b000ff73d9782e1caf237ab20a0e99e612838a5ab` | `19c2589` (Thu Jul 9 2026) |
| `docs/catalogo/catalogo_gap_peliculas_capinhas_001.csv` | 133.598 | `30708a0977f475d62c7a9bc4b2ad607f317430ea7c785189460f17a5a0c66ce3` | `3f867cb` (Thu Jul 9 2026) |
| `docs/catalogo/proposta_expansao_peliculas_fable_001_REVISADO.csv` | 15.890 | `221e53d04c5b6349983b00a4e54bc9064d8bfb2ddd9019180196e4b7cbfb8987` | `7cf356b` (Fri Jul 10 2026) |
| `lib/catalogo-aparelhos/catalogo-loader.ts` | 1.964 | `aa07d78c4ca4d2a400011bc914eb72c0b64b7776fd590f62cb42838a523c3bfb` | `19c2589` (Thu Jul 9 2026) |
| `lib/catalogo-aparelhos/catalogo-aparelhos.ts` | 11.776 | `7fb3f5b9a78e5e720f901e9dd4ff7007fceb8466a96883661371c1d6f5c50281` | `19c2589` (Thu Jul 9 2026) |
| `lib/catalogo-aparelhos/peliculas.ts` | 10.173 | `d5c6b1c79e2039b63de65f74e9984b8b2eb073ce2d564b701f6bf1b9e83e1842` | `191f7f1` (Fri Jul 10 2026) |
| `lib/catalogo-aparelhos/produto-metadata.ts` | 7.136 | `d21bca504c0ca1697aaefa569b8407fa8d434f0d32398cb729b92c94f1e7fa6c` | `19c2589` (Thu Jul 9 2026) |
| `lib/catalogo-aparelhos/csv.ts` | 2.469 | `abb79d681fb93e09c2bc083958672de43f6ae9f648b268cc5ea352e75ccb3d65` | `19c2589` (Thu Jul 9 2026) |
| `lib/catalogo-aparelhos/types.ts` | 3.583 | `01352be28f018c469e5afb3842eb8a7880ea3b27deb8e15bd460b45b6432b741` | `19c2589` (Thu Jul 9 2026) |

---

## 3. SCRIPTS E COMANDOS DE AUDITORIA UTILIZADOS

Todos os scripts de auditoria foram executados via Node.js v24.14.1 e PowerShell no diretório de scratch da IDE (`C:\Users\rafae\.gemini\antigravity-ide\scratch\`), fora da árvore rastreada do Git.

### 3.1 Varredura de Fontes no Repositório
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\audit_sources.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoDir = 'C:\\Projetos\\omni-gestao-catalogo-saas-readiness-001';
// Calcula tamanhos, SHA-256, commits git e linhas de cada arquivo de catálogo
```

### 3.2 Leitura do Arquivo Excel Legado
```powershell
# C:\Users\rafae\.gemini\antigravity-ide\scratch\read_xlsx.ps1
Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsxPath = "C:\Projetos\omni-gestao-catalogo-saas-readiness-001\docs\imports\catalogo\modelos_celulares_para_capinhas.xlsx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsxPath)
# Extrai sheetData e sharedStrings para verificar estrutura do inventário de capinhas
```

### 3.3 Análise Forense dos Seeds do Catálogo
```javascript
// C:\Users\rafae\.gemini\antigravity-ide\scratch\audit_seeds.js
// Parser CSV tolerante a aspas e quebras de linha para validar:
// 1. Contagem real de modelos canônicos e duplicidades de chaves
// 2. Mapeamento de aliases, orfãos, ambíguos e duplicados
// 3. Matriz de compatibilidade de películas e detecção de capinhas (0 encontradas)
// 4. Fila de revisão e severidade dos problemas
```

---

## 4. CRITÉRIOS DE NORMALIZAÇÃO E DEDUPLICAÇÃO

1. **Modelos Canônicos:** Identificados unicamente pela `model_key` (ex: `samsung_galaxy_s24`, `apple_iphone_16_pro_max`). Um modelo é considerado duplicado se `model_key` ou a combinação `brand + canonical_name` se repetir.
2. **Tratamento de Variantes 4G/5G:** 4G e 5G são tratados estritamente como **modelos canônicos separados** quando houver divergência física de chassi, tela ou módulo de câmera (ex: `Samsung Galaxy A13 4G` vs `Samsung Galaxy A13 5G`).
3. **Aliases Ambíguos:** Aliases como `"8"`, `"12"`, `"13"`, `"c55"` são sinalizados com `is_ambiguous = true` e `requires_brand_context = true` para forçar contexto de marca no motor de busca e evitar mapeamento incorreto entre fabricantes (ex: `Apple iPhone 8` vs `Redmi 8`).
4. **Compatibilidades:** Relações físicas são idempotentes entre `source_model_key` e `target_model_key`. Grupos de película agregam modelos com o mesmo chassi frontal, mantendo status de validação (`confirmado_fornecedor`, `provavel_mercado`, `precisa_testar`).

---

## 5. FONTES EXTERNAS CONSULTADAS E PESQUISA DE MERCADO

- **Fabricantes (Fontes Primárias):**
  - Motorola Brasil: Especificações técnicas linhas Moto G e Edge 50 (`motorola.com.br`)
  - Samsung Brasil: Linhas Galaxy A, M, S (`samsung.com/br`)
  - POCO Global / Xiaomi: Linhas POCO F, X, M e Redmi Note (`po.co/global`, `mi.com`)
  - Realme Brasil: Linhas C e numeradas (`realme.com/br`)
  - Infinix Brasil / Positivo: Linhas Hot e Note (`infinixmobiles.com.br`)
- **Plataformas de Mercado (Fontes Públicas Secundárias):**
  - Películas UTI / UTI das Películas (`peliculasuti.com.br`)
  - Ofcell123 (`ofcell123.com.br`)
  - Película Compatível (JFC Tecnologia / Google Play Store)

---

## 6. LIMITAÇÕES CONHECIDAS DA AUDITORIA

1. **Ausência de Banco Real:** A análise é restrita aos artefatos estáticos e arquivos de código no repositório Git, sem conexão a banco de dados em execução.
2. **Capinhas Sem Evidência Física:** A base atual não possui nenhuma tabela ou seed de compatibilidade cruzada entre modelos de capinhas. Apenas uma lista de títulos sugeridos para cadastro de produtos existe.
3. **Películas Pendentes de Bancada:** 841 das 1.443 relações de películas estão classificadas com baixa confiança (`precisa_testar`), necessitando validação física antes de comercialização comercial sem ressalvas.
