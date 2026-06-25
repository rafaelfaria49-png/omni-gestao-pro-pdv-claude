---
title: GOAL Template — Template oficial para GOALs individuais
status: vivo
owner: produto + arquitetura
last_update: 2026-06-25
versao: v1
bloco: execution-v2-bloco2
---

# 📋 GOAL Template — Template oficial

> **Use este template para formatar qualquer GOAL individual enviado ao agente.**
> Um GOAL bem escrito é uma autorização operacional completa — o agente executa sem pausas desnecessárias.
> Consulte [`EXECUTION_RULES.md`](./EXECUTION_RULES.md) para as regras de execução.
> Consulte [`HUMAN_GATES.md`](./HUMAN_GATES.md) e [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) para os limites que nenhum GOAL pode sobrescrever.

---

## Como usar este template

1. Copie a seção **"Template completo"** abaixo.
2. Preencha cada campo — campos marcados com `[OBRIGATÓRIO]` nunca podem ficar em branco.
3. Remova os campos `[OPCIONAL]` que não se aplicam.
4. Envie para o agente. O GOAL substitui o Gate #1 do Engine para tasks **S** pré-aprovadas.

> **Regra de ouro:** quanto mais explícito o GOAL, menos o agente precisa perguntar.

---

## Template completo

```
GOAL — <NOME DO GOAL> [OBRIGATÓRIO]

Modelo recomendado: <Sonnet 4.6 | Opus 4.8> [OBRIGATÓRIO]
Tipo: <documentação | implementação | refactor | bugfix | auditoria | overnight-batch> [OBRIGATÓRIO]
Tamanho: <S (≤4h) | M (≤8h) | L (>8h — exige aprovação humana)> [OBRIGATÓRIO]
Modo: <SAFE-lite | Continuous Execution | Overnight> [OBRIGATÓRIO]

---

Objetivo:
<Uma frase descrevendo o resultado esperado.> [OBRIGATÓRIO]

---

Contexto:
<Por que este GOAL existe agora? Qual problema resolve? Qual módulo/estado atual justifica?> [OBRIGATÓRIO]
<Mínimo 2 frases. Máximo 10 linhas.>

---

Fontes de verdade:
- <docs/ai/CURRENT_STATUS.md — estado atual do módulo>
- <docs/execution/EXECUTION_RULES.md — regras de execução>
- <docs/skills/rules/CORE_RULES.md — regras inegociáveis>
- <outros arquivos relevantes — roadmap, ADR, blueprint>
[OBRIGATÓRIO — ao menos 1 fonte]

---

Autorização:
Executar até finalizar sem pedir confirmações intermediárias.
O GOAL é a autorização operacional.
Aceitar automaticamente: leitura de arquivos, criação/edição dentro do escopo, tsc, testes, build, git status/diff/log.
[OBRIGATÓRIO — copiar como está ou adaptar se houver restrição adicional]

---

Escopo permitido:
- <pasta/arquivo específico>
- <pasta/arquivo específico>
[OBRIGATÓRIO — lista explícita]

Escopo proibido:
- app/
- components/
- lib/
- prisma/schema.prisma
- auth.ts / auth.config.ts / proxy.ts
- <outros específicos deste GOAL>
[OBRIGATÓRIO — ao menos os padrões acima]

---

Auto Approval neste GOAL:
- leitura de qualquer arquivo
- criação/edição em: <listar pastas permitidas>
- npx tsc --noEmit
- npm run test
- npm run build [INCLUIR SE APLICÁVEL]
- git status / git diff / git log
- commit local seletivo [INCLUIR SE AUTORIZADO]
[OBRIGATÓRIO]

Gates obrigatórios neste GOAL:
- git push: NÃO autorizado [ou: autorizado após revisão humana]
- db:push / migration: NÃO autorizado
- prisma/schema.prisma: NÃO autorizado
- produção/Vercel: NÃO autorizado
[OBRIGATÓRIO — listar sempre, mesmo que todos sejam NÃO]

---

Arquivos permitidos (allow-list):
- <path/arquivo.ext — descrição do que será criado/alterado>
- <path/arquivo.ext — descrição>
[OBRIGATÓRIO — lista positiva explícita]

Arquivos proibidos (deny-list):
- prisma/schema.prisma
- auth.ts / auth.config.ts / proxy.ts
- qualquer arquivo fora do escopo acima
[OBRIGATÓRIO]

---

Tarefas:
1. <Tarefa numerada e específica>
2. <Tarefa numerada e específica>
3. <...>
[OBRIGATÓRIO — ao menos 1 tarefa]

---

Validações obrigatórias:
- [ ] npx tsc --noEmit [INCLUIR SE HOUVER CÓDIGO .ts/.tsx]
- [ ] npm run build [INCLUIR SE HOUVER MUDANÇA EM CONFIG/ROTAS/SERVER ACTIONS]
- [ ] npm run test [INCLUIR SE HOUVER CÓDIGO TESTADO]
- [ ] git diff --name-only confirma apenas arquivos do escopo
[OBRIGATÓRIO — ao menos o git diff]

---

Critérios de aceite (Definition of Done):
- [ ] <critério mensurável 1>
- [ ] <critério mensurável 2>
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] Nenhum push realizado
[OBRIGATÓRIO — ao menos 2 critérios de negócio + as 2 últimas linhas]

---

Política de commit:
- Commit local: <autorizado | não autorizado> [OBRIGATÓRIO]
- Mensagem: <tipo(escopo): descrição> [SE AUTORIZADO]
- Stage: seletivo — somente arquivos da allow-list [SE AUTORIZADO]
- Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com> [SE AUTORIZADO]

Política de push:
- Push: NÃO autorizado neste GOAL. [OBRIGATÓRIO — ou: "autorizado após confirmação humana separada"]

---

Relatório final obrigatório:
O agente deve retornar ao final:

1. Arquivos criados: []
2. Arquivos alterados: []
3. Validações: tsc ✅/❌ | build ✅/❌/n.a. | testes N passed ✅/❌
4. Commit local: sim (hash) / não
5. Riscos identificados: []
6. Próximo passo: []
7. Confirmações: nenhum push | nenhuma migration | nenhuma área protegida | nenhum arquivo fora do escopo

---

Próximo passo esperado:
<O que o próximo GOAL ou o humano deve fazer após este GOAL ser concluído.> [OPCIONAL]

---

Checklist antes de declarar Goal Achieved:
- [ ] Todos os critérios de aceite marcados
- [ ] git diff --name-only mostra apenas arquivos do escopo
- [ ] tsc/build/testes conforme política de validação
- [ ] Relatório final emitido
- [ ] Nenhum push realizado
- [ ] Nenhuma área protegida tocada
- [ ] Arquivos fora do escopo preservados intocados
[OBRIGATÓRIO — executar antes de encerrar]
```

