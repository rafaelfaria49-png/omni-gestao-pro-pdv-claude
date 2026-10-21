# PDV Core N5-C — REV5: matriz aprovada por R independente

Parecer comunicado pelo responsável humano em 21/10/2026 no pedido
`CODEX_CLOSE_AEP_N5_C_REV5`, sobre o SHA exato
`8d19a8bea9518c6f865dc69c67b28085bbdde6bb`:
`R_EXECUTOR=Claude Code / Claude Opus 5.5`, `R_FAMILY=anthropic`,
`IMPLEMENTATION_FAMILY=openai`, `INDEPENDENCE_VALID=YES`, `R_VERDICT=APPROVE`.
O registro é feito pelo Codex; não constitui uma revisão R feita pelo Codex.
Proveniência, reprodução do remount e limites:
`docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md`.

A matriz rev5 preservada abaixo mantém **20 TESTED / 0 PARTIAL / 0 BLOCKED**,
cinco F-08 nas quatro superfícies. Parecer informado: **76/76 PASS**
(45 herdados + 31 componentes), **20/20 E2E**, sem skips. Nenhum código ou
asserção é modificado neste fechamento. DONE depende dos gates e do `close`
canônico; a ratificação oficial deve constar do ledger/relatório AEP.
Persistência e automação server-side, hardware e operação autenticada real
continuam fora desta prova sintética. Retenção do log local: 500 entradas;
sem storage, deduplicação restrita à montagem.
`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.

---

## Matriz e provas rev5 anteriores ao parecer, preservadas integralmente

# PDV Core N5-C — REV5: candidato técnico, validação completa e nova R pendente

Execução: 21/10/2026 (America/Sao_Paulo). GOAL `PDV-PARITY-N5-C-E2E-002`.
MAIN_BASE=`8aed9e1d7c7891fd1e6f53b60da53679be0f1117` (PR #293 MERGED).
Integração normal: `fce7ba872a76fd7ae6ce127dfac31e722a701252`.
O SHA técnico exato será vinculado ao parecer R na evidência do GOAL; o
REQUEST_CHANGES da rev4 é histórico e não constitui aprovação desta revisão.

## Matriz técnica rev5 — cinco F-08 nas quatro superfícies

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split e múltiplos pagamentos | TESTED — E5-C-A | TESTED — E5-A-A | TESTED — E5-S-A | TESTED — E5-V-A |
| B. Vale/crédito e saldo | TESTED — E5-C-B | TESTED — E5-A-B | TESTED — E5-S-B | TESTED — E5-V-B |
| C. À Prazo, entrada e parcelas | TESTED — E5-C-C | TESTED — E5-A-C | TESTED — E5-S-C | TESTED — E5-V-C |
| D. PENDING/retry com identidade estável | TESTED — E5-C-D, U5-C | TESTED — E5-A-D, U5-A | TESTED — E5-S-D, U5-S | TESTED — E5-V-D, U5-V |
| E. sale_finalized após CONFIRMED, sem duplicação | TESTED — E5-C-D/E, U5-C | TESTED — E5-A-D/E, U5-A: confirmação desmontada, remount e TTL | TESTED — E5-S-D/E, U5-S | TESTED — E5-V-D/E, U5-V |

`MATRIX_TESTED=20` · `MATRIX_PARTIAL=0` · `MATRIX_BLOCKED=0` ·
`UNSUPPORTED_BY_DESIGN=0`. São provas técnicas isoladas, não homologação produtiva.
Aceite/fechamento AEP continua condicionado ao novo R favorável.

- E5: `npx playwright test --config e2e/pdv-core.playwright.config.ts`:
  **20 PASS / 0 FAIL / 0 skip**, 43,1s. IDs E5 mapeiam superfície e caso A..E
  do mesmo `e2e/specs/pdv-core-n5.spec.ts`; nenhuma asserção E2E foi alterada.
- U5: quatro arquivos `lib/pdv/parity-*-finalize-audit.component.test.ts`:
  **31 PASS / 0 FAIL / 0 skip** (Classic 7, Assistência 10, Supermercado 7,
  Venda Completa 7). Os cinco casos novos da Assistência usam provider, modal,
  finalização, retry e log reais; isolam somente I/O e contextos periféricos.
- Herdados: **45 PASS / 0 FAIL / 0 skip**, preservando os 11 casos estáticos e
  os 34 comportamentais. O estático segue a ligação identidade/CONFIRMED/emissor
  no observador; o comportamental usa audit-log real e snapshots completos.
- `npm run typecheck`: PASS. ESLint focado nos 13 paths TS/TSX do candidato:
  exit 0, zero erros e nove warnings preexistentes nas três telas intocadas.

Na Assistência, o marcador `omnigestao:pdv-assistencia-finalize-audit:<loja>`
independe do carrinho e de seu TTL. PENDING confirmado enquanto só a tela está
desmontada é observado na volta; draft alterado/expirado/removido não altera
identidade, total ou breakdown auditados. Novo remount/render/retry conserva
um evento, uma venda e o estado de caixa/estoque. Loja alheia e resposta em voo
não sobrescrevem o marcador/carrinho da loja nova. FAILED/PENDING não auditam.

I/O sintético fail-closed, origem loopback, sem Next/.env/DB/Auth produtivos.
Persistência/automação server-side, hardware e operação autenticada real não
são comprovados por estas fixtures. Deduplicação local limitada ao log retido
(500 entradas); storage indisponível mantém apenas memória naquela montagem.
`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.

