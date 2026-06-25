---
title: GOAL Library — Biblioteca oficial de GOALs reutilizáveis
status: vivo
owner: produto + arquitetura
last_update: 2026-06-25
versao: v1
bloco: execution-v2-bloco7
---

# 📚 GOAL Library — Biblioteca oficial de GOALs reutilizáveis

> **Catálogo de templates de GOALs prontos para uso no OmniGestão Pro.**
> Copie o template mais próximo do que precisa, ajuste os campos específicos e envie.
> Este documento **não substitui** o [`GOAL_TEMPLATE.md`](./GOAL_TEMPLATE.md) — ele aponta para ele.
> Para entender as regras de execução, consulte [`EXECUTION_RULES.md`](./EXECUTION_RULES.md).

---

## 1. Objetivo da biblioteca

A GOAL Library resolve um problema prático: toda vez que um novo GOAL precisa ser escrito,
o autor parte do zero ou copia de um GOAL anterior qualquer. Isso gera inconsistência de
escopo, deny-lists incompletas e políticas de commit esquecidas.

Esta biblioteca oferece **templates pré-validados por categoria e HUB**, com:

- Escopo e deny-list padrão já preenchidos para cada contexto.
- Ferramenta recomendada já definida.
- Validações e política de commit adequadas ao tipo.
- Relatório esperado padronizado.

**O que fazer:** copiar o template mais próximo → ajustar `Objetivo`, `Tarefas` e `Arquivos
permitidos` → enviar. Os demais campos já estão corretos para o padrão do projeto.

---

## 2. Como usar

```
1. Identificar a categoria do trabalho (docs / impl / audit / design / hub).
2. Localizar o template correspondente neste documento (§4–§8).
3. Copiar o bloco de texto do template.
4. Preencher os campos marcados com <PREENCHER>.
5. Remover campos [OPCIONAL] não aplicáveis.
6. Enviar ao agente.
```

> Se nenhum template se encaixar exatamente, usar o [`GOAL_TEMPLATE.md`](./GOAL_TEMPLATE.md)
> completo como base e preencher do zero.

---

## 3. Padrão de nomenclatura

Todo GOAL deve ter um nome no formato `GOAL_<CATEGORIA>_<SLUG>`:

| Prefixo | Categoria | Exemplos |
|---|---|---|
| `GOAL_DOCS_*` | Documentação | GOAL_DOCS_ADR, GOAL_DOCS_STATUS |
| `GOAL_IMPL_*` | Implementação segura | GOAL_IMPL_FEATURE, GOAL_IMPL_FIX |
| `GOAL_AUDIT_*` | Auditoria | GOAL_AUDIT_READONLY, GOAL_AUDIT_CODEX |
| `GOAL_DESIGN_*` | Design / UX | GOAL_DESIGN_PROTOTIPO, GOAL_DESIGN_HANDOFF |
| `GOAL_FIX_*` | Hotfix / correção urgente | GOAL_FIX_P0, GOAL_FIX_REGRESS |
| `GOAL_FISCAL_*` | Módulo Fiscal / NFC-e | GOAL_FISCAL_TAX, GOAL_FISCAL_PROVIDER |
| `GOAL_PDV_*` | PDV / Caixa / Vendas | GOAL_PDV_FIX, GOAL_PDV_FEATURE |
| `GOAL_OPERACOES_*` | Operações / OS | GOAL_OPERACOES_IMPL, GOAL_OPERACOES_V4 |
| `GOAL_ESTOQUE_*` | Estoque / Inventário | GOAL_ESTOQUE_INVENTARIO, GOAL_ESTOQUE_FIX |
| `GOAL_MARKETPLACE_*` | Marketplace | GOAL_MARKETPLACE_LISTING, GOAL_MARKETPLACE_SYNC |
| `GOAL_FINANCEIRO_*` | Financeiro / CR / CP | GOAL_FINANCEIRO_CR, GOAL_FINANCEIRO_DRE |
| `GOAL_WHATSAPP_*` | WhatsApp HUB | GOAL_WHATSAPP_WEBHOOK, GOAL_WHATSAPP_IA |

---

## 4. GOALs reutilizáveis — Documentação

---

### GOAL_DOCS_ADR — Criar ADR

**Quando usar:** nova decisão arquitetural que precisa ser registrada formalmente.
**Ferramenta:** Claude Code Sonnet (ou Claude Opus para decisões complexas).

