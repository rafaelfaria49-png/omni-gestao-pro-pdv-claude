# D05 — preparação técnica e homologação física pendente

GOAL `OMNI-PRINT-D05-HOMOLOGACAO-FISICA-END-TO-END-001`. **D05_PREPARED; PHYSICAL_HOMOLOGATION=PENDING.**
Esta entrega prepara ambiente, operador e evidências. Não declara D05=PASS nem recomenda ativação em produção.

Base confirmada: PR #327 em `0e9eb95d578c6c57e7e7f4b8b71355f460d970a4`, draft/aberta. #332 integrada por
`146430dd603ba18eda4d8a4b68575bffb98652e4`; #333 integrada por `0e9eb95d578c6c57e7e7f4b8b71355f460d970a4`.
Os seis workflows pós-merge desse head concluíram com sucesso, incluindo D02/D03/D04; referência em `evidence/d05/BASELINE.json`.
A worktree principal e as worktrees de D03/D04/#327 foram preservadas. AEP opt-in ausente na worktree D05; trilha omni-print
não cadastrada. Não foi criado GOAL adicional nem editado estado/ledger de outras frentes.

## Entrega e resultados

| Indicador | Resultado nesta preparação |
|---|---|
| D05_SOFTWARE_READY | PASS_PREPARATION — código `1613ef6`, validação offline e CI Linux/Windows aprovados; transporte ainda não ativado |
| D05_HARDWARE_READY | BLOCKED — equipamento, operador e consentimentos não fornecidos |
| D05_PHYSICAL_TESTS | 0/18 executados; 18 BLOCKED no template; nenhuma foto/contagem física produzida |
| D01_D04_REGRESSION | PASS no CI do código D05; offline 135/135, core/agente Windows 78/78, 004B 3/3 |
| POSTGRES_TESTS | PASS CI: retenção 17/17, offline 10/10, cenários 35/35, dois agentes 1/1, D02 8/8 + ensaio 5/5 |
| WINDOWS_TESTS | PASS CI: recuperação 24/24 + 6 provas, instalação/tarefa/update/uninstall e DPAPI segundo usuário no runner descartável; nenhuma instalação física |
| PLAYWRIGHT | PASS 19/19 no CI e local, Chromium e spooler simulado |
| CI_STATUS | PASS: D03/D04/D05, três workflows e seis jobs no código `1613ef6`; parent pós-merge 6/6 workflows PASS |
| INDEPENDENT_REVIEW | APPROVE para preparação; dois P2 corrigidos; conferência final de artefatos em REVISAO_INDEPENDENTE_D05.md |
| PHYSICAL_HOMOLOGATION | PENDING |
| PRODUCTION_UNCHANGED | zero acesso/escrita/migration/deploy/env; APPROVED_RELEASE=null; impressão e cron desligados |
| RELEASE_RECOMMENDATION | manter draft, sem merge ou liberação produtiva; aguardar gates físicos/ambiente |

Pacote D04 reproduzido com gerador oficial: `omni-print-agent-0.2.0-d04.zip`, SHA-256
`f48b30977a4cff2384e0ccfb8bf45bcc741d7da36c6edb3790cb55561255832a`, contentId
`1cfecac07faec9fea0d3e5e5c582ebb509564c9a502fc4be28b9884dcc7db540`, 17 arquivos + manifesto, **sem assinatura**.
Node 24 >=24.12 e PowerShell 5.1; mesma identidade Windows/DPAPI CurrentUser. Nenhuma instalação/tarefa/pareamento real.

## Mudanças e limites

Plano de recursos e segredos sem valores em `tools/print-d05/PLAN.json`; nenhum recurso externo criado. Preview automático
da branch D05 bloqueado antes do primeiro push. Validador offline confere os gates fechados, escopo Preview da branch,
release produtivo NULL, ZIP/manifesto/arquivos e registros H01–H18 com hashes de evidência. Testes sintéticos do validador
não são evidências físicas. `VALID` exige revisão humana da veracidade e do papel.

O plano explicita dois bloqueios técnicos operacionais: o runtime atual não habilita Preview com APPROVED_RELEASE=null,
e o cliente D04 não envia header de bypass Vercel. A autorização futura do transporte deve anteceder commit revisado de
ativação exclusiva de Preview e solução de acesso compatível. Não houve alteração de runtime/protocolo/PDV/schema/D01–D04.
O gerador oficial de HASHES.json foi estendido para incluir a preparação D05 e sua proteção de deploy.

## Provas verificadas do código

