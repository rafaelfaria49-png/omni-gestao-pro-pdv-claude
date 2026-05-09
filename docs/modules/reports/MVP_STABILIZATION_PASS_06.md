# MVP Estabilização — Passo 06: Empty States e Fallbacks Visuais

> Data: 2026-05-09  
> Branch: `terminal-1`  
> Escopo: Camada visual/fallback apenas — nenhuma lógica de serviço, Prisma, adapter ou auth alterados.

---

## Objetivo

Padronizar estados vazios, erros e carregamentos do OmniGestão Pro para eliminar telas "quebradas", blanks de hidratação e tabelas cruas sem mensagem.

---

## Componentes Criados

### `components/ui/states/` (já existentes, validados neste passe)

| Arquivo | Descrição |
|---------|-----------|
| `EmptyState.tsx` | Estado vazio com ícone Lucide, título, descrição, ação opcional e link para o painel |
| `ErrorState.tsx` | Estado de erro com ícone AlertTriangle, título, descrição e botão de retry |
| `LoadingState.tsx` | Spinner + mensagem de carregamento, com modo `inline` (menos padding) |
| `index.ts` | Barrel export dos três componentes |

Dependências internas: `components/ui/empty.tsx` e `components/ui/spinner.tsx` (ambos presentes no projeto).

---

## Páginas / Componentes Ajustados

### 1. `app/dashboard/financeiro-v2/FinanceiroV2Client.tsx`

**Problema:** Loading do hub era texto cru — `"Carregando Financeiro HUB…"` sem feedback visual.

**Correção:** Substituído pelo `FinanceiroV2LoadingFallback` (skeleton com cards e tabela).

```tsx
// antes
loading: () => (
  <div className="... text-sm text-muted-foreground">
    Carregando Financeiro HUB…
  </div>
)

// depois
loading: () => <FinanceiroV2LoadingFallback />
```

---

### 2. `app/dashboard/financeiro-v2/FinanceiroV2LoadingFallback.tsx` *(novo)*

Skeleton layout com: header (título + botão), 4 cards KPI, barra de filtro, tabela grande.  
Usa `Skeleton` do shadcn/ui — tokens semânticos, dark/light compatível.

---

### 3. `app/dashboard/financeiro-v2/loading.tsx` *(novo)*

Rota-nível `loading.tsx` do App Router — exibe `FinanceiroV2LoadingFallback` durante SSR/streaming antes do cliente hidratar.

---

### 4. `app/dashboard/vendas/vendas-page-client.tsx`

**Problema:** `if (!mounted) return null` causava blank screen durante hidratação do PDV (tela branca visível até React montar no cliente).

**Correção:** Substituído por `<LoadingState message="Carregando PDV…" />`.

```tsx
// antes
if (!mounted) return null

// depois
if (!mounted) return <LoadingState message="Carregando PDV…" />
```

---

### 5. `components/dashboard/estoque/gestao-produtos.tsx`

**Problemas:**
- Nenhuma indicação visual durante o carregamento inicial do inventário (chamada a `/api/ops/inventory`).
- `filteredProducts.map(...)` sem fallback: tabela ficava vazia e crua quando array era `[]`.

**Correção:**
1. Adicionado `isLoading` state (inicializado como `true`).
2. `reloadInventory` define `setIsLoading(true)` no início e `setIsLoading(false)` no `finally`.
3. `TableBody` exibe:
   - `<LoadingState inline>` enquanto `isLoading === true`
   - `<EmptyState>` com mensagem contextual quando `filteredProducts.length === 0` e não está carregando:
     - Com filtro ativo: "Nenhum produto encontrado" + dica para ajustar busca
     - Sem filtro: "Nenhum produto cadastrado" + botão "Novo Produto" (abre o modal)
   - A tabela de produtos normalmente quando há dados

---

## Páginas Auditadas sem Necessidade de Alteração

| Página | Motivo |
|--------|--------|
| `app/dashboard/page.tsx` | KPIs já mostram "—" com hint "Aguardando dados"; `DashboardDemoNotice` presente |
| `app/dashboard/historico-vendas/page.tsx` | Já possui `TableCell colSpan={7}` com "Nenhuma venda encontrada" |
| `app/dashboard/os/page.tsx` | Tem loading state, empty state e toast de erro — referência interna |
| `app/dashboard/operacoes-v2/page.tsx` | Usa `OperacoesV2LoadingFallback` com Suspense |
| `app/dashboard/cadastros-v2/page.tsx` | Usa `CadastrosV2LoadingFallback` com Suspense |
| `app/dashboard/relatorios/page.tsx` | Usa `ModuleEmDesenvolvimento` com link de alternativa |
| `app/dashboard/financeiro/page.tsx` | Usa `ModuleEmDesenvolvimento` com link para o HUB |
| `app/dashboard/marketplace/page.tsx` | Delega para hub Lovable isolado — sem dados assíncronos externos |

---

## Arquivos Alterados / Criados

| Arquivo | Ação | Natureza |
|---------|------|----------|
| `app/dashboard/financeiro-v2/FinanceiroV2LoadingFallback.tsx` | Criado | UI: skeleton de carregamento |
| `app/dashboard/financeiro-v2/loading.tsx` | Criado | Rota-nível loading (App Router) |
| `app/dashboard/financeiro-v2/FinanceiroV2Client.tsx` | Editado | Troca loading text → skeleton |
| `app/dashboard/vendas/vendas-page-client.tsx` | Editado | `return null` → `<LoadingState>` |
| `components/dashboard/estoque/gestao-produtos.tsx` | Editado | `isLoading` state + empty/loading no TableBody |

---

## Riscos Remanescentes

| Risco | Severidade | Observação |
|-------|-----------|------------|
| `LoadingState` no PDV não replica o layout exato do PDV — pode causar layout shift | Baixo | O componente é transitório (< 50ms na maioria dos casos); layout shift aceitável |
| `isLoading` em `gestao-produtos` não cobre re-fetch manual (botão "Atualizar") — se existir | Baixo | `reloadInventory` já seta `isLoading(true)` no início, então re-fetch também terá o loading |
| Hubs Lovable (Marketplace, WhatsApp) não expõem empty/error states roteáveis | Médio | Os hubs têm seus próprios estados internos; integração futura dependeria de uma prop de callback |
| `ErrorState` criado mas não aplicado em nenhuma página neste passe | Baixo | Pronto para uso em páginas com fetch de API (ex.: OS legada, estoque) nos próximos passes |