---

## Histórico rev4 preservado integralmente

# PDV Core N5-C — REV4: BLOCKED após revisão R e regressões herdadas

Atualização: 20/10/2026. SHA técnico revisado e executado:
`cdda74979e6008e5391a9defe6af1efdca6b7e4e`.
R: Claude Code 2.1.288 / Opus 5.5 (`claude-opus-5-5`),
família `anthropic`, provider firstParty, **REQUEST_CHANGES**.
Parecer integral e execução confirmatória estão na evidência do GOAL.

Os 20 E2E e 26 testes focados passaram, mas não autorizam fechamento.
A execução adicional solicitada por R comprovou **17 FAIL / 28 PASS** em dois
testes herdados fora da allowlist. O conjunto de validações não está verde.
Não houve close DONE, push ou PR.

## Matriz vigente após R — vinte combinações

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split e múltiplos pagamentos | TESTED — E4-C-A | TESTED — E4-A-A | TESTED — E4-S-A | TESTED — E4-V-A |
| B. Vale/crédito e saldo | TESTED — E4-C-B | TESTED — E4-A-B | TESTED — E4-S-B | TESTED — E4-V-B |
| C. À Prazo, entrada e parcelas | TESTED — E4-C-C | TESTED — E4-A-C | TESTED — E4-S-C | TESTED — E4-V-C |
| D. PENDING/retry com identidade estável | TESTED — E4-C-D | TESTED — E4-A-D (montado) | TESTED — E4-S-D | TESTED — E4-V-D |
| E. sale_finalized após CONFIRMED, inclusive retry/remount | TESTED — E4-C-D/E, U4-C | PARTIAL — E4-A-D/E, U4-A passam; R P2: retry confirma fora da montagem sem prova específica | TESTED — E4-S-D/E, U4-S | TESTED — E4-V-D/E, U4-V |

`TESTED_COUNT=19` · `PARTIAL_COUNT=1` · `BLOCKED_COUNT=0` ·
`UNSUPPORTED_BY_DESIGN_COUNT=0`.
O BLOCKED é do aceite global/allowlist, não uma falha fabricada nos 20 casos E2E.
A célula E Assistência é rebaixada por suficiência de cobertura após R: a lacuna
de remount é achado de inspeção, sem falha runtime específica executada.
Os 20 PASS efetivos continuam preservados no histórico imediatamente abaixo.

## Blocker comprovado fora da allowlist

Comando no SHA técnico, sem alterar os testes:
`npx vitest run lib/pdv-pending-post-sale-effects.static.test.ts lib/pdv/current-main-correction.component.test.ts`.

- Estático: 11 casos, 3 FAIL / 8 PASS. Classic, Supermercado e Venda Completa
  falham em `CONFIRMED preserva sale_finalized` (linha 180), pois o emissor
  passou ao observador e o teste exige texto no trecho depois do guard PENDING.
- Componente herdado: 34 casos, 14 FAIL / 20 PASS. O mock de audit-log exporta
  apenas appendAuditLog; o efeito real pede getAuditLogs e Vitest lança
  `No "getAuditLogs" export is defined on the "@/lib/audit-log" mock`.
- Esses dois arquivos não constam da allowlist rev4. Não foram editados,
  substituídos ou enfraquecidos. Nenhum comentário/marcador artificial nem
  tratamento especial de mock foi adicionado ao código para contornar as falhas.
- R também identificou a Assistência sem marcador persistente independente do
  draft, perdendo observação quando a confirmação ocorre antes do remount.
  Esse achado precisa de prova/correção posterior; não se inventou PASS/FAIL
  comportamental desse caminho nem se ampliou o escopo após o blocker real.

