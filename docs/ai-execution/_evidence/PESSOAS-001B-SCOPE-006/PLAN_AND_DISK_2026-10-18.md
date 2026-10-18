# Pessoas 001B — revisão formal de escopo 6 e diagnóstico de disco

Data: 18/10/2026. Natureza: planejamento documental autorizado e inspeção somente de metadados. Não é execução do corretivo nem aceite de runtime.

## Identidade e autorização

- GOAL preservado: `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`.
- Branch documental: `plan/pessoas-001b-scope-006`.
- Main base confirmada por consulta remota: `976ebaa294e09441ce0c5be7bbe5776a568f4013`.
- Implementação: [PR #273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273), OPEN/DRAFT, base main, branch `goal/pessoas-001b-recovery-001`, HEAD `5eac8be5820f0d9a9ef0374e52bf1603112f78ca`.
- Worktree de execução preservada: `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`.
- Autorização humana: acrescentar exclusivamente `lib/pessoas/documentos/service.ts` à allowlist; diagnosticar espaço sem excluir, mover, comprimir ou limpar; commit/push documental e PR para main, sem merge.

## Delta de planejamento

Revisão 5 → 6: uma inclusão, nenhuma remoção na allowlist (40 → 41 entradas). Serviço autorizado futuramente apenas para P2-01: `refCanonica` deve aceitar `storeId` segundo `exigirAtor`, preservando validações de `empregadorId`/`documentoId` e namespace. A regra atual de oito caracteres rejeita os IDs válidos de seis caracteres `loja-1` e `loja-2`. Regressão prevista em `scripts/pessoas/frontend.integration.test.ts`, já permitido anteriormente.

Não há autorização para outros serviços documentais, adapter R2, auth, schema ou migrations. `test_command`, reserva de 12 GiB, classe C3, risco ALTO e gates permanecem. Nenhum código de produto foi alterado nesta missão.

Decisão humana de 18/10/2026, exclusiva desta PR:

```text
INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION
SELF_REVIEW=CODEX
HUMAN_MERGE_AUTHORIZATION=PENDING
```

A dispensa é condicional à autorrevisão integral sem achados bloqueantes e às verificações técnicas obrigatórias. P2-01 continua aberto; não declarar a condição satisfeita. Autorrevisão não é revisão independente R. Não solicitar outra revisão GLM nem enviar código a IA externa. A política histórica `revisao_independente=true` permanece explícita; a exceção específica está registrada no META e na seção atual do GOAL, sem alterar a governança global.

## Retomada AEP: impedimento comprovado

Inspeção estática da CLI, sem executar `open`, `close`, `attempt`, `block` ou `check`. O blob de `scripts/track.mjs` é o mesmo na main base e na implementação: `4f8440a5ece14b14500162d19b576b480f6ac208`.

| Mecanismo vigente | Constatação | Consequência |
| --- | --- | --- |
| `cmdOpen`, linhas 743–800 | `const active = existing || {...allowlist: meta.allowlist...}`; em sessão existente atualiza somente `base_commit` | Reabrir não atualiza a allowlist do marcador |
| `runCheck`, linhas 895–901 | Diff `active.base_commit..HEAD` conferido contra `active.allowlist` | Novo serviço continua fora do snapshot autorizado |
| Item 8, linhas 915–919 | Rejeita paths `goals/**` no delta da execução | Copiar/cherry-pick apenas a revisão do GOAL não resolve |
| Hook, linha 1809 | Staged validado contra `active.allowlist` | Briefing novo não substitui snapshot antigo |
| `cmdRegistry`, linhas 1412–1427 | Regenera states, REGISTRY e GATES, sem escrever marcador | Registry não é refresh da sessão |

Snapshot observado da execução: tentativa 1 de 3; `attempts_log=[]`; abertura `2026-10-12T23:27:06.181Z`; base `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`; 40 entradas; serviço ausente. SHA256 de `.aep-active`: `CA76B04E214E25C20FF54FC2FBCAF9BB3F1C8EEBC8E2CAE4B9D68C65744F077F`.

**Não existe mecanismo vigente comprovadamente compatível para refresh da allowlist preservando esta sessão aberta.** A CLI não possui comando de refresh. Seus escritores do marcador são `open` e `attempt`; este último registra tentativa e não oferece atualização de escopo.

Após merge humano do plano, uma futura integração Git explicitamente autorizada deverá produzir base comum que contenha a revisão 6 e GOAL idêntico na execução, satisfazendo o item 8. Isso é condição necessária, mas insuficiente: ainda falta refresh oficial do snapshot. Não foi executada nenhuma integração nesta missão.

Resolução necessária antes do corretivo: decisão humana específica no rito AEP/core sobre mecanismo legítimo que atualize escopo preservando tentativa, abertura e histórico. Esta PR não libera G-AEP-CORE nem implementa esse mecanismo. Não editar/remover/recriar `.aep-active`, não reiniciar tentativas, não modificar CLI, não contornar hooks/check e não usar close/block para simular retomada. Merge do plano, isoladamente, não desbloqueia a execução.

## Diagnóstico de disco

### Método e cobertura

Levantamento dirigido, sem elevação, apenas nomes/atributos/tamanhos de diretórios e arquivos; nenhum conteúdo pessoal ou credencial aberto. Totais por caminho obtidos das listagens concluídas de `robocopy <origem> C:/__pessoas_metadata_only_no_destination__ /L /E /XJ /BYTES /NFL /NDL /R:0 /W:0 /NP /NJH`. A ajuda local confirma que `/L` lista somente, sem copiar ou alterar timestamps; `/XJ` exclui links/junções. Não houve opção de log nem criação do destino fictício (ausência confirmada ao final). Exit 1 significa itens que seriam copiados, não cópia executada; os resumos utilizados têm zero falhas.

São **tamanhos lógicos**, não bytes alocados nem liberação garantida. Hardlinks, arquivos esparsos/comprimidos, junções excluídas, arquivos em uso e mudanças simultâneas podem alterar o resultado físico. Varreduras amplas incompletas foram interrompidas e descartadas; não se declara censo integral de C:, total de C:/Projetos ou total de .codex. Os caminhos relevantes abaixo têm medições concluídas. Dados detalhados: [disk-metadata-2026-10-18.json](disk-metadata-2026-10-18.json).

### Volumes

Snapshot **2026-10-18 13:40:26 -03:00**: C: livre **1.85 GiB** (1.989.705.728 bytes), total 510.909.214.720 bytes; requisito **12 GiB**; falta **10.15 GiB** antes de considerar futuras instalações. O espaço variou durante a sessão por atividade concorrente; medir novamente antes do runner.

G: existe, mas `IsReady=false`; capacidade e espaço livre indisponíveis. Nenhum volume alternativo utilizável foi comprovado. Não foi alterado TEMP nem movida a worktree AEP. Mesmo com outro volume disponível no futuro, o runner exige reserva nos volumes pertinentes, inclusive o das evidências; mudar apenas TEMP não elimina a exigência em C:.

### Consumo relevante observado

| Caminho / grupo | GiB lógicos | Origem provável | Pode conter trabalho/estado ativo? |
| --- | ---: | --- | --- |
| C:/Projetos — 22 .next + 4 node_modules medidos, caminhos disjuntos | ≥43,89 | Builds e dependências de projetos/worktrees Omni; limite inferior, não total do diretório | Sim; atividade de cada sessão não foi presumida encerrada |
| 22 .next Omni (caminhos individuais no JSON) | 40,34 | Builds/caches Next.js | Sim; podem sustentar dev/preview ativo |
| C:/Users/rafae/AppData/Local/Docker | 30,55 | Dados locais Docker Desktop/WSL; podem incluir imagens, volumes e bancos | Sim; não tratar como cache descartável; nenhum comando Docker executado |
| C:/Users/rafae/AppData/Local/Programs | 10,18 | Aplicativos instalados por usuário | Sim; não propor remoção de arquivos internos |
| C:/Projetos/omni-gestao-pdv-n3 | 7,82 | Worktree antiga PDV, incluindo .next de 2,72 GiB | Sim; código local/commits não publicados não auditados |
| C:/Users/rafae/AppData/Local/npm-cache | 3,63 | Cache npm reinstalável | Sim; pode haver npm em andamento |
| C:/Projetos/omni-gestao-ops-v4-fluxo-curto-003 | 2,91 | Worktree de Operações; .next corresponde a 2,82 GiB | Sim; idade do diretório não prova abandono |
| C:/Users/rafae/AppData/Local/Temp | 2,82 | Temporários gerais e de desenvolvimento | Sim; excluído do cálculo de liberação proposto |
| C:/Users/rafae/.cache | 2,73 | Caches e runtimes; inclui runtime Codex/Python usado nesta sessão | Sim, uso confirmado do runtime; excluído da proposta |
| C:/Projetos/omni-gestao/.next | 2,72 | Build na worktree compartilhada | Sim; excluído da proposta selecionada |
| C:/Users/rafae/AppData/Local/ms-playwright | 2,38 | Navegadores de automação | Sim; dependência de validações futuras, preservar |
| C:/Projetos/omni-gestao/node_modules | 0,93 | Dependências compartilhadas Omni | Sim; preservar |
| C:/Projetos/omni-gestao-cad-r2-002-rest-ownership/node_modules | 0,93 | Dependências de worktree Cadastros | Sim; preservar |
| C:/Projetos/omni-gestao-pdv-n1/node_modules | 0,90 | Dependências de worktree PDV | Sim; preservar |
| C:/Projetos/omni-gestao-auth-002 | 0,84 | Worktree antiga auth; node_modules de 0,79 GiB incluso | Sim; nenhuma limpeza de fonte autorizada |
| C:/Users/rafae/AppData/Local/ms-playwright-go | 0,09 | Navegador de automação Go | Sim; preservar |

Não somar pais e filhos da tabela. O JSON contém os 22 .next individualmente e todos os demais caminhos medidos. A worktree Pessoas não apresenta .next/node_modules locais na inspeção; não é candidata a limpeza. A enumeração Git mostra várias worktrees registradas, inclusive referências prunable; referência ausente não representa espaço de checkout recuperável. Não arquivar/remover worktrees só pela idade/nome.

Metadados dos temporários por prefixo: 4.060 diretórios `omni*`, 96 `playwright*`, 14 `codex*`, um `claude*` e um `opencode*`. Esses nomes indicam origem provável, não inatividade. Há temporários com escrita em 18/10; nenhum conteúdo ou credencial foi aberto. Não se atribui todo o total Temp exclusivamente ao desenvolvimento.

### Plano de liberação para autorização posterior

Potencial amplo medido, sem sobreposição: **43,97 GiB lógicos** = 40,34 GiB nos 22 .next + 3,63 GiB npm. Não inclui Temp, Docker, Programs, runtimes, navegadores, node_modules ou exclusão de worktrees. Recuperação física garantida neste momento: **0 GiB**; nenhuma exclusão autorizada/executada.

Proposta selecionada, ainda **NÃO AUTORIZADA**: **17,97 GiB lógicos**, pelos oito caminhos abaixo:

| Caminho | GiB lógicos |
| --- | ---: |
| C:/Projetos/omni-gestao-ops-datas-retroativas-001/.next | 1.73 |
| C:/Projetos/omni-gestao-ops-recebimento-misto-p1-hardening-001/.next | 1.69 |
| C:/Projetos/omni-gestao-ops-v3-recebimento-misto-001/.next | 1.69 |
| C:/Projetos/omni-gestao-ops-v4-fluxo-curto-001/.next | 1.74 |
| C:/Projetos/omni-gestao-ops-v4-fluxo-curto-002/.next | 1.95 |
| C:/Projetos/omni-gestao-ops-v4-fluxo-curto-003/.next | 2.82 |
| C:/Projetos/omni-gestao-pdv-n3/.next | 2.72 |
| C:/Users/rafae/AppData/Local/npm-cache | 3.63 |

1. Solicitar decisão humana sobre esses caminhos exatos e confirmar com os responsáveis que os sete builds não sustentam sessões dev/preview e que nenhum npm usa o cache. Não encerrar processos automaticamente.
2. Somente após autorização, uma futura tarefa poderá remover os builds/cache aprovados, preservando fontes, .git, arquivos de ambiente, evidências, worktrees e histórico AEP. Não remover toda a árvore Temp nem usar limpeza automática genérica.
3. Se os 17,97 GiB lógicos corresponderem à liberação física, C: passaria de 1.85 para aproximadamente **19.82 GiB livres**. Medir os bytes realmente liberados; se insuficientes, escolher outro .next do inventário mediante nova decisão, sem presumir autorização em lote.
4. Medir novamente após instalações e antes do runner: manter a reserva real de 12 GiB em cada volume exigido. Não reduzir o guard, trocar test_command ou mover silenciosamente a worktree. Uma alternativa futura exige volume pronto e autorização compatível com o AEP; G: não está utilizável nesta evidência.

`FILES_DELETED=NONE`; nenhum arquivo foi movido, comprimido ou limpo. Somente documentos desta branch e derivados oficiais foram escritos.


## Governança e validação documental

- `node scripts/track.mjs registry`: exit 0, geração oficial dos derivados.
- `node scripts/track.mjs verify --all`: exit 0, 11 trilhas consistentes, REGISTRY e GATES consistentes.
- Dois DONE, um BLOCKED histórico e quatro eventos preservados. Mesmo GOAL atual RUNNING/READY e nenhum sucessor.
- Nenhuma edição manual de ledger, state, REGISTRY ou GATES. A geração oficial não produziu diferença semântica nesses derivados.
- Nenhum teste, typecheck, build, Docker, mudança produtiva ou GOAL 002 executado. A missão documental não exige testes de produto e o usuário os proibiu nesta etapa.
- CURRENT_STATUS, CHANGELOG e MASTER_CONTEXT não alterados: não houve mudança funcional, arquitetural global ou entrega de runtime.

Próximo gate: `HUMAN_MERGE_PLAN_AND_DISK_DECISION`, com resolução formal adicional do impedimento de retomada AEP antes de editar o serviço.
