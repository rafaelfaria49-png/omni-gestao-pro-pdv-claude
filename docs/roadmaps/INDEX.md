---
title: Roadmaps por HUB — OmniGestão Pro
status: vivo
owner: produto/arquitetura
last_update: 2026-05-27
---

# 🗺️ Roadmaps por HUB — Índice oficial

> **Fonte da verdade** para a evolução de cada HUB do OmniGestão Pro.
> Cada HUB tem um roadmap próprio (`ROADMAP_<HUB>.md`) com visão, fases, gaps, dependências e sprint atual.
> **Este índice** define: o que cada roadmap deve conter, a ordem ideal de evolução, e a matriz de dependências entre HUBs.

---

## 1. Para que serve um roadmap de HUB

Roadmap é o **eixo do tempo** de um HUB. Responde:

- Onde estamos hoje? (estado real + gaps)
- Para onde vamos? (visão + fases)
- Quem chega antes? (dependências)
- O que entra na próxima sprint? (backlog priorizado)
- O que pode quebrar? (riscos)

**Roadmap NÃO é:**
- Lista de tarefas (isso é sprint).
- Decisão arquitetural (isso é ADR).
- Estado atual congelado (isso é `CURRENT_STATUS.md`).
- Lista de bugs (isso é `BLOCKERS.md` / issues).

Roadmap **fala em fases e meses**. Sprint **fala em dias e tarefas**. ADR **fala em decisão única**.

---

## 2. Convenções

### 2.1 Naming

```
docs/roadmaps/ROADMAP_<HUB>.md

Exemplos:
  ROADMAP_PDV.md
  ROADMAP_OPERACOES_OS.md
  ROADMAP_FINANCEIRO.md
  ROADMAP_OMNI_AGENT.md
```

- Um arquivo por HUB. **Sem versionamento no nome** (`ROADMAP_PDV_v2.md` é proibido — o histórico vive em git).
- Em **PT-BR**, MAIÚSCULAS para o nome do HUB.
- Slug do HUB segue o vocabulário oficial (§5).

### 2.2 Estrutura obrigatória de cada `ROADMAP_<HUB>.md`

Todo roadmap deve ter, **nesta ordem**, as seções abaixo:

| Seção | Conteúdo |
|---|---|
| Front matter | `title`, `hub`, `status`, `owner`, `last_update`, `sprint_atual` |
| 1. Visão | O que este HUB resolve, para quem, em uma frase |
| 2. Objetivos | 3–5 objetivos do HUB (mensuráveis) |
| 3. Concorrentes analisados | Quem fizemos benchmark + 1 linha do que aprendemos |
| 4. Diferenciais | O que o OmniGestão entrega aqui que os concorrentes não entregam |
| 5. Gaps atuais | O que falta hoje (real, não desejado). Cruzar com `CURRENT_STATUS.md` |
| 6. Funcionalidades futuras | Lista priorizada do que virá (sem prazos exatos) |
| 7. Backlog | Itens granulares, prontos para virar sprint |
| 8. Fases | Fase 1, 2, 3… — objetivo de cada uma e critério de saída |
| 9. Dependências | De quais HUBs / módulos este HUB depende para evoluir |
| 10. Riscos | Técnicos, de produto, de negócio · com mitigação |
| 11. Sprint atual | Link para `SPRINT_NN_<HUB>.md` em execução (ou "nenhuma") |
| 12. Status atual | Estado consolidado em 1 parágrafo |
| 13. Métricas de sucesso | Como saberemos que o HUB está saudável |
| 14. Blockers | O que está travando avanço hoje (link `BLOCKERS.md`) |
| 15. Referências | ADRs, auditorias, blueprint, docs/modules |

Quem não seguir a estrutura → o roadmap não é aceito no índice.

### 2.3 Imutabilidade

- Roadmap é **vivo** — pode (e deve) ser atualizado.
- Mudanças grandes (mudar a visão do HUB, mudar a ordem das fases) → exigem **ADR** e link cruzado.
- `last_update` no front matter é obrigatório a cada edição.

---

## 3. Ordem ideal de evolução dos HUBs

Premissa: o ERP precisa primeiro funcionar **fim-a-fim no balcão** (PDV→Estoque→Financeiro), depois ganhar **inteligência operacional** (OS, CRM, WhatsApp), depois **alcance** (Marketplace, Marketing), e por último **camadas transversais** (Omni Agent, BI, Multi-loja).

