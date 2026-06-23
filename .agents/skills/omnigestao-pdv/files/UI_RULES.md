# OmniGestão Pro — Regras de UI

> Guia oficial de estilo visual. Seguir rigorosamente ao criar ou modificar componentes.

---

## 1. Tokens e Cores

### ✅ Usar sempre
```
bg-background       text-foreground
bg-card             text-card-foreground
bg-muted            text-muted-foreground
bg-primary          text-primary-foreground
bg-secondary        text-secondary-foreground
bg-destructive      text-destructive-foreground
border-border
ring-ring
```

### ❌ Nunca usar
```
bg-white            bg-black
text-white          text-black
text-green-*        bg-green-*
#xxxxxx (hexadecimal hardcoded)
rgb(...)            hsl(...) inline
```

**Razão:** os tokens se adaptam automaticamente ao tema ativo (Light, Soft Ice, Midnight, Black Edition). Cores hardcoded quebram todos os temas menos um.

---

## 2. Temas Oficiais

### Light
- Fundo: branco/cinza claro
- Primário: vermelho (brand OmniGestão)
- Uso: clareza máxima, atendimento ao cliente

### Soft Ice
- Fundo: azul gelo suave
- Primário: azul médio
- Uso: padrão visual premium, uso diário

### Midnight
- Fundo: azul escuro profundo
- Primário: azul enterprise vibrante
- Uso: ambientes com pouca luz, foco técnico

### Black Edition
- Fundo: preto (`#020617`)
- Primário: verde terminal (`text-primary` = verde)
- Uso: identidade hacker/premium, diferenciação máxima

---

## 3. Bordas, Sombras e Arredondamento

| Propriedade | Padrão |
|-------------|--------|
| Arredondamento cards | `rounded-xl` |
| Arredondamento botões | `rounded-lg` |
| Arredondamento inputs | `rounded-lg` |
| Borda padrão | `border border-border` |
| Sombra leve | `shadow-sm` |
| Hover estado ativo | `border-primary/30` |
| Background hover | `bg-muted` |

---

## 4. Layout e Overflow

### Regras obrigatórias

```
✅ min-w-0 em TODOS os itens flex e grid
✅ w-full em containers principais
✅ AppShell controla o único scroll vertical
✅ Hubs ocupam 100% da largura disponível
```

### Proibido em layouts de hub

```
❌ h-screen
❌ min-h-screen combinado com overflow
❌ overflow-auto no wrapper principal
❌ overflow-y-auto no wrapper principal
❌ overflow-x-auto no wrapper principal
❌ overflow-hidden no wrapper principal
❌ max-w-7xl / mx-auto como container de layout
❌ sticky top-0 em headers de hub (conflita com AppShell)
❌ w-screen / min-w-screen
❌ w-[calc(100vw-...)]
❌ -my-* (margem negativa vertical)
```

### Padrão de integração de hub Lovable

```tsx
// 1. page.tsx — cancelar só o padding lateral do AppShell
<div className="-mx-4 min-w-0 sm:-mx-6 lg:-mx-8">
  <HubIsolated />
</div>

// 2. HubIsolated.tsx
<div className="w-full min-w-0">
  <Provider>
    <MemoryRouter>...</MemoryRouter>
  </Provider>
</div>

// 3. HubLayout.tsx (root do hub)
<div className="w-full min-w-0 bg-background text-foreground">
  <header className="z-30 border-b border-border bg-background/80 backdrop-blur">
    ...
  </header>
  <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
    {children}
  </main>
</div>
```

---

## 5. Modais (DialogContent)

| Modal | Classe recomendada |
|-------|-------------------|
| Principal (Nova OS, Nova Venda) | `w-[92vw] max-w-6xl max-h-[90vh] overflow-y-auto` |
| Médio (Detalhes, Impressão) | `w-[92vw] max-w-4xl max-h-[90vh] overflow-y-auto` |
| Pequeno (Confirmação, Etiqueta) | `w-[92vw] max-w-xl` |

**Nunca usar** `max-w-lg`, `max-w-md`, `max-w-sm` sozinhos em modais principais — ficam pequenos na maioria dos viewports.

---

## 6. Kanban e Listas

```tsx
// Grid responsivo padrão (Kanban)
<div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">

// Colunas do Kanban — SEM largura fixa
<div className="flex flex-col rounded-2xl border border-border bg-card/50 p-3">
```

- **Nunca** usar `flex + overflow-x-auto` para kanban no desktop
- `overflow-x-auto` é permitido APENAS em tabelas internas e builders de fluxo

---

## 7. Tipografia

| Elemento | Classe |
|----------|--------|
| Título de página | `text-xl font-semibold tracking-tight` |
| Subtítulo de seção | `text-sm font-semibold uppercase tracking-wide text-muted-foreground` |
| Label de campo | `text-xs text-muted-foreground` |
| Valor de KPI | `text-2xl font-semibold` |
| Texto de card | `text-sm` |
| Texto auxiliar | `text-[11px] text-muted-foreground` |

---

## 8. Importação de CSS de Hubs Lovable

```
❌ NUNCA importar index.css de hubs Lovable no layout.tsx raiz
❌ NUNCA importar App.css de hubs Lovable globalmente
✅ Usar data-hub-theme como wrapper encapsulado no próprio hub
✅ Os tokens Tailwind globais já cobrem 90% das necessidades visuais
```

---

## 9. Duplicatas Shadcn/UI

Cada hub Lovable importa uma cópia local de shadcn/ui em `components/ui/`. Essas pastas devem estar **excluídas do `tsconfig.json`** para evitar conflitos de tipos:

```json
"exclude": [
  "components/operacoes/lovable/components/ui",
  "components/whatsapp/lovable/components/ui"
]
```

Os arquivos de hub devem importar de `@/components/ui/*` (versão raiz do projeto).
