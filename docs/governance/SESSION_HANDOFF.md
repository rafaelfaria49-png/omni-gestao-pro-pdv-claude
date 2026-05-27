---
title: Session Handoff — Protocolo de abertura e fechamento de sessão
status: bloco-3
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
depende_de:
  - docs/governance/GOVERNANCA.md
  - docs/governance/WORKFLOW_MULTI_IA.md
---

# 🔁 Session Handoff — OmniGestão Pro

> **Quem deve ler:** toda IA e todo dev no início e fim de cada sessão.
> **O que define:** como abrir uma sessão sem perder contexto, como fechar deixando rastro útil, como passar a bola entre IAs.
> **Princípio central:** **a sessão é descartável. O repositório é o cérebro.**

---

## 1. Princípios

1. **Nada importante mora no chat.** Se importa, virou arquivo (`status/`, `decisions/`, `memory/`, `sprints/`).
2. **Toda sessão começa lendo, não codando.** 3 minutos de leitura economizam 3 horas de retrabalho.
3. **Toda sessão termina com handoff.** Mesmo solo (próxima sessão é "você do amanhã" — IA diferente na prática).
4. **Lock de HUB sinaliza intenção, não posse.** Se outra IA precisar, libera o lock e commita.

---

## 2. Checklist de **abertura** de sessão (universal)

Antes de tocar em qualquer arquivo:

```text
[ ] 1. Ler CLAUDE.md (raiz)
[ ] 2. Ler docs/skills/INDEX.md
[ ] 3. Ler docs/governance/GOVERNANCA.md       (regras inegociáveis, < 2 min)
[ ] 4. Ler docs/ai/CURRENT_STATUS.md           (overview do estado vivo)
[ ] 5. Se a tarefa é em HUB específico:
       [ ] docs/roadmaps/ROADMAP_<HUB>.md      (quando existir)
       [ ] docs/status/BACKLOG_<HUB>.md        (quando existir)
[ ] 6. git status         → algo não commitado de outra IA?
[ ] 7. git log -5         → o que mudou recentemente?
[ ] 8. Ler último HANDOFF (se há, mora no final do CURRENT_STATUS ou na issue/chat anterior)
[ ] 9. Verificar locks ativos em docs/status/BLOCKERS.md (quando existir)
[ ] 10. Confirmar com humano: qual é o objetivo desta sessão?
```

**Se algo do checklist falha:** parar e perguntar antes de codar.

---

## 3. Checklist de **encerramento** de sessão (universal)

Antes de declarar "feito":

```text
[ ] 1. npx tsc --noEmit               → 0 erros nos arquivos da sessão
[ ] 2. npm run build                  → se mexeu em rotas/Server Actions/Prisma/config
[ ] 3. git status                     → só os arquivos da tarefa estão modificados
[ ] 4. Commits feitos                 → sem WIP solto no working tree
[ ] 5. Atualizar docs/ai/CURRENT_STATUS.md
       — bloco novo no topo se houve mudança de estado relevante
[ ] 6. Atualizar docs/status/BACKLOG_<HUB>.md     (quando existir)
       — mover tarefas concluídas; promover P0/P1 se mudou
[ ] 7. Atualizar docs/status/RISCOS.md            (quando existir)
       — adicionar/remover riscos descobertos
[ ] 8. Atualizar docs/status/MOCKS_TRACKING.md    (quando existir)
       — registrar se algum mock foi removido ou criado
[ ] 9. Se houve decisão arquitetural:
       — criar docs/decisions/ADR-<numero>-<slug>.md
[ ] 10. Se houve incidente:
        — criar docs/memory/incidents/<data>-<slug>.md (post-mortem)
[ ] 11. Escrever HANDOFF (formato §5) e colar:
        — no final do bloco novo do CURRENT_STATUS
        — opcionalmente no chat para a próxima sessão
[ ] 12. Relatório final no formato docs/skills/rules/DELIVERY_CHECKLIST.md
```

**Regra de ouro:** se o checklist falha em algum ponto, **a sessão não fechou**. Pendência vira HANDOFF explícito com `TODO`.

---

## 4. Atualização do `CURRENT_STATUS.md` — formato oficial

