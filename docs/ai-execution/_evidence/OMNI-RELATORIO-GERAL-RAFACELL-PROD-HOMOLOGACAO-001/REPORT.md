# OMNI-RELATORIO-GERAL-RAFACELL-PROD-HOMOLOGACAO-001 — Homologação do Relatório Geral (RAFACELL / loja-1)

Data: 2026-11-21. Auditado: `main` `09e9764d0d616fe15d79c6b793ee948e0c4abc45` (PR #381), projeto Vercel
`omni-gestao-pro`, deployment Production `omni-gestao-19iz11dx8…` **Ready** (GitHub deployment 7958139467 = success).

## Método e garantias de leitura

- Banco `omnigestao_prod` acessado com `default_transaction_read_only=on` **imposto pelo servidor** (psql via `PGOPTIONS`;
  Prisma via `options=-c default_transaction_read_only=on`). Guard: `current_database()='omnigestao_prod'` e
  `default_transaction_read_only='on'` conferidos antes de cada execução. Fingerprint: 11 lojas, 2.618 vendas, última 2026-11-20.
- O relatório foi gerado pela **própria função de produção** (`buildReport(…, "geral", "loja-1", …)`, transação
  `READ ONLY` + `REPEATABLE READ`), e cada número foi recalculado por SQL independente.
- Nenhuma escrita, venda, pagamento, estorno, migration ou índice. Nenhum dado de cliente nesta evidência.
- Interface autenticada em Production **não testada**: o navegador do app não tinha sessão (redireciona para `/login`)
  e senha não é digitada por IA. Ver pendências.

## Caso obrigatório — VDA-L01-2026-000626 (DESOXIDAÇÃO, R$ 100, dinheiro)

| Pergunta | Resultado comprovado |
|---|---|
| a) inventoryId persistido | `__servico__cmtkxb7dk0001la04utv8rhkb` (1 linha, qtd 1, R$ 100). O id existe em `servicos` da loja-1 (nome gravado "DESOXIDAÇAÕ", com erro de digitação no cadastro). |
| b) serviço rápido? | Sim — prefixo atual `__servico__` (`isServicoSaleLine`). Não é avulso nem produto (nenhum `Produto` com esse id/sku). |
| c) Serviços ou Produtos? | **Serviços** — rastreio `geral?source=venda:VDA-L01-2026-000626` mostra a linha como "Serviços"; filtro `tipo:servico` lista a venda. |
| d) faturamento total | Entra em Vendas do período (R$ 4.872,89) e em "Serviços" (R$ 410,00 / 6 vendas em outubro). |
| e) recebimento único | 1 movimento `entrada/venda` R$ 100 (`referenciaId` = pedido), 30/10 19:59 BRT. Nenhum título, nenhum `caixa_operacoes`, contado uma vez como "Vendas à vista (PDV)". |
| f) vínculo com OS | Nenhum: sem `payload.origem`, sem linha `__os_*`, nenhuma OS referencia a venda. |

Contratos de linha em outubro: `__servico__` 6 linhas (R$ 410), `__avulso__` 22 (R$ 399,77), `__avulso__svc-` 0,
`__os_servico__/__os_pecas__` 0, produtos 121 linhas. Nenhum produto da loja tem categoria "Serviços"; nenhuma venda
classificada como serviço sem o prefixo virtual.

## Homologação comercial — outubro/2026 (BRT)

