# WhatsApp IA — Orçamentos & Catálogo · BLUEPRINT

> **Tipo:** Blueprint + Auditoria read-only + Arquitetura proposta
> **Fase:** F1 — Auditoria e desenho. **Nada é implementado nesta entrega.**
> **Data:** 14/06/2026 · **Modelo:** Opus 4.8 (Claude Code)
> **Escopo:** desenho da automação de **orçamentos, catálogo, estoque, fornecedores e
> atendimento assistido** via WhatsApp IA.
> **Status de execução:** ⛔ **Sem código.** Sem schema. Sem migration. Sem envio real.
> Documento sujeito a **Gate humano** antes de qualquer fase de implementação.

---

## 0. Resumo executivo

O OmniGestão Pro já possui **a maior parte da fundação** necessária para uma IA de
orçamentos e catálogo via WhatsApp — e ela está **real, não mockada**:

- **Canal WhatsApp Cloud API real** (envio texto/template/mídia + webhook inbound com HMAC,
  idempotência por `wamid`, roteamento multi-loja por `phone_number_id`).
- **Camada de IA assistida já existente**: análise de conversa via LLM (OpenRouter) com
  contexto de CRM (cliente, OS em aberto, vendas) + **heurística local de fallback**, que
  **gera sugestão de resposta para o operador revisar — nunca envia sozinha**. Isso é
  exatamente o modelo "assistido" pedido.
- **Catálogo real**: `Produto` (SKU, barcode, custo, preço, estoque, categoria, marca),
  `Servico` (custo, preço, margem, garantia, termos), `EquipamentoModelo` (peças compatíveis,
  defeitos comuns), `ProductMedia` (imagens) e `Fornecedor` (já inclui campo **`whatsapp`**).
- **Omni Agent real**: interpretador determinístico (intents) + executor com **confirmação
  humana obrigatória** e **gates de permissão (ACL)** por módulo, mais inbox auditável e
  motor de automações que **enfileira comando, não dispara ação perigosa sozinho**.

**O que falta** é, em essência, **colar essas peças num fluxo orientado ao cliente final**:
um classificador de intenção do **inbound** (hoje o webhook só persiste a mensagem, não a
classifica), um **motor de orçamento de assistência** que combine peça + mão de obra + margem,
um **modelo de cotação a fornecedor** (o `Fornecedor` existe; falta `Cotacao`), e uma
**máquina de estados de sugestão** (recebido → interpretado → sugestão → aprovação → enviado).

**Diagnóstico de prontidão:** ~**60–65%** da fundação já existe e é reutilizável. O caminho
recomendado é **assistido-primeiro** (operador aprova tudo), respeitando as premissas de
estoque em saneamento e LGPD/multi-loja.

> ⚠️ **Premissa-guarda:** enquanto **estoque e catálogo estiverem em saneamento e o Inventário
> Assistido não estiver homologado em loja**, a IA **não pode prometer disponibilidade** nem
> preço como verdade absoluta — toda sugestão é rascunho para o humano.

---

## 1. Diagnóstico do estado atual (auditoria read-only)

Legenda: 🟢 real/funcional · 🟡 parcial/híbrido · 🔵 existe mas não conectado a este fluxo ·
🔴 inexistente (a propor).

### 1.1 WhatsApp HUB — 🟢 real

