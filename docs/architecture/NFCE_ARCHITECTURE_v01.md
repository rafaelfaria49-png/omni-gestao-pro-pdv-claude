# Arquitetura Fiscal — NFC-e / SAT / TEF (Blueprint v01)

> **GOAL_NFCE_ARCHITECTURE_BLUEPRINT_V01** · Modo **READ ONLY** — documento de projeto.
> Nenhum código/schema/migration alterado. Todos os models, campos e estados aqui são
> **propostas de desenho** (no papel) para GOALs futuros, não estruturas existentes.
> Base factual: `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md` + auditorias do PDV.
> Data: 2026-06-18 · Branch: `main`.

---

## 0. Princípios de design (não-negociáveis)

1. **A camada fiscal é um SATÉLITE da venda, nunca o motor.** A venda operacional continua
   sendo criada pelo motor único (`finalizeSaleTransaction` → `/api/ops/venda-persist` →
   `upsertVendaInTransaction`). A emissão fiscal **observa** a venda persistida e produz um
   documento vinculado — não reescreve o fluxo de balcão.
2. **Operacional primeiro, fiscal depois.** A venda fecha, o caixa recebe, o estoque baixa —
   e *então* a NFC-e é emitida. O balcão nunca trava esperando SEFAZ (contingência).
3. **Imutabilidade após autorização.** Documento autorizado congela a venda fiscalmente.
   Tudo que muda depois vira **evento fiscal** (cancelamento/CC-e) ou **documento novo**
   (devolução/NF-e de entrada) — nunca edição silenciosa.
4. **Multi-tudo por `storeId`.** CNPJ, certificado, série, numeração, CSC e ambiente são
   **por loja**. Zero estado fiscal global, zero localStorage para segredo fiscal.
5. **Aditivo e dormente.** Toda a fundação entra desligada (`fiscalEnabled=false` por loja).
   PDV atual roda byte-idêntico enquanto o fiscal não é ativado loja a loja.
6. **Provider-agnóstico.** A emissão fica atrás de uma interface (`FiscalProvider`) — SEFAZ
   direto ou gateway (Focus/PlugNotas/eNotas/NFe.io) são implementações intercambiáveis.

---

## 1. Onde a emissão fiscal entra no fluxo

A emissão entra **depois da persistência operacional da venda e do recebimento**, como uma
etapa assíncrona/desacoplada disparada por evento:

```
[PDV: carrinho/pagamento]
        │  finalizeSaleTransaction (offline-first, inalterado)
        ▼
[/api/ops/venda-persist] → upsertVendaInTransaction
        │  (Venda + ItemVenda + estoque + MovimentacaoFinanceira + título à prazo)
        ▼
[Venda PERSISTIDA — fiscalStatus = NAO_FISCAL | PENDENTE]   ◄── ponto de entrada fiscal
        │
        │  se loja.fiscalEnabled e venda elegível → enfileira emissão
        ▼
[Orquestrador Fiscal]  (novo serviço, satélite)
        ▼
... (montagem → validação → assinatura → transmissão → autorização → DANFE)
```

**Decisão:** a emissão **não** é feita dentro da transação `upsertVendaInTransaction` (rede
externa não pode segurar lock de banco do balcão). É um passo **pós-commit**, idempotente,
disparado por evento/fila, com retry.

---

## 2. Em que momento a venda deixa de poder ser editada

Três fronteiras de imutabilidade crescente:

| Marco | O que congela |
|---|---|
| **Venda persistida** (hoje) | Nada além do já existente (correções liberadas com PIN+ACL). |
| **Emissão em andamento** (`EMITINDO`/`AUTORIZANDO`) | 🔒 Lock temporário: bloquear correções/cancelamento até resolver (evita corrigir item enquanto o XML está em trânsito). |
| **Autorizada** (`AUTORIZADA`) | 🔒 **Imutável fiscalmente**: itens, valores, total, pagamento que altere total, destinatário, numeração/chave/XML. Mudança só via **evento** ou **documento novo**. |

