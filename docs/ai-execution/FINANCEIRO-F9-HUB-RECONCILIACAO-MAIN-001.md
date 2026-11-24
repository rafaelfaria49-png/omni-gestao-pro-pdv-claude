# OMNI-FINANCEIRO-F9-HUB-RECONCILIACAO-MAIN-001 — PR #341 reconciliada com a main

- **PR:** [rafaelfaria49-png/omni-gestao-pro-pdv-claude#341](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/341)
- **Antes:** head `ab71311`, aberta (não draft), 129 commits atrás da main, `CONFLICTING`.
- **Main de referência:** `464190a` (conferida como `origin/main` no início).
- **Data:** 2026-11-21. **Ambiente:** worktree exclusiva, PostgreSQL 17 descartável em `127.0.0.1:55441` (bancos `fin_receb_f9_qa_r1` e `omni_reports_qa*`), `next build` + `next start` locais, NextAuth real, Chromium do Playwright.
- **Sem:** merge na main, deploy, Production, migration em ambiente real, dinheiro real, dados da RAFACELL.

## 1. Reconciliação

- Merge normal (`8ed1ae5`), sem rebase, reset, stash nem force-push.
- **Único conflito textual:** `docs/ai/CURRENT_STATUS.md`. Mantidos os adendos das duas linhas, em ordem de data.
- Depois do merge, o diff contra a main era exatamente o da #341: 41 arquivos, nenhum arquivo de código em comum com os 129 commits da main.
- **Interações semânticas conferidas:**
  - PDV Clássico/Assistência/Supermercado: a main só acrescentou Aparelhos/IMEI, sem tocar F9 nem `PdvRecebimentoModal`;
  - auth/sessão: sem mudança nos guards usados;
  - Relatório Geral (#381/#382): lê o ledger e o caixa, sem duplicidade, provado em PG (seção 3);
  - impressão direta do app Windows (#370/#371): ver seção 2.1.

## 2. Correções nesta rodada

### 2.1 Comprovante no app Windows (`337b8a6`)
A main trouxe a impressão direta no spooler (`lib/desktop-print-bridge`) para o cupom de venda. O comprovante NÃO FISCAL de recebimento ainda abria o diálogo do navegador.
- **Com estação configurada:** vai pelo mesmo bridge (`kind: "receipt"`, bobina da loja).
- **Sem estação ou com falha do spooler:** segue o caminho do navegador.
- Nenhum serviço novo de impressão.
- A 2ª via é um documento diferente ("2ª VIA — REIMPRESSÃO"), então a proteção anti-rajada de 5 s do app não a engole.

### 2.2 Revisão independente P2: replay do PDV após estorno (`d3c1d4f`)
- **Problema:** o replay do PDV (singular e lote) olhava só a `CaixaOperacao`. Cenário: a resposta se perde e um supervisor estorna no Financeiro. O retry com a mesma chave voltava `ok`/`jaRegistrado` e imprimia o comprovante.
- **Correção:**
  - mesma regra do Financeiro HUB (`operacaoEstornadaNoLedger`);
  - o retry devolve 409 sem gravar (singular: `operacao_estornada`; lote: `titulo_alterado` com motivo `operacao_estornada`);
  - o modal mostra a mensagem e descarta a chave.

## 3. Testes

| Suite | Resultado |
|---|---|
| PG real `test/fin-receb-f9-print/recebimentos.pg.ts` | **26/26**. São os 23 anteriores mais: prova cruzada Financeiro × Caixa × Relatório Geral (PDV com retry + HUB com clique duplo = 3 movimentos e R$ 75 no ledger do Relatório Geral, R$ 50 só do PDV no caixa); replay após estorno no singular e no lote (409, nada gravado) |
| PG da main `lib/relatorios/geral.pg.test.ts` | **10/10** |
| Componentes/unitários (F9 modal, HUB, cliente HTTP, 2ª via, recibo, lote, busca, keymap PIN, recibo desktop) | **205/205** e 228/228 |
| `tsc --noEmit` | 0 erros. Com 6144 MB: o script `typecheck` (4096 MB) estoura o heap nesta máquina, igual à pilha KG |
| ESLint nos arquivos da PR | 0 erros (1 warning pré-existente em `FinanceiroRealContext.tsx`) |
| `npm run build` (sem `VERCEL_ENV`) | `MIGRATION_SKIPPED`, "Compiled successfully" |
| E2E autenticado (`next start`) | Todos passam. Ver abaixo |

**E2E autenticado:**
- **F9 nos 3 layouts, 2 testes cada:**
  - caixa fechado e terminal; lista mascarada; busca por nome, telefone e CPF;
  - parcial com clique duplo; cupom 80/58/80 mm; 2ª via; foco;
  - rede caída; resposta perdida; 403; 409 real; homônimos; outra loja.
- **API:** perfil TÉCNICO e loja sem vínculo recebem 403.
- **Financeiro HUB:** parcial; lote; integral; lote de 3; estorno; cupom 58 mm.
- **PDV Classic.**
- **Smokes:** `02-pdv-vendas` e `04-financeiro-v2`.

**Falha na rodada completa:** a spec `PDV Classic — F9…` encontrou o terminal "PDV QA 1" travado ("Em uso") pelo contexto da spec anterior. A proteção de terminal funcionou. Isolada, a spec passou (3/3 + setup).

**Não executados (fora da #341):**
- `lib/relatorios/enterprise.pg.test.ts` exige papel com senha efêmera própria.
- Duas falhas locais que não envolvem a #341:
  - `fechamento-calculadora-modal.static.test.ts` procura `\n}` e quebra com o checkout CRLF do Windows;
  - `sessao-detalhe/route.test.ts` falha na resolução ESM de `next/server` pelo `next-auth`.

## 4. Revisão independente (contexto limpo, só leitura)

**APPROVE_WITH_COMMENTS.** Nenhum P0/P1 introduzido pela PR.
- **P2:** corrigido (2.2).
- **P1 que já existem na main, no fluxo de estorno (relatados, não alterados):**
  - estornar o último pagamento lança uma saída com a **soma de todas** as entradas do título; um segundo estorno no mesmo título é ignorado (`movimentacoes-service.ts:379-430`);
  - estornar pelo HUB um recebimento feito no PDV não lança `estorno_recebimento_cr` no caixa.
- **P3:** 2ª via no modo legado sem vínculo de loja (padrão de todo GET legado).

## 5. Preview e migrations

- **Projeto `omni-gestao-pro`:** nenhuma variável com override para a branch da #341. O Preview genérico usa `DATABASE_URL`/`DIRECT_URL` `CAgFUTJYNOJb64j1`/`WfY0iLLQ8cbQOXHd` (`updatedAt` 2026-10-27T22:05:32Z), os mesmos ids da aplicação P3 (Neon QA `nameless-frost-19035275`, papel `preview_runtime`, banco `omnigestao_preview`).
- **Projeto `omni-gestao`:** só tem banco para Production. O Preview dele não alcança banco nenhum.
- **Migrations:** `scripts/migration-authority-guard.mjs` só dá RUN com `VERCEL_ENV=production`, o project id canônico e a flag. O Preview anterior da #341 (`dpl_wVE6887Z7mu15Uv4eoDKBB7rgdYv`) registrou `MIGRATION_SKIPPED`.

## 6. Pendências

- **Homologação física** na POS-80 USB, 58 e 80 mm, 1ª e 2ª via (roteiro P01–P10 em `FINANCEIRO-F9-HUB-HOMOLOGACAO-FINAL-001.md`), incluindo o caminho novo pelo app Windows. Chromium não é homologação física.
- **Os dois P1 de estorno** (pré-existentes) merecem trilha própria antes de usar parciais em volume.
- **Decisão humana de merge.**
