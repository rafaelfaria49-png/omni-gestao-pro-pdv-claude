# PDV-PARITY-N5-C-E2E-002 — REV5: parecer R APPROVE no SHA exato

Registro: 21/10/2026 (America/Sao_Paulo), GOAL de fechamento humano
`CODEX_CLOSE_AEP_N5_C_REV5`. O responsável humano comunicou nesta conversa
o parecer independente favorável e autorizou seu registro, o fechamento AEP
condicionado aos gates, push exclusivo da branch e PR contra `main`, sem merge.

```text
REVIEWED_SHA=8d19a8bea9518c6f865dc69c67b28085bbdde6bb
R_VERDICT=APPROVE
R_EXECUTOR=Claude Code / Claude Opus 5.5
R_FAMILY=anthropic
IMPLEMENTATION_FAMILY=openai
INDEPENDENCE_VALID=YES
R_REPORTED_RESULTS=76/76 PASS
HERDADOS=45/45 PASS (11 estaticos + 34 comportamentais)
COMPONENTES=31/31 PASS
E2E=20/20 PASS
MATRIX_TESTED=20
MATRIX_PARTIAL=0
MATRIX_BLOCKED=0
N5_B1_CLOSEOUT=BLOCKED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
MERGE_AUTHORIZED=NO
DEPLOY_AUTHORIZED=NO
```

Proveniência: identidade, família e veredito R acima foram fornecidos pelo
responsável humano no pedido de fechamento. Codex (`openai`) registra esse
parecer externo e reexecuta os checks; não é o revisor R e não se declara humano.
O `INVALID_REVIEW` anterior do Codex permanece inválido como R e não é usado
como aprovação. O REQUEST_CHANGES Anthropic da rev4 permanece histórico abaixo.

## Reexecução aprovada em Node 24.x — 22/10/2026

Retomada humana do mesmo GOAL, na mesma worktree e tentativa **2/3**,
sem novo `open`, reinício ou alteração de código. HEAD de entrada:
`e51c0d4fd8498614cceb331467ce0f0e7369cd18`; SHA técnico revisado preservado:
`8d19a8bea9518c6f865dc69c67b28085bbdde6bb`. A diferença entre eles contém
exclusivamente os dois documentos de evidência/matriz do parecer R.

Runtime confirmado: **Node v24.19.0**, executável
`C:/Users/rafae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Preservado o diretório temporário já aprovado
`C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002/test-results/n5c-vitest-tmp`:
`TEMP`, `TMP` e `TMPDIR` apontam para ele somente no processo de execução.
Mantido `NODE_OPTIONS=--no-experimental-webstorage`, com a guarda
`'localStorage' in globalThis` retornando `false`. PATH do processo prioriza
o Node 24; nenhuma configuração global, dependência ou asserção foi alterada.
O diagnóstico EPERM anterior não foi repetido.

Comando executado com esse runtime e ambiente:

```text
node node_modules/vitest/vitest.mjs run lib/pdv-pending-post-sale-effects.static.test.ts lib/pdv/current-main-correction.component.test.ts lib/pdv/parity-classic-finalize-audit.component.test.ts lib/pdv/parity-assistencia-finalize-audit.component.test.ts lib/pdv/parity-supermercado-finalize-audit.component.test.ts lib/pdv/parity-venda-completa-finalize-audit.component.test.ts --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile C:/Users/rafae/.codex/visualizations/2026/10/21/01a15f8e-23f4-7152-952b-d51fe767512a/n5-c-rev5-close-node24-vitest.json
```

Resultado: **76/76 PASS**, exit 0, seis arquivos, zero falhas/skips/TODOs.
Herdados: 11 estáticos + 34 comportamentais = **45 PASS**. Componentes:
Assistência 10, Classic 7, Supermercado 7, Venda Completa 7 = **31 PASS**,
incluindo remount, snapshot confirmado, isolamento por loja e deduplicação.
Relatório JSON acima, SHA-256
`49bbfc61359a6e2ceedfe0e1868b48f8c22026e91ad6a587cdbc8e25cb40d597`.
Log bruto adjacente: `n5-c-rev5-close-node24-vitest.log`.

Árvore limpa antes/depois da execução; código revisado integralmente idêntico.
Ledger mantém oito linhas e os quatro BLOCKED históricos, SHA-256 dos bytes
locais `1b1c49dafd2ba9df7840e7bee1454ab5ff3a55c55baa5597776830ead23a945b`.
Main atualizada por fetch: `15cbaac55e0473cc1ca27695c10b2fcf1e4f52a5`,
sem commits novos na allowlist ou nos caminhos produtivos protegidos do PDV.
Lint e typecheck aprovados na sessão anterior são preservados, sem repetição
nem mudança técnica posterior. Próximas ações condicionadas: commit desta
evidência, `verify --all`, `check pdv` e, somente com gates aprovados,
`close pdv`; depois verificar DONE e publicar apenas a branch autorizada.

## Reprodução do remount e contratos aprovados

Os casos em `lib/pdv/parity-assistencia-finalize-audit.component.test.ts`
mantêm o `OperationsProvider` real, iniciam PENDING, desmontam somente a tela
e confirmam pelo retry real com a mesma `clientSaleId` nos dois POSTs. Antes
da volta, a venda é `VDA-N5C-1`, total 190, `syncPending=false`, sem auditoria
definitiva emitida pela tela ausente. Com o cache alterado, expirado ou ausente,
o remount emite exatamente um `sale_finalized` com loja, identidade, total e
breakdown do snapshot confirmado. Novos remounts/renders/retries mantêm um
evento, uma venda e o estado de negócio. Loja alheia e resposta em voo após
troca de loja preservam os marcadores de origem e destino; FAILED/PENDING
continuam sem auditoria definitiva. São dez casos da Assistência, incluindo
os cinco novos de remount/isolamento, dentro dos 31 componentes aprovados.

Os dois herdados preservam os 11 e 34 casos e seus contratos de identidade,
cache/TTL, loja, hold/resume, snapshots e bloqueio de reconfirmação. A matriz
rev5 abaixo referenciada contém os cinco F-08 (split, vale, À Prazo,
PENDING/retry, audit-log) nas quatro superfícies, com 20 TESTED e zero skips
no conjunto aprovado. Comandos, provas e resultados do candidato estão no
registro rev5 preservado a seguir e em `docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md`.

## Limites preservados e condição de fechamento

I/O sintético fail-closed em loopback, sem servidor Next, `.env`, DB/API ou
autenticação de produção. As fixtures não homologam persistência/automação
server-side, hardware, operação física nem acesso autenticado real. A
deduplicação local permanece limitada às 500 entradas retidas; sem storage,
a memória cobre apenas aquela montagem. Os oito cenários do smoke B1 e os
dois estados operacionais BLOCKED acima continuam pendentes.

Nenhum blocker técnico pendente foi comunicado no parecer R APPROVE. Os quatro
eventos BLOCKED do ledger são históricos append-only e devem permanecer
literais. Este commit documental não altera implementação nem marca DONE.
Após ele, reexecutar ESLint focado, typecheck, 76 regressões, 20 E2E,
`verify --all` e `check pdv`; somente com PASS executar `close pdv` e verificar
novamente ledger, state, relatório, diff documental e árvore limpa. Apenas
o script AEP poderá acrescentar o DONE deste GOAL e gerar o commit oficial.

---

## Registro rev5 anterior ao recebimento do parecer, preservado integralmente

# PDV-PARITY-N5-C-E2E-002 — REV5: candidato técnico validado, R pendente

Data: 21/10/2026 (America/Sao_Paulo). Executor: Codex, família `openai`.
Branch/worktree: `goal/pdv-parity-n5-c-e2e-002`,
`C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
MAIN_BASE=`8aed9e1d7c7891fd1e6f53b60da53679be0f1117`, PR #293 MERGED.
INTEGRATION_COMMIT=`fce7ba872a76fd7ae6ce127dfac31e722a701252`.
O SHA do candidato técnico e o novo parecer serão registrados na seção R.

## Retomada canônica e preservação

HEAD inicial `01b9c0e94dc3867744b54764ee2d36620e10769d`, árvore limpa,
sem `.aep-active`. Confirmados PR #293 MERGED e origin/main ratificada.
Merge normal preserva `cdda749`, `a21e9a6`, `01b9c0e` e suas evidências.
O único conflito textual foi REGISTRY derivado; o merge também carregaria o
GOAL BLOCKED para `_closed/goals/`. Resolvido pelo GOAL READY/rev5 exato da
main no caminho quente e por `registry`, sem editar ledger/state à mão.
Comparação por blobs confirmou os 11 arquivos técnicos históricos intactos
antes do corretivo, o GOAL idêntico ao publicado e o ledger igual ao BLOCKED.
Nenhum stash/reset/descarte, nenhuma escrita em outra worktree ou em Cadastros.

`status pdv`/`open pdv` canônicos: mesma GOAL READY/rev5, base acima,
16 padrões, zero gates liberados. Os quatro eventos BLOCKED continuam
literais; não se fabricou evento READY. Artefato Prisma já existente e
ignorado foi preservado; sem geração, dependência, migration ou credencial.

