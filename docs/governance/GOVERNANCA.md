---
title: Governança — Regras Inegociáveis (versão de bolso)
status: bloco-1
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
substitui_na_pratica: docs/skills/rules/CORE_RULES.md (mantido como referência detalhada)
---

# 🛡️ Governança OmniGestão Pro — Regras inegociáveis

> **Quem deve ler:** **toda IA** (Claude Sonnet/Opus, Antigravity+Gemini, Composer, ChatGPT) e todo dev humano **antes de iniciar qualquer tarefa**.
> **Tempo de leitura:** < 2 minutos.
> **Detalhamento:** ver [`docs/skills/rules/CORE_RULES.md`](../skills/rules/CORE_RULES.md). Este arquivo é a **versão de bolso, orientada a ação**.

---

## 1. Os 7 inegociáveis

1. **Pensar antes de codar.** Localize os arquivos reais, leia o contexto, mapeie o impacto. Não comece a editar para descobrir.
2. **Escopo fechado.** Faça apenas o que foi pedido. Problema fora do escopo é **relatado**, não corrigido.
3. **Mudanças cirúrgicas.** Altere o mínimo necessário. Sem refactor "de brinde". Sem renomear o que não precisa.
4. **Sem overengineering.** A solução mais simples que satisfaz o critério vence. Não construa para o "talvez futuro".
5. **Nunca mocks enganosos.** Nada que pareça persistência real sem ser. Fallback honesto é obrigatório (rótulo "Sem dados", "Estimado", "Sugestão local").
6. **Multi-loja sempre isolado.** Toda query/mutação **precisa** de `storeId`. Sem fallback silencioso para `loja-1`.
7. **Áreas protegidas exigem autorização explícita** (ver §4).

---

## 2. Pré-voo — antes de tocar em qualquer arquivo

- [ ] Li `docs/skills/INDEX.md` e `docs/ai/CURRENT_STATUS.md`.
- [ ] Se for trabalho em HUB específico: li `docs/roadmaps/ROADMAP_<HUB>.md` e `docs/status/BACKLOG_<HUB>.md` (quando existirem).
- [ ] Identifiquei os arquivos reais que vou tocar (não vou descobrir editando).
- [ ] Confirmei que **não** vou cruzar a fronteira de outro HUB sem necessidade.
- [ ] Confirmei que **não** vou tocar em áreas protegidas sem autorização (ver §4).
- [ ] Se a tarefa altera schema/auth/proxy/rotas/Server Actions/Prisma: pedirei autorização **antes** de aplicar.

## 3. Em voo — durante o trabalho

- **Um tópico por vez.** Não misture refactor + feature + fix.
- **Idempotência sempre.** Toda escrita financeira ou de webhook precisa de `localKey` ou `commandId`.
- **Auditoria obrigatória** para ação crítica: gravar em `LogsAuditoria` com `storeId` no metadata (até a migração da coluna acontecer).
- **Tokens semânticos somente** no front (`bg-background`, `text-foreground`, `border-border`…). **Sem cor hardcoded.**
- **`min-w-0` obrigatório** em flex/grid items.
- **AppShell é o único scroll owner** — nunca `h-screen`/`overflow-auto` em hub wrapper.
- **Lovable hubs:** lógica complexa **não vive** dentro do hub. Vai para Server Actions / services em `lib/`.

## 4. Áreas protegidas — exigem autorização explícita

| Área | Por quê | Autorização |
|---|---|---|
| `auth.ts` / `auth.config.ts` / `proxy.ts` | Quebra acesso de todo mundo | Explícita do dono do projeto |
| `prisma/schema.prisma` | Migração afeta produção | Explícita + diff revisado antes de `db:push`/`db:migrate` |
| `lib/pdv/*` core (motor de carrinho, fechamento) | Vendas reais em produção | Explícita |
| `lib/financeiro/*` (ledger, conta receber, conta pagar) | Dinheiro real | Explícita |
| `lib/operacoes/*` services (OS, garantia, retirada) | Operação real | Explícita |
| `lib/whatsapp/*` (webhook, signature) | Compliance Meta + Meta pode banir o número | Explícita |
| `lib/omni-agent/*` executores | Pode mover dinheiro | Explícita |

## 5. Anti-padrões — nunca faça

- Criar mock que parece persistência real (loading + lista de dados fake).
- Renomear `_unused` para "limpar" sem checar usos.
- Adicionar `// removed code` ou re-exports de retrocompat por hábito.
- `if/else` para "feature flag" sem feature flag real.
- Logar token, senha, ou metadata de cliente em produção.
- `git push --force` em `main`/`master`.
- `--no-verify`, `--no-gpg-sign`, `db:push --accept-data-loss` sem autorização.
- Misturar duas IAs trabalhando na mesma área no mesmo intervalo (ver `WORKFLOW_MULTI_IA.md`).
- Resposta gigante monolítica que estoura terminal (a partir de agora: **entrega incremental controlada**).

## 6. Quando pedir autorização explícita (e como pedir)

**Sempre antes de:**
- Aplicar migration (`db:push` / `db:migrate`).
- Alterar `auth.ts`, `proxy.ts`, `prisma/schema.prisma`.
- Tocar em qualquer área da §4.
- Apagar arquivo/coluna/tabela.
- Mudar fluxo de pagamento, fechamento de caixa, emissão fiscal.

**Como pedir:**
> Vou tocar em `<arquivo>`. Motivo: `<motivo>`. Diff esperado: `<resumo>`. Risco: `<risco>`. Pode aprovar?

## 7. Encerramento — antes de entregar

- [ ] `npx tsc --noEmit` → **zero erros** nos arquivos da sessão.
- [ ] `npm run build` se mudou config, rotas, layouts, Server Actions ou Prisma.
- [ ] `git status` limpo do que **não** era da tarefa.
- [ ] Atualizei `docs/ai/CURRENT_STATUS.md` **se** houve mudança relevante de estado.
- [ ] Atualizei o `BACKLOG_<HUB>.md` (quando existir) movendo tarefas concluídas.
- [ ] Relatório final no formato de [`docs/skills/rules/DELIVERY_CHECKLIST.md`](../skills/rules/DELIVERY_CHECKLIST.md).

## 8. Fonte da verdade — onde olhar

| Pergunta | Olhar em |
|---|---|
| "Posso fazer X?" | Este arquivo + `CORE_RULES.md` |
| "Como abrir/fechar sessão?" | `docs/governance/SESSION_HANDOFF.md` (quando existir) |
| "Qual IA usar?" | `docs/governance/WORKFLOW_MULTI_IA.md` (quando existir) |
| "Como rodar uma sprint?" | `docs/governance/SPRINT_PROTOCOL.md` (quando existir) |
| "Como rodar uma auditoria?" | `docs/governance/AUDIT_PROTOCOL.md` (quando existir) |
| "O que está no roadmap do HUB X?" | `docs/roadmaps/ROADMAP_<HUB>.md` |
| "O que está pendente no HUB X?" | `docs/status/BACKLOG_<HUB>.md` |
| "Por que decidimos Y?" | `docs/decisions/*.md` (ADRs) |
| "O que aconteceu no incidente Z?" | `docs/memory/incidents/*.md` |
| "Qual é o estado atual?" | `docs/ai/CURRENT_STATUS.md` |
| "Qual é a tese de produto?" | `docs/blueprint/MASTER_PLAN.md` (quando existir) |

## 9. Princípio final

> **Se em dúvida, não faça. Pergunte.**
> Custo de pausar para confirmar é baixo. Custo de operação destrutiva não autorizada é alto.
