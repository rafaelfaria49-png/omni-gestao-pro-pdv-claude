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
- plan_rev: 2
- recorte: PESSOAS-000 incorporado ao pre-flight; PESSOAS-001A backend; 001B frontend posterior.

## Estado

O estado ratificado vive em `state.json` e `LEDGER.jsonl`. Gerar derivados somente pela CLI AEP.

## Sucessor obrigatório antes do frontend 001B — revisão 2

- Predecessor DONE: PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A.
- Sucessor READY: PESSOAS-DP-HARDENING-P2-PRE-001B-001, exclusivamente P2034/retry bounded, jornada/PII em log e cache/offline Pessoas. Os 13 P3 permanecem fora do recorte.
- Branch de planejamento: plan/pessoas-hardening-p2-pre-001b-001; PR governance-only para main, sem open/close, implementação ou merge pelo agente.
- Branch futura: goal/pessoas-hardening-p2-pre-001b-001.
- Worktree futura: C:/Projetos/omni-gestao-pessoas-hardening-p2-pre-001b.
- Base inspecionada do planejamento: origin/main d63b557d04fe446f3627bfdca6827c2c6e059b8c (04/10/2026), contendo o merge 001A ed0454d91a5e3e447922068bc9d2dbc0eae88e36. Execução parte da origin/main corrente após merge humano do plano.
- Teste do sucessor: node scripts/pessoas/run-hardening-tests.mjs, reutilizando o runner oficial e exigindo build real/inspeção PWA, sem testes pulados.
- Classe C3, risco ALTO, familia_executor openai, revisao_independente true; plan_rev 2.
- G-CONFIG-DEPLOY: aprovado pelo usuário nesta conversa em 01/10/2026 exclusivamente para next.config.mjs e exclusivamente para excluir Pessoas de cache/offline com NetworkOnly same-origin. Esse path integra o recorte do sucessor; preservar caches dos demais módulos e cacheOnFrontEndNav global.
- Nenhum outro gate liberado para o sucessor. Os paths, gates, teste, branch e worktree do 001A acima são históricos e não ampliam a allowlist do novo GOAL.
- Hardening concluído/revisado é pré-requisito obrigatório do frontend 001B; este planejamento não autoriza UI, flag DP, migration de ambiente, produção, folha ou GOAL 002.
