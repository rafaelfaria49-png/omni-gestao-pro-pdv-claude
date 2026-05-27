---
title: Prompts Oficiais — OmniGestão Pro
status: bloco-7
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
depende_de:
  - docs/governance/GOVERNANCA.md
  - docs/governance/WORKFLOW_MULTI_IA.md
  - docs/governance/SESSION_HANDOFF.md
  - docs/governance/SPRINT_PROTOCOL.md
  - docs/governance/AUDIT_PROTOCOL.md
  - docs/decisions/TEMPLATE_ADR.md
---

# 🎯 Prompts Oficiais — OmniGestão Pro

> Coleção pronta de prompts colável em qualquer IA (Claude, ChatGPT, Gemini/Antigravity, Composer).
> Cada prompt **carrega os arquivos certos**, **define o escopo**, e **declara o output esperado**.
> Princípio: a IA não tem que adivinhar o protocolo — o prompt já traz.

---

## Índice

1. [Kickoff universal de sessão](#1-kickoff-universal-de-sessão)
2. [Planning de sprint (Opus/Sonnet)](#2-planning-de-sprint)
3. [Execução de item de sprint (Sonnet)](#3-execução-de-item-de-sprint)
4. [Encerramento de sprint (Sonnet)](#4-encerramento-de-sprint)
5. [Auditoria de HUB (Opus + Sonnet)](#5-auditoria-de-hub)
6. [Criação de ADR (Opus)](#6-criação-de-adr)
7. [Handoff entre IAs / sessões](#7-handoff-entre-ias--sessões)
8. [Refator pequeno (Composer)](#8-refator-pequeno-composer)
9. [Debug de incidente (Sonnet)](#9-debug-de-incidente)
10. [Decisão estratégica (Opus / ChatGPT)](#10-decisão-estratégica)
11. [Protótipo visual de tela / HUB (Antigravity + Gemini)](#11-protótipo-visual-de-tela--hub)
12. [Plugar UI Lovable em dados reais (Sonnet)](#12-plugar-ui-lovable-em-dados-reais)
13. [Post-mortem de incidente](#13-post-mortem-de-incidente)

---

## 1. Kickoff universal de sessão

**Quando usar:** primeira mensagem em qualquer chat de qualquer IA, antes de pedir tarefa.

```text
Estou abrindo uma sessão no projeto OmniGestão Pro.

Antes de qualquer coisa, siga este checklist (ordem):

1. Ler CLAUDE.md (raiz do repo).
2. Ler docs/skills/INDEX.md.
3. Ler docs/governance/GOVERNANCA.md (regras inegociáveis, < 2 min).
4. Ler docs/ai/CURRENT_STATUS.md (estado vivo do projeto).
5. Verificar git status e git log -5.
6. Verificar docs/status/BLOCKERS.md se existir (locks ativos).
7. Confirmar comigo o objetivo desta sessão antes de tocar arquivo.

Se for trabalho em HUB específico, também ler:
- docs/roadmaps/ROADMAP_<HUB>.md (quando existir)
- docs/status/BACKLOG_<HUB>.md (quando existir)

Princípio: a sessão é descartável; o repositório é o cérebro.
Nada importante mora no chat — se importa, vira arquivo.

Confirme que leu e me diga: qual é o foco desta sessão?
```

---

## 2. Planning de sprint

**Quando usar:** abrir nova sprint. IA primária: **Opus** (revisa plano) ou **Sonnet** (escreve plano).

```text
Vamos planejar a SPRINT_<NN>_<HUB>.

Antes de codar/escrever:

1. Ler docs/governance/SPRINT_PROTOCOL.md (fases 0 e 1).
2. Ler docs/roadmaps/ROADMAP_<HUB>.md.
3. Ler docs/status/BACKLOG_<HUB>.md.
4. Ler docs/ai/CURRENT_STATUS.md (estado atual).

Saída esperada:

Criar docs/sprints/SPRINT_<NN>_<HUB>.md usando docs/sprints/TEMPLATE_SPRINT.md, com:
- Tema curto (1 frase).
- Período (start_date, end_date_alvo) — máximo 10 dias úteis.
- 1 a 5 itens, cada um com:
  - id (S<NN>.<seq>)
  - descrição
  - critério de pronto verificável
  - IA recomendada (ver WORKFLOW_MULTI_IA §2)
  - esforço estimado
  - risco (baixo/médio/alto)
  - depende de (outros itens)
- Arquivos críticos esperados (path-level).
- Áreas a NÃO tocar.
- Áreas protegidas envolvidas (com autorização registrada).
- Owner humano.

Regras:
- 1 HUB só (cross-cutting pequeno justificado).
- Escopo fechado.
- Se algum item é risco alto, pedir Opus revisar antes do start.

Comece confirmando que leu os documentos e me devolva o draft da sprint.
```

---

## 3. Execução de item de sprint

**Quando usar:** trabalhar 1 item de sprint já planejada. IA primária: **Sonnet** (ou Composer se microajuste).

```text
Vou executar o item S<NN>.<SEQ> da SPRINT_<NN>_<HUB>.

Antes:

1. Ler docs/governance/GOVERNANCA.md (regras).
2. Ler docs/governance/SESSION_HANDOFF.md (checklist abertura §2).
3. Ler docs/sprints/SPRINT_<NN>_<HUB>.md (achar o item S<NN>.<SEQ>).
4. Ler os arquivos críticos listados no item.

Critério de pronto: <copiar do item>

Regras inegociáveis:
- Escopo fechado: só este item.
- Mudanças cirúrgicas.
- Áreas protegidas: <listar / "nenhuma"> — autorização <link/menção>.
- Idempotência (localKey/commandId) onde aplicável.
- storeId em toda query/mutação multi-loja.
- Tokens semânticos no front (bg-background, text-foreground…).
- Sem mock enganoso — fallback honesto se faltar dado.

Encerramento:
- npx tsc --noEmit → 0 erros.
- npm run build se mexer em rotas/Server Actions/Prisma/config.
- Atualizar docs/ai/CURRENT_STATUS.md (bloco novo no topo, formato SESSION_HANDOFF §4).
- Atualizar docs/status/BACKLOG_<HUB>.md (marcar item concluído).
- Commit limpo: feat(<hub>): <…> OU fix(<hub>): <…>.
- HANDOFF no formato SESSION_HANDOFF §5.

Comece confirmando leitura e proponha o plano de edição antes de aplicar.
```

---

## 4. Encerramento de sprint

**Quando usar:** todos (ou quase todos) os itens da sprint terminaram. IA primária: **Sonnet**.

```text
Vou encerrar a SPRINT_<NN>_<HUB>.

Antes:

1. Ler docs/governance/SPRINT_PROTOCOL.md (fase 3).
2. Ler docs/sprints/SPRINT_<NN>_<HUB>.md.
3. Ler docs/status/BACKLOG_<HUB>.md.

Tarefas:

1. Para cada item da sprint: marcar status (✅ concluído / 🟡 parcial / ⏭️ movido para próxima).
2. Validar critérios de pronto restantes (tsc, build, fluxo manual).
3. Preencher no SPRINT_NN as seções "Entregas", "Riscos restantes", "Lições".
4. Marcar status: concluida no front matter.
5. Mover itens não concluídos para BACKLOG_<HUB>.md (nota "carryover sprint NN").
6. Atualizar BACKLOG_<HUB>.md (riscar concluídos, reavaliar P0/P1).
7. Atualizar docs/ai/CURRENT_STATUS.md (bloco novo: "Sprint NN concluída").
8. Atualizar docs/sprints/INDEX.md (linha nova).
9. Criar ADR(s) se decisão arquitetural surgiu (ver docs/decisions/TEMPLATE_ADR.md).
10. Criar post-mortem se houve incidente (ver §13 deste arquivo).
11. Escrever HANDOFF para próxima sprint (formato SESSION_HANDOFF §5).
12. Commit: chore(sprints): encerrar sprint NN — <HUB>.
13. Escrever retrospectiva (4 linhas) no SPRINT_NN.

Imutabilidade: após status: concluida, SPRINT_NN.md NÃO é mais editado.

Comece e me devolva o resumo antes de commitar.
```

---

## 5. Auditoria de HUB

**Quando usar:** rodar auditoria profunda. IA primária: **Opus** (análise) + **Sonnet** (verifica código real).

```text
Vou rodar uma auditoria do HUB <HUB>, tipo <saude_geral | ux | seguranca | performance | dados | fiscal | ia | forense>.

Antes:

1. Ler docs/governance/AUDIT_PROTOCOL.md (todas as fases).
2. Ler docs/roadmaps/ROADMAP_<HUB>.md (quando existir).
3. Ler docs/ai/CURRENT_STATUS.md.
4. Ler docs/status/MOCKS_TRACKING.md, DIVIDA_TECNICA.md, RISCOS.md (quando existirem).

Escopo:
- INCLUI: <listar arquivos/rotas/telas/tabelas>
- EXCLUI: <listar o que NÃO está na mira>

Timebox: <0.5d | 1d | 2d>

REGRAS:
- Auditoria é READ-ONLY. Não editar código.
- Toda finding tem evidência (path:linha, query, log, screenshot).
- Toda finding tem severidade (P0/P1/P2/P3 — ver AUDIT_PROTOCOL §10).
- P1 que envolve dinheiro/fiscal/multi-loja vira P0.

Saída:
- Criar docs/audits/AUDITORIA_<HUB>_v<NN>.md no formato AUDIT_PROTOCOL §12.
- Para cada finding, usar formato AUDIT_PROTOCOL §11.
- Resumo executivo ≤ 10 linhas.
- Inventário do que foi olhado.
- Lista de mocks descobertos.
- Lista de dívida técnica descoberta.
- Lista de riscos descobertos.
- Recomendação de próxima sprint.

Após escrever:
1. Promover P0/P1 para docs/status/BACKLOG_<HUB>.md.
2. Atualizar docs/status/MOCKS_TRACKING.md, DIVIDA_TECNICA.md, RISCOS.md.
3. Atualizar docs/audits/INDEX.md.
4. Atualizar docs/ai/CURRENT_STATUS.md (bloco "Auditoria <HUB> v<NN> concluída").
5. Commit: chore(audits): auditoria <HUB> v<NN> concluida.

Comece pela coleta e me devolva o draft antes de finalizar.
```

---

## 6. Criação de ADR

**Quando usar:** decisão arquitetural com impacto > 1 arquivo ou que muda contrato entre módulos. IA primária: **Opus**.

```text
Vou registrar uma decisão arquitetural como ADR.

Antes:

1. Ler docs/decisions/INDEX.md (convenções, próximo número).
2. Ler docs/decisions/TEMPLATE_ADR.md (estrutura).
3. Ler ADRs relacionados (se houver — listados no INDEX por HUB).

Próximo número: <NNNN> (consultar INDEX §3 — maior + 1)
Título curto: <…>
HUB afetado: <pdv | financeiro | ... | cross>
Status inicial: proposta (humano aprova → aceita)

Tarefas:

1. Criar docs/decisions/ADR-<NNNN>-<slug-kebab>.md a partir do TEMPLATE_ADR.md.
2. Preencher front matter (status, data, autor, hub, tags).
3. Preencher 8 seções:
   - Contexto: por que decidir agora, restrições reais.
   - Decisão: 1 frase + detalhamento + o que NÃO inclui.
   - Alternativas consideradas: tabela com pelo menos 3 opções e por que cada uma foi/não foi escolhida.
   - Consequências: positivas, negativas/custos, riscos, mudanças imediatas, mudanças de longo prazo.
   - Plano de implementação: aponta para sprint sugerida (não implementar aqui).
   - Validação/métricas: como saberemos que deu certo.
   - Referências: ADRs relacionados, auditorias, sprints, blueprint.
   - Notas/discussão: trade-offs explícitos.

4. Atualizar docs/decisions/INDEX.md (tabela §3 e §6 atalho por HUB).
5. Atualizar ADRs relacionados (campo "Referências") se aplicável.
6. Commit: docs(adr): ADR-<NNNN> · <título>.

REGRAS:
- ADR é decisão, não implementação. Implementação vai para sprint.
- Toda alternativa real considerada (sem "óbvio").
- Trade-off explícito (escolhi A em vez de B, sabendo dos custos).
- Imutável após aceita — mudança vira NOVO ADR com "substitui:".

Comece pela leitura do INDEX e me devolva o draft antes de finalizar.
```

---

## 7. Handoff entre IAs / sessões

**Quando usar:** ao final de qualquer sessão. Formato canônico em [`SESSION_HANDOFF.md §5`](./SESSION_HANDOFF.md).

```text
HANDOFF · <YYYY-MM-DD> · <hub>
De: <IA origem>  →  Para: <IA destino ou "próxima sessão">

Contexto (1–2 frases):
<o que está sendo feito e por quê>

Estado atual:
- ✅ Concluído: <itens>
- 🟡 Em aberto: <itens>
- ⛔ Bloqueado por: <razão> (se houver)

Próxima ação para você (IA destino):
<1 ação específica, verificável>

Arquivos críticos (path:linhas):
- <path>:<linhas>

Não tocar:
- <areas>

Critério de pronto:
- <medida verificável>

Tempo estimado: <X min / Y h>
Risco: <baixo / médio / alto + razão>
```

**Onde salvar:** sempre no final do bloco novo do `CURRENT_STATUS.md` (campo "Próximo passo recomendado").

---

## 8. Refator pequeno (Composer)

**Quando usar:** ajuste de 1–3 arquivos, < 10 min de trabalho, sem mudança de contrato. IA primária: **Composer**.

```text
Microajuste em <componente / arquivo>:

Arquivo: <path>
Mudança: <descrição em 1 frase>

Restrições:
- NÃO mudar interface pública (props, exports).
- NÃO mudar fluxo de dados.
- NÃO tocar Server Action, service, adapter, Prisma.
- Tokens semânticos do projeto (bg-background, text-foreground…) — sem cor hardcoded.

Critério de pronto:
- <descrição visual ou comportamento>
- npx tsc --noEmit → 0 erros no arquivo.

Se exige ler 3+ arquivos antes de editar, NÃO é Composer — me avise e eu passo para Sonnet.
```

---

## 9. Debug de incidente

**Quando usar:** bug em produção ou comportamento inesperado. IA primária: **Sonnet** (executor) + **Opus** se sintoma sistêmico.

```text
Debug de incidente.

Sintoma (1 frase): <…>
Onde acontece: <rota / componente / fluxo>
Quando começou: <data / commit suspeito / "não sei">
Reprodução: <passos OU "não reproduzimos consistentemente">
Severidade hipotética: <P0 | P1 | P2>

Antes de tocar código:

1. Ler docs/governance/GOVERNANCA.md (regras).
2. Reproduzir o bug se possível.
3. git log dos arquivos suspeitos — o que mudou recentemente?
4. Procurar logs/auditoria relacionados.
5. Verificar se é multi-loja (storeId correto?).
6. Verificar se é idempotência (localKey duplicado? webhook re-entrante?).
7. Verificar se é race (concorrência PDV/marketplace/OS?).

Saída intermediária ANTES de corrigir:
- Hipótese da causa raiz.
- Como você comprovou (evidência: log, query, código).
- Blast radius (quem mais é afetado).
- Plano de correção (escopo fechado).
- Plano de validação (como saberemos que sumiu).
- Plano de prevenção (teste novo? assertion? auditoria?).

Só corrigir depois de eu aprovar o plano.

Se for incidente sério (P0):
- Após correção, escrever post-mortem em docs/memory/incidents/<data>-<slug>.md (formato §13 abaixo).
- Atualizar docs/status/RISCOS.md.
- Sugerir auditoria forense em docs/audits/ se causa raiz for sistêmica.
```

---

## 10. Decisão estratégica

**Quando usar:** decisão de produto, posicionamento, escopo de fase, monetização, moat. IA primária: **Opus** (análise) ou **ChatGPT** (estrutura/coordenação).

```text
Preciso de uma decisão estratégica.

Tópico: <…>
Contexto:
- <fato 1 do projeto / mercado>
- <fato 2>
- <restrição (tempo, recurso, prioridade)>

Documentos relevantes para você ler:
- docs/blueprint/MASTER_PLAN.md (se existir)
- docs/blueprint/PRODUCT_VISION.md (se existir)
- docs/roadmaps/ROADMAP_<HUB>.md
- docs/ai/CURRENT_STATUS.md

Saída esperada (NÃO implementar):

1. Análise em 3–5 linhas.
2. 3 opções com prós/contras.
3. Recomendação clara (qual escolher e por quê).
4. Trade-off explícito (o que ganho × o que perco).
5. Próximo passo: virar ADR? Sprint? Esperar mais dado?

Regras:
- Separar [OBS] (observado nos docs / mercado) de [HIP/SUG] (hipótese sua).
- Pensar em ROI × esforço × risco × diferenciação.
- Pensar em moat de longo prazo.
- Não inventar funcionalidade observada.

Se a decisão for grande, ao final me sugira o template de ADR (prompt §6).
```

---

## 11. Protótipo visual de tela / HUB

**Quando usar:** desenhar tela nova, repensar fluxo, prototipar HUB novo. IA primária: **Antigravity + Gemini**.

```text
Quero um protótipo visual de <tela / fluxo / HUB>.

Referências visuais alvo: <Stripe Dashboard | Linear | Shopify Admin | …>
Tema (escolher 1): Light | Soft Ice | Midnight | Black Edition.

Restrições obrigatórias (do OmniGestão Pro):
- Tokens semânticos: bg-background, bg-card, text-foreground, text-muted-foreground, border-border, text-primary…
- NUNCA cor hardcoded.
- min-w-0 em todo flex/grid item (evita overflow).
- AppShell é o único scroll owner — sem h-screen nem overflow-auto em wrapper.
- shadcn/ui (New York, zinc base) + Tailwind 4.
- Lovable hubs usam MemoryRouter isolado, providers locais (OSProvider, FinanceiroProvider…).

Escopo:
- Tela(s): <lista>
- Componentes a desenhar: <lista>
- Estados a cobrir: empty, loading, success, error, skeleton.
- Variações: <quantas? ex.: 3 versões do card principal>

NÃO fazer:
- NÃO tocar em lib/ ou Server Actions.
- NÃO plugar dados reais — protótipo isolado primeiro.
- NÃO importar lib pesada sem combinar.
- NÃO modificar tsconfig.json exclusions.

Entrega:
- Protótipo isolado (com mocks claros e rotulados como "mock visual").
- Lista de pontos de plugagem futura (onde Sonnet vai conectar Server Action / service).
- HANDOFF para Sonnet plugar (formato §7).

Regra final: protótipo passa por validação visual humana antes de Sonnet plugar.
```

---

## 12. Plugar UI Lovable em dados reais

**Quando usar:** depois de protótipo aprovado, conectar UI a Server Actions / services existentes. IA primária: **Sonnet**.

```text
Vou plugar <componente / tela> em dados reais.

UI atual: <path> — atualmente com mock.
Service / Server Action alvo: <path>
Padrão Lovable: o componente vive em components/<hub>/lovable/ e segue exclusions do tsconfig.json.

Antes:

1. Ler docs/governance/GOVERNANCA.md.
2. Ler docs/skills/rules/FRONTEND_IMPORT_RULES.md.
3. Ler o componente e a Server Action / service.
4. Verificar se há ADR aprovado sobre esta integração.

Tarefa:
- Substituir mock por chamada real (Server Action preferida em hub mutativo; API route só se externo).
- Adicionar loading/skeleton (estados).
- Adicionar error state honesto (sem mock disfarçado).
- Garantir storeId no contexto (useStoreActive ou equivalente — multi-loja sempre).
- Garantir idempotência se mutativo (localKey/commandId).
- Garantir tokens semânticos (sem cor hardcoded).

Critério de pronto:
- UI mostra dados reais do Prisma.
- Loading → Skeleton, Empty → mensagem honesta ("sem dados"), Error → fallback claro.
- npx tsc --noEmit → 0 erros.
- Mock anterior removido (não comentado).
- docs/status/MOCKS_TRACKING.md atualizado (se aplicável).

Encerramento:
- Atualizar docs/ai/CURRENT_STATUS.md (bloco novo).
- HANDOFF (formato §7) se há ajuste fino restante para Composer.
```

---

## 13. Post-mortem de incidente

**Quando usar:** após incidente P0 (vendas perdidas, dado errado, segurança, fiscal). IA primária: **Opus** + **Sonnet**.

```text
Vou escrever post-mortem do incidente <slug-curto>.

Antes:

1. Ler docs/governance/AUDIT_PROTOCOL.md (auditoria forense).
2. Levantar evidências: logs, git log, queries, screenshots.
3. Identificar quem foi afetado e quando.

Criar: docs/memory/incidents/<YYYY-MM-DD>-<slug>.md

Estrutura mínima:

```markdown
---
title: Incidente · <slug curto>
data: YYYY-MM-DD
severidade: P0 | P1
hubs_afetados: [<hub1>, <hub2>]
status: investigando | em_correcao | corrigido | encerrado
autor: <ia / humano>
---

# Incidente · <slug curto>

## TL;DR (3 linhas)
<o que aconteceu, blast radius, status atual>

## Timeline
- HH:MM — <fato>
- HH:MM — <fato>
- HH:MM — detectado por <…>
- HH:MM — correção aplicada

## Causa raiz
<5 porquês até chegar na causa real>

## Blast radius (afetados)
- <stores, vendas, OS, clientes>
- Volume: <count>
- Janela: <intervalo>

## Detecção
- Como foi detectado: <…>
- Quanto tempo até detecção: <…>

## Correção aplicada
- Commit: <sha>
- Arquivos: <list>
- Validação: <tsc, build, smoke>

## Prevenção (ações futuras)
- [ ] Teste novo cobrindo o cenário
- [ ] Assertion / validação adicional
- [ ] ADR se decisão arquitetural (link)
- [ ] Sprint de correção sistêmica (link)
- [ ] Atualizar docs/status/RISCOS.md

## Lições
- <…>

## Referências
- ADRs relacionados:
- Auditoria forense (se aplicável):
- Sprint de correção:
```

Após salvar:
- Atualizar docs/status/RISCOS.md.
- Atualizar docs/memory/OMNIGESTAO_MASTER_MEMORY.md se for lição crítica.
- Recomendar auditoria forense em docs/audits/ se causa raiz é sistêmica.
- Commit: docs(incident): post-mortem <slug>.
```

---

## 14. Anti-padrões de uso destes prompts

- **Colar o prompt e não esperar a confirmação de leitura.** A IA pode pular o checklist.
- **Adaptar o prompt removendo a parte de "antes ler X".** É a parte mais importante.
- **Misturar prompts.** "Faz auditoria E corrige" — não. Auditoria é §5, sprint de correção é §3.
- **Usar Composer (§8) para tarefa que exige ler 3+ arquivos.** É Sonnet.
- **Pedir Antigravity (§11) para tocar em `lib/`.** Sempre Sonnet pluga depois.
- **Esquecer o HANDOFF** ao final. Próxima sessão começa cega.

---

## 15. Tabela rápida — qual prompt para qual situação

| Situação | Prompt | IA |
|---|---|---|
| Abrir qualquer sessão | §1 | qualquer |
| Começar sprint | §2 | Opus/Sonnet |
| Trabalhar item de sprint | §3 | Sonnet |
| Fechar sprint | §4 | Sonnet |
| Auditar HUB | §5 | Opus + Sonnet |
| Registrar decisão | §6 | Opus |
| Passar a bola | §7 | qualquer |
| Microajuste UI | §8 | Composer |
| Bug em produção | §9 | Sonnet (+ Opus se sistêmico) |
| Decidir direção | §10 | Opus / ChatGPT |
| Desenhar UI nova | §11 | Antigravity + Gemini |
| Conectar UI a backend | §12 | Sonnet |
| Pós-incidente | §13 | Opus + Sonnet |