| Item | Estado | Evidência |
|------|--------|-----------|
| Rota UI | 🟢 | `/dashboard/whatsapp` (`app/dashboard/whatsapp/page.tsx`, Lovable isolado) |
| Cliente Cloud API | 🟢 | `lib/whatsapp.ts` — `sendTextMessage`/`sendTemplateMessage`/`sendMediaMessage` (Graph v21.0) |
| Envio gravado | 🟢 | `POST /api/whatsapp/send` + Server Actions `app/actions/whatsapp.ts` (`sendWhatsAppTextAction`, `sendWhatsAppTemplateAction`, `sendWhatsAppMediaAction`, `sendWhatsAppTextFromRequestContext`) |
| Serviço de domínio | 🟢 | `lib/whatsapp/whatsapp-service.ts` — `sendCloudApiTextAndRecord`, `findOrCreateOpenConversation`, `createOrUpdateContact`, `resolveStoreIdByPhoneNumberId`, `logWebhookPayload` |
| Webhook inbound | 🟢 | `app/api/webhooks/whatsapp/route.ts` (GET handshake + POST) + `lib/whatsapp-meta-cloud-webhook.ts` |
| HMAC | 🟢 | `lib/whatsapp/webhook-hmac-policy.ts` (`evaluateMetaWebhookSignature`) — `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` |
| Idempotência inbound | 🟢 | dedupe por `externalMessageId` (`wamid`) antes de gravar; `after()` assíncrono |
| Multi-loja routing | 🟢 | `resolveStoreIdByPhoneNumberId` → `WhatsAppPhoneNumber`; número não mapeado é **descartado e auditado** (sem fallback loja-1, ADR-0006) |
| Templates | 🟢 | `sendWhatsAppTemplateAction` (envio de template Meta) |
| Inbox/conversas | 🟢 | modelos `WhatsAppConversation`/`WhatsAppMessage`/`WhatsAppContact`; `humanMode`, `unreadCount`, `clienteId` (vínculo CRM) |
| Etiquetas | 🟢 | `WhatsAppEtiqueta` + `WhatsAppConversacaoEtiqueta` |
| Automações (keyword/evento) | 🟡 | `WhatsAppAutomation` + `automation-engine`; eventos de sistema **simulados** (`runAutomationSimulation`) |
| **Auto-resposta ao inbound** | 🔵 **ausente por design** | `processMetaWhatsAppWebhookPayload` **só persiste** — não classifica, não responde. **Bom** para a fase assistida. |
| Env vars | 🟢 | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_API_VERSION` (token por loja via `WhatsAppPhoneNumber.tokenEnvKey`) |

### 1.2 Camada de IA do WhatsApp (já existe!) — 🟢 assistida

| Item | Estado | Evidência |
|------|--------|-----------|
| Análise de conversa (LLM) | 🟢 | `lib/whatsapp/ai-conversation-analysis.ts` — `analyzeWhatsAppConversation` retorna `{intencao, prioridade, risco, oportunidade, proximaMelhorAcao, sugestaoResposta, confianca}` via OpenRouter |
| Contexto de CRM no prompt | 🟢 | injeta cliente vinculado: total gasto, **OS em aberto**, vendas recentes (com agregação real `ordemServico.aggregate` + `venda.aggregate`) |
| Sugestão de resposta | 🟢 | `generateWhatsAppAiSuggestion` — **"NÃO enviar automaticamente; operador revisa"** (regra já no system prompt) |
| Fallback local (sem LLM) | 🟢 | `lib/whatsapp/ai-local-suggestion.ts` — `detectIntentFromPreview` (heurística regex) + `buildLocalSuggestReply` |
| Config por loja | 🟢 | `WhatsAppAiSetting` (`tone`, `systemPrompt`, `suggestionsEnabled`, `maxContextMessages`) |
| Endpoint + hook | 🟢 | `app/api/whatsapp/conversations/[id]/ai-analysis/route.ts` + `components/whatsapp/use-whatsapp-ai-analysis.ts` (**operador-triggered no HUB**) |
| Cache server-side | 🟢 | TTL 5 min por `storeId:conversationId` |

> **Achado-chave:** o padrão "IA sugere, humano aprova, depois envia" **já está implementado**
> para texto livre de atendimento. A frente de orçamentos/catálogo deve **estender** esse
> padrão, não recriá-lo.

### 1.3 Omni Agent — 🟢 real (interno) / 🔵 não ligado ao inbound do cliente

| Item | Estado | Evidência |
|------|--------|-----------|
| Interpretador | 🟢 determinístico | `lib/omni-agent/interpret.ts` — regex, **não LLM**; intents: `OS_OPEN`, `CLIENT_SEARCH`, `PRODUCT_SEARCH`, `REMINDER_CREATE`, `EXPENSE_CREATE`, `RECEIVABLE_CREATE`, `CASHBOX_QUERY`, `FINANCE_SUMMARY`, `UNKNOWN` |
| Executor real | 🟢 | `lib/omni-agent/executor.ts` — cria OS real, busca cliente/produto, lança despesa/recebimento, consulta caixa/financeiro |
| Confirmação humana | 🟢 | `requiresConfirmation` por intent + status `AGUARDANDO_CONFIRMACAO` |
| ACL por módulo | 🟢 | `INTENT_MODULE` (gates `EnterprisePermissions`) em `lib/omni-agent/types.ts` |
| Inbox auditável | 🟢 | `OmniAgentCommand` (`PENDENTE`/`AGUARDANDO_CONFIRMACAO`/`EXECUTADO`/`ERRO`) + `app/actions/omni-agent.ts` |
| Automações | 🟢 | `OmniAgentAutomation` (`venda_finalizada`/`os_entregue`/`conta_receber_vencida`) → **gera comando na inbox, não executa ação perigosa sozinho** |
| Event bus | 🟡 | `lib/omni-agent/domain-events.ts` → `automation-engine.handleEvent` (eventos de sistema ainda simulados) |
| Canal `whatsapp` | 🔵 | `OmniAgentCommand.canal` aceita `whatsapp`/`voz`, mas **o webhook não chama o interpretador**; o interpretador é afinado para **atalho de operador** ("abrir OS para João"), não para pergunta de cliente |

> **Achado-chave:** o Omni Agent é o **motor de execução governado** (confirmação + ACL +
> auditoria + idempotência) — exatamente a espinha que a IA de orçamento precisa para
> **executar** ações aprovadas. Mas o **interpretador atual não serve para o cliente final**;
> a classificação de inbound do cliente deve ser uma camada nova (LLM, reusando a de §1.2).

### 1.4 Catálogo / Estoque — 🟢 real, porém em saneamento

| Item | Estado | Evidência |
|------|--------|-----------|
| Produto | 🟢 | `Produto` — `sku`, `barcode`, `name`, `brand`, `supplierName`, `stock`, `precoCusto` (`price_cost`), `price`, `category`, `warrantyDays`, `metadata`; `@@unique(storeId, sku)` e `(storeId, barcode)` |
| DTO de leitura | 🟢 | `ProdutoDTO` (`app/actions/cadastros.ts`): `estoque`, `custo`, `preco`, `margem`, `garantia`, `categoria`, `marca`, `fornecedor` |
| Busca | 🟢 | `listProdutos(storeId, {q})` + `listProdutosPaginado` |
| Imagens | 🟡 | `ProductMedia` (`url`, `isPrimary`, `source`) existe, mas **muitos produtos sem imagem** — `produtosSemImagem`/`countProdutoImagens` já contam o gap; **`ProductMedia` não está no `ProdutoDTO`** |
| Ledger de estoque | 🟢 | `MovimentacaoEstoque` (append-only, custo médio) |
| Multi-depósito | 🔵 dormiente | `Deposito`/`ProdutoDeposito` (BL-07 Fase 1, inerte) |
| Inventário | 🟡 publicado, não homologado | `InventarioSessao`/`InventarioContagem` (somente leitura; nunca altera `Produto.stock`) |
| Categorias | 🟢 | `CategoriaProduto` / `CategoriaCadastro` |
| storeId | 🟢 | toda query escopada por `storeId` |

### 1.5 Serviços / Assistência — 🟢 real

| Item | Estado | Evidência |
|------|--------|-----------|
| Catálogo de serviços | 🟢 | `Servico` — `name`, `category`, `avgTime`, `cost`, `price`, `margin`, `warrantyDays`, `terms`; `ServicoDTO` |
| OS | 🟢 | `OrdemServico` + `OrdemServicoItem` (`tipo` peca/servico, `produtoId` opcional) |
| Orçamento | 🟢 | Operações V3 (`lib/operacoes-v3/orcamento-actions.ts`): itens cobrado/brinde/interno, custo interno × valor cliente × lucro, estados rascunho→aprovado |
| Garantia | 🟢 | `GarantiaOrdemServico` + `lib/operacoes-v3/garantia-textos.ts` (11 modelos, prazo padrão por serviço) |
| Modelo de equipamento | 🟢 | `EquipamentoModelo` — `compatibleParts`, `commonDefects`, `recommendedChecklist`, `averageRepairTime` (**ótimo para inferir peça a partir do aparelho**) |
| Técnicos | 🟢 | `Tecnico` (`commissionPercent`) |
| Atendimento rápido | 🟢 | `lib/operacoes-v3/atendimento-rapido-actions.ts` (serviço de balcão real) |
| PDV de serviço | 🟢 | `lib/operacoes-v3/pdv-servico-actions.ts` (recebimento real + split) |
| Eventos da OS | 🟡 produtor-only | `lib/operacoes-v3/event-model.ts` + `event-publisher.ts` (10 eventos em memória; **bridge externo é fase 3C.1**, ainda não entrega a WhatsApp/Portal) |

### 1.6 Fornecedores — 🟢 cadastro existe / 🔴 cotação inexiste

| Item | Estado | Evidência |
|------|--------|-----------|
| Fornecedor | 🟢 | `Fornecedor` — `name`, `legalName`, `contactName`, `document`, `email`, `phone`, **`whatsapp`**, `address`, `productsProvided`, `avgLeadTime`, `paymentTerms`, `active`; por loja (`storeId`); ligado a `ContaPagarTitulo` |
| Categorias/marcas que fornece | 🟡 | só texto livre (`productsProvided`) — sem relação estruturada com categoria/marca/peça |
| Prioridade / preferencial por categoria | 🔴 | inexiste |
| **Cotação** | 🔴 | **não há modelo `Cotacao`** — a propor (§5) |

---

## 2. Mapa consolidado — existe / mock / real / falta

### 2.1 O que já existe e pode ser **reutilizado** (não recriar)

1. **Canal Cloud API completo** (envio + webhook + HMAC + idempotência + multi-loja).
2. **Padrão IA assistida** (`ai-conversation-analysis` + fallback local) — intenção + sugestão
   + confiança + **contexto CRM real**, com regra de **não enviar sozinho**.
3. **Config de IA por loja** (`WhatsAppAiSetting`: tom, prompt, on/off, janela de contexto).
4. **Omni Agent como motor de execução governado** (confirmação + ACL + auditoria + inbox +
   idempotência por `localKey`/`commandId`).
5. **Catálogos reais**: `Produto`/`Servico`/`EquipamentoModelo`/`Fornecedor`/`ProductMedia`.
6. **Orçamento de OS real** (Operações V3) com custo interno oculto × valor ao cliente.
7. **Vínculo conversa↔cliente** (`WhatsAppConversation.clienteId`) — base do "status da OS"
   e do "financeiro do cliente" por WhatsApp.

### 2.2 O que está **mockado / simulado**

- Automações de **evento de sistema** do WhatsApp (`runAutomationSimulation`) — disparo real
  por evento ainda é simulação.
- Operações HUB **V2** usa dados mock (não é a fonte de verdade; V3 é a real).
- Imagens de produto: **estrutura real**, mas **cobertura baixa** (muitos sem foto).

### 2.3 O que está **real** (fonte de verdade)

- Webhook inbound, envio Cloud API, `Produto`/`Servico`/`Fornecedor`/`EquipamentoModelo`,
  OS/orçamento V3, Omni Agent (interpret/execute/inbox/ACL), análise IA de conversa.

### 2.4 O que **falta** (a construir, em fases)

| Lacuna | Tipo | Onde encaixa |
|--------|------|--------------|
| **Classificador de intenção do inbound do cliente** (LLM) | novo serviço | reusa `llm-json` + padrão de `ai-conversation-analysis` |
| **Resolver de produto/aparelho/peça** a partir de texto livre do cliente | novo serviço | reusa `listProdutos` + `EquipamentoModelo.compatibleParts` |
| **Motor de orçamento de assistência** (peça + mão de obra + margem → valor final) | novo serviço puro | novo `lib/whatsapp-ia/orcamento-engine.ts` |
| **Máquina de estados de sugestão** (recebido→…→enviado) | novo modelo + serviço | novo `WhatsAppIaSugestao` (proposta §3) |
| **Modelo de cotação a fornecedor** | novo schema | `Cotacao` + relação fornecedor↔categoria (proposta §5) |
| **Imagem no DTO de produto + fluxo de envio de mídia assistido** | extensão | `ProdutoDTO` + `sendWhatsAppMediaAction` |
| **Config comercial** (margem padrão, mão de obra padrão, mensagens-padrão) | novo modelo | `WhatsAppIaConfigComercial` (proposta §7) |
| **Bridge inbound → pipeline IA** (sem auto-envio) | wiring | `processMetaWhatsAppWebhookPayload` → enfileira classificação |

---

## 3. Intents principais (proposta)

Cada intent abaixo é **classificada por LLM** (com fallback heurístico §1.2). Saída padrão é
sempre **uma sugestão para o operador aprovar** — nunca um envio.

| Código | Intent | Exemplos do cliente | Dados necessários | Resultado (fase assistida) |
|--------|--------|---------------------|-------------------|----------------------------|
| **A** | `CONSULTA_PRODUTO_ESTOQUE` | "Tem carregador de iPhone?" · "Capinha do A06?" · "Película privacidade?" | termo, modelo, categoria, loja, disponibilidade, preço, imagem | sugestão com preço/disponibilidade/foto (se houver) — **não envia** |
| **B** | `ORCAMENTO_ASSISTENCIA` | "Quanto fica trocar tela do Moto G22?" · "Bateria iPhone 11?" | aparelho, marca, modelo, tipo de serviço, peça, custo peça, mão de obra, margem, prazo, garantia | orçamento sugerido para **aprovação humana** |
| **C** | `STATUS_OS` | "Minha OS ficou pronta?" · "Como está meu celular?" | telefone, OS vinculada, status | resposta segura (sem vazar dados de terceiros) |
| **D** | `GARANTIA` | "Minha tela tem garantia?" | cliente, aparelho, OS, data, termo | resposta com cobertura/prazo restante |
| **E** | `FINANCEIRO_CLIENTE` | "Quanto falta pagar?" · "Posso pagar no PIX?" | cliente, títulos em aberto, formas | **só blueprint** — sem execução nesta fase |
| **F** | `FORNECEDOR_COTACAO` | (interno) "consultar tela Moto G22" | peça, modelo, fornecedores aptos | **nunca dispara automático**; gera rascunho de cotação |
| — | `ATENDIMENTO_HUMANO` | "quero falar com atendente" / não classificado | — | encaminha para humano (sem IA) |

### 3.1 Estados da sugestão (obrigatórios — fase assistida)

```
recebido → interpretado → aguardando_dados → sugestao_gerada
        → aguardando_aprovacao → aprovado → enviado
                                          ↘ descartado
        (qualquer ponto) → erro