`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.
Candidato técnico, sete WIPs incorporados e históricos permanecem preservados.
O AEP deve registrar BLOCKED canonicamente; retomada requer decisão humana
sobre contrato de testes/allowlist e os achados R.
`NEXT_STEP=RESOLVER_GATE_N5_C`. Nenhuma outra frente iniciada.

---

## Histórico REV4 pré-R preservado (20 PASS E2E; não é aceite final)

# PDV Core N5-C — REV4: vinte combinações TESTED em ambiente isolado

Execução: 20/10/2026, Codex (`openai`). Main/base:
`16c496ad2ffe56fc6a89de237b204842494b8cbb`, PR #291 MERGED, GOAL READY/rev4.
A cobertura técnica executada está completa; R independente ainda pendente
neste candidato. Isto não homologa produção. Histórico REV1–REV3 integral abaixo.

## Matriz vigente REV4 — vinte combinações

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split e múltiplos pagamentos | TESTED — E4-C-A | TESTED — E4-A-A | TESTED — E4-S-A | TESTED — E4-V-A |
| B. Vale/crédito e saldo | TESTED — E4-C-B | TESTED — E4-A-B | TESTED — E4-S-B | TESTED — E4-V-B |
| C. À Prazo, entrada e parcelas | TESTED — E4-C-C | TESTED — E4-A-C | TESTED — E4-S-C | TESTED — E4-V-C |
| D. PENDING/retry com identidade estável | TESTED — E4-C-D | TESTED — E4-A-D | TESTED — E4-S-D | TESTED — E4-V-D |
| E. sale_finalized após CONFIRMED, inclusive retry sem duplicar | TESTED — E4-C-D/E, U4-C | TESTED — E4-A-D/E, U4-A | TESTED — E4-S-D/E, U4-S | TESTED — E4-V-D/E, U4-V |

`TESTED_COUNT=20` · `PARTIAL_COUNT=0` · `BLOCKED_COUNT=0` ·
`UNSUPPORTED_BY_DESIGN_COUNT=0`. Nenhum NOT_RUN/skip contado como PASS.

## Provas executadas e limites REV4

- E4-C/A/S/V correspondem a `classic`/`assistencia`/`supermercado`/`venda-completa`
  em `e2e/specs/pdv-core-n5.spec.ts`. Sufixos A..E são os cinco testes do spec
  (linhas 94, 111, 129, 147 e 171 neste candidato).
  `npx playwright test --config e2e/pdv-core.playwright.config.ts`:
  **20 PASS**, exit 0, 1,3 min, um worker, retries=0, zero skips.
- A: PIX 40 + dinheiro 60, soma 100, snapshot do POST igual ao estado confirmado,
  identidade canônica e uma auditoria. B: titular real selecionado na UI, saldo
  cliente 150 → 50, crédito atribuído e readback do transporte sintético.
  C: entrada 25 + À Prazo 75, três títulos locais de 25 e vencimento configurado.
- D: PENDING sem auditoria/notificação definitiva/entrada de caixa; dois POSTs
  da mesma clientSaleId, uma venda confirmada, um venda_finalizada e um
  sale_finalized; reenvio repetido sem outro POST/evento. E: resposta pausada,
  zero auditorias em voo e uma após confirmação com saleId/total reais.
- U4-C/A/S/V são os quatro arquivos
  `lib/pdv/parity-{classic,assistencia,supermercado,venda-completa}-finalize-audit.component.test.ts`:
  **7 + 5 + 7 + 7 = 26 PASS**, quatro arquivos, 17,47 s, exit 0.
  Componentes, PaymentModal, OperationsProvider, finalização, retry e audit reais;
  somente transportes/providers periféricos isolados. Novos testes Supermercado
  e Venda Completa provam FAILED/PENDING sem evento, confirmação direta,
  identidade/loja/snapshot efetivos, draft alterado, concorrência, render/remount,
  marcador restaurado e ausência de auditoria para vendas de outra origem.
- Sete WIPs conferidos por Git/SHA-256 antes/depois do fast-forward: 7/7 iguais
  ao relatório rev4. Seis continuam byte a byte iguais após implementação.
  O spec preserva os contratos e acrescenta somente seleção real de cliente na
  Venda Completa, sincronização do foco/busca e reconhecimento do botão inicial
  “Confirmar valor exato”. Nenhuma asserção foi removida ou relaxada.
- O código local acompanha apenas identidades iniciadas em cada superfície e
  lê o registro com syncPending=false. Confirmação direta/retry usam o mesmo
  emissor, deduplicado pelo log local retido. Sem garantia entre abas/servidor,
  além da retenção do log, ou quando armazenamento local não está disponível.
- Servidor exclusivo 127.0.0.1:4179, reuseExistingServer=false, sem Next/.env/DB;
  bundle em memória, CSP e interceptação fail-closed, zero pageerror/requests
  inesperados no resultado verde. Retry é chamado por driver sintético.
  Não prova persistência/automação server-side, Auth.js, botão de Histórico,
  hardware ou impressão física. Provas servidor históricas H-A..H-E abaixo
  são reaproveitadas, sem nova execução R4 ou promoção de garantias.
- Conteúdo executado identificado pelos blobs Git e SHA-256 na
  `docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md`; o parecer R
  posterior registra o SHA exato do commit técnico e não altera estas provas.

`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.
Typecheck PASS; ESLint zero erros e nove warnings preexistentes (base: 5/2/2);
diff --check PASS e verify --all PASS. Sem build/Docker/migration/writer real.
Encerramento AEP e publicação dependem do parecer R favorável sobre o SHA exato.

