---
title: Fiscal Schema Design — desenho da fundação fiscal (GOAL_001A)
status: design-only
owner: produto/arquitetura
last_update: 2026-06-18
versao: v01
goal: GOAL_001A_FISCAL_SCHEMA_DESIGN
modo: READ ONLY / DESIGN ONLY
governado_por: docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md
baseia_se_em:
  - docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md
  - docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md
  - docs/architecture/NFCE_ARCHITECTURE_v01.md
  - prisma/schema.prisma (estado atual lido, NÃO alterado)
---

# 🧾 FISCAL SCHEMA DESIGN — OmniGestão Pro (GOAL_001A)

> **DESIGN ONLY.** Este documento **projeta** os models/enums/relacionamentos da fundação
> fiscal. **Nada** aqui foi aplicado: `prisma/schema.prisma` **não** foi tocado, nenhuma
> migration foi criada, nenhum `db:push` foi executado. Os blocos `prisma` abaixo são
> **propostas** para o **GOAL_001B** (execução), não estrutura existente.
>
> Regra-mãe (Master Plan §2): **aditivo + dormente**. Nenhuma venda existente quebra,
> nenhum PDV muda comportamento, nada depende de emissão fiscal. Multi-loja estrito
> (ADR-0003: **sem fallback `loja-1`**). Segredo fiscal **nunca** em claro/localStorage/bundle.

---

## 1. Resumo executivo

A fundação fiscal é desenhada como **camada satélite aditiva** sobre o schema atual. Ela
adiciona **8 models novos** + **1 coluna nova em `Venda`** (`fiscalStatus`, com default
`NAO_FISCAL`) + **back-relations aditivas** em `Store`/`Venda`. **Zero** alteração em
colunas existentes, **zero** migração destrutiva, **zero** mudança de comportamento do PDV
enquanto `fiscalEnabled = false` (default global).

**Models propostos (todos dormentes):**

| # | Model | Papel |
|---|---|---|
| 1 | `ConfiguracaoFiscalLoja` | Identidade fiscal por loja (CNPJ/IE/regime/CSC/endereço/ambiente/provider/flag). 1:1 com `Store`. |
| 2 | `CertificadoDigital` | Certificado A1 por loja — **só referência** ao blob cifrado e à senha (secret manager), nunca o `.pfx`/senha em claro. |
| 3 | `SerieFiscal` | Série + contador atômico de numeração por `(loja, modelo, série, ambiente)`. Resolve numeração concorrente multi-terminal. |
| 4 | `NotaFiscal` | Documento fiscal (cabeçalho + snapshot do emitente/destinatário/pagamento + chave/protocolo/XML). 1 venda → N tentativas, 1 vigente. |
| 5 | `NotaFiscalItem` | Snapshot fiscal **congelado** por item (NCM/CFOP/CST/CSOSN/origem/unidade + tributos). |
| 6 | `EventoFiscal` | Eventos da nota (cancelamento/CC-e/inutilização/contingência). 1 nota → N eventos. |
| 7 | `FiscalEmissaoJob` | Fila idempotente de emissão/cancelamento/contingência com retry/backoff/lock. |
| 8 | `FiscalLog` | Trilha append-only de toda interação fiscal (assinar/transmitir/consultar + `cStat`). |

**O que muda em tabelas existentes:** apenas **aditivo** — `Venda.fiscalStatus` (coluna nova,
default) e campos de relação inversa em `Store` e `Venda`. **Nenhuma** coluna de `Produto`,
`Cliente`, `MovimentacaoFinanceira`, `ContaReceberTitulo`, `DevolucaoVenda` é alterada neste
GOAL.

**Decisão central de segurança:** o `.pfx`, a senha do certificado e o **CSC token** **não**
moram em colunas legíveis. O schema guarda **apenas referências** (`blobRef`, `senhaRef`,
`cscTokenRef`) a um secret manager / bucket privado cifrado — espelhando o precedente
`WhatsAppPhoneNumber.tokenEnvKey` (ADR-0006: token na env, só o nome no DB).

---

## 2. Lista de enums propostos

Todos com prefixo `Fiscal*`/sufixo claro para não colidir com enums existentes
(`StatusOrdemServico`, `SessaoCaixaStatus`, etc.).