```
GOAL — GOAL_DOCS_ADR — <PREENCHER: título da decisão>

Modelo: Sonnet 4.6
Tipo: docs
Tamanho: S
Modo: SAFE-lite

Objetivo:
Registrar a decisão arquitetural "<PREENCHER>" como ADR oficial no projeto.

Contexto:
<PREENCHER: por que esta decisão foi tomada, qual problema resolve, quais alternativas foram consideradas>

Fontes de verdade:
- docs/decisions/INDEX.md
- docs/decisions/TEMPLATE_ADR.md
- <PREENCHER: ADR anterior relacionado, se houver>

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- docs/decisions/ADR-<NNNN>-<slug>.md (criar)
- docs/decisions/INDEX.md (atualizar §3)

Escopo proibido: app/, components/, lib/, prisma/, qualquer código produtivo

Auto Approval: leitura, criação em docs/decisions/, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Arquivos permitidos:
- docs/decisions/ADR-<NNNN>-<slug>.md
- docs/decisions/INDEX.md

Tarefas:
1. Ler TEMPLATE_ADR.md e INDEX.md para obter próximo número sequencial.
2. Criar ADR com contexto, decisão, consequências e status.
3. Atualizar INDEX.md §3 com ponteiro para o novo ADR.

Validações:
- [ ] git diff --name-only confirma apenas docs/decisions/

Critérios de aceite:
- [ ] ADR criado seguindo o template oficial
- [ ] INDEX.md atualizado
- [ ] Nenhum arquivo fora de docs/decisions/ modificado
- [ ] Nenhum push realizado

Política de commit: autorizado — docs(decisions): ADR-<NNNN> <slug>
Política de push: NÃO autorizado.

Relatório final: arquivo criado, hash do commit, riscos, próximo passo.
```

---

### GOAL_DOCS_ROADMAP — Atualizar roadmap de HUB

**Quando usar:** após sprint concluída, novo blocker identificado, ou re-priorização de backlog.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_DOCS_ROADMAP — <PREENCHER: HUB>

Modelo: Sonnet 4.6
Tipo: docs
Tamanho: S
Modo: SAFE-lite

Objetivo:
Atualizar docs/roadmaps/ROADMAP_<HUB>.md refletindo o estado atual após <PREENCHER: evento>.

Contexto:
<PREENCHER: o que mudou — sprint concluída, blocker removido, nova prioridade>

Fontes de verdade:
- docs/roadmaps/ROADMAP_<HUB>.md
- docs/ai/CURRENT_STATUS.md

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- docs/roadmaps/ROADMAP_<HUB>.md

Escopo proibido: app/, components/, lib/, prisma/, qualquer código produtivo

Auto Approval: leitura, edição em docs/roadmaps/, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Arquivos permitidos:
- docs/roadmaps/ROADMAP_<HUB>.md

Tarefas:
1. Ler roadmap atual e identificar seções a atualizar (§5 gaps, §7 backlog, §11 sprints).
2. Marcar itens concluídos, remover blockers resolvidos, atualizar próxima sprint sugerida.
3. Não criar seções novas sem autorização — apenas atualizar existentes.

Validações:
- [ ] git diff --name-only confirma apenas docs/roadmaps/

Critérios de aceite:
- [ ] Roadmap reflete estado pós-<evento>
- [ ] Nenhum arquivo fora de docs/roadmaps/ modificado
- [ ] Nenhum push realizado

Política de commit: autorizado — docs(roadmap): atualizar ROADMAP_<HUB> pós-<evento>
Política de push: NÃO autorizado.

Relatório final: seções atualizadas, hash do commit, próximo passo.
```

---

### GOAL_DOCS_STATUS — Atualizar CURRENT_STATUS

**Quando usar:** após qualquer GOAL que mude o estado real de um módulo.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_DOCS_STATUS — <PREENCHER: módulo>

Modelo: Sonnet 4.6
Tipo: docs
Tamanho: S
Modo: SAFE-lite

Objetivo:
Atualizar docs/ai/CURRENT_STATUS.md refletindo o novo estado do módulo <PREENCHER> após <PREENCHER: GOAL concluído>.

Contexto:
<PREENCHER: o que mudou de estado — mock removido, feature ativada, dívida paga>

Fontes de verdade:
- docs/ai/CURRENT_STATUS.md
- docs/execution/EXECUTION_LOG.md (última entrada do módulo)

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- docs/ai/CURRENT_STATUS.md

Escopo proibido: app/, components/, lib/, prisma/, qualquer código produtivo

Auto Approval: leitura, edição em docs/ai/, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Arquivos permitidos:
- docs/ai/CURRENT_STATUS.md

Tarefas:
1. Ler estado atual do módulo no CURRENT_STATUS.md.
2. Atualizar §1 (maturidade), §5 (dívida) e §6 (entrada) conforme o GOAL concluído.
3. Confirmar que nenhuma seção não relacionada ao módulo foi alterada.

Validações:
- [ ] git diff --name-only confirma apenas docs/ai/CURRENT_STATUS.md

Critérios de aceite:
- [ ] Estado do módulo atualizado corretamente
- [ ] Nenhum outro módulo alterado inadvertidamente
- [ ] Nenhum push realizado

Política de commit: autorizado — docs(status): atualizar estado <módulo>
Política de push: NÃO autorizado.

Relatório final: campo atualizado, hash do commit, próximo passo.
```

---

### GOAL_DOCS_HANDOFF — Gerar handoff de sessão

**Quando usar:** ao encerrar sessão que produziu mudança ou decisão.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_DOCS_HANDOFF — <PREENCHER: sessão/data>

Modelo: Sonnet 4.6
Tipo: docs
Tamanho: S
Modo: SAFE-lite

