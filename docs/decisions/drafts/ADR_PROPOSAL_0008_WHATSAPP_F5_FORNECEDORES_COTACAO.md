---
title: ADR-0008 · WhatsApp IA F5 — Fornecedores e Cotação assistida
status: proposta
data: 2026-06-15
autor: Opus 4.8 (Claude Code)
revisores: [humano dono do projeto]
hub: whatsapp
tags: [whatsapp-ia, fornecedores, cotacao, schema, multi-loja, lgpd]
superado_por:
substitui:
---

# ADR-0008 (DRAFT) · WhatsApp IA F5 — Fornecedores e Cotação assistida

> **Status:** proposta (DRAFT — **não aplicado**; não está no índice oficial de ADRs).
> **Decisão em uma frase:** F5 **exige schema novo** (`Cotacao` + `CotacaoItem` +
> `FornecedorCapacidade` + config comercial) e é a primeira fase desta frente que **não é
> schema-free** — portanto **só pode iniciar após Gate humano** (este ADR aceito + revisão de
> schema + revisão multi-loja). **Cotação começa MANUAL/assistida**; outbound automático a
> fornecedor fica para o fim, atrás de aprovação humana e templates Meta.
>
> ⚠️ Este documento é **auditoria + proposta**. Nenhum código, schema, migration ou API foi
> criado/alterado. PARTES 1–6 do GOAL `WHATSAPP_IA_F5_GATE_ADR` consolidadas aqui.

---

## PARTE 1 — Auditoria do que existe hoje

Legenda: 🟢 REAL · 🟡 PARCIAL/MOCK · 🔴 FALTA.

| Área | Estado | Evidência / observação |
|---|---|---|
| **Fornecedor (model)** | 🟢 REAL | `prisma.Fornecedor` (`schema.prisma`): `name`, `legalName`, `contactName`, `document`, `email`, `phone`, **`whatsapp`**, `address`, `productsProvided` (texto livre), `avgLeadTime` (texto), `paymentTerms` (texto), `notes`, `active`, `storeId`. `@@index([storeId])`, `@@index([name])`. Ligado a `ContaPagarTitulo`. |
| **Cadastro de fornecedor (CRUD)** | 🟢 REAL | `app/actions/cadastros.ts`: `listFornecedores(storeId)`, `upsertFornecedor(...)`, `FornecedorDTO`. Multi-loja (escopo `storeId`). |
| **WhatsApp do fornecedor** | 🟡 PARCIAL | Campo `Fornecedor.whatsapp` existe, mas é **texto livre não normalizado** (não `phoneDigits` E.164). Não há vínculo fornecedor↔conversa/contato WhatsApp. |
| **Capacidade do fornecedor (o que ele fornece)** | 🔴 FALTA | Só `productsProvided` como **texto livre**. Não há relação estruturada fornecedor → categoria / marca / tipo de peça / prioridade. Impossível "consultar fornecedores habilitados para tela Moto G22" de forma determinística. |
| **Catálogo de peças (Produto)** | 🟢 REAL | `Produto` (`sku`, `barcode`, `name`, `brand`, `stock`, `precoCusto`, `price`, `category`). `listProdutos(storeId)`. F3/F4 já consomem (somente leitura). |
| **Serviço** | 🟢 REAL | `Servico` (`name`, `category`, `cost`, `price`, `margin`, `warrantyDays`, `terms`). `listServicos(storeId)`. F4 já consome (só `price`). |
| **EquipamentoModelo** | 🟢 REAL | `EquipamentoModelo` (`brand`, `compatibleParts` JSON, `commonDefects` JSON). `listEquipamentosModelos(storeId)`. **Subutilizado** — F4 não usa `compatibleParts` ainda. |
| **Omni Agent** | 🟢 REAL | `lib/omni-agent/*`: interpretador determinístico + executor + **confirmação humana** (`requiresConfirmation`) + **ACL** (`INTENT_MODULE`) + **inbox auditável** (`OmniAgentCommand`) + idempotência. **Padrão de execução governada reutilizável** como espinha da aprovação F5. |
| **Inbox WhatsApp** | 🟢 REAL | `WhatsAppConversation`/`WhatsAppMessage`/`WhatsAppContact`; envio Cloud API real **vinculado a `conversationId`** (`sendCloudApiTextAndRecord(storeId, conversationId, text)`); webhook inbound idempotente por `wamid`. **Outbound só dentro de conversa existente** + restrição janela 24h/template Meta. |
| **CRM (cliente)** | 🟢 REAL | `Cliente` + vínculo `WhatsAppConversation.clienteId`. F3/F4 já leem contexto. |
| **Operações V3 (orçamento/OS)** | 🟢 REAL | `lib/operacoes-v3/orcamento-*` monta orçamento manual (custo interno × valor cliente × lucro). **Não há ponte F5↔OS** (nem deve haver nesta fase — F5 só sugere). |
| **F2/F3/F4 WhatsApp IA** | 🟢 REAL | F2 classifica intenção (inclui `FORNECEDOR_COTACAO`, hoje só com flag interno); F3 resolve catálogo/estoque/foto; F4 resolve aparelho+serviço e sugere valor (origens `SERVICO_CADASTRADO/PRODUTO_COMPATIVEL/ESTIMATIVA/SEM_DADOS`). Tudo **somente leitura, assistido**. |
| **Cotação (`Cotacao`/`CotacaoItem`)** | 🔴 FALTA | **Não existe nenhuma tabela/serviço de cotação.** Única menção a "FORNECEDOR_COTACAO" é o rótulo de intent no classificador F2. |
| **Config comercial (margem/frete/mão de obra padrão)** | 🔴 FALTA | Não há configuração persistida de margem por categoria, mão de obra padrão por serviço, frete ou fornecedor preferencial. |

