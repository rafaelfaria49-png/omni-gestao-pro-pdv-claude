# Recovery 002 — preservação, reconciliação e gate de retomada

Data: **28/10/2026**, America/Sao_Paulo. Escopo desta rodada: documentação/reconciliação autorizadas pelo usuário; nenhuma execução de produto. Governança lida: CLAUDE.md, AGENTS.md, ENTRYPOINT, EXECUTION_PROTOCOL e regras do repositório. A ausência de `.aep-active` não foi alterada.

## Referências verificadas

| Referência | Valor |
| --- | --- |
| GOAL | `PESSOAS-DP-FRONTEND-001B-RECOVERY-002` |
| Main conferida por fetch e ls-remote | `34b70a15583db7608437f04b3ba7779582f4eeb9` |
| Branch original | `goal/pessoas-001b-recovery-002` |
| Worktree original | `C:/Projetos/omni-gestao-pessoas-001b-recovery-002` |
| SOURCE_SHA publicado | `8bb2cb9019df2620d7ee7edfbf268b6ae2982be3` |
| Transporte/diagnóstico preservado | `acd4362eb93bc36cbf2f8bbd2bf8586fba78319a` |
| BLOCKED_SHA oficial | `437abb4d4dc523865710cabf8a281f43dfda1fd9` |
| Branch documental, criada limpa da main acima | `codex/pessoas-001b-recovery-002-rev9` |
| Worktree documental | `C:/Projetos/omni-gestao/.worktrees/pessoas-001b-recovery-002-rev9` |
| Commit oficial de reconciliação | `bc9275307fff9df390c0ef02b1fb6e8d4ff55057` |
| Blob do núcleo inspecionado na main | `scripts/track.mjs` → `d9f7fb43dd60e786bae7dbbae05cc4f65f72ffa7` |
| Blob dos testes do núcleo, preservado | `scripts/track.test.mjs` → `0315c76d36cfc7faabb467343eb34a4799be8d44` |

`git status --porcelain=v1` da origem retornou vazio e exit 0; HEAD/branch, três commits sobre a main e ancestralidade do BLOCKED foram conferidos. `Test-Path .aep-active` retornou false na origem e na worktree documental. O comando `status pessoas` confirmou BLOCKED 1/3 sem sessão na origem. A principal contém WIPs externos: nenhum stash/reset/limpeza ou edição desses arquivos. A worktree documental anterior também permaneceu preservada.

## Publicação normal da origem

A ref remota `goal/pessoas-001b-recovery-002` estava ausente; não havia divergência a sobrescrever. O dry-run passou e o push normal criou somente essa branch no SHA local validado:

```text
git push --dry-run origin goal/pessoas-001b-recovery-002:refs/heads/goal/pessoas-001b-recovery-002
git push origin goal/pessoas-001b-recovery-002:refs/heads/goal/pessoas-001b-recovery-002
[new branch] goal/pessoas-001b-recovery-002 -> goal/pessoas-001b-recovery-002

git ls-remote origin refs/heads/goal/pessoas-001b-recovery-002
8bb2cb9019df2620d7ee7edfbf268b6ae2982be3 refs/heads/goal/pessoas-001b-recovery-002
```

Fetch posterior confirmou `refs/remotes/origin/goal/pessoas-001b-recovery-002` nesse mesmo SHA. Sem force, rebase, reset, amend, merge da implementação na main ou PR funcional nova. Os três commits e os 32 arquivos transportados permanecem na origem. PR #273 lida pelo conector GitHub: state=open, draft=true, head=`7a6df145e68bfea7eac14bf057a0904bb985dc02`; não foi editada, comentada, marcada ready ou mergeada.

## Reconciliação oficial

Na worktree documental limpa da main, sem `.aep-active`:

```text
node scripts/track.mjs reconcile-blocked pessoas --goal=PESSOAS-DP-FRONTEND-001B-RECOVERY-002 --source-ref=refs/remotes/origin/goal/pessoas-001b-recovery-002 --source-commit=8bb2cb9019df2620d7ee7edfbf268b6ae2982be3 --dry-run
```

Exit 0. Saída relevante literal:

```text
GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-002 · BLOCKED · tentativa histórica 1/3
eventos BLOCKED a anexar: 1 · previous_attempts preservados literalmente
GOAL quente a arquivar: sim · nenhum produto ou tentativa nova
MODO DRY-RUN: nenhum arquivo ou commit foi escrito.
```

A CLI verificou ref/SHA exatos, árvore/índice limpos, derivados de todas as trilhas, prefixo literal do ledger, vocabulário/proveniência/ancestralidade e GOAL fechado correspondente. Somente após o PASS o mesmo comando foi repetido sem `--dry-run`, exit 0, gerando o commit de estado `bc9275307fff9df390c0ef02b1fb6e8d4ff55057`.

