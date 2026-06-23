---
title: Master Fiscal Execution Plan — fonte oficial da camada Fiscal (NFC-e/SAT/TEF)
status: governing-document
owner: produto/arquitetura
last_update: 2026-06-18
versao: v01
governa: todos os GOALs da frente Fiscal (GOAL_001 … GOAL_011)
baseia_se_em:
  - docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md
  - docs/architecture/NFCE_ARCHITECTURE_v01.md
  - docs/decisions/ADR-0003 / ADR-0004 / ADR-0007
  - docs/governance/GOVERNANCA.md
---

# 🧾 MASTER FISCAL EXECUTION PLAN — OmniGestão Pro

> **Documento mestre.** A partir daqui, **todo GOAL da camada fiscal obedece a este plano.**
> Nenhum GOAL fiscal pode ser iniciado fora da ordem, dos critérios de entrada/saída e das
> travas de autorização aqui definidos. Este documento é a **fonte da verdade** da frente
> Fiscal; ADRs específicos derivam dele, não o contrário.
>
> **Escopo deste arquivo:** planejamento/governança (READ ONLY). Não contém código, não
> altera schema, não cria migration. Cada GOAL abaixo terá seu próprio prompt de execução.

---

## 1. Objetivo

Definir, governar e sequenciar a construção da **camada Fiscal** do OmniGestão Pro
(NFC-e modelo 65, com extensões futuras para SAT-CF-e e TEF), de forma que:

- O **PDV operacional atual não regrida um milímetro** durante toda a construção.
- A camada nasça **aditiva e dormente**, ativada loja a loja por **feature flag**.
- Seja **multi-loja / multi-CNPJ / multi-certificado / multi-série** desde o desenho.
- Seja **provider-agnóstica** (SEFAZ direto, gateway, ou SAT — intercambiáveis).
- Cada fase tenha **rollback simples** e critérios objetivos de entrada/saída.

**Escopo funcional da camada Fiscal (visão completa):**
identidade fiscal por loja (CNPJ/IE/regime/CSC/certificado/série/ambiente) → produto fiscal
(NCM/CEST/CFOP/CST/CSOSN/origem/unidade) → snapshot fiscal por item da venda → máquina de
estados fiscal da venda → emissão NFC-e (montagem/assinatura/transmissão/autorização) →
DANFE-NFC-e (QR/chave/protocolo/tributos) → eventos fiscais (cancelamento/CC-e/inutilização/
contingência) → homologação → produção controlada → expansão (TEF/SAT/NF-e devolução).

**Fora de escopo desta v01:** NF-e modelo 55 (devolução fiscal), TEF integrado e SAT são
fases de **expansão** posteriores, citadas mas não detalhadas em profundidade aqui.

---

## 2. Princípios (inegociáveis da frente Fiscal)

Herdam os 7 inegociáveis de `docs/governance/GOVERNANCA.md` e adicionam:

1. **Zero regressão do PDV.** O motor único (`finalizeSaleTransaction` →
   `/api/ops/venda-persist` → `upsertVendaInTransaction`) é **intocável** em comportamento.
   Fiscal é **satélite pós-commit**, nunca dentro da transação de venda.
2. **Feature flags por loja.** Nada liga sem `ConfiguracaoFiscalLoja.fiscalEnabled = true`.
   Default global: **desligado**. Loja sem flag → venda nasce `fiscalStatus = NAO_FISCAL`.
3. **Desenvolvimento dormente.** Toda fundação (schema, services, providers) entra em
   produção **desligada** e testada dormente antes de qualquer emissão real. Precedente
   direto: **ADR-0007** (Depósito/ProdutoDeposito aditivos e dormentes, `Produto.stock` intacto).
4. **Provider-agnóstico.** Emissão atrás de interface `FiscalProvider`. Trocar SEFAZ↔gateway↔SAT
   não toca o domínio nem o PDV.
