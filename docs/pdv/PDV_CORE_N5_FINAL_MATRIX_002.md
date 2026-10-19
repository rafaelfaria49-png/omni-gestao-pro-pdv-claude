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