| Onda | HUBs | Por quê |
|---|---|---|
| **Onda 1 — Núcleo transacional** | PDV · Estoque · Financeiro | Sem isso o ERP não roda. Fluxo de dinheiro real. |
| **Onda 2 — Atendimento e relacionamento** | Operações/OS · CRM · WhatsApp | Camada de serviço/cliente sobre o núcleo. |
| **Onda 3 — Alcance e receita** | Marketplace · Marketing IA | Expansão do canal de vendas e demanda. |
| **Onda 4 — Camadas transversais** | Omni Agent · BI · Multi-loja | Atravessam todos os HUBs — só fazem sentido com base sólida. |

**Esta ordem é recomendada, não obrigatória.** Pode haver sprints paralelas em ondas diferentes (ver §4), mas a **prioridade de investimento** segue esta sequência.

---

## 4. Matriz de paralelismo

Quais HUBs **podem evoluir em paralelo** sem se atropelar e quais **não devem**:

| HUB A | HUB B | Paralelo? | Motivo |
|---|---|---|---|
| PDV | Estoque | ⚠️ cuidado | PDV consome estoque; mudanças concorrentes em `ledger` quebram ambos |
| PDV | Financeiro | ⚠️ cuidado | PDV materializa receivable; mudar contrato de `localKey` quebra os dois |
| PDV | CRM | ✅ ok | CRM lê cliente, PDV usa cliente — leituras paralelas seguras |
| OS | Financeiro | ⚠️ cuidado | OS faturamento gera receivable via adapter — mexer no adapter exige sincronia |
| OS | Estoque | ⚠️ cuidado | OS consome/restitui peças — adapter compartilhado |
| Marketplace | Estoque | ❌ proibido em paralelo | Sincronização de saldo é o coração — uma sprint por vez |
| Marketplace | Financeiro | ⚠️ cuidado | Conciliação de repasses depende dos contratos do financeiro |
| WhatsApp | CRM | ✅ ok | WhatsApp escreve em CRM, CRM lê — fluxo unidirecional |
| WhatsApp | Omni Agent | ⚠️ cuidado | Omni Agent executa via WhatsApp — mudar contrato de mensagens quebra ambos |
| Marketing IA | CRM | ✅ ok | Marketing IA consome segmentos do CRM |
| Marketing IA | WhatsApp | ✅ ok | Marketing IA dispara via WhatsApp |
| Omni Agent | Qualquer HUB executor | ❌ proibido em paralelo | Omni Agent chama executores; mudar executor enquanto Omni Agent muda regra → caos |
| BI | Qualquer HUB | ✅ ok | BI é leitura agregada — não bloqueia evolução |
| Multi-loja | Qualquer HUB | ⚠️ cuidado | Mudar regra de isolamento `storeId` toca tudo — sprint dedicada |

**Regra geral:** se duas sprints mexem no **mesmo arquivo do mesmo HUB**, é serial. Se mexem em **contratos compartilhados** (adapters, schema, eventos), é serial. Caso contrário, paralelo permitido.

---

## 5. Vocabulário oficial dos HUBs

Use **exatamente** estes slugs em código, docs e roadmaps:

| Slug | Nome | Pasta principal |
|---|---|---|
| `pdv` | PDV (Ponto de Venda) | `lib/pdv*`, `components/dashboard/pdv*` |
| `operacoes_os` | Operações / Ordens de Serviço | `lib/operacoes/`, `components/operacoes/lovable/` |
| `financeiro` | Financeiro | `lib/financeiro/`, `components/dashboard/financeiro*` |
| `estoque` | Estoque | `lib/estoque*`, `components/dashboard/estoque*` |
| `marketplace` | Marketplace | `lib/marketplace*` (a criar) |
| `crm` | CRM / Cadastros | `lib/cadastros*`, `components/cadastros/` |
| `whatsapp` | WhatsApp HUB | `lib/whatsapp/`, `components/dashboard/whatsapp*` |
| `marketing_ia` | Marketing IA | `lib/marketing*` (a criar) |
| `omni_agent` | Omni Agent | `lib/omni-agent/`, `components/omni-agent/` |
| `bi` | BI / Dashboards / Analytics | `lib/bi*` (a criar) |
| `multi_loja` | Multi-loja (camada transversal) | `lib/multistore*` (a desenhar) |

Não invente sinônimos (`pdv-classico`, `vendas`, `caixa` ≠ HUB próprio — são features dentro do `pdv`).

---

## 6. Índice dos roadmaps

