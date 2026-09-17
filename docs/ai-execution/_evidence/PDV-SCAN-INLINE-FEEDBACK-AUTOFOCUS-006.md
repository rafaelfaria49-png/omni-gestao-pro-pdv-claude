# EVIDÊNCIA — PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006

Data: 2026-09-17 · worktree: `C:/Projetos/work/pdv-scan-inline-feedback-autofocus-006`
Método: componentes REAIS das 4 superfícies montados por harness dev-only (não commitado) com
inventário sintético (A05, S23, G54, KD11C, CHOC-90 — nenhum dado de cliente), driver headless
Playwright (playwright-core do repo) com eventos de teclado reais.

## Resultado: 64/65 checks PASS

Único não-passado: `F/classic` — o campo Cliente do Clássico fica desabilitado no harness
(capability `customerSearchEnabled` off sem settings de servidor). Não é regressão: o mesmo
gate existe na main; preservação de foco foi provada em Assistência, Venda Completa e no modal
de Pagamento (G/G1).

## Por cenário (todas as 4 superfícies: classic, assistencia, supermercado, vcompleta)

- **A — autofocus na entrada**: PASS 4/4 (`activeElement` = campo Código/Bipe da superfície).
- **B — código inexistente `9999999999999`**: PASS 4/4 — overlay `[data-pdv-scan-inline]`
  visível com texto `Produto não cadastrado · 9999999999999`, input real `value=""`,
  foco mantido no campo, `aria-invalid="true"`.
- **C — novo scan `7890000000017` antes do timeout**: PASS 4/4 — aviso anterior encerrado na
  hora, "Chocolate Sintético 90g" entra no carrinho, campo vazio e focado.
- **D — inexistente + aguardar**: PASS 4/4 — aviso some sozinho; foco continua no campo.
- **E — busca manual**: PASS 4/4 — `A05` adiciona; `capinha samsung` mostra sugestões e NÃO é
  apagada; Esc limpa.
- **F — foco no Cliente respeitado**: PASS assistencia + vcompleta; classic N/A (campo
  desabilitado por capability no harness); supermercado N/A (sem campo de cliente visível).
- **G/G1 — modal de pagamento**: PASS — com caixa aberto, F1 abre o modal, digitar+Enter
  dentro dele não devolve foco ao bipe (scanner não rouba foco).
- **H/H1/H2 — Item Avulso**: PASS — Insert abre; cancelar (Esc) limpa e devolve foco ao bipe.

## Screenshots (`docs/ai-execution/_evidence/pdv-006/`)

- `01-classico-normal.png` / `01-classico-nao-cadastrado.png`
- `02-assistencia-normal.png` / `02-assistencia-nao-cadastrado.png`
- `03-supermercado-normal.png` / `03-supermercado-nao-cadastrado.png`
- `04-venda-completa-normal.png` / `04-venda-completa-nao-cadastrado.png`

## SMOKE

- Local (harness): PASS (acima).
- Produção: sessão autenticada não disponível nesta estação → **SMOKE=PARCIAL**, não bloqueia
  (browser proof + checks + build + Production READY cobrem os critérios).

## Observações de método

- Duração exata (1800 ms) provada por testes unitários com fake timers; no browser a medição
  sofre throttle de aba headless (comportamento de expiração verificado qualitativamente).
- O harness intercepta apenas `GET /api/ops/inventory` e `GET /api/ops/ordens` para servir o
  inventário sintético; o lookup remoto real é exercitado (401 sem sessão → caminho de erro →
  mesmo feedback "não cadastrado" do caminho "none").
