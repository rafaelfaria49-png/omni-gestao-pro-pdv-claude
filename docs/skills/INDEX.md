# Skills Index — OmniGestão Pro

Ponto de entrada das **regras de governança** do projeto.
Qualquer IA (Claude Code / Cursor / Antigravity / Claude Chat / ChatGPT / Gemini)
deve ler este índice **antes de iniciar uma tarefa**.

## Ordem de leitura recomendada

1. Este índice (`docs/skills/INDEX.md`).
2. Estado atual do projeto: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).
3. As regras abaixo.

## Regras de governança (`docs/skills/rules/`)

| Regra | Quando aplicar |
|-------|----------------|
| [`CORE_RULES.md`](./rules/CORE_RULES.md) | **Sempre.** Regras inegociáveis: pensar antes de codar, escopo fechado, mudanças cirúrgicas, áreas protegidas, tokens visuais. |
| [`DELIVERY_CHECKLIST.md`](./rules/DELIVERY_CHECKLIST.md) | Ao **encerrar** qualquer tarefa: validação, git status, docs, relatório final. |
| [`AI_WORKFLOW.md`](./rules/AI_WORKFLOW.md) | Para entender papéis das IAs, Sonnet vs Opus, passagem de contexto e GitHub. |
| [`FRONTEND_IMPORT_RULES.md`](./rules/FRONTEND_IMPORT_RULES.md) | Ao **importar UI externa** (Lovable / Cloud Design / Gemini / Antigravity). |

## Resumo

- `CORE_RULES.md` — como trabalhar (princípios gerais).
- `DELIVERY_CHECKLIST.md` — como encerrar (checklist de entrega).
- `AI_WORKFLOW.md` — quem faz o quê (papéis e modelos).
- `FRONTEND_IMPORT_RULES.md` — como integrar protótipos de UI.

A camada de governança é **somente documentação** — não altera código de aplicação.
O `CLAUDE.md` na raiz aponta para este índice automaticamente em cada sessão.
