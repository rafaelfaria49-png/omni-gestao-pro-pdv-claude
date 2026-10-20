# N5-C rev4 — planejamento final da auditoria de retry

Autorização humana: `PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005`, 20/10/2026
(America/Sao_Paulo). Executor: Codex, família `openai`. Trilha: `pdv`.
Este relatório registra planejamento; não é aceite da implementação nem revisão R.

## Pré-flight e ancestralidade

- `git fetch origin`: PASS. `origin/main` confirmou a main observada
  `13700862405a89da3c7d16702318735a88348133` (PR #288).
- Worktree de implementação observada, sem alteração:
  `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`, branch
  `goal/pdv-parity-n5-c-e2e-002`, HEAD
  `0ca9eb1a28d254822db60f69cdcd6be868424101`, sem `.aep-active`.
- `git rev-list --left-right --count origin/main...0ca9eb1`: `0 2`.
  O pai `d0ef175f2438f1c302431f81dbe5530968c5a658` altera somente matriz/evidência;
  `0ca9eb1` ratifica o BLOCKED rev3 com o AEP. Nenhum commit técnico/WIP nessa cadeia.
- Branch `plan/pdv-n5-c-rev4-retry-audit`, worktree
  `C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev4-retry-audit`, criada
  diretamente do BLOCKED rev3 completo acima. Não se copiou WIP.
- `git merge --no-edit origin/main`: `Already up to date.`; main já é ancestral.
  Não houve conflito ou necessidade de reescrever qualquer histórico.
- `status pdv` inicial: BLOCKED, 4 DONE, 1 BLOCKED projetado, 7 linhas físicas.
  `verify --all` inicial: PASS, 11 trilhas e REGISTRY/GATES coerentes.

## Bloqueios e cobertura histórica preservados

O ledger mantém exatamente os três eventos executados desse GOAL, todos na
tentativa 1, bloqueados por gate; as sete linhas totais permanecem integrais.

| Timestamp UTC | Motivo preservado |
| --- | --- |
| 2026-10-18T23:26:54.741Z | COVERAGE_BLOCKED_AUDIT_ASSISTENCIA |
| 2026-10-19T03:19:51.885Z | COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT |
| 2026-10-20T02:23:10.854Z | COVERAGE_BLOCKED_SUPERMERCADO_RETRY_AUDIT |

O resultado rev3 está registrado no commit documental: **13 PASS, 1 FAIL,
6 NOT_RUN** no E2E; **13 TESTED, 6 PARTIAL, 1 BLOCKED** na matriz.
Classic A..E/Assistência A..E passaram, Supermercado A..C passou; Supermercado
D falha na auditoria. Supermercado E e Venda Completa A..E não executados.
Os 12 testes de componente Classic/Assistência e o typecheck PASS são evidência
da execução rev3 sobre WIP, não novas execuções nem um commit técnico publicado.

Os blobs históricos abaixo são idênticos aos de `0ca9eb1`; nenhum desses arquivos
recebe edição nesta revisão de planejamento:

| Arquivo | Blob Git preservado |
| --- | --- |
| docs/execution-tracks/pdv/LEDGER.jsonl | 6a148504ea2f4955d17d6849f7d5bb0c464ff5af |
| docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md | d8bc55e36d43b1b0312eecc44a199ac945668420 |
| docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md | 7fc29d8757c4744b3277acf6ed9b516824306cbf |

## Sete WIPs: fingerprints do conteúdo original

Os hashes `git hash-object` coincidem com os sete fingerprints rev3 da evidência.
SHA-256 também registra os bytes físicos, inclusive EOL; não são SHAs de commit.
Preservar esses arquivos na worktree de implementação, sem stash/reset/checkout,
sem staging, cópia para o planejamento ou alteração da junction/dependências.

| Caminho | git hash-object | SHA-256 dos bytes |
| --- | --- | --- |
| components/dashboard/vendas/pdv-assistencia-enterprise.tsx | be3f4c98bafe290ba5cb50bd771565c100bc1bfd | 7EB6515B95937F2E834022A01194CEE641B6B51F8061D963239126140D0BA78B |
| components/dashboard/vendas/pdv-classic.tsx | b51c93794aa80b7b15705346ac5cc1a297222e62 | B18F478454349D24C5F0B239AFEF0CF90342B5F62B6F56AF9ABD0B0F8B150730 |
| e2e/fixtures/pdv-core.ts | 5bc8b515c058111d2c0decbf58a5f9adcb8c7718 | 56E33A5C656A3834C4A25A4978296E0E6BB2A94AFEDA6548499F6F02DFF2BB9B |
| e2e/pdv-core.playwright.config.ts | cb8a7652f45fbffe48a7b7bcc708b01091597ad7 | 3FBB0979A314B742C54EE91A1927738C07DD9A71B5187D1E396175419720D6C3 |
| e2e/specs/pdv-core-n5.spec.ts | e265ff1aab7b0f47fb11064bcccff35814fcbdae | 54565B90F9841461CD49463BC1BC94B35B8E8B115F7C84333B397D53203BA85B |
| lib/pdv/parity-assistencia-finalize-audit.component.test.ts | 5114c9adc813bd6879e136310563b04a42da2556 | 92D5B5450825D8D2285401BF7D27F25D1A37C4687CFEDE98FB4186759E1F749F |
| lib/pdv/parity-classic-finalize-audit.component.test.ts | 56eb42dec353db49f3272ed4215df8478620dfac | B17489EAA3B43E2FE1A84E8DF89C1819029CE90913F8277204F4EFF0378396FE |

## Venda Completa: checagem de contrato read-only

Fonte: `components/dashboard/vendas/venda-completa-enterprise.tsx` no HEAD rev3
e na main observada, blob `d70fdd07ea2b69c7a8c74fcd4d41a81896a4e1c7`.
Nenhum WIP nessa superfície. O componente lê `sales` em 214; os guards 803/876
recusam nova confirmação da pendência própria. Draft restaura a identidade em
386 e salva em 408. `finalizeSaleTransaction` é chamado em 960; FAILED retorna
em 977–980, PENDING registra/persiste identidade em 989–1014 e retorna em 1015.
A única emissão de `sale_finalized` está em 1055–1060, após esse retorno,
no caminho direto. Os efeitos do componente não emitem auditoria após o retry.

Em `lib/operations-store.tsx`, lido sem alteração, `retrySyncSale` (1681–1684)
chama `doRetrySyncSale`, que usa `persistPendingSale` (1673). A confirmação
1518–1528 faz `markSaleConfirmed`, atualiza o snapshot em `sales` e emite
`venda_finalizada`; não chama o handler da Venda Completa nem `sale_finalized`.
Isso confirma exposição equivalente no retry por inspeção de fluxo e fontes.
**Não houve E2E da Venda Completa nesta sessão nem falha runtime comprovada.**
Seus cinco casos permanecem NOT_RUN/PARTIAL até execução isolada futura.

## Ritual, escopo e próxima execução

O mesmo GOAL move de `_closed/goals/` para `goals/`, com `status=READY`,
`plan_rev=4` e `plan_ref=PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005`.
Derivados vêm somente de `node scripts/track.mjs registry`; ledger nunca é
editado. Não se executa `open`/`close`: esses comandos iniciariam/encerrariam a
implementação futura, enquanto esta autorização é somente de planejamento.

Preservados todos os dez padrões da allowlist rev3, acrescentando somente:

- `components/dashboard/vendas/pdv-supermercado.tsx`.
- `lib/pdv/parity-supermercado-finalize-audit.component.test.ts`.
- `components/dashboard/vendas/venda-completa-enterprise.tsx`.
- `lib/pdv/parity-venda-completa-finalize-audit.component.test.ts`.

O GOAL rev4 contém o contrato completo: CONFIRMED direto = um `sale_finalized`,
FAILED/PENDING = zero, PENDING→retry CONFIRMED = um; identidade estável,
loja/venda original, `saleId` canônico e snapshot real de total/breakdown;
render/remount/retry repetido sem duplicação. Não reconstruir do carrinho atual,
inventar payload na fixture, confundir eventos, alterar motor/API de auditoria
ou prometer deduplicação transacional entre abas.

Após merge humano e novo comando: preservar os sete WIPs, corrigir Supermercado
D, executar os seis NOT_RUN e validar os cinco F-08/20 combinações, preservando
Classic/Assistência. Ambiente isolado e nenhuma escrita produtiva. R independente
por outra família (`anthropic` ou `humano`) obrigatória sobre implementação,
testes e matriz final; esta análise não substitui R. Sem prova não promover
PARTIAL/BLOCKED a TESTED. Sem N6/N7 ou novo GOAL funcional.

## Validação e publicação do planejamento

| Verificação nesta sessão | Resultado |
| --- | --- |
| `node scripts/track.mjs registry` | PASS, exit 0; somente projeção PDV muda em conteúdo |
| `node scripts/track.mjs verify --all` | PASS, exit 0; 11 trilhas, REGISTRY e GATES coerentes |
| `git diff --check` | PASS; sem erros de whitespace |
| Metadados e allowlist | READY, plan_rev 4, mesmos id/branch/worktree/contratos; 10 padrões preservados + 4 inclusões |
| Ledger e documentos históricos | 3 BLOCKED em 7 linhas; blobs idênticos a 0ca9eb1 |
| WIP da implementação | 7/7 fingerprints Git e SHA-256 coincidentes; zero WIP incorporado |
| Escopo documental | Zero arquivos produtivos alterados, inclusive no diff completo contra origin/main |
| Derivados das outras trilhas/GATES | Conteúdo Git idêntico; sem edição manual de estado |
| Typecheck/build/E2E/Prisma | NOT_RUN nesta sessão: somente planejamento, sem alteração TS/TSX/config |

O `registry` emite LF e a worktree usa `core.autocrlf=true`; avisos de EOL não
representam alterações de conteúdo nos derivados das outras trilhas. A conferência
usa blobs/diff Git e hashes físicos do WIP; não apenas a lista de mtimes do status.
Nenhum CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT foi alterado: não houve entrega
técnica, mudança funcional ou novo estado de produção. R final continua pendente
para a implementação futura; não é blocker da publicação deste planejamento.

Commit/push autorizados somente em `plan/pdv-n5-c-rev4-retry-audit`, com um único
PR contra main. Merge permanece humano; implementação não iniciada.
`NEXT_STEP=HUMANO_MERGEAR_N5_C_REV4`. Parar após a publicação.
