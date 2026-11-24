# FINANCEIRO-F9-ESTORNO-ACEITE-FINAL-002 — relatório de decisão

Data: 2026-11-22 · Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude
Branch de trabalho: `claude/fin-f9-estorno-integracao-isolada-001` (local, **sem push**)
Base do aceite: integração `64d3bba` do GOAL FINANCEIRO-F9-ESTORNO-INTEGRACAO-ISOLADA-001.

## 1. PRs e SHAs (reconferidos)

| Ref | SHA | Estado |
|---|---|---|
| `main` | `464190a` | inalterada desde a integração |
| #384 estornos | `bb76132` | draft, CLEAN, CI verde (validate, authenticated) |
| #341 F9 + comprovante | `6c4641f` | draft, UNSTABLE: só o job fiscal "Container, offline integration and supply chain" falha (apt pin `libpcre2-8-0=10.42-1+deb12u1`) — igual na main, não obrigatório (main sem proteção de branch) |
| #383 fiscal XSD | `78dac34` | draft, UNSTABLE: o pin passou, agora falha a etapa "Suíte completa e build Next" (403 em massa — suíte da raiz) |
| #386 suíte da raiz | `2102ca5` | draft, vermelha: `tsc --noEmit` morre por heap no CI (exit 134 no ubuntu) |

PRs originais, #383 e #386: **não alteradas**.

## 2. Revisão da integração anterior

Relatório `FINANCEIRO-F9-ESTORNO-INTEGRACAO-ISOLADA-001/REPORT.md` relido. Suíte combinada
A–K (14 testes PG em `test/fin-f9-estorno-integ/integracao.pg.ts`) revisada: chamam os
handlers reais (`receber-lote`, `recibo-recebimento`, `financeiro/receber` PATCH,
`pdv/receber-conta`, `pdv/receber-conta-lote`), recusam banco que não seja loopback
`fin_integ_qa*`. Nenhuma mudança de contrato entre as PRs desde então (SHAs iguais).
Os testes já aprovados não foram refeitos.

## 3. Lacunas fechadas (E2E novo, app real)

Spec `e2e/specs/financeiro-f9-estorno-aceite-002.spec.ts` — build local `next start`
127.0.0.1:3007, NextAuth real, PG descartável `fin_receb_f9_qa_e2e`, massa sintética.
**3/3 em três rodadas seguidas** (+ 1 rodada com JSON). Detalhe em `e2e.txt`.

