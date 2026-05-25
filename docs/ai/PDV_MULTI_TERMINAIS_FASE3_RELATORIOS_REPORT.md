# PDV Multi-Terminais — Fase 3: Relatórios, Histórico e Fechamento por Terminal

> **Data:** 24 Mai 2026
> **Tipo:** implementação + auditoria do já existente
> **Escopo:** relatórios/histórico/fechamento separados por terminal, com consolidado geral da loja.
> **Restrições respeitadas:** sem alterar auth/proxy/schema; sem migration; sem mexer em
> PDV Next, sistema de temas, Marketplace/Omni Agent/Marketing IA/WhatsApp; multi-loja preservado.

---

## 1. Descoberta importante

A maior parte da Fase 3 **já estava implementada e commitada** no repositório (de sessão anterior):

| Camada | Estado encontrado |
|---|---|
| `GET /api/vendas/historico` | ✅ Já aceita `terminalId` (`id` / `"sem"` / ausente=todos), retorna `terminalId` por venda, lista `terminais` p/ dropdown e KPIs por terminal. |
| `GET /api/ops/caixa/sessoes` | ✅ Já filtra por `terminalId` (`id` / `"sem"` / ausente) e retorna `terminalId`. |
| `GET /api/ops/caixa/sessao-detalhe` | ✅ Já retorna `terminal` + totais do terminal (`Venda.terminalId`). |
| Histórico de Vendas (`vendas-arquivo-geral.tsx`) | ✅ Filtro de terminal (Todos/PDV/Sem terminal), **badge "Terminal"** na tabela (ícone Monitor), terminal no **detalhe/drawer**. |
| Histórico de Caixa (`caixa-historico-client.tsx`) | ✅ Filtro de terminal, badge na lista de sessões, terminal no detalhe e no **comprovante** impresso. |
| `app/actions/terminais.ts` | ✅ `listTerminais` (cria PDV1/2/3 default; `withPrismaSafe` degrada com segurança). |

**Lacuna real (única):** o **modal de Fechamento de Caixa** mostrava sessão + operador, mas **não o terminal**.

---

## 2. O que foi implementado nesta sessão

**Arquivo:** `components/dashboard/caixa/fechamento-caixa-modal.tsx`

- Importa `useTerminalAtivo(lojaAtivaId)` (mesmo hook usado na abertura/PDV) → resolve o terminal ativo do device.
- `terminalLabel` = `CÓDIGO · Nome` (ex.: `PDV1 · Caixa Principal`) ou **"Sem terminal"** para sessões legadas.
- **Cabeçalho do fechamento:** novo campo "Terminal: …" junto a Sessão/Operador.
- **Comprovante (copiar/imprimir):** linha "Terminal: …" no `buildResumoTexto`.
- **Payload persistido** (`SessaoCaixa.payload.resumoFechamento`): + `terminalId` e `terminalLabel`.

Mudança cirúrgica, tokens semânticos (herdam `text-muted-foreground` — compatível com os temas), sem alterar a lógica de fechamento (continua por `sessaoId`, totais server-side canônicos).

---

## 3. Cobertura dos objetivos da Fase 3

| Objetivo | Status |
|---|---|
| Filtro por terminal no Histórico de Vendas / Vendas HUB | ✅ (pré-existente) |
| Badge "Terminal" na tabela de vendas quando há `terminalId` | ✅ (pré-existente) |
| Terminal no detalhe/drawer da venda | ✅ (pré-existente) |
| Filtro por terminal no Histórico de Caixa | ✅ (pré-existente) |
| Terminal nas sessões de caixa | ✅ (pré-existente) |
| **Terminal no comprovante/relatório de fechamento** | ✅ **(implementado nesta sessão)** |
| "Todos os terminais" como consolidado geral | ✅ (opção do filtro) |
| Vendas/sessões antigas sem `terminalId` → "Sem terminal" | ✅ |
| Preservar relatórios existentes / fechamento ERP premium | ✅ |
| Base para métricas PDV1×PDV2×PDV3 | ✅ (filtro + `terminalId` em vendas e sessões; KPIs por terminal já no `historico`) |
| Não alterar venda/estoque/financeiro sem necessidade | ✅ (nenhuma alteração nesses fluxos) |

**Fonte de dados:** `Venda.terminalId` (coluna) com fallback a `payload.terminalId`; `SessaoCaixa.terminalId`; `PdvTerminal` via `listTerminais`/`historico.terminais`. Sem migração; vendas antigas intactas.

---

## 4. Validações executadas

- `npx tsc --noEmit` → **EXIT 0** (0 erros)
- `npm run build` → **OK** (prisma generate + next build completos)
- `git status` / `git diff --stat` → ver §6

---

## 5. Roteiro de testes (homologação manual recomendada)

> Não executado em navegador nesta sessão (modo implementação). Comportamento confirmado por código.

1. Abrir **Vendas HUB / Vendas** → tabela lista vendas. ✅ esperado
2. Filtro **"Todos os terminais"** → consolidado geral da loja (todas as vendas). ✅
3. Filtro **PDV1** → só vendas com `terminalId` = PDV1. ✅
4. Filtro **PDV2** → só vendas do PDV2. ✅
5. Abrir **detalhe da venda** → mostra o terminal (ou "Sem terminal"). ✅
6. Abrir **Histórico de Caixa** → lista sessões. ✅
7. Filtrar **sessões por terminal** → sessões do terminal escolhido. ✅
8. Abrir **fechamento** → cabeçalho + comprovante mostram "Terminal: …". ✅ (novo)
9. Vendas/sessões antigas → rótulo **"Sem terminal"**. ✅
10. **10 temas** → badges e textos usam tokens semânticos (sem cor hardcoded) → sem quebra esperada. 🔎 validar visualmente.

---

## 6. Arquivos alterados (esta sessão)

- `components/dashboard/caixa/fechamento-caixa-modal.tsx` — terminal no fechamento (header + comprovante + payload).
- `docs/ai/PDV_MULTI_TERMINAIS_FASE3_RELATORIOS_REPORT.md` — este relatório.
- `docs/ai/CURRENT_STATUS.md` — registro de estado.

> **Não commitado (não relacionado à Fase 3, não autoria desta sprint):**
> `components/vendas-hub/lovable/features/vendas/VendasHub.tsx` — troca o botão "Voltar"
> de `@tanstack/react-router` `Link` por `next/navigation` `useRouter().back()`. Mudança
> válida (corrige rota TanStack morta), mas **fora do escopo Fase 3** — deixada para o
> usuário revisar/commitar à parte.

---

## 7. Pendências / próximos passos

- **Consolidado gerencial dedicado** (`GET /api/ops/caixa/consolidado` + card "PDV1×PDV2×PDV3 lado a lado por dia") **não** foi criado — hoje o consolidado é o filtro "Todos os terminais". Era a Fase 6 do plano original; pode virar Fase 3.1 se quiser KPIs comparativos numa única tela.
- `Venda.sessaoId` continua só no `payload` (não é coluna) — fechamento usa janela temporal + `Venda.terminalId`. Promoção para coluna é melhoria futura (plano Fase 5).
- Validação visual nos 10 temas (item 10) recomendada em navegador.
- **Homologação runtime da Sprint 1.2** segue pendente (só baseline rodado).

---

**Fim do relatório — Fase 3 (relatórios por terminal) concluída.**