> A trava real será implementada como **guard por `fiscalStatus`** nas rotas `corrigir*` e
> `cancelar` (a `GOAL_VENDA_STATE_MACHINE`), reaproveitando o padrão de guard recém-criado
> (`requireCorrecaoVendaAuth`) — adiciona-se uma checagem de estado fiscal antes da de permissão.

---

## 3. Fluxo completo (carrinho → impressão)

```
┌─────────────┐
│  CARRINHO   │ PDV (Clássico/Assistência/Supermercado/Next/Venda Completa) — motor único
└──────┬──────┘
       ▼
┌─────────────┐
│  PAGAMENTO  │ PaymentBreakdownFull (+ futuro: tPag, TEF, PIX txid)
└──────┬──────┘
       ▼
┌──────────────┐
│ PERSISTÊNCIA │ upsertVendaInTransaction → Venda fiscalStatus=PENDENTE (se elegível)
└──────┬───────┘
       ▼
┌──────────────┐
│  VALIDAÇÃO   │ pré-cheque local: NCM/CFOP/CST por item, CSC/cert/série da loja,
│   (local)    │ dados do destinatário se CNPJ → se falhar: REJEITADA_LOCAL (não vai à SEFAZ)
└──────┬───────┘
       ▼
┌──────────────┐
│  MONTAGEM    │ build do XML NFC-e (mod 65) a partir do snapshot fiscal da venda + loja
│   + ASSINA   │ assinatura com certificado A1 da loja (storage seguro)
└──────┬───────┘
       ▼
┌──────────────┐
│ TRANSMISSÃO  │ FiscalProvider.transmitir() → SEFAZ (síncrono NFC-e)
└──────┬───────┘
       ▼
   ┌───┴────────────────────────┐
   ▼                            ▼
┌────────────┐           ┌──────────────┐
│ AUTORIZADA │           │  REJEITADA   │ (cStat ≠ 100) → trata por código (§7)
│ (cStat100) │           └──────┬───────┘
└─────┬──────┘                  │ corrigível? → corrige snapshot → reenvia
      ▼                         │ contingência? → §6
┌────────────┐                  ▼
│   DANFE     │            (loop controlado / fila)
│  NFC-e      │ gera DANFE (QR Code + chave + protocolo + URL consulta + tributos)
└─────┬──────┘
      ▼
┌────────────┐
│ IMPRESSÃO  │ pipeline térmico unificado (substitui/───estende os 3 cupons atuais)
└────────────┘
```

---

## 4. Cancelamento fiscal

- **Janela legal:** NFC-e autorizada pode ser **cancelada por evento** dentro do prazo (SP:
  ~30 min após autorização). Fora do prazo → **não cancela**; ajuste via NF-e de devolução/entrada.
- **Desenho:** o cancelamento operacional atual (`/api/vendas/[id]/cancelar`) ganha um **passo
  fiscal anterior**: se `fiscalStatus=AUTORIZADA`, primeiro emite **evento de cancelamento**
  (`EventoFiscal` tipo `CANCELAMENTO`) via provider; só em caso de sucesso prossegue com o
  estorno operacional (estoque/financeiro/CR) que já existe.
- **Idempotência:** o evento fiscal grava protocolo próprio; retry não duplica.
- **Bloqueio:** cancelamento operacional puro fica **proibido** para venda `AUTORIZADA` sem
  evento fiscal correspondente (guard).

---

## 5. Contingência (balcão nunca para)

- **Gatilho:** SEFAZ indisponível / timeout / sem internet no momento da venda.
- **Modo:** NFC-e em **contingência offline** — emite com série/numeração de contingência,
  imprime DANFE com aviso "EMITIDA EM CONTINGÊNCIA", e **enfileira a transmissão** para quando
  a SEFAZ voltar.
- **Estado:** `EM_CONTINGENCIA` → (online) → `AUTORIZADA` ou `REJEITADA`.
- **Alinhamento natural com o PWA:** o PDV já é **offline-first** (venda grava local e
  sincroniza). A contingência fiscal é o paralelo fiscal disso: a venda existe, o documento
  fiscal "sincroniza" depois. Reusar a mentalidade do `syncPending`.

---

## 6. Rejeições

