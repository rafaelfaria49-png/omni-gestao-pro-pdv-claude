# Omni Agent HUB — Visão geral

## Resumo

O **Omni Agent HUB** é a central de IA operacional do OmniGestão Pro: comandos em linguagem natural, interpretação determinística (sem LLM autónomo nesta fase), execução controlada com permissões enterprise e trilha persistida na base de dados.

## Omni Agent HUB Real — Fase 1 (estado)

### O que já existia (antes da Fase 1)

- **UI premium** em `components/omni-agent/OmniAgentHub.tsx`: visão geral, inbox simulada em memória, WhatsApp simulado, catálogo de comandos de exemplo, automações em memória, memória de cliente mock, relatórios mock, configurações em `localStorage`.
- **Parser mock** local: função `interpret()` com regex para demonstração (Financeiro, Vendas, OS, etc.) sem persistência.
- **Event bus**: não havia bus de domínio global; apenas estado React + `localStorage` e `logAudit` local.

### O que é mock (mantido na Fase 1)

- Abas **Visão Geral** (gráficos/sugestões sintéticas), **WhatsApp Agent**, **Automações**, **Memória Cliente**, **Relatórios IA** (respostas aleatórias), **Configurações** (toggles locais).
- **Feed** de “comandos recentes” com `SAMPLE_CMDS` e botão **Simular** (continuação demonstrativa).
- Função legacy `interpret()` ainda usada por essas abas de demonstração.

### Fase 3 (substituir mocks visuais)

- **WhatsApp Agent**: sem conversas fictícias; estado Cloud API via env (`getOmniAgentWhatsAppCloudStatus`); simulação chama `submitOmniAgentCommand` com `canal: "whatsapp"`. Lista Meta/HUB aponta para o WhatsApp HUB real.
- **Automações**: modelos `OmniAgentAutomation` + `OmniAgentAutomationRun`; UI lista/cria/edita/ativa/remove; disparo via `handleEvent` → `handleOmniAgentSystemEvents` cria `OmniAgentCommand` **PENDENTE** (Inbox). Gatilhos: `venda_finalizada` (PDV), `os_entregue` ← `os_finalizada` emitido em `updateOSStatus` (Operações V2 Server Actions; API legada PATCH desativada). **`conta_receber_vencida`**: evento na API, **sem emissor automático** (vencimento é derivado na leitura — sem cron nesta fase).
- **Canal no comando**: `texto_interno` | `whatsapp` | `voz` persistido em `OmniAgentCommand.canal` (modal Novo comando); `voz` não altera interpretador — fallback seguro para `texto_interno` se valor inválido.
- **Memória Cliente**: `listClientes` (cadastro real); timeline IA declarada como não ativa; notas locais etiquetadas (`localStorage`).
- **Relatórios IA**: KPIs/gráfico mock removidos; `getOmniAgentReportsSnapshot` (stats Prisma, contagens por intenção, resumo financeiro quando permitido); pergunta envia comando real (`texto_interno` + `run`).
- **Configurações**: bloco explícito “localStorage”; voz desativada com badge; teste de config mostra `interpretOmniAgentCommand`; export com descarga JSON.
- **Interpretador**: frases comuns (faturamento hoje, vendi/gastei/entrada estoque, OS Moto G); fallback não mapeado → `REMINDER_CREATE` de triagem (confirmação na inbox) em vez de `UNKNOWN` seco.

### O que passou a ser real (Fase 1)

| Peça | Ficheiros / notas |
|------|---------------------|
| Modelo Prisma | `OmniAgentCommand` (`omni_agent_commands`): `storeId`, `canal`, `comandoOriginal`, `interpretacao` (JSON), `status`, `resultado`, `executadoEm`, `createdAt`. |
| Interpretador real | `lib/omni-agent/interpret.ts` — intenções: `OS_OPEN`, `CLIENT_SEARCH`, `PRODUCT_SEARCH`, `REMINDER_CREATE`, `CASHBOX_QUERY`, `FINANCE_SUMMARY`, `UNKNOWN`. |
| Executor | `lib/omni-agent/executor.ts` — chama `createOS`, `listClientes`, `listProdutos`, Prisma `sessaoCaixa`, `getResumoExecutivo`, `logsAuditoria` (lembretes). |
| Server actions | `app/actions/omni-agent.ts` — `submitOmniAgentCommand`, `listOmniAgentCommands`, `confirmOmniAgentCommand`, `rejectOmniAgentCommand`; gating `requireEnterpriseWith` + `workspace.omniAgent` e por intenção. |
| Inbox real | `components/omni-agent/OmniAgentInboxReal.tsx` — filtros: pendente, aguardando confirmação, executado, erro; confirmação para escritas. |
| UI Hub | Aba **Inbox IA** usa a inbox real; modal **Novo** grava na API; badge **Fase 1 · real**. |

### Fluxo de segurança

- Leituras (`CLIENT_SEARCH`, `PRODUCT_SEARCH`, `CASHBOX_QUERY`, `FINANCE_SUMMARY`): ao **Executar** no modal, registo com estado **EXECUTADO** ou **ERRO** imediato.
- Escritas (`OS_OPEN`, `REMINDER_CREATE`): ao **Executar**, registo **AGUARDANDO_CONFIRMACAO**; só após botão **Confirmar** na inbox é que corre o executor (OS com cliente ambíguo: escolha explícita de cliente).
- **Inbox** (modal): cria **PENDENTE**; utilizador usa **Interpretar e executar** na lista.
- Auditoria: `logs_auditoria` com `OMNI_AGENT_EXEC_OK`, `OMNI_AGENT_EXEC_ERRO`, `OMNI_AGENT_LEMBRETE`.

### Permissões (matriz)

- Base: `workspace.omniAgent` (já alinhado com rota enterprise).
- Por intenção: ver `INTENT_MODULE` em `lib/omni-agent/types.ts` (Operações/Cadastros/Caixa/Financeiro view).

## Próximo passo (fases seguintes)

- LLM controlado com JSON schema e limites de ferramentas.
- Emissor server-side para `conta_receber_vencida` (cron ou serviço financeiro) sem alterar UI de contas nesta fase.
- Memória operacional por cliente (timeline unificada: PDV, OS, WhatsApp, financeiro).
- Voz e canais adicionais ligados a políticas no servidor (não só `localStorage`).