5. **Multi-loja / multi-CNPJ.** Todo dado e operação fiscal escopados por `storeId`
   (inegociável #6 da governança: sem fallback `loja-1` — alinhado a **ADR-0003**).
6. **Multi-certificado / multi-série.** Certificado A1 e numeração de série **por CNPJ/loja**,
   nunca global, nunca em localStorage/bundle.
7. **Rollback simples.** Cada fase desfaz-se desligando a flag (runtime) ou revertendo um
   conjunto **aditivo** (schema), sem perder dado operacional. Nada de migração destrutiva.
8. **Compatibilidade total.** Vendas antigas (sem dados fiscais) continuam válidas e
   reimprimíveis como **documento não fiscal**. Fiscal só vale para vendas pós-ativação.
9. **Idempotência fiscal.** 1 venda → no máximo 1 documento fiscal vigente; reenvio reusa
   (mesma série/número). Toda transmissão tem chave idempotente (alinhado à regra de
   idempotência da governança: `localKey`/`commandId`).
10. **Auditoria fiscal.** Todo evento (emissão/rejeição/cancelamento/CC-e) auditado com
    `storeId`, operador, protocolo e `cStat`.

**Modo de trabalho:** **SAFE-lite reforçado** (ADR-0004) em todas as fases que tocam áreas
protegidas (schema, financeiro, fiscal). Toda alteração de `schema.prisma` exige
**autorização explícita + diff revisado antes de `db:push`** (governança §6).

---

## 3. Ordem oficial das fases

> A ordem é **estrita**. Um GOAL só inicia quando o anterior (do qual depende) atingiu seus
> **critérios de saída**. FASE 0 (GOAL_001→006) é toda **dormente** — não emite nada.

### FASE 0 — Fundação dormente (não emite documento)

| GOAL | Nome | Entrega-núcleo | Toca área protegida? |
|---|---|---|---|
| **GOAL_001** | Fiscal Schema Foundation | Models fiscais aditivos+dormentes + `Venda.fiscalStatus` | 🔒 **schema** (autorização) |
| **GOAL_002** | Fiscal Identity Per Store | Config fiscal por loja no DB (sai do localStorage) + certificado seguro | 🔒 schema + segredo |
| **GOAL_003** | Venda State Machine | `fiscalStatus` + guards de edição (Workspace/cancelar) | 🔒 financeiro/PDV-adjacente |
| **GOAL_004** | Produto Fiscal Persist | Persistir NCM/CEST/CFOP/CST/CSOSN/origem/unidade (fim do descarte no save) | 🔒 schema/API produto |
| **GOAL_005** | Venda Fiscal Snapshot | Copiar dados fiscais do produto → item no ato da venda | 🔒 motor de venda (cirúrgico) |
| **GOAL_006** | Fiscal Provider Abstraction | Interface `FiscalProvider` + 1 stub de homologação | Aditivo |

### FASE 1 — Emissão em homologação

| GOAL | Nome | Entrega-núcleo |
|---|---|---|
| **GOAL_007** | NFC-e Emission Pipeline | Montagem/validação/assinatura/transmissão/autorização (homologação) |
| **GOAL_008** | DANFE Unificado | Consolidar 3 cupons + DANFE-NFC-e (QR/chave/protocolo/tributos) |
| **GOAL_009** | Fiscal Events | Cancelamento fiscal, contingência, rejeição/reenvio, inutilização |

### FASE 2 — Go-live controlado

| GOAL | Nome | Entrega-núcleo |
|---|---|---|
| **GOAL_010** | Homologação | Validação ponta-a-ponta em ambiente SEFAZ de homologação (1 loja piloto) |
| **GOAL_011** | Produção | Ativar 1 CNPJ real; flag ligada; monitoração + reprocessador |

### Expansão (pós-GOAL_011, fora desta v01)

`GOAL_TEF_INTEGRATION` · `GOAL_SAT_PROVIDER` (regional SP) · `GOAL_NFE_DEVOLUCAO` (modelo 55).

---

## 4. Dependências entre as fases

```
GOAL_001 (schema fiscal)
   ├──► GOAL_002 (identidade por loja)        [precisa das tabelas de config/certificado]
   ├──► GOAL_003 (state machine)              [precisa de Venda.fiscalStatus]
   └──► GOAL_004 (produto fiscal)             [precisa de colunas/contrato fiscal do produto]
                    │
                    ▼
                 GOAL_005 (snapshot na venda)  [precisa de produto fiscal + state machine]
                    │
   GOAL_002 + GOAL_006 ──────────────────────► GOAL_007 (emission pipeline)
   (identidade)   (provider)                       [precisa identidade + provider + snapshot]
                    │                                   │
                    ▼                                   ▼
                 GOAL_006 ───────────────────────► GOAL_008 (DANFE) [precisa de nota autorizada]
                                                        │
                 GOAL_003 + GOAL_007 ──────────────► GOAL_009 (eventos) [estados + pipeline]
                                                        │
                 GOAL_007+008+009 ─────────────────► GOAL_010 (homologação ponta-a-ponta)
                                                        │
                                                        ▼
                                                   GOAL_011 (produção)
```

**Resumo textual:**
- GOAL_001 é raiz de tudo (sem schema fiscal nada existe).
- GOAL_002, 003, 004 são paralelizáveis **após** 001 (independentes entre si).
- GOAL_005 depende de 004 (+ 003 para respeitar estado).
- GOAL_007 depende de 002 (identidade), 005 (snapshot) e 006 (provider).
- GOAL_008 depende de 007 (precisa de nota autorizada p/ DANFE).
- GOAL_009 depende de 003 (estados) + 007 (pipeline).
- GOAL_010 depende de 007+008+009 completos.
- GOAL_011 depende de 010 aprovado (Gate de produção).

---

## 5. Critérios de entrada (o que precisa existir ANTES de iniciar cada GOAL)

| GOAL | Critérios de entrada |
|---|---|
| **001** | Autorização explícita de schema (governança §6). Auditoria + blueprint lidos. Backup/diff plan do schema. |
| **002** | GOAL_001 concluído (tabelas `ConfiguracaoFiscalLoja`/`CertificadoDigital` existem dormentes). Storage seguro de segredo definido (secret manager/blob cifrado). |
| **003** | GOAL_001 concluído (`Venda.fiscalStatus` existe, default `NAO_FISCAL`). Guard de ACL atual (`requireCorrecaoVendaAuth`) disponível para estender. |
| **004** | GOAL_001 concluído (contrato fiscal do produto definido). Mapa dos 3 editores de produto (importador/form/CadastrosHub) revisado. |
| **005** | GOAL_004 + GOAL_003 concluídos. Snapshot deve ser **foto** (não dado ao vivo). |
| **006** | GOAL_001 concluído. Decisão de provider (SEFAZ direto × gateway) tomada/documentada em ADR. |
| **007** | GOAL_002 (identidade) + GOAL_005 (snapshot) + GOAL_006 (provider) concluídos. Ambiente de **homologação** SEFAZ disponível. Certificado de teste. |
| **008** | GOAL_007 produz nota `AUTORIZADA` em homologação. Pipeline de impressão per-loja (`pdv-print-runtime`) mapeado. |
| **009** | GOAL_003 (estados) + GOAL_007 (pipeline). Regras de prazo de cancelamento (UF) documentadas. |
| **010** | GOAL_007+008+009 concluídos e verdes. Loja piloto + CNPJ de homologação definidos. **Gate #1** (aprovação de arquitetura). |
| **011** | GOAL_010 aprovado ponta-a-ponta. Certificado A1 **de produção** instalado seguro. **Gate #2** (aprovação de go-live pelo dono do projeto). Plano de rollback testado. |

---

## 6. Critérios de saída (quando cada GOAL está concluído)

| GOAL | Critérios de saída |
|---|---|
| **001** | Models aditivos aplicados; `Venda.fiscalStatus` default `NAO_FISCAL`; **PDV byte-idêntico** (todas as suites verdes); `tsc`+`build` OK; nenhuma venda muda de comportamento. |
| **002** | Config fiscal por loja gravável/legível no DB; certificado em storage seguro; localStorage `DadosFiscais` marcado deprecado; flag `fiscalEnabled` existe e default `false`. |
| **003** | `fiscalStatus` transita conforme a máquina (§11 do blueprint); rotas `corrigir*`/`cancelar` respeitam estado (bloqueiam `AUTORIZADA`); testes de transição verdes; **sem fiscal ativo, comportamento inalterado**. |
| **004** | Produto persiste NCM/CEST/CFOP/CST/CSOSN/origem/unidade; os 3 editores convergem; form **para de descartar** CFOP/origem; importador e CadastrosHub consistentes. |
| **005** | Item da venda guarda snapshot fiscal no ato; produto alterado depois **não** muda nota; testes de snapshot verdes. |
| **006** | Interface `FiscalProvider` definida; 1 implementação stub/homologação plugável; nenhum acoplamento a SDK específico no domínio. |
| **007** | Venda elegível em loja-flag-on emite NFC-e em **homologação** até `AUTORIZADA`; rejeição tratada; idempotência de reenvio comprovada. |
| **008** | DANFE-NFC-e válido (QR/chave/protocolo/tributos/URL); cupons consolidados; reimpressão idempotente. |
| **009** | Cancelamento fiscal, contingência, inutilização e reenvio funcionando em homologação; eventos auditados. |
| **010** | Fluxo ponta-a-ponta verde em homologação na loja piloto; checklist mestre (§12) 100% até GOAL_009. |
| **011** | 1 CNPJ real emitindo em produção com flag; monitoração ativa; rollback testado; Gate #2 assinado. |

---

## 7. Riscos por severidade

### 🔴 P0 — estruturais (bloqueiam iniciar / podem corromper produção)
- **P0-A — Sem models fiscais** (resolvido por GOAL_001). Mitigação: schema aditivo dormente.
- **P0-B — Identidade fiscal não por loja** (certificado em localStorage single-empresa hoje).
  Resolvido por GOAL_002. Mitigação: DB por `storeId` + secret seguro.
- **P0-C — Venda sem máquina de estados** (editável sempre). Resolvido por GOAL_003.
- **P0-D — Emitir dentro da transação de venda** travaria o balcão. Mitigação arquitetural:
  emissão **pós-commit/assíncrona** (princípio #1). Nunca violar.
- **P0-E — Migração destrutiva de schema.** Proibida. Só aditivo; `db:push --accept-data-loss`
  **vetado** (governança §5). Autorização + diff antes de qualquer migration.

### 🟠 P1 — corretude da emissão
- **P1-A — Produto sem dados fiscais persistidos** (CFOP/origem descartados no save hoje;
  `gestao-produtos.tsx:564`). Resolvido por GOAL_004.
- **P1-B — Item sem snapshot fiscal** (montaria nota de dado ao vivo). Resolvido por GOAL_005.
- **P1-C — Correção/cancelamento sem trava de estado fiscal.** Resolvido por GOAL_003.
- **P1-D — Regime tributário por loja indefinido** (Simples×Normal → CST vs CSOSN). GOAL_002.
- **P1-E — Numeração concorrente multi-terminal** (mesma loja/série). Mitigação: contador
  atômico por `(storeId, série)` em GOAL_001/007.

### 🟡 P2 — necessários, não bloqueiam piloto
- **P2-A — Endereço do cliente não estruturado** (destinatário CNPJ). GOAL_002/004 adjacente.
- **P2-B — Pagamento sem `tPag`/TEF/PIX txid.** Captura incremental; TEF é expansão.
- **P2-C — 3 pipelines de cupom divergentes** → DANFE seria 4º. Consolidar em GOAL_008.
- **P2-D — "Imposto estimado" é alíquota fixa**, não cálculo real (Lei Transparência). GOAL_007/008.

### ⚪ P3 — melhorias
- **P3-A — Item avulso fiscal** (classificação NCM/CFOP no ato). Pós-GOAL_005.
- **P3-B — Numeração/série offline** (estratégia de contingência de número). GOAL_009.

---

## 8. Estratégia de rollback (por fase)

Princípio: **rollback nunca perde dado operacional**. Duas alavancas: **flag** (runtime) e
**reversão aditiva** (schema).

| GOAL | Como desfazer |
|---|---|
| **001** | Models são aditivos e dormentes → reverter migration aditiva (drop das tabelas novas + coluna `fiscalStatus`). Nenhuma tabela operacional tocada. Vendas intactas. |
| **002** | Desligar `fiscalEnabled` (volta a `NAO_FISCAL`); config fiscal fica dormente. Certificado removido do storage seguro sem afetar venda. |
| **003** | Guards de estado fiscal só atuam quando há `fiscalStatus ≠ NAO_FISCAL`. Com flag off, são no-op → reverter = manter flag off (ou remover guard, aditivo). |
| **004** | Campos fiscais do produto são aditivos; reverter persistência volta ao comportamento atual (que já descartava). Dados existentes ficam, só param de ser usados. |
| **005** | Snapshot é gravação extra no payload/item; desligar = parar de copiar. Vendas antigas sem snapshot continuam válidas. |
| **006** | Provider é plugável; reverter = não registrar provider (pipeline fica inerte). |
| **007** | **Flag por loja off** → nenhuma emissão. Notas de homologação são descartáveis. |
| **008** | DANFE só renderiza nota autorizada; sem nota, cai no cupom não fiscal atual (fallback preservado). |
| **009** | Eventos são aditivos; desligar reprocessador/contingência via flag. |
| **010** | Ambiente de homologação — rollback = desativar piloto, sem impacto produção. |
| **011** | **Kill-switch:** desligar `fiscalEnabled` do CNPJ → PDV volta a operar sem emissão (documento não fiscal). Notas já autorizadas permanecem (legalmente imutáveis); novas deixam de ser emitidas. |

> **Regra de ouro do rollback:** a flag por loja é o freio de emergência universal. Desligar a
> flag **sempre** devolve o PDV ao comportamento pré-fiscal sem perda de venda.

---

## 9. Estratégia de testes (por GOAL)

Padrão herdado do projeto (Vitest + `tsc --noEmit` + `npm run build`), com **rede de
segurança antes de tocar área protegida** (precedente: baseline multi-loja).

| GOAL | Unitário | Integração | Manual | Aceite |
|---|---|---|---|---|
| **001** | Defaults dos models; `fiscalStatus` default `NAO_FISCAL` | Migration aditiva aplica sem afetar tabelas operacionais | Abrir PDV, vender, conferir venda inalterada | Suites atuais 100% verdes; PDV byte-idêntico |
| **002** | Parse/serialize config fiscal por loja; validação CNPJ/IE/CSC | CRUD config por `storeId`; isolamento multi-loja | Cadastrar identidade fiscal de 2 lojas distintas | Config some do localStorage; segredo não vaza no bundle |
| **003** | Transições da máquina de estados (todas as setas) | Guards bloqueiam `corrigir*`/`cancelar` em `AUTORIZADA` | Corrigir venda `NAO_FISCAL` (deve passar) vs simular `AUTORIZADA` (deve bloquear) | Flag off ⇒ comportamento idêntico ao atual |
| **004** | Sanitização NCM(8)/CEST(7)/CFOP(4)/origem(0-8) | POST/PATCH `/api/produtos` persiste campos fiscais | Cadastrar produto com NCM/CFOP e reabrir (persistiu) | Form **não descarta** mais; 3 editores consistentes |
| **005** | Cópia produto→item; imutabilidade pós-venda | Venda grava snapshot; alterar produto não muda venda | Vender, alterar produto, reabrir venda (snapshot intacto) | Nota usa snapshot, não dado ao vivo |
| **006** | Contrato `FiscalProvider` (mock) | Stub responde emitir/cancelar/consultar | — | Domínio sem acoplamento a SDK |
| **007** | Montagem XML; validação local; mapeamento `tPag` | Emissão homologação até `AUTORIZADA`; rejeição→reenvio idempotente | Emitir NFC-e teste e consultar na SEFAZ homolog | 1 venda→1 nota; reenvio não duplica |
| **008** | Builder DANFE (QR/chave/tributos) | Render a partir de nota autorizada; reimpressão | Imprimir DANFE térmico e validar QR | Cupons consolidados; DANFE válido |
| **009** | Lógica de prazo/cancelamento; contingência | Evento cancelamento/inutilização em homologação | Cancelar dentro/fora do prazo; simular SEFAZ off | Eventos auditados; contingência transmite ao voltar |
| **010** | (regressão completa) | Ponta-a-ponta homologação loja piloto | Roteiro de balcão completo (venda→nota→DANFE→cancelamento) | Checklist mestre verde até GOAL_009 |
| **011** | (regressão completa) | Produção com flag; monitoração | Primeira venda real com NFC-e; kill-switch | Gate #2 assinado; rollback testado |

**Obrigatório em todo GOAL de código (encerramento, governança §7):** `npx tsc --noEmit`
zero erros · `npm run build` (se tocar schema/rotas/Server Actions) · `npx vitest run` verde ·
`git status` limpo do que não é da tarefa · relatório no formato `DELIVERY_CHECKLIST.md`.

---

## 10. Estratégia de deploy

**O que pode ir para produção DESLIGADO (dormante) sem risco:**
- GOAL_001 a GOAL_006 (toda a FASE 0): schema aditivo, config dormente, state machine no-op
  com flag off, produto fiscal (campos novos não usados), snapshot (não copia se flag off),
  provider não registrado. **Tudo deployável em produção com `fiscalEnabled=false` global.**
- GOAL_007 a GOAL_009: deployáveis apontando para **ambiente de homologação** SEFAZ, com flag
  off em produção real → nenhuma nota real emitida.

**O que NÃO vai a produção sem Gate explícito:**
- GOAL_011 (emissão real) exige **Gate #2** (dono do projeto), certificado de produção e
  rollback testado.

**Feature flags (camadas):**
1. **Global kill-switch** (env/config): liga/desliga a frente fiscal inteira.
2. **Por loja:** `ConfiguracaoFiscalLoja.fiscalEnabled` (a flag operacional principal).
3. **Por ambiente:** `homologacao | producao` (por loja) — emite contra SEFAZ de teste ou real.
4. **Por capability:** `nfceEnabled` / `satEnabled` / `tefEnabled` (expansão).

Default de **todas** as flags: **desligado**. Ativação é sempre opt-in, loja a loja, com Gate.

---

## 11. Roadmap visual (fluxograma textual)

```
                          ┌──────────────────────── FASE 0 — FUNDAÇÃO DORMENTE ───────────────────────┐
                          │                                                                            │
   [Gate schema] ──► GOAL_001 Schema Foundation ──┬──► GOAL_002 Identity/Store ──┐                     │
                          │                        │                              │                     │
                          │                        ├──► GOAL_003 State Machine ───┤                     │
                          │                        │                              ├──► GOAL_005 Snapshot │
                          │                        └──► GOAL_004 Produto Fiscal ──┘         │            │
                          │                                                                 │            │
                          │                        GOAL_006 Provider Abstraction ───────────┤            │
                          └─────────────────────────────────────────────────────────────────┼──────────┘
                                                                                              ▼
                          ┌──────────── FASE 1 — EMISSÃO (HOMOLOGAÇÃO) ────────────┐
                          │   GOAL_007 NFC-e Pipeline ──► GOAL_008 DANFE Unificado  │
                          │            │                                            │
                          │            └──────────► GOAL_009 Fiscal Events          │
                          └──────────────────────────────┬─────────────────────────┘
                                                          ▼
                          ┌──────────── FASE 2 — GO-LIVE CONTROLADO ───────────────┐
                          │   [Gate #1] GOAL_010 Homologação ──► [Gate #2] GOAL_011 │
                          │                                          Produção        │
                          └─────────────────────────────────────────────────────────┘
                                                          ▼
                          ┌──────────── EXPANSÃO (fora desta v01) ─────────────────┐
                          │   TEF · SAT (regional) · NF-e Devolução (modelo 55)     │
                          └─────────────────────────────────────────────────────────┘

   Legenda de estado da venda (governa GOAL_003+):
   NAO_FISCAL → PENDENTE → EMITINDO → {AUTORIZADA | REJEITADA | EM_CONTINGENCIA}
                                          │            │            │
                                  CANCELADA_FISCAL  (reenvia)   (transmite ao voltar)
                                                    BLOQUEADA_FISCAL (falha fatal)
```

---

## 12. Checklist mestre (atualizar a cada GOAL concluído)

> **Como usar:** ao concluir um GOAL, marcar `[x]`, registrar commit hash e data. Este
> checklist é o **placar oficial** da frente fiscal.

### FASE 0 — Fundação dormente
- [ ] **GOAL_001** Fiscal Schema Foundation — models aditivos + `Venda.fiscalStatus` · _(commit: ____ · data: ____)_
- [ ] **GOAL_002** Fiscal Identity Per Store — config/certificado por loja no DB · _(commit: ____)_
- [ ] **GOAL_003** Venda State Machine — `fiscalStatus` + guards de edição · _(commit: ____)_
- [ ] **GOAL_004** Produto Fiscal Persist — NCM/CEST/CFOP/CST/CSOSN/origem/unidade · _(commit: ____)_
- [ ] **GOAL_005** Venda Fiscal Snapshot — snapshot fiscal no item · _(commit: ____)_
- [ ] **GOAL_006** Fiscal Provider Abstraction — interface `FiscalProvider` · _(commit: ____)_

### FASE 1 — Emissão (homologação)
- [ ] **GOAL_007** NFC-e Emission Pipeline — emissão até `AUTORIZADA` (homolog) · _(commit: ____)_
- [ ] **GOAL_008** DANFE Unificado — DANFE-NFC-e + consolidação de cupons · _(commit: ____)_
- [ ] **GOAL_009** Fiscal Events — cancelamento/contingência/rejeição/inutilização · _(commit: ____)_

### FASE 2 — Go-live controlado
- [ ] **GOAL_010** Homologação ponta-a-ponta (loja piloto) — **Gate #1** · _(data: ____)_
- [ ] **GOAL_011** Produção (1 CNPJ real, flag on) — **Gate #2** · _(data: ____)_

### Gates de governança
- [ ] **Gate schema (pré-GOAL_001):** autorização explícita + diff revisado.
- [ ] **Gate #1 (pré-GOAL_010):** arquitetura validada em homologação.
- [ ] **Gate #2 (pré-GOAL_011):** go-live aprovado pelo dono do projeto + rollback testado.

### Invariantes verificados a cada entrega
- [ ] PDV operacional byte-idêntico (suites verdes) enquanto fiscal desligado.
- [ ] `tsc --noEmit` zero erros · `npm run build` OK · `vitest run` verde.
- [ ] Nenhuma migração destrutiva; tudo aditivo; flag default off.
- [ ] Multi-loja isolado (sem fallback `loja-1`); segredo fiscal fora de bundle/localStorage.

---

## Apêndice A — Áreas protegidas tocadas por GOAL (mapa de autorização)

| GOAL | Área protegida (governança §4) | Autorização necessária |
|---|---|---|
| 001 | `prisma/schema.prisma` (migration aditiva) | Explícita + diff revisado antes de `db:push` |
| 002 | schema + storage de segredo (certificado) | Explícita |
| 003 | adjacente a `lib/financeiro`/PDV (guards em rotas de venda) | Explícita (toca fluxo de venda) |
| 004 | API de produto + schema (campos fiscais) | Explícita (schema) |
| 005 | motor de venda (`upsert`/payload do item) — cirúrgico | Explícita (PDV core) |
| 006 | aditivo (nova lib) | Padrão |
| 007–009 | emissão fiscal (governança §6: "mudar emissão fiscal") | Explícita |
| 010–011 | produção fiscal | **Gate #2** (dono do projeto) |

## Apêndice B — Vínculo com a base operacional existente (reuso, não reescrita)

- **Motor único de venda** (`upsertVendaInTransaction`) — fiscal **observa**, não altera.
- **Guard de correção** (`requireCorrecaoVendaAuth`, ACL multi-loja) — GOAL_003 **estende**
  com checagem de estado fiscal, sem duplicar.
- **Regra única de receita à vista** (creditoVale alinhado: `valorAVistaVenda`) — base para o
  mapeamento de pagamento fiscal (`tPag`).
- **PWA offline-first** (`syncPending`) — modelo mental da **contingência fiscal**.
- **Padrão aditivo+dormente** (ADR-0007 Depósitos) — precedente direto da FASE 0.
- **Eliminação de fallback `loja-1`** (ADR-0003) — fiscal nasce multi-loja estrito.
- **SAFE-lite** (ADR-0004) — modo de trabalho padrão nas fases sensíveis.

> **Princípio final (herdado da governança §9):** se em dúvida, não emita. A flag por loja
> mantém o PDV seguro; a camada fiscal só liga quando a Fundação está completa, testada e
> aprovada em Gate.
