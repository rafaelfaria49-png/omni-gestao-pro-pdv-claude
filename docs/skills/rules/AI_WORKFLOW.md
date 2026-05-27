# AI_WORKFLOW.md — Fluxo de trabalho entre IAs

> ⚠️ **Fonte da verdade atualizada:** [`docs/governance/WORKFLOW_MULTI_IA.md`](../../governance/WORKFLOW_MULTI_IA.md).
> Aquele documento é mais completo (matriz por tipo de tarefa, regras anti-conflito, pipeline oficial, handoff format, memória persistente).
> Este `AI_WORKFLOW.md` fica preservado como **pointer histórico** — não duplica conteúdo.

Este documento define **quem faz o quê** no desenvolvimento do OmniGestão Pro.
O projeto usa várias IAs; cada uma tem um papel. Respeitar os papéis evita
retrabalho, auditoria duplicada e decisões conflitantes.

## 1. Papéis das IAs

| IA | Papel | Foco |
|----|-------|------|
| **Claude Code (Cursor)** | Execução crítica | Mudanças reais de código, backend, Server Actions, integrações, lógica de negócio. É a IA que "põe a mão" no código de produção. |
| **Claude Code (Antigravity)** | Execução visual / auditoria | Trabalho de UI, integração de protótipos, auditoria de frontend, ajustes de layout e tokens. |
| **Claude Chat** | Planejamento / auditoria | Desenha planos, revisa arquitetura, audita decisões. Não executa código diretamente. |
| **ChatGPT** | Coordenação | Orquestra o fluxo, gera prompts, mantém a memória estratégica e o contexto entre sessões. |
| **Gemini / Cloud Design / Antigravity (design)** | Protótipos / UI visual | Geram protótipos visuais e telas. Saída é **rascunho**, nunca produção direta. |

## 2. Quando usar Sonnet vs Opus

### Sonnet
- Tarefas de execução bem definidas, com plano pronto.
- Mudanças cirúrgicas, fixes pontuais, documentação.
- Integração incremental de UI já auditada.
- Padrão para o dia a dia de execução.

### Opus
- Planejamento arquitetural e decisões de design de sistema.
- Auditoria profunda / debugging complexo de causa-raiz.
- Tarefas com escopo amplo, ambíguo ou cross-módulo.
- Quando o custo de errar é alto e o problema exige raciocínio extenso.

> Regra prática: **plano → Opus; execução de plano pronto → Sonnet.**

## 3. Como passar contexto

- O **plano** é a fonte de verdade da tarefa. Quem executa segue o plano.
- Contexto novo de sessão entra por: `docs/skills/INDEX.md`,
  `docs/ai/CURRENT_STATUS.md` e o plano específico da tarefa.
- Não repita "leia as skills" — o `CLAUDE.md` raiz já instrui isso.
- Decisão estratégica persistente vai para `docs/ai/MASTER_CONTEXT.md`
  (MASTER_MEMORY), não fica solta no chat.
- Ao encerrar, atualize o status conforme o `DELIVERY_CHECKLIST.md`.

## 4. Como usar o GitHub

- Trabalhe em **branch**, nunca direto em `master`/`main` sem pedido.
- Um commit = uma intenção (ver `CORE_RULES.md` §3).
- Mensagens de commit descrevem o **porquê**, não só o "o quê".
- Pull Requests são abertos apenas quando o usuário pedir.
- O histórico do Git é o registro de auditoria de execução —
  mantenha-o limpo e legível.

## 5. Como manter o CURRENT_STATUS.md

- `docs/ai/CURRENT_STATUS.md` reflete o estado **real** de cada módulo
  (real vs mock, pronto vs pendente).
- Atualize **somente** em mudança relevante de estado (ver
  `DELIVERY_CHECKLIST.md` §2.1).
- Nunca marque algo como "pronto"/"real" sem critério verificado.
- É o primeiro arquivo que qualquer IA lê para saber onde o projeto está.

## 6. Regra anti-duplicação de auditoria

Se o **plano já veio pronto e auditado** (de Claude Chat / ChatGPT / Opus):

- O Claude Code que executa **não repete a auditoria pesada**.
- Confiar no plano; executar com mudanças cirúrgicas.
- Auditar de novo só se encontrar **contradição concreta** entre o plano
  e o código real — e nesse caso, **relatar** antes de divergir.

Auditoria duplicada queima tempo, gera planos conflitantes e atrasa entrega.
Cada IA confia no entregável da etapa anterior, salvo evidência em contrário.

---

Ver também: [`CORE_RULES.md`](./CORE_RULES.md) ·
[`DELIVERY_CHECKLIST.md`](./DELIVERY_CHECKLIST.md) ·
[`FRONTEND_IMPORT_RULES.md`](./FRONTEND_IMPORT_RULES.md)