| Enum | Valores | Notas |
|---|---|---|
| `FiscalStatusVenda` | `NAO_FISCAL` · `PENDENTE` · `EMITINDO` · `EM_CONTINGENCIA` · `AUTORIZADA` · `REJEITADA` · `CANCELADA_FISCAL` · `BLOQUEADA_FISCAL` | Coluna `Venda.fiscalStatus`. Default `NAO_FISCAL`. Espelha §17 do blueprint. |
| `StatusNotaFiscal` | `RASCUNHO` · `VALIDANDO` · `ASSINADA` · `TRANSMITINDO` · `AUTORIZADA` · `REJEITADA` · `DENEGADA` · `CONTINGENCIA` · `CANCELADA` · `INUTILIZADA` · `ERRO` | Estado do **documento** (mais granular que o da venda). `Venda.fiscalStatus` é a visão "colapsada". |
| `ModeloFiscal` | `NFCE` (65) · `SAT` (CF-e) · `NFE` (55, futuro) | Suporta SAT e NF-e de devolução sem novo schema. |
| `AmbienteFiscal` | `HOMOLOGACAO` · `PRODUCAO` | Numeração e emissão isoladas por ambiente. |
| `TipoEmissao` | `NORMAL` · `CONTINGENCIA_OFFLINE` | NFC-e: `tpEmis` 1 vs 9. |
| `RegimeTributario` | `SIMPLES_NACIONAL` (CRT 1) · `SIMPLES_NACIONAL_EXCESSO` (CRT 2) · `REGIME_NORMAL` (CRT 3) · `MEI` | Decide CST × CSOSN. Resolve P1-D. |
| `FiscalProviderTipo` | `STUB_HOMOLOGACAO` · `SEFAZ_DIRETO` · `GATEWAY_FOCUS` · `GATEWAY_PLUGNOTAS` · `GATEWAY_ENOTAS` · `GATEWAY_NFEIO` · `SAT_LOCAL` | Provider-agnóstico (Master Plan §2.4). |
| `CertificadoStatus` | `PENDENTE_VALIDACAO` · `ATIVO` · `EXPIRADO` · `REVOGADO` · `INVALIDO` | Validação antes de cada lote. |
| `TipoEventoFiscal` | `CANCELAMENTO` · `CARTA_CORRECAO` · `INUTILIZACAO` · `CONTINGENCIA_ENVIO` | §16 do blueprint. |
| `StatusEventoFiscal` | `PENDENTE` · `AUTORIZADO` · `REJEITADO` | Estado do evento. |
| `FiscalJobTipo` | `EMISSAO` · `CANCELAMENTO` · `INUTILIZACAO` · `CONTINGENCIA_TRANSMISSAO` · `CONSULTA` | Tipos de trabalho na fila. |
| `FiscalJobStatus` | `PENDENTE` · `PROCESSANDO` · `AGUARDANDO_RETRY` · `CONCLUIDO` · `FALHA` · `CANCELADO` | Estado do job. |

> **`origemMercadoria`** (código 0–8 da tabela ICMS) e **CST/CSOSN** (códigos numéricos com
> zero à esquerda) ficam como **`String`/`Int`** com validação na aplicação, **não** enum —
> são tabelas oficiais que mudam por legislação; enum no banco engessaria.

---

## 3. Lista de models propostos

```
ConfiguracaoFiscalLoja   (1:1  Store)        → "configuracoes_fiscais_loja"
CertificadoDigital       (N:1  Store)        → "certificados_digitais"
SerieFiscal              (N:1  Store)        → "series_fiscais"
NotaFiscal               (N:1  Store, Venda) → "notas_fiscais"
NotaFiscalItem           (N:1  NotaFiscal)   → "notas_fiscais_itens"
EventoFiscal             (N:1  NotaFiscal)   → "eventos_fiscais"
FiscalEmissaoJob         (N:1  Store)        → "fiscal_emissao_jobs"
FiscalLog                (N:1  Store)        → "fiscal_logs"
```

Convenção seguida do schema atual: model PascalCase, `@@map` para nome de tabela em
snake/plural, `@map` em colunas quando o nome físico diverge, `@db.JsonB` para snapshots.

---

## 4. Campos de cada model

> Blocos **propostos** (GOAL_001B). Não aplicados. Tipos/nomes seguem o estilo do schema atual.

### 4.1 `ConfiguracaoFiscalLoja` — identidade fiscal por loja (1, 12)

```prisma
model ConfiguracaoFiscalLoja {
  id                 String   @id @default(cuid())
  storeId            String   @unique @map("storeId")          // 1:1 — SEM default "loja-1"
  store              Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  // Flags (Master Plan §10) — tudo nasce desligado
  fiscalEnabled      Boolean        @default(false) @map("fiscalEnabled")
  ambiente           AmbienteFiscal @default(HOMOLOGACAO) @map("ambiente")
  modeloFiscal       ModeloFiscal   @default(NFCE) @map("modeloFiscal")

  // Identidade fiscal
  razaoSocial        String   @default("") @map("razaoSocial")
  nomeFantasia       String   @default("") @map("nomeFantasia")
  cnpj               String   @default("") @map("cnpj")          // só dígitos
  inscricaoEstadual  String   @default("") @map("inscricaoEstadual")
  inscricaoMunicipal String   @default("") @map("inscricaoMunicipal")
  regimeTributario   RegimeTributario @default(SIMPLES_NACIONAL) @map("regimeTributario")
  crt                Int      @default(1) @map("crt")            // 1|2|3 (derivável do regime)

  // Endereço fiscal ESTRUTURADO (não JSON solto — exigência do XML)
  logradouro         String   @default("") @map("logradouro")
  numero             String   @default("") @map("numero")
  complemento        String   @default("") @map("complemento")
  bairro             String   @default("") @map("bairro")
  codigoMunicipioIbge String  @default("") @map("codigoMunicipioIbge") // 7 dígitos (cMun)
  municipio          String   @default("") @map("municipio")
  uf                 String   @default("") @map("uf")            // 2 letras
  cep                String   @default("") @map("cep")
  codigoPais         String   @default("1058") @map("codigoPais") // Brasil
  fone               String   @default("") @map("fone")
  email              String   @default("") @map("email")

  // CSC (NFC-e) — segredo: SÓ referência, nunca o token em claro
  cscId              String   @default("") @map("cscId")         // idToken/idCsc (não-secreto)
  cscTokenRef        String?  @map("cscTokenRef")                // chave no secret manager / env key

  // Provider (Master Plan §2.4) — token do gateway também por referência
  provider           FiscalProviderTipo @default(STUB_HOMOLOGACAO) @map("provider")
  providerConfig     Json?    @map("providerConfig") @db.JsonB   // endpoints/timeouts (NÃO segredo)
  providerTokenRef   String?  @map("providerTokenRef")           // chave no secret manager

  certificadoAtivoId String?  @map("certificadoAtivoId")         // ponteiro p/ cert vigente

  createdAt          DateTime @default(now()) @map("createdAt")
  updatedAt          DateTime @updatedAt @map("updatedAt")

  @@index([fiscalEnabled])
  @@map("configuracoes_fiscais_loja")
}
```

