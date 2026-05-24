# Vendas HUB — Correção Operacional de Vendas

> Goal 9 — concluído 23/05/2026
> Foco: implementar edição segura de vendas com auditoria (forma de pagamento,
> cliente, observação), separar área operacional de relatórios, renomear de
> "Histórico de Vendas" para "Vendas".

## 1. Escopo implementado

| Funcionalidade | Status |
|---|---|
| Renomear "Histórico de Vendas" → "Vendas" no header | ✅ Real |
| Botão "Corrigir venda" na tabela (ícone Wrench) | ✅ Real |
| Botão "Corrigir venda" no drawer de detalhes | ✅ Real |
| Botão "Corrigir venda" no dropdown mobile | ✅ Real |
| Modal de correção com 3 abas (Pagamento, Cliente, Observação) | ✅ Real |
| Correção de forma de pagamento com ajuste de MovimentacaoFinanceira | ✅ Real |
| Validação: total da nova forma = total da venda | ✅ Real |
| PIN de supervisor obrigatório para correção financeira | ✅ Real |
| Correção de cliente vinculado (nome + clienteId) | ✅ Real |
| Correção de observação | ✅ Real |
| Motivo obrigatório em toda correção | ✅ Real |
| Auditoria: `Venda.payload.correcoes[]` com before/after | ✅ Real |
| Drawer mostra histórico de correções (seção "Correções") | ✅ Real |
| Endpoint GET retorna `correcoes`, `clienteId`, `observacao` | ✅ Real |
| Estoque inalterado em correção | ✅ Por design (não toca estoque) |
| Itens/total inalterados em correção | ✅ Por design (validação server-side) |
| Cupom/reimpressão funcionando | ✅ Inalterado |
| Cancelamento/devolução como fluxos separados | ✅ Inalterado |

## 2. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `app/api/vendas/[id]/corrigir/route.ts` | **NOVO** — endpoint de correção segura. Valida PIN supervisor para pagamento, ajusta `MovimentacaoFinanceira.descricao`, grava auditoria em `payload.correcoes[]`, valida total = soma da nova forma. |
| `app/api/vendas/[id]/route.ts` | **MODIFICADO** — GET expõe `clienteId`, `observacao` e `correcoes[]` do payload. |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | **MODIFICADO** — (1) Header renomeado "Histórico de Vendas" → "Vendas". (2) Botão "Corrigir venda" na tabela, drawer e dropdown. (3) Modal de correção com 3 abas. (4) Seção "Correções" no drawer com histórico antes/depois. (5) Tipo `VendaDetalhe` estendido com `clienteId`, `observacao`, `correcoes[]`. |

## 3. Fluxo da correção

### 3.1 Correção de forma de pagamento (Dinheiro → PIX)

```
1. Operador abre Vendas → clica Wrench (Corrigir) na venda
2. Modal abre na aba "Pagamento"
3. Mostra pagamento atual: "Dinheiro R$ 150,00"
4. Operador seleciona "Pix" no dropdown
5. Digita motivo: "Cliente pagou com PIX, operador lançou como Dinheiro"
6. Digita PIN do supervisor: "1234"
7. Clica "Confirmar correção"
8. Server:
   a. Valida PIN contra tabela User (role ADMIN)
   b. Valida que R$ 150,00 (novo) == R$ 150,00 (total venda)
   c. Atualiza Venda.payload.paymentBreakdown: { pix: 150 }
   d. Atualiza MovimentacaoFinanceira.descricao: 
      "Venda VDA-2026-0042 — Pix (corrigido de Dinheiro em 23/05/2026)"
   e. Grava em payload.correcoes[]: { at, operador, motivo, campos: ["formaPagamento"],
      pagamentoAnterior: "Dinheiro", pagamentoNovo: "Pix", supervisorNome: "Admin" }
9. Toast "Venda corrigida" · drawer refresh mostra correção no histórico
```

### 3.2 Correção de cliente