Toda sessão que concluiu algo relevante adiciona **um bloco no topo** com este formato:

```markdown
### <Título curto> (concluído YYYY-MM-DD)

**Contexto:** <1–3 frases sobre o porquê / dor / origem>

| Arquivo | Mudança |
|---------|---------|
| `path/to/file.ts` | <o que mudou> |
| `path/to/other.tsx` | <o que mudou> |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK (se aplicável)

**Não alterado (intacto):** <listar áreas críticas que não foram tocadas>

**Riscos restantes:** <ou "nenhum">

**Próximo passo recomendado:** <pendência clara para a próxima sessão>

---
```

**Convenções:**
- Blocos novos vão **no topo** da seção "✅ Concluído e Funcionando".
- Datas no formato ISO: `2026-05-27`.
- Mensagem em português, factual, sem marketing.
- Não inflar — se a sessão foi pequena, o bloco é pequeno.

---

## 5. Formato oficial do **HANDOFF**

Toda passagem de bola — entre IAs ou entre sessões da mesma IA — usa este formato. Cabe em 1 mensagem ou 1 trecho de markdown.

```markdown
HANDOFF · <data> · <hub>
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
- <path>:<linhas>

Não tocar:
- <areas>

Critério de pronto:
- <medida verificável (tsc verde, teste X passando, UI mostra Y, etc.)>

Tempo estimado: <X min / Y h>
Risco: <baixo / médio / alto + razão>
```

**Onde salvar o handoff:**
1. **Sempre** no final do bloco novo do `CURRENT_STATUS.md` (campo "Próximo passo recomendado").
2. **Opcionalmente** colado no chat para a próxima sessão (não é fonte da verdade — só comodidade).
3. **Se for handoff entre IAs diferentes na mesma sessão**: mensagem direta entre elas (humano repassa).

---

## 6. Locks por HUB

### 6.1 Quando criar lock

- Trabalho que vai durar **mais de 30 minutos** num HUB.
- Mudança que **toca arquivo crítico** (`lib/<hub>/services/*`, Server Action, schema).
- Refatoração ou migração de qualquer tamanho.

### 6.2 Onde sinalizar

Em `docs/status/BLOCKERS.md` (quando existir; até lá, em commit de sinalização):

```markdown
- 🔒 <hub> — em trabalho por <IA / dev> desde <data hh:mm>
  Escopo: <o que está sendo feito>
  ETA: <quando libera>
  Não tocar: <arquivos / áreas>
```

Ou via commit dedicado no início da sessão:

```bash
git commit --allow-empty -m "chore(<hub>): em trabalho por <ia> — ETA <data hh:mm>"
```

### 6.3 Quando liberar

- Ao final da sessão, sempre commitar **e** remover o lock.
- Se sessão for interrompida, deixar o lock + HANDOFF explicando estado.

### 6.4 Áreas protegidas (`GOVERNANCA.md §4`)

Lock **não é suficiente** — exige autorização humana adicional. Lock + autorização = ok.

---

## 7. Retomada após pausa longa (≥ 1 dia ou mudança de IA)

```text
[ ] 1. git log --since="1 week ago" --oneline      → o que mudou
[ ] 2. Ler último bloco de CURRENT_STATUS.md       → estado mais recente
[ ] 3. Ler último HANDOFF                          → onde parou
[ ] 4. Verificar BLOCKERS.md                       → algum lock pendente?
[ ] 5. Verificar git status                        → WIP esquecido?
[ ] 6. Confirmar com humano                        → ainda é o foco?
[ ] 7. Só então: começar a tarefa
```

**Anti-padrão:** abrir e codar sem checklist. Garante retrabalho.

---

## 8. Especificidades por IA

### 8.1 Claude Code (sessão local com acesso a arquivos)

- **Abertura:** já carrega `CLAUDE.md` automaticamente. Mesmo assim — rodar o checklist §2.
- **Encerramento:** rodar checklist §3 manualmente. Auto-memory grava preferências do usuário (em `~/.claude/projects/.../memory/MEMORY.md`), mas estado do projeto **vai para `docs/`**.
- **Handoff típico:** Claude Code → Claude Code (próxima sessão) ou Claude Code → Sonnet/Composer/Antigravity.

