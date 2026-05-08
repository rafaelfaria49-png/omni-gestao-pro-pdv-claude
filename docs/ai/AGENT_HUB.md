# Omni Agent HUB — Visão geral (mock)

## Resumo

O **Omni Agent HUB** é a central de IA operacional do OmniGestão Pro: um conjunto de telas, fluxos e automações para capturar solicitações, interpretar intenções e acionar rotinas internas do produto (ainda em modo **mock visual premium** em várias áreas).

## Componentes / áreas (alto nível)

- **Central IA operacional**: ponto de entrada para comandos, recomendações e diagnósticos.
- **NLP (mock)**: parsing/extração de intenções e entidades (ex.: financeiro, OS, clientes).
- **Inbox IA**: caixa de entrada para tarefas e eventos a serem processados pela IA (triagem e ação sugerida).
- **WhatsApp Agent**: automações e atendimento via WhatsApp (hub dedicado + engine de simulação).
- **Automações**: regras que reagem a eventos internos (ex.: gatilhos operacionais/financeiros).
- **Memória do cliente**: armazenamento/consulta de contexto por cliente (visão de 360°).
- **Relatórios IA**: insights e painéis de recomendações com base em sinais do sistema.
- **Configurações**: ajustes de comportamento, limites, permissões e critérios (mock/placeholder).

## Estado atual

- **Status**: mock visual premium em partes relevantes (UI e fluxos demonstrativos).
- **Integração real**: parcial/heterogênea, variando por módulo (WhatsApp/OS/Financeiro).

## Próximo passo (futuro)

- Integrar de forma consistente com os módulos reais (Operações, Financeiro, Vendas, Estoque):
  - eventos de domínio padronizados
  - execução de ações com auditoria
  - persistência e observabilidade (log/telemetria)

