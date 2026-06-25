---
title: Execution Profile — Perfil oficial das ferramentas e IAs
status: vivo
owner: produto + arquitetura
last_update: 2026-06-25
versao: v1
bloco: execution-v2-bloco3
---

# 🧰 Execution Profile — Perfil oficial das ferramentas

> **Este documento define o papel de cada ferramenta e IA no workflow do OmniGestão Pro.**
> Leia antes de atribuir qualquer tarefa a qualquer ferramenta.
> Consulte [`EXECUTION_RULES.md`](./EXECUTION_RULES.md) para regras de execução dos GOALs.
> Consulte [`GOAL_TEMPLATE.md`](./GOAL_TEMPLATE.md) para o template de cada GOAL.

---

## 1. Visão geral — divisão de papéis

| Papel | Quem |
|---|---|
| **Orquestra** | ChatGPT |
| **Implementa** | Claude Code Sonnet |
| **Decide arquitetura** | Claude Opus |
| **Desenha** | Antigravity / Cloud Design |
| **Audita código** | Codex |
| **Valida** | Claude Code Sonnet (tsc/build/testes) + Codex (revisão externa) |
| **Terminal / IDE** | Cursor (passivo) |

---

## 2. Perfis individuais

---

### 2.1 ChatGPT — Orquestrador estratégico

**Papel:** cérebro estratégico do projeto. Não implementa código diretamente.

**Responsabilidades:**
- Criação e priorização de GOALs.
- Redação do roadmap e backlog.
- Coordenação entre ferramentas (quem faz o quê, em que ordem).
- Memória de continuidade entre sessões (histórico de decisões, contexto de sprints).
- Definição de escopo de cada GOAL antes de enviar para o agente.
- Resolução de conflitos de prioridade.
- Comunicação de status ao usuário.

**Não deve:**
- Implementar código diretamente em arquivos produtivos.
- Tomar decisões arquiteturais sem envolver Claude Opus.
- Commitar ou fazer push.

**Output típico:** GOAL preenchido, roadmap atualizado, briefing para outra ferramenta.

---

### 2.2 Claude Code Sonnet — Implementador principal

**Papel:** executor primário de GOALs. Escreve, valida e entrega código.

**Responsabilidades:**
- Implementação estrutural (backend, APIs, Server Actions, lib/).
- Prisma: queries, adapters, services (nunca altera schema sem autorização explícita).
- Integrações reais (WhatsApp Cloud API, Stripe, fiscal).
- Refatorações multi-arquivo dentro do escopo autorizado.
- Escrita e execução de testes (Vitest).
- Validação com `npx tsc --noEmit`, `npm run build`, `npm run test`.
- Commit local seletivo quando autorizado pelo GOAL.
- Criação e atualização de documentação (`docs/`).
- Execução dos GOALs conforme [`EXECUTION_RULES.md`](./EXECUTION_RULES.md).

**Não deve:**
- Fazer `git push` sem autorização explícita separada do usuário.
- Alterar `prisma/schema.prisma` sem autorização explícita.
- Alterar `auth.ts`, `auth.config.ts`, `proxy.ts` sem autorização explícita.
- Refatorar código fora do escopo do GOAL ativo.
- Implementar funcionalidades não solicitadas ("brinde").

**Output típico:** código commitado localmente, relatório final do GOAL, tsc/build/testes verdes.

---

### 2.3 Claude Opus — Arquiteto estratégico

**Papel:** autoridade em decisões de alto impacto. Usado sob demanda, não por padrão.

**Responsabilidades:**
- Definição de arquitetura de novos módulos.
- Redação de ADRs (Architecture Decision Records).
- Auditorias estratégicas (risco, blast radius, consistência cross-módulo).
- Decisões complexas com múltiplos trade-offs (ex.: fiscal, multi-loja, auth).
- Planejamento de sprints de alto risco.
- Revisão de riscos antes de GOAL que toca área protegida.
- Segunda opinião em decisões que Sonnet não consegue resolver sozinho.

**Não deve:**
- Ser usado para tasks rotineiras — custo de contexto elevado.
- Substituir Sonnet em implementação padrão.
- Tomar decisões sem registrar em ADR.

**Quando acionar:** GOAL tamanho L+, mudança em schema/auth/core, nova integração real, fiscal real.

**Output típico:** ADR redigido, proposta arquitetural, relatório de risco.

---

### 2.4 Antigravity / Cloud Design — Designer de UX premium

**Papel:** responsável exclusivo pela camada visual e experiência do usuário.

**Responsabilidades:**
- Design de dashboards e layouts SaaS premium.
- Protótipos de novas telas e fluxos de UX.
- Responsividade e acessibilidade visual.
- Tokens visuais e sistema de design (sem hardcoded colors).
- Experiência visual de módulos novos antes de implementação.
- Geração de componentes visuais dentro do padrão do OmniGestão Pro.

**Não deve:**
- Alterar regras de negócio.
- Alterar backend, APIs, Server Actions, lib/.
- Alterar Prisma.
- Alterar lógica de auth, caixa, fiscal, financeiro.
- Fazer commit sem revisão humana.

