# FISCAL-OBSERVABILITY-SCENARIO-BATTERY-021 — Relatório de Fechamento Técnico

## 1. Identificação

- **GOAL**: `FISCAL-OBSERVABILITY-SCENARIO-BATTERY-021`
- **Trilha AEP**: `fiscal`
- **Base**: `origin/main` (`955e6794dc5e382454d8c02cbe836486e89893a2`)
- **Branch**: `goal/fiscal-021-observability-scenario-battery`
- **Worktree**: `C:/Projetos/omni-gestao-fiscal-021-observability-scenario-battery`
- **Status**: CONCLUÍDO (Correções P1/P2 aplicadas — pronto para revisão independente)

---

## 2. Escopo Implementado e Correções de Revisão Independente (P1 / P2)

### 2.1 Serviço Consolidado de Observabilidade Fiscal (`lib/fiscal/observability`)
- **Módulo**: `fiscal-observability-service.ts` e exportações canônicas em `index.ts`.
- **Comportamento**: Exclusivamente *read-only*, com escopo estrito por loja (`storeId`), integrando as 4 dimensões canônicas existentes:
  1. **Fila Fiscal (`queue`)**: Profundidade por status (`PENDENTE`, `PROCESSANDO`, `FALHA`, etc.), contagem de falhas, idade do job mais antigo e status agregado (`HEALTHY`, `DEGRADED`, `STALLED`).
  2. **Estado Incerto / Reconciliação (`reconciliation`)**: Documentos em estado incerto, contagem por tipo/ação sugerida, idade da incerteza mais antiga e status agregado (`CLEAR`, `PENDING_RECONCILIATION`, `ACTION_REQUIRED`).
  3. **Throttling / cStat 656 (`throttling`)**: Estado do lock de throttling por loja, timestamp de bloqueio, tempo restante de espera e status do processamento (`PAUSED`, `ACTIVE`).
  4. **Contingência Offline (`contingency`)**: Modo de contingência atual, timestamp de ativação, documentos pendentes de transmissão/drenagem e tempo decorrido.

### 2.2 Endpoint Interno Protegido (`app/api/internal/fiscal/observability/route.ts`)
- **Método**: `GET` exclusivamente (`POST`, `PUT`, `DELETE` retornam `405 Method Not Allowed`).
- **Autenticação**:
  - Reutilização estrita da governança de `app/api/internal/fiscal/queue` via secret `FISCAL_QUEUE_INTERNAL_SECRET`.
  - Comparação em tempo constante via `crypto.timingSafeEqual` (imune a timing attacks).
  - Comportamento fail-closed: se `FISCAL_QUEUE_INTERNAL_SECRET` não estiver configurado no ambiente, recusa imediatamente com `503 Service Unavailable`.
  - Se secret incorreto ou ausente no header `x-internal-secret` / `Authorization: Bearer`: `401 Unauthorized`.
- **Validação de Tenant**: Exige parâmetro `storeId` via query param (`?storeId=...`); ausência resulta em `400 Bad Request`.
- **Proteção de Dados Sensíveis**:
  - Zero exposição de chaves privadas, certificados digitais, senhas ou tokens.
  - Zero exposição de XMLs integrais ou dados sensíveis de clientes/pagamentos.
  - Retorno estritamente de métricas, contagens, status agregados e timestamps.

### 2.3 Contenção Estrita de Rede (Correção P2)
- Interceptação global e fail-closed com zero emissão de pacotes para toda tentativa de rede no ambiente de testes da bateria:
  - `node:https`: `https.request` e `https.get` bloqueados e interceptados fail-closed.
  - `node:http`: `http.request` e `http.get` bloqueados e interceptados fail-closed.
  - `node:net`: `net.connect` e `net.Socket.prototype.connect` bloqueados fail-closed.
  - `node:tls`: `tls.connect` e `tls.TLSSocket.prototype.connect` bloqueados fail-closed.
  - `globalThis.fetch`: interceptado fail-closed com lançamento imediato de `Error("ZERO_NETWORK_VIOLATION: Tentativa de chamada de rede externa bloqueada em teste offline")`.
- Teste dedicado de contenção de rede executado antes de cada cenário para auditar e provar a eficácia fail-closed das travas.