- SEFAZ retorna `cStat` + motivo. Classificar em:
  - **Corrigível por dado** (NCM inválido, CSC errado, CST incompatível com regime) →
    `REJEITADA` → corrige snapshot/config → **reenvia** (mesma venda, nova tentativa).
  - **Duplicidade** (chave já autorizada) → reconciliar para `AUTORIZADA` (idempotência).
  - **Numeração** (número já usado/saltado) → avançar contador / **inutilizar** faixa.
  - **Fatal** (certificado vencido, loja sem credenciamento) → `BLOQUEADA_FISCAL` + alerta.
- Toda rejeição grava `EventoFiscal`/log com `cStat`, motivo e tentativa.

---

## 7. Reenvio

- **Idempotente por venda:** a venda tem no máximo **1 documento fiscal vigente**. O reenvio
  reusa o mesmo `NotaFiscal` (mesma série/número quando aplicável) e só troca a tentativa.
- **Backoff + fila:** tentativas com espaçamento; nunca em loop apertado contra a SEFAZ.
- **Manual + automático:** Workspace/Caixa expõem "reenviar" para o operador; um worker
  reprocessa `PENDENTE`/`EM_CONTINGENCIA` automaticamente.

---

## 8. Offline

- Venda **sempre** fecha offline (comportamento atual preservado).
- `fiscalStatus` nasce `PENDENTE`; emissão ocorre quando há rede.
- Se a loja exige documento no ato e está offline → **contingência** (§5).
- **Não** bloquear o balcão por causa de fiscal — princípio #2.

---

## 9. Certificados

- **Model novo `CertificadoDigital`** por `storeId`: tipo (A1), validade, fingerprint,
  **blob criptografado** do .pfx em storage seguro (NÃO localStorage, NÃO bundle, NÃO no
  schema em claro — referência a secret/objeto cifrado).
- Hoje: `DadosFiscais` em `lib/config-empresa.tsx` (localStorage, single-empresa) — **será
  substituído** por DB por loja (P0-B da auditoria).
- Senha do certificado: secret manager / env por loja, nunca em coluna legível.
- Validação de expiração antes de cada lote de emissão (cert vencido → `BLOQUEADA_FISCAL`).

---

## 10. SAT (CF-e — alternativa regional, SP)

- Em SP, SAT-CF-e é alternativa à NFC-e (equipamento + CF-e-SAT). Tratar como **outra
  implementação de `FiscalProvider`** (`SatProvider`) com o mesmo contrato de domínio
  (emitir/cancelar/consultar). A máquina de estados da venda é a mesma; muda o transporte.
- **Decisão:** desenhar o domínio **provider-agnóstico** para que NFC-e e SAT coexistam por
  loja (campo `modeloFiscal` na config da loja: `NFCE` | `SAT`).

---

## 11. TEF

- **Escopo separado da emissão.** TEF resolve o **pagamento eletrônico** (cartão/PIX via
  adquirente), não o documento fiscal. Mas alimenta a NFC-e com dados de pagamento (CNPJ
  credenciadora, bandeira, nº autorização/NSU).
- **Desenho:** `PaymentBreakdownFull` ganha (futuro) um detalhamento por transação TEF
  (`tefDetails[]`) capturado no checkout; a NFC-e consome para o grupo de pagamento (`tPag`,
  `card`).
- **Integração:** PayGo/SiTef/Stone Connect atrás de uma interface `TefProvider`. **Fase
  posterior** — NFC-e pode ir ao ar com pagamento informado manualmente antes do TEF.

---

## 12. PIX

- Hoje `pix` é uma forma genérica no breakdown. Para fiscal: `tPag=17` (PIX). Se houver
  PIX dinâmico/integrado, capturar `txid`/`e2eid` para conciliação (não obrigatório no XML,
  mas útil). **Não bloqueia** a primeira fase fiscal.

---

## 13. Impressão

- **Consolidar antes de fiscal** (P2-C da auditoria): hoje há 3 pipelines divergentes
  (`CupomNaoFiscal` HTML, `printPdvSaleReceipt` ESC/POS, recibo crediário).