---

## Exemplos

### Exemplo A — GOAL de documentação

```
GOAL — Execution Engine V2 — Bloco 1 — EXECUTION_RULES.md

Modelo recomendado: Sonnet 4.6
Tipo: documentação
Tamanho: S (≤4h)
Modo: SAFE-lite

Objetivo:
Criar docs/execution/EXECUTION_RULES.md como regra oficial para execução
contínua de múltiplos GOALs em sequência, inclusive modo overnight.

Contexto:
O projeto já tem EXECUTION_ENGINE.md (pipeline de 17 fases) mas não tem
documento específico que governe o comportamento do agente quando GOALs são
enviados em sequência ou como batch overnight. Este documento preenche essa
lacuna sem criar fase nova no pipeline.

Fontes de verdade:
- docs/execution/EXECUTION_ENGINE.md
- docs/execution/HUMAN_GATES.md
- docs/execution/SAFE_GUARDS.md

Autorização:
Executar até finalizar. O GOAL é a autorização operacional.

Escopo permitido:
- docs/execution/

Escopo proibido:
- app/, components/, lib/, prisma/

Auto Approval: leitura, criação em docs/execution/, tsc n.a., git read-only.
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO.

Arquivos permitidos:
- docs/execution/EXECUTION_RULES.md (criar)
- docs/execution/INDEX.md (atualizar ponteiro)

Tarefas:
1. Criar EXECUTION_RULES.md com 9 seções conforme objetivo.
2. Adicionar ponteiro no INDEX.md.

Validações:
- [ ] git diff --name-only confirma apenas docs/execution/

Critérios de aceite:
- [ ] EXECUTION_RULES.md existe e cobre os 9 tópicos do objetivo
- [ ] INDEX.md atualizado
- [ ] Nenhum arquivo fora de docs/execution/ modificado
- [ ] Nenhum push realizado

Política de commit: não autorizado neste GOAL.
Política de push: NÃO autorizado.

Relatório final: retornar arquivos criados, alterados, validações, riscos, próximo passo.
```

