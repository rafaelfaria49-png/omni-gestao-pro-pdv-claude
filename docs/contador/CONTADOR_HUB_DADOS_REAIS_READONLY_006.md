---
title: Contador HUB — Dados Reais (read-only) · GOAL 006
goal: CONTADOR-HUB-DADOS-REAIS-READONLY-006
status: entregue
base: origin/main = 50c1db8 (contém GOAL 004 = 066e9f2 · GOAL 005 = 50c1db8)
branch: goal/contador-006-dados-reais
escopo: auditoria de fontes + readers Prisma read-only + realificação parcial (Visão Geral + Relatórios básicos)
last_update: 2026-07-15
---

# Contador HUB · Dados Reais (read-only) — GOAL 006

Primeira integração do **Contador HUB interno** (`/dashboard/contador?c=AAAA-MM`) com
dados reais de produção. **Estritamente read-only.** Nenhuma escrita, nenhuma consulta
fiscal (NotaFiscal permanece atrás de `CONTADOR_FISCAL_READER`), nenhuma exportação, nenhum
pacote ZIP, nenhum fechamento persistido.

## 1. Auditoria das fontes (Prisma · `origin/main` = 50c1db8)

Todas as tabelas têm `storeId`. Toda leitura é escopada por loja e filtrada por competência.

| Métrica | Fonte canônica | Campo de data | Regra temporal | Observação |
|---|---|---|---|---|
| Faturamento (vendas) | `Venda.total` | `Venda.at` (DateTime) | `[inicio, fimExclusivo)` UTC | autoritativo; exclui `status="cancelada"` |
| Cancelamentos | `Venda.status` / `canceladaEm` | `Venda.at` | idem | informativo; fora do faturamento |
| Devoluções | `DevolucaoVenda.valorTotal` | `DevolucaoVenda.at` | idem | reduz a competência da devolução |
| Forma de pagamento | `Venda.payload.paymentBreakdown` | — | (herda da venda) | **só no payload JSON**; parser defensivo |
| Desconto | `Venda.payload.discountTotal` | — | (herda da venda) | **só no payload**; informativo/parcial |
| Entradas realizadas | `MovimentacaoFinanceira` (`tipo="entrada"`) | `createdAt` | `[inicio, fimExclusivo)` UTC | exclui transferência/estorno |
| Saídas realizadas | `MovimentacaoFinanceira` (`tipo="saida"`) | `createdAt` | idem | exclui transferência/estorno |
| Estornos | `MovimentacaoFinanceira` (origem estorno) | `createdAt` | idem | classificado à parte |
| Títulos a receber (aberto) | `ContaReceberTitulo` (status aberto) | `vencimento` (String) | ano/mês da competência (data-parede) | posição na competência |
| Títulos a pagar (aberto) | `ContaPagarTitulo` (status aberto) | `vencimento` (String) | ano/mês da competência (data-parede) | posição na competência |
| Sessões de caixa | `SessaoCaixa` | `abertaEm` | `[inicio, fimExclusivo)` UTC | caixa físico ≠ contábil |
| Sangrias / suprimentos | `CaixaOperacao` (`tipo`) | `at` | idem | — |
| Diferenças de caixa | `SessaoCaixa.saldoContado − saldoFinal` | `abertaEm` | idem | só sessões fechadas conferidas |
| **Nota Fiscal** | — | — | — | **indisponível nesta fase** (`CONTADOR_FISCAL_READER`) |

**Base herdada:** `lib/contador/competencia.ts` (GOAL 005) fornece `resolvePeriodoUtc`,
tz `America/Sao_Paulo`, período semiaberto e `resolveCompetenciaFromSearchParam`.
`lib/contador-aggregates.ts` é o agregador **legado client-side** do portal externo
(`SaleRecord` em memória) — **não** foi usado como reader real.

**ACL herdada (GOAL 004):** `auth()` → cookie de loja ativa → `canAccessStore(session, storeId)`.
Reusada em `lib/contador/scope.ts` (avaliação pura em `scope-core.ts`, testada cross-store).

## 2. Decisões de negócio (congeladas pelo usuário)

1. **Faturamento e OS** — fonte = `Venda`. Exclui canceladas. **OS não é somada** ao
   faturamento (recebimento de OS que gera Venda já é a Venda). Não somar `Venda + OS`.
   Risco de dupla contagem Venda × OS × movimentação documentado; OS fica fora dos KPIs.