Corretivo registrado por `attempt pdv --fail`, tentativa atual **2/3**.
Rodada paralela intermediária: 70 PASS/6 FAIL; rodada serial seguinte:
73 PASS/3 FAIL, estes nos novos casos antes da confirmação. O setup dos
novos casos foi alinhado ao `mount()` existente, aguardando efeitos do
provider; nenhum assert/timeout foi relaxado. A rodada final abaixo passou.

O `registry` gerou falsos modificados por LF/CRLF em dez estados de outras
trilhas. A primeira atualização do índice foi recusada pela revisão automática.
Conferidos, para cada path, os três hashes working/index/HEAD idênticos; nova
revisão autorizou recarregar apenas o cache do índice. Zero conteúdo alterado
nesses paths e zero diff staged. Não integram o commit técnico.

## Corretivo produtivo e duas suites herdadas

Somente `pdv-assistencia-enterprise.tsx` muda em produção nesta rev5:

- Marcador próprio por loja, separado do carrinho/TTL, com restore em state
  reativo. Guarda apenas identidades retornadas com `result.ok` pelo handler.
- Observador cruza identidade original com `sales` e `syncPending === false`;
  usa saleId canônico, total e breakdown do snapshot confirmado. Não usa o
  carrinho atual nem audita vendas históricas indiscriminadamente.
- Deduplicação pelo log local retido e remoção do marcador atendido. Retry e
  remount apenas auditam; não reexecutam finalização, impressão ou efeitos
  de estoque/caixa/financeiro. FAILED/PENDING mantêm zero eventos definitivos.
- Resposta após troca de loja grava só o marcador da origem, sem substituir
  state/marcador/carrinho da loja nova. O marcador alheio permanece intacto.

Preservados os cinco casos anteriores da Assistência, com cinco novas provas:
confirmação durante desmontagem com carrinho alterado, expirado ou removido;
loja alheia; e resposta em voo após troca de loja. Provider global real é
mantido, assim como PaymentModal, motor, retry e audit-log reais. Conferem
identidade nos POSTs, snapshot, auditoria única, estado de negócio imutável
após novos remounts e ausência de duplicação em novo retry.

`lib/pdv-pending-post-sale-effects.static.test.ts`: **11 casos preservados**.
As três incompatibilidades foram corrigidas acompanhando a fiação real até
o observador: FAILED sai antes do registro; identidade vem do resultado;
scope da loja, match da identidade e CONFIRMED precedem o emissor único;
snapshot/deduplicação são verificados no próprio efeito. Todas as negativas
de gap/PENDING, impressão/cupom e dispatch server-side permanecem. Não basta
buscar `sale_finalized` em qualquer trecho do arquivo.

`lib/pdv/current-main-correction.component.test.ts`: **34 casos e asserts
preservados**. Removido mock incompleto de audit-log, usando implementação
real e fetch sintético. Fixtures PENDING/CONFIRMED têm snapshot completo de
venda, sem mudar identidade, cache, TTL, loja, hold/resume, snapshot antigo
ou bloqueio de reconfirmação. Nenhum skip, supressão ou assert removido.

Classic, Supermercado, Venda Completa e E2E/fixtures/config permanecem
byte a byte nos blobs técnicos históricos. Nenhum motor/backend/helper
compartilhado, auth, schema, config global ou código Cadastros alterado.

## Validações finais executadas

| Comando/prova | Resultado |
| --- | --- |
| `npx vitest run lib/pdv-pending-post-sale-effects.static.test.ts lib/pdv/current-main-correction.component.test.ts lib/pdv/parity-classic-finalize-audit.component.test.ts lib/pdv/parity-assistencia-finalize-audit.component.test.ts lib/pdv/parity-supermercado-finalize-audit.component.test.ts lib/pdv/parity-venda-completa-finalize-audit.component.test.ts --no-file-parallelism --reporter=json --outputFile <artefato-local>` | 76 PASS, 0 FAIL, 0 skip; 21/10 13:12:08 BRT |
| Herdados | 11 estáticos + 34 comportamentais = 45/45 PASS |
| Quatro suites de auditoria | Classic 7, Assistência 10, Supermercado 7, Venda Completa 7 = 31/31 PASS |
| `npx playwright test --config e2e/pdv-core.playwright.config.ts` | 20/20 PASS, 0 skip, 43,1s |
| `npm run typecheck` | PASS, exit 0, após o último ajuste dos testes |
| ESLint nos 13 paths TS/TSX da allowlist | PASS, exit 0; 0 erros, 9 warnings preexistentes nas três telas intocadas |
| `git diff --check` | PASS |
| `node scripts/track.mjs verify --all` | PASS na integração; repetir após commit e close |

Relatórios brutos locais em
`C:/Users/rafae/.codex/visualizations/2026/10/21/01a15c55-5be1-7540-bb36-74501126da97/`:

| Artefato | SHA-256 |
| --- | --- |
| `pdv-rev5-verified-vitest.json` | `0cb83c7e67a59ab2752361cd2d238f23286a4c485112e17c1f14a9321de0b45f` |
| `pdv-rev5-playwright.log` | `3837cc9137430b2a796a01bf8d7d2dbdd69b063bf0abbdbe3b82e398f25b2e26` |
| `pdv-rev5-typecheck.log` | `f8ce3d71d297afb588cb389d6732def9aaf545c05ba8d6c5090fd9668a1dedfe` |
| `pdv-rev5-eslint.log` | `9d29cb066f40d916f34d4e04afc0481e9f51408f1d67f473dbc91c54eb56bcb1` |

## Limites e aceite

