---
title: Workflow Multi-IA — OmniGestão Pro
status: bloco-2
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
substitui_na_pratica: docs/skills/rules/AI_WORKFLOW.md (mantido como pointer histórico)
---

# 🤖 Workflow Multi-IA — OmniGestão Pro

> **Quem deve ler:** todo dev e toda IA que trabalhe no projeto.
> **O que define:** qual IA usar para qual tipo de tarefa, como elas trabalham juntas, como evitar conflito de edição, como reduzir consumo de contexto.
> **Princípio central:** **cada IA no que ela faz melhor**. Não há "IA universal" — há especializações.

---

## 1. As 5 IAs em uma frase cada

| IA | Tagline |
|---|---|
| **Claude Opus 4.6 / 4.7** | Cérebro estratégico. Pensa fundo, escreve pouco. **Análise, arquitetura, roadmap, auditoria, decisão.** |
| **Claude Sonnet 4.7** | Mão pesada de produção. **Backend, Prisma, services, Server Actions, refactor, debug.** |
| **Antigravity 2.0 + Gemini 3.5** | Olho visual + agente de UX. **Dashboards premium, ergonomia operacional, protótipo enterprise (Stripe/Linear/Shopify-grade).** |
| **Composer 2.5** | Ferramenta de bisturi. **Microalterações locais, componentes pequenos, loaders, skeletons, ajustes pontuais.** |
| **ChatGPT** | Orquestrador. **Memória estratégica entre sessões, priorização, coordenação multi-IA, continuidade de contexto longo.** |

---

## 2. Matriz: tipo de tarefa → IA recomendada

| Tarefa | IA primária | IA suporte | NÃO usar |
|---|---|---|---|
| Estratégia / roadmap / posicionamento / moat | **Opus** | ChatGPT (estrutura), Sonnet (sanity-check) | Composer |
| Análise competitiva / pesquisa de mercado | **Opus** | ChatGPT | Composer |
| Arquitetura / ADR / decisão técnica enterprise | **Opus** | Sonnet (impacto técnico) | Composer |
| Auditoria profunda de HUB | **Opus** | Sonnet (verificar código real) | Composer |
| Blueprint, MASTER_PLAN, governança | **Opus** | ChatGPT (memória) | — |
| Implementação backend (Prisma, services, Server Actions) | **Sonnet** | Opus se decisão arquitetural envolvida | Composer (escopo grande) |
| Refatoração com risco médio/alto | **Sonnet** | Opus revisa plano antes | Composer |
| Debugging difícil (race, corner case, idempotência) | **Sonnet** | Opus se sintoma sistêmico | Composer |
| Integração externa (Meta, ML, Stripe) | **Sonnet** | Opus desenha contrato | Composer |
| Migration Prisma + impacto multi-loja | **Sonnet** (com autorização) | Opus revisa diff | Composer |
| Componente UI pequeno / botão / tooltip | **Composer** | — | Opus (excessivo) |
| Loader, skeleton, microajuste visual | **Composer** | — | Opus (excessivo) |
| Ajuste de estilo (Tailwind) | **Composer** | — | Opus |
| Dashboard premium / página inteira / experiência | **Antigravity + Gemini** | Sonnet pluga dados reais | Composer |
| Protótipo de novo HUB (Lovable-style) | **Antigravity + Gemini** | Sonnet pluga após aprovação | Composer |
| Pesquisa visual de concorrente (UI/UX) | **Antigravity + Gemini** | — | Composer |
| Auditoria visual de tela (ergonomia, hierarquia, acessibilidade) | **Antigravity + Gemini** | Opus consolida findings | Composer |
| Geração de copy/anúncio/conteúdo curto | **Sonnet** ou **ChatGPT** | — | Composer |
| Coordenação multi-IA, priorização entre sessões | **ChatGPT** | — | Composer |
| Manter contexto longo entre sessões | **ChatGPT** (chat) + arquivos `docs/` (persistente) | — | — |
| Documentação curta (README, comentário, doc rápido) | **Sonnet** | — | Opus |
| Resumo / handoff entre sessões | **Sonnet** ou **ChatGPT** | — | — |

---

## 3. Cada IA em detalhe

### 3.1 Claude Opus 4.6 / 4.7 — cérebro estratégico

