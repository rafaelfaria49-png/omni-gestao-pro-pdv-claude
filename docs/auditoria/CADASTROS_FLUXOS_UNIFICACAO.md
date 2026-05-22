# Auditoria: Fluxos de Novo Cadastro — Unificação

> Gerado em: 21 Mai 2026 — Sessão: Unificação e correção de fluxos de cadastro

---

## 1. Fluxos encontrados

### 1.1 Topbar — botão global "+ Novo"

**Arquivo:** `components/painel-inicial/Topbar.tsx`

| Item | Destino anterior | Destino atual | Status |
|------|-----------------|---------------|--------|
| Nova Venda | `/dashboard/vendas` | `/dashboard/vendas` | ✅ Correto |
| Nova OS | `/dashboard/operacoes-v2` | `/dashboard/operacoes-v2` | ✅ Correto |
| Novo Cliente | `/dashboard/clientes` (legacy) | `/dashboard/cadastros-v2` | ✅ **Corrigido** |
| Novo Produto | `/dashboard/estoque` (legacy) | `/dashboard/cadastros-v2` | ✅ **Corrigido** |

**Problema original:** "Novo Cliente" e "Novo Produto" apontavam para páginas legacy que existem mas não são o caminho canônico de cadastro.

---

### 1.2 CadastrosHub — modal "Novo cadastro"

**Arquivo:** `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` (linhas 213–242)

**Mecanismo:** Botão "Novo cadastro" abre modal com 6 cards. Ao clicar em um card:
- `setTab(x.tab)` → navega para o painel correspondente
- `setAutoOpenNew(x.tab)` → dispara `useEffect` no painel que chama `m.openIt()`
- `novo.close()` → fecha o modal de seleção

| Card | Tab destino | Painel | Persiste via | Status |
|------|-------------|--------|-------------|--------|
| Cliente | `clientes` | `ClientesPanel` | `createCliente` / `updateCliente` | ✅ Real |
| Produto | `produtos` | `ProdutosPanel` → `ProductAIModal` | `upsertProduto` | ✅ Real |
| Serviço | `servicos` | `ServicosPanel` | `upsertServico` | ✅ Real |
| Fornecedor | `fornecedores` | `FornecedoresPanel` | `upsertFornecedor` | ✅ Real |
| Técnico | `tecnicos` | `TecnicosPanel` | `upsertTecnico` | ✅ Real |
| Equipamento | `equipamentos` | `EquipamentosPanel` | `upsertEquipamentoModelo` | ✅ Real |

**Conclusão:** Modal já funcionava corretamente — nenhuma alteração necessária aqui.

---

### 1.3 CadastrosHub — DashboardPanel (atalhos rápidos)

**Arquivo:** `CadastrosHub.tsx` (linhas 249–407)

7 cards rápidos com `onAction(tab, autoOpen)`. Padrão idêntico ao modal "Novo cadastro". ✅ Funcional.

---

### 1.4 ProductAIModal — formulário de produto

**Arquivo:** `components/cadastros/lovable/components/cadastros/produto-ia.tsx`

**Campos salvos no banco via `upsertProduto`:**

| Campo do form | Campo DB | Salvo? |
|--------------|----------|--------|
| Nome | `name` | ✅ |
| SKU | `sku` | ✅ |
| Código de barras | `barcode` | ✅ |
| Categoria | `category` | ✅ |
| Marca | `brand` | ✅ |
| Fornecedor provável | `supplierName` | ✅ |
| Estoque atual | `stock` | ✅ |
| Custo | `precoCusto` | ✅ |
| Preço sugerido | `price` | ✅ |
| Garantia (dias) | `warrantyDays` | ✅ |
| Modelo compatível | — | ⚠️ Campo existe no form, sem mapeamento em `upsertProduto` |
| NCM | — | ⚠️ Placeholder "Fase fiscal futura" — sem ref, sem save |
| Tributação | — | ⚠️ Sem ref, sem save |
| Tags | — | ⚠️ Sem ref, sem save |
| Descrição | — | ⚠️ Sem ref, sem save |

**Botões corrigidos nesta sessão:**