### 4.2 `CertificadoDigital` — certificado A1 por loja (2)

```prisma
model CertificadoDigital {
  id            String   @id @default(cuid())
  storeId       String   @map("storeId")                         // SEM default "loja-1"
  store         Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  apelido       String   @default("") @map("apelido")
  tipo          String   @default("A1") @map("tipo")             // A1 (A3 futuro)
  titularCn     String   @default("") @map("titularCn")          // CN do certificado
  cnpjTitular   String   @default("") @map("cnpjTitular")        // só dígitos
  serialNumber  String   @default("") @map("serialNumber")
  fingerprint   String   @default("") @map("fingerprint")        // sha256 (identifica, não é segredo)
  validoDe      DateTime? @map("validoDe")
  validoAte     DateTime? @map("validoAte")
  status        CertificadoStatus @default(PENDENTE_VALIDACAO) @map("status")
  ativo         Boolean  @default(false) @map("ativo")

  // SEGREDO — só referência, jamais bytes/senha em claro
  blobRef       String?  @map("blobRef")                         // bucket privado cifrado / secret manager
  senhaRef      String?  @map("senhaRef")                        // chave do secret manager p/ a senha do .pfx

  uploadedBy    String?  @map("uploadedBy")
  createdAt     DateTime @default(now()) @map("createdAt")
  updatedAt     DateTime @updatedAt @map("updatedAt")

  notasAssinadas NotaFiscal[]

  @@index([storeId])
  @@index([storeId, ativo])
  @@index([validoAte])
  @@map("certificados_digitais")
}
```

### 4.3 `SerieFiscal` — série e numeração (3)

```prisma
model SerieFiscal {
  id             String       @id @default(cuid())
  storeId        String       @map("storeId")                    // SEM default "loja-1"
  store          Store        @relation(fields: [storeId], references: [id], onDelete: Cascade)

  modelo         ModeloFiscal @default(NFCE) @map("modelo")
  ambiente       AmbienteFiscal @default(HOMOLOGACAO) @map("ambiente")
  serie          Int          @default(1) @map("serie")
  proximoNumero  Int          @default(1) @map("proximoNumero")  // contador atômico
  descricao      String       @default("") @map("descricao")
  ativo          Boolean      @default(true) @map("ativo")

  createdAt      DateTime     @default(now()) @map("createdAt")
  updatedAt      DateTime     @updatedAt @map("updatedAt")

  notas          NotaFiscal[]

  @@unique([storeId, modelo, serie, ambiente])                   // 1 série por loja/modelo/ambiente
  @@index([storeId])
  @@map("series_fiscais")
}
```

> **Numeração atômica:** o próximo número é obtido dentro da transação de emissão por
> `UPDATE ... SET proximoNumero = proximoNumero + 1 RETURNING` (ou `SELECT ... FOR UPDATE`),
> garantindo unicidade mesmo com vários terminais da mesma loja emitindo em paralelo (P1-E).

### 4.4 `NotaFiscal` — documento + snapshot de cabeçalho (4, 5, 14)

```prisma
model NotaFiscal {
  id               String   @id @default(cuid())
  storeId          String   @map("storeId")                      // SEM default "loja-1"
  store            Store    @relation(fields: [storeId], references: [id], onDelete: Restrict)

  vendaId          String   @map("vendaId")
  venda            Venda    @relation(fields: [vendaId], references: [id], onDelete: Restrict)

  modelo           ModeloFiscal   @default(NFCE) @map("modelo")
  ambiente         AmbienteFiscal @map("ambiente")
  tipoEmissao      TipoEmissao    @default(NORMAL) @map("tipoEmissao")
  status           StatusNotaFiscal @default(RASCUNHO) @map("status")
  vigente          Boolean        @default(true) @map("vigente")  // 1 vigente por venda

  serieFiscalId    String?  @map("serieFiscalId")
  serieFiscal      SerieFiscal? @relation(fields: [serieFiscalId], references: [id], onDelete: SetNull)
  serie            Int?     @map("serie")                         // congelado no instante
  numero           Int?     @map("numero")

  // Resultado SEFAZ
  chaveAcesso      String?  @unique @map("chaveAcesso")           // 44 dígitos
  protocolo        String?  @map("protocolo")                     // nProt
  cStat            String?  @map("cStat")
  xMotivo          String?  @map("xMotivo")
  dataAutorizacao  DateTime? @map("dataAutorizacao")
  digestValue      String?  @map("digestValue")
  qrCodeData       String?  @map("qrCodeData") @db.Text           // URL completa do QR (NFC-e)
  urlConsulta      String?  @map("urlConsulta")

  // Totais
  valorTotal         Float  @default(0) @map("valorTotal")
  valorDesconto      Float  @default(0) @map("valorDesconto")
  valorFrete         Float  @default(0) @map("valorFrete")
  valorTotalTributos Float  @default(0) @map("valorTotalTributos") // Lei da Transparência

  // SNAPSHOTS congelados (foto do instante — não dado ao vivo)
  snapshotEmitente     Json? @map("snapshotEmitente") @db.JsonB    // CNPJ/IE/regime/endereço da loja
  snapshotDestinatario Json? @map("snapshotDestinatario") @db.JsonB // cliente/CPF-CNPJ/endereço
  snapshotPagamento    Json? @map("snapshotPagamento") @db.JsonB    // tPag mapeado do PaymentBreakdown

  // XML (documento legal — guarda por anos)
  xmlAssinado      String?  @map("xmlAssinado") @db.Text
  xmlAutorizado    String?  @map("xmlAutorizado") @db.Text
  xmlStorageRef    String?  @map("xmlStorageRef")                 // offload opcional p/ bucket

  certificadoId    String?  @map("certificadoId")
  certificado      CertificadoDigital? @relation(fields: [certificadoId], references: [id], onDelete: SetNull)

  // Operacional / idempotência
  localKey         String?  @map("localKey")                      // "nfce:{storeId}:{vendaId}"
  tentativas       Int      @default(0) @map("tentativas")
  ultimoErro       String?  @map("ultimoErro")
  emitidaPor       String?  @map("emitidaPor")                    // operador
  dataContingencia DateTime? @map("dataContingencia")
  justContingencia String?  @map("justContingencia")

  createdAt        DateTime @default(now()) @map("createdAt")
  updatedAt        DateTime @updatedAt @map("updatedAt")

  itens            NotaFiscalItem[]
  eventos          EventoFiscal[]

  @@unique([storeId, modelo, serie, numero, ambiente])           // não repete número
  @@unique([storeId, localKey])                                   // idempotência por venda
  @@index([storeId])
  @@index([storeId, status])
  @@index([vendaId])
  @@map("notas_fiscais")
}
```