Objetivo:
Gerar handoff oficial da sessão <PREENCHER> conforme SESSION_HANDOFF.md.

Contexto:
<PREENCHER: o que foi feito na sessão, o que ficou pendente>

Fontes de verdade:
- docs/execution/SESSION_HANDOFF.md
- docs/execution/EXECUTION_LOG.md

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- docs/execution/EXECUTION_LOG.md (nova entrada)
- [OPCIONAL] docs/governance/handoffs/<data>-<seq>.yaml

Escopo proibido: app/, components/, lib/, prisma/, qualquer código produtivo

Auto Approval: leitura, edição em docs/, git status/log read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Tarefas:
1. Executar git status e git log --oneline -5.
2. Identificar tipo de handoff (curto/completo/overnight/pós-auditoria/pós-design/pós-hotfix).
3. Gerar handoff no formato correto conforme SESSION_HANDOFF.md §5–§10.
4. Adicionar entrada no EXECUTION_LOG.md (append-only).

Validações:
- [ ] git diff --name-only confirma apenas docs/

Critérios de aceite:
- [ ] Handoff gerado no tipo correto
- [ ] EXECUTION_LOG.md atualizado
- [ ] Nenhum push realizado

Política de commit: não autorizado (handoff é gerado inline ou como arquivo separado)
Política de push: NÃO autorizado.

Relatório final: tipo de handoff, próximo passo definido.
```

---

## 5. GOALs reutilizáveis — Implementação segura

---

### GOAL_IMPL_FEATURE_DORMENTE — Feature nova dormente

**Quando usar:** adicionar código novo que não deve ter callers ativos até ativação explícita.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_IMPL_FEATURE_DORMENTE — <PREENCHER: nome da feature>

Modelo: Sonnet 4.6
Tipo: implementation
Tamanho: S
Modo: SAFE-lite

Objetivo:
Implementar <PREENCHER: feature> de forma dormente — código completo, zero callers produtivos,
sem alterar fluxo existente.

Contexto:
<PREENCHER: por que dormente, qual ADR governa, o que a feature faz>

Fontes de verdade:
- <PREENCHER: ADR relevante>
- docs/ai/CURRENT_STATUS.md

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/<hub>/<feature>/ (novos arquivos apenas)
- <PREENCHER: outros paths específicos>

Escopo proibido:
- app/, components/, prisma/schema.prisma, auth.ts, auth.config.ts, proxy.ts
- qualquer caller existente (não wiring automático)

Auto Approval: leitura, criação em lib/<hub>/<feature>/, npx tsc --noEmit, npm run test, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Arquivos permitidos:
- lib/<hub>/<feature>/types.ts
- lib/<hub>/<feature>/service.ts
- lib/<hub>/<feature>/index.ts
- lib/<hub>/<feature>/<feature>.test.ts

Tarefas:
1. Criar tipos e contratos em types.ts.
2. Implementar lógica pura em service.ts (sem I/O direto — injetar dependências).
3. Criar testes cobrindo os casos principais.
4. Confirmar 0 callers fora de lib/<hub>/<feature>/ com grep.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test — novos testes passando
- [ ] grep confirma 0 callers fora do escopo
- [ ] git diff --name-only mostra apenas lib/<hub>/<feature>/

Critérios de aceite:
- [ ] Feature implementada e testada
- [ ] 0 callers produtivos (dormente confirmado)
- [ ] tsc limpo
- [ ] Testes passando
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(<hub>): <feature> dormente
Política de push: NÃO autorizado.

Relatório final: arquivos criados, tsc ✅, testes N passed, grep resultado, commit hash, próximo passo.
```

---

### GOAL_IMPL_FIX — Bugfix cirúrgico

**Quando usar:** corrigir bug identificado em área específica sem refatorar ao redor.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_IMPL_FIX — <PREENCHER: descrição do bug>

Modelo: Sonnet 4.6
Tipo: implementation
Tamanho: S
Modo: SAFE-lite

Objetivo:
Corrigir <PREENCHER: bug> em <PREENCHER: arquivo:linha> sem alterar comportamento adjacente.

Contexto:
<PREENCHER: causa raiz identificada, sintoma, impacto>

Fontes de verdade:
- <PREENCHER: arquivo com o bug>
- <PREENCHER: teste que prova o bug, se houver>

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- <PREENCHER: arquivo(s) mínimos para corrigir o bug>

Escopo proibido:
- app/, components/ fora do escopo, lib/ fora do escopo
- prisma/schema.prisma, auth.ts, auth.config.ts, proxy.ts
- refatorações ao redor do fix — apenas o mínimo necessário

Auto Approval: leitura, edição no escopo mínimo, npx tsc --noEmit, npm run test, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Tarefas:
1. Ler o arquivo com o bug e confirmar a causa raiz.
2. Aplicar fix mínimo — não refatorar ao redor.
3. Adicionar ou ajustar teste que cobre o caso corrigido.
4. Rodar tsc + testes.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test — caso corrigido passando
- [ ] git diff --name-only mostra apenas o escopo mínimo

