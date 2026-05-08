# Financeiro HUB V2 — Aba “A receber” (mock/local state)

## Objetivo

Ativar a aba **“A receber”** no `/dashboard/financeiro-v2` com **estado local em memória** (mock/runtime), sem Prisma, sem backend real e **sem alterar tokens/tema/layout global**. Mantendo o mesmo padrão visual/estrutural usado em **“Carteiras”** e **“A pagar”**.

## O que ficou funcional (mock/local state)

- **Estado local (runtime)**
  - Lista de títulos a receber em memória via `useState`.
  - Sem API e sem persistência em banco.

- **Novo recebimento (modal completo)**
  - Campos: cliente, descrição, categoria, valor, vencimento, forma de recebimento, carteira destino (visual), **recorrente/fixa**, **parcelamento**, observações.
  - Validação mínima (cliente + valor + vencimento).

- **Parcelamento**
  - Quantidade (2–36) e intervalo (dias).
  - **Preview visual** antes de salvar.
  - Geração automática de N linhas (cada parcela vira um título) com vínculo de grupo.

- **Ações**
  - **Editar** (mesmo modal em modo edição).
  - **Excluir** (remove da lista em memória).
  - **Marcar como recebido** (quita o restante imediatamente).
  - **Baixa parcial** (via modal “Receber conta”).
  - **Estorno** (zera recebido e volta status).

- **Histórico local**
  - Eventos reais em memória:
    - criação
    - recebimento total
    - recebimento parcial
    - estorno
    - edição
  - Modal “Histórico” renderiza estes eventos.

- **Indicadores**
  - Total em aberto
  - Recebidos no mês (mock por eventos do mês corrente)
  - Vencidos
  - Parciais
  - Recorrentes
  - Parcelados

- **Filtros**
  - Todos, pendente, vencido/atrasado, parcial, recebido/pago.

## Arquivos alterados

- `components/financeiro/lovable/routes/financeiro.tsx`
- `docs/FINANCEIRO_V2_CONTAS_RECEBER_MOCK.md` (este arquivo)

## Modelo de dados (mock)

O tipo `ContaReceber` foi estendido para suportar:

- `descricao`, `categoria`
- `recorrente` (boolean)
- `parcelasTotal`, `parcelaIndex`, `grupoParcelasId`
- `eventos[]` (histórico local: criação/recebimento/estorno/edição)
- `status` efetivo calculado por:
  - pago quando `recebido >= valor`
  - parcial quando `0 < recebido < valor`
  - atrasado quando `venc < hoje` e não recebido

## O que ainda está mockado (por design nesta etapa)

- Persistência real e integrações (OS/PDV/Estoque/automação).
- Movimentação real de carteira ao receber (apenas campos visuais).
- Recorrência real (agendamento/geração automática por período).
- Emissão/armazenamento real de recibo (modal permanece demonstrativo).

## Validação obrigatória

- `npm run lint` (**OK**; warnings remanescentes do repo)
- `npx tsc --noEmit` (**OK**)
- `npx next build --webpack` (**OK**)

## Warnings remanescentes

O `npm run lint` segue reportando **warnings preexistentes** no repositório (ex.: regras do Next sobre `<img>` e deps de hooks), sem erros bloqueantes nesta etapa.