---

## Histórico REV3 preservado (não representa a cobertura REV4)

# PDV Core N5-C — REV3: auditorias locais validadas, blocker no Supermercado

Execução: 19/10/2026, Codex (`openai`). Main/base ratificada:
`13700862405a89da3c7d16702318735a88348133`, PR #288 MERGED.
Resultado vigente: **BLOCKED — COVERAGE_BLOCKED_SUPERMERCADO_RETRY_AUDIT**.
Os resultados REV1/REV2 e seus bloqueios abaixo permanecem históricos.

## Matriz vigente REV3 — vinte combinações

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split e múltiplos pagamentos | TESTED — R3-C-A | TESTED — R3-A-A | TESTED — R3-S-A | PARTIAL — H-A; REV3 não executado |
| B. Vale/crédito e saldo | TESTED — R3-C-B | TESTED — R3-A-B | TESTED — R3-S-B | PARTIAL — H-B; REV3 não executado |
| C. À Prazo, entrada e parcelas | TESTED — R3-C-C | TESTED — R3-A-C | TESTED — R3-S-C | PARTIAL — H-C; REV3 não executado |
| D. PENDING/retry com identidade estável | TESTED — R3-C-D | TESTED — R3-A-D | PARTIAL — R3-S-D: identidade/efeitos PASS; falha na auditoria | PARTIAL — H-D; REV3 não executado |
| E. sale_finalized após CONFIRMED, inclusive retry sem duplicar | TESTED — R3-C-D/E, U3-C | TESTED — R3-A-D/E, U3-A | BLOCKED — R3-S-D: retry confirmado emite zero auditorias | PARTIAL — H-E; REV3 não executado |

`TESTED_COUNT=13` · `PARTIAL_COUNT=6` · `BLOCKED_COUNT=1` ·
`UNSUPPORTED_BY_DESIGN_COUNT=0`.

## Evidências REV3 e limites

- **R3-C/R3-A/R3-S**, sufixos A..E: casos com os nomes das superfícies
  `classic`, `assistencia`, `supermercado` em
  `e2e/specs/pdv-core-n5.spec.ts`. Comando final:
  `npx playwright test --config e2e/pdv-core.playwright.config.ts`.
  Resultado: **13 PASS, 1 FAIL, 6 NOT_RUN**, zero skip intencional, um worker,
  `maxFailures=1`. A falha é `supermercado > D PENDING/retry`, linha 160:
  `expect(audits()).toHaveLength(1)` recebeu `[]`.
- A conserva PIX 40 + dinheiro 60, soma 100 e confirmação; B exercita cliente,
  atribuição de vale, saldo local 150 → 50 e readback sintético; C exercita
  entrada 25, saldo 75, três títulos locais de 25 e vencimento configurado.
- D observa zero auditoria/notificação definitiva/entrada de caixa em PENDING,
  dois POSTs com a mesma `clientSaleId`, uma venda CONFIRMED, um
  `venda_finalizada` e retry repetido sem novo POST. No Supermercado essas
  asserções passaram, mas faltou `sale_finalized`: o caso completo é FAIL.
- E pausa a resposta de persistência: zero auditoria antes da confirmação e
  exatamente uma depois, com identidade e valores efetivos. Classic/Assistência
  também passam o retry de D. Supermercado E e os cinco casos Venda Completa
  são NOT_RUN pela parada no primeiro blocker, sem promoção por analogia.
- **U3-C**: `lib/pdv/parity-classic-finalize-audit.component.test.ts`, 7 PASS.
  **U3-A**: `lib/pdv/parity-assistencia-finalize-audit.component.test.ts`, 5 PASS.
  Montam componentes, PaymentModal e OperationsProvider reais. CONFIRMED,
  FAILED, PENDING, retry, snapshot/draft alterado, remount e deduplicação são
  comportamentais; o Classic também recusa auditar vendas de outra origem.
- H-A..H-E continuam sendo somente as provas históricas descritas abaixo.
  Nenhuma prova R4, backend ou persistência real foi duplicada ou promovida.