| Item | Relatório | SQL independente | Situação |
|---|---|---|---|
| Vendas concluídas | 124 / R$ 4.872,89 | 124 / R$ 4.872,89 | OK |
| Canceladas | 1 / R$ 39,99 (fora dos totais) | idem | OK |
| Devoluções / estornos de devolução | 0 | 0 | OK |
| Ajuste geral não rateado | −R$ 80,09 | total − linhas | OK |
| Produtos | R$ 4.143,21 → **R$ 2.438,21** após correção | — | ver P1-B |
| Acessórios | R$ 0 → **R$ 1.705,00** após correção | — | ver P1-B |
| Aparelhos com IMEI | 0 (nenhum `AparelhoVenda` no mês) | 0 | OK |
| Serviços rápidos (PDV) | R$ 410,00 (6) | R$ 410,00 | OK |
| OS faturada no PDV | R$ 0 | 0 linhas `__os_*` | OK |
| À vista comprovado (ledger) | R$ 4.309,99 | = soma das sessões de caixa 02/10–30/10 (`totalVendasServer`) | OK |
| A prazo comprovado (títulos) | R$ 562,90 | 4.309,99 + 562,90 = 4.872,89 | OK |

Formas declaradas: dinheiro 1.742,43 · PIX 924,75 · débito 1.050,95 · crédito 591,86 · a prazo 562,90.

## Conciliação financeira — outubro/2026

- Recebimentos líquidos R$ 5.934,79 = vendas à vista no ledger 4.349,98 (122, inclui a cancelada) + títulos de OS
  1.530,00 (5) + parcelas de vendas anteriores 94,80 (2) − estorno de cancelamento 39,99. Bate com o Fluxo de Caixa
  (entradas 5.974,78, saídas 39,99, saldo 59.092,73 → 65.027,52).
- Caixa (`recebimento_cr`) R$ 1.624,80 = ledger de títulos R$ 1.624,80 (mesmo fato, não somado).
- Pagamentos efetivos: R$ 0 (nenhuma saída `pagar*` no mês). Contas a pagar: 5 títulos abertos R$ 3.204,05, todos
  importados em 20/05 e sem categoria. Sem compras de estoque, sangrias, suprimentos ou transferências no mês.
- OS × PDV: nenhuma OS faturada no PDV; recebimento de OS só pelo título → sem duplicidade.
- Faturamento e recebimentos nunca são somados (competência × caixa lado a lado).
- **Conferência: 14/14 OK** em outubro e em 01–20/11.

## Problemas encontrados

### P1-A — Vencimento `dd/mm/aaaa` tornava todo título a prazo "sem saldo comprovado" (CORRIGIDO na PR)
- Reprodução: em Production, os 20 títulos `pdv-aprazo-*` em aberto apareciam como "sem saldo comprovado", e o
  **Saldo devedor total, Vencido e Vence no período ficavam Indisponíveis**, em qualquer período.
- Causa raiz: `ops-upsert-venda.ts` grava `vencimento` com `toLocaleDateString("pt-BR")` (`dd/mm/aaaa`). O contrato
  do Financeiro (`parseDateStringSafe`) aceita esse formato. O CTE `titleCtes` (`lib/relatorios/finance.ts`) só aceitava
  ISO. Na loja-1, 34 títulos a receber estão em `dd/mm/aaaa`; em todo o banco, 85. Afeta também o Fluxo de Caixa (previsão
  e vencidos).
- Correção: `dia` aceita também `dd/mm/aaaa` com validação de calendário (data impossível continua sem comprovação).
- Efeito real (outubro, Production, código corrigido): saldo a receber **R$ 5.470,62** (OS 805,00 · a prazo PDV
  1.018,14 · importados não classificados 3.647,48), vencido 5.135,98, vence no período 235,00, 0 sem comprovação.
  O Fluxo de Caixa reporta a mesma previsão de entrada (235,00).

### P1-B — Acessório configurado no produto era classificado como "Produtos" (CORRIGIDO na PR)
- A regra só usava a palavra "acess" na categoria. As categorias da RAFACELL são texto livre ("Peliculas",
  "Capinha silicone", "Cabos de celular"…), e `categorias_produto` da loja está vazia. Resultado: 0 acessórios.
- Prova estrutural existente: `Produto.metadata.acessorios` (v1, contrato de `lib/acessorios`), usada pelo PDV para
  pedir modelo e cor. 5 produtos da loja têm essa configuração (películas e capinhas mais vendidas).