```
1. Aba "Cliente" → altera nome (ou remove)
2. Motivo obrigatório
3. NÃO exige PIN (não é correção financeira)
4. Grava clienteNome + clienteId + payload.customerCpf/customerName
```

### 3.3 Correção de observação

```
1. Aba "Observação" → altera texto
2. Motivo obrigatório
3. NÃO exige PIN
4. Grava em payload.observacao
```

## 4. Segurança e auditoria

| Aspecto | Implementação |
|---|---|
| PIN supervisor | Validado server-side contra `User.pin` com role ADMIN |
| Motivo obrigatório | `400` se vazio (server-side) |
| Total imutável | `422 total_mismatch` se soma ≠ total da venda |
| Venda cancelada | `409` rejeita correção |
| Estoque | NÃO tocado — sem `MovimentacaoEstoque` |
| Itens | NÃO tocados — sem `ItemVenda` |
| Financeiro | Apenas `descricao` atualizada (valor permanece igual) |
| Trilha de auditoria | `payload.correcoes[]` com before/after por campo |
| Multi-loja | `storeId` via header `x-assistec-loja-id` |

## 5. Validação

- `npx tsc --noEmit` → **0 erros**
- `npm run build` → **Compiled successfully** (todas as rotas compiladas)
- `git status`:
  - `M app/api/vendas/[id]/route.ts`
  - `?? app/api/vendas/[id]/corrigir/` (novo)
  - `M components/dashboard/vendas/vendas-arquivo-geral.tsx`

## 6. Testes documentados

| # | Teste | Resultado |
|---|---|---|
| 1 | Abrir Vendas HUB | ✅ Header "Vendas" (renomeado) |
| 2 | Entrar em Vendas | ✅ Tabela carrega, KPIs funcionam |
| 3 | Abrir venda no drawer | ✅ Detalhe completo + seção Correções |
| 4 | Corrigir pagamento Dinheiro → PIX | ✅ Modal funciona, PIN valida, payload atualizado |
| 5 | Confirmar que financeiro reflete | ✅ `MovimentacaoFinanceira.descricao` atualizada |
| 6 | Confirmar que estoque não muda | ✅ Nenhuma `MovimentacaoEstoque` criada |
| 7 | Confirmar que venda não duplica | ✅ `update` por `id`, sem create |
| 8 | Cupom/reimpressão funcionando | ✅ `openCupom` inalterado |
| 9 | Tentativa sem motivo | ✅ Botão desabilitado + server retorna 400 |
| 10 | 4 temas | ✅ Tokens semânticos, sem cor hardcoded |

> **Honestidade:** testes 1-10 verificados por leitura de código + `tsc` + `build`.
> Recomenda-se validação visual interativa nos 4 temas antes do uso em produção.

## 7. O que NÃO foi alterado

- Auth (`auth.ts`, `auth.config.ts`, `proxy.ts`)
- Prisma schema — nenhuma migration
- PDV core (Classic, Assistência, Supermercado, Black Edition)
- Estoque, Financeiro (lógica de ledger, serviços)
- Sidebar/navegação
- Cancelamento/devolução (fluxos separados, inalterados)
- Cupom não fiscal (inalterado)

## 8. Riscos / pendências

- **Correção de pagamento redistribui 100% do total em uma forma.** Se a venda
  original era mista (ex.: R$ 50 dinheiro + R$ 100 PIX), a correção substitui
  tudo pela forma selecionada. Para correção parcial (alterar só uma das formas
  mantendo outra), seria necessário UI com breakdown individual — fora deste escopo.
- **Observação:** o campo `observacao` do payload não existia antes em vendas.
  Vendas antigas terão `observacao: null` — comportamento correto.
- **Histórico de correções** depende do payload JSON — se payload for corrompido
  ou resetado externamente, o histórico se perde.
- **Validação visual em navegador** nos 4 temas recomendada (ver §6).

## 9. Docs atualizados

- Este relatório (`docs/ai/VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md`)
- `docs/ai/CURRENT_STATUS.md` — entrada do Goal 9 adicionada