O WIP original foi preservado na integração da main; seus cinco fingerprints
coincidiram antes e depois. A Assistência reaproveita a correção existente e
passa a ler o snapshot confirmado em `sales`. O Classic acompanha somente
identidades originadas no componente, com marcador local por loja para
remount, usa o snapshot confirmado e deduplica pelo log local retido.
Não há garantia transacional cross-tab/servidor nem além da retenção do log.

O driver foi alinhado ao keymap oficial: Supermercado usa F10 para cliente,
F2 continua dinheiro; Venda Completa entra pelo botão de finalização.
Nenhuma asserção de auditoria foi removida, substituída por notificação ou
relaxada. Config/fixture originais preservados byte a byte.

## Bloqueio e fronteira

`components/dashboard/vendas/pdv-supermercado.tsx:1767` retorna em PENDING;
a única emissão `sale_finalized`, linha 1823, está no handler direto.
O retry real confirma pelo motor sem reentrar nesse handler. A fixture
intercepta I/O e captura a auditoria real, sem fabricar o evento.
É um novo APPLICATION_AUDIT_GAP fora da allowlist REV3. Reabertura humana
com escopo explícito é necessária. Venda Completa não foi executada após
esse bloqueio e não tem defeito runtime declarado nesta execução.

`ENVIRONMENT_ISOLATED=YES_SYNTHETIC_IO`: servidor exclusivo loopback, sem Next,
.env, conexão ao banco ou writer real; interceptação fail-closed de todas as
rotas de negócio e origens externas; zero requests inesperados nos casos.
Isso não homologa Auth.js, persistência/automação server-side, hardware,
impressão física ou o botão do Histórico de Vendas. O retry usa driver sintético
que chama `retrySyncSale` real. Provas servidor são as referências históricas.

Prisma gerado somente em `generated/prisma` local ignorado após verificar
ancestrais sem reparse point e ausência de .env carregável; URLs loopback
inertes em processo e autoinstall desabilitado. Nenhum schema, dependência,
migration, motor ou backend foi alterado. Validações detalhadas na evidência.