Critérios de aceite:
- [ ] Bug corrigido conforme causa raiz identificada
- [ ] Teste cobre o caso
- [ ] Nenhum comportamento adjacente alterado
- [ ] Nenhum push realizado

Política de commit: autorizado — fix(<escopo>): <descrição do bug>
Política de push: NÃO autorizado.

Relatório final: causa raiz, fix aplicado, teste, tsc ✅, commit hash, riscos residuais.
```

---

### GOAL_IMPL_TEST — Testes unitários para área existente

**Quando usar:** adicionar cobertura de testes em código que não tem testes ou tem cobertura insuficiente.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_IMPL_TEST — <PREENCHER: módulo/arquivo>

Modelo: Sonnet 4.6
Tipo: implementation
Tamanho: S
Modo: SAFE-lite

Objetivo:
Adicionar testes unitários para <PREENCHER: arquivo/função> cobrindo os casos <PREENCHER: casos>.

Contexto:
<PREENCHER: por que este código não tem testes, qual risco isso representa>

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- <PREENCHER: caminho do arquivo de teste>.test.ts (criar ou editar)
- [OPCIONAL] <PREENCHER: arquivo testado> — somente se precisar de pequeno ajuste de testabilidade

Escopo proibido:
- app/, prisma/, auth.ts — nunca alterar código produtivo além do mínimo de testabilidade
- Não criar mocks que escondam comportamento real

Auto Approval: leitura, criação/edição do arquivo de teste, npm run test, npx tsc --noEmit, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Tarefas:
1. Ler o arquivo a ser testado e mapear os casos principais.
2. Criar arquivo .test.ts com casos: happy path, edge cases, casos de erro.
3. Confirmar que os testes não usam mocks enganosos (prisma in-memory se necessário).
4. Rodar tsc + npm run test.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test — novos testes passando, nenhum teste anterior quebrado
- [ ] git diff --name-only mostra apenas arquivo de teste (+ ajuste mínimo se necessário)

Critérios de aceite:
- [ ] Casos principais cobertos (happy path + edge cases + erros)
- [ ] Nenhum mock enganoso
- [ ] Nenhum arquivo produtivo alterado além do mínimo
- [ ] Nenhum push realizado

Política de commit: autorizado — test(<escopo>): adicionar cobertura <módulo>
Política de push: NÃO autorizado.

Relatório final: casos cobertos, N testes novos, tsc ✅, commit hash.
```

---

## 6. GOALs reutilizáveis — Auditoria

---

### GOAL_AUDIT_READONLY — Auditoria read-only de módulo

**Quando usar:** antes de iniciar implementação em área desconhecida; verificar estado real de um módulo.
**Ferramenta:** Claude Code Sonnet (ou Codex).

```
GOAL — GOAL_AUDIT_READONLY — <PREENCHER: módulo>

Modelo: Sonnet 4.6
Tipo: audit
Tamanho: S
Modo: SAFE-lite (read-only)

Objetivo:
Auditar o estado atual de <PREENCHER: módulo> — identificar mocks, dívida técnica,
code morto, inconsistências com a documentação e riscos P0–P3.

Contexto:
<PREENCHER: por que auditar agora, o que se suspeita encontrar>

Fontes de verdade:
- docs/ai/CURRENT_STATUS.md
- docs/roadmaps/ROADMAP_<HUB>.md
- <PREENCHER: paths principais do módulo>

Autorização: O GOAL é a autorização operacional.

Escopo: read-only — nenhum arquivo será alterado.

Tarefas:
1. Ler os arquivos principais do módulo.
2. Cruzar com CURRENT_STATUS.md — o que está marcado como real vs o que existe no código.
3. Identificar: mocks enganosos, callers mortos, código sem teste, inconsistências de tipo.
4. Categorizar findings em P0 (crítico) / P1 (alto) / P2 (médio) / P3 (sugestão).
5. Gerar relatório de auditoria.

Validações: nenhuma (read-only)

Critérios de aceite:
- [ ] Relatório gerado com findings P0–P3
- [ ] Nenhum arquivo alterado
- [ ] Nenhum push realizado

Política de commit: não autorizado (auditoria é read-only)
Política de push: NÃO autorizado.

Relatório final: findings por categoria, recomendações de GOALs de correção, riscos.
```

---

### GOAL_AUDIT_REGRESSAO — Auditoria de regressão pós-GOAL

**Quando usar:** após GOAL de implementação, verificar se algo quebrou fora do escopo.
**Ferramenta:** Claude Code Sonnet.