### 2.4 Bateria Ampla de Cenários Offline C01–C10 Canônica (Correções P1.1 e P1.2)
Suíte automatizada determinística e 100% offline, operando sobre as superfícies canônicas e orquestradores reais com injeção de portas em memória (sem rede, sem banco externo e sem fixtures superficiais):
- **C01 — Autorização feliz (`FULL_FLOW`)**: Execução via `transmitWithUncertainStateSafety` com cStat 100, persistência real de protocolo e chave autorizada, parsing canônico via `parseDanfceFromPersisted`, renderização DANFCE HTML (`renderDanfceHtml`), DANFCE ESC-POS 80mm/58mm (`renderDanfceEscpos`) e geração da URL canônica QR-Code v3 Online SP (`encodeNfceQrV3OnlineUrl`).
- **C02 — Processamento de lote assíncrono (`FULL_FLOW`)**: Execução canônica via `transmitWithUncertainStateSafety` e máquina de estados de lote: 103 (lote recebido com recibo) -> 105 (em processamento) -> 104 (lote processado) -> 100 (autorizado com protocolo).
- **C03 — Duplicidade de chave cStat 204 (`FULL_FLOW`)**: Execução canônica via `transmitWithUncertainStateSafety`: convergência idempotente por chave existente, sem retransmissão cega e sem consumir novo número fiscal (`numeroConsumido: false`, `requiresInutilizacao: false`).
- **C04 — SEFAZ indisponível cStat 108 / 109 (`FULL_FLOW`)**: Execução canônica via `transmitWithUncertainStateSafety` (fail-closed imediato, preservação do documento em `TRANSMITINDO`, sem consumo de número) integrada à política canônica de fila (`withTransmissionStarted` + `withExecutionResult`), e validação via `canStartFiscalTransmission` provando bloqueio estrito de retransmissão cega (`consulta_obrigatoria_antes_de_nova_transmissao`).
- **C05 — Consulta documento não constante cStat 217 (`FULL_FLOW`)**: Validação canônica de `lookupSefazCStat("217", "NFeConsultaProtocolo4")` e transição de política com `consultationOutcome: "NOT_FOUND"` autorizando uma única nova transmissão controlada sem loop cego.
- **C06 — Consumo indevido / Throttling cStat 656 (`FULL_FLOW`)**: Acionamento real de `pauseStoreForThrottling` (`lib/fiscal/queue`), verificação de bloqueio ativo via `isStoreThrottled`, exclusão de elegibilidade da fila para a loja pausada via `eligibleWhere` e zero loop de retentativas.
- **C07 — Timeout e transmissão incerta (`FULL_FLOW`)**: Documento em estado `TRANSMITINDO` submetido ao orquestrador canônico `reconcileUncertainDocument` (`lib/fiscal/reconciliation`), com reconciliação idempotente por consulta de chave, sem avanço ou queima de numeração.
- **C08 — Cancelamento fiscal (`FULL_FLOW`)**: Evento 110111 com cStat 135 utilizando o orquestrador canônico `cancelarNfceAutorizada` (`lib/fiscal/events`), validação canônica de justificativa (`validarJustificativaCancelamento`), geração de XML assinado (`buildXmlEventoCancelamento`, `signEventoCancelamentoXml`) e **aplicação estrita do prazo canônico legal de 30 minutos** (`NFCE_CANCELAMENTO_PRAZO_MS = 30 * 60 * 1000`, `avaliarPrazoCancelamentoNfce`). Correção de afirmações prévias errôneas de "24h SP": o prazo legal da NFC-e em SP é de 30 minutos da autorização. Testado dentro (20 min) e fora do prazo (35 min, rejeição com `fiscal_prazo_vencido`).
- **C09 — Inutilização de número/faixa (`FULL_FLOW`)**: `inutNFe` com cStat 102 via `executeInutilizacaoJob` (`lib/fiscal/inutilizacao`) e orquestrador de numeração `allocateFiscalNumber` (`lib/fiscal/numbering`): validação de pedido (`validateInutilizacaoPedido`), XML assinado (`buildInutilizacaoXml`, `signInutilizacaoXml`), lock atômico CAS (`INUTILIZACAO_MARK.INUTILIZADO`), idempotência em reexecução (`ja_inutilizada`) e prova de não reutilização da numeração inutilizada pelo alocador.
- **C10 — Contingência offline manual tpEmis=9 (`FULL_FLOW`)**: Entrada canônica via `enterManualOfflineContingency` (`lib/fiscal/contingencia`) com verificação estrita de requisitos de piloto, cálculo de prazo (`calculateOfflineTransmissionDeadline`), alarmes de monitoramento (`offlineContingencyAlarm`: `SAFE`, `APPROACHING`, `EXPIRED`), prova de imutabilidade de payload via digest SHA-256 (`fiscalBytesSha256`), validação de DANFCE HTML em contingência e geração/verificação criptográfica de QR-Code v3 Offline assinado (RSA-SHA1 com verificação por chave pública).

### 2.5 Auditoria 175: Prova e Conformidade da Política de cStat
- Os códigos `cStat 203`, `cStat 208`, `cStat 215` e `cStat 225` NÃO foram modelados na matriz de autorização do runtime Fiscal.
- A bateria valida formalmente que estes códigos retornam `UNKNOWN` e não assumem regras arbitrárias de retry, queima de número ou desfecho indevido.
- `COVERAGE_GAP_UNMODELED_CSTAT=false`: nenhum gap não modelado impactou a completude dos cenários base C01–C10.