- Correção: `metadata.acessorios.version = 1` → Acessório, antes da regra por categoria. Sem heurística nova de nomes.
- Efeito: outubro, acessórios R$ 1.705,00 (54 vendas); novembro, R$ 1.160,00.
- Limite remanescente: cabos, carregadores e fones **sem** configuração de acessório continuam em Produtos. Resolver
  no cadastro (configurar como acessório) ou com decisão de produto, não por adivinhação de nomes.

### P3 — Históricos (não corrigidos, só registro)
- 245 vendas importadas (fev–abr/2026, `pedidoId` numérico 1–245) sem linhas e sem formas de pagamento → no acumulado
  do ano, "Venda sem pagamento comprovado" 245 / R$ 16.741,56 e "sem formas gravadas" 245, além de ajuste não rateado.
  Legado de importação; o relatório aponta corretamente.
- 30 recebimentos `receber` de 11/05/2026 (lote de ~3 s) apontam para títulos inexistentes na loja → "Recebimento sem
  título" R$ 7.325,92. Os títulos não existem em nenhuma loja, nem como OS ou conta a pagar. Proposta: investigar a
  origem do lote (importação/backfill) antes de qualquer reconciliação. Nada foi alterado.
- 1 devolução (22/05, R$ 60) de venda com numeração antiga não localizada.
- 12 títulos importados `imp-gc:*` em aberto (R$ 3.647,48) aparecem como "Não classificado": a origem não é comprovada.
- Venda de teste `VDA-TEST-STOCK-…` (R$ 9.999, 27/05, cancelada e estornada) presente em Production.
- 2 sangrias idênticas de R$ 132,99 com 100 ms de diferença (15/06): possível clique duplo (fora do período).
- UX: no CSV, a coluna "Saldo em aberto" mostra "Indisponível" para linhas de venda e movimento, onde ela não se aplica.

## Exportações, limites e desempenho (código corrigido, Production, a partir da máquina local)

| Recorte | Registros | Tempo |
|---|---|---|
| Outubro (tela) | 294 | 0,87 s |
| 01–20/11 (tela) | 263 | 0,52 s |
| 01/01–20/11 (tela) | 2.771 | 2,05 s |
| Outubro CSV | 294 linhas de detalhe, 47 KB | 0,55 s |
| Outubro PDF | 9 páginas, "Página 9/9", 76 KB | 0,53 s |
| 01/01–20/11 CSV | 2.771, 366 KB | 2,62 s |
| Rastreio de uma venda | 3 vínculos | 0,11 s |

Meta < 12 s por consulta e < 30 s por transação: **atendida** com folga. O histórico inteiro da loja fica abaixo de
5.000 registros, então a recusa 422 não é alcançável com dado real; ela é coberta pelo teste sintético. CSV/PDF sem CPF,
telefone, e-mail ou nome de cliente (as descrições livres do ledger não são exportadas).

## Validação da correção

- PostgreSQL 17 descartável (`scripts/relatorios/run-local-qa.mjs`): **42/42**, incluindo o novo teste de regressão.
- Mutação: com `finance.ts` original o teste falha (`receivableUnknown` 2 ≠ 0); com `geral.ts` original falha
  (sem linha de Acessórios).
- Vitest de relatórios sem `.pg`: 80/80. `npm run typecheck`: 0 erros. ESLint dos arquivos alterados: limpo.

## Pendências humanas

1. Entrar em Production no navegador para homologar a interface: cards, filtros, links, responsividade, CSV/PDF pelo
   botão e um perfil sem Financeiro (card oculto, API 403).
2. Revisar e decidir o merge da PR corretiva (draft).
3. Decidir sobre os históricos P3 (lote de 11/05, vendas importadas, venda de teste). Nenhuma reconciliação foi executada.
4. Configurar como acessório (Cadastros) os cabos, carregadores e fones que devem aparecer em Acessórios.