Matriz técnica: **20 TESTED / 0 PARTIAL / 0 BLOCKED** com prova nova. Os
históricos 19/1 e 20 E2E rev4 permanecem integrais abaixo. I/O sintético
fail-closed em loopback; sem Next/.env/DB, auth ou writer produtivo, sem
build/Docker. A fixture não prova persistência/automação definitiva do servidor,
hardware, uso autenticado produtivo ou operação física. Deduplicação local
limitada às 500 entradas retidas; falha de storage limita a memória à montagem.
`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.

R nova de família `anthropic` ou `humano` obrigatória sobre o SHA técnico
corrigido. Este registro é candidato, sem aprovação presumida nem DONE.
`R_VERDICT=PENDING` · `GOAL_STATUS=IN_PROGRESS`.
`NEXT_STEP=REVISAO_INDEPENDENTE_N5_C`.

---

## Histórico rev4 preservado integralmente

# PDV-PARITY-N5-C-E2E-002 — REV4 BLOCKED após R independente

Data: 20/10/2026. Main/base:
`16c496ad2ffe56fc6a89de237b204842494b8cbb`.
TECHNICAL_COMMIT=`cdda74979e6008e5391a9defe6af1efdca6b7e4e`.
O candidato de 13 arquivos está preservado, sem alteração produtiva após R.
Os sete WIPs foram incorporados sem descarte; os hashes e o histórico abaixo
continuam íntegros. Os 20 PASS E2E / 26 PASS focados são resultados reais,
mas a validação ampliada do mesmo contrato **falhou**. Não há aceite completo.

## Revisão independente no SHA exato

- Executor: Claude Code 2.1.288, Opus 5.5, modelo `claude-opus-5-5`.
- Família: `anthropic`; provider `firstParty`, autenticação claude.ai.
- Session ID: `8117e84d-119e-4ae6-9924-70e82056e208`.
- REVIEWED_SHA=`cdda74979e6008e5391a9defe6af1efdca6b7e4e`.
- R_VERDICT=`REQUEST_CHANGES`.
- Processo exit 0, is_error=false, terminal_reason=completed; nenhuma negativa
  de ferramenta. Ferramentas somente de leitura, zero subagentes iniciados.
  Não foi uma segunda instância OpenAI nem auto-revisão.
- Antes de R, `node scripts/track.mjs check pdv` no SHA exato passou:
  itens 1..11 PASS, item 12 informativo sem próximo GOAL; E2E canônico exit 0,
  árvore limpa, todos os 13 paths na allowlist, nenhum gate, histórico preservado
  e upstream sem mudanças no escopo. A aprovação mecânica não substituiu R.

## Comprovação executada dos P1

Comando no SHA técnico, após R e sem editar os testes:

```text
npx vitest run lib/pdv-pending-post-sale-effects.static.test.ts lib/pdv/current-main-correction.component.test.ts
Test Files  2 failed (2)
Tests       17 failed | 28 passed (45)
Start       19:06:54 (America/Sao_Paulo)
Duration    13.78s
Exit        1
```

- `lib/pdv-pending-post-sale-effects.static.test.ts`: 11 casos, 3 FAIL / 8 PASS.
  Classic, Supermercado e Venda Completa falham em `CONFIRMED preserva sale_finalized`,
  asserção na linha 180. O teste exige o token no trecho posterior ao guard;
  a implementação move a emissão para o observador de sales confirmado.
- `lib/pdv/current-main-correction.component.test.ts`: 34 casos, 14 FAIL / 20 PASS.
  Nove casos Assistência e cinco Venda Completa falham com:
  `[vitest] No "getAuditLogs" export is defined on the "@/lib/audit-log" mock`.
  O mock herdado tem appendAuditLog; a implementação passou a usar getAuditLogs.
  Inclui proteção PENDING/resolução, resposta antiga, confirmação direta e
  restauração de identidade. Trata-se de incompatibilidade comprovada com a
  suíte herdada, não de falha presumida pelo revisor.
- Ambos os arquivos estão **fora da allowlist rev4**; não foram editados.
  Não se adicionou string artificial para satisfazer o teste estático, fallback
  específico de mock, skip, relaxamento ou supressão de erro. Nenhuma correção
  produtiva foi tentada depois de comprovar o blocker fora do escopo.

R P2 (Assistência confirma enquanto desmontada) permanece **achado por inspeção**.
Não foi executado um teste específico desse caminho e ele não é declarado FAIL
runtime comprovado. Precisa de teste/correção na retomada; as cinco provas
históricas Assistência e seus hashes continuam preservados. A célula E
Assistência agora é PARTIAL por insuficiência de prova diante desse achado.
Matriz final: **19 TESTED / 1 PARTIAL / 0 BLOCKED**; bloqueio global de aceite
por R/compatibilidade fora da allowlist. Os 20 E2E executados continuam PASS.

## Encerramento bloqueado e próxima decisão

BLOCKER=`R_REQUEST_CHANGES_INHERITED_AUDIT_TESTS_OUTSIDE_REV4_ALLOWLIST`.
R está disponível e pediu alterações; a exceção de publicação quando R está
indisponível não se aplica. Sem R favorável, não há close DONE, push ou PR.
Registrar este parecer/evidência em commit documental autorizado e usar
`node scripts/track.mjs block pdv --by=gate --reason=...`; somente o script
altera GOAL/ledger/state/registry. O novo BLOCKED não reescreve os três anteriores.

Typecheck, ESLint (nove warnings preexistentes), diff --check e verify --all
passaram antes deste registro. A verificação canônica será repetida depois do
bloqueio. Nenhuma conexão/escrita em produção, migration, build ou Docker.
Prisma gerado local/ignorado, sem regeneração; nenhuma mudança de dependências.
CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT permanecem fora do escopo e intactos.

`N5_B1_CLOSEOUT=BLOCKED` · `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`.
`GOAL_STATUS=BLOCKED` (ratificação canônica subsequente).
`NEXT_STEP=RESOLVER_GATE_N5_C`. Parar nesta frente; nenhum N6/N7 iniciado.

## Parecer R integral (fonte: saída do processo Claude Code)

R_EXECUTOR=Claude Code (Opus 5.5, `claude-opus-5-5`)
R_FAMILY=anthropic
REVIEWED_SHA=cdda74979e6008e5391a9defe6af1efdca6b7e4e
R_VERDICT=REQUEST_CHANGES

O código de auditoria funciona nos caminhos que os 26 testes novos cobrem. Mesmo assim, não aprovo por dois motivos: a mudança quebra testes antigos fora da allowlist, que a validação focada não executou, e a Assistência perde a auditoria num caminho real de retry.

## Achados acionáveis

**P1 — teste estático antigo passa a falhar em Classic, Supermercado e Venda Completa**
- Teste: `lib/pdv-pending-post-sale-effects.static.test.ts:83`, `:98`, `:129`. Ele exige o texto `sale_finalized` no código que vem depois do bloco `if (result.pending) {`.
- O diff tirou o emissor desse trecho e o levou para um `useEffect` declarado antes do handler:
  - Classic: guard em `pdv-classic.tsx:2276`, `sale_finalized` só em 317/321.
  - Supermercado: guard em `pdv-supermercado.tsx:1817`, `sale_finalized` só em 261/265.
  - Venda Completa: guard em `venda-completa-enterprise.tsx:1039`, `sale_finalized` só em 311/315.
- O teste recorta o arquivo de forma fixa, então as três verificações de CONFIRMED falham. Isso vale para esses três casos; não afirmo nada sobre o caso Black, que a memória do projeto aponta como já quebrado na main.
- O arquivo está fora da allowlist e o GOAL proíbe reescrever testes herdados. A evidência diz "guards preservados", mas este guard estático foi quebrado.

**P1 — mock antigo sem `getAuditLogs` passa a quebrar com a venda confirmada**
- `lib/pdv/current-main-correction.component.test.ts:56` mocka `@/lib/audit-log` apenas com `appendAuditLog`.
- Nos casos que trocam `runtime.sales` para `resolved()`, com a mesma `clientSaleId` e `syncPending:false` (por exemplo 251–266, 285–295 e o hold/resume "resolved" em 297–316):
  - Assistência chama `getAuditLogs()` em `pdv-assistencia-enterprise.tsx:1174`.
  - Venda Completa chama `getAuditLogs()` em `venda-completa-enterprise.tsx:311`.
- Com esse mock, o vitest lança erro de export ausente dentro do efeito React. A falha é quase certa pela análise do código, mas eu não executei o teste.
- Corrigir provavelmente exige editar um arquivo fora da allowlist. Se for o caso, o executor deve parar e pedir autorização humana, sem contornar.
- Observação: `parity-pin-keymap.component.test.ts:61` usa `sales: []` e não chega a chamar `getAuditLogs`.

**P2 — Assistência não audita quando o retry confirma com a tela desmontada**
- Em `pdv-assistencia-enterprise.tsx:1183-1199`, o efeito só reexecuta quando mudam `sales`, `finalizeAuditIdentity` ou `storeIdKey`. A identidade restaurada é gravada num ref pelo efeito de restore (1293–1321), que vem declarado depois. Mudar um ref não dispara o efeito de novo.
- Diferente das outras três telas, a Assistência não grava marcador local.
- O caminho é realista:
  - O provider é global (`app/dashboard/layout.tsx` → `app-ops-providers.tsx`).
  - O `flushPendingSales` reenvia a cada 30 s (`lib/operations-store.tsx:2357`).
  - O Reenviar oficial fica em outra rota, `/dashboard/vendas-arquivo-geral`.
- Se a venda confirma enquanto o operador está fora da Assistência, a volta não gera `sale_finalized`. O evento só sai se `sales` mudar depois, e se perde quando o carrinho é limpo (`clear()` em 2276/3217), quando o TTL do carrinho vence, ou quando uma venda nova sobrescreve `finalizeAuditIdentity`.
- O teste "resolução após remount" só cobre o retry feito depois do remount.
- Isso viola "PENDING → retry CONFIRMED emite exatamente um" junto com "remount/restauração".

**P3 (não bloqueiam sozinhos)**
- Classic, Supermercado e Venda Completa (`pdv-supermercado.tsx:255-274` e equivalentes): identidades que nunca confirmam (quarentena, conflito permanente) ficam no marcador para sempre, sem limpeza.
- `trackFinalizeAudit` usa o `lojaKey`/`storeId` capturado antes do `await`. Se a loja mudar com a finalização em andamento, o estado volta para a loja antiga e o próximo `track` pode sobrescrever no localStorage o marcador restaurado da loja nova (`pdv-supermercado.tsx:248-255`). É um caso de borda.
- O texto da auditoria da Venda Completa perdeu o nome do cliente e o resumo rotulado dos pagamentos que existiam na base. Não achei código que leia esse texto (só o filtro de `app/logs-sistema`), mas a evidência não registra essa mudança de formato.

## Pontos conferidos que estão corretos
- Os 13 caminhos do diff estão dentro da allowlist.
- FAILED e PENDING retornam antes do track/emissão, então ninguém audita antes da hora.
- A ligação com a venda é pela `clientSaleId` original, e os valores vêm do registro confirmado (`syncPending:false`). O carrinho alterado depois não muda o que é auditado.
- A deduplicação usa o prefixo `Venda {id} | Loja {loja} | Total` no log local, que guarda 500 entradas, e o limite está declarado honestamente.
- Vendas de outra origem não são auditadas, e marcadores de outra loja são ignorados.
- O `auditMeta` do motor só carrega campos e não emite log, então não há auditoria duplicada na Assistência.
- O `userLabel` do Classic é equivalente ao `auditUser()` anterior.
- O guard de concorrência da Venda Completa (`[true,false]`) foi preservado, e o retry não reexecuta enriquecimento nem impressão.
- O harness E2E recusa requisições não previstas (fail-closed): origem e loja verificadas, CSP e servidor dedicado. A matriz deixa explícito o que não está provado: servidor, Auth.js e hardware.
- `N5_B1_CLOSEOUT=BLOCKED` e `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` continuam preservados.

## Honestidade da evidência e da matriz
Os 20 TESTED são coerentes com os testes descritos. Porém a evidência apresenta a validação como completa sem ter rodado as suítes antigas que conferem estas mesmas superfícies. Há também a lacuna de remount da Assistência.

## Para corrigir
1. Rodar `lib/pdv-pending-post-sale-effects.static.test.ts` e `lib/pdv/current-main-correction.component.test.ts` neste SHA e registrar o resultado.
2. Se a correção exigir editar esses arquivos, parar e pedir autorização humana para ampliar a allowlist (`NEXT_STEP=AUTORIZACAO_HUMANA_CONTRATO_AUDITORIA` ou um replanejamento).
3. Dar à Assistência o mesmo marcador persistido por loja das outras três telas e cobrir em teste o caso "confirmou com a tela desmontada → remount".

## Limitações desta revisão
- Só usei leitura: Read/Grep e comandos Git de leitura. Não executei vitest, Playwright, typecheck, ESLint nem `track.mjs`.
- As falhas P1 vêm da leitura do código e não foram executadas. A do teste estático é certa; a do mock é quase certa.
- Não conferi os hashes SHA-256 dos WIPs, a igualdade byte a byte do ledger, o estado do PR #291 nem as execuções que o executor relatou.
- Não tive acesso a produção, nem precisei.

---

## Histórico REV4 pré-R preservado integralmente

# PDV-PARITY-N5-C-E2E-002 — REV4 EXECUTION: candidato técnico validado

Data: 20/10/2026 (America/Sao_Paulo). Executor: Codex, família `openai`.
Branch: `goal/pdv-parity-n5-c-e2e-002`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
MAIN_BASE=`16c496ad2ffe56fc6a89de237b204842494b8cbb`.

## Retomada e preservação comprovadas

PR #291 confirmada MERGED pelo conector GitHub, merge SHA igual à main acima.
HEAD inicial `0ca9eb1a28d254822db60f69cdcd6be868424101`; sete caminhos WIP e
.aep-active ausente. O relatório
`docs/execution-tracks/pdv/_closed/reports/PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005.md`
forneceu os fingerprints Git/SHA-256: todos os sete coincidiram antes e depois
de `git fetch origin main` e `git merge --ff-only origin/main`.
Nenhum caminho WIP se sobrepunha ao diff da integração. Sem stash/reset/checkout,
substituição de WIP ou reescrita de histórico. Branch e worktree declaradas mantidas.

O BLOCKED rev3 e os dois anteriores continuam ancestrais. O ledger antes/depois
da integração manteve blob `6a148504ea2f4955d17d6849f7d5bb0c464ff5af`, sete linhas,
três eventos BLOCKED literais do GOAL. `status pdv` e depois `open pdv` canônicos
confirmaram READY/rev4, base correta, tentativa 1/3, 14 padrões e zero gates.
Somente o GOAL quente publicado foi usado como autorização de execução.

Classic/Assistência, seus testes, fixture e config permanecem idênticos aos
fingerprints herdados. O único WIP que recebeu evolução é o spec: seleção real
do cliente Venda Completa, espera da resposta de busca/refoco após Item Avulso
e seletor que reconhece “Confirmar valor exato” antes de digitar o dinheiro.
Asserções financeiras e distinção sale_finalized/venda_finalizada preservadas.

## Correção delimitada e testes comportamentais

Supermercado e Venda Completa registram somente identidades retornadas com
result.ok pelo próprio handler. Marcador local por loja permite observar o
retry mesmo após remount. O observador exige syncPending=false e associa a
clientSaleId original (fallback id legado), lendo saleId canônico, total e
breakdown de sales. Não reconstrói do carrinho/draft alterado nem percorre
vendas históricas indiscriminadamente. Um emissor atende confirmação direta
e retry; a leitura do log local retido deduplica venda/loja.

FAILED/PENDING não emitem auditoria definitiva. Guards, pagamento, carrinho,
draft/pendingIdentity, cupom, enriquecimento, impressão e demais efeitos
existentes foram preservados. O retry não reexecuta enriquecimento/impressão.
O teste Venda Completa verifica enriquecimento uma vez na confirmação direta
e zero enquanto pendente/depois do retry. O contrato original de concorrência
dessa superfície (segunda chamada recusada) foi preservado.

Novos testes montam as superfícies, PaymentModal e OperationsProvider reais.
Transportes e providers/subárvores periféricos são sintéticos; handler,
finalização, retry e audit-log não são substituídos. CONFIRMED direto,
FAILED, PENDING, retry, identidade estável, valores enviados, loja/canonical id,
snapshot após mudar draft, render/remount, marcador repetido, concorrência,
origem alheia e resposta em voo são exercitados.

Antes da correção, os testes reais comprovaram sale_finalized=0 após retry
nas duas superfícies e duplicação em duas chamadas concorrentes Supermercado.
Falhas adicionais de formato/loja foram cobertas. A expectativa de concorrência
Venda Completa foi alinhada ao guard existente, sem mudar esse comportamento.
Após a correção: quatro arquivos, 26/26 PASS, incluindo 12 provas herdadas intactas.

## Execuções E2E e validações

| Comando/prova | Resultado efetivamente executado |
| --- | --- |
| Vitest focado das quatro auditorias, comando do GOAL rev4 | PASS — 4 arquivos, 26 testes; execução final 17,47 s |
| E2E retomada Supermercado/Venda Completa | Supermercado A..E PASS; Venda Completa A parou no driver sem cliente; demais NOT_RUN nessa tentativa |
| E2E Venda Completa após sincronizar driver | PASS — A..E, 5 testes, 34,5 s |
| npx playwright test --config e2e/pdv-core.playwright.config.ts | PASS — 20/20, zero skips/retries, um worker, 1,3 min |
| npm run typecheck | PASS — exit 0 no conteúdo final, Prisma local existente |
| ESLint focado dos 11 TS/TSX autorizados | PASS — 0 erros; 9 warnings preexistentes |
| Baseline ESLint via lintText(git show HEAD:path) | Classic 5; Supermercado 2; Venda Completa 2; zero erros |
| git diff --check | PASS |
| node scripts/track.mjs verify --all | PASS — 11 trilhas, REGISTRY e GATES íntegros |

O primeiro Vitest restrito terminou com EPERM no rename do cache, zero testes;
a execução liberada chegou aos casos reais. Playwright restrito não iniciou
casos e foi interrompido; execução liberada usou a mesma configuração isolada.
Tentativas de driver Venda Completa revelaram cliente ausente, fechamento do
dropdown pelo autofoco e texto inicial diferente do botão de dinheiro. Foram
corrigidas apenas as interações do spec; não houve skip, resposta fabricada
de confirmação nem relaxamento de asserção. Falhas/NOT_RUN intermediários não
foram contados como PASS. A suíte canônica verde posterior executou as 20 células.

## Isolamento e limites

Harness original preservado: servidor novo em 127.0.0.1:4179,
reuseExistingServer=false, bundle em memória, sem Next, .env, Prisma runtime,
proxy ou writer de negócio. CSP/origem local e interceptação de todos os
transportes de bootstrap/caixa/persistência/audit/ledger/retry. Origem,
rota ou loja inesperada falham; resultado verde terminou sem pageerror e
sem requests inesperados. IDs exclusivamente sintéticos. Zero conexão/escrita
produtiva, migration ou seed. Nenhum dado real de negócio foi processado.

generated/prisma/client.d.ts já existia, local e gitignored; não foi regenerado,
staged ou commitado. node_modules continua com a junction preexistente.
Sem alteração de schema, motor, API de auditoria, dependências ou ambiente.
Build, Docker e R4 não foram necessários nem executados. Persistência e
automação server-side, Auth.js e operação/hardware/impressão física não são
homologados pelo harness. As provas servidor históricas da matriz são reutilizadas.

Dedupe é local, limitado à retenção do log e disponibilidade do armazenamento;
não há garantia transacional entre abas/servidor ou além dessa retenção.

## Conteúdo técnico executado — fingerprints antes do commit

A futura seção R registra o SHA exato que contém estes blobs. Não são SHAs de commit.

| Caminho | git hash-object | SHA-256 físico |
| --- | --- | --- |
| components/dashboard/vendas/pdv-classic.tsx | b51c93794aa80b7b15705346ac5cc1a297222e62 | B18F478454349D24C5F0B239AFEF0CF90342B5F62B6F56AF9ABD0B0F8B150730 |
| components/dashboard/vendas/pdv-assistencia-enterprise.tsx | be3f4c98bafe290ba5cb50bd771565c100bc1bfd | 7EB6515B95937F2E834022A01194CEE641B6B51F8061D963239126140D0BA78B |
| components/dashboard/vendas/pdv-supermercado.tsx | 93c6d1ce76e67c00879624a56bd70bb5b2c2eb02 | 3443E6C911E09220C5AFE03B18B10CD7CCC95CBDC23A83E24C7F47D2BD0E250F |
| components/dashboard/vendas/venda-completa-enterprise.tsx | acc81d6ecaaa9e57ab84f1eeda6b80baa10501ef | 87184455D5EAA5FA6C64ED348ACFBFD93D38788B8A5921874BE0DC62349B89C9 |
| lib/pdv/parity-classic-finalize-audit.component.test.ts | 56eb42dec353db49f3272ed4215df8478620dfac | B17489EAA3B43E2FE1A84E8DF89C1819029CE90913F8277204F4EFF0378396FE |
| lib/pdv/parity-assistencia-finalize-audit.component.test.ts | 5114c9adc813bd6879e136310563b04a42da2556 | 92D5B5450825D8D2285401BF7D27F25D1A37C4687CFEDE98FB4186759E1F749F |
| lib/pdv/parity-supermercado-finalize-audit.component.test.ts | dfe071e1a028be43788b2b20d881f7967305222b | 2F08AEFF9FFF40D1EAA6453F06FFECBAFBC1CDD55B095672D1C6397D1BC7A018 |
| lib/pdv/parity-venda-completa-finalize-audit.component.test.ts | cc571e75ae03ae5640342c600db8bfd77d68a8d1 | 38D1A3A9A2093255CE7CE6D88333E540F164F780CDB45C1C9511CCA40B89F4FA |
| e2e/pdv-core.playwright.config.ts | cb8a7652f45fbffe48a7b7bcc708b01091597ad7 | 3FBB0979A314B742C54EE91A1927738C07DD9A71B5187D1E396175419720D6C3 |
| e2e/fixtures/pdv-core.ts | 5bc8b515c058111d2c0decbf58a5f9adcb8c7718 | 56E33A5C656A3834C4A25A4978296E0E6BB2A94AFEDA6548499F6F02DFF2BB9B |
| e2e/specs/pdv-core-n5.spec.ts | 6ad130478d915da28284091b0cb3ed9a7d2e39e4 | 5FC6480508F9F42249ECFBE6FD8C314D265065C8F783ECFEC26661C8646B46A6 |

## Resultado do candidato e entrega condicionada

Matriz vigente: **20 TESTED / 0 PARTIAL / 0 BLOCKED / 0 UNSUPPORTED_BY_DESIGN**,
com referência de teste por célula. Duplicatas sale_finalized observadas: zero
no resultado verde das quatro superfícies. As três revisões bloqueadas abaixo
permanecem históricas; uma ratificação DONE futura não apaga esses eventos.

`N5_B1_CLOSEOUT=BLOCKED` e `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` mantidos.
CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não alterados: fora da allowlist;
não há promoção de maturidade produtiva. Somente 13 arquivos versionáveis
autorizados compõem o candidato. R deve avaliar código, cobertura, isolamento,
identidade, deduplicação e matriz sobre o SHA técnico exato; não é auto-revisão.
Neste registro pré-commit: R=PENDING, AEP=OPEN. Sem R favorável não há close DONE.
Nenhum N6/N7, Fiscal, Auth.js ou outra frente iniciado.

---

## Histórico REV3 preservado integralmente

# PDV-PARITY-N5-C-E2E-002 — REV3 EXECUTION: BLOCKED no retry Supermercado

Data local: 19/10/2026. Executor: Codex, família `openai`.
Branch: `goal/pdv-parity-n5-c-e2e-002`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
Main/base: `13700862405a89da3c7d16702318735a88348133`.
PR #288 confirmada MERGED, merge nessa base, 19/10/2026 15:42:52 -03:00.
GOAL `plan_rev=3`, inicialmente READY; AEP aberto na tentativa 1/3, dez padrões
na allowlist e zero gates. Resultado final: **COVERAGE_BLOCKED_SUPERMERCADO_RETRY_AUDIT**.

## Retomada, origem e preservação

- `status pdv` inicial confirmou os dois eventos BLOCKED, sem `.aep-active`.
  `open pdv` inicial recusou corretamente enquanto a worktree ainda estava
  na revisão antiga. Nenhum marcador ou plano foi fabricado para contornar.
- `git fetch origin main` e `gh pr view 288 --json ...` confirmaram o merge.
  `git merge --no-edit origin/main` fez fast-forward de `bc9fab7` para a base
  acima. O diff de integração não sobrepunha os cinco arquivos de WIP.
- Os cinco `git hash-object` registrados na REV2 coincidiram integralmente
  na retomada e após a integração. Nenhum stash, reset, checkout, descarte,
  troca de dependências ou recriação do WIP. Os dois BLOCKED anteriores
  continuam ancestrais e suas linhas do ledger permanecem byte a byte.
- Após integrar: `status pdv` → RUNNING/GOAL 002; `open pdv` → base correta,
  revisão 3 e allowlist publicada. Somente código/documentos autorizados
  foram escritos; Prisma é artefato local ignorado. Nenhum trabalho externo
  ou checkout principal foi modificado por esta execução.

## Implementação local testada, ainda sem commit técnico

Assistência: preserva o emissor, o dedupe e o retry existentes no WIP. A
confirmação direta também observa a identidade própria em `sales` e usa o
registro efetivamente confirmado, sem reconstruir total/pagamentos do draft.
FAILED/PENDING não emitem evento definitivo; retry confirmado emite um.

Classic: registra somente identidades cujo handler real teve resultado ok.
O marcador local por loja permite reencontrar essas identidades após remount;
o observador aguarda `syncPending === false` e lê id/total/breakdown de `sales`.
A mesma passagem atende confirmação direta e retry, com dedupe pelo prefixo
id canônico/loja no log retido. Marcadores concluídos são retirados. Vendas
históricas/de outra origem não são auditadas. Preservados guard de pendência,
fluxo de venda e efeitos pós-venda. Sem garantia nova entre abas/servidor ou
além da retenção local, sem alteração do motor/operations-store/audit-log.

Novo teste Classic (7 casos) monta PdvClassic, PaymentModal e OperationsProvider
reais; apenas providers periféricos e fetch são sintéticos. Cobre confirmação,
FAILED, PENDING, retry real com identidade estável, snapshot com draft alterado,
remount/restauração repetida, concorrência do handler, origem/loja e resposta
em voo. O teste Assistência original continua com seus 5 casos, sem substituição
de handler, finalização ou retry. São 12/12 PASS no comando focado final.

Config/fixture E2E preservadas. No spec foi corrigida somente a tecla de
seleção de cliente no Supermercado (F10 oficial; F2 = dinheiro). Asserções
continuam exigindo separadamente `sale_finalized` e `venda_finalizada`.

## Falha runtime que exige parar

Comando final: `npx playwright test --config e2e/pdv-core.playwright.config.ts`.
Resultado: **13 PASS, 1 FAIL, 6 NOT_RUN**, 20 casos selecionados, um worker,
retries=0, maxFailures=1, duração 1,1 min. Não há 20 PASS.

Caso: `supermercado > D PENDING/retry — Reenviar conserva identidade e aplica confirmação uma vez`.
Falha em `e2e/specs/pdv-core-n5.spec.ts:160`:

```text
expect(audits()).toHaveLength(1)
Expected length: 1
Received length: 0
Received array: []
```

Antes da falha passaram: PENDING com zero auditoria/notificação definitiva,
caixa sem entrada, dois POSTs com a mesma clientSaleId, uma venda confirmada,
um evento UI `venda_finalizada`, retry repetido sem novo POST/evento. Portanto
notificação não substitui auditoria e o retry não recriou o carrinho/venda.
Classic A..E e Assistência A..E passaram; Supermercado A..C passaram.
Supermercado E e Venda Completa A..E não executados pela parada automática.
Matriz vigente: **13 TESTED / 6 PARTIAL / 1 BLOCKED / 0 UNSUPPORTED_BY_DESIGN**.
D Supermercado é PARTIAL; E Supermercado é BLOCKED porque inclui retry.

Inspeção focada: `pdv-supermercado.tsx:1767-1790` retorna em PENDING; a única
emissão `sale_finalized` está em `1823-1827`, no caminho direto. O componente
recebe `sales` mas não tem emissor de auditoria na confirmação via retry.
A fixture apenas intercepta os transportes; não substitui handler/motor/retry
nem injeta eventos. O defeito é APPLICATION_AUDIT_GAP em caminho produtivo
fora da allowlist REV3. Nenhuma correção nessa superfície foi aplicada.
Venda Completa não recebeu execução posterior nem diagnóstico runtime presumido.

## Isolamento e Prisma

Servidor novo em 127.0.0.1:4179 com reuseExistingServer=false, bundle em memória,
sem Next, carregador .env, proxy, backend real ou writer. CSP/origem local e
interceptação de bootstrap/caixa/persistência/auditoria/ledger/retry; rota,
origem ou loja inesperada falham. Todos os casos executados encerraram sem
requests inesperados e sem pageerror. IDs sintéticos de loja, caixa, cliente,
produto e operador. Nenhum banco, credencial, venda, estoque ou pagamento
produtivo foi acessado. Nenhum DB foi necessário.

Prisma: todos os ancestrais absolutos de generated/prisma verificados sem
junction/symlink/reparse point; destino ausente antes da geração, local depois.
node_modules continua sendo a junction preexistente, sem alterações. Raiz e
prisma sem .env carregável; somente .env.example presente. Sem prisma.config
extra carregado. Em PowerShell, no processo:

```powershell
$env:PRISMA_GENERATE_SKIP_AUTOINSTALL = '1'
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/n5_c_isolated'
$env:DIRECT_URL = $env:DATABASE_URL
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
```

PASS: Prisma Client v6.19.3 gerado em ./generated/prisma (1,71 s). Nenhuma
conexão, instalação, schema, lockfile, postinstall compartilhado ou migration.
`git check-ignore generated/prisma/client.d.ts` confirma ignorado; nenhum
artefato gerado foi staged/commitado. R4, build, Docker e smoke não executados,
conforme o GOAL; não eram necessários para testar estes handlers e este bundle.

## Validações e tentativas auxiliares

- Primeiro Vitest em sandbox: EPERM no rename do cache temporário, zero testes.
  A execução liberada chegou aos componentes: Assistência 5 PASS; Classic
  precisou do provider periférico de tema. Após completar esse boundary,
  comando focado final: **2 arquivos / 12 testes PASS**.
- E2E inicial: 10 PASS, timeout no driver Supermercado ao procurar cliente via
  F2, 9 NOT_RUN. O keymap real já define F10; corrigida somente a fixture de
  interação. O E2E final acima comprova o novo blocker com asserção intacta.
- ESLint focado dos sete arquivos TS/TSX: zero erros, cinco warnings preexistentes
  no Classic (deps de hooks/disable sem uso). Nenhum warning desse conjunto
  pertence ao novo observador de auditoria.
- `git diff --check`: PASS antes do registro documental.
- `node scripts/track.mjs verify --all`: PASS, 11 trilhas e REGISTRY/GATES íntegros,
  antes do bloqueio. Resultado pós-bloqueio será conferido pelo mesmo comando.
- `npm run typecheck`: PASS, exit 0, após geração local; sem diagnósticos.

## Fingerprints para retomada

Preservação original comprovada antes de editar. A tabela relaciona o conteúdo
herdado com o WIP atual, sem pretender que seja um SHA de commit:

| Caminho | Original REV2 | WIP REV3 (`git hash-object`) |
| --- | --- | --- |
| components/dashboard/vendas/pdv-assistencia-enterprise.tsx | b74eccd202a9a1eef0a12cd26393ffa26a112fbd | be3f4c98bafe290ba5cb50bd771565c100bc1bfd |
| lib/pdv/parity-assistencia-finalize-audit.component.test.ts | 5114c9adc813bd6879e136310563b04a42da2556 | 5114c9adc813bd6879e136310563b04a42da2556 |
| e2e/pdv-core.playwright.config.ts | cb8a7652f45fbffe48a7b7bcc708b01091597ad7 | cb8a7652f45fbffe48a7b7bcc708b01091597ad7 |
| e2e/fixtures/pdv-core.ts | 5bc8b515c058111d2c0decbf58a5f9adcb8c7718 | 5bc8b515c058111d2c0decbf58a5f9adcb8c7718 |
| e2e/specs/pdv-core-n5.spec.ts | ec67ad61774164d09e92d0d6518cddec6e42e1b8 | e265ff1aab7b0f47fb11064bcccff35814fcbdae |
| components/dashboard/vendas/pdv-classic.tsx | novo na REV3 | b51c93794aa80b7b15705346ac5cc1a297222e62 |
| lib/pdv/parity-classic-finalize-audit.component.test.ts | novo na REV3 | 56eb42dec353db49f3272ed4215df8478620dfac |

## Entrega bloqueada

Somente matriz/evidência terão commit documental. Os sete arquivos técnicos
permanecem não commitados na mesma worktree. Não há candidato com todas as
provas verdes; revisão R não foi solicitada sobre código não commitado.
Claude Code está instalado, mas disponibilidade de revisão não é o bloqueio
vigente: o aceite técnico falhou antes da etapa R. Sem close DONE/push/PR.
`block pdv --by=gate` registra o terceiro evento BLOCKED, preservando os dois
anteriores e a revisão 3. Somente o AEP modifica ledger/state/REGISTRY/GOAL.

```text
MAIN_BASE=13700862405a89da3c7d16702318735a88348133
REV3_STATUS=BLOCKED_SUPERMERCADO_RETRY_AUDIT
BLOCKED_HISTORY_PRESERVED=YES
WIP_PRESERVED=YES_SEVEN_TECHNICAL_PATHS
ASSISTENCIA_AUDIT=PASS_COMPONENT_AND_E2E
CLASSIC_DIRECT_AUDIT=PASS
CLASSIC_RETRY_AUDIT=PASS
SALE_FINALIZED_DUPLICATES=ZERO_CLASSIC_ASSISTENCIA
PRISMA_LOCAL=GENERATED_SAFE_IGNORED
COMPONENT_TESTS=12_PASS
E2E_TESTS=13_PASS_1_FAIL_6_NOT_RUN
MATRIX_TESTED=13
MATRIX_PARTIAL=6
MATRIX_BLOCKED=1
ENVIRONMENT_ISOLATED=YES_SYNTHETIC_IO
TYPECHECK=PASS
ESLINT=PASS_ZERO_ERRORS_FIVE_PREEXISTING_WARNINGS
VERIFY_ALL=PASS_BEFORE_BLOCK
TECHNICAL_COMMIT=NONE
R_EXECUTOR=NONE
R_FAMILY=NONE
R_VERDICT=NOT_SUBMITTED_ACCEPTANCE_FAILED
AEP_CLOSE_COMMIT=NONE
GOAL_STATUS=BLOCKED
PUSH_BRANCH=NOT_PUSHED
PR_NUMBER=NONE
PR_URL=NONE
BLOCKERS=COVERAGE_BLOCKED_SUPERMERCADO_RETRY_AUDIT_OUTSIDE_REV3_ALLOWLIST
NEXT_STEP=RESOLVER_GATE_N5_C
```

CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT permanecem sem alteração: fora da
allowlist e nenhuma entrega técnica ratificada. `N5_B1_CLOSEOUT=BLOCKED` e
`PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` preservados. Nenhum N6/N7, outra frente
ou novo GOAL iniciado. O desbloqueio exige decisão humana de escopo; este GOAL
encerra em BLOCKED, com WIP preservado para uma nova sessão autorizada.

---

## Histórico REV2 preservado

# PDV-PARITY-N5-C-E2E-002 — REV2, novo blocker comprovado

Data: 2026-10-19. Executor: Codex; família `openai`.
Branch/worktree: `goal/pdv-parity-n5-c-e2e-002`,
`C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
Main/base: `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`.
Tentativa AEP REV2: 1/3. Resultado técnico: **BLOCKED**.

## Retomada canônica

- ENTRYPOINT, CLAUDE.md e governança lidos. Worktree inicialmente limpa;
  `.aep-active` ausente. Checkout principal e WIPs externos preservados.
- `git fetch origin main`: PASS após liberar escrita de FETCH_HEAD.
  GitHub confirmou PR #285 MERGED, merge `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`.
- `git merge --no-edit origin/main`: fast-forward de `af12ed3` para `9eb59d0`,
  sem reset. `git merge-base --is-ancestor af12ed3d0159f97bb125a62a0466362f4a89af8b HEAD`: exit 0.
- `node scripts/track.mjs status pdv`, seguido de `open pdv`: PASS.
  GOAL 002 READY, plan_rev=2, sete caminhos, zero gates, base correta.
  Somente o GOAL indicado pelo open foi lido.

## Candidato local da Assistência — sem commit técnico

`pdv-assistencia-enterprise.tsx` passa a guardar o payload enviado ao motor.
Após o guard FAILED/PENDING, usa `result.saleId`/`clientSaleId` e total/breakdown
desse payload. Nenhum total/pagamento foi inventado no tipo de retorno do motor.
Como Reenviar não chama novamente o handler do modal, a resolução canônica da
identidade PENDING nas `sales` reais do motor é observada para emitir o mesmo
log com o snapshot da venda confirmada, sem reconstruir valores do carrinho.
Deduplicação local usa identidade/loja e a entrada já existente no log local.
Não cria garantia transacional de auditoria entre abas/servidor ou além da
retenção do log local; não há mudança na API de auditoria.

O contrato de retorno do modal, guard PENDING, reenvio, limpeza, impressão,
cache financeiro e pós-venda permanecem. O teste monta componente, modal e
OperationsProvider reais; fetch e providers periféricos são sintéticos.
Não substitui `handlePaymentConfirm`, `finalizeSaleTransaction` ou `retrySyncSale`.

Cinco casos finais PASS:

1. CONFIRMED: identidade canônica e total 190; dinheiro 10, PIX 20, débito 30,
   crédito 40, prazo 50 e vale 40; log usa exatamente esses valores.
2. FAILED: breakdown inválido rejeitado pelo motor; zero log, carrinho preservado;
   nova tentativa consciente é aceita.
3. PENDING: zero log; reconfirmação bloqueada; retry real envia mesma identidade,
   confirma uma venda e emite um log; repetir retry não cria POST/evento novo.
4. Remount com carrinho alterado: log usa os 190 da venda enviada, não preço 999
   do draft; outro restore não duplica a entrada local.
5. Duas chamadas reais concorrentes: motor compartilha a confirmação e log sai uma vez.

## Blocker funcional fora da allowlist

`COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT`.

Comando reproduzível no candidato preservado:

```powershell
npx playwright test --config e2e/pdv-core.playwright.config.ts --grep 'classic.*D PENDING'
```

Resultado: 1 FAILED, exit 1, em `e2e/specs/pdv-core-n5.spec.ts:159`:

```text
expect(audits()).toHaveLength(1)
Expected length: 1
Received length: 0
Received array: []
```

Passaram antes dessa asserção: zero evento final no PENDING, caixa sem entrada,
modal impedido de reconfirmar, dois POSTs com a mesma clientSaleId, uma venda
CONFIRMED, um `venda_finalizada`, segundo Reenviar sem POST nem evento adicionais.
O teste completo continua FAILED. `venda_finalizada` não substitui `sale_finalized`.
O transporte apenas confirma identidade: não injeta auditoria nem chama o
handler de pagamento para simular o retry.

No código real, Classic retorna no ramo `result.pending`; o único emissor
`sale_finalized` desse componente fica no ramo de confirmação imediata.
`retrySyncSale` confirma no OperationsProvider, sem retornar àquele handler.
`components/dashboard/vendas/pdv-classic.tsx` e o motor compartilhado estão
fora da allowlist REV2. Não foram corrigidos. Não foi ampliado o GOAL.

## Ambiente e limites

Config dedicada seleciona somente o spec N5, sem globalSetup/login produtivo.
Servidor próprio via esbuild em memória, bind `127.0.0.1:4179`, reutilização
desativada, sem Next, `.env`, banco, proxy de rede ou writer de negócio.
Bundle recusa imports de Prisma/server writers não explicitamente isolados.
Playwright intercepta requests de bootstrap, caixa, crédito, venda, audit,
retry e enriquecimento. Origem externa, loja não sintética e rota desconhecida
são recusadas; asserções finais verificam zero requests inesperados/page errors.
Fixtures usam somente loja `n5-c-synthetic`, cliente/produto/operador sintéticos.

Quatro componentes e PaymentModal reais estão no bundle. Motor cliente,
identidade, confirmação, retry, audit local e helper de parcelas são reais.
O driver de Reenviar é sintético e chama `retrySyncSale` real por evento DOM;
não homologa o Histórico de Vendas. Subárvores periféricas de troca, impressão,
recebimento e seleção de acessórios são isoladas e não contam como cobertura.
CSS mínimo serve ao harness; não é auditoria visual do produto.

Provas servidor H-A..H-E são as do inventário histórico preservado na matriz,
com seus SHAs/limites. Não foram repetidas as suítes N5-B1/R4, build, Docker,
smoke autenticado, migrations ou seeds. Nenhum banco/endpoint produtivo foi acessado.

## Validações e resultados

| Comando | Resultado observado |
| --- | --- |
| `npx vitest run lib/pdv/parity-assistencia-finalize-audit.component.test.ts` | PASS final: 1 arquivo, 5 testes; 19/10 00:15:25, 46,23s |
| `npx playwright test --config e2e/pdv-core.playwright.config.ts` | 20 selecionados; 3 PASS (Classic A/B/C), 1 falha de clique do driver, 16 NOT_RUN; exit 1 |
| Playwright focado Classic D, após corrigir o driver | FAILED funcional: auditoria esperada 1, observada 0; exit 1 |
| `npm run typecheck` | FAIL: `generated/prisma` ausente e erros em cadeia; não PASS |
| ESLint focado nos cinco paths `.ts`/`.tsx` do GOAL | PASS final, exit 0 |
| `git diff --check` | PASS antes da ratificação do bloqueio |
| `node scripts/track.mjs verify --all` | PASS: 11 trilhas, ledger/state/REGISTRY/GATES coerentes; repetir após block |
| R / `close pdv` / push / PR | Não executados: aceite funcional não satisfeito |

Tentativas anteriores de infraestrutura, sem cobertura contabilizada: EPERM no
cache temporário do sandbox, import do bundler no jsdom, cwd/module format do
servidor e seletor de cliente/stacking do driver. Foram corrigidas somente na
infra autorizada; o último retry falhou na asserção de negócio, não no driver.
O primeiro lint encontrou `children` como prop no teste (corrigido); outra
execução não resolveu um módulo Babel, mas a execução final passou.

A worktree tinha somente cache `.vite` em node_modules. Os lockfiles da raiz e
da worktree foram conferidos idênticos; cache preservado em temporário e criada
junction ignorada para as dependências já instaladas, sem mudar package/lock.
O typecheck então executou e terminou com 241 arquivos com diagnósticos. Além
da ausência de Prisma, havia um erro novo na fixture À Prazo do teste; foram
completados `primeiroVencimento`/`intervalDias`. Vitest e lint finais passaram.
O typecheck global não foi reexecutado após a parada; não se afirma tipos verdes.
Não se gerou Prisma nem se alteraram paths produtivos fora da allowlist para contornar o gate.

## Matriz, preservação e ratificação

Matriz REV2: **3 TESTED, 16 PARTIAL, 1 BLOCKED, 0 UNSUPPORTED_BY_DESIGN**.
São 20 células explícitas. TESTED apenas Classic A/B/C, com limite de I/O
sintético. Classic D é PARTIAL porque o teste completo falha; Classic E é
BLOCKED pela prova de retry. Assistência tem prova de componente, não E2E.
As outras superfícies permanecem PARTIAL; 16 NOT_RUN nunca contam como PASS.

Os documentos REV1 foram preservados integralmente abaixo e no commit original.
Código/testes ficam sem staging/commit na worktree: não há candidato técnico
aprovado. Somente matriz/evidência do blocker são commitadas como documentação,
e `node scripts/track.mjs block pdv --by=gate --reason=...` ratifica o estado
por meio do próprio protocolo. Ledger/state/REGISTRY/GOAL não são editados à mão.
Não se executa `close`, não se marca DONE, não se solicita R sobre SHA inexistente,
não se faz push nem merge. Nova decisão humana de escopo é necessária.

Fingerprints dos cinco arquivos técnicos locais (conteúdo, não SHAs de commit):

| Caminho | `git hash-object <path>` |
| --- | --- |
| `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | `b74eccd202a9a1eef0a12cd26393ffa26a112fbd` |
| `lib/pdv/parity-assistencia-finalize-audit.component.test.ts` | `5114c9adc813bd6879e136310563b04a42da2556` |
| `e2e/pdv-core.playwright.config.ts` | `cb8a7652f45fbffe48a7b7bcc708b01091597ad7` |
| `e2e/fixtures/pdv-core.ts` | `5bc8b515c058111d2c0decbf58a5f9adcb8c7718` |
| `e2e/specs/pdv-core-n5.spec.ts` | `ec67ad61774164d09e92d0d6518cddec6e42e1b8` |

```text
TECHNICAL_COMMIT=NONE
BLOCKED_HISTORY_PRESERVED=YES
ENVIRONMENT_ISOLATED=YES_SYNTHETIC_IO
N5_B1_CLOSEOUT=BLOCKED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
R_EXECUTOR=NONE
R_FAMILY=NONE
R_VERDICT=NOT_REQUESTED_ACCEPTANCE_FAILED
AEP_CLOSE_COMMIT=NONE
GOAL_STATUS=BLOCKED
PUSH_BRANCH=NOT_PUSHED
PR_NUMBER=NONE
PR_URL=NONE
BLOCKERS=COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT;TYPECHECK_GENERATED_PRISMA_MISSING
NEXT_STEP=RESOLVER_GATE_COM_EVIDENCIA
```

CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não alterados: fora da allowlist e sem
entrega técnica aprovada. Nenhum N6, N7 ou outro GOAL foi iniciado.

---

## Histórico REV1 preservado

# PDV-PARITY-N5-C-E2E-002 — evidência de bloqueio

Data: 2026-10-18. Executor: Codex; família `openai`.
Main/base: `180a2f2ab450cc2686b5087dc09b1a0ee58b5f72`.
Branch: `goal/pdv-parity-n5-c-e2e-002`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
Tentativa AEP: 1/3. Resultado: **BLOCKED — COVERAGE_BLOCKED_AUDIT_ASSISTENCIA**.

## Inicialização

`git fetch origin main` atualizou `origin/main` de `1751080` para `180a2f2`.
A primeira execução no sandbox não pôde escrever FETCH_HEAD; a execução com
permissão para os metadados Git terminou com exit 0. Consulta GitHub confirmou
PR #281 MERGED, merge `17510806bdfe736f6bc8a19ec732b7fd035de69b`, ancestral
da base. Ledger contém N5-B2 DONE; N5-C era READY e único GOAL atual.

Criadas somente a branch/worktree pedidas, a partir de `origin/main`.
`node scripts/track.mjs status pdv` e `open pdv`: exit 0, base correta,
árvore limpa e allowlist de cinco paths. Nenhum gate produtivo liberado.
Nenhum marcador AEP foi encontrado nas outras worktrees PDV inventariadas;
o app não mostrou outra sessão PDV ativa. WIPs da checkout principal e de
outras sessões não foram alterados.

## Evidência que impede o aceite

Análise do AST dos quatro arquivos de superfície, com TypeScript já instalado,
sem executar aplicação, callbacks, requests ou writers:

```text
classic: appendAuditLog/sale_finalized em 2286
assistencia: appendAuditLog/sale_finalized = ZERO
supermercado: appendAuditLog/sale_finalized em 1823
venda-completa: appendAuditLog/sale_finalized em 1055

Assistência handlePaymentConfirm: linhas 1918–2181
Blob: 185085ca7536a4f9d263b988e9d609ea46421678
Última alteração do componente: 21df54b799bec74f2e1761f194221e0d550bb1e0
PENDING: 2095–2111, retorno antes do pós-venda
CONFIRMED: reset em 2150, toast Venda finalizada em 2164
sale_finalized: ausente no componente inteiro
```

O AST percorreu chamadas `appendAuditLog`, leu a propriedade literal `action`
dos argumentos e registrou somente `sale_finalized`. A inspeção textual de
todo `lib`, `app` e `components` corroborou a ausência de emissor Assistência.

Busca reproduzível no objeto imutável:

```powershell
git grep -n 'sale_finalized' 180a2f2ab450cc2686b5087dc09b1a0ee58b5f72 -- components/dashboard/vendas/pdv-assistencia-enterprise.tsx
git grep -n 'sale_finalized' 180a2f2ab450cc2686b5087dc09b1a0ee58b5f72 -- lib/operations-store.tsx lib/pdv-finalize-integrity.ts lib/events/event-bus.ts lib/automation/automation-engine.ts
```

Ambas retornam exit 1, zero ocorrências (resultado esperado da busca, não de um
teste). O primeiro script auxiliar de inventário tratou esse exit 1 como erro;
a busca foi repetida com tratamento explícito e confirmou zero ocorrências.
Isso não é falha do produto em runtime nem teste executado.

`venda_finalizada` do motor é notificação local separada, sem emissão
`sale_finalized` nesses arquivos. O teste
`lib/pdv-pending-post-sale-effects.static.test.ts` exige em Assistência apenas
`setAutoPrintInput` e `Venda finalizada` no ramo CONFIRMED. Portanto sua aprovação
anterior não é evidência positiva do requisito de auditoria nessa superfície.

O GOAL exige audit-log nas quatro superfícies e determina parar se uma lacuna
real não puder ser resolvida na allowlist. O componente produtivo está fora
dela. Não houve alteração do componente, do motor, de auth, proxy, schema,
configuração global, CI ou deploy. Não houve ampliação da allowlist.

## Inventário e matriz

`docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md` contém as 20 células, dez arquivos de
contrato com SHA/caso/limites e a distinção entre cliente sintético e motor
servidor com TransactionClient fake. R4 histórico: 46 arquivos/662 testes PASS
e 34/34 testes de componentes, conforme a evidência R4 existente; não reexecutado.
B2 histórico: 119 testes PASS; não reapresentados como E2E desta base.

Resultado da matriz: 0 TESTED, 19 PARTIAL, 1 BLOCKED, 0 UNSUPPORTED_BY_DESIGN.
Ausência de audit na Assistência é blocker, não diferença intencional.

## Validação desta execução

| Comando/ação | Resultado |
| --- | --- |
| `node scripts/track.mjs status pdv` | PASS; pré-condições descritas acima |
| `node scripts/track.mjs open pdv` | PASS; tentativa 1/3, cinco paths, zero gates |
| Inventário AST/fontes | Blocker E1 comprovado por inspeção, sem execução funcional |
| `npx playwright test --config e2e/pdv-core.playwright.config.ts` | NOT_RUN: parada no inventário antes de criar config/fixture/spec |
| `npm run typecheck` | NOT_RUN: parada de cobertura; apenas documentos alterados |
| `node scripts/track.mjs verify --all` | PASS antes do bloqueio; 11 trilhas e arquivos gerados coerentes |
| `git diff --check` | PASS antes do bloqueio |
| Revisão independente R | NOT_SUBMITTED: não há candidato técnico com testes aprovados |
| `check pdv` / `close pdv` | NOT_RUN: aceite não satisfeito; usar `block` canônico |

O bloqueio é registrado por `node scripts/track.mjs block pdv --by=gate`.
Estado, ledger, movimentação do GOAL e REGISTRY são escritos somente pelo AEP.
Estes dois documentos acompanham o commit canônico de bloqueio; não há commit
técnico de implementação, fechamento DONE, push, PR ou merge nesta execução.

Nenhum ambiente E2E foi iniciado ou comprovado isolado. Nenhuma credencial ou
`.env` de produção foi lida; nenhum servidor existente foi reutilizado. Zero
vendas/caixa/estoque/pagamentos reais. Não foram executados Docker, build,
migrations, seeds, smoke produtivo, R4 inteiro ou instalação de dependências.

## Pendências e parada

```text
ENVIRONMENT_ISOLATED=NOT_STARTED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
N5_B1_CLOSEOUT=BLOCKED
TECHNICAL_COMMIT=NONE
R_EXECUTOR=NONE
R_FAMILY=NONE
R_VERDICT=NOT_SUBMITTED
AEP_CLOSE_COMMIT=NONE
PUSH_BRANCH=NOT_PUSHED
PR_NUMBER=NONE
NEXT_STEP=RESOLVER_GATE_N5_C
```

Decisão humana necessária pelo rito AEP para tratar a ausência de auditoria
no código produtivo e retomar o escopo. Nenhum GOAL adicional iniciado.
Worktree preservada com a evidência; limpeza depende de integração/validação
posteriores. CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não alterados: fora da
allowlist e nenhuma feature implementada. Riscos de smoke autenticado,
loja/terminal e hardware continuam abertos nos registros anteriores.


---

## Diagnóstico focado REV3 — 19/10/2026, GOVERNANCE_ONLY

Autorização: PDV-N5-C-REV3-RETRY-AUDIT-PLAN-004. Nenhum código implementado,
nenhum E2E/teste técnico executado, nenhum Prisma gerado nesta sessão.
Main confirmada após fetch: a6777234bcc336fef64ecb7491d5705bdd404b39.
BLOCKED local: bc9fab7cf853f3b03759b84bcf7a63b11869c3a6. Rev2 (PR #285,
commit de plano 4f7a110) é ancestral de origin/main. Ambos os eventos BLOCKED
permanecem byte a byte no ledger; o segundo é levado a main por este PR.

Os cinco fingerprints do WIP acima foram reconferidos e coincidem. A worktree
original não recebeu stash, reset, checkout, merge nem edição técnica.
Branch de plano criada do BLOCKED, merge normal de origin/main: 7aac8bb.
open pdv na original recusou por inexistir READY; não abriu marcador.
O rito humano de planejamento AEP §§2–3 permite reabrir o mesmo GOAL, sem close
de execução. Registry/verify reconciliam exclusivamente o plano e as projeções.

### Causa e contrato

APPLICATION_AUDIT_GAP localizado no Classic. Inspeção estática corrobora a
falha runtime registrada na rev2, sem reexecução nesta sessão:

- e2e/specs/pdv-core-n5.spec.ts:81,159: auditoria filtra sale_finalized;
  o caso D já exige separadamente um venda_finalizada e um log de auditoria.
- e2e/fixtures/pdv-core.ts:53–67,121–126: backend confirma clientSaleId,
  captura POST de auditoria e driver chama retrySyncSale real; não injeta log.
- pdv-classic.tsx:2187–2243: finalização real; FAILED retorna; PENDING registra
  identidade e retorna antes dos efeitos definitivos.
- pdv-classic.tsx:2286–2290: único sale_finalized da finalização está no
  caminho direto CONFIRMED. Não há observador de confirmação que o emita
  após retry. O componente já recebe sales na linha 276.
- operations-store.tsx:1507–1533,1653–1688: retry busca a venda pendente
  pela mesma clientSaleId/id e chama persistPendingSale; confirmação atualiza
  sales e emite notificação UI uma vez, sem voltar ao handler Classic.
- audit-log.ts:66–83: appendAuditLog adiciona log local e envia pelo audit-sync
  à API. audit-sync.ts:3–21 é best-effort, não autoridade transacional.
- operations-store.tsx:1357–1387 e automation-engine.ts:190–207 distinguem
  notificação UI de automação definitiva. sale-automation-dispatch.ts:1–27
  documenta create-vs-replay server-side; sem alteração desses caminhos.

O retry observado antes do bloqueio preservou identidade em dois POSTs, uma
venda confirmada e um evento UI; repetir Reenviar não acrescentou POST/evento.
Auditoria esperada: sale_finalized=1; real: sale_finalized=0. PENDING: ambos
zero. Confirmação direta: chamada de auditoria presente no código (Classic
A/B/C passaram historicamente). Não há novo PASS declarado nesta sessão.
TEST_ASSERTION_INCORRECT e FIXTURE_DEFECT não explicam a ausência: a fixture
conserva os emissores reais e captura auditoria em canal próprio; o contrato
F-08 exige esse canal. venda_finalizada não o substitui.

Fronteira: somente Classic + teste comportamental específico, observando a
identidade própria nas sales confirmadas e usando snapshot real. Nenhuma
mudança compartilhada é necessária para o contrato local demonstrado.
Exigência futura de garantia durável/cross-tab exige autorização específica
para o contrato compartilhado; não está incluída nesta rev3.

### Prisma e preservação das provas

Schema linhas 1–4 já aponta ../generated/prisma; .gitignore:20–21 o exclui;
lib/prisma.ts:1 importa esse destino. generated e generated/prisma ausentes
na original; node_modules é junction para C:/Projetos/omni-gestao/node_modules.
package.json tem postinstall=prisma generate. Reutilizar node_modules não
gera o artefato ignorado por worktree. Geração futura restrita ao destino
local verificado, sem .env produtivo, banco, migrations ou mudança de schema,
package/scripts. Não foi tentada nesta sessão.

Allowlist adicional rev3: components/dashboard/vendas/pdv-classic.tsx;
lib/pdv/parity-classic-finalize-audit.component.test.ts; generated/prisma/**
(artefato ignorado, sem commit). Os sete paths rev2 são preservados.
Matriz permanece integralmente 3 TESTED / 16 PARTIAL / 1 BLOCKED, baseada
somente nas execuções rev2 registradas. Cinco F-08 e vinte combinações
continuam exigidos; R independente ainda pendente.
N5_B1_CLOSEOUT=BLOCKED; PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED.
Plano READY não resolve o gap técnico nem comprova tipos verdes.
NEXT_STEP=HUMANO_MERGEAR_N5_C_REV3.

Validação de governança REV3: registry PASS; verify --all PASS (11 trilhas);
git diff --check PASS. Typecheck/build não aplicáveis à entrega somente
documental; E2E e geração Prisma reservados à retomada. Nenhuma promoção
de cobertura. CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT sem alteração, pois
não há nova entrega funcional. WIP e matriz preservados.