---

### Exemplo B — GOAL de implementação segura

```
GOAL — Fiscal — GOAL_009 — Fila de emissão assíncrona (dormente)

Modelo recomendado: Sonnet 4.6
Tipo: implementação
Tamanho: S (≤4h)
Modo: SAFE-lite

Objetivo:
Criar lib/fiscal/queue/ com contrato e stub da fila de emissão assíncrona,
dormente, sem callers produtivos, sem tocar PDV/Caixa/Financeiro/Prisma.

Contexto:
A arquitetura fiscal (ADR-0008) prevê fila assíncrona para emissão de NFC-e.
O pipeline ponta-a-ponta (lib/fiscal/pipeline/) já existe mas emite de forma
síncrona via stub. A fila é o próximo passo antes de ativação real.

Fontes de verdade:
- docs/decisions/ADR-0008-fiscal-architecture.md
- lib/fiscal/pipeline/ (referência de interface)
- docs/ai/CURRENT_STATUS.md (estado fiscal atual)

Autorização:
Executar até finalizar. O GOAL é a autorização operacional.

Escopo permitido:
- lib/fiscal/queue/ (criar diretório e arquivos)
- lib/fiscal/queue/*.ts (novos arquivos apenas)

Escopo proibido:
- app/, components/, prisma/schema.prisma, lib/fiscal/pipeline/ (não alterar)
- PDV, Caixa, Financeiro, Operações funcionais

Auto Approval: leitura, criação em lib/fiscal/queue/, npx tsc --noEmit,
npm run test, git read-only.
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO.

Arquivos permitidos:
- lib/fiscal/queue/types.ts (contrato)
- lib/fiscal/queue/stub-queue.ts (implementação stub)
- lib/fiscal/queue/index.ts (barrel export)
- lib/fiscal/queue/queue.test.ts (testes unitários)

Tarefas:
1. Criar tipos do contrato FiscalQueue em types.ts.
2. Criar StubFiscalQueue com enqueue/dequeue/status em memória.
3. Criar testes cobrindo os casos principais.
4. Validar com tsc + vitest.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test — novos testes passando
- [ ] git diff --name-only mostra apenas lib/fiscal/queue/

Critérios de aceite:
- [ ] Contrato FiscalQueue definido (enqueue, dequeue, status)
- [ ] StubFiscalQueue implementado em memória
- [ ] 0 callers fora de lib/fiscal/queue/ (dormente confirmado por grep)
- [ ] tsc limpo
- [ ] Testes passando
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(fiscal): fila assíncrona dormente (GOAL_009).
Política de push: NÃO autorizado.

Relatório final: arquivos criados, tsc ✅, testes N passed, commit hash, riscos, próximo passo.
```

---

### Exemplo C — GOAL overnight com múltiplas tarefas

