# Relatório — Fechamento de Caixa ERP Premium (estilo Gestão Click)

> Data: 23/05/2026 · Modelo: Claude Opus 4.7
> Goal: evoluir o fechamento de caixa para um padrão ERP profissional —
> consolidação por origem, por forma de pagamento e resumo operacional —
> reutilizando o ledger financeiro e as vendas já estabilizados (Goals 1–4 +
> Item Avulso), sem tocar áreas protegidas.

## 1. O que foi entregue

O modal de Fechamento de Caixa passou de um resumo simples (quebra por forma de
pagamento via ledger diário) para um **resumo operacional ERP** computado a
partir das **vendas reais da sessão**:

| Bloco | Status |
|---|---|
| Resumo por **origem** (PDV/Balcão, Item Avulso, O.S./Assistência) | ✅ |
| Resumo por **forma de pagamento** (dinheiro, pix, débito, crédito, carnê, a prazo, vale) | ✅ |
| KPIs (qtd vendas, total líquido, recebido à vista, ticket médio) | ✅ |
| Consolidação (subtotal bruto, descontos, líquido, recebido, a prazo, sangrias, suprimentos) | ✅ |
| **Caixa/gaveta** — saldo esperado em dinheiro físico (correção de conferência) | ✅ |
| Operador(es) + sessão no cabeçalho | ✅ |
| Comprovante de impressão/cópia ERP (térmica-ready) | ✅ |
| Persistência do resumo em `SessaoCaixa.payload.resumoFechamento` (JSONB) | ✅ |
| Comprovante do Histórico de Caixa consumindo o resumo (com fallback legado) | ✅ |
| Resumo por origem também no painel `CaixaRelatorio` | ✅ |
| Item Avulso considerado (origem própria) | ✅ |
| Descontos do PDV Assistência considerados (derivados de bruto − líquido) | ✅ |

## 2. Decisões de arquitetura

### 2.1 Helper puro único (sem duplicar cálculo)

`lib/caixa-fechamento-resumo.ts` (**NOVO**) centraliza toda a consolidação:

- `classifyLineOrigem(inventoryId)` — classifica cada linha por origem usando os
  predicados já existentes (`isOsVirtualSaleLine`, `isAvulsoSaleLine`).
- `filterSalesDaSessao(sales, { sessaoId, dataAbertura })` — isola as vendas da
  sessão (por `sessaoId`; fallback para janela desde `dataAbertura` ou o dia, em
  sessões legadas sem id).
- `computeFechamentoResumo({ sales, sangrias, suprimentos, saldoInicial })` —
  produz `porOrigem`, `porPagamento` e a consolidação.

É consumido pelo **modal de fechamento**, pelo **CaixaRelatorio** e (via payload)
pelo **Histórico de Caixa** — um só lugar de verdade para os números.

### 2.2 Convenção de valores alinhada ao financeiro estabilizado

- **subtotal bruto** = Σ `lineTotal` de todas as linhas (antes do desconto).
- **descontos** = `subtotalBruto − totalLiquido` (deriva o desconto de qualquer
  PDV, inclusive Assistência, sem depender de campos opcionais não preenchidos).
- **total líquido** = Σ `Venda.total` (após desconto).
- **total recebido (à vista)** = `totalLiquido − aPrazo` — **mesma definição** do
  `upsertVendaInTransaction`/`MovimentacaoFinanceira(origem:"venda")` (lança
  `total − aPrazo`; carnê é tratado como recebimento imediato). Sem divergência
  com o ledger financeiro.
- **saldo esperado em dinheiro (gaveta)** = `saldoInicial + dinheiro +
  suprimentos − sangrias`. **Somente dinheiro físico.**

### 2.3 Correção de conferência (cash conferral)

**Bug pré-existente:** o fechamento comparava o "valor contado em caixa" (dinheiro
físico) contra `getSaldoAtual()` = `saldoInicial + totalEntradas − totalSaidas`,
sendo que `totalEntradas` soma o **total cheio** de cada venda (inclui pix/cartão).
Em qualquer loja que aceita cartão/pix, isso produzia uma "diferença" enorme e
sem sentido.

