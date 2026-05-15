# Decisão: Rota Oficial de Operações de Serviço

**Data:** 2026-05-15  
**Autor:** Rafael Faria  
**Status:** ✅ Decidido

---

## Decisão

A rota oficial de Ordens de Serviço é **`/dashboard/operacoes-v2`** (Operações HUB V2).

A rota legada **`/dashboard/os`** é **preterida** — o código permanece no repositório mas o acesso via sidebar está desabilitado.

---

## Justificativa

| Critério | HUB V2 (`/dashboard/operacoes-v2`) | Legado (`/dashboard/os`) |
|---|---|---|
| Pipeline de status | Granular (8+ estados) com camada de compatibilidade Prisma | Enum simplificado (4 estados) |
| Adapters reais | Estoque (baixa na entrega, idempotente) + Financeiro (faturamento → ContaReceberTitulo) | Parcialmente integrado |
| Anexos | IndexedDB (`local-idb://`) + timeline | Upload ad-hoc |
| Orçamento aprovado | Política de revisão com histórico auditável | Sem auditoria de revisão |
| Peças com `produtoId` | Normalização para Prisma `Produto.id` | Não implementado |
| Arquitetura | Lovable isolado + Server Actions em `app/actions/operacoes.ts` | Componentes legados mistos |

---

## Impacto no Sidebar

O **novo sidebar** (`components/painel-inicial/Sidebar.tsx`) já expõe apenas:

- **Operações HUB** → `/dashboard/operacoes-v2` · badge `Oficial`

Não há link para `/dashboard/os`. O sidebar legado (`components/dashboard/sidebar.tsx`) é arquivo órfão (sem importadores) e não precisa de alteração.

---

## O que NÃO foi feito

- A rota `/dashboard/os` e seus componentes **não foram deletados** — podem ser consultados como referência.
- Não há redirect automático de `/dashboard/os` → `/dashboard/operacoes-v2` nesta fase.

---

## Próximos passos vinculados

- Integrar `osStore` (mock) com Prisma/Supabase no HUB V2
- Expandir schema: `Garantia`, `Anexo`, `OrcamentoItem` como tabelas dedicadas
- Alinhar enum Prisma com pipeline rico do HUB V2
