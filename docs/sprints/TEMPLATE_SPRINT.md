---
title: SPRINT_<NN>_<HUB> · <título curto>
sprint_id: <NN>
hub: <pdv | operacoes_os | financeiro | estoque | marketplace | crm | whatsapp | marketing_ia | omni_agent | bi | multi_loja | governanca | cross>
status: planejada | em_execucao | encerrada | cancelada
data_inicio: YYYY-MM-DD
data_fim_prevista: YYYY-MM-DD
data_fim_real: YYYY-MM-DD
owner_humano: <nome>
owner_ia_principal: <opus | sonnet | antigravity_gemini | composer>
roadmap: docs/roadmaps/ROADMAP_<HUB>.md
adrs_relacionados: [ADR-<NNNN>, ADR-<NNNN>]
---

# SPRINT_<NN>_<HUB> · <título curto>

> **Status:** <planejada | em_execucao | encerrada | cancelada>
> **Objetivo em 1 frase:** <o que esta sprint vai entregar, sem rodeio>
> **Roadmap origem:** [`ROADMAP_<HUB>.md`](../roadmaps/ROADMAP_<HUB>.md)

---

## 1. Por que esta sprint existe

<O que do roadmap está sendo atacado. Qual fase. Qual item do backlog. Qual blocker resolve. Cite linhas/seções do roadmap.>

- Item do backlog atacado: <…>
- Fase do roadmap: <…>
- Blocker resolvido (se aplicável): <…>

---

## 2. Escopo fechado

### 2.1 Dentro (vai entregar)
- [ ] <entregável 1>
- [ ] <entregável 2>
- [ ] <entregável 3>

### 2.2 Fora (explícito — NÃO faz parte)
- <…>
- <…>

> **Regra:** trocar item dentro × fora exige swap explícito (remove um, adiciona outro). Não pode "adicionar" sem remover.

---

## 3. Critério de pronto (Definition of Done)

Para a sprint ser considerada encerrada, **todos** os itens abaixo precisam estar verdes:

- [ ] Código mergeado em `main` (ou branch da release).
- [ ] `npx tsc --noEmit` verde.
- [ ] `npm run build` verde (se aplicável — config/rotas/Server Actions/Prisma).
- [ ] Testes adicionados ou atualizados (Vitest) — quando aplicável.
- [ ] Testes existentes verdes.
- [ ] `docs/ai/CURRENT_STATUS.md` atualizado (entrada nova).
- [ ] Roadmap do HUB atualizado (gaps, backlog, sprint_atual).
- [ ] ADR criada (se houve decisão arquitetural).
- [ ] Memória persistida em `memory/` (se houve aprendizado reutilizável).
- [ ] Relatório de encerramento preenchido (§7 deste arquivo).

---

## 4. Plano de execução

| # | Tarefa | Owner | Estimativa | Status |
|---|---|---|---|---|
| 1 | <…> | <ia/humano> | <S/M/L/XL> | ⏳ |
| 2 | <…> | <ia/humano> | <S/M/L/XL> | ⏳ |
| 3 | <…> | <ia/humano> | <S/M/L/XL> | ⏳ |

> S = ½ dia · M = 1–2 dias · L = 3–5 dias · XL = > 5 dias (considerar quebrar).

---

## 5. Riscos identificados

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| <…> | baixa/média/alta | baixo/médio/alto | <…> |

---

## 6. Diário da sprint (atualizado durante)

> Cada IA/humano que toca a sprint adiciona uma entrada com data + o que fez. Vira insumo para a retro.

### YYYY-MM-DD — <quem>
- <ação>
- <ação>
- bloqueio: <…> (se houver)

### YYYY-MM-DD — <quem>
- <ação>

---

## 7. Relatório de encerramento (preenche no fim)

### 7.1 O que foi entregue
- <…>

### 7.2 O que ficou fora do escopo (e por quê)
- <…>

### 7.3 Aprendizados
- <…>

### 7.4 Decisões tomadas
- Sem ADR? Por quê: <…>
- Com ADR: ADR-<NNNN>

### 7.5 Memórias persistidas
- `memory/<slug>.md` — <descrição>

### 7.6 Métricas
- Estimado vs real: <X / Y dias>
- Itens dentro do escopo entregues: <N / total>
- Bugs introduzidos descobertos depois: <N>
- Cobertura de testes: <antes / depois>

### 7.7 Próximos passos / spin-offs
- <…>

---

## 8. Retrospectiva

> Curta. 3 colunas. Foco em processo, não em pessoa.

| ✅ O que funcionou | ⚠️ O que melhorar | 🚀 Ações concretas |
|---|---|---|
| <…> | <…> | <…> |

---

## 9. Referências

- Roadmap: `docs/roadmaps/ROADMAP_<HUB>.md`
- ADRs: ADR-<NNNN>
- Auditoria relacionada: `docs/audits/AUDITORIA_<…>.md` (se aplicável)
- Sprints anteriores do mesmo HUB: SPRINT_<NN-x>_<HUB>
- Commits: <hash1>, <hash2>
- PRs: #<n>, #<n>

---

## 10. Imutabilidade pós-encerramento

Após `status = encerrada`:
- **Conteúdo não é editado** — exceto correção de erro de digitação.
- Mudança de direção → nova sprint referenciando esta em §1.
- Retro fechada vira artefato histórico.
