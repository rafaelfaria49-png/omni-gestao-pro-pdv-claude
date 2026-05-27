---
title: Human Gates — onde o humano decide
status: vivo
owner: produto + arquitetura
last_update: 2026-05-27
bloco: 30
---

# ⛔ Human Gates — decisões que só o humano toma

> **Princípio fundador:** IA executa pequeno e governado. **Humano decide nas viradas.**
> Decisão fundadora #4 (aprovada 2026-05-27): humano **sempre** clica o merge final.

> Complementa: [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (pipeline) e [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) (limites mecânicos).

---

## 1. Os 2 gates do pipeline

| Gate | Fase | O que humano vê | O que humano decide |
|---|---|---|---|
| **GATE #1** | Fase 7 | Proposta da sprint + benchmark (se houve) | Aprovar / modificar / rejeitar a proposta |
| **GATE #2** | Fase 13 | Diff completo + auditoria pós-impl + testes verdes | Aprovar merge / pedir ajuste / rejeitar (rollback) |

> Nenhum outro ponto do pipeline exige humano. Tudo o mais é automatizado dentro dos safe-guards.

---

## 2. GATE #1 — Aprovação da proposta

### 2.1 O que disparou
Fase 6 (PROPOSAL) gerou `docs/sprints/proposals/SPRINT_<ticket_id>.md`.

### 2.2 O que humano vê
- A proposta inteira (escopo dentro/fora, DoD, plano por checkpoint, allow-list, riscos, ADR sugerido).
- Benchmark (se feature nova / arq nova / fluxo novo / integração nova / módulo novo).
- Contexto cruzado: roadmap §gaps, status vivos relevantes.

### 2.3 Opções

| Opção | Como sinalizar | Efeito |
|---|---|---|
| **Aprovar** | Editar `SPRINT_<ticket>.md` adicionando `approved_by: <nome>` + `approved_at: <ISO>` | Engine prossegue para Fase 8 |
| **Modificar** | Editar a proposta diretamente + adicionar `requires_v2: true` | Engine gera v2 e re-submete |
| **Rejeitar** | Adicionar `rejected_by: <nome>` + `rejected_reason: <motivo>` | ABORT + libera lock + ticket marcado `rejected` |
| **Pausar** | Não fazer nada | Lock mantém heartbeat; aguarda indefinido |

### 2.4 Critérios pelos quais humano costuma rejeitar
- Escopo aberto demais (sem item de roadmap claro)
- Allow-list ampla demais ("toca lib/ inteira" → não)
- Falta ADR para decisão arquitetural óbvia
- Tamanho subestimado
- Benchmark superficial (não cobre concorrentes-chave)
- Risco P0 sem mitigação proposta
- Multi-loja sem isolamento explícito

### 2.5 Em modo OVERNIGHT
- Este gate é **substituído** pela aprovação prévia da fila em `OVERNIGHT_QUEUE.md`.
- **Apenas skills S** em HUBs **verdes** podem se beneficiar dessa substituição.
- Tudo M/L/XL exige gate ao vivo independentemente do modo.

---

## 3. GATE #2 — Aprovação para merge

### 3.1 O que disparou
Fase 11 (POST-TESTS) verde + Fase 12 (AUDIT) sem P0.

### 3.2 O que humano vê

```
SPRINT_<ticket_id>.md (proposta aprovada)
├── BENCHMARK_<ticket_id>.md (se houve)
├── AUDIT_<ticket_id>.md (findings P0-P3 da sprint)
├── Diff completo da branch skill/<ticket_id>
├── Resultado dos testes (tsc, build, vitest)
└── Doc updates pendentes (CURRENT_STATUS, ROADMAP, status vivos)
```

### 3.3 Opções

| Opção | Como sinalizar | Efeito |
|---|---|---|
| **Aprovar merge** | Editar `SPRINT_<ticket>.md` com `merge_approved_by: <nome>` + `merge_approved_at: <ISO>` + comando `merge` | Engine roda Fases 14–17 (doc update, ADR, handoff, lock release) **mas humano clica o merge no PR/CLI**. Decisão fundadora #4. |
| **Pedir ajuste** | Comentar no PR/proposta com `requires_change: <descrição>` | Engine volta para Fase 10 com o feedback; pode pedir aprovação re-rodada |
| **Rejeitar** | `rejected_at_merge: <nome>` + `rejected_reason: <motivo>` | ROLLBACK + lock release + ticket `rejected` |
| **Pausar** | Não fazer nada | Lock mantém heartbeat; aguarda |

### 3.4 Critérios pelos quais humano costuma rejeitar no merge
- AUDIT pegou P1 fiscal/dinheiro/multi-loja (vira P0 automaticamente; mas humano pode pegar antes)
- Mudança em path que não estava na allow-list aprovada (engine deveria ter barrado; auditoria adicional)
- Teste novo sem cobertura significativa
- DoD da proposta não foi cumprida 100%
- Documentação updates incompletos
- Sente que não está pronto (gut call humano sempre vale)

### 3.5 Em modo OVERNIGHT
- Gate #2 **para o pipeline**. Engine cria PR draft com toda evidência (diff + AUDIT + benchmark).
- Notificação WhatsApp + entrada em log (decisão fundadora #3).
- Engine **não mergeia em overnight, nunca** (decisão fundadora #4).
- Humano de dia revisa, aprova ou rejeita.

---

## 4. Gates extras (fora do pipeline padrão)

Casos em que humano é chamado mesmo sem ser Gate #1 ou #2:

| Situação | Gate extra |
|---|---|
| Skill tenta tocar área protegida sem flag | ABORT + humano só para autorizar próxima tentativa com flag |
| Diff > 500 linhas | PAUSE + humano decide dividir ou continuar |
| Arquivo deletado (> 3 arquivos) | PAUSE + humano valida |
| Lock expirou em meio à execução | Próxima IA pede humano para confirmar retomada |
| Sprint piloto (SPRINT_01_*) | Cada fase é confirmada com humano ao vivo (modo extra-conservador) |
| ADR proposto pela IA | Humano sempre aprova o ADR antes da skill avançar |
| Skill marketing/WhatsApp em massa | Dry-run obrigatório + humano confirma envio real |
| Mudança em allow-list de skill existente | Humano aprova nova versão da skill |
| Force-release de lock | Humano executa, não IA |
| Cancelamento de ticket | Humano executa |

---

## 5. Como humano sinaliza decisão (formato)

### 5.1 Aprovação no Gate #1 (edição inline no SPRINT_<ticket>.md)
```yaml
---
title: SPRINT_<ticket_id> · <título>
...
approved_by: Rafael
approved_at: 2026-05-28T08:15:00-03:00
approval_notes: "Allow-list ok. Riscos cobertos. Seguir."
---
```

### 5.2 Modificação no Gate #1
```yaml
requires_v2: true
v2_notes: "Reduzir allow-list. Não tocar contracts/."
```

### 5.3 Rejeição
```yaml
rejected_by: Rafael
rejected_at: 2026-05-28T08:18:00-03:00
rejected_reason: "Escopo grande demais. Quebrar em 2 sprints."
```

### 5.4 Aprovação no Gate #2
```yaml
merge_approved_by: Rafael
merge_approved_at: 2026-05-28T11:55:00-03:00
merge_clicked_at: 2026-05-28T11:57:00-03:00
merge_notes: "Auditoria limpa. Docs atualizadas. Merge feito."
```

### 5.5 Ajuste solicitado no Gate #2
```yaml
requires_change_at: 2026-05-28T11:55:00-03:00
requires_change:
  - "Adicionar teste para edge case X"
  - "Atualizar ROADMAP §11 com sprint encerrada"
```

---

## 6. SLA dos gates (referência)

> Humano não tem obrigação contratual, mas estes são alvos de saúde do sistema:

| Gate | SLA alvo | Após SLA |
|---|---|---|
| GATE #1 ao vivo | < 1h | nada acontece; lock mantém heartbeat |
| GATE #1 overnight (substituído por fila) | sem SLA (fila preenche-se de dia) | — |
| GATE #2 ao vivo | < 30 min | nada acontece; lock mantém heartbeat |
| GATE #2 overnight (PR draft espera humano de dia) | 48h | PR draft fecha automaticamente; ticket marcado `expired_waiting_review` |

### 6.1 Quando gate fica preso > SLA
- Lock continua até TTL (4h).
- Após TTL sem heartbeat humano, lock libera (próxima IA pode tomar HUB).
- Ticket fica pendente até humano agir explicitamente.

---

## 7. Casos especiais: sprint piloto (SPRINT_01_*)

Para a **sprint piloto** (decisão fundadora #7 = `SPRINT_01_MULTI_LOJA`), o regime é **extra-conservador**:

| Diferença | Detalhe |
|---|---|
| Gates extras | Humano confirma a cada fase, não só nas Fases 7 e 13 |
| Tamanho | S apenas |
| Modo | Apenas SAFE |
| Auditoria | Auditoria adicional pós-merge (não só pós-impl) |
| Retro detalhada | Bloco 44 oficial dedicado |
| Documentação extra | Engine grava log mais verboso para análise |

Após sprint piloto encerrar com sucesso, regime normal entra em vigor para próximas sprints.

---

## 8. Quem é o "humano"?

> Não confundir: humano não é "qualquer um que tem acesso ao repo".

| Papel | Pode aprovar Gate #1? | Pode aprovar Gate #2? |
|---|---|---|
| Dono do projeto (Rafael) | sim | sim |
| Owner do HUB | sim (no HUB dele) | sim (no HUB dele) |
| Desenvolvedor sênior contratado | sim (após delegação explícita) | sim (após delegação) |
| Outras IAs | **não** (IAs não aprovam IAs) | **não** |
| Contributor externo | não | não |

Delegação de poder de aprovação para um humano novo → registrar em `docs/governance/SESSION_HANDOFF.md` ou ADR.

---

## 9. Auditoria dos gates

Engine registra em `EXECUTION_LOG.md`:

```yaml
gates:
  gate_1:
    approved_by: Rafael
    approved_at: 2026-05-28T08:15:00-03:00
    duration_pending: PT34M
    notes: "Allow-list ok"
  gate_2:
    approved_by: Rafael
    approved_at: 2026-05-28T11:55:00-03:00
    duration_pending: PT12M
    notes: "Auditoria limpa"
```

Análise periódica (mensal): tempo médio em cada gate, taxa de rejeição, motivos comuns. Insumo para retro do sistema.

---

## 10. Fonte da verdade

- **Gates obrigatórios:** este arquivo.
- **Pipeline:** [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md).
- **Limites mecânicos:** [`SAFE_GUARDS.md`](./SAFE_GUARDS.md).
- **Decisão fundadora "humano sempre clica merge":** [`INDEX.md §4`](./INDEX.md) item #4.
- **Áreas protegidas:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).