```
GOAL — Overnight Batch — Sprint Documentação Q3

Modelo recomendado: Sonnet 4.6
Tipo: overnight-batch
Tamanho: S por GOAL (batch de 4 GOALs)
Modo: Overnight

Objetivo:
Executar em sequência 4 GOALs de documentação e atualização de status,
sem código produtivo, sem push, gerando relatório consolidado ao final.

Contexto:
Pré-aprovação humana: concedida nesta mensagem.
Nenhum GOAL toca área protegida.
Todos são tamanho S (documentação pura ou ajustes em docs/).

Autorização:
Batch overnight pré-aprovado. Executar todos os GOALs em sequência.
Auto approval total dentro do escopo de docs/.
Parar apenas se houver gate obrigatório ou erro não resolvido.

Escopo global do batch:
- docs/ (todas as subpastas)

Escopo proibido global:
- app/, components/, lib/, prisma/, auth.ts, qualquer código produtivo

Gates globais:
- git push: NÃO em nenhum GOAL
- db:push / migration: NÃO em nenhum GOAL
- produção: NÃO em nenhum GOAL

---

GOAL 1 — Atualizar CURRENT_STATUS.md
Tarefas: revisar estado de cada módulo e atualizar seção §1.
Arquivos: docs/ai/CURRENT_STATUS.md
Commit: autorizado — docs(status): atualizar estado módulos Q3

GOAL 2 — Criar OVERNIGHT_QUEUE.md vazio
Tarefas: criar arquivo com estrutura de fila pré-aprovada vazia.
Arquivos: docs/status/OVERNIGHT_QUEUE.md (criar)
Commit: autorizado — docs(status): criar fila overnight vazia

GOAL 3 — Atualizar ROADMAP_FISCAL.md
Tarefas: marcar GOALs 001B–008 como concluídos, sugerir próximo sprint.
Arquivos: docs/roadmaps/ROADMAP_FISCAL.md
Commit: autorizado — docs(roadmap): marcar fiscal GOALs 001B-008 concluídos

GOAL 4 — Criar EXECUTION_LOG.md inicial
Tarefas: criar log com entradas dos sprints já executados.
Arquivos: docs/status/EXECUTION_LOG.md (criar)
Commit: autorizado — docs(status): criar execution log inicial

---

Relatório final do batch:
Emitir relatório consolidado com resultado de cada GOAL:
status (✅/❌/⏭️), arquivos, validações, commit, riscos.

Confirmações finais do batch:
- [ ] Nenhum push realizado em nenhum GOAL
- [ ] Nenhuma migration em nenhum GOAL
- [ ] Nenhuma área protegida tocada em nenhum GOAL
```

---

## Notas de uso

### Quando usar GOAL vs SAFE-lite informal

| Situação | Recomendação |
|---|---|
| Task pequena, conversa ao vivo, humano disponível | SAFE-lite informal (preview inline no chat) |
| Task documentada, escopo claro, quer execução sem pausas | **GOAL com este template** |
| Batch de várias tasks, modo overnight | **GOAL overnight com lista de subtarefas** |
| Task grande (M+), área protegida, risco alto | Engine completo de 17 fases |

### Campos que nunca devem ficar ambíguos

- **Escopo permitido** e **Arquivos permitidos**: se não listar, o agente vai perguntar.
- **Política de commit**: "autorizado" vs "não autorizado" — sem meio-termo.
- **Política de push**: sempre declarar explicitamente (padrão: NÃO).
- **Tamanho**: S/M/L — determina se pode rodar em overnight.

### Gate #1 e este template

Em modo SAFE-lite e GOAL pré-formatado, este template **substitui** o Gate #1 formal (proposta SPRINT_<ticket>.md). O humano aprova ao enviar o GOAL preenchido.

O **Gate #2** (aprovação para merge/push) **nunca é substituído** — sempre requer confirmação humana separada.