| Lacuna | Resultado |
|---|---|
| **C. Estorno pelo HUB de recebimento feito no PDV** | PASS. Recebimentos 100 + 50 pela rota do F9 (`/api/pdv/receber-conta`, sessão de caixa aberta pela tela); estorno pela tela do HUB estorna **só o último (50)**: ledger `[pagamento, pagamento, estorno_pagamento(ref 1)]`; caixa ganha `estorno_recebimento_cr` 50 na mesma sessão com `refCaixaOperacaoId` = entrada do 2º pagamento; financeiro `entrada 100, entrada 50, saída 50` |
| **D. Parcial seguido de estorno** | PASS (mesmo cenário: título 300 → recebido 150 → 100, saldo 200) |
| **E. Reimpressão e bloqueio** | PASS. API: 2ª via do estornado 409, do válido 200. Tela: um Reimprimir desabilitado, outro habilitado; cupom "2ª VIA — REIMPRESSÃO" com 100,00; nenhuma movimentação nova |
| **A. Fechamento de Caixa pela tela** | PASS. Resumo liberado pela senha da conta (Caixa Seguro). Tela: Recebido na sessão **R$ 100,00**, Contas recebidas **150,00** (2), Estornos de recebimento **50,00** (1). Contado 100 → "Caixa fechado". Banco: `FECHADA`, `saldoContado 100`, `saldoFinal 100`, `resumoFechamento.recebidoPorOrigem {contasRecebidas 150, estornosRecebimento 50, total 100}`, `gavetaDinheiro {dinheiroContas 150, estornosDinheiro 50, esperado 100}` |
| **J pela tela. Estorno com o caixa fechado** | PASS (com a correção da seção 4). Servidor 409 `estornar_caixa_sessao_fechada`; ledger e caixa intactos; aviso visível ao operador |
| **B. Relatório Geral pela tela** | PASS. Delta do dia (API): recebimentos de títulos **+150 (2)**, estornos de recebimento **−50 (1)**, recebimentos líquidos **+100**, caixa das sessões **+100**, ledger de títulos **+100**, divergências **0**. Tela mostra os mesmos valores da API no bloco "Recebimentos efetivos" |
| **F. Terminal ocupado entre testes** | PASS. Dois contextos = dois computadores: o 2º vê "Em uso", o supervisor **Assume** pelo fluxo real e o lock muda de dispositivo. Também vale entre rodadas emendadas (lock ainda fresco) |
| **G. `06-pdv-caixa-historico`** | **Falha igual na main `464190a` e na integração**, com o terminal livre e também com o lock expirado: o spec espera o campo de bipe e nunca escolhe terminal (prints `06-main-seletor-terminal.png` / `06-integ-…`). Classificação: **teste desatualizado, pré-existente, fora do escopo das PRs** (nenhuma toca o spec ou o seletor). Correção sugerida: chamar `selecionarTerminalSeSolicitado` (helper que a #341 já adiciona) — não feita aqui |

## 4. Achado novo e correção preparada (para revisão)

**Financeiro HUB não mostra nenhum aviso do `sonner`** — nem "Recebimento estornado" nem
as recusas do servidor. `FinanceiroHubIsolated` não monta o `__root.tsx` (onde está o
`<Toaster>`), e o layout global só tem o Toaster do shadcn. **Pré-existente na main**
(mesmo `toast.error` em `routes/financeiro.tsx`), mas a #384 passa a recusar estornos
em casos novos (caixa fechado, título alterado, histórico ambíguo): o operador clica em
"Confirmar estorno", o servidor recusa corretamente e o modal fica aberto **sem
explicação**. Severidade: **P2 de UX** (sem risco de dinheiro — a recusa é real).

Correção mínima, mesmo padrão já usado no Cadastros HUB: montar
`<Toaster position="top-center" />` (o `components/ui/sonner` do próprio HUB, tokens
semânticos) no wrapper. Patch: `correcao-toaster-hub.patch` (5 linhas, 1 arquivo).

Prova: o spec de aceite ficou **vermelho sem a correção** (o aviso "Recebimento
estornado" não aparece) e **verde com ela**; regressão do HUB com a correção:
`04-financeiro-v2`, `07-financeiro-relatorios-export` e `financeiro-recebimentos-f9-print-001` **6/6**.
typecheck (heap 6144) exit 0 · ESLint dos arquivos alterados sem erro.

A correção está **só** na branch de integração local. Onde aplicar é decisão humana:
como commit na #384 (que introduz as recusas novas) ou numa PR pequena própria.

## 5. Homologação de impressão

Roteiro curto em `ROTEIRO_IMPRESSAO_FISICA.md` (58 mm, 80 mm, app Windows direto,
2ª via, estornado bloqueado, falha de impressora e fallback, fechamento).
**Status: NÃO EXECUTADA** — depende do operador na loja. Prova automatizada existente:
cupom 58 mm e 80 mm medidos em mídia `print` (1 página, sem estouro) e fallback do app
para o navegador em teste de componente (`contas-receber-recibo-desktop`).

## 6. Release readiness

- Nenhuma migration nas duas PRs. Nenhuma flag.
- O job fiscal vermelho da #341 é o mesmo da main e não é obrigatório; a #383 ainda não
  está pronta (agora para na suíte da raiz, que depende da #386, que por sua vez
  estoura heap no `tsc` do CI). **Não mascarar:** a #341 continua mostrando o check
  vermelho até a correção fiscal entrar.
- Caminho seguro:
  1. #383 (+ #386) quando aprovadas — **não bloqueiam** #384/#341 tecnicamente, só o check vermelho.
  2. #384 (com ou sem o patch do Toaster).
  3. #341, rebaseada/mesclada sobre a main já com a #384, **revalidando** a suíte
     combinada `test/fin-f9-estorno-integ` + este E2E sobre a main efetiva antes do merge.

## 7. Decisão

- **Testes aprovados:** suíte combinada A–K 14/14 (anterior); E2E de aceite 3/3 ×3;
  regressão HUB 6/6; typecheck; ESLint; build local.
- **Pendentes:** homologação física (roteiro pronto); `06-pdv-caixa-historico` (desatualizado na main);
  revalidação sobre a main efetiva no momento de cada merge.
- **Riscos residuais:** os da integração anterior (V3 P2 pré-existentes; rota antiga do
  HUB sem chave aceita chamadas diretas); HUB mudo sem o patch do Toaster.
- **Ordem de merge recomendada:** #384 → #341 (a #383 segue em paralelo).
- **GO técnico:** sim, para #384 → #341, recomendando incluir o patch do Toaster.
- **GO Production:** **não ainda** — falta merge humano, CI da main pós-merge, decisão
  sobre o patch e a homologação física na RAFACELL.