```

- **recebido**: inbound persistido (estado atual do webhook).
- **interpretado**: intent classificada (A–F) com confiança.
- **aguardando_dados**: faltou modelo/aparelho/peça → IA pede esclarecimento (sugestão de
  pergunta para o operador, não auto-envio).
- **sugestao_gerada**: resposta/orçamento montado.
- **aguardando_aprovacao**: na fila do operador.
- **aprovado** → **enviado**: operador clicou aprovar; só então o envio real ocorre.
- **descartado** / **erro**: auditados.

> Em F2–F6 **toda transição para `enviado` exige clique humano**. Auto-envio só em F7, e
> ainda sob limites (§7).

---

## 4. Arquitetura de orçamentos (proposta)

### 4.1 Princípio de privacidade do valor

O cliente **vê apenas**: valor final, prazo estimado, garantia, observação profissional.
O cliente **nunca vê**: custo da peça, margem, mão de obra separada, fornecedor, lucro.

(Isto já é respeitado pelo orçamento V3, que separa "custo interno" de "valor ao cliente" e
oculta o interno do documento do cliente — o motor novo deve herdar essa regra.)

### 4.2 Cálculo por origem

**Produto em estoque (intent A):**
```
valor_final = Produto.price (preço de venda cadastrado)
disponibilidade = Produto.stock > 0  (com ressalva de saneamento)
```

**Assistência com peça interna (intent B):**
```
valor_final = custo_peça + margem + mão_de_obra (+ frete, se aplicável)
```
- `custo_peça`: de `Servico.cost` ou `Produto.precoCusto` (peça compatível via
  `EquipamentoModelo.compatibleParts`).
- `margem`: `Servico.margin` ou margem padrão da categoria (config §7).
- `mão_de_obra`: padrão por tipo de serviço (config §7) ou embutida em `Servico.price`.
- Atalho real já existente: se houver `Servico` cadastrado para o reparo, `Servico.price` já
  é o valor final — a IA prioriza o catálogo de serviços antes de recompor.

**Fornecedor externo (intent F) — quando não há peça/custo interno:**
```
pedido de cotação → resposta do fornecedor → IA interpreta preço/prazo/disponibilidade
→ aplica margem/mão de obra → gera orçamento final (para aprovação humana)
```

### 4.3 Saída do orçamento (para o cliente)

```
Olá! Para [serviço] no [aparelho]:
• Valor: R$ XXX,XX
• Prazo estimado: [X dias úteis]
• Garantia: [N dias] — [cobertura resumida]
• Obs.: [observação profissional]
```
Tudo isso é **rascunho aprovável**, montado por `lib/whatsapp-ia/orcamento-engine.ts` (puro,
testável), reusando `garantia-textos.ts` para o termo.

---

## 5. Fornecedores (proposta de estrutura futura)

`Fornecedor` **já existe** (com `whatsapp`). O que falta é (a) relacionar fornecedor a
categorias/marcas/peças de forma estruturada e (b) registrar cotações.

> **PROPOSTA — não aplicar. Sem migration nesta fase.** Schema ilustrativo:

```prisma
// PROPOSTA (não implementar): capacidade estruturada do fornecedor
model FornecedorCapacidade {
  id           String  @id @default(cuid())
  storeId      String
  fornecedorId String
  // "categoria" | "marca" | "tipo_peca"
  tipo         String
  valor        String  // ex.: "tela", "Samsung", "bateria"
  prioridade   Int     @default(0)   // preferencial por categoria
  @@index([storeId, tipo, valor])
}