`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.
Sem provas verdes completas, não há commit técnico, revisão R, close DONE,
push ou PR. Os sete arquivos técnicos permanecem como WIP na mesma worktree.
`NEXT_STEP=RESOLVER_GATE_N5_C`.

---

## Histórico REV2 preservado (não representa a cobertura REV3)

# PDV Core N5-C — REV2: cobertura incompleta, novo blocker

Atualização: 2026-10-19. Base: `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`.
O PR #285 foi confirmado MERGED. `git merge --no-edit origin/main` integrou a
main por fast-forward, sem reset; `af12ed3d0159f97bb125a62a0466362f4a89af8b`
continua ancestral. O registro histórico abaixo permanece preservado.

**Não há fechamento técnico aprovado.** A correção local da Assistência e os
cinco arquivos técnicos estão como candidato NÃO COMMITADO na worktree do GOAL.
O teste real de retry do Clássico comprovou um contrato essencial ausente fora
da allowlist REV2: após CONFIRMED, `sale_finalized` continua com zero eventos.
Não foi alterado `pdv-classic.tsx`, nem motor, backend, auth ou schema.

## Matriz vigente REV2 — 20 combinações

TESTED exige prova comportamental de browser desta sessão. Um teste de
componente, uma inspeção estática ou um caso não executado não promove célula.
PARTIAL preserva apenas a prova parcial/histórica identificada. BLOCKED aponta
impedimento concreto. UNSUPPORTED_BY_DESIGN exige ausência intencional.

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split e múltiplos pagamentos | TESTED — P-A | PARTIAL — H-A; browser não executado | PARTIAL — H-A; browser não executado | PARTIAL — H-A; browser não executado |
| B. Vale/crédito e saldo | TESTED — P-B | PARTIAL — H-B; browser não executado | PARTIAL — H-B; browser não executado | PARTIAL — H-B; browser não executado |
| C. À Prazo, entrada e parcelas | TESTED — P-C | PARTIAL — H-C; browser não executado | PARTIAL — H-C; browser não executado | PARTIAL — H-C; browser não executado |
| D. PENDING/retry com identidade estável | PARTIAL — P-D: identidade/efeitos provados, teste falha na auditoria | PARTIAL — U; browser não executado | PARTIAL — H-D; browser não executado | PARTIAL — H-D; browser não executado |
| E. sale_finalized após CONFIRMED, inclusive retry sem duplicar | BLOCKED — P-D/E: esperado 1, observado 0 no retry confirmado | PARTIAL — U: 5 testes de componente PASS, E2E não executado | PARTIAL — H-E; browser não executado | PARTIAL — H-E; browser não executado |

`TESTED_COUNT=3` · `PARTIAL_COUNT=16` · `BLOCKED_COUNT=1` ·
`UNSUPPORTED_BY_DESIGN_COUNT=0`.

F12 permanece ausente por desenho da Venda Completa; o spec usa o botão de
finalização nessa superfície. Essa diferença de atalho não torna os cinco
cenários financeiros UNSUPPORTED_BY_DESIGN. Next/Black seguem fora da matriz.

## Referências verificáveis REV2

- **P-A/P-B/P-C**: `e2e/specs/pdv-core-n5.spec.ts`, casos `classic > A split`,
  `classic > B vale/crédito` e `classic > C À Prazo`. PASS em duas execuções
  (uma focada e a canônica). O comando canônico selecionou 20 casos e terminou
  com 3 PASS, 1 falha de interação no driver e 16 NOT_RUN. Nenhum NOT_RUN é PASS.
- **P-A**: interação real pelo F12, PIX 40 + dinheiro 60, total 100;
  breakdown emitido pelo motor, confirmação e um log observados.
- **P-B**: seleção real de cliente; crédito 150 → 50 observado no estado real do
  motor cliente; atribuição de documento/cliente e readback do transporte
  sintético. Não comprova saldo persistido em banco.
- **P-C**: modal real, entrada 25 + saldo 75, três parcelas, primeiro vencimento
  10/12/2026; helper produtivo gera três títulos locais de 25. Não comprova
  readback dos títulos em banco.
- **P-D/E**: após corrigir exclusivamente o driver, execução focada
  `npx playwright test --config e2e/pdv-core.playwright.config.ts --grep 'classic.*D PENDING'`.
  Falha funcional em `expect(audits()).toHaveLength(1)`: recebido `[]`.
  Antes da falha passaram as asserções de zero eventos no PENDING, caixa sem
  entrada, bloqueio de reconfirmação, dois POSTs com a mesma `clientSaleId`,
  uma venda confirmada, um `venda_finalizada` e reenvio repetido sem novo POST.
  O teste completo não é PASS; D permanece PARTIAL e E é BLOCKED.
- **U**: `lib/pdv/parity-assistencia-finalize-audit.component.test.ts`, 5/5 PASS
  na execução final de 19/10, 00:15:25. Monta Assistência, PaymentModal e
  OperationsProvider reais; intercepta fetch. Prova dados enviados, FAILED,
  PENDING, retry real, remount e chamadas concorrentes sem duplicação.
- **H-A..H-E**: inventário histórico A..E abaixo, com casos, SHAs e limites.
  R4/B2 e provas servidor não foram reexecutados nem convertidos em PASS atual.

O servidor dedicado compila os componentes em memória, escuta exclusivamente em
`127.0.0.1:4179`, não carrega `.env`, não inicia Next e não expõe writer/proxy.
Playwright intercepta requests de negócio antes de qualquer writer; origem
externa, loja não sintética e rota desconhecida são recusadas. Banco não foi
acessado. O driver sintético aciona o `retrySyncSale` real; não homologa o botão
de Histórico de Vendas, Auth.js, impressão física ou o layout com CSS produtivo.

## Parada REV2

`COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT`: a correção requer nova decisão humana
de escopo, pois `components/dashboard/vendas/pdv-classic.tsx` não pertence à
allowlist. Não se substituiu o retry por reconfirmação do carrinho nem se
fabricou um evento na fixture. As outras superfícies não foram promovidas por
analogia; nenhuma nova cobertura foi executada após identificar o blocker.

O typecheck canônico também falhou por ausência de `generated/prisma`, com
erros em cadeia; não é PASS. Detalhes e validações estão na evidência própria.
Sem commit técnico aprovado, R, close DONE, push ou PR.

```text
ENVIRONMENT_ISOLATED=YES_SYNTHETIC_IO
N5_B1_CLOSEOUT=BLOCKED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
NEXT_STEP=RESOLVER_GATE_COM_EVIDENCIA
```

---

## Histórico REV1 preservado (não representa a cobertura REV2)

# PDV Core N5-C — matriz final 002 (bloqueada)

GOAL: `PDV-PARITY-N5-C-E2E-002` · trilha `pdv` · 2026-10-18.
Base inspecionada: `180a2f2ab450cc2686b5087dc09b1a0ee58b5f72`.
Branch: `goal/pdv-parity-n5-c-e2e-002`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.

**Resultado: BLOCKED por cobertura funcional do cenário E.** Não há declaração
de cobertura E2E mínima completa, encerramento técnico ou homologação produtiva.
A execução parou no inventário, antes de implementar fixtures ou iniciar browser,
ao comprovar uma divergência concreta entre o aceite e o código da base.

## Pré-condições confirmadas

- `origin/main` atualizada por fetch: SHA igual à main observada acima.
- PR #281 MERGED; merge `17510806bdfe736f6bc8a19ec732b7fd035de69b`
  ancestral da base. N5-B2 DONE no ledger da trilha `pdv`, com fechamento
  favorável já integrado; parecer R Anthropic pertence à entrega B2.
- N5-C era o único GOAL READY/atual de `pdv`; `status pdv` e `open pdv`
  executados na branch/worktree declaradas, tentativa 1/3.
- Nenhum marcador `.aep-active` encontrado nas worktrees PDV inventariadas;
  nenhuma outra sessão PDV ativa no inventário do app. WIPs externos preservados.
- Allowlist: somente configuração, fixture e spec E2E dedicados, este documento
  e a evidência própria. Nenhuma permissão de alteração produtiva.

## Legenda e alcance

`TESTED`: ligação E2E exercitada nesta execução, com evidência suficiente.
`PARTIAL`: contratos/provas anteriores existem; a ligação E2E desta execução
não foi concluída. `BLOCKED`: há impedimento concreto ao aceite.
`UNSUPPORTED_BY_DESIGN`: capacidade intencionalmente ausente.

Nenhuma célula é TESTED. Os cinco cenários são exigidos nas quatro superfícies;
a ausência de auditoria na Assistência não é uma diferença intencional.
Next/Black permanecem fora desta matriz.

## Matriz 5 × 4

| Cenário F-08 | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| A. Split: meios, soma, saldo, confirmação | PARTIAL — A | PARTIAL — A | PARTIAL — A | PARTIAL — A; entrada pelo modal |
| B. Vale/crédito: documento, atribuição, saldo, readback | PARTIAL — B | PARTIAL — B | PARTIAL — B | PARTIAL — B |
| C. À Prazo: entrada, parcelas, títulos | PARTIAL — C | PARTIAL — C | PARTIAL — C | PARTIAL — C; cliente obrigatório |
| D. PENDING/retry: identidade e confirmação única | PARTIAL — D | PARTIAL — D, R4 | PARTIAL — D | PARTIAL — D, R4 |
| E. Audit: `sale_finalized` após CONFIRMED e retry sem duplicar | PARTIAL — E | **BLOCKED — E1: emissor ausente** | PARTIAL — E | PARTIAL — E |

Totais: TESTED=0; PARTIAL=19; BLOCKED=1; UNSUPPORTED_BY_DESIGN=0.
Referências A–E estão discriminadas abaixo; não representam execução E2E.

## Inventário reaproveitável

Todos os caminhos abaixo existem na base. Os SHAs são os últimos commits que
alteraram os respectivos arquivos, obtidos com `git log -1 --format=%H -- <path>`.
Os testes não foram reexecutados nesta sessão. Inspeção do contrato não é PASS
atual nem prova de persistência num banco real.

| Ref. | Arquivo/caso existente | SHA do arquivo | Resultado/limite da prova |
| --- | --- | --- | --- |
| A | `lib/pdv-payments.test.ts`: split PIX + dinheiro com troco | `57b591b6e5e9e81ea707a027c78b6e8976f2501b` | Contrato puro de valores; falta interação E2E até confirmação |
| A, B | `lib/pdv/parity-payment-props.test.ts`: props/capabilities nas quatro bordas; `meta.creditDoc` | `ec59559d902cda411816f4a299f3322f513fc632` | Matriz/guard estático; não executa todo o fluxo |
| A, B, D | `lib/pdv/parity-finalize-behavior.test.ts`: titular terceiro, intenção em voo, PENDING/reconfirmação | `6a11693478a4341a0d15ed22d57eb35e1f09b3aa` | Helpers reais com I/O sintético; não substitui ligação completa do browser |
| B | `lib/ops-upsert-venda-vale.test.ts`: vale puro e dinheiro + vale | `dc7e1e60a5acfbad7910a521e3872dda1f2f3e9e` | Motor servidor com TransactionClient em memória; caixa exclui vale, débito observado |
| B | `lib/ops-upsert-venda-vale-concorrencia.test.ts`: vale 40/venda 30; FIFO; double-spend | `785236b93688b9b466ebc317fb51f9bdf724a423` | Motor servidor com transação/rollback simulados; não prova concorrência de DB produtivo |
| C | `lib/ops-upsert-venda-aprazo.test.ts`: entrada + 3 parcelas, títulos somando o saldo | `c9a9cc0226f3b274972a4263529568039f651994` | Motor servidor real com TransactionClient fake; não prova readback E2E |
| C, D | `lib/ops-upsert-venda-pix-aprazo-resync.test.ts`: reenvio sem duplicar venda, CR ou estoque | `4ab7ee1c46f396a68dd3eb9a72d0d95f013c5ca2` | Idempotência do contrato servidor com I/O em memória |
| D | `lib/vendas/sale-client-sync.test.ts`: rede/capability desconhecida não viram V1 | `c8937dd3c87a922220bc19dca250061998aa9169` | Helpers de transporte; não executa UI de Reenviar |
| D | `lib/vendas/local-sale-identity.test.ts`: identidade opaca, chave estável | `3f2af81314f22709b2115182c562f970bc1085e9` | Contrato puro; não prova confirmação única no browser |
| E | `lib/pdv-pending-post-sale-effects.static.test.ts`: guard PENDING e efeitos CONFIRMED | `7d4c2b79edf6e8c1910b8e221d97a49ee01085a2` | Prova estática; ramo Assistência não exige `sale_finalized`, ver E1 |

R4: `docs/ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md`
registra PASS histórico de 46 arquivos/662 testes e de 34/34 casos de componentes
R4, usando providers/I/O sintéticos. Isso cobre preservação da identidade e
reentrada em Assistência/Venda Completa, não os cinco E2E por superfície.
Esse resultado histórico não foi transportado como PASS da base atual.

B2: `docs/ai-execution/_evidence/PDV-PARITY-N5-B2-PIN-KEYMAP-001.md`
registra 119 testes PASS (100 de componentes); motor de finalização sintético.
Reaproveita-se a infraestrutura conceitual, sem duplicar a suíte nem reexecutar R4.
`e2e/specs/02-pdv-vendas.spec.ts` e `06-pdv-caixa-historico.spec.ts` não são prova
dos cinco cenários completos, conforme o GOAL ativo.

## E1 — blocker de cobertura audit-log

Inspeção AST TypeScript dos componentes reais da base encontrou chamadas
`appendAuditLog({ action: "sale_finalized", ... })` em:

| Superfície | Arquivo | Linha da chamada | Blob Git da base |
| --- | --- | --- | --- |
| classic | `components/dashboard/vendas/pdv-classic.tsx` | 2286 | `5aeb058201d06154bf6bb541e09d2ebab8fedb63` |
| assistencia | `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | **nenhuma** | `185085ca7536a4f9d263b988e9d609ea46421678` |
| supermercado | `components/dashboard/vendas/pdv-supermercado.tsx` | 1823 | `8b9b49153bd10ab73a398608064e3b98cf14cea3` |
| venda-completa | `components/dashboard/vendas/venda-completa-enterprise.tsx` | 1055 | `d70fdd07ea2b69c7a8c74fcd4d41a81896a4e1c7` |