```
GOAL — GOAL_AUDIT_REGRESSAO — pós-<PREENCHER: GOAL>

Modelo: Sonnet 4.6
Tipo: audit
Tamanho: S
Modo: SAFE-lite

Objetivo:
Verificar se o <PREENCHER: GOAL> causou regressão em áreas adjacentes ao escopo implementado.

Contexto:
<PREENCHER: o que foi alterado no GOAL anterior, quais áreas podem ter sido afetadas>

Autorização: O GOAL é a autorização operacional.

Escopo: read-only — nenhum arquivo será alterado nesta auditoria.

Tarefas:
1. Ler git diff do GOAL anterior (últimas alterações).
2. Identificar dependências diretas dos arquivos alterados.
3. Verificar se os callers dessas dependências ainda compilam e têm comportamento esperado.
4. Rodar tsc + testes para confirmar.
5. Relatar qualquer finding.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test — nenhum teste anterior quebrado

Critérios de aceite:
- [ ] Nenhuma regressão encontrada (ou findings listados)
- [ ] Nenhum arquivo alterado
- [ ] Nenhum push realizado

Política de commit: não autorizado
Política de push: NÃO autorizado.

Relatório final: status (limpo / regressão encontrada), findings, próximo passo se houver regressão.
```

---

## 7. GOALs reutilizáveis — Design

---

### GOAL_DESIGN_PROTOTIPO — Protótipo isolado (Antigravity)

**Quando usar:** criar tela nova ou redesign antes de envolver o Claude Code Sonnet.
**Ferramenta:** Antigravity / Cloud Design.

```
GOAL — GOAL_DESIGN_PROTOTIPO — <PREENCHER: nome da tela>

Modelo: Antigravity / Cloud Design
Tipo: design
Tamanho: S
Modo: SAFE-lite

Objetivo:
Criar protótipo isolado (HTML standalone) da tela <PREENCHER> seguindo o design system
do OmniGestão Pro — sem alterar código produtivo.

Contexto:
<PREENCHER: objetivo da tela, fluxo principal, referências visuais>

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- design/<hub>/<nome-da-tela>.html (HTML standalone)
- design/<hub>/assets/ (se necessário)

Escopo proibido:
- app/, components/, lib/, prisma/ — absolutamente nenhum código produtivo
- Regras de negócio — apenas visual

Regras de design obrigatórias:
- Tokens semânticos: bg-background, text-foreground, border-border, text-primary (sem hardcoded colors)
- Responsivo: mobile-first
- min-w-0 em todo flex/grid item
- Não criar lógica de negócio — apenas visual e interação UI

Tarefas:
1. Criar HTML standalone com estrutura completa da tela.
2. Documentar: componentes usados, tokens aplicados, estados (hover, focus, empty, error).
3. Entregar arquivo para revisão humana antes de qualquer implementação.

Validações: revisão humana (não há tsc/build para design)

Critérios de aceite:
- [ ] Protótipo abre no browser sem erro
- [ ] Usa tokens semânticos (sem hardcoded colors)
- [ ] Aprovado visualmente pelo humano
- [ ] Nenhum código produtivo alterado

Política de commit: não autorizado — humano decide após aprovação visual
Política de push: NÃO autorizado.

Relatório final: arquivo criado, estados cobertos, pendências de aprovação humana.
```

---

### GOAL_DESIGN_HANDOFF — Handoff design → implementação

**Quando usar:** após aprovação do protótipo, preparar o briefing para o Claude Code Sonnet implementar.
**Ferramenta:** Claude Code Sonnet (gera o GOAL de implementação).

```
GOAL — GOAL_DESIGN_HANDOFF — <PREENCHER: nome da tela>

Modelo: Sonnet 4.6
Tipo: design
Tamanho: S
Modo: SAFE-lite

Objetivo:
Gerar GOAL de implementação para a tela <PREENCHER> com base no protótipo aprovado
em <PREENCHER: caminho do protótipo>.

Contexto:
Protótipo aprovado em <PREENCHER: data>. Implementação pendente.
Regra: não alterar backend ao implementar o visual.

Autorização: O GOAL é a autorização operacional.

Escopo: read-only — apenas gerar o GOAL de implementação como texto.

Tarefas:
1. Ler o protótipo aprovado.
2. Identificar: componentes a criar, paths de destino, tokens usados, estados a implementar.
3. Gerar GOAL_IMPL_* completo com allow-list específica para a implementação.
4. Destacar: o que o Sonnet pode e não pode fazer ao implementar (sem lógica nova, sem backend).

Validações: nenhuma (apenas geração de documento)

Critérios de aceite:
- [ ] GOAL de implementação gerado e completo
- [ ] Allow-list específica definida
- [ ] Regras de não-toque em backend explicitadas
- [ ] Nenhum arquivo alterado neste GOAL

Política de commit: não autorizado
Política de push: NÃO autorizado.

Relatório final: GOAL gerado (texto completo), próximo passo: enviar GOAL ao Sonnet.
```

---

## 8. GOALs por HUB

---

### GOAL_FISCAL_FEATURE — Feature fiscal dormente

**Quando usar:** qualquer nova capacidade fiscal — sempre dormente até ativação explícita.
**Ferramenta:** Claude Code Sonnet.
**Escopo padrão:** `lib/fiscal/<nova-subpasta>/`
**Deny-list padrão:** `app/`, `components/`, `prisma/schema.prisma`, `lib/fiscal/pipeline/` (não alterar sem GOAL específico)
**Validação padrão:** `tsc` + `npm run test` + `grep` para confirmar 0 callers
**Política de commit:** autorizado — `feat(fiscal): <feature> dormente`