---

## 3. Integração com Artefatos DANFCE e QR-Code v3

A integração ponta-a-ponta com os módulos canônicos existentes foi comprovada sem duplicação de geradores:
- **DANFCE HTML**: `renderDanfceHtml` validado com emissão online (C01) e contingência offline (C10), contendo marcas obrigatórias de contingência e QR-Code v3 embeddable.
- **DANFCE ESC-POS**: `renderDanfceEscpos` validado em 80 colunas e 58 colunas com comandos de corte e bloco fiscal estruturado.
- **QR-Code v3 Online**: URL canônica montada com versão 3, SHA-1 do digest e parâmetros oficiais SP.
- **QR-Code v3 Offline Assinado**: Assinatura RSA-SHA1 validada com chave pública do certificado de homologação, comprovando conformidade integral com a NT 2024.001 / Portaria SRE.

---

## 4. Avaliação de Prontidão Técnica para G-F7 (Derivação Determinística)

A propriedade `READY_FOR_G_F7_REVIEW` é derivada **programaticamente** pelo avaliador determinístico `deriveReadyForGF7Review(batteryReport)` a partir da execução real de C01–C10, sem nenhuma constante literal hardcoded:

```typescript
// Exigência: 10/10 cenários C01–C10 classificados como FULL_FLOW
expect(evaluation.fullFlowCount).toBe(10)
expect(evaluation.fullFlowRatio).toBe("10/10")
expect(evaluation.reasons).toEqual([])
expect(evaluation.ready).toBe(true)
READY_FOR_G_F7_REVIEW = evaluation.ready
```

| Critério | Requisito | Resultado |
|---|---|---|
| Suíte de observabilidade | Read-only, multi-tenant por loja, protegida | Aprovado |
| Bateria de cenários C01–C10 | 100% offline, determinística, 10/10 FULL_FLOW via superfícies canônicas | Aprovado |
| Contenção de rede (P2) | `https`, `http`, `net`, `tls` e `fetch` interceptados fail-closed | Aprovado |
| Prazo de cancelamento (P1.1) | 30 minutos NFC-e SP (`NFCE_CANCELAMENTO_PRAZO_MS`) testado e validado | Aprovado |
| Política cStat (Auditoria 175) | Sem regras inventadas para cStats não modelados | Aprovado |
| DANFCE / QR-Code v3 | Validação integrada HTML, ESC-POS e QR offline assinado | Aprovado |
| Segurança operacional | Zero chamadas SEFAZ ao vivo, zero mutação de schema | Aprovado |

- **`READY_FOR_G_F7_REVIEW=true`**: O arcabouço técnico interno do módulo fiscal encontra-se plenamente validado e apto para subsidiar a avaliação humana do gate G-F7 (ativação de loja-piloto em homologação externa).
- **`G_F7_AUTO_ACTIVATION=false`**: O gate G-F7 permanece **FECHADO**. Nenhuma transição para homologação ao vivo ou produção foi realizada nem habilitada automaticamente.
- **`G_F12_STATUS=CLOSED`**: Produção permanece estritamente bloqueada.

---

## 5. Auditoria de Segurança e Parâmetros Operacionais

```ini
SP_ONLY=true
SEFAZ_REQUEST_COUNT=0
SEFAZ_SOAP_POST_COUNT=0
NFCE_EMISSION_COUNT=0
FISCAL_OFF=true
PRODUCTION_REQUIRED=false
SCHEMA_CHANGED=false
MIGRATION_CREATED=false
COVERAGE_GAP_UNMODELED_CSTAT=false
READY_FOR_G_F7_REVIEW=true
G_F7_AUTO_ACTIVATION=false
ZERO_NETWORK=true
HTTPS_NETWORK_GUARD=true
TLS_NETWORK_GUARD=true
```

---

## 6. Resultados de Testes

- **Suíte do GOAL**:
  - `lib/fiscal/observability/fiscal-observability-service.test.ts` (5 testes) — PASS
  - `app/api/internal/fiscal/observability/route.test.ts` (9 testes) — PASS
  - `test/fiscal/scenario-battery/fiscal-scenario-battery.test.ts` (13 testes) — PASS
  - **Total GOAL: 27/27 testes passando**.
- **Regressão Fiscal**:
  - 30 arquivos de teste, 309 testes passando em todo o subsistema fiscal (`queue`, `reconciliation`, `contingencia`, `danfce`, `events`, `inutilizacao`, `cstat-matrix`).
- **Validação Estática**:
  - `npm run typecheck` — 0 erros.
  - `npm run build` — compilação limpa.