Na Assistência, `handlePaymentConfirm` ocupa 1918–2181. O guard PENDING retorna
em 2095–2111. O ramo CONFIRMED segue para títulos locais, fila auxiliar,
reset em 2150 e toast de sucesso em 2164, sem emissão de `sale_finalized`.
O identificador não ocorre em nenhum trecho do componente.

Também não há `sale_finalized` em `lib/operations-store.tsx`,
`lib/pdv-finalize-integrity.ts`, `lib/events/event-bus.ts` ou
`lib/automation/automation-engine.ts`. O evento local `venda_finalizada` do motor
é outro contrato; não substitui o audit-log exigido no cenário E.

O teste estático existente define para Assistência
`requiredInConfirmed: ["setAutoPrintInput", "Venda finalizada"]`, sem exigir
auditoria. Assim, sua prova anterior não resolve esta lacuna. A linha 22 da
auditoria N5 descrevia paridade de audit; a base atual contradiz essa descrição.

Conclusão limitada à inspeção do código: **o aceite positivo do audit-log na
Assistência não pode ser satisfeito pela implementação atual**. Não se trata de
uma falha E2E executada. Corrigir exige um path produtivo não autorizado; criar
um emissor na fixture ou aceitar somente ausência de evento mascararia o problema.

## Ambiente, validação e parada

Nenhum servidor, browser, autenticação, `.env`, banco, venda, caixa, estoque ou
pagamento foi usado. O ambiente E2E não foi provisionado nem verificado:
`ENVIRONMENT_ISOLATED=NOT_STARTED`. O bloqueio é de cobertura, não uma alegação
de ambiente inseguro. Nenhum teste novo, skip ou suite duplicada foi criado.

`node scripts/track.mjs verify --all`: PASS, 11 trilhas, REGISTRY/GATES íntegros
antes do bloqueio. `git diff --check`: PASS. E2E canônico e typecheck:
NOT_RUN, parada obrigatória no inventário; nenhuma alteração TypeScript.

`PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`

`N5_B1_CLOSEOUT=BLOCKED`

Persistem os riscos operacionais já declarados: acesso autenticado, loja/terminal,
oito combinações do smoke B1, hardware e operação física. Nenhuma frente nova
foi iniciada. N5-C não é DONE; revisão R e PR não foram iniciados. A retomada
depende de decisão humana pelo rito AEP para resolver E1 e reautorizar o escopo.

`NEXT_STEP=RESOLVER_GATE_N5_C`
