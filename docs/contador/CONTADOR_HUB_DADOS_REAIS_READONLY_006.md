---
title: Contador HUB — Dados Reais (read-only) · GOAL 006
goal: CONTADOR-HUB-DADOS-REAIS-READONLY-006 + 006B + 006C + 006D-FINAL-CONTRACT-EVIDENCE
status: entregue · contrato direcional e evidências finais versionadas
base: origin/main = 50c1db8 (contém GOAL 004 = 066e9f2 · GOAL 005 = 50c1db8)
branch: goal/contador-006-dados-reais
escopo: auditoria de fontes + readers Prisma read-only + realificação parcial (Visão Geral + Relatórios básicos)
last_update: 2026-07-16
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
| Entradas realizadas | `MovimentacaoFinanceira` (origem em allowlist + direção válida) | `createdAt` | `[inicio, fimExclusivo)` UTC | origem desconhecida nunca herda `tipo` |
| Saídas realizadas | `MovimentacaoFinanceira` (origem em allowlist + direção válida) | `createdAt` | idem | origem desconhecida nunca herda `tipo` |
| Estornos | `MovimentacaoFinanceira` (origem estorno) | `createdAt` | idem | classificado à parte |
| Transferências internas | `MovimentacaoFinanceira` (origem transferência) | `createdAt` | idem | agregado de volume separado; neutro no resultado |
| Não classificados | `MovimentacaoFinanceira` (origem nula/vazia/desconhecida) | `createdAt` | idem | valor + quantidade separados; não entram nos KPIs econômicos |
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

**Gate interno:** `auth()` → cookie de loja ativa → `canAccessStore(session, storeId)` →
permissão existente `permissions.hubs.financeiro`. `requireContadorScope()` produz um
`ContadorScopeInterno` nominal com `userId`, `storeId` e `permissaoFinanceiro: true`; readers
públicos não aceitam `storeId: string`. A avaliação pura retorna somente uma decisão não
nominal: apenas `requireContadorScope()` sela o scope depois de `auth()` e cookie. O gate é
testado para `all`, `restricted`, falta de sessão/loja/permissão e cross-store.

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
4. **Forma de pagamento** — `Venda.payload.paymentBreakdown`, parser defensivo e reconciliado
   com `Venda.total`. Payload ausente/inválido, chave futura desconhecida ou residual →
   **"não identificado"** (quantidade e valor reportados) e disponibilidade parcial; nunca
   permanece `real` escondendo uma forma nova. Não usa `MovimentacaoFinanceira` para quebrar
   a mesma venda. O alias histórico real `cartao` é reconhecido como `cartaoDebito`, alinhado
   ao normalizador legado da plataforma. A reconciliação é direcional e expõe, separadamente,
   `residualNaoIdentificado` (breakdown abaixo da venda) e `excedenteBreakdown` (breakdown
   acima da venda), além dos totais e da divergência absoluta. Os valores são calculados por
   venda antes da soma: residual de uma venda nunca compensa excedente de outra. O total
   autoritativo continua sendo `Venda.total`; o breakdown nunca infla o faturamento.
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
  read-only, `Promise.allSettled`) + `construirDadosContador`; cada fonte falha isoladamente
  e suas métricas viram `indisponivel`, sem zerar ou derrubar as fontes saudáveis.
- `lib/contador/scope-core.ts` / `scope.ts` — `requireContadorScope`, ACL multi-loja,
  permissão Financeiro e scope nominal obrigatório nos readers.
- `components/dashboard/contador/contador-dados-reais.tsx` — UI honesta (Visão Geral +
  Relatórios básicos), selos de disponibilidade, estado de indisponibilidade.
- `app/dashboard/contador/page.tsx` — server component: resolve escopo + competência,
  carrega DTO, passa `realData`/`realErro`. Falha → estado honesto, nunca zero.
- `components/dashboard/contador/contador-hub-preview.tsx` — injeta os blocos reais em
  Visão Geral e Relatórios; demais seções seguem preview honesto.

**Testes:** `vendas.test.ts`, `financeiro.test.ts`, `caixa.test.ts`, `index.test.ts`
(agregação, dupla contagem, honestidade, reconciliação direcional, falha parcial e queries
com dados A/B, storeId e fronteiras UTC `gte`/`lt`) e `scope-core.test.ts` (permissão + ACL
cross-store). Em `index.test.ts`, as sete fixtures A/B são passadas por `montarDados` e o
valor relevante do DTO final é verificado; a prova não termina nas fontes brutas.

## 5. Fora de escopo (preservado)

Exportação, pacote ZIP, fechamento persistido, documentos, portal externo real,
comentários, obrigações/guias, **Fiscal** (NotaFiscal/XML/imposto), schema, qualquer escrita.

## 6. Riscos conhecidos / dependências

- **Dupla contagem Venda × OS × MovimentacaoFinanceira**: mitigada por não somar OS e por
  separar realizados (movimentações) de títulos; enquanto não houver vínculo explícito e
  seguro OS↔Venda, OS fica fora dos KPIs financeiros.
- **Cobertura de payload** (forma de pagamento, desconto): vendas legadas sem payload rico
  aparecem como parcial/não identificado — comportamento honesto, não bug.
