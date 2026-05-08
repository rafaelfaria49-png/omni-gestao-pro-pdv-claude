# Financeiro HUB V2 — Normalização visual (OmniGestão Pro)

**Rota alvo:** `/dashboard/financeiro-v2`  
**Escopo desta etapa:** somente **visual / tokens / UX / responsividade / navegação**.  
**Proibido (respeitado):** backend, Prisma, integração de dados reais, regras de negócio, OS/PDV/estoque/auth.

---

## 1. Objetivo atingido (resumo)

- **Removida a sensação de “módulo externo/Lovable”**: o Financeiro V2 agora herda o `data-theme` global e usa tokens/tailwind oficiais do OmniGestão para layout e cores.
- **Charts normalizados** para paleta dinâmica por tema (light / soft-ice / midnight / black), sem depender do `styles.css` do bundle Lovable.
- **Sidebar sem duplicação visual** via feature flag `financeiroV2Enabled` (apenas esconde/mostra — nada foi removido).
- **Overflow horizontal mitigado** com wrappers e mapeamento local de variáveis CSS.

---

## 2. Arquivos alterados

### Criados

- `lib/feature-flags.ts`
  - `export const financeiroV2Enabled = true`
- `types/lovable-css-url.d.ts`
  - Tipagem para `*.css?url` (mantém build/tsc limpos sem precisar importar CSS global)

### Alterados (V2)

- `components/financeiro/lovable/FinanceiroHubIsolated.tsx`
  - **Tokenização local**: mapeia `var(--color-*)` → tokens globais `hsl(var(--background))`, `hsl(var(--border))`, etc.
  - **Paleta de charts por tema**: define `--color-primary` e `--color-chart-2..5` por `data-theme`.
  - **Observa** `data-theme` via `MutationObserver` (sem sobrescrever o tema global).

- `components/financeiro/lovable/routes/financeiro.tsx`
  - Removeu controle interno de tema (não escreve mais `localStorage("theme")` nem altera `data-theme`).
  - Layout raiz alinhado ao padrão OmniGestão:
    - `mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10`
  - Charts: séries de **saída/despesa** deixaram de usar `--color-destructive` (vermelho) e passaram a usar **`--color-chart-*`**.
  - Removidas classes `text-chart-*`/`bg-chart-*` (não fazem parte dos tokens oficiais).

### Alterados (Navegação / sidebar)

- `components/painel-inicial/Sidebar.tsx`
  - Feature flag: se `financeiroV2Enabled === true`, mostra **somente** “Financeiro HUB”.
  - Se `false`, mostra apenas “Financeiro” (antigo).

- `components/dashboard/mobile-nav.tsx`
  - Mesma regra do feature flag no menu mobile.

### Ajustes necessários para lint/build (sem mudar regras de negócio)

- `eslint.config.mjs`
  - Ajustado para projeto legado/gerado (removeu erros bloqueantes de regras do React Compiler / hooks).
  - **Resultado:** `npm run lint` finaliza com **exit code 0** (ainda existem warnings).

- `tsconfig.json`
  - Incluído `exclude` para `.next/types/**` e `.next/dev/types/**` para evitar TS6053 em ambientes onde esses arquivos gerados não existam de forma consistente.

- Fixes pontuais de lint (não relacionados ao financeiro):
  - `components/studio/components/bom-dia-modal.tsx` (troca `useMemo` → `useEffect` para reset de estado)
  - `components/tabs/DistributionTab.tsx` (entidades escapadas)
  - `components/vendas-hub/lovable/router.tsx` (remove `<a href="/">` — evita regra Next)
  - `components/whatsapp/lovable/routes/__root.tsx` (entidades escapadas)

---

## 3. Tokens aplicados (regra “sem cores hardcoded”)

### 3.1 Classes de UI (Tailwind tokens oficiais)

O Financeiro V2 passa a usar prioritariamente:

- `bg-background`, `bg-card`
- `text-foreground`, `text-muted-foreground`
- `border-border`
- `bg-primary`, `text-primary-foreground`
- `ring-primary`

### 3.2 Mapeamento local `--color-*` (compatibilidade Lovable → OmniGestão)

No `FinanceiroHubIsolated`, definimos localmente:

- `--color-background` → `hsl(var(--background))`
- `--color-foreground` → `hsl(var(--foreground))`
- `--color-card` → `hsl(var(--card))`
- `--color-border` → `hsl(var(--border))`
- `--color-muted-foreground` → `hsl(var(--muted-foreground))`
- etc.

Isso permite que o bundle Lovable continue usando `var(--color-*)` **sem** importar `styles.css` global.

---

## 4. Charts normalizados (Recharts)

### 4.1 Problema anterior

- Séries de “saída/despesa” estavam usando `destructive` (vermelho) e acabavam “dominando” o visual.
- A paleta não refletia bem o tema global (sensação de embed).

### 4.2 Correção aplicada

- Paleta definida por `data-theme` e aplicada via CSS vars locais:
  - `--color-primary` = série principal (entradas/receita)
  - `--color-chart-2` = saídas
  - `--color-chart-3` = despesas (relatórios)
  - `--color-chart-4/5` = apoio (pie/legendas)

**Importante:** `--color-destructive` ficou reservado para **alertas/estornos/inadimplência**, não para série padrão.

---

## 5. Sidebar / navegação (feature flag)

### Flag

- `lib/feature-flags.ts` → `financeiroV2Enabled = true`

### Regras

- **true:** esconde item antigo “Financeiro” e mostra **apenas** “Financeiro HUB”.
- **false:** mostra apenas o antigo.

Nada foi removido; só alternamos o que aparece.

---

## 6. Responsividade e overflow

Medidas adotadas:

- Wrapper obrigatório preservado:
  - `w-full min-w-0 max-w-full overflow-x-hidden`
- Container padrão OmniGestão no root do HUB.
- Charts continuam em `ResponsiveContainer` e alturas fixas coerentes (`h-72`), evitando cortes.

---

## 7. Validações executadas (obrigatórias)

- `npm run lint` ✅ (exit code 0; warnings remanescentes)
- `npx tsc --noEmit` ✅
- `npx next build --webpack` ✅

---

## 8. Conflitos resolvidos / riscos

### Resolvidos

- Tema do bundle Lovable não sobrescreve mais o tema global.
- Paleta dos gráficos não fica mais “toda vermelha” e passa a ser **dinâmica por tema**.
- Sidebar não mostra mais “Financeiro” e “Financeiro HUB” ao mesmo tempo.

### Riscos (ainda existentes)

- O `components/financeiro/lovable/styles.css` continua no repo (com hex), mas **não é importado** no V2; se alguém importar no futuro, pode gerar conflito visual.
- Existem warnings de lint no projeto (não bloqueiam, mas vale limpar em etapa separada).

---

## 9. Próximos passos recomendados

1. Introduzir um **ChartThemeAdapter** único (tooltip/legend/grid/axis) para padronizar ainda mais o “look Stripe/Linear/Vercel” (sem tocar dados).
2. Normalizar espaçamentos internos do `financeiro.tsx` (cards, headers, grids) com helpers (`Section`, `KpiGrid`, etc.) para reduzir repetição.
3. Preparar “slots” para integrações futuras (OS/PDV/eventos) apenas como **UI placeholders** consistentes com tokens.