**Resumo:** a F5 herda **cadastro de fornecedor real** + **catálogos reais** + **canal Cloud API real**
+ **padrão de execução governada (Omni Agent)**. O que **falta** é exatamente o núcleo da F5:
(a) **capacidade estruturada** do fornecedor, (b) **modelo de cotação** (header + itens) com estado/
auditoria/aprovação, (c) **config comercial**, (d) **normalização do WhatsApp do fornecedor**, (e)
**interpretação da resposta** do fornecedor (preço/prazo/frete a partir de texto livre).

---

## PARTE 2 — Arquitetura proposta (10 perguntas)

| # | Pergunta | Resposta | Justificativa |
|---|---|---|---|
| 1 | Precisamos de **schema novo**? | **SIM** | F5 persiste cotações com estado, respostas de fornecedor e auditoria. Diferente de F2–F4 (puras/leitura), F5 **não é schema-free**. |
| 2 | Precisamos de **`Cotacao`**? | **SIM** | Cabeçalho do ciclo: a necessidade (aparelho/serviço/peça) + estado + orçamento final sugerido + aprovação. Uma pergunta de cliente → uma `Cotacao`. |
| 3 | Precisamos de **`CotacaoItem`**? | **SIM** | Uma linha por **fornecedor consultado** naquele ciclo (mensagem enviada, resposta, preço/prazo/frete interpretados, status). Permite **comparação**. |
| 4 | Precisamos de **histórico**? | **SIM** | Padrão do projeto: `payload.historico[]` + transições de status nunca destrutivas (igual Financeiro/OS). |
| 5 | Precisamos de **auditoria**? | **SIM** | `LogsAuditoria` por evento (criação, envio, resposta, aprovação) + reuso do padrão Omni Agent. **Quem aprovou o quê.** |
| 6 | Precisamos de **aprovação**? | **SIM** | Aprovação humana obrigatória em **dois pontos**: (a) antes de enviar pedido ao fornecedor (quando automatizado) e (b) antes de enviar o orçamento final ao cliente. Reusa o gate do Omni Agent. |
| 7 | Precisamos de **multi-loja**? | **SIM (P0)** | `Fornecedor` já é por loja. `Cotacao`/`CotacaoItem`/`FornecedorCapacidade` **escopadas por `storeId`**, sem fallback loja-1 (ADR-0003/0006). Fornecedor da loja A **nunca** consultado para loja B. |
| 8 | Precisamos de **LGPD**? | **SIM (P0)** | O fornecedor **nunca** pode receber identidade/telefone/valor do cliente final. Mensagem ao fornecedor é **genérica** (peça + modelo). Dados do cliente isolados. |
| 9 | Precisamos de **fila**? | **SIM** | Resposta do fornecedor é **assíncrona** (minutos/horas). Estado "aguardando resposta" + casamento da resposta inbound com o `CotacaoItem` correto. |
| 10 | Precisamos de **timeout**? | **SIM** | Cada `CotacaoItem` tem prazo (ex.: 2h/24h). Fornecedor que não responde é marcado `expirado`; o ciclo resolve com quem respondeu (ou cai em "sem resposta"). |