| Botão | Status anterior | Status atual |
|-------|----------------|-------------|
| Preencher com IA | Disparava animação fake (7 passos) sem ação real | `disabled` + label "Em breve" + tooltip |
| Salvar rascunho | Sem `onClick` — botão completamente morto | `disabled` + tooltip "Em breve" |
| Imagem IA (upload + checkboxes) | Interativo mas sem implementação | `pointer-events-none` + `opacity-50` + badge "Em breve" |
| Salvar produto | ✅ Funcional (chama `upsertProduto`) | Inalterado |

---

### 1.5 Páginas legacy (mantidas, não removidas)

| Rota | Arquivo | Status |
|------|---------|--------|
| `/dashboard/clientes` | `app/dashboard/clientes/page.tsx` | Legada — não removida, não linkeada pela Topbar |
| `/dashboard/estoque` | `app/dashboard/estoque/page.tsx` | Legada — não removida, não linkeada pela Topbar |

Essas páginas continuam existindo e acessíveis por URL direta.

---

## 2. Duplicidades identificadas

| Fluxo A | Fluxo B | Situação |
|---------|---------|----------|
| Topbar "Novo Produto" → `/dashboard/estoque` | CadastrosHub → ProductAIModal | **Resolvido:** Topbar agora aponta para CadastrosHub |
| Topbar "Novo Cliente" → `/dashboard/clientes` | CadastrosHub → ClientesPanel | **Resolvido:** Topbar agora aponta para CadastrosHub |

---

## 3. O que foi conectado nesta sessão

- Topbar "Novo Cliente" → `/dashboard/cadastros-v2` (CadastrosHub canônico)
- Topbar "Novo Produto" → `/dashboard/cadastros-v2` (CadastrosHub canônico)
- ProductAIModal botões fake marcados como "Em breve" (disabled + tooltip honesto)

---

## 4. O que ficou "Em breve"

| Funcionalidade | Onde | Por quê |
|---------------|------|---------|
| Preencher com IA (preenchimento automático) | ProductAIModal | Requer OCR/ML/integração marketplace — fora de escopo |
| Upload de foto / transformação de imagem | ProductAIModal → seção Imagem IA | Requer storage, processamento de imagem — fora de escopo |
| Salvar rascunho de produto | ProductAIModal | Sem modelo de "draft" no Prisma |
| Relacionamentos inteligentes (peças/equipamentos) | ProductAIModal | Fase futura de IA |
| Publicação em marketplace | ProductAIModal | Módulo Marketplace — roadmap P3 |
| Campos NCM / Tributação / Tags / Descrição | ProductAIModal | Sem mapeamento em `upsertProduto`; campos presentes no form mas não salvos |
| Modelo compatível | ProductAIModal | Campo presente mas sem coluna mapeada no schema |
| Exclusão de cliente/serviço/fornecedor/técnico/equipamento | Todos os painéis | Apenas inativação suportada |

---

## 5. Arquivos alterados nesta sessão

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `components/painel-inicial/Topbar.tsx` | Correção | hrefs "Novo Cliente" e "Novo Produto" → `/dashboard/cadastros-v2` |
| `components/cadastros/lovable/components/cadastros/produto-ia.tsx` | Correção | Botão "Preencher com IA" desabilitado (Em breve); "Salvar rascunho" desabilitado; Imagem IA marcada como Em breve |

---

## 6. Próximos passos — ProdutoFormUniversal futuro

Quando for implementar um formulário de produto unificado (ProdutoFormUniversal), considerar:

1. **Campos faltantes a adicionar em `upsertProduto`:** `modelo`, `ncm`, `tags` (array), `descricao`, `tributacao`
2. **Schema Prisma a atualizar:** adicionar coluna `description`, `ncm`, `tags` ao modelo `Produto`
3. **Upload de imagem:** integrar com Supabase Storage ou S3; pipeline de transformação (remoção de fundo via remove.bg ou cloudinary)
4. **Fonte "Link marketplace":** web scraping / API do marketplace para pré-preencher campos
5. **Fonte "Código de barras":** integração com Open Food Facts ou Cosmos para lookup de produto por EAN
6. **Rascunhos:** modelo `ProdutoRascunho` ou flag `status = "rascunho"` em `Produto`
7. **Relacionamentos:** tabela de associação `ProdutoEquipamentoCompativel` e `ProdutoPecaRelacionada`

---

## 7. Validação

- `npx tsc --noEmit` → **0 erros**
- Build não executado (mudanças apenas em componentes client, sem Server Actions, rotas ou config)