- **DANFE-NFC-e** é um formato legal: cabeçalho do emitente, itens, totais, **tributos
  (Lei da Transparência, valor real)**, formas de pagamento, **chave de acesso (44)**,
  **protocolo**, **QR Code**, **URL de consulta**, mensagem fiscal, ambiente.
- **Desenho:** um builder único `buildDanfeNfce(nota, venda, loja)` que reaproveita o runtime
  térmico (`lib/pdv-print-runtime.ts`) já per-loja (ESC/POS + fallback HTML 58/80mm).

---

## 14. XML

- **Geração** a partir do **snapshot fiscal da venda** (não de dados ao vivo do produto —
  o produto pode mudar depois; a nota é foto do instante).
- **Assinatura** com `CertificadoDigital` da loja.
- **Armazenamento:** `NotaFiscal.xmlAutorizado` (e XML de cancelamento em `EventoFiscal`).
  XML é documento legal — **guarda por anos**, imutável, auditável.
- **Validação** contra schema XSD da SEFAZ antes de transmitir (pré-rejeição local).

---

## 15. DANFE

- Representação impressa do XML autorizado (§13). Gerada **somente** após `AUTORIZADA`
  (ou com tarja de contingência quando `EM_CONTINGENCIA`).
- Reimpressão sempre a partir do `NotaFiscal` persistido (idempotente, mesmo conteúdo).

---

## 16. Eventos fiscais

Model novo `EventoFiscal` (1 venda/nota → N eventos):

| Evento | Quando |
|---|---|
| `CANCELAMENTO` | Cancelar NFC-e dentro do prazo. |
| `CARTA_CORRECAO` (CC-e) | Corrigir dados permitidos (não valor/destinatário/itens). |
| `INUTILIZACAO` | Numeração saltada/queimada (gap de série). |
| `CONTINGENCIA_ENVIO` | Transmissão tardia de nota emitida offline. |

Cada evento: tipo, protocolo, XML do evento, `cStat`, timestamp, operador, `storeId`.

---

## 17. Estados internos da venda (`fiscalStatus`)

Proposta de enum (campo novo em `Venda`, aditivo, default `NAO_FISCAL`):

| Estado | Significado |
|---|---|
| `NAO_FISCAL` | Loja sem fiscal ou venda não elegível (default — comportamento atual). |
| `PENDENTE` | Elegível, aguardando emissão. |
| `EMITINDO` | Montando/assinando/transmitindo (lock de edição). |
| `EM_CONTINGENCIA` | Emitida offline, aguardando transmissão. |
| `AUTORIZADA` | cStat 100 — **imutável fiscalmente**. |
| `REJEITADA` | SEFAZ recusou — corrigir e reenviar. |
| `CANCELADA_FISCAL` | Evento de cancelamento autorizado. |
| `BLOQUEADA_FISCAL` | Falha fatal (cert vencido, loja sem credenciamento). |

---

## 18. Máquina de estados

```
                       loja.fiscalEnabled && elegível
        NAO_FISCAL ─────────────────────────────────► PENDENTE
                                                          │
                                          enfileira/dispara emissão
                                                          ▼
                                                      EMITINDO ──── sem rede / SEFAZ off ──► EM_CONTINGENCIA
                                                       │   │                                      │
                                          cStat 100 ◄──┘   └──► REJEITADA                         │ (rede volta)
                                                │               │   │                             │ transmite
                                                ▼               │   │ corrigível                  ▼
                                           AUTORIZADA           │   └──────────► PENDENTE ◄───────┘
                                            │     │             │ fatal
                            ≤ prazo cancel  │     │             ▼
                                            ▼     │        BLOQUEADA_FISCAL
                                   CANCELADA_FISCAL
                                   (> prazo → NF-e devolução, não cancelamento)
```

**Invariantes:**
- `AUTORIZADA` e `CANCELADA_FISCAL` são terminais para edição (só eventos/documentos novos).
- 1 venda → no máximo 1 `NotaFiscal` vigente (reenvio reusa).
- `EMITINDO`/`AUTORIZANDO` bloqueiam correções/cancelamento operacional.

---

## 19–24. Impactos nos módulos existentes