### 2.1 Schema PROPOSTO (ilustrativo — **NÃO aplicar**)

```prisma
// PROPOSTA — não implementar nesta fase. Sujeito à revisão de schema do Gate.

/// Capacidade estruturada do fornecedor (o que ele fornece) — habilita o roteamento.
model FornecedorCapacidade {
  id           String   @id @default(cuid())
  storeId      String
  fornecedorId String
  fornecedor   Fornecedor @relation(fields: [fornecedorId], references: [id], onDelete: Cascade)
  /// "categoria" | "marca" | "tipo_peca"
  tipo         String
  valor        String   // ex.: "tela", "Samsung", "bateria"
  prioridade   Int      @default(0) // fornecedor preferencial por categoria
  ativo        Boolean  @default(true)
  createdAt    DateTime @default(now())
  @@index([storeId, tipo, valor])
  @@index([fornecedorId])
}

/// Ciclo de cotação (uma necessidade do cliente → uma cotação). NÃO guarda dado do cliente
/// que o fornecedor possa ver; vínculo com a conversa do cliente é interno (auditoria).
model Cotacao {
  id                 String   @id @default(cuid())
  storeId            String
  /// Conversa de ORIGEM do cliente (interno; nunca exposto ao fornecedor).
  conversationId     String?
  aparelho           String   // "Moto G22"
  servico            String   // "Troca de tela"
  peca               String   // "tela"
  /// "rascunho" | "aguardando_aprovacao_envio" | "aguardando_respostas"
  /// | "respondida" | "orcamento_sugerido" | "aprovada_para_cliente" | "enviada_cliente"
  /// | "descartada" | "expirada"
  status             String   @default("rascunho")
  /// Orçamento final SUGERIDO (após comparação + margem + mão de obra + frete).
  valorSugerido      Float?
  /// Espelho: peça base escolhida, margem, mão de obra, frete (somente p/ operador).
  payload            Json?
  /// Auditoria não destrutiva.
  historico          Json?
  aprovadoPor        String?  // operador que liberou ao cliente
  expiraEm           DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  itens              CotacaoItem[]
  @@index([storeId, status])
  @@index([storeId, createdAt])
}

/// Uma linha por fornecedor consultado no ciclo.
model CotacaoItem {
  id                 String   @id @default(cuid())
  storeId            String
  cotacaoId          String
  cotacao            Cotacao  @relation(fields: [cotacaoId], references: [id], onDelete: Cascade)
  fornecedorId       String
  /// Mensagem GENÉRICA enviada ao fornecedor (sem dado do cliente).
  mensagemEnviada    String   @db.Text
  respostaRecebida   String?  @db.Text
  precoInterpretado  Float?
  prazoInterpretado  String?
  freteInterpretado  Float?
  /// "pendente" | "enviado" | "respondido" | "expirado" | "descartado"
  status             String   @default("pendente")
  enviadoEm          DateTime?
  respondidoEm       DateTime?
  createdAt          DateTime @default(now())
  @@index([storeId, status])
  @@index([cotacaoId])
  @@index([fornecedorId])
}
```

### 2.2 Config comercial (PROPOSTA)

Margem padrão por categoria, mão de obra padrão por tipo de serviço, frete padrão e fornecedor
preferencial. Para **evitar mais uma tabela cedo**, pode residir em `WhatsAppAiSetting.metadata`
(JSON, já existe) na F5.1 e migrar para modelo dedicado só se necessário. Decisão fechada no Gate.

### 2.3 Cálculo do orçamento (reusa F4, sem expor interno)

