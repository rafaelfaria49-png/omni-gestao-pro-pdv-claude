---
title: ADR-<NNNN> · <título curto da decisão>
status: proposta | aceita | superada | rejeitada | depreciada
data: YYYY-MM-DD
autor: <nome ou IA>
revisores: [<nome>, <ia>]
hub: <pdv | operacoes | financeiro | estoque | marketplace | crm | whatsapp | marketing_ia | omni_agent | bi | multi_loja | governanca | cross>
tags: [<keyword1>, <keyword2>]
superado_por: ADR-<NNNN>   # preencher só quando status = superada
substitui: ADR-<NNNN>      # preencher se aplicável
---

# ADR-<NNNN> · <título curto>

> **Status:** <proposta | aceita | superada | rejeitada | depreciada>
> **Decisão em uma frase:** <o que ficou decidido, sem rodeio>

---

## 1. Contexto

<O que motivou a decisão. Qual é o problema. Quais restrições existiam (técnicas, de negócio, de prazo, de orçamento). Por que precisava decidir agora.>

- Restrição 1: <…>
- Restrição 2: <…>

**Estado atual relevante:**
- `docs/ai/CURRENT_STATUS.md` em <data>: <linha resumo>
- `docs/roadmaps/ROADMAP_<HUB>.md` em <data>: fase <X>

---

## 2. Decisão

<Frase direta. O que vamos fazer.>

**Detalhamento operacional:**
- <…>
- <…>

**O que esta decisão NÃO inclui (escopo fechado):**
- <…>

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que não escolhida |
|---|---|---|---|
| A) <…> | <…> | <…> | <…> |
| B) <…> | <…> | <…> | <…> |
| C) <…> (escolhida) | <…> | <…> | — |

---

## 4. Consequências

### 4.1 Positivas
- <…>
- <…>

### 4.2 Negativas / Custos
- <…>
- <…>

### 4.3 Riscos introduzidos
- <…> · mitigação: <…>

### 4.4 O que muda imediatamente
- Arquivos afetados: <list>
- Docs a atualizar: <list>
- Outras decisões afetadas: <list>

### 4.5 O que muda no longo prazo
- <…>

---

## 5. Plano de implementação

**Esta decisão é só decisão — implementação vai para sprint.**

- Sprint sugerida: SPRINT_<NN>_<HUB> (a planejar)
- Owner humano: <nome>
- Pré-requisitos: <…>
- Critério de pronto da implementação: <…>

---

## 6. Validação / como saberemos que deu certo

- Métrica 1: <…>
- Métrica 2: <…>
- Janela de observação: <X dias/semanas>

---

## 7. Referências

- ADRs relacionados: ADR-<NNNN>, ADR-<NNNN>
- Auditorias relacionadas: `docs/audits/AUDITORIA_<…>.md`
- Sprints relacionadas: `docs/sprints/SPRINT_<NN>_<HUB>.md`
- Issues / discussões externas: <…>
- Documentação de produto/blueprint: `docs/blueprint/<…>`

---

## 8. Notas / discussão

<Pontos levantados durante a discussão que valem registrar. Quem defendeu o quê. Trade-offs explícitos. Citações relevantes.>