### 19. Workspace de Correção
- Ganha **leitura do `fiscalStatus`** e badge ("Autorizada — edição fiscalmente travada").
- Rotas `corrigir*` ganham **guard de estado fiscal** antes da lógica atual:
  - `AUTORIZADA` → bloquear correção de itens/pagamento(que muda total)/cliente.
  - editável sempre: observação interna, vencimento/obs de título, reparcelamento, metadados
    que não compõem a nota.
- Reaproveita o guard de ACL recém-criado (`requireCorrecaoVendaAuth`) — adiciona camada fiscal.

### 20. Caixa
- Fechamento **não muda de valor** (fiscal não altera dinheiro). Mas o caixa ganha **visão
  fiscal**: nº de notas autorizadas/pendentes/rejeitadas/contingência na sessão, e ação de
  "reenviar pendentes". `totalRecebido`/gaveta seguem a regra única já alinhada.

### 21. Financeiro
- **Sem impacto de valor.** A NFC-e é documento, não lançamento. MovimentacaoFinanceira segue
  como está (regra única receita à vista). O vínculo nota↔venda é só referência fiscal.

### 22. Estoque
- **Sem mudança de regra.** A baixa continua no `upsertVendaInTransaction` (já idempotente,
  anti-negativo). A NFC-e **descreve** a saída; não baixa estoque por conta própria.
  Cancelamento fiscal segue acompanhado do estorno de estoque que já existe.

### 23. Correções
- Maior área de impacto comportamental: a venda passa a ter **estados que restringem** o que
  o Workspace pode fazer. Hoje tudo é editável; pós-NFC-e a correção vira **carta de correção**
  (dados permitidos) ou é **proibida** (valor/itens/destinatário).

### 24. Devoluções
- Hoje: `DevolucaoVenda` + `ItemDevolucaoVenda` + `ClienteCredito`/`UsoCreditoCliente`
  (operacional, gera vale). Pós-fiscal: devolução de item de NFC-e autorizada (fora do prazo
  de cancelamento) deve, idealmente, gerar **NF-e de entrada/devolução** (modelo 55) — frente
  fiscal **posterior** à NFC-e de venda. Para o piloto, a devolução continua operacional e a
  nota fiscal de devolução fica como fase futura documentada.

---

## Respostas diretas (as 4 perguntas do GOAL)

**O que deve ser BLOQUEADO após autorização da NFC-e:** alterar itens/quantidade/preço/total;
forma de pagamento que mude o total ou a natureza; troca de destinatário/cliente; qualquer
mexida em numeração/série/chave/XML; cancelamento operacional puro (sem evento fiscal).

**O que pode continuar EDITÁVEL:** observação interna (não sai na nota); vencimento e
observação de título à prazo (Contas a Receber é financeiro, não fiscal); reparcelamento do
saldo à prazo; metadados de item (serial/IMEI/lote) que não compõem a nota.

**O que deve obrigatoriamente GERAR EVENTO FISCAL:** cancelamento dentro do prazo
(`CANCELAMENTO`); correção de dado permitido (`CARTA_CORRECAO`); numeração saltada
(`INUTILIZACAO`); transmissão tardia de contingência (`CONTINGENCIA_ENVIO`).

**O que precisa virar IMUTÁVEL:** itens, valores, total, pagamento que altere total,
destinatário, chave/numeração/série e o XML autorizado.

---

## Riscos encontrados

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| R-1 | Emitir dentro da transação de venda trava o balcão | 🔴 | Emissão pós-commit, assíncrona, com fila/retry. |
| R-2 | Certificado em localStorage (hoje) é inseguro e single-empresa | 🔴 | `CertificadoDigital` por loja em storage cifrado (P0-B). |
| R-3 | Venda editável após autorização → inconsistência fiscal | 🔴 | Máquina de estados + guards nas rotas `corrigir*`/`cancelar`. |
| R-4 | Dados fiscais do produto descartados no save (form) | 🟠 | `GOAL_PRODUTO_FISCAL_PERSIST` antes de emitir. |
| R-5 | NFC-e montada de dados ao vivo (produto muda depois) | 🟠 | Emitir do **snapshot fiscal** gravado na venda. |
| R-6 | Numeração concorrente (multi-terminal mesma loja) | 🟠 | `ContadorNumeracao` atômico por (loja, série). |
| R-7 | Regime tributário indefinido (Simples×Normal) | 🟠 | Config por loja decide CST↔CSOSN. |
| R-8 | 3 pipelines de cupom → DANFE seria o 4º | 🟡 | Consolidar impressão antes (P2-C). |
| R-9 | Acoplar a um provider específico | 🟡 | Interface `FiscalProvider` (SEFAZ/gateway/SAT intercambiáveis). |