### 4.5 `NotaFiscalItem` — snapshot fiscal por item (6, 5)

```prisma
model NotaFiscalItem {
  id             String   @id @default(cuid())
  notaFiscalId   String   @map("notaFiscalId")
  notaFiscal     NotaFiscal @relation(fields: [notaFiscalId], references: [id], onDelete: Cascade)

  itemVendaId    String?  @map("itemVendaId")                    // rastro p/ o ItemVenda (sem FK rígida)
  produtoId      String?  @map("produtoId")                      // rastro p/ Produto (sem FK rígida)
  numeroItem     Int      @default(1) @map("numeroItem")         // nItem

  // SNAPSHOT FISCAL CONGELADO do produto (origem em GOAL_004/005)
  codigoProduto  String   @default("") @map("codigoProduto")     // cProd
  descricao      String   @default("") @map("descricao")         // xProd
  gtin           String?  @map("gtin")                           // cEAN
  ncm            String   @default("") @map("ncm")               // 8 díg.
  cest           String?  @map("cest")                           // 7 díg.
  cfop           String   @default("") @map("cfop")              // 4 díg.
  cst            String?  @map("cst")                            // regime normal
  csosn          String?  @map("csosn")                          // Simples
  origemMercadoria Int    @default(0) @map("origemMercadoria")   // 0..8
  unidadeComercial String @default("UN") @map("unidadeComercial")// uCom

  quantidade     Float    @default(1) @map("quantidade")         // qCom (fiscal aceita decimal)
  valorUnitario  Float    @default(0) @map("valorUnitario")      // vUnCom
  valorBruto     Float    @default(0) @map("valorBruto")
  valorDesconto  Float    @default(0) @map("valorDesconto")
  valorTotal     Float    @default(0) @map("valorTotal")         // vProd

  // Tributos congelados (grupo ICMS/PIS/COFINS)
  baseCalculoIcms Float   @default(0) @map("baseCalculoIcms")
  aliquotaIcms    Float   @default(0) @map("aliquotaIcms")
  valorIcms       Float   @default(0) @map("valorIcms")
  valorTributos   Float   @default(0) @map("valorTributos")      // transparência por item

  createdAt      DateTime @default(now()) @map("createdAt")

  @@index([notaFiscalId])
  @@map("notas_fiscais_itens")
}
```

### 4.6 `EventoFiscal` — eventos (7)

```prisma
model EventoFiscal {
  id            String   @id @default(cuid())
  storeId       String   @map("storeId")                         // SEM default "loja-1"
  store         Store    @relation(fields: [storeId], references: [id], onDelete: Restrict)

  notaFiscalId  String   @map("notaFiscalId")
  notaFiscal    NotaFiscal @relation(fields: [notaFiscalId], references: [id], onDelete: Cascade)

  tipo          TipoEventoFiscal @map("tipo")
  sequencia     Int      @default(1) @map("sequencia")           // nSeqEvento
  status        StatusEventoFiscal @default(PENDENTE) @map("status")

  protocolo     String?  @map("protocolo")
  cStat         String?  @map("cStat")
  xMotivo       String?  @map("xMotivo")
  justificativa String?  @map("justificativa")                   // cancelamento ≥ 15 chars
  xmlEvento     String?  @map("xmlEvento") @db.Text
  xmlRetorno    String?  @map("xmlRetorno") @db.Text

  dataEvento    DateTime @default(now()) @map("dataEvento")
  operador      String?  @map("operador")
  createdAt     DateTime @default(now()) @map("createdAt")
  updatedAt     DateTime @updatedAt @map("updatedAt")

  @@unique([notaFiscalId, tipo, sequencia])                      // idempotência do evento
  @@index([storeId])
  @@map("eventos_fiscais")
}
```

### 4.7 `FiscalEmissaoJob` — fila + contingência (8, 9)