### 8.2 Claude Chat (sem acesso a arquivos)

- **Abertura:** humano cola conteúdo dos docs relevantes (ou usa connector se disponível).
- **Encerramento:** humano copia handoff e salva em `CURRENT_STATUS.md` manualmente.
- **Use principalmente para:** estratégia, análise, brainstorming (não escreve arquivo no repo).

### 8.3 ChatGPT (orquestrador)

- **Abertura:** lê resumo estratégico (memória própria + último handoff).
- **Encerramento:** atualiza memória estratégica própria; sugere foco da próxima sessão.
- **Não escreve no repo** — passa instrução para Sonnet/Opus/Composer/Antigravity.

### 8.4 Antigravity 2.0 + Gemini 3.5

- **Abertura:** lê especificação visual + tokens semânticos (`bg-background`, `text-foreground`…) e padrão Lovable do projeto (`tsconfig.json` exclusions).
- **Encerramento:** entrega protótipo isolado, **não** plugado em dados reais. Handoff explícito para Sonnet plugar.
- **Lock:** apenas o HUB visual em construção (Lovable sub-app), nunca `lib/`.

### 8.5 Composer 2.5

- **Abertura:** ler **somente** o arquivo a editar e seus 1–2 dependentes diretos.
- **Encerramento:** validar `tsc` no arquivo, commit, fim.
- **Sem handoff longo** — Composer só pega tarefas que cabem em "1 commit, 1 mensagem".

---

## 9. Fluxo visual end-to-end de uma sessão

```
┌─────────────────────────────────────────────────────────────┐
│  ABERTURA                                                   │
│  • Ler INDEX → GOVERNANCA → CURRENT_STATUS                  │
│  • git status / git log -5                                  │
│  • Ler último HANDOFF                                       │
│  • Confirmar objetivo com humano                            │
│  • Criar lock se sessão > 30min em HUB sensível             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  EXECUÇÃO                                                   │
│  • IA correta para a tarefa (WORKFLOW_MULTI_IA §2)          │
│  • Escopo fechado, mudanças cirúrgicas                      │
│  • Commits intermediários se sessão longa                   │
│  • Sem tocar áreas protegidas sem autorização               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  ENCERRAMENTO                                               │
│  • tsc + build                                              │
│  • Atualizar CURRENT_STATUS (bloco novo no topo)            │
│  • Atualizar BACKLOG_<HUB>, RISCOS, MOCKS_TRACKING          │
│  • ADR se decisão arquitetural                              │
│  • Post-mortem se incidente                                 │
│  • Escrever HANDOFF (formato §5)                            │
│  • Liberar lock                                             │
│  • Relatório final DELIVERY_CHECKLIST                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                      próxima sessão
                  começa lendo CURRENT_STATUS
                       + HANDOFF
```

---

## 10. Anti-padrões

- Começar a sessão direto no código sem ler `CURRENT_STATUS`.
- Encerrar sem atualizar `CURRENT_STATUS`.
- HANDOFF vago ("continuar de onde parou", "ver o que falta").
- Deixar WIP no working tree sem commit (próxima IA pode pisar).
- Lock perpetuado (esqueceu de liberar).
- Mudar de HUB no meio da sessão sem fechar o anterior.
- Memória só no chat — sessão acaba, contexto morre.
- "Vou só dar uma olhada" e acabar mexendo em 6 arquivos sem rastro.

---

## 11. Resumo executivo (cole isso no chat de abertura, se quiser)

```text
INÍCIO DE SESSÃO:
1. Ler CLAUDE.md + skills/INDEX.md + governance/GOVERNANCA.md
2. Ler ai/CURRENT_STATUS.md + último HANDOFF
3. git status + git log -5
4. Confirmar objetivo
5. Criar lock se aplicável

FIM DE SESSÃO:
1. tsc + build
2. Commit limpo
3. Atualizar CURRENT_STATUS (bloco novo no topo)
4. Atualizar BACKLOG do HUB
5. ADR / post-mortem se aplicável
6. Escrever HANDOFF
7. Liberar lock
8. Relatório final
```
