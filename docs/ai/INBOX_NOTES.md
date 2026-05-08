# Inbox Notes — IA / Desenvolvimento

> Use este arquivo para colar notas soltas, rascunhos, logs e ideias a classificar depois.


---
## Importado de docs/Untitled (2026-05-07)

# OMNIGESTÃO PRO — RELATÓRIO MASTER DO PROJETO

## VISÃO GERAL DO PROJETO

O projeto OmniGestão Pro está sendo desenvolvido como um SaaS/ERP omnichannel premium brasileiro com IA integrada.

Objetivo:
Criar um dos sistemas mais completos do Brasil para:

* gestão financeira
* ordens de serviço
* PDV
* estoque
* marketplace
* CRM
* automações WhatsApp
* IA operacional
* gestão multi-loja
* marketing IA
* automação empresarial

Stack principal:

* Next.js
* Prisma
* Supabase
* Tailwind
* arquitetura modular
* temas globais por tokens
* IA integrada
* frontend premium estilo SaaS enterprise

IMPORTANTE:
Todo o desenvolvimento deve:

* manter arquitetura limpa
* evitar acoplamento
* evitar duplicação de lógica
* funcionar modularmente
* permitir ativação/desativação de módulos
* suportar multi-loja
* suportar multi-usuário
* suportar automações futuras

---

# PADRÃO VISUAL DEFINIDO

Sistema visual inspirado em:

* SaaS premium
* Notion
* Stripe
* Linear
* ClickUp
* ERP moderno

Regras:

* usar tokens globais
* NÃO usar cores fixas hardcoded
* usar:

  * bg-background
  * bg-card
  * text-foreground
  * border-border
  * text-muted-foreground

Temas oficiais:

* Light
* Soft Ice
* Midnight
* Black Edition

PDV:

* preferencialmente Midnight ou Black Edition

Padrão de containers:
mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10

Tipografia:

* Inter
* system-ui

---

# MÓDULOS JÁ CRIADOS / EM CRIAÇÃO

## FINANCEIRO HUB

Status:
Em criação avançada dentro do Lovable.

Abas:

* visão geral
* contas a receber
* contas a pagar
* fluxo de caixa
* carteiras
* relatórios
* configurações

Já implementado visualmente:

* temas
* cards
* tabelas
* modais
* navegação
* responsividade

Ainda mockado:

* backend
* banco
* Prisma
* integrações reais

---

## CONTAS A RECEBER

Necessário:

* botão receber conta
* baixa parcial
* histórico
* recibo
* renegociação
* estorno
* parcelamento completo
* múltiplas formas de recebimento
* cálculo automático visual

Fluxo desejado:

* receber parcial
* manter saldo restante
* gerar histórico
* emitir recibo
* permitir renegociar

---

## CONTAS A PAGAR

Necessário:

* pagamento parcial
* histórico de pagamentos
* recorrência
* parcelamento
* comprovantes
* despesas fixas
* fornecedores
* anexos

---

## CARTEIRAS

Tipos:

* caixa
* banco
* dinheiro
* cartão
* digital
* pessoal

Necessário:

* entrada
* saída
* transferência
* atualização visual mockada

---

## RELATÓRIOS

Criar:

* receita por origem
* despesa por categoria
* resultado por loja
* fluxo por carteira
* inadimplência
* lucro líquido
* recebimentos de OS
* recebimentos do PDV

---

## CONFIGURAÇÕES FINANCEIRAS

Necessário:

* categorias financeiras
* formas de pagamento
* carteira padrão
* multa/juros
* texto padrão recibo
* integração PDV
* integração OS
* permissões

---

# MÓDULO DE ORDENS DE SERVIÇO (OS)

Já implementado:

* orçamento persistido em JsonB
* timeline
* aprovação/recusa
* garantia
* faturamento pendente
* eventos financeiros

Payload atual persistido:

* status
* servicos
* pecas
* desconto
* total
* observacao
* atualizadoEm
* enviadoEm
* respondidoEm
* validoAte

Eventos:

* orcamento_aprovado
* orcamento_recusado
* faturamento_os_pendente
* faturamento_os_cancelado

Helpers:

* isFaturamentoOS
* buildFaturamentoFromOrcamento
* buildFaturamentoRecusadoOrcamento

Build OK:

* npx tsc --noEmit
* next build --webpack

---

# IDEIA PRINCIPAL DO SISTEMA

O grande diferencial do OmniGestão Pro será:

## IA OPERACIONAL NATURAL

Usuário fala:
“Troca de tela Samsung A05.
Cliente João.
Tela quebrada.
Custo 100.
Cobrar 280.”

Sistema automaticamente:

* cria OS
* detecta aparelho
* cria cliente
* adiciona peças
* cria orçamento
* gera recebimento
* integra financeiro
* integra estoque
* integra WhatsApp
* cria timeline

Tudo via:

* texto
* voz
* WhatsApp

---

# IDEIA FUTURA — CADASTRO IA DE PRODUTOS

IDEIA MUITO IMPORTANTE.

Fluxo:
Usuário tira foto do produto.

Sistema:

* reconhece produto
* lê código de barras
* identifica categoria
* gera nome
* gera descrição
* gera SKU
* sugere preço
* sugere margem
* cria tributação
* busca imagens melhores
* cria estoque
* cadastra automaticamente

Usuário pode falar:
“Comprei 10 unidades por 10 reais e vou vender por 25.”

Sistema:

* entende
* calcula margem
* salva estoque
* cria produto

Isso será um dos maiores diferenciais do sistema.

---

# IMPORTAÇÃO XML

Necessário implementar futuramente:

* importação XML NF-e
* entrada automática de estoque
* fornecedores automáticos
* custos automáticos
* impostos automáticos
* contas a pagar automáticas

Fluxo:
Usuário joga XML.
Sistema:

* lê nota
* cria produtos
* cria fornecedor
* cria estoque
* cria financeiro

---

# WHATSAPP IA

Objetivo:
Sistema inteiro controlável via WhatsApp.

Exemplos:

* criar OS
* consultar OS
* registrar venda
* consultar saldo
* lançar despesa
* emitir relatório
* criar lembrete
* consultar estoque

Tudo por linguagem natural.

---

# REGRAS IMPORTANTES DE ARQUITETURA

NÃO misturar:

* lógica financeira
* lógica de OS
* lógica de estoque

Tudo deve se comunicar via:

* eventos
* payloads
* módulos desacoplados

Estratégia correta:
OS -> gera evento -> financeiro consome
PDV -> gera evento -> estoque consome
Financeiro -> gera evento -> relatórios consomem

Isso evita:

* bugs
* duplicação
* conflitos
* inconsistências

---

# O QUE FALTA NO SISTEMA

Ainda faltará futuramente:

## Financeiro real

* backend
* Prisma
* persistência
* auditoria
* conciliação

## IA real

* OCR
* visão computacional
* reconhecimento de produto
* NLP
* voz

## Integrações

* WhatsApp Cloud API
* Mercado Livre
* Shopee
* NFe
* PIX
* bancos
* gateways

## PDV avançado

* TEF
* SAT
* NFC-e
* impressão
* comandas

## CRM

* funil
* automações
* campanhas

## Marketing IA

* geração automática
* calendário
* agendamento
* analytics

---

# ESTRATÉGIA ATUAL

Estratégia correta definida:

1. Criar visual premium completo no Lovable
2. Validar UX/UI
3. Ajustar fluxos
4. Integrar ao projeto principal
5. Criar backend real
6. Criar eventos desacoplados
7. Integrar IA
8. Escalar módulos

---

# TAREFAS PRIORITÁRIAS AGORA

PRIORIDADE MÁXIMA:

* finalizar Financeiro HUB no Lovable
* fazer todos os botões funcionarem visualmente
* completar modais
* completar fluxo visual
* deixar aparência SaaS premium

DEPOIS:

* integrar no OmniGestão principal
* conectar backend real
* integrar eventos financeiros
* integrar OS
* integrar PDV

---

# COMO CONTINUAR EM NOVA CONVERSA

Cole este relatório completo.

Depois diga:
“Continuar desenvolvimento do OmniGestão Pro a partir deste relatório.”

OU:
“Continuar Financeiro HUB.”

OU:
“Continuar módulo OS.”

---