```prisma
model FiscalEmissaoJob {
  id               String   @id @default(cuid())
  storeId          String   @map("storeId")                      // SEM default "loja-1"
  store            Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  vendaId          String   @map("vendaId")
  notaFiscalId     String?  @map("notaFiscalId")

  tipo             FiscalJobTipo  @default(EMISSAO) @map("tipo")
  status           FiscalJobStatus @default(PENDENTE) @map("status")

  tentativas       Int      @default(0) @map("tentativas")
  maxTentativas    Int      @default(5) @map("maxTentativas")
  proximaTentativaEm DateTime? @map("proximaTentativaEm")        // backoff
  prioridade       Int      @default(0) @map("prioridade")

  // Lock cooperativo de worker (espelha mentalidade do lock de terminal PDV)
  lockOwner        String?  @map("lockOwner")
  lockedAt         DateTime? @map("lockedAt")
  lockExpiresAt    DateTime? @map("lockExpiresAt")

  dedupeKey        String?  @map("dedupeKey")                    // "emissao:{storeId}:{vendaId}"
  payload          Json?    @map("payload") @db.JsonB
  ultimoErro       String?  @map("ultimoErro")
  concluidoEm      DateTime? @map("concluidoEm")

  createdAt        DateTime @default(now()) @map("createdAt")
  updatedAt        DateTime @updatedAt @map("updatedAt")

  @@unique([storeId, dedupeKey])                                 // idempotência da fila
  @@index([status, proximaTentativaEm])                          // polling do worker
  @@index([storeId])
  @@map("fiscal_emissao_jobs")
}
```

### 4.8 `FiscalLog` — trilha append-only (10)

```prisma
model FiscalLog {
  id            String   @id @default(cuid())
  storeId       String   @map("storeId")                         // SEM default "loja-1"
  store         Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  vendaId       String?  @map("vendaId")
  notaFiscalId  String?  @map("notaFiscalId")
  eventoFiscalId String? @map("eventoFiscalId")
  jobId         String?  @map("jobId")

  nivel         String   @default("INFO") @map("nivel")          // INFO|WARN|ERROR
  acao          String   @default("") @map("acao")               // montar_xml|assinar|transmitir|consultar
  cStat         String?  @map("cStat")
  xMotivo       String?  @map("xMotivo")
  mensagem      String   @default("") @map("mensagem")
  detalhe       Json?    @map("detalhe") @db.JsonB
  operador      String?  @map("operador")

  createdAt     DateTime @default(now()) @map("createdAt")       // append-only (sem updatedAt)

  @@index([storeId, createdAt])
  @@index([notaFiscalId])
  @@map("fiscal_logs")
}
```

### 4.9 Alteração aditiva em `Venda` (14)

```prisma
// dentro de model Venda — APENAS ESTAS ADIÇÕES:
  fiscalStatus  FiscalStatusVenda @default(NAO_FISCAL) @map("fiscalStatus")
  notasFiscais  NotaFiscal[]
  // (índice novo, opcional)
  // @@index([storeId, fiscalStatus])
```

### 4.10 Back-relations aditivas em `Store` (16)

```prisma
// dentro de model Store — APENAS campos de relação inversa (NÃO geram coluna física):
  configuracaoFiscal ConfiguracaoFiscalLoja?
  certificados       CertificadoDigital[]
  seriesFiscais      SerieFiscal[]
  notasFiscais       NotaFiscal[]
  eventosFiscais     EventoFiscal[]
  fiscalEmissaoJobs  FiscalEmissaoJob[]
  fiscalLogs         FiscalLog[]
```

---

## 5. Relacionamentos

```
Store 1───1 ConfiguracaoFiscalLoja        (storeId @unique)
Store 1───N CertificadoDigital            (1 ativo por vez — app-enforced)
Store 1───N SerieFiscal                   (por modelo+série+ambiente)
Store 1───N NotaFiscal
Store 1───N EventoFiscal
Store 1───N FiscalEmissaoJob
Store 1───N FiscalLog

Venda 1───N NotaFiscal                     (N tentativas, 1 vigente=true)
NotaFiscal 1───N NotaFiscalItem            (Cascade)
NotaFiscal 1───N EventoFiscal              (Cascade)
NotaFiscal N───1 CertificadoDigital        (SetNull — qual cert assinou)
NotaFiscal N───1 SerieFiscal               (SetNull)
```

**Política de `onDelete`:**
- `Cascade` apenas em filhos puramente fiscais (`NotaFiscalItem`, `EventoFiscal` sob `NotaFiscal`; jobs/logs/config/cert sob `Store`).
- `Restrict` em `NotaFiscal → Store` e `NotaFiscal → Venda`: **documento fiscal não pode ser apagado** por deleção de venda/loja (é registro legal).
- `SetNull` em `NotaFiscal → Certificado/Serie`: trocar/expirar certificado ou série **não** apaga a nota; preserva o histórico.

---

## 6. Índices

| Model | Índices propostos | Por quê |
|---|---|---|
| `ConfiguracaoFiscalLoja` | `@@index([fiscalEnabled])` + `@@unique([storeId])` | Listar lojas com fiscal ligado; 1:1. |
| `CertificadoDigital` | `[storeId]`, `[storeId, ativo]`, `[validoAte]` | Buscar cert ativo; varredura de expiração. |
| `SerieFiscal` | `[storeId]` + `@@unique([storeId, modelo, serie, ambiente])` | Lookup do contador. |
| `NotaFiscal` | `[storeId]`, `[storeId, status]`, `[vendaId]` + `@@unique([chaveAcesso])` + `@@unique([storeId, modelo, serie, numero, ambiente])` + `@@unique([storeId, localKey])` | Painel fiscal por status; nota da venda; numeração/idempotência. |
| `NotaFiscalItem` | `[notaFiscalId]` | Itens da nota. |
| `EventoFiscal` | `[storeId]` + `@@unique([notaFiscalId, tipo, sequencia])` | Eventos por nota; idempotência. |
| `FiscalEmissaoJob` | `[status, proximaTentativaEm]`, `[storeId]` + `@@unique([storeId, dedupeKey])` | **Polling do worker** (índice composto chave); idempotência. |
| `FiscalLog` | `[storeId, createdAt]`, `[notaFiscalId]` | Trilha por loja/tempo e por nota. |
| `Venda` | (opcional) `[storeId, fiscalStatus]` | Reprocessar pendentes/contingência por loja. |

