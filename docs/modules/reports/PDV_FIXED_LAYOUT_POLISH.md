# PDV — Layout Fixo sem Rolagem Global

**Data:** 2026-05-09  
**Arquivos alterados:** 4

---

## Problema

O PDV permitia rolagem vertical global da página e exibia espaço branco abaixo do conteúdo ao rolar. O conteúdo não ficava encaixado em 100vh.

### Causa raiz

```
AppShell.main (flex-1, block element — NÃO era flex container)
  └── div.flex-1.overflow-auto (flex-1 sem efeito → crescia com conteúdo)
        └── VendasPageClient (min-h-[100dvh] → forçava 100vh dentro do AppShell)
```

- `AppShell.main` não era flex container, então `flex-1` no wrapper interno não limitava a altura
- O wrapper com `overflow-auto` crescia com o conteúdo do PDV (sem teto)
- `min-h-[min(100dvh,100vh)]` em `VendasPageClient` forçava o PDV a ter no mínimo 100vh, mas ele já estava dentro do AppShell (topbar 56px + padding) → overflow de pelo menos 56px

---

## Solução implementada

### 1. `components/painel-inicial/AppShell.tsx`

Adicionado `flex flex-col overflow-hidden` ao `main`:

```tsx
// antes:
<main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">

// depois:
<main className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-6">
```

`main` agora é um flex container. O `flex-1` no wrapper interno (`div.flex-1.overflow-auto`) fica efetivo e a altura é limitada pelo espaço disponível.

> Impacto em outras páginas: antes o conteúdo fazia o scroll da janela inteira. Agora rola internamente no `div.overflow-auto`. Este é o comportamento correto para um dashboard SaaS (sidebar + topbar fixos).

---

### 2. `app/dashboard/layout.tsx`

Wrapper filho detecta rota PDV e usa `overflow-hidden` (sem scroll interno, sem padding de nav móvel):

```tsx
const isVendas = pathname?.startsWith("/dashboard/vendas")

<div className={isVendas
  ? "flex flex-1 flex-col overflow-hidden"
  : "flex-1 overflow-auto pb-24 lg:pb-0"
}>
```

Para o PDV: sem `pb-24` (que adicionaria 96px de espaço abaixo), sem `overflow-auto` (nenhum scroll interno — o PDV gerencia seu próprio scroll interno de produtos). Para outras rotas: comportamento inalterado.

---

### 3. `app/dashboard/vendas/vendas-page-client.tsx`

Removido `min-h-[min(100dvh,100vh)]` (causava overflow), adicionado `-mx-4 sm:-mx-6 lg:-mx-8` (cancela o padding horizontal do AppShell):

```tsx
// antes:
<div className="flex min-h-[min(100dvh,100vh)] min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden ...">

// depois:
<div className="-mx-4 sm:-mx-6 lg:-mx-8 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden ...">
```

O PDV agora tem largura total (de borda a borda do conteúdo). A altura é preenchida via `flex-1` dentro do container corretamente limitado.

---

### 4. `components/dashboard/vendas/pdv-omni-classic-shell.tsx`

Painel lateral (aside) corrigido para preencher altura disponível e o card "Informativo" recebe `flex-1` para eliminar espaço vazio:

```tsx
// aside: adicionado h-full
<aside className="col-span-12 flex h-full min-h-0 flex-col gap-3 overflow-y-auto lg:col-span-3">

// card Informativo: adicionado flex-1 min-h-0
<div className={cn("min-h-0 flex-1 rounded-md border p-4 shadow-pos", ...)}>
```

O Total/Finalizar sempre visível no topo do aside. O card Informativo preenche o espaço restante. Se o conteúdo exceder a altura disponível, o aside rola internamente.

---

## Layout resultante

```
AppShell.main (flex col, bounded height = viewport - topbar - py-6)
  └── div.flex.flex-1.flex-col.overflow-hidden (PDV: sem scroll)
        └── VendasPageClient (-mx lateral, flex-1)
              └── PdvClassic (flex-1 flex-col overflow-hidden)
                    └── CaixaStatusBar (height natural)
                    └── PdvOmniClassicShell (flex-1 flex-col)
                          ├── header PDV (height natural)
                          ├── section BIPE (height natural)
                          ├── main PDV (flex-1, overflow-hidden)
                          │     ├── ItemsTable (flex h-full, overflow-y-auto interno)
                          │     └── aside (h-full, overflow-y-auto)
                          │           ├── Total + Finalizar (height natural, sempre visível)
                          │           ├── Informativo (flex-1, preenche espaço)
                          │           └── Atalhos mini (height natural)
                          └── ShortcutBar (height natural)
```

---

## Comportamento por tela

| Situação | Comportamento |
|----------|---------------|
| Desktop (lg+) | PDV ocupa toda a área útil sem scroll de página |
| Tablet | PDV ocupa área útil, sem scroll de página |
| Mobile | PDV usável, sidebar oculta, sem scroll de página |
| Lista de produtos longa | Scroll INTERNO na tabela de itens |
| Aside com muito texto | Scroll INTERNO no painel lateral |
| Página de financeiro/OS | Comportamento inalterado (scroll de janela → scroll interno na área de conteúdo) |

---

## Riscos remanescentes

- **py-6 do AppShell**: O PDV mantém 24px de padding vertical do `AppShell.main` (top e bottom). Isso não impede o uso, mas não é "edge-to-edge" total. Para eliminar, ajustar `py-6` no AppShell ou aplicar `-my-6` (cuidado: requer que o wrapper não use `overflow-hidden`).
- **Páginas não-PDV**: A mudança no AppShell move o scroll de "janela inteira" para "área de conteúdo". Nenhuma página deve quebrar, mas dropdowns ou tooltips com `position: absolute` dependem de ancestors sem `overflow: hidden` para não serem cortados. Monitore se algum componente fica cortado.
- **CaixaStatusBar**: Componente de altura variável dentro do PdvClassic. Se crescer muito, comprime o shell. Assumido estável.