# COMANDO PARA O CURSOR GERAR RELATÓRIO FUTURO

Quando quiser gerar novo resumo no Cursor/ChatGPT, use:

“Gere um relatório MASTER atualizado do projeto OmniGestão Pro contendo:

* arquitetura atual
* módulos criados
* funcionalidades prontas
* payloads
* integrações
* ideias futuras
* regras visuais
* tarefas pendentes
* próximos passos
* estado atual do backend
* estado atual do frontend
* decisões técnicas importantes”

Isso mantém continuidade sem travar conversa.


---
## Importado de docs/ai/Untitled (2026-05-07)

# 🚀 OMNIGESTÃO PRO - MASTER CONTEXT & STATUS

## 1. VISÃO GERAL DO PRODUTO (O QUE É O SISTEMA)
O OmniGestão Pro é um SaaS/ERP Enterprise Omnichannel focado em gestão de múltiplas lojas com Inteligência Artificial embutida no fluxo de trabalho.
**Diferenciais de Mercado:**
- **Sistema Multi-tenant:** Controle de várias unidades (lojas) isoladas por CNPJ.
- **Hub de Marketing IA:** Geração de campanhas automáticas com preview de celular em tempo real (State Lifting).
- **IA Mestre:** Chatbot centralizado para consultoria de negócios e auxílio operacional.
- **Marketplace Hub:** Gestão centralizada de pedidos, SAC e conexões com plataformas de venda (ex: Mercado Livre, Shopee).
- **Design System Premium:** 4 temas dinâmicos (Light, Soft Ice, Midnight, Black Edition) utilizando tecnologia OKLCH para precisão de cores.

---

## 2. REGRAS DE NEGÓCIO E MONETIZAÇÃO DA IA (PROTEÇÃO DE CAIXA)
O sistema opera com um modelo de "Créditos Ponderados" para evitar prejuízos no Plano Diamante (7.000 créditos).
- **Retenção (Grátis / Custo Zero):** Interações de texto (Chat, Sugestões, Diagnóstico em OS). NÃO devem consumir créditos brutos do usuário.
- **Monetização (Consumo de Créditos):** Mídia pesada.
  - Imagem (Ex: 15-30 créditos).
  - Voz (Ex: 30-80 créditos).
  - Vídeo (Ex: 300-1000 créditos) -> Requer limite diário restrito para evitar falência por abuso de API.
- **Atualização Automática:** O saldo é atualizado na UI via evento global `credit-balance-updated` assim que a mídia é gerada.

---

## 3. PROTOCOLO DE DESENVOLVIMENTO (CURSOR E TOKENS)
Para evitar o consumo massivo de tokens e custos elevados nas APIs (OpenRouter/OpenAI), o desenvolvimento deve seguir estas regras estritas:
1. **Limpeza de Contexto:** SEMPRE fechar as abas (tabs) no topo do Cursor que não estão sendo editadas. O Modo Agent envia todos os arquivos abertos, o que drena os tokens (Evitar envio de >100k tokens por request).
2. **Modelo Padrão (Trabalho Braçal):** Usar `openai/gpt-4o-mini` (via OpenRouter) para Modo Agent, pois é 50x mais barato e altamente eficiente para loops de correção.
3. **Modelo Arquiteto (Código Complexo):** Usar `anthropic/claude-3.5-sonnet` apenas para estruturas complexas, UI avançada ou quando o Agent travar.
4. **Ignorar Pastas:** Garantir que pastas como `.next` e arquivos de imagem não sejam lidos pelo Cursor.

---

## 4. STATUS ATUAL E PRÓXIMOS PASSOS (FASE 1)
**O que já está pronto:**
- Landing Page isolada (sem conflitos de CSS com o Dashboard).
- UI do Marketing IA com preview em tempo real.
- Layout do Hub de Marketplace copiado do Lovable para `components/marketplace/lovable/`.
- Sistema de controle de histórico de créditos e atualização de saldo no frontend.

**Próximo Foco Imediato (Ação Atual):**
👉 Integrar definitivamente o HUB de Marketplace na rota `/dashboard/marketplace` e começar a substituir os dados falsos (mocks) e o `localStorage` por conexões reais com o banco de dados (Prisma).