- **`vencimento` como String**: parser estrito aceita somente datas reais completas em
  `YYYY-MM-DD` e `DD/MM/YYYY`; espaços, tabs ou newlines externos, datas impossíveis,
  timestamps/sufixos e formatos ambíguos ficam fora da competência e reduzem a
  disponibilidade para parcial. A matriz versionada cobre cada rejeição individualmente,
  competência anterior/atual/seguinte e virada de ano no parser e na agregação.
- **Carga dos títulos**: `ContaReceberTitulo` e `ContaPagarTitulo` são consultadas apenas por
  `storeId`, sem filtro temporal no banco e sem `take`; portanto todos os títulos da loja são
  carregados e o status/vencimento é filtrado e agregado em memória. Isso preserva a
  semântica atual da data-parede em String, mas o custo cresce com o histórico integral da
  loja. Antes de escalar para lojas com alto volume, a modelagem deve ganhar data consultável
  e índice/filtro no banco sem relaxar o isolamento por `storeId`.
- **Origem de transferência/reversão em `MovimentacaoFinanceira`**: reutiliza os
  classificadores compartilhados e cobre `devolucao_pdv`, `cancelamento_pdv` e `estorno_*`;
  reversões ficam sempre no agregado `estornos`, fora de entradas/saídas normais.
- **Fiscal**: depende de `CONTADOR_FISCAL_READER` (fase futura). Exibido como indisponível.

## 7. Correção de merge-readiness 006B

- Visão Geral e Relatórios estão explicitamente rotulados como **blocos reais somente leitura**;
  o cabeçalho e o aviso global descrevem a experiência como **híbrida**. A competência altera
  somente os blocos reais; cartões e seções restantes continuam identificados como preview.
- Falha individual de Venda, Devolução, Financeiro, títulos ou Caixa não colapsa a página.
  O DTO preserva resultados saudáveis e emite alerta genérico, sem expor erro/stack do banco.
- Bundle antes/depois: chunks específicos do Contador passaram de **93.830 B** para
  **95.078 B** (**+1.248 B / +1,3%**, apenas microcopy/selos) e continuam sem `Prisma` ou
  `@prisma`; o chunk auxiliar permaneceu idêntico. As nove ocorrências preexistentes em
  chunks compartilhados/outras rotas mantiveram nomes, tamanhos e hashes. Essa dívida global
  não foi ampliada nem tratada neste slice, conforme a allowlist.

## 8. Correção final de merge-readiness 006C

- Classificação financeira por allowlist confirmada no código: `venda`/`pdv`, `os`,
  `marketplace`, famílias `receber*` e `pagar*`, além das origens explícitas bidirecionais
  `manual`, `ajuste`, `importacao`, `sistema` e `legado`. Origem nula, vazia, desconhecida ou
  conhecida com direção incompatível fica em `naoClassificados`; `tipo` sozinho nunca cria
  entrada/saída econômica.
- Transferências têm valor e quantidade próprios no DTO/UI. Estornos continuam separados.
- `parseVencimento` não normaliza a entrada: formatos com espaços externos são inválidos.
- O scope nominal agora registra usuário e evidência da permissão Financeiro. A factory
  pública baseada em `Session` foi removida; o único gate nominal de produção é
  `requireContadorScope()`.
- A reconciliação de `paymentBreakdown` expõe quantidade e soma absoluta das divergências,
  inclusive excedentes acima de `Venda.total`.
- Cobertura versionada: fixture cross-store A/B separada para cada uma das sete queries;
  quatro pontos de fronteira (`início−1`, `início`, `fim−1`, `fim`) para cada uma das cinco
  queries DateTime; e falha isolada separada para cada uma das sete fontes, preservando as
  demais e sem vazar o erro bruto.
- Build 006C: chunk client específico de `/dashboard/contador` com **79.387 bytes** e nenhuma
  ocorrência de `Prisma`, `@prisma` ou `query_engine`.

## 9. Correção final de contrato e evidência 006D

- `ReconciliacaoPagamento` substitui o valor absoluto sem direção: registra total de vendas,
  total declarado, residual, excedente, divergência absoluta e estado reconciliado. Falha de
  Venda produz `null`, não zeros artificiais. Alertas e Relatórios exibem residual e excedente
  separadamente.
- Cada uma das sete fixtures cross-store A/B chega ao DTO agregado de `montarDados`; o teste
  verifica a métrica final correspondente à fonte da loja A.
- A matriz versionada de vencimentos cobre ISO e BR, espaços/tabs/newlines em ambas as
  direções, datas de calendário impossíveis, competência anterior/atual/seguinte, ano
  bissexto e virada de ano. A agregação de títulos também prova os recortes mensal e anual.
- Cada um dos sete cenários de falha parte das mesmas sete fontes não vazias. Todos os KPIs da
  fonte afetada ficam `indisponivel`/`null`; as outras seis fontes e seus KPIs são comparados
  integralmente com o DTO saudável; o líquido derivado respeita suas dependências; o DTO é
  serializável e não contém mensagem nem stack do erro bruto.
- Limite de desempenho documentado sem eufemismo: títulos continuam sendo carregados
  integralmente por loja e filtrados/agregados em memória nesta fase read-only.
- Build 006D: o chunk específico de `/dashboard/contador` ficou em **79.531 bytes**
  (**+144 bytes** sobre o artefato 006C de 79.387 bytes). O conjunto de três chunks do
  componente soma **122.643 bytes** e permanece sem `Prisma`, `@prisma`, `query_engine`,
  `generated/prisma`, `server-only` ou `DATABASE_URL`.