2. **Realizados × títulos** — realizados = `MovimentacaoFinanceira`; títulos abertos =
   `Conta*Titulo`. **Não** somar movimentação + título pago. Transferências entre carteiras
   não são receita/despesa. Estornos à parte. Posição de títulos = títulos abertos com
   vencimento na competência.
3. **Desconto** — `Venda.payload.discountTotal`, só quando numericamente confiável. Vendas
   sem o campo → métrica **parcial** (nunca 0 assumido). **Não** subtrai de `Venda.total`.
   Cobertura (com/sem desconto identificado) é registrada.
4. **Forma de pagamento** — `Venda.payload.paymentBreakdown`, parser defensivo. Payload
   ausente/inválido → **"não identificado"** (quantidade e valor reportados). Não usa
   `MovimentacaoFinanceira` para quebrar a mesma venda.
5. **Devolução** — `DevolucaoVenda.valorTotal`/`at`. Reduz a competência em que **ocorreu**
   (não retroage). `Venda.total` **não** é reduzido pelo reader. Líquido =
   `vendas − devoluções` (subtração **única**; sem dupla subtração).

## 3. Gate de honestidade

`lib/contador/readers/tipos.ts` — `DisponibilidadeDado = "real" | "parcial" | "indisponivel"`,
`DadoMonetario`, `DadoNumerico`. Cada métrica carrega `valor | null`, `disponibilidade`,
`fonte` e `observacao`. **Dado sem fonte confiável → `indisponivel` com `valor: null`**,
nunca zero silencioso. `montarDados` deriva **alertas de qualidade** (vendas sem forma de
pagamento, cobertura de desconto parcial, títulos sem vencimento reconhecível, diferença de
caixa indisponível, fonte fiscal indisponível).

## 4. Arquitetura entregue

- `lib/contador/readers/tipos.ts` — contratos de honestidade + DTO `ContadorDadosReais`.
- `lib/contador/readers/vendas.ts` — `agregarVendas` (puro): total, canceladas, forma de
  pagamento, cobertura de desconto.
- `lib/contador/readers/devolucoes.ts` — `agregarDevolucoes` (puro).
- `lib/contador/readers/financeiro.ts` — `agregarFinanceiro` (puro) + `parseVencimento`.
- `lib/contador/readers/caixa.ts` — `agregarCaixa` (puro).
- `lib/contador/readers/index.ts` — `montarDados` (puro) + `carregarFontes` (IO Prisma
  read-only, `Promise.all`) + `construirDadosContador`.
- `lib/contador/scope-core.ts` / `scope.ts` — escopo + ACL multi-loja.
- `components/dashboard/contador/contador-dados-reais.tsx` — UI honesta (Visão Geral +
  Relatórios básicos), selos de disponibilidade, estado de indisponibilidade.
- `app/dashboard/contador/page.tsx` — server component: resolve escopo + competência,
  carrega DTO, passa `realData`/`realErro`. Falha → estado honesto, nunca zero.
- `components/dashboard/contador/contador-hub-preview.tsx` — injeta os blocos reais em
  Visão Geral e Relatórios; demais seções seguem preview honesto.

**Testes:** `vendas.test.ts`, `financeiro.test.ts`, `caixa.test.ts`, `index.test.ts`
(agregação, dupla contagem, honestidade) e `scope-core.test.ts` (ACL cross-store).

## 5. Fora de escopo (preservado)

Exportação, pacote ZIP, fechamento persistido, documentos, portal externo real,
comentários, obrigações/guias, **Fiscal** (NotaFiscal/XML/imposto), schema, qualquer escrita.

## 6. Riscos conhecidos / dependências

- **Dupla contagem Venda × OS × MovimentacaoFinanceira**: mitigada por não somar OS e por
  separar realizados (movimentações) de títulos; enquanto não houver vínculo explícito e
  seguro OS↔Venda, OS fica fora dos KPIs financeiros.
- **Cobertura de payload** (forma de pagamento, desconto): vendas legadas sem payload rico
  aparecem como parcial/não identificado — comportamento honesto, não bug.
- **`vencimento` como String**: parser aceita `YYYY-MM-DD` e `DD/MM/YYYY`; títulos abertos
  sem vencimento reconhecível ficam fora da competência e reduzem a disponibilidade para
  parcial (registrado em observação).
- **Origem de transferência/estorno em `MovimentacaoFinanceira`**: conjuntos assumidos
  (`transferencia`/`estorno`) — revisar se o vocabulário de `origem` divergir.
- **Fiscal**: depende de `CONTADOR_FISCAL_READER` (fase futura). Exibido como indisponível.