```
valor_final_cliente = preco_peca (do fornecedor escolhido)
                    + frete (se aplicável)
                    + margem_configuravel
                    + mao_de_obra_configuravel
```
O cliente **vê apenas** valor final + prazo + garantia. **Nunca** vê preço de fornecedor, frete,
margem, mão de obra separada nem identidade do fornecedor (herda a regra de F4).

### 2.4 Reuso (não recriar)

- **Aprovação/auditoria/ACL** → padrão Omni Agent (`OmniAgentCommand`, `requiresConfirmation`).
- **Outbound** → `sendCloudApiTextAndRecord` (já existe), com **template Meta** quando fora da
  janela 24h do fornecedor.
- **Interpretação preço/prazo da resposta** → camada IA existente (`llm-json` /
  `ai-conversation-analysis`) com fallback heurístico — **sugestão, confirmada por humano**.
- **Resolução aparelho/serviço/peça** → resolvers da F4 (`whatsapp-device-resolver`,
  `whatsapp-service-resolver`).

---

## PARTE 3 — Fluxo operacional (desenho, sem implementação)

```
Cliente (WhatsApp)
  │  "Quanto fica a tela do Moto G22?"
  ▼
F2 intent = ORCAMENTO_ASSISTENCIA  +  F4 resolve {Moto G22, Troca de tela, peça=tela}
  │
  ▼
F4: há SERVICO_CADASTRADO / PRODUTO_COMPATIVEL?  ──SIM──▶ sugere valor (fim, sem fornecedor)
  │ NÃO (sem dado interno suficiente)
  ▼
Cria Cotacao (rascunho) + seleciona fornecedores HABILITADOS
   (FornecedorCapacidade: tipo_peca=tela / marca=Motorola / categoria, por prioridade, da loja)
  │
  ▼
[GATE HUMANO #1]  operador revisa fornecedores + mensagem genérica e APROVA o envio
  │   (mensagem ao fornecedor: "Preço e prazo de tela para Moto G22?" — SEM dado do cliente)
  ▼
        Fornecedor A          Fornecedor B          Fornecedor C
   (CotacaoItem A)        (CotacaoItem B)        (CotacaoItem C)
        │ envia                │ envia                │ envia
        ▼                      ▼                      ▼
   resposta livre          resposta livre        (timeout → expirado)
        │                      │
        ▼                      ▼
   IA interpreta preço/prazo/frete  →  preenche CotacaoItem (SUGESTÃO, operador confere)
        │                      │
        └───────────┬──────────┘
                    ▼
            COMPARAÇÃO (menor preço × prazo × confiabilidade/prioridade)
                    ▼
   ORÇAMENTO SUGERIDO = peça escolhida + frete + margem + mão de obra  (F4 calcula)
                    ▼
            [GATE HUMANO #2]  operador aprova o valor ao cliente
                    ▼
   Cliente recebe SÓ: valor final + prazo + garantia   (nunca fornecedor/custo/margem)
```

**Invariantes:** nada é enviado (fornecedor ou cliente) sem clique humano; fornecedor nunca recebe
dado do cliente; tudo escopado por `storeId`.

---

## PARTE 4 — Riscos (P0–P3)