**Protocolo de integração com Claude Code:**
1. Antigravity gera o design/protótipo (HTML, CSS, componente isolado).
2. Humano revisa e aprova o visual.
3. Claude Code Sonnet implementa o componente no projeto respeitando o design.
4. As duas ferramentas **nunca editam os mesmos arquivos ao mesmo tempo**.

**Output típico:** protótipo HTML standalone, especificação visual, componente React isolado.

---

### 2.5 Codex — Auditor de código

**Papel:** auditor técnico externo. Lê, analisa, reporta. Implementa apenas com autorização explícita.

**Responsabilidades:**
- Auditoria profunda de código (code review independente).
- Detecção de regressões pós-implementação.
- Análise de performance (queries N+1, renders desnecessários, bundle size).
- Detecção de vulnerabilidades e problemas de segurança.
- Identificação de código morto ou não utilizado.
- Segunda opinião técnica antes de merge em área crítica.
- Revisão de testes (cobertura, falsos positivos, mocks enganosos).

**Não deve (por padrão):**
- Implementar código diretamente — salvo autorização explícita do GOAL.
- Fazer commit ou push.
- Alterar arquivos sem validação humana.

**Como usar Codex como auditor:**
1. Claude Code Sonnet conclui a implementação e gera relatório.
2. Humano aciona Codex com o diff ou os arquivos alterados.
3. Codex retorna lista de findings (P0–P3).
4. Humano decide quais findings viram GOAL de correção.
5. Claude Code Sonnet executa as correções via GOAL normal.

**Output típico:** relatório de findings categorizado (P0 crítico → P3 sugestão).

---

### 2.6 Cursor — Terminal e IDE passivo

**Papel:** ambiente de desenvolvimento local. Não é ferramenta de IA ativa no workflow.

**Uso atual:**
- Rodar Claude Code CLI no terminal integrado.
- Navegar no código (leitura, busca).
- Visualizar diff e git log.
- Rodar comandos de diagnóstico quando necessário.

**Não deve:**
- Ser usado como agente de IA para implementação (esse papel pertence ao Claude Code).
- Fazer commits ou push diretamente (tudo passa pelo Claude Code ou pelo humano).
- Editar arquivos críticos diretamente sem GOAL.

---

## 3. Mapa de responsabilidades

### 3.1 Quem implementa o quê

| Área | Responsável | Nunca |
|---|---|---|
| Backend / lib / services | Claude Code Sonnet | Antigravity, Cursor |
| APIs / Server Actions | Claude Code Sonnet | Antigravity, Cursor |
| Prisma (queries, adapters) | Claude Code Sonnet | Antigravity, Codex (sem auth) |
| Prisma schema | Claude Code Sonnet (auth explícita) + Opus (design) | Qualquer outro |
| Auth / proxy / core | Claude Code Sonnet (auth explícita) + Opus (revisão) | Qualquer outro |
| Testes (Vitest) | Claude Code Sonnet | Antigravity |
| UX / layouts / componentes visuais | Antigravity → Claude Code Sonnet (implementa) | Codex |
| ADRs / decisões arquiteturais | Claude Opus | Claude Code Sonnet (sem consulta Opus) |
| GOALs / roadmap / priorização | ChatGPT | Ferramentas técnicas |
| Auditoria de código | Codex | Claude Code Sonnet (conflito de interesse) |
| Documentação em docs/ | Claude Code Sonnet | Antigravity, Codex |

---

### 3.2 Quem audita o quê

| O que auditar | Quem audita | Quando |
|---|---|---|
| Código implementado por Sonnet | Codex | Pós-GOAL em área crítica |
| Decisão arquitetural | Claude Opus | Antes de GOAL tamanho L+ |
| Risco de blast radius | Claude Opus | GOAL que toca auth/schema/fiscal/multi-loja |
| Qualidade visual | Humano + Antigravity | Antes de Sonnet implementar |
| tsc / build / testes | Claude Code Sonnet (auto) | Todo GOAL com código .ts/.tsx |
| git diff --name-only | Claude Code Sonnet (auto) | Antes de todo commit |

---

### 3.3 Quem nunca deve mexer em quê

| Área protegida | Ferramenta proibida |
|---|---|
| `prisma/schema.prisma` | Antigravity, Codex, Cursor (sem GOAL+auth) |
| `auth.ts` / `auth.config.ts` / `proxy.ts` | Antigravity, Codex, Cursor (sem GOAL+auth) |
| Core PDV / Financeiro / Operações funcionais | Antigravity, Codex (implementação sem auth) |
| Regras de negócio (lib/financeiro, lib/operacoes) | Antigravity |
| Design / visual / componentes UI | Codex (implementação sem auth) |
| GOALs e roadmap | Ferramentas técnicas (são artefatos do ChatGPT) |

---

## 4. Handoff entre ferramentas

### 4.1 Protocolo geral de handoff

Um handoff ocorre quando o output de uma ferramenta se torna o input de outra. Regras:

1. **O output deve ser explícito** — arquivo, relatório, diff, documento, design.
2. **O humano valida o output antes do handoff** — nenhuma ferramenta recebe output de outra sem revisão.
3. **O escopo não muda no handoff** — a ferramenta receptora trabalha no que foi aprovado, não expande.
4. **Registrar o handoff** — mencionado no relatório final do GOAL ou no GOAL do próximo passo.

### 4.2 Handoffs frequentes

| De | Para | O que passa | Quando |
|---|---|---|---|
| ChatGPT | Claude Code Sonnet | GOAL preenchido | Toda implementação |
| Claude Code Sonnet | Codex | Diff + relatório do GOAL | Auditoria pós-impl |
| Codex | Claude Code Sonnet | Lista de findings P0–P3 | Correções aprovadas |
| Antigravity | Claude Code Sonnet | Protótipo / spec visual | Implementação de UX |
| Claude Code Sonnet | ChatGPT | Relatório final do GOAL | Próxima priorização |
| Claude Opus | Claude Code Sonnet | ADR / decisão arquitetural | Implementação de feature nova |
| Claude Code Sonnet | Claude Opus | Dúvida arquitetural / risco | Decisão complexa |

### 4.3 Handoff Antigravity → Claude Code (detalhado)

```
1. ChatGPT define o objetivo da tela (o quê, não o como).
2. Antigravity cria protótipo/design (HTML standalone ou spec).
3. Humano revisa e aprova o visual.
4. Claude Code recebe o GOAL com:
   - Referência ao protótipo aprovado
   - Allow-list de arquivos a criar/editar
   - Regras: não alterar backend, não criar lógica nova fora do GOAL
5. Claude Code implementa o componente.
6. Humano valida visual no browser.
```

### 4.4 Handoff Codex → Claude Code (detalhado)

```
1. Claude Code conclui GOAL e gera relatório final.
2. Humano aciona Codex com: diff, arquivos alterados, contexto do GOAL.
3. Codex retorna: findings P0–P3 com arquivo:linha e descrição.
4. Humano prioriza: quais findings viram GOAL de correção.
5. ChatGPT cria GOAL de correção (se necessário).
6. Claude Code executa o GOAL de correção.
```

---

## 5. Trabalho em paralelo sem conflito

### 5.1 Regra fundamental

**Duas ferramentas nunca editam o mesmo arquivo ao mesmo tempo.**

Se há risco de conflito de área:
1. Definir explicitamente no GOAL quais arquivos cada ferramenta toca.
2. Aguardar a primeira ferramenta finalizar e commitar antes da segunda iniciar.
3. Em caso de dúvida, serializar — nunca paralelizar em área crítica.

### 5.2 Matriz de paralelismo seguro

| Paralelo seguro | Paralelo proibido |
|---|---|
| Antigravity (UX) + Sonnet (backend) — áreas diferentes | Antigravity + Sonnet no mesmo componente |
| Codex (auditoria) + Sonnet (nova feature) — Codex é read-only | Codex implementando + Sonnet no mesmo arquivo |
| ChatGPT (próximo GOAL) + Sonnet (GOAL atual) | Dois GOALs de Sonnet no mesmo HUB |
| Opus (ADR) + Sonnet (outra feature) — sem dependência | Opus revisando + Sonnet implementando a mesma feature |

### 5.3 Antigravity em paralelo ao Claude Code

Antigravity pode trabalhar em paralelo ao Claude Code **somente se**:
- As áreas são completamente separadas (ex.: Antigravity prototipa tela futura enquanto Sonnet fecha backend de feature atual).
- Não há dependência direta entre os outputs imediatos.
- Nenhuma das duas ferramentas precisa do output da outra para avançar.

**Nunca paralelizar** quando Antigravity está gerando um componente que Sonnet vai implementar na mesma sessão — serializar: design primeiro, implementação depois.

### 5.4 Como usar Codex sem interferir no Sonnet

Codex é **read-only por padrão** — não cria conflitos de escrita. Pode rodar em paralelo ao Sonnet com segurança, desde que:
- Codex não receba autorização de implementação no mesmo GOAL que o Sonnet está executando.
- O diff que o Codex analisa seja o estado **antes** das mudanças que o Sonnet está fazendo agora.

---

## 6. Guia de escolha de ferramenta

```
Tenho uma tarefa. Qual ferramenta usar?

├── É estratégia, priorização, roadmap, coordenação?
│   └── ChatGPT

├── É decisão arquitetural, ADR, risco alto, feature complexa nova?
│   └── Claude Opus (+ Sonnet para implementar depois)

├── É implementação de código (backend, API, testes, lib)?
│   └── Claude Code Sonnet

├── É UX, design, layout, dashboard, protótipo?
│   └── Antigravity → depois Sonnet implementa

├── É auditoria, code review, segunda opinião técnica?
│   └── Codex

└── É rodar comando no terminal, navegar no código?
    └── Cursor (passivo)
```

---

## 7. Versionamento

- Esta é a **v1** (criado 2026-06-25, Bloco execution-v2-bloco3).
- Mudança de papel de ferramenta → nova versão + atualização de `last_update`.
- Adição de nova ferramenta → nova seção §2.N + atualizar §3 e §5.