---

## 7. Constraints únicas

| Constraint | Garante |
|---|---|
| `ConfiguracaoFiscalLoja @@unique([storeId])` | 1 config fiscal por loja (1:1). |
| `SerieFiscal @@unique([storeId, modelo, serie, ambiente])` | 1 contador por série/ambiente. |
| `NotaFiscal @@unique([chaveAcesso])` | Chave de acesso (44) global única. Nulos múltiplos OK (Postgres) até autorizar. |
| `NotaFiscal @@unique([storeId, modelo, serie, numero, ambiente])` | Não reusar número na mesma série/ambiente. |
| `NotaFiscal @@unique([storeId, localKey])` | Idempotência: 1 venda → 1 documento vigente (reenvio reusa). |
| `EventoFiscal @@unique([notaFiscalId, tipo, sequencia])` | Não duplicar evento (retry idempotente). |
| `FiscalEmissaoJob @@unique([storeId, dedupeKey])` | Não enfileirar o mesmo trabalho duas vezes. |

> **"1 vigente por venda"** (`NotaFiscal.vigente`) é regra de aplicação. Se quisermos
> garantir no banco, usar **índice único parcial** em GOAL_001B:
> `CREATE UNIQUE INDEX ... ON notas_fiscais (storeId, vendaId) WHERE vigente = true;`
> (Prisma não expressa índice parcial direto → SQL na migration). Decisão para GOAL_001B.

---

## 8. Estratégia de multi-loja

- **Toda** tabela fiscal tem `storeId` + `@@index([storeId])`. Nenhuma consulta fiscal roda
  sem escopo de loja (alinhado ao header `x-assistec-loja-id`).
- **Sem `@default("loja-1")` em NENHUMA tabela fiscal nova** — divergência **intencional** das
  tabelas legadas (`Venda`/`Cliente`/`Produto` têm o default histórico). ADR-0003 proíbe o
  fallback; tabelas novas nascem limpas. `storeId` é **sempre** explícito na escrita.
- Identidade, certificado, série, numeração, CSC, ambiente e provider são **por loja**
  (multi-CNPJ real). Zero estado fiscal global.
- `ConfiguracaoFiscalLoja` é **1:1** com `Store` — substitui o `DadosFiscais` em localStorage
  single-empresa (P0-B). A migração de UI/CRUD é **GOAL_002**, não GOAL_001B.

---

## 9. Estratégia de certificado

**Princípio:** o schema **referencia** o segredo; nunca o contém em claro
(Master Plan §2.6; blueprint §9). Precedente: `WhatsAppPhoneNumber.tokenEnvKey`.

- `CertificadoDigital` guarda **metadados** (titular, serial, fingerprint, validade, status) +
  **dois ponteiros**: `blobRef` (objeto `.pfx` cifrado em bucket privado / secret manager) e
  `senhaRef` (chave do secret manager para a senha do `.pfx`).
- **Nunca** colunas `pfxBytes`/`senha` legíveis. **Nunca** localStorage/bundle.
- `cscTokenRef` segue o mesmo padrão (o CSC token também é segredo, usado no hash do QR NFC-e).
- **Decisão deixada para GOAL_002** (não GOAL_001B): qual cofre — Supabase Storage privado com
  envelope encryption (app-side) **vs** secret manager dedicado. O schema acomoda ambos
  (são só strings de referência).
- Validação de expiração (`validoAte`) antes de cada lote; cert vencido → venda vai a
  `BLOQUEADA_FISCAL` (não emite). `@@index([validoAte])` suporta a varredura.
- 1 certificado `ativo` por loja por vez (app-enforced; `certificadoAtivoId` na config aponta o vigente).

---

## 10. Estratégia de séries e numeração

- Contador **por `(storeId, modelo, serie, ambiente)`** em `SerieFiscal.proximoNumero`.
- **Atômico:** incremento dentro da transação de emissão (`UPDATE ... RETURNING` /
  `SELECT ... FOR UPDATE`) → seguro com **multi-terminal** na mesma loja (P1-E). Funciona no
  pooler do Supabase (pgBouncer transaction mode) porque o lock vive **dentro** da transação.
- **Homologação e produção têm numeração separada** (ambiente na chave) → testes não queimam
  número de produção.
- **Contingência** pode usar série própria (ex.: série 9xx) — configurável; o número sai do
  mesmo mecanismo atômico.
- **Inutilização** de gaps (número saltado/queimado) é registrada como `EventoFiscal` tipo
  `INUTILIZACAO` (não apaga linha; trilha auditável).
- A **série/número são congelados na `NotaFiscal`** (`serie`/`numero`) no instante da emissão —
  o `SerieFiscal` evolui, a nota guarda a foto.

---

## 11. Estratégia de snapshot fiscal

**Princípio (blueprint §14):** a nota é **foto do instante**, nunca dado ao vivo. Produto,
preço, cliente ou config que mudem **depois** não alteram a nota emitida.

- **Cabeçalho:** `NotaFiscal.snapshotEmitente` (CNPJ/IE/regime/endereço da loja no ato),
  `snapshotDestinatario` (cliente/CPF-CNPJ/endereço), `snapshotPagamento` (formas → `tPag`).
- **Itens:** `NotaFiscalItem` congela `codigoProduto/descricao/ncm/cest/cfop/cst/csosn/origem/
  unidade/quantidade/valores/tributos`. É o snapshot por linha.
- **Origem dos dados fiscais do item:** vêm de `Produto` (colunas fiscais que **GOAL_004**
  adiciona) e são **copiados** para o item no ato da venda em **GOAL_005**. Até lá, a estrutura
  existe **dormente** e vazia.
