# N5-C rev5 — diagnóstico de regressão e reabertura documental

Data: 20/10/2026 (America/Sao_Paulo).
Autorização: `PDV-N5-C-REV5-REGRESSION-REOPEN-006`.
Modo: `DIAGNOSTICO_FOCADO + PLANEJAMENTO_AEP`.
Trilha: `pdv`. Mesmo GOAL: `PDV-PARITY-N5-C-E2E-002`.

## Resultado e fronteira

GOAL reaberto `READY`, `PLAN_REV=5`, pelo ritual humano AEP §§2–3.
O planejamento elimina o bloqueio de escopo dos dois testes herdados e define o
corretivo Assistência comprovadamente necessário. A implementação continua pendente,
com `R_VERDICT=REQUEST_CHANGES` histórico. Nenhuma correção produtiva nesta sessão.

Branch `plan/pdv-n5-c-rev5-regression-closeout`, worktree
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev5-regression-closeout`,
criada diretamente de `origin/main=a874342f5366427f8f7cfebc96a9c14c8efe39ad`.
Main observada na rev4: `16c496ad2ffe56fc6a89de237b204842494b8cbb`.
A atualização remota corresponde ao PR #292 de Cadastros; diff vazio nos arquivos
PDV, suites herdadas, motor e configuração de testes usados neste diagnóstico.

Commits locais confirmados e preservados:

- Técnico: `cdda74979e6008e5391a9defe6af1efdca6b7e4e`.
- Documental do parecer R: `a21e9a6`.
- BLOCKED rev4: `01b9c0e94dc3867744b54764ee2d36620e10769d`.

Nenhum cherry-pick ou merge desses commits na branch documental. O teste
`git merge-base --is-ancestor cdda74979e6008e5391a9defe6af1efdca6b7e4e HEAD`
retorna 1, como exigido. O BLOCKED local também não é ancestral da branch.
Somente os dois documentos de matriz/evidência e o ledger AEP foram transportados.
O parecer integral Anthropic permanece em
`docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md`: Claude Code
2.1.288, Opus 5.5, família `anthropic`, sessão
`8117e84d-119e-4ae6-9924-70e82056e208`, SHA técnico exato, REQUEST_CHANGES.

## Preservação verificável

Worktree original `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`:
HEAD `01b9c0e94dc3867744b54764ee2d36620e10769d`, branch
`goal/pdv-parity-n5-c-e2e-002`, árvore limpa, `.aep-active` ausente.
Antes/depois: **5.758 arquivos tracked/untracked não ignorados**, SHA-256 agregado
`2033bac51eb04940dc88c2168080e3c622337e0918c51f0cb3cde9b91b2e5606`.
Índice Git antes/depois:
`78abfedc9c4ffea8def28dce69ca364e82b8bb0452a79ef4c37c25db584f0feb`.
Agregação: ordenar os paths de `git ls-files --cached --others --exclude-standard -z`;
para cada path, alimentar SHA-256 com path UTF-8, NUL e bytes do arquivo.
Junction node_modules preservada, destino `C:/Projetos/omni-gestao/node_modules`.
Sem stash/reset/checkout/merge/edição na original, sem descarte de WIP.
Nenhum arquivo de outras sessões foi editado; caches/logs diagnósticos ficam
na raiz de visualização desta sessão.

Ledger: a versão da main tem **sete linhas**, prefixo byte a byte do blob
Git de **oito linhas** do BLOCKED. O arquivo foi transportado literalmente,
sem reconstruir o evento. Bytes reais da cópia também conferidos com a original.

- SHA-256 do blob Git completo: `e811826bf12a67b6eec5b0137a3e5d6f244ec02cb7cce810da7a99446214b46c`.
- SHA-256 do quarto evento, sem terminador de linha: `dd57536029646950259278b74d94a7905be741a3d22e2495048d7b1cefd41ec9`.
- SHA-256 dos bytes reais do arquivo transportado: `1b1c49dafd2ba9df7840e7bee1454ab5ff3a55c55baa5597776830ead23a945b`.
- Eventos BLOCKED do mesmo GOAL: `2026-10-18T23:26:54.741Z`,
  `2026-10-19T03:19:51.885Z`, `2026-10-20T02:23:10.854Z`,
  `2026-10-20T22:09:52.691Z`. Todos preservados, nenhuma linha READY.
- State/REGISTRY/GATES escritos somente por `node scripts/track.mjs registry`.
  A projeção conta um GOAL BLOCKED histórico e oito linhas; não confundir
  a contagem last-wins com os quatro eventos. GOAL quente segue READY/rev5.

## Comparação executada das suites herdadas

Checkouts detached próprios: `pdv-n5-c-rev5-base-diagnostic` na base exata
`16c496a` e `pdv-n5-c-rev5-candidate-diagnostic` no candidato `cdda749`.
Os dois arquivos herdados são idênticos nos dois SHAs: blobs
`e2abf6500b669eea60919f96b884bfd354aa7388` (estático) e
`b90ede887a98a01fee4471dc84cbab70b278a7fa` (componente).
Configuração/dependências também não mudam entre base e candidato.

| Execução | Estático (11) | Componentes (34) | Total | Exit |
| --- | --- | --- | --- | --- |
| Base 16c496a | 11 PASS / 0 FAIL | 34 PASS / 0 FAIL | 45 PASS / 0 FAIL | 0 |
| Candidato cdda749 | 8 PASS / 3 FAIL | 20 PASS / 14 FAIL | 28 PASS / 17 FAIL | 1 |

Node `v24.14.1`, Vitest `4.1.4`; somente essas duas suites. O runner importa a
configuração canônica e isola cache/env/relatórios, sem env produtivo,
instalação, Prisma, banco, build ou E2E. Comandos exatos, status dos 45 casos em
cada SHA e hashes dos relatórios brutos:
[diagnostic-results.json](../../../../ai-execution/_evidence/PDV-N5-C-REV5-REGRESSION-REOPEN-006/diagnostic-results.json).
Código do runner e extensão RED:
[REPRODUCTION.md](../../../../ai-execution/_evidence/PDV-N5-C-REV5-REGRESSION-REOPEN-006/REPRODUCTION.md).

### Classificação individual obrigatória

Categorias exclusivas: **0 baseline, 3 regressões do candidato de compatibilidade
estática, 14 problemas de fixture/mock, 0 inconclusivas**. Todas as 17 surgem após
o candidato; os 14 erros de mock não são baseline nem falha de instalação/rede.
Os três erros estáticos não demonstram regressão comportamental nas respectivas
superfícies. O defeito funcional Assistência é uma prova separada, abaixo.

| # | Path/linha do teste | Caso | Base | Candidato | Classe | Causa real |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `lib/pdv-pending-post-sale-effects.static.test.ts:180` | CORREÇÃO-01 — PENDING sai antes dos efeitos definitivos components/dashboard/vendas/pdv-classic.tsx: guard único, gap limpo e bloco pending sem efeitos | PASS | FAIL | Regressão de compatibilidade estática | Emissor movido para observador; token ausente no recorte CONFIRMED |
| 2 | `lib/pdv-pending-post-sale-effects.static.test.ts:180` | CORREÇÃO-01 — PENDING sai antes dos efeitos definitivos components/dashboard/vendas/pdv-supermercado.tsx: guard único, gap limpo e bloco pending sem efeitos | PASS | FAIL | Regressão de compatibilidade estática | Emissor movido para observador; token ausente no recorte CONFIRMED |
| 3 | `lib/pdv-pending-post-sale-effects.static.test.ts:180` | CORREÇÃO-01 — PENDING sai antes dos efeitos definitivos components/dashboard/vendas/venda-completa-enterprise.tsx: guard único, gap limpo e bloco pending sem efeitos | PASS | FAIL | Regressão de compatibilidade estática | Emissor movido para observador; token ausente no recorte CONFIRMED |
| 4 | `lib/pdv/current-main-correction.component.test.ts:211` | R4 Assistência — production cache and remount switching the mounted Assistência to another store resets its draft before any cache write | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 5 | `lib/pdv/current-main-correction.component.test.ts:251` | venda-completa click: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 6 | `lib/pdv/current-main-correction.component.test.ts:251` | venda-completa F1: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 7 | `lib/pdv/current-main-correction.component.test.ts:270` | venda-completa click: an old resolved sales snapshot cannot release a newly pending identity | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 8 | `lib/pdv/current-main-correction.component.test.ts:270` | venda-completa F1: an old resolved sales snapshot cannot release a newly pending identity | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 9 | `lib/pdv/current-main-correction.component.test.ts:283` | venda-completa: direct confirmation resolves using current sales, without opening/clicking first | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 10 | `lib/pdv/current-main-correction.component.test.ts:251` | assistencia click: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 11 | `lib/pdv/current-main-correction.component.test.ts:251` | assistencia F1: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 12 | `lib/pdv/current-main-correction.component.test.ts:251` | assistencia F10: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 13 | `lib/pdv/current-main-correction.component.test.ts:251` | assistencia F12: PENDING blocks; changing only sales.syncPending releases the same cart | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 14 | `lib/pdv/current-main-correction.component.test.ts:270` | assistencia click: an old resolved sales snapshot cannot release a newly pending identity | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 15 | `lib/pdv/current-main-correction.component.test.ts:270` | assistencia F1: an old resolved sales snapshot cannot release a newly pending identity | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 16 | `lib/pdv/current-main-correction.component.test.ts:283` | assistencia: direct confirmation resolves using current sales, without opening/clicking first | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |
| 17 | `lib/pdv/current-main-correction.component.test.ts:296` | assistencia: an already open modal uses current sales for a resumed identity — resolved | PASS | FAIL | Fixture/mock | Mock de audit-log sem getAuditLogs |

Estático: o candidato move `sale_finalized` do handler direto para o observador
CONFIRMED definido antes do handler (Classic 317/321, Supermercado 261/265,
Venda Completa 311/315 no SHA técnico). O teste recorta o trecho depois do guard
PENDING e a asserção positiva da linha 180 fica estruturalmente incompatível.
As negativas no gap/PENDING continuam verdes. Não é ausência global de emissor.

Componente: mock da linha 56 exporta só `appendAuditLog`; novo caminho chama
`getAuditLogs` em Assistência 1174/1193 e Venda Completa 311. A execução termina
antes das asserções originais. `resolved()` na linha 78 também representa
somente identidade/syncPending, não total/breakdown de uma venda confirmada.
A adaptação futura precisa de fixture completa e de observação honesta da
auditoria; não há promessa de que acrescentar um export resolverá todos os casos.

## Remount: prova comportamental e corretivo definido

Causa rejeitada por R: Assistência 1163–1199 mantém a identidade de auditoria
em state volátil e consulta fallback em ref. O efeito de restauração
1293–1321 registra a identidade nesse ref depois do observador. Se o provider
global já tem a confirmação, o ref muda sem nova dependência reativa.
O draft/TTL pode ainda apagar a única referência. As outras três superfícies
já possuem marcador de auditoria separado por loja.

A aplicação mantém o provider: `app/dashboard/layout.tsx:60`,
`components/dashboard/app-ops-providers.tsx:16`; retry fora da tela é real
(`operations-store.tsx:2357`, flush a cada 30 s e Reenviar em outra rota).

Reprodução nova somente no checkout descartável: extensão do teste
`lib/pdv/parity-assistencia-finalize-audit.component.test.ts`, sem alterar
seus cinco casos existentes. **5 PASS / 1 FAIL / zero skip**, exit 1.
Componente, PaymentModal, OperationsProvider, handler, retry e audit-log são reais.
O I/O é SyntheticBackend fail-closed já existente.

Sequência comprovada antes da falha: PENDING sem evento → desmontar só a tela,
mantendo OperationsProvider → retry real preserva clientSaleId em dois POSTs →
uma venda `VDA-N5C-1`, CONFIRMED, total 190 → mudar o draft para preço 999 →
remontar a tela → **sale_finalized esperado 1, observado 0**.
A asserção falha é a primeira emissão esperada depois da restauração;
os checks subsequentes de payload/repetição são NOT_REACHED. A prova anterior
“retry depois do remount” continua PASS e não cobre este caso.

Corretivo mínimo futuro em Assistência + seu teste, dentro da allowlist rev4:
marcador de identidades próprias persistido por loja, separado do carrinho/TTL;
restauração em state reativo; observação da venda original CONFIRMED em sales;
snapshot canônico/loja corretos; uma auditoria pelo log local retido e remoção
do marcador atendido. FAILED/PENDING sem emissão definitiva. Registrar
identidade apenas de resultado ok do próprio handler e proteger troca de loja
durante await. Não repetir impressão, enriquecimento, limpeza ou financeiro.

Provar retorno com provider já confirmado, draft diferente/expirado/limpo,
loja alheia e repetições de remount/retry. Limite: log local de 500 entradas;
nenhuma promessa transacional cross-tab/servidor. Não implementar nesta sessão.
Necessidade de motor/backend/helper compartilhado fora do escopo implica
bloqueio técnico e decisão humana, sem ampliação automática.

## Allowlist e contrato rev5

Os 14 padrões rev4 são preservados literalmente e na mesma ordem. Somente duas
inclusões exatas, necessárias para reparar a compatibilidade comprovada:

1. `lib/pdv-pending-post-sale-effects.static.test.ts`: manter os 11 casos,
   todas as negativas de FAILED/PENDING e a prova positiva real da fiação do
   observador confirmado; não substituir por busca frouxa no arquivo inteiro.
2. `lib/pdv/current-main-correction.component.test.ts`: manter os 34 casos
   e asserts de guards/cache/TTL/loja/identidade/hold/resume; completar auditoria
   e dados confirmados do fixture, isolando apenas transporte/periferia.

Sem alteração desses testes no PR de plano. Nenhum caso excluído, skip,
assert afrouxado, string artificial ou fallback de produção para mock.

Após merge humano e novo comando, integrar o plano/main na worktree original
por merge normal e preservar integralmente os commits/WIP. Somente então
`status pdv` → `open pdv`, correção delimitada e validação rev5:
45 herdados; quatro suites de auditoria incluindo remount novo; **20 E2E**
canônicos, cinco F-08 × quatro superfícies; typecheck. Preservar Classic,
Supermercado e Venda Completa e os efeitos já aprovados parcialmente.

Os **20/20 E2E rev4** continuam históricos e não foram reexecutados nesta sessão.
Matriz transportada integral: **19 TESTED / 1 PARTIAL / 0 BLOCKED**.
Planejar não promove células nem encerra o Core. Resultado futuro vinculado
ao SHA corrigido, comandos, casos, contagens e limites de I/O sintético.
Nova decisão R por outra família (`anthropic` ou `humano`) sobre o SHA final,
incluindo os dois blockers, código, testes e matriz. REQUEST_CHANGES histórico
não vale como aprovação futura. Sem R favorável, sem DONE.
`N5_B1_CLOSEOUT=BLOCKED` e `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` mantidos.

## Arquivos da entrega e validação

Arquivos modificados: evidência histórica do GOAL e matriz final (transporte
documental integral); `docs/execution-tracks/REGISTRY.md`; `pdv/LEDGER.jsonl`
(transporte literal AEP); `pdv/TRACK.md`; `pdv/goals/PDV-PARITY-N5-C-E2E-002.md`;
`pdv/state.json` (gerado). Criados: este relatório e os dois arquivos de
evidência rev5 vinculados acima. Todos sob `docs/`; nenhum código produtivo.

- `node scripts/track.mjs registry`: PASS.
- `node scripts/track.mjs verify --all`: PASS, 11 trilhas, REGISTRY/GATES coerentes.
- `git diff --check`: PASS.
- GOAL READY/rev5, quatro BLOCKED, 14 padrões preservados + duas inclusões: PASS.
- Ancestralidade técnica ausente e fingerprint original idêntico: PASS.
- Typecheck/build: não aplicáveis ao PR documental, sem código TS/config produtivo.
- E2E: NOT_RUN nesta sessão, conforme autorização.
- CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT: sem alteração, nenhuma entrega funcional.

Commit e push exclusivamente da branch de planejamento; abrir um PR documental
contra main. SHA do commit e identidade do PR constam na publicação e no
relatório final da sessão. Sem merge, open/close de execução ou implementação rev5.

`BLOCKERS=CORRECAO_REV5_E_NOVO_R_PENDENTES;SEM_BLOQUEIO_DO_PLANO`.
`NEXT_STEP=HUMANO_MERGEAR_N5_C_REV5`. Parar.