| ID | Risco | Sev. | Mitigação |
|---|---|---|---|
| R-1 | **Vazamento multi-loja** (cotação/fornecedor de uma loja aparece/é consultado por outra) | **P0** | `storeId` obrigatório em `Cotacao`/`CotacaoItem`/`FornecedorCapacidade`; sem fallback loja-1 (ADR-0003/0006); testes multi-loja antes do release; lint de isolamento. |
| R-2 | **Dado do cliente vaza ao fornecedor** (nome/telefone/valor cobrado) | **P0** | Mensagem ao fornecedor é **gerada de template genérico** (peça+modelo); `CotacaoItem.mensagemEnviada` validada para não conter PII; `conversationId` do cliente nunca exposto. |
| R-3 | **IA alucina orçamento** (inventa preço/prazo que o fornecedor não disse) | **P0** | Interpretação da resposta é **sugestão** confirmada por humano (Gate #2); confiança exibida; valor só "Real" quando confirmado; nunca auto-envio. |
| R-4 | **Preço incorreto ao cliente** (frete/margem/mão de obra errados) | **P1** | Config comercial explícita + preview do cálculo ao operador; valor final sempre revisado no Gate #2. |
| R-5 | **Fornecedor errado consultado** (capacidade mal cadastrada) | **P1** | `FornecedorCapacidade` curada + operador revisa a lista de fornecedores no Gate #1 antes do envio. |
| R-6 | **Peça incompatível** sugerida (tela de modelo errado) | **P1** | Casar `EquipamentoModelo.compatibleParts` + modelo; operador confirma; nunca promete compatibilidade automática. |
| R-7 | **Catálogo desatualizado** (peça sem preço/estoque, fornecedor inativo) | **P2** | F5 só **sugere**; `active`/timeout filtram; estado honesto ("a confirmar"). Estoque em saneamento reforça linguagem condicional. |
| R-8 | **Janela 24h / template Meta** bloqueia outbound ao fornecedor | **P2** | F5.1–F5.3 **manuais** (operador copia/cola); outbound automático (F5.4) exige template aprovado + fallback manual. |
| R-9 | **Resposta do fornecedor não casa** com o `CotacaoItem` (vários ciclos abertos) | **P2** | Casamento por conversa do fornecedor + cotação mais recente aberta; operador resolve ambiguidade. |
| R-10 | **Custo de LLM** por interpretação de resposta | **P3** | Heurística primeiro; LLM só sob demanda; cache. |

---

## PARTE 5 — ADR proposto

**Este documento É o ADR proposto (DRAFT).** Resumo da decisão para o índice (quando aceito):

- **Decisão:** adotar `Cotacao` + `CotacaoItem` + `FornecedorCapacidade` (+ config comercial em
  `WhatsAppAiSetting.metadata` na F5.1) como fundação da F5; **migrations aditivas e dormentes**;
  cotação **manual/assistida primeiro**, outbound automático ao fornecedor por último e atrás de
  aprovação humana + template Meta. Nada auto-enviado; LGPD e multi-loja como invariantes P0.
- **Status:** `proposta` → aguarda **Gate humano** (aceite + schema review + multi-loja review).

### Alternativas consideradas

| Alternativa | Prós | Contras | Veredito |
|---|---|---|---|
| A) **Sem schema** — só texto livre / `payload` em conversa | zero migration | sem comparação, sem auditoria, sem fila/timeout estruturados; vira mock enganoso | **Rejeitada** |
| B) **Uma tabela `Cotacao` só** (respostas em JSON) | menos tabelas | dificulta query/índice por fornecedor, comparação e timeout por item | Rejeitada |
| C) **`Cotacao` + `CotacaoItem` + `FornecedorCapacidade`** (escolhida) | comparação real, auditoria, multi-loja, fila/timeout por item | +3 tabelas, migration, mais superfície | **Escolhida** |
| D) Reusar `Omni Agent` como motor de aprovação/inbox | aproveita gate/ACL/auditoria prontos | precisa de modelo de dados próprio mesmo assim | **Escolhida como complemento de C** |

### Consequências

- **Positivas:** cotação auditável, comparável, multi-loja e LGPD-safe; reuso de F4 + Omni Agent + Cloud API.
- **Custos:** primeira migration desta frente; mais superfície de teste; complexidade de outbound a fornecedor (template/janela).
- **Riscos introduzidos:** os P0 da PARTE 4 (vazamento, PII ao fornecedor, alucinação) — todos com mitigação por aprovação humana e isolamento por `storeId`.

---

## PARTE 6 — Plano F5 (fatiado, pequeno)