- `itemVendaId`/`produtoId` são **rastros** (sem FK rígida → `String?`): apagar/alterar o
  produto **não** quebra a nota nem a deleta.

---

## 12. Estratégia de eventos fiscais

- `EventoFiscal` 1:N a partir de `NotaFiscal`. Cada evento: tipo, `sequencia` (nSeqEvento),
  status, protocolo, `cStat`, justificativa, XML do evento + retorno, operador, `storeId`.
- **Idempotência:** `@@unique([notaFiscalId, tipo, sequencia])` → retry não duplica.
- **Cancelamento:** evento `CANCELAMENTO` (justificativa ≥15) **antes** do estorno operacional
  já existente (`/api/vendas/[id]/cancelar`); só com sucesso fiscal prossegue (GOAL_009).
- **CC-e/inutilização/contingência-envio:** mesma tabela, tipos distintos.
- O `EventoFiscal` autorizado de cancelamento leva `Venda.fiscalStatus → CANCELADA_FISCAL` e
  `NotaFiscal.status → CANCELADA` (lógica em GOAL_009).

---

## 13. Estratégia de fila/contingência

- **Fila:** `FiscalEmissaoJob` desacopla a emissão do balcão (princípio P0-D: nunca emitir
  dentro de `upsertVendaInTransaction`). Job criado **pós-commit**, processado por worker.
- **Retry/backoff:** `tentativas`/`maxTentativas`/`proximaTentativaEm`; índice
  `[status, proximaTentativaEm]` para polling barato.
- **Lock cooperativo:** `lockOwner`/`lockedAt`/`lockExpiresAt` (TTL) — espelha o lock de
  terminal PDV (Fase 2). Evita dois workers no mesmo job.
- **Idempotência:** `dedupeKey` único por `(storeId, dedupeKey)`.
- **Contingência:** **não** precisa de tabela própria. É a combinação de
  `NotaFiscal.tipoEmissao = CONTINGENCIA_OFFLINE` + `Venda.fiscalStatus = EM_CONTINGENCIA` +
  um `FiscalEmissaoJob` tipo `CONTINGENCIA_TRANSMISSAO` agendado para quando a SEFAZ voltar.
  Reaproveita a mentalidade `syncPending` do PWA (blueprint §5).

---

## 14. Impacto em `Venda`

- **Adiciona** 1 coluna: `fiscalStatus FiscalStatusVenda @default(NAO_FISCAL)`. Em Postgres ≥11
  adicionar coluna `NOT NULL` com **default constante** é operação de **metadados** (instantânea,
  sem reescrever a tabela) → seguro em tabela quente.
- **Adiciona** back-relation `notasFiscais NotaFiscal[]` (sem coluna física).
- (Opcional) índice `[storeId, fiscalStatus]` para reprocessar pendentes.
- **Nenhuma** coluna existente (`pedidoId`/`payload`/`total`/`status`/`operador`/…) é alterada.
- Comportamento: toda venda nova/antiga fica `NAO_FISCAL` → **PDV byte-idêntico**. A venda só
  sai de `NAO_FISCAL` quando a loja tem `fiscalEnabled = true` (GOAL_003+).
- `status` (ciclo operacional: concluida/cancelada/devolvida) e `fiscalStatus` (ciclo fiscal)
  são **dimensões ortogonais** — não se misturam.

---

## 15. Impacto em `Produto`

- **GOAL_001B: zero alteração em `Produto`.** As colunas fiscais do produto
  (NCM/CEST/CFOP/CST/CSOSN/origem/unidade — hoje descartadas no save, P1-A) são escopo do
  **GOAL_004 (Produto Fiscal Persist)**, conforme o Master Plan §3.
- O `NotaFiscalItem` **prevê** receber esses campos como snapshot, mas a **cópia** só acontece
  em GOAL_005, lendo de GOAL_004. Enquanto isso, o snapshot nasce vazio/dormente.
- Mantém-se a regra do projeto: `Produto.metadata` (JSONB) **não** vira fonte fiscal canônica;
  GOAL_004 promove os campos a colunas/contrato próprio.

---

## 16. Impacto em `Store`

- **GOAL_001B: nenhuma coluna nova em `Store`.** A identidade fiscal **não** entra como colunas
  em `Store` — entra na tabela nova `ConfiguracaoFiscalLoja` (1:1). `Store.cnpj`/`Store.address`
  atuais ficam intactos (uso geral/UI); o CNPJ/endereço **fiscais** (estruturados, com código
  IBGE) vivem na config fiscal.
- A única edição no bloco `Store` são **campos de relação inversa** (`configuracaoFiscal`,
  `certificados`, `seriesFiscais`, `notasFiscais`, `eventosFiscais`, `fiscalEmissaoJobs`,
  `fiscalLogs`) — Prisma exige o lado inverso, mas **não geram coluna física** nem migração de dados.

---

## 17. O que entra no GOAL_001B (execução)

1. Adicionar ao `schema.prisma` os **11 enums** (§2) e **8 models** (§3–4), **dormentes**.
2. Adicionar `Venda.fiscalStatus` (default `NAO_FISCAL`) + back-relation; back-relations em `Store`.
3. Gerar migration **aditiva** (`prisma migrate dev`/`diff`), revisar o SQL (só `CREATE TABLE`/
   `CREATE TYPE`/`ALTER TABLE ADD COLUMN ... DEFAULT`/`CREATE INDEX`), **Gate de schema**.
4. Índice único **parcial** "1 nota vigente por venda" via SQL na migration.
5. `prisma generate` + `tsc --noEmit` + `npm run build` + `vitest run` (provar PDV byte-idêntico).
6. **Nada de service/UI/lógica fiscal.** Só schema + geração de client. Tudo `fiscalEnabled=false`.