**Correção (confinada ao modal):** a conferência agora compara o dinheiro contado
contra o **saldo esperado em dinheiro** (`saldoDinheiroEsperado`). O saldo total
movimentado (incluindo pix/cartão) continua visível como linha informativa, e
continua sendo enviado ao servidor como `saldoFinal` (sem mudar a semântica
gravada). Nenhuma mudança no ledger financeiro nem na rota `fechar`.

### 2.4 Persistência para comprovante futuro

`handleFecharCaixa` agora inclui `resumoFechamento`, `saldoDinheiroEsperado` e
`operadores` dentro de `SessaoCaixa.payload` (campo **JSONB existente** — sem
schema novo, sem migração). O Histórico de Caixa lê esse resumo para reimprimir o
comprovante ERP; sessões antigas (sem o resumo) caem no comprovante legado por
ledger.

## 3. Arquivos alterados/criados

| Arquivo | Mudança |
|---|---|
| `lib/caixa-fechamento-resumo.ts` (**NOVO**) | Helper puro de consolidação: `classifyLineOrigem`, `filterSalesDaSessao`, `computeFechamentoResumo` + tipos `FechamentoResumo`/`ResumoOrigemLinha`/`ResumoPagamento`. |
| `components/dashboard/caixa/fechamento-caixa-modal.tsx` | Resumo ERP (KPIs + por origem + por pagamento + gaveta), conferência por dinheiro físico, cabeçalho operador/sessão, impressão/cópia ERP, persistência do resumo no payload. Componentes auxiliares `KpiMini`/`PgtoRow`. |
| `components/dashboard/caixa/caixa-relatorio.tsx` | Card "Vendas por origem" reutilizando `computeFechamentoResumo` sobre as vendas do dia. |
| `components/dashboard/caixa/caixa-historico-client.tsx` | Comprovante de impressão e detalhe na tela consomem `payload.resumoFechamento` (com fallback ao ledger legado). |

**Áreas protegidas — não tocadas:** `auth.ts`, `proxy.ts`, sidebar,
`prisma/schema.prisma` (sem migração), `lib/prisma.ts`, `next.config.mjs`,
`lib/financeiro/*`. As rotas `app/api/ops/caixa/{fechar,sessao-detalhe}` **não
foram alteradas** — o resumo extra viaja no `payload` que a rota já aceita
(`z.record`). Multi-loja (`storeId`) preservado (a rota já exige header).
Multi-terminal **não** foi iniciado (fora de escopo, conforme restrição).

## 4. Validações executadas

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** (prisma generate + Next webpack, todas as rotas) |
| `git status` | `M caixa-historico-client.tsx`, `M caixa-relatorio.tsx`, `M fechamento-caixa-modal.tsx`, `?? lib/caixa-fechamento-resumo.ts` |
| `git diff --stat` | 3 arquivos · **+320 / −91**; helper novo (~230 linhas) |

## 5. Testes documentados (roteiro de loja)

> Validação automatizada (tsc/build) concluída. Roteiro para conferência **na
> máquina da loja**. Use **PDV Clássico / Supermercado / Assistência** — não usar
> `/dashboard/pdv-next`.

1. **Abrir caixa** — saldo inicial → "Abrir Caixa". Barra "Caixa Aberto".
2. **Vendas:**
   - Venda normal (produto cadastrado) em **dinheiro**.
   - Venda com **desconto** (Assistência/Clássico) em **pix**.
   - **Item Avulso** (INSERT) em **cartão**.
3. **Formas variadas** — repetir com débito/crédito e uma venda **mista** (2 formas).
4. **Sangria** (R$ X) e **Suprimento** (R$ Y) pelo menu de operações.
5. **Fechar caixa** — abrir o modal de fechamento.
6. **Validar resumo por origem:** "PDV / Balcão", "Item Avulso", "O.S. / Assistência"
   somam o **subtotal bruto**; cada um com a contagem de itens.