```
GOAL — GOAL_FISCAL_<SLUG> — <PREENCHER: nome>

Modelo: Sonnet 4.6
Tipo: fiscal
Tamanho: S
Modo: SAFE-lite

Objetivo:
Implementar <PREENCHER> na camada fiscal — dormente, sem callers produtivos,
sem alterar fluxo NFC-e existente.

Contexto:
<PREENCHER: ADR que governa, estado atual do pipeline fiscal, o que esta feature habilita>
Arquitetura fiscal dormente: lib/fiscal/pipeline/ já fecha o fluxo completo (Blocos 1–8).
Esta feature é aditiva — não altera callers existentes.

Fontes de verdade:
- docs/decisions/ADR-0008-fiscal-architecture.md
- lib/fiscal/pipeline/ (referência de interface)
- docs/ai/CURRENT_STATUS.md §fiscal

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/fiscal/<PREENCHER>/ (novos arquivos)

Escopo proibido:
- app/, components/, prisma/schema.prisma
- lib/fiscal/pipeline/ (sem alterar callers existentes)
- auth.ts, auth.config.ts, proxy.ts

Auto Approval: leitura, criação em lib/fiscal/<subpasta>/, tsc, testes, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Tarefas:
1. <PREENCHER>
2. Confirmar 0 callers fora do novo diretório (grep).
3. tsc + npm run test.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test
- [ ] grep confirma 0 callers produtivos

Critérios de aceite:
- [ ] Feature implementada e testada
- [ ] 0 callers produtivos (dormente)
- [ ] Nenhum arquivo fiscal existente alterado inadvertidamente
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(fiscal): <slug> dormente
Política de push: NÃO autorizado.

Relatório final: arquivos criados, tsc ✅, testes N passed, grep resultado, commit hash.
```

---

### GOAL_PDV_FIX — Bugfix em PDV / Caixa / Vendas

**Quando usar:** correção de bug em qualquer um dos 4 PDVs (Clássico, Supermercado, Next, Venda Completa) ou no Caixa.
**Ferramenta:** Claude Code Sonnet.
**Escopo padrão:** arquivo mínimo com o bug — nunca alterar o motor compartilhado sem autorização explícita.
**Deny-list padrão:** `lib/financeiro/`, `prisma/schema.prisma`, outros PDVs fora do escopo.
**Validação padrão:** `tsc` + `npm run test`
**Política de commit:** autorizado — `fix(pdv): <descrição>`

```
GOAL — GOAL_PDV_FIX — <PREENCHER: bug>

Modelo: Sonnet 4.6
Tipo: pdv
Tamanho: S
Modo: SAFE-lite

Objetivo:
Corrigir <PREENCHER: bug> no <PREENCHER: PDV Clássico | Supermercado | Next | Venda Completa | Caixa>.

Contexto:
<PREENCHER: sintoma, causa raiz identificada, arquivo:linha>
Motor compartilhado: lib/pdv/, lib/caixa/ — alterar somente com autorização explícita.

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- <PREENCHER: arquivo mínimo>

Escopo proibido:
- lib/financeiro/, lib/operacoes/ (sem autorização)
- prisma/schema.prisma, auth.ts
- outros PDVs fora do escopo deste fix

Auto Approval: leitura, edição no escopo mínimo, tsc, testes, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO, produção NÃO

Tarefas:
1. Confirmar causa raiz lendo o arquivo.
2. Aplicar fix mínimo.
3. Adicionar teste cobrindo o caso.
4. Verificar que os outros PDVs não foram afetados.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test
- [ ] git diff --name-only mostra apenas escopo mínimo

Critérios de aceite:
- [ ] Bug corrigido
- [ ] Nenhum outro PDV afetado
- [ ] Nenhum push realizado

Política de commit: autorizado — fix(pdv): <descrição>
Política de push: NÃO autorizado.

Relatório final: causa raiz, fix, tsc ✅, commit hash, verificação de outros PDVs.
```

---

### GOAL_OPERACOES_IMPL — Implementação em Operações / OS

**Quando usar:** nova funcionalidade na camada de Operações de Serviço.
**Ferramenta:** Claude Code Sonnet.
**Escopo padrão:** `lib/operacoes/`, `app/actions/operacoes.ts` (somente ações autorizadas).
**Deny-list padrão:** `lib/financeiro/`, `prisma/schema.prisma` sem autorização, `auth.ts`.
**Validação padrão:** `tsc` + `npm run build` + `npm run test`
**Política de commit:** autorizado — `feat(operacoes): <descrição>`