| Sub-fase | Entrega | Schema? | Auto-envio? | Tamanho |
|---|---|---|---|---|
| **F5.1** | **Fundação**: `FornecedorCapacidade` + `Cotacao` + `CotacaoItem` (migration **aditiva e dormente**) + config comercial em `WhatsAppAiSetting.metadata`. Normalizar `Fornecedor.whatsapp` → dígitos. UI de capacidade no cadastro de fornecedor. | **SIM** (aditivo) | não | **M** |
| **F5.2** | **Cotação manual assistida**: operador abre uma `Cotacao` a partir da conversa, seleciona fornecedores habilitados (por capacidade/prioridade/loja), gera **mensagem genérica** (sem PII) e **copia/cola** manualmente. Registra `CotacaoItem`. **Sem outbound automático.** | não (usa F5.1) | não | **M** |
| **F5.3** | **Comparação + orçamento sugerido**: operador insere a resposta de cada fornecedor; sistema sugere preço/prazo (heurística/LLM, confirmado), **compara** e calcula orçamento final (F4 + margem/frete/mão de obra). Gate #2 ao cliente. | não | não | **M** |
| **F5.4** | **Outbound assistido ao fornecedor**: envio real via Cloud API **após aprovação** (Gate #1), com **template Meta** fora da janela 24h. Fila + timeout por item. | não (usa F5.1) | só ao fornecedor, **após aprovação** | **L** |
| **F5.5** | **Interpretação inbound da resposta**: casar resposta do fornecedor (webhook) ao `CotacaoItem`, extrair preço/prazo/frete (LLM + fallback) como **sugestão**, atualizar comparação. | não | não | **L** |

---

## Conclusão (entrega do GOAL)

- **Schema necessário?** **SIM.** F5 é a primeira fase **não schema-free**: `FornecedorCapacidade`,
  `Cotacao`, `CotacaoItem` (migration aditiva/dormente) + config comercial (em `WhatsAppAiSetting.metadata`
  na F5.1).
- **Tamanho estimado:** **GRANDE** (maior fase da frente até aqui) — ~5 sub-fases / múltiplas sprints.
  F5.1–F5.3 são **M**; F5.4–F5.5 são **L** (outbound a fornecedor + interpretação de resposta).
- **Risco:** **ALTO** — 3 riscos **P0** (vazamento multi-loja, dado do cliente ao fornecedor, IA
  alucinando orçamento). Exigem aprovação humana em 2 gates + isolamento por `storeId` + mensagem
  genérica ao fornecedor.
- **Ordem recomendada:** **F5.1 → F5.2 → F5.3 → F5.4 → F5.5.** Implementar **F5.1 sozinha primeiro**
  (schema aditivo dormente, sem comportamento), validar multi-loja, e só então F5.2+.
- **F5 está pronta para iniciar?** **NÃO.** Depende do **Gate humano**: (1) aceitar este ADR-0008,
  (2) revisão de schema, (3) revisão multi-loja. Só após o Gate a **F5.1** pode entrar como sprint.
  Este documento **não foi aplicado** (não está no índice de ADRs, sem commit, sem código).

---

## Referências

- ADRs relacionados: ADR-0003 (fim do fallback loja-1), ADR-0006 (router WhatsApp multi-loja), ADR-0007 (modelo de depósitos — padrão de migration aditiva/dormente).
- Blueprint: `docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md` (§5 Fornecedores, §7 Config comercial).
- Estado atual: `docs/ai/CURRENT_STATUS.md` → seção "WhatsApp IA — Catálogo & Orçamento Assistido (F1–F4)".
- Código real auditado: `app/actions/cadastros.ts` (`listFornecedores`/`upsertFornecedor`/`FornecedorDTO`), `prisma/schema.prisma` (`Fornecedor`), `lib/omni-agent/*`, `app/actions/whatsapp.ts`, `lib/whatsapp/whatsapp-{device,service}-resolver.ts`, `lib/whatsapp/whatsapp-assistance-quote.ts`.
- Template: `docs/decisions/TEMPLATE_ADR.md` · Índice: `docs/decisions/INDEX.md` (próximo número livre: **0008**).

## Notas

- **Não aplicado por decisão de processo:** este DRAFT vive em `docs/decisions/drafts/` e **não** foi
  adicionado ao `INDEX.md` (§4) nem recebeu número oficial — isso acontece só no Gate, por mão humana.
- A numeração **0008** é a sugerida (0007 é o maior aceito; 0005 reservado ao CoWork).

---

## Apêndice A — Verificação fonte-a-fonte (evidência rastreável)

> **Auditoria read-only de validação** (2026-06-15, Opus 4.8 / Claude Code). Cada afirmação da
> PARTE 1 foi conferida contra o **código real** (schema, Server Actions, libs). **Nenhum arquivo de
> aplicação foi tocado**; este apêndice é só prova de rastreabilidade para o Gate humano. Método:
> leitura direta de `prisma/schema.prisma`, `app/actions/cadastros.ts`, `lib/whatsapp/*`,
> `lib/omni-agent/*` + busca por ausência (grep em todo o repo, excluindo `docs/`).

| # | Afirmação do ADR (PARTE 1/2) | Evidência verificada (arquivo:linha) | Veredito |
|---|---|---|---|
| A1 | `Cotacao` / `CotacaoItem` / `FornecedorCapacidade` **não existem** | grep `Cotacao\|FornecedorCapacidade` em todo o repo fora de `docs/` → **0 ocorrências** | ✅ 🔴 FALTA confirmado |
| A2 | `Fornecedor` é model REAL com os campos descritos | `prisma/schema.prisma:1120-1164` (`name`, `legalName`, `contactName`, `document`, `email`, `phone`, `whatsapp`, `address`, `productsProvided`, `avgLeadTime`, `paymentTerms`, `notes`, `active`, `storeId`) | ✅ 🟢 REAL |
| A3 | `Fornecedor.whatsapp` é **texto livre não normalizado** (não E.164) | `whatsapp String @default("")` — `prisma/schema.prisma:1142` | ✅ 🟡 PARCIAL confirmado |
| A4 | CRUD de fornecedor **multi-loja** | `FornecedorDTO` (`cadastros.ts:271`), `listFornecedores(storeId)` (`cadastros.ts:288`), `upsertFornecedor(...)` (`cadastros.ts:312`) | ✅ 🟢 REAL |
| A5 | `Fornecedor` ligado a `ContaPagarTitulo` | `contasPagar ContaPagarTitulo[]` (`schema.prisma:1164`) + `fornecedorId`/`fornecedor` em `ContaPagarTitulo` (`schema.prisma:1225-1226`) | ✅ 🟢 REAL |
| A6 | `EquipamentoModelo` tem `compatibleParts` / `commonDefects` (subutilizado) | `compatibleParts Json?` + `commonDefects Json?` — `schema.prisma:971-972` | ✅ 🟢 REAL |
| A7 | Catálogos `Produto` / `Servico` REAIS | `model Produto` (`schema.prisma:729`), `model Servico` (`schema.prisma:1029`) | ✅ 🟢 REAL |
| A8 | F2/F3/F4 resolvers existem | `lib/whatsapp/whatsapp-intent-classifier.ts`, `whatsapp-product-resolver.ts`, `whatsapp-device-resolver.ts`, `whatsapp-service-resolver.ts`, `whatsapp-assistance-quote.ts` | ✅ 🟢 REAL |
| A9 | `FORNECEDOR_COTACAO` existe **só como rótulo de intent** (sem motor) | `lib/whatsapp/whatsapp-intent-classifier.ts` (única ocorrência fora de docs/testes) | ✅ confirmado |
| A10 | Omni Agent = execução governada (gate + ACL) | `requiresConfirmation` + `INTENT_MODULE` em `lib/omni-agent/*` e `app/actions/omni-agent.ts` | ✅ 🟢 REAL |
| A11 | Outbound Cloud API vinculado à conversa | `sendCloudApiTextAndRecord` em `lib/whatsapp/*` + `app/api/whatsapp/send/route.ts` | ✅ 🟢 REAL |
| A12 | Camada IA assistida existe | `lib/whatsapp/ai-conversation-analysis.ts` | ✅ 🟢 REAL |
| A13 | WhatsApp models (inbox/contato/IA/roteamento multi-loja) | `WhatsAppContact:225`, `WhatsAppConversation:250`, `WhatsAppMessage:281`, `WhatsAppAiSetting:370`, `WhatsAppPhoneNumber:406` (`schema.prisma`) | ✅ 🟢 REAL |
| A14 | CRM `Cliente` REAL | `model Cliente` (`schema.prisma:598`) | ✅ 🟢 REAL |

**Conclusão da verificação:** as classificações REAL/PARCIAL/FALTA da PARTE 1 estão **fiéis ao código**
(nenhuma alucinação). As lacunas que justificam a F5 (modelo de cotação, capacidade estruturada do
fornecedor, normalização do WhatsApp, config comercial) são confirmadas **por ausência** no schema e
na base de código. O ADR está **pronto para Gate humano**.
