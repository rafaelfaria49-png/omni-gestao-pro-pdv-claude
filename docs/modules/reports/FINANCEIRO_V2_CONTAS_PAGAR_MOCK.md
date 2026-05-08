# Financeiro HUB V2 — Aba “A pagar” (mock/local state)

## Objetivo

Ativar a aba **“A pagar”** no `/dashboard/financeiro-v2` com **CRUD e fluxos completos em memória (mock/local state)**, sem Prisma, sem backend real, sem integrar OS/PDV/Estoque e **sem alterar o padrão visual/tokens/tema** já normalizado.

## O que foi implementado

- **Nova conta (modal completo)**
  - Criação de conta a pagar em memória.
  - Suporte a **despesa fixa** (flag visual).
  - Suporte a **parcelamento**:
    - quantidade de parcelas (2–36)
    - intervalo (dias)
    - **prévia visual** das parcelas no modal
    - geração de N contas (cada parcela vira uma linha) com vínculo de grupo.

- **Editar conta**
  - Ação “Editar” abre o mesmo modal em modo edição.
  - Atualiza dados principais (fornecedor, descrição, categoria, valor, vencimento, flags de fixa/parcelamento) em memória.

- **Excluir conta**
  - Remove a conta da lista em memória.

- **Marcar como paga**
  - Botão “Marcar como paga” quita imediatamente a conta (pago = valor).

- **Baixa parcial (pagamento parcial)**
  - Modal “Registrar pagamento” permite “Pagamento parcial” e registra valor pago.
  - Status passa a **parcial** quando \(0 < pago < valor\).

- **Exibir pago e restante**
  - Tabela mostra **valor**, **pago** e **restante** por conta.

- **Histórico visual (pagamentos/baixas/estornos)**
  - Modal de histórico agora é alimentado por eventos reais do mock:
    - criação
    - pagamento (total/parcial)
    - estorno

- **Filtros por status**
  - Todos, pendente, atrasado, **parcial**, pago.

- **Cards/indicadores**
  - Em aberto (soma dos saldos restantes)
  - Vencidas (soma do restante em atraso)
  - Pagas no mês (mock simplificado: total pago das contas com status “pago”)
  - Fixas (quantidade)
  - Parceladas (quantidade de contas com `parcelasTotal > 1`)
  - Baixas parciais (quantidade com status “parcial”)

## Arquivos alterados

- `components/financeiro/lovable/routes/financeiro.tsx`
- `docs/FINANCEIRO_V2_CONTAS_PAGAR_MOCK.md` (este arquivo)

## Modelo de dados (mock)

Dentro de `financeiro.tsx`, `ContaPagar` foi estendido para suportar:

- `status`: `"pendente" | "atrasado" | "parcial" | "pago"`
- `pago` e cálculo de `restante`
- `fixa` (boolean)
- `parcelasTotal`, `parcelaIndex`, `grupoParcelasId` (parcelamento)
- `pagamentos[]` (histórico de criação/pagamento/estorno)

## O que ainda está mockado (por design nesta etapa)

- Persistência real (backend/Prisma) e conciliação bancária.
- Integração com carteiras reais (debitar carteira ao pagar).
- “Pagas no mês” é uma aproximação mock (sem competência real por data de pagamento).
- Edição de “grupo de parcelas” em cascata (a edição atual é por linha/parcela).

## Validação

- `npm run lint` (passa com warnings já existentes no repo; **sem erros**)
- `npx tsc --noEmit` (**OK**)
- `npx next build --webpack` (**OK**)

## Próximos passos ideais (quando for integrar backend)

- Persistir contas/pagamentos no backend (com `storeId` e auditoria).
- Registrar pagamentos vinculando **carteira origem** e gerando movimento financeiro.
- Implementar competência real (pagas no mês por data de pagamento/baixa).
- Operações em lote por grupo de parcelas (editar/baixar/estornar o grupo).