**Use para:**
- Master plans, blueprints, análises competitivas profundas (como o `docs/blueprint/MASTER_PLAN.md`).
- Arquitetura de novo HUB antes de codar (proposta + ADR).
- Auditoria profunda quando precisa cruzar 5+ arquivos e inferir consequência.
- Decisões irreversíveis ou caras (schema mudança, integração que muda contrato).
- Resposta a "como deveríamos pensar Y?".

**NÃO use para:**
- Editar 1 componente. Caro e lento demais.
- Loop de "tente, erro, tente, erro" — Opus pensa antes de tentar; Sonnet/Composer iteram.
- Conversa longa de baixo valor — fragmenta contexto e queima budget.

**Workflow ideal:**
1. ChatGPT carrega contexto persistente + objetivo da sessão.
2. Opus produz **um único documento estratégico** (blueprint, ADR, roadmap, auditoria).
3. Sonnet executa a partir do documento.
4. Composer faz os microajustes finais.

---

### 3.2 Claude Sonnet 4.7 — produção pesada

**Use para:**
- Implementar Server Actions, services em `lib/`, adapters.
- Refatorar com risco médio (lock, idempotência, validação multi-loja).
- Debugar race condition, idempotência quebrada, webhook duplicado.
- Plugar UI Lovable em dados reais (substituir mock por chamada Prisma).
- Auditoria de código pontual (1 arquivo, 1 fluxo).
- Migration Prisma (com autorização do dono do projeto).
- Geração de documentação curta (README, doc de feature, handoff).

**NÃO use para:**
- Tomada de decisão arquitetural sem ADR aprovado — peça Opus primeiro.
- Microajuste de CSS — Composer é mais rápido.
- "Vai lá e arruma tudo do HUB X" — escopo aberto demais; quebrar em sprints menores.

**Workflow ideal:**
1. Receber documento estratégico (de Opus) ou backlog (`docs/status/BACKLOG_<HUB>.md`).
2. Pré-voo segundo `GOVERNANCA.md §2`.
3. Implementar **um item por vez**, validando (`tsc`, `build`, teste).
4. Atualizar `CURRENT_STATUS.md` e fechar com `DELIVERY_CHECKLIST.md`.

---

### 3.3 Antigravity 2.0 + Gemini 3.5 — visual enterprise

**Use para:**
- Desenhar dashboards premium (estilo Stripe Dashboard, Linear, Shopify Admin).
- Repensar ergonomia operacional (fluxos PDV, fechamento de caixa, kanban de OS).
- Protótipo de tela inteira / nova HUB / nova jornada.
- Auditoria visual: hierarquia, contraste, espaçamento, microcopy, acessibilidade.
- Pesquisa visual de concorrentes (capturar padrões UI/UX usados por referências).
- Geração de experiências novas (onboarding, briefing diário, modal de cobrança).
- Banco de variações de um componente (5 versões de card → escolher 1).

**NÃO use para:**
- Backend, services, Prisma — não é o terreno.
- Microajuste de produção — Composer resolve em segundos.
- Edição de arquivo `lib/` sem revisão Sonnet — pode quebrar contrato.

**Workflow ideal (importação de UI externa segue `FRONTEND_IMPORT_RULES.md`):**
1. Antigravity+Gemini produz **protótipo isolado** (Lovable-style, com MemoryRouter).
2. Validação visual com o dono do projeto.
3. Sonnet pluga em dados reais via Server Actions, respeitando o padrão Lovable existente (exclusões em `tsconfig.json`).
4. Composer ajusta detalhes finais.

**Pontos fortes específicos:**
- Gera **N variações rápido** — bom para A/B de hipótese visual.
- Entende patterns Stripe/Linear/Shopify e replica com fidelidade.
- Captura UX de concorrente a partir de print/URL.

**Pontos fracos:**
- Não entende `lib/financeiro/services` por dentro — não toca em adapter sozinho.
- Pode usar cor hardcoded — **revisar manualmente** se respeita tokens semânticos do projeto (regra `GOVERNANCA.md §3`).
- Pode importar lib pesada — auditar `package.json` antes de aceitar.

---

### 3.4 Composer 2.5 — microalterações

**Use para:**
- Renomear variável local.
- Adicionar `Skeleton` de loading em componente.
- Ajustar Tailwind (espaçamento, cor de token, breakpoint).
- Trocar texto de label/tooltip.
- Adicionar prop opcional em componente existente.
- Fix tipográfico, microcopy.
- Pequeno ajuste de hover, focus ring, transition.
- Mudar ícone de Lucide.