Relatório oficial: [RECONCILE-BLOCKED-8bb2cb9019df.json](../../../execution-tracks/pessoas/_closed/reports/RECONCILE-BLOCKED-8bb2cb9019df.json). Um evento original anexado, ledger de cinco para seis linhas, arquivo fechado revisão 8 copiado integralmente do mesmo SOURCE_SHA. `result=BLOCKED`, `attempt=1`, `previous_attempts=[]`, `source=executado`, `blocked_by=gate`, timestamp `2026-10-28T09:50:58.457Z`, motivo e base originais preservados. Nenhum evento histórico removido, reserializado ou convertido; nenhum novo BLOCKED fabricado.

Estado derivado após reconciliação e a preservar no plano: dois DONE, três BLOCKED, seis linhas, current_goal=null/next_goal=null; last_goal=Recovery 002/last_result=BLOCKED. Não foram chamados `open`, `attempt`, `check`, `block` ou `close` nesta missão. Não houve consumo de tentativa.

## Gate real auth e revisão 9

A evidência executada anteriormente está no [SOURCE_SHA imutável](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/tree/8bb2cb9019df2620d7ee7edfbf268b6ae2982be3/docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002): `GATE_AUTH_CONSUMER_2026-10-28.md`, `auth-consumer-diagnostic.json` e `PROPOSED_AUTH_CONSUMER.patch`.

O diagnóstico usa as funções reais, sessão sintética STORE/OPERADOR sem Configurações Enterprise e sem autoridade de plataforma. `canAccessPage` permite `/dashboard/pessoas/configuracoes`, mas o consumidor redireciona por `pathname.includes("configuracoes")` nas linhas 105–106. Diagnóstico de funções puras; não é E2E nem confirmação da causa histórica A3. Não foi reexecutado ou promovido a PASS atual.

Revisão 9 acrescenta somente `lib/auth/proxy-enterprise-dashboard.ts` à allowlist. Patch futuro, depois de `canAccessPage` autorizar: igualdade `/dashboard/pessoas` ou prefixo `/dashboard/pessoas/`; nenhuma outra rota. Teste do consumidor já autorizado deve preservar negações de Unidades, Plataforma, Financeiro, Configurações globais e pessoas-extra, cookie/Store guard e guards reais DP. `auth.ts`, `auth.config.ts`, `proxy.ts`, schema/migrations e outros consumidores ficam excluídos.

O novo arquivo de proposta em `goals/` tem o mesmo ID, revisão 9 e **status BLOCKED**. A revisão 8 no arquivo fechado permanece literal. Não há READY nem sessão criada; o plano não se apresenta como retomada já implementada. Mantidos os demais paths em ordem, teste/runner, classe/risco, QA, dispensa condicional e contratos. Os metadados `retomada_aep` apenas registram requisitos e não são consumidos pela CLI.

## AEP_RESUMPTION_SUPPORTED=false — prova estática

Inspeção do núcleo versionado, sem editá-lo ou executar comandos que criem sessão:

| Mecanismo existente | Evidência no código | Limite para este GOAL |
| --- | --- | --- |
| `open` | `scripts/track.mjs:745–800`, especialmente `attempt: 1` na linha 791 e `attempts_log: []` na 799 | Sem marcador, cria sessão inicial sem ler o BLOCKED/contagem do ledger. Recolocar READY e chamar open reinicia a sessão artificialmente. |
| `refresh-active` | Linhas 866–895; exige marcador existente na 878 e fixa Recovery 001 na 895 | Não cria/reabre sessão e só atende ampliação rev5→6 do Recovery 001. Não atende Recovery 002 bloqueado sem marcador. |
| `reconcile-blocked` | Linhas 2742–2890 e EXECUTION_PROTOCOL §12 | Recupera literalmente o evento/arquivo fechado; não abre, reclassifica ou continua tentativa. |
| `attempt --fail` | Linhas 1372–1405; exige sessão ativa | Registra uma falha nova; não é comando de retomada nem pode fabricar falha retroativa. |
| Elegibilidade | `eligibleGoals`, linhas 399–403 | Só status READY é elegível. Status BLOCKED da proposta mantém a trilha bloqueada enquanto o rito falta. |

O protocolo descreve desbloqueio humano movendo GOAL para READY, mas não implementa hidratação da contagem histórica. Não se inferiu comando a partir desse texto. A lista oficial de comandos não oferece rito genérico de retomada cumulativa de BLOCKED. Esta constatação é estática sobre o SHA/blob acima, não uma simulação que tenha aberto tentativa.

**Contagem exigida:** Recovery 002 já ratificou a tentativa **1/3**, mesmo com `previous_attempts=[]`. Esse array descreve tentativas anteriores àquela ratificação; não significa tentativa zero. A próxima corretiva deve ser **2/3**, restando no máximo duas tentativas até o teto 3. Esta proposta não insere logs sintéticos nem decide contagem por edição de marcador. O rito oficial deverá demonstrar essa continuidade por proveniência do evento ratificado.

## G-AEP-CORE solicitado — não autorizado nem implementado