PR draft [#334](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/334), base #327. Código aprovado/testado:
`1613ef6dfb564a81ba4713644d9bd2696d7e87f5`; checkout técnico dos runners
`e4697c02873d48d334ecce6a76bd31376767d467` (merge sintético GitHub, sem merge de branch realizado pelo executor).
As atualizações finais só consolidam documentos/evidências/HASHES; fontes, workflows, plano e runtime são idênticos ao código
testado. O commit de consolidação usa `[skip ci]` para não repetir baterias aprovadas por mudança somente de evidências.
O SHA final da entrega é informado na PR/conversa; não se escreve o próprio hash dentro do commit.

| Execução | Evidência conferida |
|---|---|
| [D05 Linux/Windows](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/42071630596) | CI_D05_PACKAGE.json: 5/5 testes em cada SO, artefatos externos e ZIP interno, manifesto e template 18 BLOCKED |
| [D04 Windows/Linux](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/42071630936) | CI_D04_win32.json / CI_D04_linux.json: 7/7 e 3/3 etapas; Linux 24 aprovados + 6 exclusivos Windows cobertos no Windows |
| [D03 integral](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/42071630703) | CI_D03_linux.json: 16/16 etapas, oito mutações distintas detectadas com asserção/exit não zero e fontes restauradas |

Os arquivos acima ficam em `evidence/d05/`, com metadata independente em `ci-metadata/`. ZIP externo, SHA do head,
run/attempt/checkout, logs e exit 0 foram conferidos pelo verificador oficial D04; mutações não aceitam timeout, exit nulo,
falha de preparo ou mero texto FAIL. Build CI: `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED` presentes.
O pacote CI para o operador está no [artefato Windows sem assinatura](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/42071630936/artifacts/13435314309).
As URLs temporárias de download não são gravadas nas evidências; somente IDs/digests e URLs GitHub estáveis.

Compatibilidade textual: main é ancestral e merge-tree somente leitura com #331 tem zero marcadores de conflito, conforme
`COMPATIBILITY.json`. Revisão independente também conferiu ausência de alterações em PDV/runtime/schema. Não houve teste
funcional da combinação completa com #331 nem merge; esse limite não é convertido em PASS de integração.

## Falhas e tentativas locais

Todas as pastas locais com timestamp são WIP sobre `0e9eb95` e `workingTreeChanged=true`, sem serem atribuídas ao SHA do CI.
Os logs originais e hashes ficam preservados; resultados FAIL não são reclassificados:

- Primeiro npm ci foi bloqueado por DNS na sandbox; repetição autorizada das dependências na worktree própria concluiu.
- TEMP da sandbox recusou rename do Vitest; TEMP exclusivo corrigiu essa restrição. CIM/PowerShell e conexões locais
  também foram recusados na sandbox; repetição autorizada fora dela aprovou core/agente Windows 78/78 e a bateria PG/Playwright.
- Porta inicial 55495 foi recusada; o cluster próprio iniciou em 127.0.0.1:57495. Nenhum banco externo foi acessado.
- D02 local manteve P1001 do Prisma no resolve, com 8 casos não executados naquela tentativa. Não foi alterado D02 para
  contornar isso; a mesma bateria passou 8/8 e 5/5 no runner CI. O resultado local continua FAIL, com prova em seu log.
- Build local na sandbox falhou por DNS de `fonts.googleapis.com` e EPERM ao criar saída `.next`. Nenhum código de fonte
  ou proteção foi alterado para contornar o ambiente; o build integral do mesmo código passou no CI.
- Recuperação dentro da sandbox parou de forma conservadora com `PROCESS_IDENTITY_UNPROVEN` em três casos. Os 30 casos
  passaram fora dela e no CI Windows; não se removeu a verificação de identidade para fazer o teste passar.
- A revisão independente encontrou dois P2 do novo registro: equipamento/versões ausentes e aceite anterior aos testes.
  Ambos foram corrigidos e revalidados; nenhum P0/P1/P2 corrigível ficou pendente.

Regressão local também aprovou retenção 17/17, offline 10/10+135/135, cenários 35/35, dois agentes 1/1, 004B 3/3,
ensaio D02 5/5, Playwright 19/19, recuperação 30/30, typecheck e ESLint. A fonte canônica do resultado integral aprovado
é o CI exato do código acima; o conjunto local tem tentativas ambientais com falha e não recebe veredito global PASS.
`LOCAL_RESULTS.json` confere todos os hashes e separa cada tentativa. O cluster PostgreSQL próprio foi encerrado ao fim,
com seus arquivos preservados; nenhuma worktree de outra frente foi removida. A worktree D05 é mantida para continuação
após os gates humanos, com pacote/evidências necessários, portanto não é tratada como temporária ociosa descartável.

## Pendências humanas, operador e rollback

Liberar separadamente os cinco gates de `PLANO_AMBIENTE_D05.md` com alvos, consentimentos, local/data/janela e operador,
mais a ativação do transporte da release de homologação. Equipamento: POS-80 USB, driver/fila, Windows autorizado,
Chrome/Edge, bobinas 58/80 conforme suporte, e dois caixas para H15. N/A só por capacidade não suportada e aprovação;
falta de teste/equipamento permanece BLOCKED.

Comandos prontos: `CHECKLIST_OPERADOR_D05.md`. Execução/casos: `RUNBOOK_D05.md` e `ROTEIRO_HOMOLOGACAO_FISICA.md`.
Registro de provas: `evidence/d05/H01-H18.template.json`, copiado para pasta privada e validado sem expor segredos.

Rollback: interromper emissões e preservar relatos/UNKNOWN; revogar agente, Stop no mesmo SID e arquivar diário inteiro
depois de parada controlada. Uninstall só com revogação confirmada; histórico preservado. Remover variáveis da branch e
deployments antigos apenas com autorização; banco não será destruído com evidências pendentes. Não restaurar diário antigo,
não limpar fila/lock e não apagar UNKNOWN. Detalhes e ordem segura no plano.