```
GOAL — GOAL_OPERACOES_<SLUG> — <PREENCHER: nome>

Modelo: Sonnet 4.6
Tipo: operacoes
Tamanho: S
Modo: SAFE-lite

Objetivo:
Implementar <PREENCHER> na camada de Operações — <PREENCHER: aditivo/cirúrgico>.

Contexto:
<PREENCHER: estado atual do HUB Operações, o que esta feature resolve, dependências>

Fontes de verdade:
- lib/operacoes/services/ (referência de padrão de serviço)
- app/actions/operacoes.ts (Server Actions existentes)
- docs/ai/CURRENT_STATUS.md §operacoes

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/operacoes/<PREENCHER>/
- app/actions/operacoes.ts (somente a ação específica autorizada)
- <PREENCHER: outros paths>

Escopo proibido:
- lib/financeiro/ (sem autorização explícita)
- prisma/schema.prisma (sem autorização explícita)
- auth.ts, auth.config.ts, proxy.ts
- components/operacoes/lovable/ (Lovable isolado — não alterar diretamente)

Auto Approval: leitura, edição no escopo, tsc, build, testes, git read-only
Gates: git push NÃO, db:push NÃO, schema NÃO sem auth, produção NÃO

Tarefas:
1. <PREENCHER>
2. tsc + build + testes.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run build
- [ ] npm run test

Critérios de aceite:
- [ ] Feature implementada conforme objetivo
- [ ] tsc + build + testes limpos
- [ ] Nenhum arquivo financeiro/auth alterado
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(operacoes): <slug>
Política de push: NÃO autorizado.

Relatório final: arquivos, tsc ✅, build ✅, testes N passed, commit hash.
```

---

### GOAL_ESTOQUE_INVENTARIO — Feature de inventário

**Quando usar:** qualquer evolução do módulo de inventário (assistido, contínuo, saneamento).
**Ferramenta:** Claude Code Sonnet.
**Escopo padrão:** `lib/estoque/`, `app/actions/inventario.ts`.
**Deny-list padrão:** `prisma/schema.prisma` (inventário é aditivo via `metadata`), motor de estoque principal.
**Validação padrão:** `tsc` + `npm run test`
**Política de commit:** autorizado — `feat(estoque): <descrição>`

```
GOAL — GOAL_ESTOQUE_<SLUG> — <PREENCHER: nome>

Modelo: Sonnet 4.6
Tipo: estoque
Tamanho: S
Modo: SAFE-lite

Objetivo:
<PREENCHER> no módulo de estoque — aditivo, sem alterar motor principal.

Contexto:
<PREENCHER: estado atual, o que esta feature adiciona, dependências>
Princípio: inventário é sempre aditivo e read-first — nunca zera/cadastra/reconcilia automático.

Fontes de verdade:
- lib/estoque/ (estrutura atual)
- app/actions/inventario.ts (ações existentes)

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/estoque/<PREENCHER>/
- app/actions/inventario.ts (somente ação específica)

Escopo proibido:
- prisma/schema.prisma, auth.ts
- motor principal de estoque (registrarAjusteEstoque — apenas reuso, sem alterar)

Tarefas:
1. <PREENCHER>
2. tsc + testes.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test

Critérios de aceite:
- [ ] Feature aditiva confirmada (motor não alterado)
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(estoque): <slug>
Política de push: NÃO autorizado.

Relatório final: arquivos, tsc ✅, testes N passed, commit hash.
```

---

### GOAL_FINANCEIRO_CR — Feature em Contas a Receber

**Quando usar:** nova funcionalidade ou bugfix em contas a receber (lib/financeiro/).
**Ferramenta:** Claude Code Sonnet.
**Atenção:** Financeiro toca dinheiro — qualquer mudança em lógica de cálculo exige revisão humana antes de merge.
**Escopo padrão:** `lib/financeiro/services/`, `app/api/financeiro/`.
**Deny-list padrão:** `lib/pdv/`, `prisma/schema.prisma` sem autorização explícita.
**Validação padrão:** `tsc` + `npm run build` + `npm run test`
**Política de commit:** autorizado — confirmar com humano antes se tocar cálculo de valor

```
GOAL — GOAL_FINANCEIRO_CR_<SLUG> — <PREENCHER: nome>

Modelo: Sonnet 4.6
Tipo: implementation
Tamanho: S
Modo: SAFE-lite

Objetivo:
<PREENCHER> em Contas a Receber — sem alterar contratos existentes de localKey/auditoria.

Contexto:
<PREENCHER: estado atual, o que esta feature resolve>
Princípio: CR usa localKey para idempotência; auditoria via payload.historico[] (nunca deletar).

Fontes de verdade:
- lib/financeiro/services/contas-receber.ts
- lib/financeiro/contracts/
- docs/modules/FINANCEIRO.md

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/financeiro/services/<PREENCHER>
- app/api/financeiro/<PREENCHER>

Escopo proibido:
- lib/financeiro/contracts/ (sem ADR)
- prisma/schema.prisma, auth.ts
- lib/pdv/ (sem autorização)

⚠️ ATENÇÃO: qualquer mudança em cálculo de valor (saldo, liquidação, parcial) exige
revisão humana antes de commit — parar e confirmar antes de commitar.

Tarefas:
1. <PREENCHER>
2. tsc + build + testes (incluindo caso de idempotência).

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run build
- [ ] npm run test
- [ ] Caso de idempotência coberto por teste

Critérios de aceite:
- [ ] localKey respeitado
- [ ] auditoria payload.historico[] intacta
- [ ] Nenhum push realizado

Política de commit: autorizado somente se não tocar cálculo de valor — caso contrário, confirmar com humano
Política de push: NÃO autorizado.

Relatório final: arquivos, tsc ✅, build ✅, testes N passed, commit hash ou "aguardando revisão humana".
```