7. **Validar resumo por pagamento:** dinheiro/pix/débito/crédito/carnê/a prazo/vale
   batem com o que foi cobrado; "Total das vendas" = total líquido; venda mista
   incrementa "vendas com múltiplas formas".
8. **Validar totais finais:** subtotal bruto − descontos = total líquido; total
   recebido = líquido − a prazo; **saldo esperado em dinheiro** = abertura +
   dinheiro + suprimentos − sangrias; contar a gaveta e conferir a diferença
   (apenas dinheiro). Ticket médio = líquido ÷ qtd.
9. **4 temas (Light/Soft Ice/Midnight/Black):** tokens semânticos
   (`bg-card`, `text-muted-foreground`, `text-primary`, `border-border`); cores de
   domínio `emerald`/`rose`/`amber`/`sky` para entradas/saídas/alertas/ticket.
   Conferir contraste e ausência de cor hardcoded decorativa.
10. **Imprimir / Copiar** o comprovante; reabrir em **Histórico de Caixa** →
    comprovante reimpresso traz por origem + por pagamento + consolidação.

> **Honestidade:** os testes 1–10 foram validados por leitura de código + `tsc` +
> `build`. **Não houve** execução interativa no navegador nesta sessão —
> recomenda-se um smoke visual rápido nos 4 temas antes do uso em produção.

## 6. Riscos / pendências (NÃO corrigidos — documentados)

| Risco / pendência | Severidade | Observação |
|---|---|---|
| **PDV Balcão × Venda Completa não são distinguíveis na origem** | Média | Ambos usam o mesmo `finalizeSaleTransaction` sem marcador de origem; ficam ambos em "PDV / Balcão". Separar exigiria um campo de origem na venda (schema/payload) — fora do escopo cirúrgico. |
| **Operador é o `cashierId` (id local do terminal), não nome amigável** | Baixa | O nome amigável do operador vive na sessão NextAuth (server). O cabeçalho mostra os ids curtos da sessão; nome real exigiria buscar no server — pendência. |
| **Suprimentos derivado de `totalEntradas − Σ vendas`** | Baixa | Mesmo critério já usado no `CaixaRelatorio`. Preciso enquanto sangria/suprimento não têm um agregado client dedicado. O server (`CaixaOperacao`) é a fonte canônica e já é exibido no Histórico. |
| **Vendas com `syncPending` entram no resumo** | Baixa (desejado) | O resumo operacional inclui tudo que foi vendido na sessão, mesmo aguardando sync. O `totalVendasServer` (rota `fechar`) continua sendo o canônico financeiro; podem divergir momentaneamente até o sync. Documentado. |
| **Sessão aberta offline (sem `sessaoId`) usa janela por `dataAbertura`** | Baixa | Vendas sem `sessaoId` são filtradas por data de abertura; vendas anteriores à reconciliação podem não casar exatamente. Idêntico ao comportamento legado. |
| **Devoluções não abatem o saldo de dinheiro** | Baixa | O saldo da gaveta não subtrai devoluções (o reembolso pode ser em vale, não em dinheiro). Devoluções aparecem como linha informativa no comprovante do histórico. Tratamento fino é decisão contábil — fora de escopo. |
| **Conferência mudou de base (movimentado → dinheiro)** | Média (correção) | É uma correção intencional; o número de "saldo esperado" para conferência muda para dinheiro físico. O total movimentado segue visível. Operadores devem ser avisados da melhoria. |

## 7. Documentação

- Este relatório: `docs/ai/FECHAMENTO_CAIXA_ERP_PREMIUM_REPORT.md` (NOVO).
- `docs/ai/CURRENT_STATUS.md`: entrada curta adicionada (feature nova).
- `CHANGELOG.md` / `MASTER_CONTEXT.md`: sem mudança de contrato/arquitetura
  (payload JSONB existente, sem schema) — não alterados.