**NÃO use para:**
- Refatorar arquivo com > 200 linhas.
- Mudar fluxo de dados.
- Tocar em Server Action, service, adapter, Prisma.
- Implementar nova feature de qualquer tamanho real.
- Auditoria (não tem visão sistêmica).
- Pesquisa.

**Workflow ideal:**
- Tarefa < 10 minutos, escopo de 1 a 3 arquivos, sem mudança de contrato.
- Validação rápida (`tsc` no arquivo).
- Sem necessidade de ADR ou documento.

**Regra de ouro:** se a tarefa exige ler 3+ arquivos antes de editar, **não é Composer**, é Sonnet.

---

### 3.5 ChatGPT — orquestrador estratégico

**Use para:**
- Manter o "estado mental" do projeto entre sessões (memória estratégica).
- Decidir qual IA chamar para qual tarefa.
- Priorizar 30 itens de backlog em 7 prioridades.
- Conduzir brainstorming livre antes de virar ADR/blueprint.
- Cross-check de duas saídas (uma do Opus, outra do Sonnet) — qual está mais alinhada?
- Conversar com humano sobre direção, dúvida, prioridade, escopo, monetização.
- Coordenar workflow ("manda o Opus auditar o HUB X, depois o Sonnet implementa, depois Composer ajusta").

**NÃO use para:**
- Implementar código no projeto (não tem acesso direto ao repositório).
- Tomar decisão arquitetural sozinho — passa para Opus formalizar como ADR.
- Detalhamento técnico profundo de função específica — passa para Sonnet.

**Workflow ideal:**
- Início de dia: ChatGPT lê `CURRENT_STATUS.md` + `BLOCKERS.md` e propõe foco do dia.
- Decisão estratégica: ChatGPT alinha com humano → pede ADR ao Opus → Sonnet implementa.
- Final de dia/sessão: ChatGPT recebe handoff (texto curto), atualiza memória estratégica, prepara abertura da próxima sessão.

---

## 4. Regras anti-conflito (críticas)

### 4.1 Lock por HUB

**Apenas uma IA por vez tocando o mesmo HUB.**
- Antes de começar: registrar em `docs/status/BLOCKERS.md` (quando existir) ou em commit de sinalização: `chore(<hub>): em trabalho — <ia>`.
- Ao terminar: commit e liberação.

### 4.2 Single-writer por arquivo

**Cada arquivo é "tocado" por uma IA por sessão.** Se outra IA precisar tocar:
1. A primeira commita.
2. A segunda dá `git pull` (ou re-abre o arquivo).
3. Nunca duas IAs editando o mesmo arquivo em paralelo.

### 4.3 Antes de tocar em qualquer arquivo

```bash
git status        # outra IA deixou algo não commitado?
git log -5        # o que mudou recentemente naquela área?
```

### 4.4 Após terminar, sempre commitar antes de passar a bola

Mesmo que a entrega seja parcial. Commit com mensagem clara:

```
wip(<hub>): <o que ficou pronto>
TODO: <o que falta> — passar para <próxima IA>
```

### 4.5 Áreas protegidas — 1 IA + autorização humana

Áreas listadas em `GOVERNANCA.md §4` (auth, proxy, schema.prisma, lib/financeiro, lib/operacoes, lib/whatsapp, lib/omni-agent executores, lib/pdv core) **nunca têm múltiplas IAs em paralelo**, mesmo com lock. Sempre 1 IA + autorização do dono.

---

## 5. Pipeline oficial de execução multi-IA

Para qualquer feature/tarefa de tamanho > microajuste:

```
┌─────────────┐    estratégia / decisão       ┌─────────────┐
│   ChatGPT   │ ──────────────────────────▶   │    Opus     │
│ orquestra   │                                │ formaliza   │
└──────┬──────┘                                │ (ADR/plan)  │
       │ alinha humano                         └──────┬──────┘
       │                                              │ documento
       │                                              ▼
       │                                       ┌─────────────┐
       │                                       │   Sonnet    │
       │                                       │ implementa  │
       │                                       │ (backend)   │
       │                                       └──────┬──────┘
       │                                              │ código rodando
       │                                              ▼
       │                ┌──────────────┐       ┌─────────────┐
       │                │ Antigravity  │ ────▶ │  Composer   │
       │                │ + Gemini     │       │  microfix   │
       │                │ (se UI nova) │       └──────┬──────┘
       │                └──────────────┘              │ entregue
       │                                              ▼
       │                                       ┌─────────────┐
       └──────────────────────────────────────▶│ ChatGPT     │
                       handoff / memória       │ próxima IA  │
                                               └─────────────┘
```