---

## 18. O que fica fora (de GOAL_001B)

- **CRUD/UI da identidade fiscal** e migração do `DadosFiscais` (localStorage → DB) → **GOAL_002**.
- **Decisão do cofre de segredo** (bucket cifrado × secret manager) e upload do certificado → **GOAL_002**.
- **Colunas fiscais em `Produto`** (NCM/CFOP/CST/…): persistência e fim do descarte no form → **GOAL_004**.
- **Cópia produto→item** (preencher o snapshot) → **GOAL_005**.
- **Guards de estado** nas rotas `corrigir*`/`cancelar` (máquina de estados) → **GOAL_003**.
- **Interface `FiscalProvider`** e qualquer SDK → **GOAL_006**.
- **Montagem/assinatura/transmissão de XML**, worker da fila, DANFE, eventos reais → **GOAL_007+**.
- **TEF** (detalhamento de pagamento por transação) e **SAT** (CF-e) → expansão; o schema só
  **acomoda** (enum `ModeloFiscal.SAT`, provider `SAT_LOCAL`, snapshot de pagamento), sem tabela nova agora.

---

## 19. Riscos

| # | Risco | Sev | Mitigação no desenho |
|---|---|---|---|
| RS-1 | Adicionar `fiscalStatus` reescreve a tabela `Venda` (quente) | 🟠 | Default **constante** → ADD COLUMN é metadado em PG ≥11 (instantâneo). Validar versão PG do Supabase. |
| RS-2 | Segredo (cert/senha/CSC) vazar em coluna legível | 🔴 | Só **referências** (`blobRef`/`senhaRef`/`cscTokenRef`); cofre definido em GOAL_002. |
| RS-3 | Numeração duplicada multi-terminal | 🟠 | Contador atômico por `(loja, modelo, série, ambiente)` em transação. |
| RS-4 | XML grande inchar a tabela `notas_fiscais` | 🟡 | `@db.Text` + `xmlStorageRef` opcional p/ offload em bucket. |
| RS-5 | Migration acidentalmente destrutiva (`--accept-data-loss`) | 🔴 | **Vetado** (governança §5). Só `CREATE/ADD`. Diff revisado no Gate. |
| RS-6 | `@default("loja-1")` copiado por hábito para tabela fiscal | 🟠 | Proibido explicitamente (§8). Checklist §20 verifica. |
| RS-7 | Deletar venda/loja apagar nota (registro legal) | 🟠 | `NotaFiscal → Venda/Store` com `onDelete: Restrict`. |
| RS-8 | Índice único de chaveAcesso conflitar com nulos antes de autorizar | 🟡 | Postgres permite múltiplos `NULL` em unique → OK; chave só preenchida na autorização. |
| RS-9 | "1 nota vigente por venda" só na aplicação (corrida) | 🟡 | Índice único **parcial** (`WHERE vigente=true`) via SQL em GOAL_001B. |
| RS-10 | Enum novo bloquear deploy se valor faltar | 🟡 | Enums aditivos; defaults definidos; nenhum consumidor obrigatório enquanto dormente. |

---

## 20. Checklist de revisão manual antes de aplicar schema (Gate de GOAL_001B)

- [ ] Diff do `schema.prisma` é **100% aditivo**: só novos `model`/`enum`/`@@`/back-relations + 1 coluna em `Venda`.
- [ ] **Nenhuma** coluna existente renomeada, removida ou com tipo alterado.
- [ ] **Nenhum** `@default("loja-1")` nas tabelas fiscais novas.
- [ ] Toda coluna nova `NOT NULL` tem **default** (ou é opcional `?`).
- [ ] `Venda.fiscalStatus` tem default `NAO_FISCAL` (backfill automático das linhas existentes).
- [ ] `onDelete`: `Restrict` em `NotaFiscal→Venda/Store`; `Cascade` só em filhos fiscais; `SetNull` em cert/série.
- [ ] **Segredo** (cert/senha/CSC/token gateway) **não** aparece em coluna em claro — só `*Ref`.
- [ ] Índices presentes: `storeId` em todas; `[status, proximaTentativaEm]` no job; uniques de idempotência.
- [ ] Índice único **parcial** de "1 nota vigente por venda" incluído na migration (SQL).
- [ ] Migration gerada por `prisma migrate dev`/`diff`, revisada linha a linha; **sem** `--accept-data-loss`.
- [ ] `prisma validate` OK; `prisma generate` OK.
- [ ] `npx tsc --noEmit` zero erros; `npm run build` OK; `vitest run` **verde** (PDV byte-idêntico).
- [ ] Confirmar versão do PostgreSQL (Supabase) suporta ADD COLUMN com default sem rewrite (≥11).
- [ ] Backup/plan antes do `db:push`/`migrate deploy`; janela combinada.
- [ ] Autorização explícita de schema registrada (Apêndice A do Master Plan).

---

## Validação READ ONLY (executada neste GOAL_001A)

- `git diff --stat` → apenas este arquivo novo (não rastreado); `schema.prisma` ausente do diff.
- `prisma/schema.prisma` **não** alterado (nenhuma edição).
- **Nenhuma** migration criada em `prisma/migrations/`.
- Nenhum `db:push`/`db:migrate` executado. Sem commit, sem push.

> **Recomendação para GOAL_001B:** aplicar **exatamente** este conjunto aditivo+dormente, com
> `fiscalEnabled=false` global; **não** incluir colunas de `Produto` (GOAL_004) nem lógica de
> serviço; abrir com o **Gate de schema** (autorização + diff revisado) e fechar provando o PDV
> byte-idêntico (suites verdes). A ordem do Master Plan permanece intocada.