Pedido humano a resolver: **autorizar G-AEP-CORE exclusivamente para adicionar um rito oficial de retomada cumulativa de GOAL BLOCKED em `scripts/track.mjs`, suas regressões em `scripts/track.test.mjs` e documentação do rito em ENTRYPOINT/EXECUTION_PROTOCOL**. Hooks e `protocol.json` não precisam ser alterados no recorte proposto. Nenhum comando novo foi nomeado como se existisse, e `gates_liberados` do GOAL de produto continua vazio.

Necessidade: o núcleo é o único escritor legítimo do marcador; seus comandos atuais não carregam a tentativa ratificada de uma sessão encerrada por block. Somente mudar o plano não pode suprir essa lacuna. A autorização de 28/10 não libera essa alteração de núcleo, portanto a implementação não começou.

Requisitos verificáveis para um rito futuro, sujeitos à autorização e ao planejamento formal próprios:

1. Mesmo GOAL/branch/worktree; plano aprovado integrado por merge humano na main e na base comum, com GOAL idêntico em HEAD/árvore/main/base; fetch e refs/SHA de origem conferidos. Sem cópia de META para simular integração.
2. Ler evento BLOCKED vigente ratificado e reconciliado, preservando seu timestamp, motivo, tentativas anteriores, base, origem e SHA. No caso atual, a continuidade corretiva começa em 2/3 e mantém prova da tentativa 1, sem gravar nova falha no ledger ou usar `attempt --fail` retroativo.
3. Preservar teto cumulativo 3; rejeitar esgotado 3/3, histórico inconsistente/divergente e GOAL/branch/worktree incorretos. Não converter predecessores bloqueados ou criar GOAL sucessor para ocultar custo.
4. Dry-run sem escrita de arquivo ou metadados Git; aplicação atômica pelo escritor oficial, sem manipulação manual de `.aep-active`. Preservar árvore/índice, ausência de sessão concorrente, rejeições sem mutação e idempotência sem reiniciar data, tentativa ou histórico.
5. Preservar o arquivo fechado revisão 8 e os eventos literais, inclusive em eventual fechamento futuro da revisão 9. A CLI atual usa o mesmo path de arquivo fechado; o rito deve tratar isso oficialmente, sem sobrescrever a evidência histórica. Definir a representação auditável no planejamento do núcleo antes de implementar.
6. Regredir cenários 1/3→2/3, continuação até 3/3, recusa de 3/3 esgotado, autorização/plano ausentes, ref/SHA divergentes, árvore suja, sessão existente e repetição; comprovar ausência de reset, evento extra ou escrita fora do rito.

Merge do plano auth e do rito deverão ser humanos. Até haver autorização específica, implementação testada, integração legítima e abertura oficial com histórico cumulativo, **não aplicar patch nem executar produto**. O ponto de parada desta missão é o gate objetivo documentado, sem solicitar de novo autorizações já concedidas para preservação/reconciliação/documentação.

## Verificação documental e entrega

`node scripts/track.mjs registry`: **exit 0**, derivados gerados oficialmente. `node scripts/track.mjs verify --all`: **exit 0**, onze trilhas e REGISTRY/GATES sem divergências. `git diff --check`: **exit 0**.

Conferência documental adicional: [DOCUMENTATION_CHECKS_2026-10-28.json](DOCUMENTATION_CHECKS_2026-10-28.json), **PASS**. Allowlist de 44 para 45 entradas, somente o consumidor adicionado; ordem e paths anteriores preservados. Critérios técnicos integrais comparados com o GOAL fechado; demais metadados/revisão condicional/QA mantidos. Blobs dos ledgers reconciliado/origem idênticos e prefixo da main literal; arquivo fechado byte a byte igual ao SOURCE_SHA. Dois DONE/três BLOCKED/seis eventos, zero READY, nenhum marcador. Produto, núcleo e manifesto sem alteração. Este PASS valida documentação, não aceite de produto.

Arquivos da PR: três registros novos neste subtree (autorização, este relatório e conferência JSON), TRACK, proposta GOAL revisão 9, arquivo fechado revisão 8 copiado oficialmente, relatório RECONCILE-BLOCKED e derivados REGISTRY/ledger/state da trilha Pessoas. Nenhum outro path possui delta de conteúdo. A escrita de ledger/state/REGISTRY veio exclusivamente dos comandos oficiais, nunca de edição manual. Avisos Git de conversão LF/CRLF não foram tratados por reescrita de eventos.

Typecheck, build, runner, E2E e QA de produto não se aplicam à PR documental e não foram executados. Nenhum PASS técnico de produto novo. CURRENT_STATUS, changelog e memória global permanecem sem edição porque o frontend ainda não foi entregue. O patch, o núcleo AEP e os serviços externos permanecem sem alteração.

Ponto de parada: **REVISÃO 9 DOCUMENTAL PRONTA PARA MERGE HUMANO, COM GATE G-AEP-CORE PARA RETOMADA LEGÍTIMA**. Próxima ação: decisão humana específica sobre o rito de núcleo; esta PR não faz merge nem abre sessão.
