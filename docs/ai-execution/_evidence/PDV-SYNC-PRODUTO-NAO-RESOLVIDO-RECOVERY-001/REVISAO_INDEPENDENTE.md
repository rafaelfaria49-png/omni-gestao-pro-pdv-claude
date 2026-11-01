# REVISAO_INDEPENDENTE — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Revisor: subagente Claude separado (contexto próprio, somente leitura, sem banco/rede), sobre
`git diff origin/main..HEAD`. Não é SELF_REVIEW.

## R1 — sobre `62f6de4` → **REQUEST_CHANGES** (sem P0/P1)

| # | Sev. | Achado | Tratamento |
|---|---|---|---|
| F1 | P2 | FAILED podia fechar `clientSaleId` reaproveitado do mapa compartilhado, ainda PENDING em outra aba → risco de 2 identidades | **Corrigido**: FAILED só com `!reusedIdentity` |
| F2 | P2 | Preflight da quarentena (`readProductFacts`) não espelhava a resolução por `produtoId` | **Corrigido**: usa `productResolutionKey`; teste de runtime com `db` fake |
| F3 | P2 | Pendência com `produtoId` só recebe 409 se o produto foi excluído; copy mandava "regularizar o código", o que não resolve | **Corrigido**: copy de produto excluído aponta o administrador |
| F4 | P2 | Testes do store são contrato estático, sem execução do provider | **Aceito e documentado** (sem harness de runtime do provider no repo) |
| F5 | P3 | Rota V1 não devolvia `inventoryIds` | **Corrigido** |
| F6 | P3 | Falha de rede posterior apagava a referência guardada | **Corrigido**: atribuição condicional |
| F7 | P3 | Fluxos sem `enforceStock`: `produtoId` excluído grava sem baixa (só log) | **Aceito e documentado** (fail-closed contra falso match) |

O revisor também verificou como seguros: ordem de replay antes da resolução de produto; corrida de
create → P2002 → replay; fallback V2→V1 mantém `clientSaleId`; dedupe em voo; escopo por loja;
`produtoId` fora dos fingerprints (servidor e cliente); leitores que usam `ItemVenda.inventoryId`
(cuid) ficam consistentes; PII ausente no banner/logs.

## R2 — sobre `b3369f8` → **APPROVE**

F1, F2, F3, F5, F6: FIXED, sem regressão nova (typecheck limpo; 24 arquivos / 292 testes relacionados
passando, incluindo o teste de runtime da quarentena). F4 e F7 aceitos como documentados.

Observações do revisor (não bloqueantes, registradas):
- F1: reaproveitamento por recuperação de crash numa única aba também fica PENDING (comportamento
  anterior ao patch, seguro, mas pode reproduzir a pendência travada nesse caso raro).
- F2 (P3): duas linhas com o mesmo `produtoId` e `inventoryId` diferentes reportam um só código no
  preview da quarentena (só texto de auditoria/preview).
- F3: `produtoId` de catálogo velho de outra loja também seria descrito como "excluído"; a orientação
  continua correta (recadastrar o código não ajuda nesse caso).
