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
- plan_rev: 1
- recorte: PESSOAS-000 incorporado ao pre-flight; PESSOAS-001A backend; 001B frontend posterior.

## Estado

O estado ratificado vive em `state.json` e `LEDGER.jsonl`. Gerar derivados somente pela CLI AEP.
