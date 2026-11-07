# ENTRYPOINT — AEP/1.0-R2

Fonte canônica de execução. Vale para qualquer executor. O protocolo é OPT-IN: sem `.aep-active` nesta worktree, nada aqui se aplica.

## Começar
1. `node scripts/track.mjs status <trilha>` — leitura pura, não escreve nada.
2. `node scripts/track.mjs open <trilha>` — escreve só `.aep-active` (gitignored) e imprime o briefing: o ÚNICO arquivo de GOAL a ler, branch, base, tentativa, allowlist, gates liberados, teste e orçamento de leitura.
3. Leia apenas esse arquivo de GOAL. Trabalhe apenas dentro da allowlist.

## Atualizar a allowlist de uma sessão Pessoas já aberta

Para `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`, há um fluxo separado e restrito à
ampliação humana da revisão 5 para 6: somente `lib/pessoas/documentos/service.ts`.
Após autorização humana do fluxo Git e integração legítima do mecanismo e do plano
na branch de execução, com árvore/índice limpos e `origin/main` conferida por fetch:

```bash
node scripts/track.mjs refresh-active pessoas --dry-run
node scripts/track.mjs refresh-active pessoas
```

A revisão 6 precisa estar idêntica em HEAD, árvore, upstream e base comum. Copiar o
GOAL para a branch não basta. O comando não faz fetch, merge, rebase, testes ou close.
Escreve atomicamente somente `.aep-active`, preserva abertura/tentativas e acrescenta
proveniência em `scope_refresh_log`; repetição é NO-OP. Dry-run não escreve arquivo
nem metadados Git. Nenhum gate técnico, revisão, preview ou merge é aprovado por ele.

Não use `open` para atualizar a base antes do refresh: ele mantém o snapshot antigo
e pode perder a âncora histórica necessária. Divergência exige resolução humana;
não apague, edite ou regenere a sessão para contornar a recusa. Outras ampliações
não estão autorizadas por este comando. Detalhes: `EXECUTION_PROTOCOL.md` § 8.

## Retomar um BLOCKED por gate humano, sem reiniciar tentativas

Após autorização humana específica, fetch separado e integração legítima do plano
revisado e deste mecanismo na branch/worktree já declaradas no mesmo GOAL:

```bash
node scripts/track.mjs resume-blocked <trilha> --goal=<ID> --authorization=<ID-humano> --dry-run
node scripts/track.mjs resume-blocked <trilha> --goal=<ID> --authorization=<ID-humano>
```

Use o `authorization_id` de execução aprovado no META do plano integrado. A
autorização de manutenção G-AEP-CORE e o merge humano deste mecanismo são separados
da execução Pessoas. Esta manutenção não abre Pessoas. A invocação de aplicação
deve ser humana ou expressamente autorizada.

O comando exige árvore/índice limpos, HEAD/base/upstream compatíveis, origem
BLOCKED e reconciliação comprovadas por commits, ledger literal, arquivo histórico
e evidência preservados e ausência de sessão concorrente da mesma trilha/GOAL.
O plano integrado deve conter `autorizacao_humana_execucao.aprovado=true`, o ID
informado e `retomada_aep` com origem, contagem e próxima tentativa explícitas.
Veja o contrato completo em `EXECUTION_PROTOCOL.md` § 8.

BLOCKED 1/3 continua ratificado e a sessão começa em 2/3. O comando publica somente
`.aep-active`, atomicamente e sem sobrescrever sessão existente. Repetição legítima
é NO-OP, inclusive depois de avançar para 3/3. Dry-run valida tudo sem escrever
arquivos, temporários ou metadados Git. Teto esgotado não pode ser retomado.
Não use `open` nem edição manual do marcador para contornar essa contagem.

`check`, `attempt`, `block` e `close` continuam oficiais. A revisão 8 fechada fica
intacta; o novo fechamento usa `_closed/goals/<ID>-r9-a<tentativa>.md` e registra a
origem BLOCKED no evento real de DONE/BLOCKED. Retomada não é falha inventada nem
DONE automático, não libera gates de caminho e não aprova revisão/preview/merge.

## Regras não negociáveis
- Escreva só dentro da allowlist impressa pelo `open`.
- Nunca use `git add .`, `git add -A` ou `git commit -a` — adicione por caminho explícito. Regra OPERACIONAL HUMANA: o hook valida o conjunto staged e não tem como saber qual comando você digitou.
- Commit do agente: `goal(<trilha>-<nnn>): ...`.
- Gate não liberado no GOAL = pare e peça autorização humana. Não contorne.
- Não edite `state.json`, `LEDGER.jsonl` nem `REGISTRY.md` à mão.
- Corretivo é TENTATIVA, não GOAL novo: `attempt <trilha> --fail --reason="..."`. Teto de 3 tentativas; esgotou, vira BLOCKED.

## Terminar
- `node scripts/track.mjs close <trilha>` — roda `check`. Falhou: nada é escrito e `.aep-active` é preservado. Passou: ratifica e cria o commit `aep(<trilha>): close`.
- Bloqueou: `node scripts/track.mjs block <trilha> --reason="..." --by=gate|dependencia|externo|decisao`.

## Limpar o contexto
O `close` imprime o veredito: CLEAR (nada mais a fazer), CONTINUE (siga no mesmo contexto) ou NEW_SESSION (limpe o contexto antes do próximo GOAL). Obedeça ao veredito.

Regras completas, máquinas de estado e MODELO DE SEGURANÇA: `EXECUTION_PROTOCOL.md`.
