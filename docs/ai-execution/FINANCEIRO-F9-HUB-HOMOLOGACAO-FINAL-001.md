# OMNI-FINANCEIRO-F9-HUB-HOMOLOGACAO-FINAL-001 — homologação técnica da PR #341

- **PR:** [rafaelfaria49-png/omni-gestao-pro-pdv-claude#341](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/341) — `fix(financeiro,pdv): recebimentos F9 e Financeiro HUB com comprovante real`
- **Base:** `main` = `ce9228c`. **Head antes:** `9c780b4`. **Head depois:** ver "CI e SHA final".
- **Data:** 2026-11-08. **Ambiente:** PostgreSQL 17 descartável em `127.0.0.1` (bancos `fin_receb_f9_qa*`), build de produção local (`next build` + `next start`), NextAuth real, Chromium do Playwright.
- **Sem:** merge, deploy, Neon/Vercel produtivos, migration, recebimento real, operação em caixa comercial, WhatsApp, Omni Print.

## 1. Estado antes → depois

| Item | Antes (9c780b4) | Depois |
|---|---|---|
| E2E F9 Assistência / Supermercado | só teste de componente | E2E real nos 3 layouts (2 testes por layout) |
| Smokes `02-pdv-vendas` / `04-financeiro-v2` | falhavam na loja QA nova | PASS (2 execuções completas) |
| Página de impressão do cupom | `@page { size: 80mm auto }` — **inválido**, descartado pelo navegador (Letter 215,9 mm) | `size: <bobina>mm <altura medida>mm`, 1 página, largura útil por bobina |
| Cupom em bobina 58 mm | conteúdo fixo em 72 mm (CSS global) → corta numa bobina de 58 mm | 48 mm úteis em 58 mm; 72 mm em 80 mm |
| Status da impressão com frame atrasado | podia dizer "falhou" e abrir o diálogo depois (2 cupons); limpeza de 1,2 s podia esvaziar o cupom antes do `print()` | sem diálogo depois do "falhou"; limpeza só depois do `print()` |
| Lote de 3 com falha no 3º título | coberto só para o 2º | coberto: desfaz os 3, retry grava uma vez |

## 2. Correções feitas nesta rodada

### 2.1 Produto (`lib/contas-receber-recibo.ts`)
1. **`@page` inválido.** `size: 80mm auto` mistura comprimento com `auto` — o CSS descarta a regra e o Chromium pagina em Letter. Prova antes da correção: PDF de 215,9 × 279,4 mm para 58 e 80 mm. Agora `cssImpressaoRecibo(bobina, altura)` declara `size: 58mm|80mm <altura>mm`, com a altura do cupom medida na largura útil (fallback fixo de 297 mm, nunca `auto`).
2. **Corte em 58 mm.** `app/globals.css` fixa `.recibo-print-root` em 72 mm `!important`. A regra injetada no cupom (mesma especificidade, depois no documento) fixa 48 mm em 58 mm e 72 mm em 80 mm. `globals.css` não foi alterado.
3. **Folhas em branco (revisão P2-1).** A isolação da impressão usava só `visibility: hidden`, que mantém a altura da app; com a página na altura do cupom isso viraria páginas extras (papel térmico avançado e cortado). Durante a impressão, `body > *:not(#recibo-print-mount)` recebe `display: none` — escopo `html[data-printing-recibo="true"]`, só em mídia `print`.
4. **Impressão dupla (revisão P2-2).** Se o frame atrasar além dos 5 s, a promessa resolve `false` e o frame atrasado não chama mais `print()`. A limpeza de 1,2 s só é agendada depois que `print()` retorna.

Só o comprovante de contas a receber usa `#recibo-print-mount`/`data-printing-recibo` (busca no repo); o cupom de venda (`lib/thermal-print.ts`) não foi tocado — ele tem o mesmo `size: … auto` e fica registrado como fora de escopo.

### 2.2 Preparação QA e testes
- `test/fin-receb-f9-print/qa-bootstrap.mjs`: CNPJ sintético na loja QA (o assistente "Boas-vindas" abre por `cadastroBasicoIncompleto` = nome ou CNPJ vazio); módulos `service` (Assistência) e `experiments` (o runtime só entrega Supermercado com ele — `components/dashboard/vendas/vendas-pdv.tsx`); terminal `PDV1`; segunda loja com cliente e título; usuário TÉCNICO; layout padrão Clássico/80 mm.
- `e2e/helpers.ts` → `selecionarTerminalSeSolicitado`: escolhe o terminal pelo fluxo real ("Usar" → lock no servidor). Não usa "Continuar sem terminal".
- `e2e/specs/02-pdv-vendas.spec.ts`: chama o helper (o smoke é anterior ao seletor de terminal, de 2026-09-18).
- Novos: `e2e/specs/financeiro-f9-tres-layouts-001.spec.ts`, `e2e/fixtures/recebimentos-qa.ts`, `lib/contas-receber-recibo-impressao.component.test.ts`; ampliados: `e2e/specs/financeiro-recebimentos-f9-print-001.spec.ts`, `test/fin-receb-f9-print/recebimentos.pg.ts`, `lib/contas-receber-recibo-comprovante.test.ts`.

## 3. Testes RED → GREEN

| Teste | RED (prova) | GREEN |
|---|---|---|
| `cssImpressaoRecibo` (2 casos) | função inexistente; 2 falhas | 8/8 no arquivo |
| ciclo de impressão (3 casos jsdom) | **3/3 falham** contra o `lib/contas-receber-recibo.ts` do head anterior | 3/3 |
| E2E: largura do PDF = bobina, 1 página | build anterior: `size: 80mm auto` no cupom → assert falha nos 3 layouts | 4/4 PDFs: 80,1 mm / 57,8 mm, 1 página |
| PG: falha no 3º título de 3 | — (cobertura nova; o rollback já existia) | 23/23 |

### Bateria técnica
- `npm run typecheck`: 0 erros. ESLint nos 39 arquivos alterados: 0 erros (1 aviso preexistente em `FinanceiroRealContext.tsx`). `git diff --check`: limpo.
- `npm run build`: compilado, `MIGRATION_SKIPPED` (nenhuma autoridade de migration; `.env` só aponta para o PG descartável). Duas tentativas morreram por falta de RAM na fase "Collecting page data" (0,2 GB livres de 7,7 GB, com outra frente rodando `next dev` + Playwright) e uma por arquivo travado do build interrompido; o build limpo seguinte passou.
- Focados (Node 22, jsdom): **206/206** em 10 arquivos — busca, comprovante, ciclo de impressão, 2ª via, cliente HTTP, clientes em aberto, lote, modal F9 real, HUB, atalhos dos 3 layouts (104).
- PostgreSQL real: **23/23**.
- E2E: **13/13**, duas execuções completas (3 layouts × 2, API, HUB × 2, PDV Classic, smokes 02 e 04).
- **Suíte Vitest completa**, mesmo comando nas duas árvores (Node 22, `--exclude` das worktrees aninhadas): PR 315 falhas / 11.316; `main` limpa (`ce9228c`, worktree temporária) 317 / 11.246. As falhas comuns são as mesmas nos dois lados. As 14 que aparecem só na PR estão em 7 arquivos que **passam isolados nos dois lados** (auth/admin 64/64, ClienteEditor 37/37, fechamento-pendentes 2/2, categoria-estoque 12/12, keymap 104/104 na PR e 100/100 na main, supermercado-finalize 13/13, fiscal-xsd 7/7): instabilidade sob carga, com o mesmo padrão aparecendo só na `main` em outros testes desses arquivos. Nenhuma regressão.

## 4. E2E dos três layouts (app real)

Spec `e2e/specs/financeiro-f9-tres-layouts-001.spec.ts`, executada 2× completa (13/13 nas duas com HUB e smokes). Por layout:

**Fluxo principal** (Clássico 80 mm/Dinheiro, Assistência 58 mm/PIX, Supermercado 80 mm/PIX): terminal não selecionado → F9 não abre; caixa fechado → F9 não deixa gravar; abre o caixa do terminal escolhido; F9 abre com foco na busca; lista inicial de devedores com contato mascarado (`•••`) e sem a outra loja; busca real `POST /api/clientes/search` por nome, telefone e CPF (corpo e status conferidos); outra loja → "Nenhum cliente encontrado"; título de R$ 1.234,56, baixa parcial de R$ 45,50 com clique duplo; tela de sucesso "abatido — resta R$ 1.189,06"; impressão automática + reimpressão; fechar; foco fora do diálogo; F9 reabre; F2 abre a busca de cliente (Clássico/Assistência).

**Bordas:** rede caída antes do servidor (nada gravado; retry com a mesma chave grava 1×); resposta perdida (o servidor grava de verdade via `route.fetch()`, o navegador recebe `connectionreset`; o retry mostra "Recebimento já estava registrado"); 403 (recusa simulada — nada de "confirmado", nada gravado); **409 real** (outro "terminal" abate o título no banco durante a confirmação → servidor devolve 409); cliente sem títulos; dois homônimos com cadastros distintos (cada um vê só o próprio título); outra loja.

**API:** usuário TÉCNICO (login real) → 403 em `POST /api/pdv/receber-conta-lote` e `POST /api/financeiro/receber-lote`; ADMIN da loja QA apontando para a outra loja → 403 nas duas rotas e na 2ª via; nenhuma escrita.

### Valores conferidos no banco (por layout)
- `payload.historico` do título: **1** entrada `{ tipo: "pagamento", valor: 45.5, formaPagamento: "dinheiro"|"pix", loteId }`; status `parcial`.
- `caixa_operacoes` `recebimento_cr` do título: **1** (antes e depois da reimpressão).
- `movimentacoes_financeiras` da loja: inalteradas pela reimpressão.
- Resposta perdida: 1 entrada no ledger e 1 operação de caixa após o retry.
- 409 real: só a entrada injetada pelo "outro terminal" (R$ 10).

## 5. Financeiro HUB

- E2E (`financeiro-recebimentos-f9-print-001.spec.ts`): parcial 131,82/180 PIX + 2ª via; lote de 2; **novo:** integral R$ 90 (Cartão de débito, `liquidacao`, status `pago`), lote de 3 numa operação (mesmo `loteId`, valores 10/20/30, PIX, clique duplo), tela de sucesso conferida **depois** da resposta da recarga silenciosa `GET /api/financeiro/receber`, parcial + **estorno** pela UI (`estorno_pagamento` com `refHistoricoIndex: 0`, status volta a `pendente`), 2ª via do pagamento estornado → 409 na API e botão "Reimprimir" desabilitado, cupom 58 mm em 1 página.
- PG (`recebimentos.pg.ts`, 23/23): total, parcial, lote de 3, retry, clique duplo concorrente, conflito de chave, saldo divergente, outra loja, `lojaId` divergente, homônimos, clientes distintos, falha no 2º e **no 3º** título com rollback integral, valor acima do saldo, forma ausente, operação estornada (replay → 409), chave em outro título, saldo devedor com título legado, 2ª via consolidada, estorno sem 2ª via, ledger do PDV, `clientesComAberto`, busca.

## 6. Comprovante — prova digital × física

| Verificado (digital) | Como |
|---|---|
| NÃO FISCAL, nome da loja QA, cliente, título, valor, forma, saldo restante, data `dd/mm/aaaa`, operação (8 primeiros caracteres do `loteId`), "2ª VIA — REIMPRESSÃO" | HTML capturado no instante do `window.print()` |
| Ausência de valores fixos ("Banco Inter", "plena quitação", `undefined`, `NaN`) | idem |
| Valores brasileiros (`1.189,06`, `45,50`) e acentos | idem + PDF |
| 58 mm e 80 mm, 1 página, nada passando da largura | `page.pdf({ preferCSSPageSize: true })` em mídia `print` — PDFs em `test-results/` |

**Isso é spooler simulado.** O Chromium renderiza o que o navegador mandaria à impressora; não prova corte, legibilidade, alinhamento do driver nem o comportamento da POS-80. `PHYSICAL_PRINT=PENDING`.

## 7. Política de caixa (contrato preservado)

- **PDV (F9/F5):** grava a baixa no título **e** a `CaixaOperacao` `recebimento_cr` na sessão aberta do terminal, na mesma transação. Dinheiro soma localmente na gaveta (`adicionarEntrada`), inclusive no replay de resposta perdida (sem 2ª operação no servidor).
- **Financeiro HUB:** grava a baixa e a movimentação financeira; **não** lança na gaveta do PDV (comportamento existente, inalterado).
- Não misturar: valor do título ≠ valor recebido ≠ movimentação de gaveta ≠ saldo de caixa ≠ movimentação bancária. Lançar recebimentos do HUB no caixa é **decisão comercial do proprietário** (gate separado), não defeito.

## 8. Revisão independente

Agente de contexto limpo, só leitura, sobre `git diff ce9228c`. Veredito: **APPROVE_WITH_COMMENTS**, sem P0/P1. Verificou idempotência, atomicidade, estorno, escopo de loja, identidade do cliente, PII e ausência de falso positivo nos testes.

| Achado | Severidade | Tratamento |
|---|---|---|
| Folhas em branco com a página na altura do cupom | P2 (plausível) | corrigido (2.1-3) + E2E conta 1 página |
| Impressão dupla / cupom limpo antes do `print()` com frame atrasado | P2 (plausível) | corrigido (2.1-4) + RED→GREEN jsdom |
| Saldo devedor pode subestimar com variante acentuada em título legado sem `clienteId` | P3 | registrado |
| `formaPagamento` do HUB é texto livre (máx. 80) | P3 | registrado (o HUB só envia a lista fixa) |
| Lista de busca anterior visível durante o debounce | P3 | registrado |
| Ledger com estorno ambíguo → replay recebe 409 "estornada" (fail-closed) | P3 | registrado |
| Data da tela de sucesso sem guarda de validade (o cupom tem) | P3 | registrado |
| Dois homônimos sem cadastro agrupados pelo nome | P3 (inerente a título legado) | registrado |

## 9. Fora de escopo (relatado, não alterado)

- Modal "Estornar recebimento" do HUB: "Valor a estornar", "Motivo" e "Observação" são só visuais — o servidor sempre estorna o último pagamento inteiro.
- `lib/thermal-print.ts` (cupom de venda) usa o mesmo `@page { size: … auto }` inválido.
- O PDV consulta `GET /api/ops/caixa/sessoes?lojaId=loja-1` (403) e `inventory?lojaId=loja-1` — resquício do `loja-1`.
- Contas a Pagar do HUB tem o mesmo erro de índice do audit corrigido em Receber.
- Na 1ª visita pós-login o HUB pode mostrar "Nenhuma loja ativa" até recarregar.

## 10. Homologação física POS-80 USB (RAFACELL)

Janela planejada: **09/11/2026, 10h–11h**, com operador presente. Compartilha a janela e o equipamento com o Omni Print, mas **não substitui os 18 casos D05**. **Não instalar o agente Omni Print D05** por causa deste roteiro.

**Caminho testado:** diálogo de impressão do navegador (`window.print()` → driver Windows da POS-80). **Não** é o transporte direto do Omni Print.

**Preparação (sem financeiro comercial):** loja de homologação/QA com massa sintética (nunca a loja RAFACELL de produção), cliente "Cliente Homologação Física", títulos de R$ 12,34 / R$ 56,78 / R$ 1.234,56. Driver da POS-80 com papel **80 mm (rolo)**, margens zero, escala 100%, sem cabeçalho/rodapé do navegador.

| Caso | Passos | Esperado | Evidência |
|---|---|---|---|
| P01 | HUB → A receber → Receber (integral, PIX) → Imprimir | cupom único, NÃO FISCAL, valores e forma reais | foto do cupom + nº operação |
| P02 | HUB → Receber de cliente → 3 títulos → Imprimir | 1 cupom consolidado, 3 linhas, total | foto + `loteId` |
| P03 | PDV Clássico → F9 → parcial → Imprimir | "abatido — resta …" | foto |
| P04 | PDV Assistência → F9 → Imprimir | idem | foto |
| P05 | PDV Supermercado → F9 → Imprimir | idem | foto |
| P06 | Comprovantes → Reimprimir | "2ª VIA — REIMPRESSÃO"; nenhuma baixa nova (conferir ledger) | foto + contagem do ledger antes/depois |
| P07 | Cliente com acentos ("João Ação"), valor 1.234,56 | acentos legíveis, `1.234,56`, nada cortado à direita | foto com régua |
| P08 | Desligar a impressora → Imprimir | aviso de impressão; recebimento continua gravado; nenhuma baixa nova ao reimprimir | foto da tela + ledger |
| P09 | Qualquer cupom | corte no fim do cupom, **sem folha em branco**, legível a 30 cm | foto |
| P10 | Ao final | nº de cupons físicos = nº de pedidos de impressão; nº de baixas = nº de operações | planilha simples |

**Critério:** PASS só com foto/registro de cada caso. Sem impressora ou operador: `PHYSICAL_PRINT=PENDING`, sem PASS.

## 11. CI, SHA final e próximo gate

Preenchido na seção final do relatório da PR (o SHA só existe depois do commit). **Próximo gate:** (1) homologação física P01–P10; (2) decisão humana de merge da PR #341 na `main`; (3) smoke pós-deploy em Production — todos fora deste GOAL.
