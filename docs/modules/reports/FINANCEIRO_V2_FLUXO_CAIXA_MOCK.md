# Financeiro HUB V2 — Aba “Fluxo de Caixa” (mock/local state) + modularização segura

## Objetivo

Ativar a aba **“Fluxo de Caixa”** no Financeiro HUB V2 com **dados mock/local state**, sem Prisma/backend e sem alterar tokens/tema/layout global, mantendo o mesmo padrão já usado em **Carteiras**, **A pagar** e **A receber**.

## O que foi implementado (Fluxo de Caixa)

- **Linha do tempo financeira (consolidada)**
  - Lançamentos mock incluindo: entradas, saídas, recebimentos (previstos), pagamentos (previstos), transferências, estornos e saldo inicial consolidado.

- **Indicadores**
  - Saldo atual consolidado (mock)
  - Entradas do período
  - Saídas do período
  - Resultado líquido
  - Contas vencidas (mock sobre previstos)
  - Recebimentos previstos
  - Pagamentos previstos

- **Filtros (estado local)**
  - Período: hoje, 7 dias, 30 dias, mês atual, personalizado (mock)
  - Tipo: todos, entrada, saída, transferência, recebimento, pagamento, estorno
  - Carteira
  - Categoria

- **Agrupamento visual por dia**
  - Hoje, Ontem, Esta semana, Datas anteriores

- **Saldo acumulado por linha**
  - Cada lançamento exibe “saldo após” (mock) calculado sobre os itens filtrados em ordem cronológica.

- **Ações**
  - **Ver detalhes**: abre modal com informações do lançamento + saldo após
  - **Duplicar lançamento**: cria um lançamento novo no topo (data de hoje)
  - **Estornar**: marca o lançamento original como estornado e cria um lançamento inverso do tipo “estorno”

- **Gráfico simples**
  - Gráfico de barras (Recharts **já existente no projeto**, sem lib nova) com entradas vs saídas agregadas por dia, usando tokens (`var(--color-*)`).

- **Resumo por carteira**
  - Cards por carteira mostrando: saldo inicial (seed), entradas, saídas e saldo atual (mock).

## Como o mock foi feito

- O Fluxo de Caixa **não depende** do backend.
- Ele inicializa seu estado local (`useState`) a partir de **seeds seguras** disponíveis no próprio `financeiro.tsx`:
  - `carteiras` (saldo inicial)
  - `movimentacoes` (entradas/saídas básicas)
  - `receber` e `pagar` (geram eventos previstos/confirmados apenas como visual)

Observação importante: nesta etapa, o Fluxo de Caixa **não está ligado ao estado “vivo”** das abas “Carteiras/A pagar/A receber” (porque esses estados estão isolados por aba e não foi feito lift de estado para não arriscar refatoração ampla). O objetivo aqui é **ativação incremental com segurança**.

## Modularização segura (mínima)

O arquivo `components/financeiro/lovable/routes/financeiro.tsx` está grande (≈ 3k+ linhas). Para reduzir risco e manter manutenibilidade:

- Foi criada uma estrutura mínima e isolada apenas para o que é novo do Fluxo de Caixa:

`components/financeiro/lovable/financeiro-v2/`
- `tabs/FluxoCaixaTab.tsx`
- `modals/MovimentoDetalhesModal.tsx`
- `utils/fluxo-caixa-utils.ts`
- `types.ts`

Nenhuma aba antiga foi movida/refatorada.

## Arquivos alterados/criados

- **Alterado**
  - `components/financeiro/lovable/routes/financeiro.tsx` (passou a renderizar `FluxoCaixaTab` na aba)

- **Criados**
  - `components/financeiro/lovable/financeiro-v2/types.ts`
  - `components/financeiro/lovable/financeiro-v2/utils/fluxo-caixa-utils.ts`
  - `components/financeiro/lovable/financeiro-v2/modals/MovimentoDetalhesModal.tsx`
  - `components/financeiro/lovable/financeiro-v2/tabs/FluxoCaixaTab.tsx`
  - `docs/FINANCEIRO_V2_FLUXO_CAIXA_MOCK.md` (este arquivo)

## Próximos passos ideais

- (Quando for seguro) criar um “store” local do Financeiro V2 (context/zustand) para compartilhar estados entre abas sem backend.
- Ligar Fluxo de Caixa aos eventos reais gerados por:
  - baixas/estornos em “A receber”
  - pagamentos/estornos em “A pagar”
  - movimentações/transferências em “Carteiras”
- Persistência futura (backend) com auditoria e `storeId`.