| HUB | Roadmap | Status do roadmap | Sprint atual | Bloco |
|---|---|---|---|---|
| PDV | [`ROADMAP_PDV.md`](./ROADMAP_PDV.md) | ✅ vivo | nenhuma (próxima a planejar) | Bloco 9 ✅ |
| Operações/OS | [`ROADMAP_OPERACOES_OS.md`](./ROADMAP_OPERACOES_OS.md) | ✅ vivo | nenhuma (próxima a planejar) | Bloco 10 ✅ |
| Financeiro | [`ROADMAP_FINANCEIRO.md`](./ROADMAP_FINANCEIRO.md) | ✅ vivo | nenhuma | Bloco 11 ✅ |
| Estoque | [`ROADMAP_ESTOQUE.md`](./ROADMAP_ESTOQUE.md) | ✅ vivo | nenhuma | Bloco 12 ✅ |
| Marketplace | [`ROADMAP_MARKETPLACE.md`](./ROADMAP_MARKETPLACE.md) | ✅ vivo (greenfield) | nenhuma | Bloco 13 ✅ |
| CRM | [`ROADMAP_CRM.md`](./ROADMAP_CRM.md) | ✅ vivo | nenhuma | Bloco 14 ✅ |
| WhatsApp | [`ROADMAP_WHATSAPP.md`](./ROADMAP_WHATSAPP.md) | ✅ vivo | nenhuma | Bloco 15 ✅ |
| Marketing IA | [`ROADMAP_MARKETING_IA.md`](./ROADMAP_MARKETING_IA.md) | ✅ vivo | nenhuma | Bloco 16 ✅ |
| Omni Agent | [`ROADMAP_OMNI_AGENT.md`](./ROADMAP_OMNI_AGENT.md) | ✅ vivo | nenhuma | Bloco 17 ✅ |
| BI | [`ROADMAP_BI.md`](./ROADMAP_BI.md) | ✅ vivo | nenhuma | Bloco 18 ✅ |
| Multi-loja | [`ROADMAP_MULTI_LOJA.md`](./ROADMAP_MULTI_LOJA.md) | ✅ vivo | nenhuma | Bloco 19 ✅ |

Quando cada roadmap for criado, esta tabela é atualizada (status `✅ vivo` + link para sprint atual).

---

## 7. Como evoluir um roadmap

```bash
# 1. Abrir o ROADMAP_<HUB>.md
# 2. Reler:
#    - CURRENT_STATUS.md (estado real)
#    - últimos ADRs do HUB
#    - última auditoria do HUB
#    - SPRINT em execução (se houver)
# 3. Atualizar as seções afetadas (mínimo: gaps, backlog, sprint atual, last_update)
# 4. Se a visão ou ordem das fases mudou → criar ADR e referenciar
# 5. Commit: docs(roadmap): <HUB> · <o que mudou>
```

**Quem atualiza:** geralmente Opus (visão, fases, dependências) ou Sonnet (gaps técnicos, backlog).
**Frequência mínima:** a cada encerramento de sprint do HUB.

---

## 8. Relação com outros documentos

| Documento | Relação |
|---|---|
| `docs/governance/BLUEPRINT_GOVERNANCA.md` | Define que este índice existe (Bloco 8) e os 11 ROADMAPs (Blocos 9–19) |
| `docs/governance/SPRINT_PROTOCOL.md` | Sprint só nasce de item de roadmap |
| `docs/governance/AUDIT_PROTOCOL.md` | Auditoria atualiza gaps e riscos do roadmap |
| `docs/decisions/INDEX.md` | Mudança de visão de HUB → ADR + link no roadmap |
| `docs/ai/CURRENT_STATUS.md` | Estado real consultado para preencher "Gaps atuais" e "Status atual" |
| `docs/blueprint/MASTER_PLAN.md` (Bloco 24) | Visão consolidada — alimenta as visões individuais |

---

## 9. Anti-padrões em roadmaps

- Roadmap virar lista de tarefas com prazo apertado → vira sprint disfarçada, perde valor estratégico.
- Roadmap sem `last_update` → ninguém sabe se ainda é verdade.
- "Funcionalidades futuras" sem priorização → vira lista de desejos.
- Gaps copiados do desejo, não do real → desalinha com `CURRENT_STATUS.md`.
- Roadmap de HUB X mencionando trabalho do HUB Y sem usar a seção "Dependências" → atravessa governança.
- Mudar a visão do HUB sem ADR → decisão importante perdida.
- Múltiplas versões do mesmo roadmap (`ROADMAP_PDV_v2.md`) → o git é o versionador.

---

## 10. Fonte da verdade

- **Índice dos roadmaps + convenções + ordem ideal + matriz de paralelismo** → este arquivo.
- **Estrutura obrigatória de cada roadmap** → este arquivo §2.2.
- **Vocabulário oficial dos HUBs** → este arquivo §5.
- **Conteúdo de cada HUB** → o respectivo `ROADMAP_<HUB>.md`.
