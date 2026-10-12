# Pessoas 001B — reconciliação fiel dos dois BLOCKED

Data: 12/10/2026. Executor: Codex, família OpenAI.
Branch: `codex/aep-pessoas-001b-blocked-reconciliation`.
Base após fetch: origin/main `1fd90905e05656444576cf83c9df6c46919a917a`.

## Autorização e recorte

Autorização expressa do usuário nesta conversa:

> Autorizo o G-AEP-CORE exclusivamente para implementar a reconciliação fiel dos dois eventos BLOCKED do Pessoas 001B, com testes, PR separado e revisão independente, sem merge automático.

O fluxo `import` existente classifica planos, mas não transporta os bloqueios executados
com tentativas/proveniência originais. Não foi usado para converter o histórico.
Foi acrescentado `reconcile-blocked` à CLI oficial, com documentação e testes em
repositórios Git descartáveis. Nenhuma sessão `.aep-active` foi criada e nenhum
`open`, `close`, `attempt` ou `block` foi executado neste repositório.

O diff está limitado à CLI/testes AEP, protocolo, TRACK, evidência e projeções de Pessoas
geradas pela CLI. Não houve mudança ou execução de código de produto, transporte da
UI, typecheck/build/E2E de produto, provisionamento ou ativação DP.

Arquivos do PR (caminhos relativos ao repositório):

- `scripts/track.mjs` — comando oficial de reconciliação.
- `scripts/track.test.mjs` — testes de preservação, recusa, rollback e idempotência.
- `docs/ai-execution/EXECUTION_PROTOCOL.md` — contrato do comando.
- `docs/ai-execution/_evidence/PESSOAS-001B-BLOCKED-RECONCILIATION.md` — esta evidência.
- `docs/ai-execution/_evidence/PESSOAS-001B-BLOCKED-RECONCILIATION-tests.log` — log integral.
- `docs/execution-tracks/pessoas/TRACK.md` — contexto histórico e estado reconciliado.
- `docs/execution-tracks/pessoas/LEDGER.jsonl` — dois eventos anexados pela CLI.
- `docs/execution-tracks/pessoas/goals/PESSOAS-DP-FRONTEND-CADASTRO-001B.md` → `docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-CADASTRO-001B.md` — arquivamento pela CLI com o conteúdo fechado da origem.
- `docs/execution-tracks/pessoas/_closed/reports/RECONCILE-BLOCKED-25b5fda2612b.json` — relatório gerado pela CLI.
- `docs/execution-tracks/pessoas/state.json` — projeção gerada pela CLI.
- `docs/execution-tracks/REGISTRY.md` — derivado gerado pela CLI.

Nenhum diff de produto ou de outra trilha. `CURRENT_STATUS.md`, `CHANGELOG.md` e
`MASTER_CONTEXT.md` permanecem intactos: a mudança é de governança interna,
documentada no protocolo, TRACK e nesta evidência, sem entrega de produto/roadmap.

## Origem e histórico confirmado

Ref remota atualizada por fetch: `refs/remotes/origin/goal/pessoas-001b-frontend`.
Tip fixado: `25b5fda2612b35b6daccd2103fb69060f5107f73`.
Base original: `9f1b511a21ab98a924513428d465725e6839fdc2`.

Histórico completo entre base e tip, em ordem:

| Commit | Evidência histórica |
| --- | --- |
| `39ea3c90aee9f18e3aa3a432f433f20035ea8c47` | Documentação/revisão e prova de privacidade |
| `858d999c13ba1966b198983eb2c57afd57a25de9` | Primeiro BLOCKED, tentativa 1 |
| `40cb35e12ee648fe9459cb237df14458719a5811` | Implementação frontend |
| `5f4f9ad260431d257c8fbf7df4805ae43808566f` | Privacidade e prova documental |
| `33460f305883e71b3414d93be05a928c046601a9` | Fixtures e diagnósticos |
| `fde0794c4f11712034e60d785904cec14ce99216` | Snapshot funcional indicado pelo usuário |
| `3259905ee4fdf821c54e035f9ffa7ce696fdbc67` | BLOCKED final, tentativa 3 |
| `25b5fda2612b35b6daccd2103fb69060f5107f73` | Documentação final |

Os eventos de 11/10/2026 às 14:24:54.596Z e 17:26:59.867Z foram anexados sem
resserialização. A tentativa do primeiro evento é 1; a do último é 3, com os três
`previous_attempts` originais. Os motivos, timestamps e demais campos permanecem
idênticos à origem. O estado final continua BLOCKED: nenhuma tentativa 4 foi aberta.

Provas por objetos Git, após o commit gerado pela CLI
`642c414fc9b895efde7fb5b5beaddfa22f072e8d`:

| Caminho | Blob local = blob na origem fixada |
| --- | --- |
| `docs/execution-tracks/pessoas/LEDGER.jsonl` | `340637c59c2cfb6d9b6593e8acdf05949cf59200` |
| `docs/execution-tracks/pessoas/_closed/goals/PESSOAS-DP-FRONTEND-CADASTRO-001B.md` | `07555ee4ffd8e714ac1efb69f9f1670098d10996` |

Os predecessores 001A (`cc6cd01f3833b0fe8a60489379865efa52e497d3`) e P2
(`5465ba9d2999848c3e937457d7458fa7f59900e4`) são ancestrais da base main. Seus
eventos DONE e arquivos fechados não mudaram. Projeção gerada: `goals_done=2`,
`goals_blocked=1`, `ledger_lines=4`, `current_goal=null`, `next_goal=null`.