**Versão tabela:**

| Etapa | IA | Saída |
|---|---|---|
| 1. Definir foco | ChatGPT | Briefing curto + IA seguinte |
| 2. Decidir | Opus | ADR ou blueprint em arquivo |
| 3. Implementar backend | Sonnet | Código + tsc + build verde |
| 4. Implementar/refinar UI premium | Antigravity + Gemini | Protótipo aprovado |
| 5. Plugar UI em dados reais | Sonnet | UI funcional |
| 6. Microajuste final | Composer | UI polida |
| 7. Encerrar | Sonnet/ChatGPT | Handoff + atualização docs |

---

## 6. Redução de contexto/token (regras econômicas)

1. **Cada IA lê só o que precisa.** Não recarregar `CURRENT_STATUS.md` inteiro para uma microalteração — ler `BACKLOG_<HUB>.md`.
2. **Usar `grep`/`Glob`** antes de `Read` arquivo inteiro.
3. **Memória vai para arquivo, não para o chat.** Se algo importante surgiu, virar ADR/incident/memory antes de fechar a sessão.
4. **Não pedir para IA "lembrar"** entre sessões — usar `docs/`.
5. **Resposta incremental controlada** (regra `GOVERNANCA.md §5`): 1 documento/HUB/sprint/auditoria por vez.
6. **Handoff é texto curto** (5–10 linhas), não cópia do chat.
7. **Cache do prompt** (Claude): primeira leitura de docs/ vira cache; sessões longas no mesmo HUB ficam baratas.

---

## 7. Memória persistente — onde vive cada coisa

| Tipo de memória | Local | Quem mantém |
|---|---|---|
| Estado atual do projeto | `docs/ai/CURRENT_STATUS.md` | Sonnet/Opus ao final da sessão |
| Backlog por HUB | `docs/status/BACKLOG_<HUB>.md` | Sonnet ao mover tarefa |
| Decisões arquiteturais | `docs/decisions/*.md` (ADRs) | Opus ao decidir |
| Incidentes / post-mortems | `docs/memory/incidents/*.md` | Opus/Sonnet pós-incidente |
| Memória consolidada estratégica | `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` | ChatGPT/Opus por trimestre |
| Auto-memória Claude Code (preferências do usuário) | `~/.claude/projects/.../memory/MEMORY.md` | Claude Code automático |
| Sprints históricas | `docs/sprints/SPRINT_*.md` | Sonnet ao fechar sprint |
| Auditorias | `docs/audits/AUDITORIA_*.md` | Opus ao fechar auditoria |

**Regra:** nada de "lembrar pela IA". Se importa, virou arquivo.

---

## 8. Handoff entre IAs (formato curto)

Toda passagem de bola usa este formato. Cabe em 1 mensagem.

```markdown
HANDOFF · <data> · <hub>
De: <IA origem>  →  Para: <IA destino>

Contexto (1–2 frases):
<o que está sendo feito>

Estado atual:
- Concluído: <…>
- Em aberto: <…>
- Bloqueado por: <…> (se houver)

Próxima ação para você (IA destino):
<1 ação específica>

Arquivos críticos:
- <path>:<linhas>
- <path>:<linhas>

Não tocar:
- <areas>

Critério de pronto:
- <medida verificável>
```

---

## 9. Anti-padrões do workflow multi-IA

- **Usar Opus para microajuste** — caro, lento, frustrante.
- **Usar Composer para feature** — escopo grande quebra o modelo.
- **Antigravity tocando em `lib/`** — pode quebrar contrato de service.
- **Sonnet decidindo arquitetura sozinho** sem ADR — gera dívida.
- **ChatGPT implementando código** — não tem acesso ao repo; fragmenta contexto.
- **Duas IAs editando o mesmo arquivo em paralelo** — merge hell.
- **Não commitar antes de passar a bola** — IA seguinte trabalha com base errada.
- **Memória só no chat** — sessão acaba, contexto morre.

---

## 10. Princípio de ouro do multi-IA

> **A IA mais barata que resolve a tarefa é a certa.**
> Mas **a tarefa mais cara é a errada** — então invista em Opus na decisão e em Sonnet na execução, e use Composer/Antigravity/ChatGPT como aceleradores.
