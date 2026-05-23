# Relatório — Fix de scroll no Histórico de Vendas ERP

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal 7: corrigir bug crítico
> de rolagem em `/dashboard/vendas-arquivo-geral`.

## 1. Causa raiz

O bug **não estava** no componente `vendas-arquivo-geral.tsx` (sua raiz é
`<div className="space-y-5 pb-8 min-w-0">`, fluxo natural correto). Estava no
**wrapper de rota** `app/dashboard/layout.tsx`.

O layout do dashboard escolhe entre dois wrappers conforme a rota:

```tsx
const isVendas =
  pathname?.startsWith("/dashboard/vendas") ||   // ← bug
  pathname?.startsWith("/dashboard/pdv-next")

<div className={
  isVendas
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden basis-0"  // tela-fixa PDV (sem scroll)
    : "min-h-0 flex-1 overflow-auto pb-24 lg:pb-0"                     // página normal (rola)
}>
```

`pathname?.startsWith("/dashboard/vendas")` casa **por prefixo** com
`/dashboard/vendas-arquivo-geral`. Resultado: a página de Histórico recebia o
wrapper `overflow-hidden` projetado para a tela-fixa do PDV — então a lista era
**cortada na altura da viewport e o mouse wheel não rolava**. O `<main>` do
`AppShell` também é `overflow-hidden` (cada página gerencia o próprio scroll),
o que tornava o corte total.

A mesma armadilha de prefixo afetava `/dashboard/vendas-hub` (página de cards
que também precisa rolar).

## 2. Correção (1 arquivo, 1 expressão)

`app/dashboard/layout.tsx`:

```tsx
// Antes
const isVendas =
  pathname?.startsWith("/dashboard/vendas") ||
  pathname?.startsWith("/dashboard/pdv-next")

// Depois — match exato + barra (não captura rotas irmãs "vendas-*")
const isVendas =
  pathname === "/dashboard/vendas" ||
  pathname?.startsWith("/dashboard/vendas/") ||
  pathname?.startsWith("/dashboard/pdv-next")
```

### Matriz de comportamento

| Rota | Tipo | Antes | Depois |
|---|---|---|---|
| `/dashboard/vendas` | PDV principal (tela-fixa) | hidden | hidden ✅ |
| `/dashboard/vendas/venda-completa` | PDV completo (tela-fixa) | hidden | hidden ✅ |
| `/dashboard/vendas-arquivo-geral` | Histórico (rola) | **hidden ❌** | **auto ✅ (CORRIGIDO)** |
| `/dashboard/vendas-hub` | Hub de cards (rola) | hidden ❌ | auto ✅ (corrigido junto) |
| `/dashboard/pdv-next` | PDV Black (tela-fixa) | hidden | hidden ✅ |

`venda-completa-page-client.tsx` é tela-fixa (`flex flex-1 overflow-hidden`),
confirmado — o match `/dashboard/vendas/` preserva seu `overflow-hidden`.

## 3. Itens extras revisados (sem alteração necessária)

- **Search bar** (`vendas-arquivo-geral.tsx:608-615`): ícone `Search` em
  `absolute left-3` + `Input pl-9` → sem sobreposição com o texto. ✅
- **Input de Operador** (filtros): sem ícone interno, label acima. ✅
- **Placeholders:** claros ("Buscar por cupom, cliente ou ID da venda…",
  "Nome ou ID…"). ✅
- **4 temas (Light, Soft Ice, Midnight, Black):** toolbar, filtros, KPIs e
  tabela usam apenas tokens semânticos (`bg-background`, `bg-card`,
  `text-muted-foreground`, `border-border`) — sem cor hardcoded. Renderiza
  consistente nos 4 temas por design. ✅
- **Tabela:** `overflow-x-auto` (scroll horizontal) + coluna "Ações" sticky
  preservados. Sem `max-h`, então cresce naturalmente e agora rola com a
  página. ✅

## 4. Não tocado (preservado)

- Backend, Prisma schema, `finalizeSaleTransaction`, `lib/ops-upsert-venda.ts`.
- Auth, `proxy.ts`, sidebar.
- PDV estabilizado (`/dashboard/vendas`, `venda-completa`, `pdv-next`)
  continua tela-fixa — comportamento idêntico.
- Drawer de detalhe, modais, impressão, cancelamento e troca/devolução: o fix
  é puramente no wrapper de scroll da página; nenhuma lógica desses fluxos foi
  alterada. O drawer (`flex-1 overflow-y-auto`, linha 936) e o dialog
  (`max-h-[min(90vh,680px)]`, linha 1294) têm scroll próprio e independem do
  wrapper de página.
- Fase 2 de cancelamento/devolução: não implementada (fora de escopo).

## 5. Validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** |
| `git status` | ✅ `M app/dashboard/layout.tsx` |
| `git diff --stat` | ✅ `layout.tsx \| ~8 +-` |

## 6. Arquivos alterados

```
M  app/dashboard/layout.tsx   (match de rota isVendas + comentário)
```

Apenas 1 arquivo de aplicação. Nenhum arquivo criado fora deste relatório.

## 7. Teste manual (loja)

1. Abrir `/dashboard/vendas-arquivo-geral` com muitos registros (ex.: 245
   vendas do banco).
2. **Esperado:** mouse wheel / scroll vertical rola a página até o último
   registro + rodapé. KPIs e toolbar rolam junto (não são sticky por design
   atual).
3. Abrir o **drawer de detalhe** (botão "Detalhes") → drawer rola
   internamente, página por trás congela normalmente.
4. Abrir o **dialog** (ex.: troca/devolução, cancelamento) → conteúdo do
   dialog rola dentro do `max-h`.
5. Conferir `/dashboard/vendas` (PDV) → continua tela-fixa, sem scroll de
   página (correto).
6. Conferir `/dashboard/vendas-hub` → agora rola (melhoria colateral).
7. Repetir em Light / Soft Ice / Midnight / Black → layout consistente.

## 8. Próximos passos sugeridos (fora de escopo)

| Prioridade | Sugestão |
|---|---|
| 🟢 Baixa | Tornar header/KPIs sticky no topo da página de Histórico (UX premium ao rolar listas longas). |
| 🟢 Baixa | Paginação ou virtualização da tabela para listas muito grandes (perf). |

---

**Conclusão:** Scroll restaurado em `/dashboard/vendas-arquivo-geral` com uma
correção cirúrgica de 1 expressão no `app/dashboard/layout.tsx` — o match de
rota `isVendas` deixou de capturar rotas irmãs `vendas-*` por prefixo. As
telas-fixas do PDV (`/dashboard/vendas`, `venda-completa`, `pdv-next`)
mantêm `overflow-hidden`; o Histórico e o `vendas-hub` agora rolam
naturalmente. Drawer, modais e ações intactos.