O arquivo histórico arquivado preserva sua plan_rev 4 e as autorizações da época;
essa cópia não autoriza execução nem concede gate ao futuro sucessor.

## Validação efetivamente executada

Ambiente: Windows/PowerShell, Node v24.14.1 e Git for Windows. A suíte usa somente
repositórios Git temporários e não carrega produto/banco/browser.

| Comando/prova | Resultado |
| --- | --- |
| `node --check scripts/track.mjs` | PASS |
| `node --check scripts/track.test.mjs` | PASS |
| `node --test scripts/track.test.mjs` | PASS: 81 testes, 0 falhas, 0 skipped, 0 todo; 332451.1387 ms |
| Reconciliação real com `--dry-run` | PASS: 2 eventos previstos, nenhum arquivo/commit escrito |
| Reconciliação real sem `--dry-run` | PASS: commit de estado acima, 2 eventos literais e GOAL arquivado |
| Repetição com os mesmos argumentos | PASS: NO-OP, nenhum evento/arquivo/commit adicional |
| `node scripts/track.mjs registry` | PASS: derivados regenerados somente pela CLI |
| `node scripts/track.mjs verify --all` após aplicação | PASS: todas as trilhas, REGISTRY e GATES coerentes |
| `git diff --check` | PASS |
| Comparação dos dois blobs com a origem | PASS: identidades acima |
| Diff dos arquivos fechados de 001A/P2 contra a base | Vazio |

Log completo da suíte: [PESSOAS-001B-BLOCKED-RECONCILIATION-tests.log](PESSOAS-001B-BLOCKED-RECONCILIATION-tests.log).
Relatório de aplicação: [RECONCILE-BLOCKED-25b5fda2612b.json](../../execution-tracks/pessoas/_closed/reports/RECONCILE-BLOCKED-25b5fda2612b.json).

Typecheck global e build de produto não se aplicam a este corretivo `.mjs` de
governança: não há mudança `.ts`/`.tsx`, config, rota, layout, Server Action ou Prisma,
e a missão proíbe execução de produto. Não foram executados nem declarados PASS.

Os 16 testes R-BLOCKED cobrem dry-run, preservação literal LF/CRLF, DONE, ambos
BLOCKED e campos extras, rejeição sem escrita de divergências/tentativa 4/origem
inválida/sessão ativa/índice sujo/default branch/GOAL conflitante, rollback de falha
de commit e repetição idempotente. As 65 regressões AEP existentes também passaram.

Uma aplicação inicial encontrou limite de 260 caracteres do Git for Windows no nome
do relatório; a CLI restaurou arquivos/índice/HEAD. O nome foi encurtado para SHA12,
mantendo GOAL e SHA completo no conteúdo. A aplicação final e os 81 testes acima
ocorreram depois dessa correção. A falha inicial não é contabilizada como PASS.

Para reproduzir a suíte, usar `node --test scripts/track.test.mjs`. Para reproduzir a
análise histórica, fazer fetch da ref indicada e executar os argumentos abaixo em
branch isolada, limpa, sem `.aep-active` e com derivados coerentes. Antes da aplicação
o dry-run prevê dois eventos; depois dela prevê zero e a execução é NO-OP.

```sh
node scripts/track.mjs reconcile-blocked pessoas --goal=PESSOAS-DP-FRONTEND-CADASTRO-001B --source-ref=refs/remotes/origin/goal/pessoas-001b-frontend --source-commit=25b5fda2612b35b6daccd2103fb69060f5107f73 --dry-run
node scripts/track.mjs registry
node scripts/track.mjs verify --all
git diff --check
```

## Revisão independente e gates

REVIEW_CODE=PENDING. A revisão deve ser de família não-OpenAI, com HEAD e testes
efetivamente executados identificados. Não há aprovação R nem review formal GitHub
registrados nesta evidência. O envio ao Claude/Anthropic foi impedido pela revisão
automática de permissões por exigir autorização explícita do conteúdo privado e
do destino. Em 12/10/2026, o usuário respondeu ao pedido de consentimento:
**"Manter revisão humana externa pendente"**. Essa é a decisão vigente; não há
autorização para o envio. A revisão Claude/Anthropic não foi executada.

O PR permanece draft, aguardando evidência da revisão humana externa. Não registrar
R como cumprido nem tornar o PR pronto para merge sem essa evidência. A decisão não
autoriza merge automático, abertura de tentativa ou criação antecipada do sucessor.

Os resultados históricos de produto descritos no ledger permanecem evidências da
origem. Não houve nova validação de produto nesta sessão. Typecheck frontend, E2E
autenticado e quatro temas exigem o futuro GOAL de recuperação; nada aqui os declara PASS.

Preview com R2 isolado, banco/bucket/chaves, DP produtivo e liberação de produção
continuam NÃO AUTORIZADOS. Storage simulado não é prova de R2 real. Não iniciar
folha/holerites/GOAL 002.

Próximo gate: revisão humana externa deste corretivo e merge humano do PR separado.
Depois disso, retomar o planejamento `plan/pessoas-001b-recovery-001` a partir da
origin/main corrente e criar um único sucessor READY `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`
(C3, ALTO, plan_rev 5) em PR somente de governança. Esse sucessor ainda não foi criado.
