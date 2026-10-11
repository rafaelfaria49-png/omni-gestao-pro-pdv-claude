<!-- AEP:TRACK
{
  "completion_when_empty": "PAUSED"
}
-->

# Trilha pessoas — DP/RH

## Objetivo

Entregar o domínio Pessoas de forma incremental, com identidade do empregador separada da Store, dados trabalhistas versionados, autorização própria e isolamento entre empregadores. Esta trilha inicia somente o backend cadastral 001A; 001B e folha exigem planejamento e autorização próprios.

## Escopo — paths_base

- lib/pessoas/**
- app/actions/pessoas/**
- app/api/pessoas/documentos/**
- prisma/schema.prisma
- prisma/migrations/**
- scripts/pessoas/**
- docs/pessoas/**
- docs/execution-tracks/pessoas/**
- docs/execution-tracks/REGISTRY.md
- docs/ai-execution/GATES.md
- docs/ai-execution/protocol.json
- .env.example

## Fora de escopo

Frontend, navegação, motor/fechamento de folha, holerites próprios, pagamentos, integração com Financeiro/Contador, autenticação global, CI, produção e dados reais.

## Comando de teste da trilha

```
node scripts/pessoas/run-official-tests.mjs
```

Runner do GOAL em `scripts/pessoas/**`: HEAD commitado, workspace temporário externo, PostgreSQL descartável, sem teste pulado.

## Gates extras exigidos por esta trilha

- G-DADOS-SCHEMA: adições de schema e migration, execução somente em homologação isolada.
- G-AEP-CORE: exclusivamente registro da nova trilha em protocol.json pela CLI oficial.
- G-CONFIG-DEPLOY: somente nomes de variáveis DP em .env.example, se necessários.
- G-AUTH e G-CI não liberados. Produção não liberada.

## Branch e worktree

- branch: goal/pessoas-001a-fundacao-backend
- worktree: C:/Projetos/omni-gestao-pessoas-001a-backend
- base de partida: origin/main 77111da450c7d0d2610ec5b1533b6975b2fd0b5d (2026-09-29)

## Plano de origem

- plan_ref: OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15
- plan_rev: 3 (sucessor 001B; revisões anteriores preservadas abaixo)
- recorte: PESSOAS-000 incorporado ao pre-flight; PESSOAS-001A backend; 001B frontend posterior.

## Estado

O estado ratificado vive em `state.json` e `LEDGER.jsonl`. Gerar derivados somente pela CLI AEP.

## Histórico — hardening obrigatório antes do frontend 001B — revisão 2

- Predecessor DONE: PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A.
- Sucessor da revisão 2, agora DONE: PESSOAS-DP-HARDENING-P2-PRE-001B-001, exclusivamente P2034/retry bounded, jornada/PII em log e cache/offline Pessoas. Os 13 P3 permanecem fora do recorte.
- Branch de planejamento: plan/pessoas-hardening-p2-pre-001b-001; PR governance-only para main, sem open/close, implementação ou merge pelo agente.
- Branch futura: goal/pessoas-hardening-p2-pre-001b-001.
- Worktree futura: C:/Projetos/omni-gestao-pessoas-hardening-p2-pre-001b.
- Base inspecionada do planejamento: origin/main d63b557d04fe446f3627bfdca6827c2c6e059b8c (04/10/2026), contendo o merge 001A ed0454d91a5e3e447922068bc9d2dbc0eae88e36. Execução parte da origin/main corrente após merge humano do plano.
- Teste do sucessor: node scripts/pessoas/run-hardening-tests.mjs, reutilizando o runner oficial e exigindo build real/inspeção PWA, sem testes pulados.
- Classe C3, risco ALTO, familia_executor openai, revisao_independente true; plan_rev 2.
- G-CONFIG-DEPLOY: aprovado pelo usuário nesta conversa em 01/10/2026 exclusivamente para next.config.mjs e exclusivamente para excluir Pessoas de cache/offline com NetworkOnly same-origin. Esse path integra o recorte do sucessor; preservar caches dos demais módulos e cacheOnFrontEndNav global.
- Nenhum outro gate liberado para o sucessor. Os paths, gates, teste, branch e worktree do 001A acima são históricos e não ampliam a allowlist do novo GOAL.
- Hardening concluído/revisado é pré-requisito obrigatório do frontend 001B; este planejamento não autoriza UI, flag DP, migration de ambiente, produção, folha ou GOAL 002.

## Sucessor atual — frontend cadastral 001B — revisão 3

Esta seção define somente o sucessor 001B. Paths/gates/branch/worktree/testes de 001A e P2 acima são históricos e não ampliam a autorização atual. Os dois GOALs permanecem DONE; ledger e arquivos fechados não são alterados.

- Único GOAL READY: `PESSOAS-DP-FRONTEND-CADASTRO-001B`.
- Fonte executável: `goals/PESSOAS-DP-FRONTEND-CADASTRO-001B.md` (AEP:META e critérios completos).
- plan_ref: OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15; plan_rev: **3**.
- Classe C3, risco ALTO, familia_executor openai, revisao_independente true.
- Branch de planejamento: `plan/pessoas-001b-frontend → main`, somente governança; commit/push/PR autorizados, merge humano.
- Branch futura: `goal/pessoas-001b-frontend`.
- Worktree futura: `C:/Projetos/omni-gestao-pessoas-001b-frontend`.
- Base inspecionada: origin/main `7cd2c65c0bc23a9f1922cbc280494e62257251ff`, 10/10/2026. Os HEADs ratificados 001A e P2 são ancestrais; P2 mergeado pelo PR #255 (`c1736651864bed3959d50af302fd1ed88c7b4d89`).
- Pré-execução: merge humano do plano, autorização da nova sessão e vinculação documental do relatório R do P2. **REVISÃO R REALIZADA EXTERNAMENTE — VINCULAÇÃO DOCUMENTAL PENDENTE**: ZCode/GLM (Z.ai), família Z.ai/GLM, em 09/10/2026, HEAD `53250ef52c4401bdc2e0de22aab12b1f13222117`, conforme referência fornecida pelo usuário em 10/10/2026 e preservada no GOAL 001B. REVIEW_CODE=APPROVE; P0=0/P1=0/P2=0/P3=2; runner independente 95 testes/0 skipped/0 todo; MERGE_READINESS=READY; FRONTEND_001B_READINESS=READY. Sem review formal no GitHub. A pendência é documental, não técnica, e não impede o merge do planejamento da PR #260; preservar autoria/data/SHA/resultado e vincular o relatório completo antes de executar. Gates da execução mantidos.
- Escopo: visão geral cadastral, lista/pesquisa/filtros, cadastro/edição/ficha, contrato/remuneração/jornada, histórico, documentos privados, setup empregador/estabelecimento e estados DP; persistência exclusivamente pelas actions/APIs 001A.
- Navegação: Financeiro HUB → Pessoas → Contador HUB, desktop/mobile/focus mode. Reader server-only compõe guards existentes; único transporte novo é GET `app/api/pessoas/disponibilidade/route.ts`, read-only/no-store. Disponibilidade não deriva de enterprise/Financeiro/GERENTE/FULL; preservar bootstrap autorizado.
- Paths do sucessor: rotas/componentes locais Pessoas; três arquivos de menu; endpoint e reader de disponibilidade; adapter puro de DTO; seis paths específicos de testes/runner; relatório/evidência do GOAL; artefatos AEP de fechamento. **A allowlist exata é somente a do META**, com justificativa de cada path no GOAL.
- Teste futuro: `node scripts/pessoas/run-frontend-tests.mjs`, a implementar no 001B; HEAD por git archive, instalação limpa, PostgreSQL descartável, suíte 001A/P2 + frontend, E2E autenticado sintético, build/PWA/typecheck/lint, zero skipped/todo e limpeza conferida. Não há runner/frontend novo neste PR de planejamento.
- Gates liberados: **nenhum**. Auth, schema, migrations, configuração PWA/deploy/CI e core AEP fora da allowlist. Preview exige configuração DP isolada autorizada, incluindo prova documental R2 real; nenhuma ativação produtiva.
- Fora do recorte: gestão nova de grants/unidades adicionais, P3s, folha, holerite próprio, férias, 13º, rescisão, GOAL 002, integrações Financeiro/Contador e outro backend de funcionários.
- Nesta missão: não executar open/close, não implementar UI nem fazer merge. Gerar derivados por `registry`, conferir `verify --all` e `git diff --check`.
- Ponto de parada: **PESSOAS 001B — PLANO AEP PRONTO PARA MERGE HUMANO**.