---

### GOAL_WHATSAPP_WEBHOOK — Feature WhatsApp Cloud API

**Quando usar:** nova capacidade no webhook de inbound ou outbound do WhatsApp.
**Ferramenta:** Claude Code Sonnet.
**Atenção:** multi-loja — sempre escopar por `storeId` via `phoneNumberId` (ADR-0006).
**Escopo padrão:** `lib/whatsapp/`, `app/api/webhooks/whatsapp/`.
**Deny-list padrão:** `WHATSAPP_ACCESS_TOKEN` nunca no DB — apenas `tokenEnvKey` (ref opaca).

```
GOAL — GOAL_WHATSAPP_<SLUG> — <PREENCHER: nome>

Modelo: Sonnet 4.6
Tipo: implementation
Tamanho: S
Modo: SAFE-lite

Objetivo:
<PREENCHER> no WhatsApp HUB — multi-loja, roteamento por phoneNumberId (ADR-0006).

Contexto:
<PREENCHER: o que esta feature resolve, fluxo inbound/outbound afetado>
Princípio ADR-0006: roteamento inbound via phoneNumberId → storeId (tabela whatsapp_phone_numbers).
Token NUNCA no DB — só tokenEnvKey (nome da env). Inbound não-mapeado é descartado + auditado.

Fontes de verdade:
- lib/whatsapp/
- docs/decisions/ADR-0006-whatsapp-multi-loja.md

Autorização: O GOAL é a autorização operacional.

Escopo permitido:
- lib/whatsapp/<PREENCHER>/
- app/api/webhooks/whatsapp/ (somente parte específica)

Escopo proibido:
- prisma/schema.prisma, auth.ts
- Nunca gravar token real no DB
- Nunca usar variável WHATSAPP_PHONE_NUMBER_ID global (legado removido)

Tarefas:
1. <PREENCHER>
2. tsc + testes.

Validações:
- [ ] npx tsc --noEmit
- [ ] npm run test
- [ ] grep confirma que nenhum token foi gravado no DB

Critérios de aceite:
- [ ] Roteamento por phoneNumberId respeitado
- [ ] Token nunca no DB
- [ ] Nenhum push realizado

Política de commit: autorizado — feat(whatsapp): <slug>
Política de push: NÃO autorizado.

Relatório final: arquivos, tsc ✅, testes N passed, confirmação ADR-0006 respeitado, commit hash.
```

---

## 9. Índice rápido dos templates

| # | Template | Categoria | Quando usar |
|---|---|---|---|
| 1 | GOAL_DOCS_ADR | docs | Nova decisão arquitetural |
| 2 | GOAL_DOCS_ROADMAP | docs | Atualizar backlog/sprint de HUB |
| 3 | GOAL_DOCS_STATUS | docs | Atualizar CURRENT_STATUS após GOAL |
| 4 | GOAL_DOCS_HANDOFF | docs | Encerrar sessão com trabalho em andamento |
| 5 | GOAL_IMPL_FEATURE_DORMENTE | implementation | Código novo sem callers ativos |
| 6 | GOAL_IMPL_FIX | implementation | Bugfix cirúrgico |
| 7 | GOAL_IMPL_TEST | implementation | Adicionar cobertura de testes |
| 8 | GOAL_AUDIT_READONLY | audit | Mapeamento de estado real de módulo |
| 9 | GOAL_AUDIT_REGRESSAO | audit | Verificar impacto de GOAL anterior |
| 10 | GOAL_DESIGN_PROTOTIPO | design | Tela nova ou redesign (Antigravity) |
| 11 | GOAL_DESIGN_HANDOFF | design | Briefing para implementar protótipo aprovado |
| 12 | GOAL_FISCAL_FEATURE | fiscal | Qualquer feature fiscal — sempre dormente |
| 13 | GOAL_PDV_FIX | pdv | Bugfix em PDV / Caixa |
| 14 | GOAL_OPERACOES_IMPL | operacoes | Feature nova em Operações / OS |
| 15 | GOAL_ESTOQUE_INVENTARIO | estoque | Feature de inventário (aditiva) |
| 16 | GOAL_FINANCEIRO_CR | financeiro | Feature em Contas a Receber |
| 17 | GOAL_WHATSAPP_WEBHOOK | whatsapp | Feature WhatsApp Cloud API multi-loja |

**Total: 17 templates prontos.**

---

## 10. Versionamento

- Esta é a **v1** (criado 2026-06-25, Bloco execution-v2-bloco7).
- Novo template → adicionar na seção correta + atualizar §9 (índice rápido).
- Template obsoleto → marcar como `[DEPRECATED]` no título + indicar substituto.
