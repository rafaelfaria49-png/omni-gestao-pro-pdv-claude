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
| D05_SOFTWARE_READY | preparação offline implementada; verificações finais/CI a consolidar |
| D05_HARDWARE_READY | BLOCKED — equipamento, operador e consentimentos não fornecidos |
| D05_PHYSICAL_TESTS | 0/18 executados; 18 BLOCKED no template; nenhuma foto/contagem física produzida |
| D01_D04_REGRESSION | baseline pós-merge PASS; regressão do delta a consolidar |
| POSTGRES_TESTS | baseline D03 PASS; laboratório exclusivo D05 a consolidar |
| WINDOWS_TESTS | baseline D04 PASS em runner descartável; instalação física não executada |
| PLAYWRIGHT | baseline D03 PASS; repetição D05 a consolidar |
| CI_STATUS | parent 6/6 workflows PASS; CI da PR D05 pendente |
| INDEPENDENT_REVIEW | pendente após consolidação das verificações |
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
