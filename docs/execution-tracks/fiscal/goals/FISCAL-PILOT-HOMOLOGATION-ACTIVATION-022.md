<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022",
  "track": "fiscal",
  "title": "Ativação controlada e provisionamento da loja-piloto em homologação (NFC-e modelo 65, SEFAZ-SP, Matriz RafaCell)",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/fiscal-022-pilot-homologation-activation",
  "worktree": "C:/Projetos/omni-gestao-fiscal-022-pilot-homologation-activation",
  "test_command": "npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery",
  "allowlist": [
    "lib/fiscal/**",
    "app/api/fiscal/**",
    "app/api/internal/fiscal/**",
    "docs/fiscal/**",
    "docs/ai/CURRENT_STATUS.md",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 120,
  "plan_ref": "FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001",
  "plan_rev": 1,
  "familia_executor": "codex",
  "revisao_independente": true,
  "reversibilidade": "ativação estrita e isolada na loja-piloto (loja-1); reversível a qualquer momento via kill-switch fiscalEnabled=false; produção permanece estritamente proibida e desligada",
  "gates_extra": [
    {
      "id": "sefaz_homologacao",
      "status": "autorizado_g_f7",
      "dependencias": []
    },
    {
      "id": "production",
      "status": "bloqueado",
      "dependencias": []
    }
  ],
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "autorizacao": "Autorizo o gate humano G-F7 exclusivamente para a loja-piloto Matriz RafaCell Assistec (Store.id: loja-1, Taguaí/SP) no ambiente HOMOLOGACAO (tpAmb=2), mantendo Production estritamente OFF (FISCAL_OFF=true, G-F12 fechado). O GOAL 022 está autorizado a construir a ativação controlada e o provisionamento necessário da loja-piloto, com a garantia de que nenhuma emissão ou transmissão à SEFAZ deve ocorrer além dos limites explicitamente autorizados pelo GOAL 022.",
      "registrado_por": "Rafael Faria",
      "em": "2026-09-08T12:09:08-03:00"
    }
  }
}
-->

# FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022 — Ativação controlada e provisionamento da loja-piloto em homologação (NFC-e modelo 65, SEFAZ-SP, Matriz RafaCell)

- trilha: `fiscal`
- classe: C3 · status: READY
- plano: `FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001` (plan_rev 1)
- branch: `goal/fiscal-022-pilot-homologation-activation`
- worktree: `C:/Projetos/omni-gestao-fiscal-022-pilot-homologation-activation`
- teste: `npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery`
- risco: `ALTO`
- revisao_independente: `true`

## 1. Autorização e Governança do Gate G-F7

O gate humano **G-F7** foi aprovado formal e expressamente por Rafael Faria em 2026-09-08 com o seguinte texto autorizativo:

> *"Autorizo o gate humano G-F7 exclusivamente para a loja-piloto Matriz RafaCell Assistec (Store.id: loja-1, Taguaí/SP) no ambiente HOMOLOGACAO (tpAmb=2), mantendo Production estritamente OFF (FISCAL_OFF=true, G-F12 fechado). O GOAL 022 está autorizado a construir a ativação controlada e o provisionamento necessário da loja-piloto, com a garantia de que nenhuma emissão ou transmissão à SEFAZ deve ocorrer além dos limites explicitamente autorizados pelo GOAL 022."*

## 2. Escopo Técnico do GOAL 022

1. **Construção da Ativação Controlada da Loja-Piloto**:
   - Conectar o wiring canônico existente (`lib/fiscal/homologation/nfce-homologation-pilot-wiring.ts`) ao ciclo operacional da loja-piloto.
   - Restrição rígida de unicidade: `PILOT_STORE_COUNT=1` (`Store.id = "loja-1"`, Matriz RafaCell Assistec, Taguaí/SP). Nenhuma outra unidade pode ser ativada.
   - Ambiente estrito: `HOMOLOGACAO` (`tpAmb=2`).

2. **Provisionamento e Conformidade de Segredos**:
   - Tratamento e consumo do secret administrativo `FISCAL_QUEUE_INTERNAL_SECRET` nas rotas internas `/api/internal/fiscal/queue` e `/api/internal/fiscal/observability`.
   - Vinculação do CSC/idToken de homologação da SEFAZ-SP por referência segura (`cscTokenRef`, cofre isolado).

3. **Garantias Operacionais e Restrições de Transmissão**:
   - `MAX_DOCUMENT_TRANSMISSIONS = 1`: Teto estrito de no máximo 1 documento teste de homologação por acionamento.
   - `MAX_RETRIES_PER_FAILURE = 0`: Proibição absoluta de retries cegos ou loops automáticos (conforme G-H6).
   - `KILL_SWITCH`: Preservação e teste da capacidade de corte imediato por loja via `fiscalEnabled = false` ou pausa da fila (`pauseStoreForThrottling`).
   - `ROLLBACK_TRIGGER`: Qualquer resposta HTTP !== 200, cStat não modelado, cStat 656, falha de XMLDSig/mTLS ou erro 5xx aciona fail-closed imediato.
   - Preservação da ordem de persistência: Venda commitada antes do enfileiramento fiscal; PDV nunca bloqueado por falha fiscal.

4. **Produção Bloqueada**:
   - `G-F12`: Mantido estritamente `CLOSED`.
   - `PRODUCTION = false`: Nenhuma chamada de produção (`tpAmb=1`), nenhum endpoint de produção e nenhuma credencial de produção permitidos.

## 3. Allowlist da Trilha de Execução

```
lib/fiscal/**
app/api/fiscal/**
app/api/internal/fiscal/**
docs/fiscal/**
docs/ai/CURRENT_STATUS.md
docs/ai-execution/_evidence/**
```

## 4. Critério de Pronto (Definition of Done)

1. Ativação controlada construída e restrita exclusivamente à `loja-1` em ambiente `HOMOLOGACAO`.
2. Fila, produtor pós-commit, executor de estado incerto e provider `SEFAZ_DIRETO` integrados sob o wiring canônico do piloto.
3. Tratamento seguro do `FISCAL_QUEUE_INTERNAL_SECRET` sem vazamento de segredos em logs ou respostas.
4. Tetos de transmissão (máx. 1 documento) e fail-closed com zero retry automático comprovados por testes.
5. Kill-switch testado e funcional.
6. Suíte de testes `npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery` 100% verde.
7. Evidência técnica de fechamento e relatório de auditoria do GOAL 022 documentados.