// PROPOSTA (não implementar): cotação a fornecedor (assistida)
model Cotacao {
  id                 String   @id @default(cuid())
  storeId            String
  fornecedorId       String
  pecaSolicitada     String
  modeloAparelho     String
  osId               String?  // vínculo opcional com a OS de origem
  mensagemEnviada    String   @db.Text
  respostaRecebida   String?  @db.Text
  precoInterpretado  Float?
  prazoInterpretado  String?
  // "rascunho" | "aguardando_aprovacao" | "enviada" | "respondida" | "descartada"
  status             String   @default("rascunho")
  aprovadoPor        String?  // operador que liberou o envio
  createdAt          DateTime @default(now())
  @@index([storeId, status])
}
```

**Regras de cotação (todas as fases iniciais):**
- O fornecedor **nunca** recebe dados do cliente final (nome, telefone, valor cobrado).
- A mensagem ao fornecedor é **genérica** ("preciso de tela para Moto G22, preço e prazo?").
- O envio ao fornecedor **só ocorre após aprovação humana** (F6).
- A interpretação da resposta (preço/prazo) é **sugestão**, confirmada por humano.

---

## 6. Catálogo e imagens (proposta)

**Estado:** `ProductMedia` existe (`isPrimary`), mas cobertura baixa e **imagem não está no
`ProdutoDTO`**.

**Fluxo proposto (assistido):**
```
cliente pergunta produto → resolver encontra Produto(s) na loja ativa
→ se ProductMedia.isPrimary existe: sugerir resposta + anexo de foto (operador aprova)
→ se não há imagem: sugerir resposta só com texto (preço/disponibilidade)
```

- Estender `ProdutoDTO` com `imagemPrincipalUrl?` (derivado de `ProductMedia` — leitura, sem
  schema novo).
- Envio de mídia já é suportado (`sendWhatsAppMediaAction`); na fase assistida ele só é
  chamado **após aprovação**.
- **Não enviar mídia automaticamente nesta fase.**

---

## 7. Configurações comerciais (proposta)

> **PROPOSTA — não aplicar.** Novo modelo de config por loja (poderia também residir em
> `WhatsAppAiSetting.metadata` para evitar schema novo na F2):

```prisma
// PROPOSTA (não implementar): config comercial da IA de orçamentos, por loja
model WhatsAppIaConfigComercial {
  id                       String  @id @default(cuid())
  storeId                  String  @unique
  margemPadraoPecas        Float   @default(0)     // %
  maoDeObraPadrao          Json?                    // por tipo de serviço
  margemPorCategoria       Json?                    // categoria → %
  fornecedorPreferencial   Json?                    // categoria → fornecedorId
  exigeAprovacaoHumana     Boolean @default(true)   // trava-mestra
  limiteValorAutoResposta  Float   @default(0)      // teto p/ auto-resposta (F7)
  mensagemPadraoOrcamento  String  @default("") @db.Text
  mensagemPadraoSemEstoque String  @default("") @db.Text
  mensagemEncaminharHumano String  @default("") @db.Text
  updatedAt                DateTime @updatedAt
}
```

Configurações necessárias (resumo):
- Margem padrão para peças · mão de obra padrão por tipo de serviço · margem por categoria.
- Fornecedor preferencial por categoria.
- **`exigeAprovacaoHumana`** (default `true` — só desliga em F7, com cautela).
- Limite de valor para auto-resposta futura.
- Mensagens-padrão: orçamento, sem estoque, encaminhar para atendente.

---

## 8. Segurança e LGPD

| Regra | Como garantir |
|-------|---------------|
| Nunca vazar dados de outro cliente | toda consulta escopada por `storeId` **e** por `clienteId` da conversa; status/financeiro só do cliente vinculado (`WhatsAppConversation.clienteId`) |
| Nunca enviar dados do cliente ao fornecedor | mensagem de cotação **genérica** (peça + modelo); sem nome/telefone/valor cobrado |
| Nunca prometer estoque sem confiança | enquanto estoque/inventário em saneamento, resposta usa linguagem condicional ("temos disponível para confirmação") — flag de confiança no `Produto.metadata`/config |
| Auditoria sempre | reusar `LogsAuditoria` + inbox do Omni Agent; toda sugestão/aprovação/envio logado por loja |
| Auto-resposta inicial **desligada** | `exigeAprovacaoHumana = true`; pipeline para em `aguardando_aprovacao` |
| Isolamento multi-loja | roteamento por `phone_number_id` (ADR-0006); número não mapeado é descartado (sem fallback loja-1) |
| Logs sem PII bruta | webhook já mascara telefone/assinatura; manter política de retenção |
| Segredos server-side | tokens em env (`tokenEnvKey`), nunca no DB nem no client |

---

## 9. Roadmap por fases

| Fase | Entrega | Reusa | Schema? | Auto-envio? |
|------|---------|-------|---------|-------------|
| **F1** | **Auditoria + este blueprint** | — | não | não |
| **F2** | Inbox assistida com **classificação de intenção** (A–F) do inbound | `llm-json`, padrão de `ai-conversation-analysis`, `WhatsAppAiSetting` | mínimo (estado da sugestão pode ir em `metadata` antes de modelo dedicado) | não |
| **F3** | **Consulta de catálogo/estoque** + sugestão de resposta (intent A) | `listProdutos`, `ProductMedia`, `sendWhatsAppMediaAction` | não (estende DTO) | não |
| **F4** | **Orçamento de assistência** com tabela interna (intent B) | `Servico`, `EquipamentoModelo`, `garantia-textos`, orçamento V3 | não | não |
| **F5** | **Cadastro de fornecedores + cotações manuais assistidas** (intent F, manual) | `Fornecedor` | **sim** (`Cotacao`, `FornecedorCapacidade`) — Gate | não |
| **F6** | **Cotação via WhatsApp ao fornecedor** com aprovação humana | F5 + Cloud API | não (usa F5) | só para fornecedor, **após aprovação** |
| **F7** | **Resposta automática controlada** (limites de valor/intent) | tudo acima + Omni Agent gates | `WhatsAppIaConfigComercial` | **sim, sob limites** |
| **F8** | IA **abre OS/orçamento** automaticamente (com confirmação) | Omni Agent executor (`OS_OPEN`), V3 | não | parcial |
| **F9** | **Status de OS via WhatsApp** (intents C/D) com portal | eventos V3 (bridge 3C.1), `GarantiaOrdemServico` | não | sim (read-only) |
| **F10** | Produto SaaS separado **WhatsApp IA Business** | toda a stack | a definir | sim |

**Sequência recomendada:** F2 → F3 → F4 primeiro (maior valor, menor risco, zero schema),
**Gate humano** antes de F5 (primeiro schema). F7 só depois de F3–F4 validados em loja real.

---

## 10. Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|------------|-----------|
| R-1 | IA promete estoque/preço errado (catálogo em saneamento) | **Alta** | linguagem condicional + flag de confiança + aprovação humana; não publicar disponibilidade como verdade |
| R-2 | Vazamento entre lojas (RafaCell × Rafa Brinquedos) | **Alta** | escopo `storeId` + roteamento `phone_number_id` (já existente); testes multi-loja antes de F2 |
| R-3 | Dado do cliente vazar ao fornecedor | **Alta** | cotação genérica; nunca anexar identificação do cliente |
| R-4 | Auto-envio acidental | Média | `exigeAprovacaoHumana=true` por default; auto-envio só em F7 com limites |
| R-5 | Custo de LLM por mensagem | Média | cache (já existe TTL 5min) + fallback heurístico local + classificar só inbound relevante |
| R-6 | Interpretador do Omni Agent ser reusado p/ cliente final (não serve) | Média | classificador novo (LLM) para o cliente; Omni Agent fica só como **executor** de ação aprovada |
| R-7 | Bridge de eventos V3→WhatsApp ainda não existe (status proativo) | Baixa | F9 depende da fase 3C.1 da V3; não bloquear F2–F4 |
| R-8 | Imagens ausentes geram resposta pobre | Baixa | fallback texto-only; campanha de cadastro de fotos (`produtosSemImagem` já mede) |

---

## 11. Próximos GOALs recomendados

1. **GOAL F2 — Classificador de intenção do inbound (assistido).** Serviço LLM puro que lê a
   conversa e devolve `{intent A–F, campos, confiança, sugestão}`; UI de inbox com fila de
   aprovação. Sem schema (estado em `metadata`). Sem auto-envio.
2. **GOAL F3 — Resolver de catálogo + sugestão com foto.** Estender `ProdutoDTO` com imagem
   principal; resolver produto/modelo/categoria; sugerir resposta. Sem auto-envio.
3. **GOAL F4 — Motor de orçamento de assistência.** `lib/whatsapp-ia/orcamento-engine.ts`
   (puro + testes) combinando `Servico`/`EquipamentoModelo`/peça/margem/mão de obra; herda
   regra de ocultar custo interno.
4. **GATE — ADR de schema** (`Cotacao`, `FornecedorCapacidade`, config comercial) antes de F5.
5. **GOAL F9 (paralelo) — Bridge de eventos V3→WhatsApp** para status proativo de OS,
   dependente da fase 3C.1 da V3.

---

## Anexo A — Arquivos auditados (evidência)

- **WhatsApp:** `app/api/webhooks/whatsapp/route.ts` · `lib/whatsapp-meta-cloud-webhook.ts` ·
  `lib/whatsapp/whatsapp-service.ts` · `lib/whatsapp/ai-conversation-analysis.ts` ·
  `lib/whatsapp/ai-local-suggestion.ts` · `lib/whatsapp/webhook-hmac-policy.ts` ·
  `app/actions/whatsapp.ts` · `app/api/whatsapp/conversations/[id]/ai-analysis/route.ts` ·
  `components/whatsapp/use-whatsapp-ai-analysis.ts`
- **Omni Agent:** `lib/omni-agent/interpret.ts` · `lib/omni-agent/executor.ts` ·
  `lib/omni-agent/types.ts` · `lib/omni-agent/domain-events.ts` · `app/actions/omni-agent.ts`
- **Catálogo/Serviços/Fornecedor:** `prisma/schema.prisma` (models `Produto`, `ProductMedia`,
  `Servico`, `EquipamentoModelo`, `Fornecedor`, `OrdemServico`/`OrdemServicoItem`,
  `GarantiaOrdemServico`, `WhatsApp*`, `OmniAgent*`) · `app/actions/cadastros.ts`
  (`ProdutoDTO`, `ServicoDTO`, `listProdutos`, `produtosSemImagem`, `countProdutoImagens`)

## Anexo B — Conformidade com a governança

- **Read-only:** nenhuma área protegida tocada (auth/proxy/schema/PDV/Financeiro/Operações
  V3/Estoque/Marketplace/Fiscal). Nenhum arquivo `.ts`/`.tsx` alterado.
- **Schema:** apenas **propostas ilustrativas** (Anexo §5 e §7) marcadas "não aplicar".
  Sem migration, sem `prisma/schema.prisma` alterado.
- **Sem mocks enganosos:** o documento separa explicitamente real × mock × ausente.
- **Validação:** docs-only → `npx tsc --noEmit` e `npm run build` **não se aplicam**
  (nenhum código alterado). Conferir com `git diff --stat`.