---

## Dependências

- **Aprovação de schema** (fora deste GOAL): models fiscais aditivos.
- **Provedor de emissão** escolhido (SEFAZ direto × gateway) + ambiente de homologação.
- **Storage seguro** para certificado A1 (secret manager / blob cifrado).
- **Identidade fiscal por loja** (IE, regime, CSC/CSC-id, série, ambiente) no DB.
- **Consolidação de impressão** (P2-C) para o DANFE.

---

## Backlog recomendado (GOALs, em ordem)

1. `GOAL_FISCAL_SCHEMA_FOUNDATION` — models aditivos/dormentes: `ConfiguracaoFiscalLoja`,
   `CertificadoDigital`, `NotaFiscal`, `EventoFiscal`, `ContadorNumeracao` + `Venda.fiscalStatus`.
2. `GOAL_FISCAL_IDENTITY_PER_STORE` — config fiscal por loja sai do localStorage; certificado seguro.
3. `GOAL_VENDA_STATE_MACHINE` — `fiscalStatus` + guards de edição (Workspace/cancelar).
4. `GOAL_PRODUTO_FISCAL_PERSIST` — NCM/CEST/CFOP/CST/CSOSN/origem/unidade persistidos (fim do descarte).
5. `GOAL_VENDA_FISCAL_SNAPSHOT` — copiar dados fiscais do produto p/ o item no ato da venda.
6. `GOAL_FISCAL_PROVIDER_ABSTRACTION` — interface `FiscalProvider` + 1 implementação (homologação).
7. `GOAL_NFCE_EMISSION_PIPELINE` — montagem/validação/assinatura/transmissão/autorização.
8. `GOAL_DANFE_UNIFICADO` — consolidar impressão + DANFE-NFC-e (QR/chave/protocolo/tributos).
9. `GOAL_FISCAL_EVENTS` — cancelamento fiscal, contingência, rejeição/reenvio, inutilização.
10. `GOAL_TEF_INTEGRATION` (opcional) · `GOAL_SAT_PROVIDER` (regional) · `GOAL_NFE_DEVOLUCAO` (devoluções fiscais).

---

## Fases de implementação

- **Fase 0 — Fundação (não emite nada):** schema fiscal + identidade por loja + estados +
  produto/snapshot fiscal. Tudo **dormente** (`fiscalEnabled=false`). PDV inalterado.
- **Fase 1 — Emissão em homologação:** `FiscalProvider` + pipeline NFC-e contra ambiente de
  homologação de **1 loja piloto**. DANFE básico. Sem afetar produção.
- **Fase 2 — Produção controlada:** ativar 1 CNPJ real; contingência + rejeição/reenvio;
  travas de edição ligadas; caixa com visão fiscal.
- **Fase 3 — Eventos & robustez:** cancelamento fiscal, CC-e, inutilização, reprocessador.
- **Fase 4 — Expansão:** multi-loja fiscal, TEF, SAT (regional), NF-e de devolução.

---

## Ordem ideal das entregas (resumo)

`schema fiscal` → `identidade por loja` → `máquina de estados` → `produto fiscal` →
`snapshot na venda` → `provider+pipeline (homologação)` → `DANFE unificado` →
`eventos/contingência/reenvio` → `produção piloto` → `expansão (TEF/SAT/devolução)`.

> **Regra de ouro:** nada disso liga a emissão até a Fundação (Fase 0) estar completa e
> testada **dormente**. O PDV de balcão não pode regredir um milímetro enquanto a camada
> fiscal é construída ao lado.
