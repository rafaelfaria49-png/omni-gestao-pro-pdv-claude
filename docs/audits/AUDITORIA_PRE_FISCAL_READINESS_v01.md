# AUDITORIA PRÉ-FISCAL — READINESS v01

> **Tipo:** Auditoria READ-ONLY · **Módulo:** Fiscal (NFC-e/SAT/NF-e)
> **Data:** 2026-06-24 · **Fase:** 0 (Plano Mestre Fiscal) · **Autor:** Claude Code (Sonnet)
> **Escopo desta auditoria:** mapear o estado REAL da frente fiscal. Nenhum código,
> schema, migration, env ou banco foi alterado. Documento imutável (correções = v02).

---

## 0. TL;DR — a manchete

A frente Fiscal **NÃO está em estado-zero**. Entre os commits `32ae9c8` e `2b88411`
foi entregue uma **fundação fiscal dormente e madura** cobrindo do schema ao pipeline
de emissão (GOALs 001B → 008). Porém:

> **A frente está ~70% construída no nível de *scaffold dormente*, mas 0% capaz de
> emitir um único documento fiscal real.** Tudo que existe é estrutura provider-agnóstica,
> simulada (`STUB_HOMOLOGACAO`) e desligada por padrão (`fiscalEnabled = false`). O trabalho
> que falta é justamente a parte difícil: **geração de XML, assinatura digital (A1),
> transmissão SEFAZ, QR-Code NFC-e, motor de tributos, DANFE e a ativação no fluxo de venda.**

Esta auditoria reposiciona o "Fase 0" não como *começar*, mas como **consolidar e
re-baselinar** uma frente que já avançou bastante — para que o roadmap restante ataque o
que de fato falta, sem reimplementar o que já existe.

---

## 1. Método

- Leitura direta de `prisma/schema.prisma` (modelos/enums fiscais).
- Leitura do código em `lib/fiscal/**` (8 subsistemas).
- Rastreamento de **chamadores** das funções fiscais fora de `lib/fiscal/**` (prova de dormência).
- Inventário de rotas `app/api/fiscal/**` e UI fiscal em `components/**`.
- `git log` da família fiscal (commits `GOAL_00x`).
- Cruzamento com `docs/ai/CURRENT_STATUS.md` e memória do projeto.

Nenhuma execução de banco, nenhum `db push`, nenhuma chamada externa.

---

## 2. Inventário do que EXISTE (committed)

### 2.1 Schema Prisma — fundação (GOAL_001B · commit `32ae9c8`)

Bloco fiscal em `prisma/schema.prisma` (a partir da linha ~2075). **Tabelas já existentes**
(migração aplicada conforme memória do projeto):

| Modelo (tabela) | Papel | Observações de design |
|---|---|---|
| `ConfiguracaoFiscalLoja` (`configuracoes_fiscais_loja`) | Identidade fiscal 1:1 por loja | `fiscalEnabled @default(false)` — **nasce desligado**. Segredos (CSC/token) só por referência (`cscTokenRef`, `providerTokenRef`). Endereço fiscal estruturado para o XML. |
| `CertificadoDigital` (`certificados_digitais`) | Certificado A1 por loja | Segredo só por referência (`blobRef`, `senhaRef`) — **nunca** os bytes do `.pfx` nem a senha em claro. |
| `SerieFiscal` (`series_fiscais`) | Série + contador atômico | `@@unique([storeId, modelo, serie, ambiente])`. |
| `NotaFiscal` (`notas_fiscais`) | Documento fiscal + snapshots congelados | Campos para resultado SEFAZ (`chaveAcesso`, `protocolo`, `cStat`, `qrCodeData`…), XML (`xmlAssinado`, `xmlAutorizado`), contingência. 1 venda → N tentativas, 1 vigente. |
| `NotaFiscalItem` (`notas_fiscais_itens`) | Item fiscal congelado | NCM/CEST/CFOP/CST/CSOSN/origem + base/alíquota/valor ICMS. |
| `EventoFiscal` (`eventos_fiscais`) | Cancelamento/CC-e/inutilização/contingência | Idempotente por `(nota, tipo, sequencia)`. |
| `FiscalEmissaoJob` (`fiscal_emissao_jobs`) | **Fila idempotente** pós-commit | Desacopla o balcão da emissão (lock/retry/dedupe). Tabela existe; **sem produtor e sem worker**. |
| `FiscalLog` (`fiscal_logs`) | Trilha append-only | Toda interação fiscal (montar/assinar/transmitir/consultar + cStat). |

**Enums (10):** `FiscalStatusVenda`, `StatusNotaFiscal`, `ModeloFiscal`, `AmbienteFiscal`,
`TipoEmissao`, `RegimeTributario`, `FiscalProviderTipo`, `CertificadoStatus`,
`TipoEventoFiscal`, `StatusEventoFiscal`, `FiscalJobTipo`, `FiscalJobStatus`.
Campo colapsado na venda: `Venda.fiscalStatus @default(NAO_FISCAL)` (linha ~1411).

**Avaliação:** schema **production-grade** e provider-agnóstico. Multi-loja estrito
(ADR-0003, sem `@default("loja-1")`). É o ativo mais valioso já entregue.

### 2.2 `lib/fiscal/**` — camadas de domínio (GOALs 002 → 008)

| GOAL | Commit | Arquivos | O que faz | Estado |
|---|---|---|---|---|
| **002** Identidade fiscal/loja | `549513d` | `fiscal-identity-service.ts`, `guard-fiscal-admin.ts`, `fiscal-validators.ts` | CRUD config/certificado/série por loja, admin-only, segredo por referência | Dormente, admin-only |
| **003** State machine | `ca681ed` | `venda-fiscal-state-machine.ts` | Gates `can*`/`assert*` sobre `Venda.fiscalStatus` | **Wired** em 6 rotas (ver §3) — no-op enquanto `NAO_FISCAL` |
| **004** Produto fiscal persist | `04ce54d` | `lib/produto-fiscal.ts` (+ wiring) | Persiste NCM/CEST/CFOP/origem em `Produto.metadata.fiscal` | Real e em uso (só grava no create) |
| **005** Snapshot da venda | `b5177cf` | `venda-fiscal-snapshot.ts`, `venda-fiscal-snapshot-service.ts` | Congela emitente/destinatário/itens; grava `NotaFiscal` RASCUNHO | Dormente — **sem chamador** |
| **006** Provider abstraction | `a206dce` | `provider/{types,stub-homologacao,resolver,index}.ts` | Contrato `FiscalProvider` (8 métodos) + provider STUB | Só `STUB_HOMOLOGACAO`; gateways = `nao_implementado` |
| **007** Emission pipeline | `cd565c8` | `emission/{emission-pipeline,emission-service,snapshot-reader,emission-log}.ts` | Orquestra validar→preparar→numerar→emitir; escreve só `Venda.fiscalStatus`+log | Dormente — **sem chamador** |
| **008** Numeração por série | `2b88411` | `numbering/{allocate-fiscal-number,prisma-numbering-ports}.ts` | Alocação atômica série/número, idempotente | Dormente — só chamado dentro do pipeline |

**Cobertura de testes:** cada subsistema tem `*.test.ts` colocalizado
(`fiscal-validators.test.ts`, `venda-fiscal-state-machine.test.ts`,
`venda-fiscal-snapshot.test.ts`, `provider/provider.test.ts`, `emission/emission.test.ts`,
`numbering/numbering.test.ts`, `fiscal-identity-service.test.ts`). Sessões anteriores
reportaram a suíte fiscal verde; esta auditoria não re-executou (read-only).

### 2.3 Rotas e UI fiscais

- **APIs:** `app/api/fiscal/config/route.ts`, `app/api/fiscal/certificado/route.ts`,
  `app/api/fiscal/certificado/[id]/route.ts` (CRUD de identidade — GOAL_002).
- **UI:** `components/configuracoes-v3/features/settings/sections/FiscalSection.tsx`
  — seção "Identidade Fiscal" em Configurações V3, com banner "Fiscal ainda não habilitado".
- **PDV:** **nenhum** botão/fluxo fiscal (correto — emissão não ligada).

---

## 3. Prova de dormência (o ponto mais importante)

A afirmação "tudo é dormente" foi **verificada empiricamente**, não assumida:

```
grep "emitirNotaFiscalVenda|runEmissionPipeline|createVendaFiscalSnapshot|
      buildVendaFiscalSnapshot|allocateFiscalNumber"  (fora de lib/fiscal/**)
→ 0 matches
```

**Conclusão:** nenhum PDV, nenhuma rota, nenhum Server Action, nenhum ponto do fluxo de
venda chama a criação de snapshot, o pipeline de emissão ou a numeração. A camada fiscal
só executa a partir dos próprios testes.

**Única referência viva:** os `assert*` da state machine (GOAL_003) em 6 rotas:
`app/api/vendas/[id]/{corrigir, corrigir-itens, corrigir-titulo, corrigir-parcelas,
corrigir-item-meta, cancelar}/route.ts`. Como toda venda nasce e permanece `NAO_FISCAL`
(pois `fiscalEnabled = false`), esses gates retornam **sempre "liberado"** — comportamento
idêntico ao anterior. Risco operacional atual: **nulo**.

---

## 4. Mapa de prontidão por capacidade

| Capacidade fiscal | Existe? | Evidência |
|---|---|---|
| Schema/persistência fiscal | ✅ Completo | 8 modelos + 10 enums |
| Identidade fiscal por loja | ✅ Completo | `ConfiguracaoFiscalLoja` + APIs + UI |
| Certificado A1 (metadados) | ⚠️ Parcial | Modelo existe; **cofre de segredo não definido** (blobRef/senhaRef apontam para vault inexistente) |
| Numeração série/número | ✅ Completo (dormente) | `numbering/*` atômico |
| State machine de venda | ✅ Completo (no-op) | `venda-fiscal-state-machine.ts` |
| Snapshot congelado da venda | ✅ Completo (sem chamador) | `venda-fiscal-snapshot-service.ts` |
| Abstração de provider | ✅ Contrato pronto | `provider/types.ts` + resolver |
| Orquestração de emissão | ✅ Pipeline pronto (simulado) | `emission/emission-pipeline.ts` |
| **Cálculo de tributos** | ❌ Ausente | Itens default 0; sem motor CST/CSOSN/ICMS |
| **Geração de XML NFC-e** | ❌ Ausente | Provider devolve placeholders `SIM-...` |
| **Assinatura digital (XMLDSig)** | ❌ Ausente | Sem código de assinatura |
| **Transmissão SEFAZ** | ❌ Ausente | Sem SOAP/REST por UF |
| **QR-Code + URL consulta NFC-e** | ❌ Ausente | Campo existe; sem gerador/CSC hash |
| **DANFE/DANFCE** | ❌ Ausente | Roadmap #9 não iniciado |
| **Eventos (cancel/inutilização)** | ⚠️ Stub | Métodos no provider; **sem serviço que grava `EventoFiscal`** |
| **Fila/worker de emissão** | ⚠️ Só tabela | `FiscalEmissaoJob` existe; sem produtor/consumidor |
| **Contingência real** | ❌ Ausente | Enum/campos existem; sem lógica |
| **Ativação no fluxo de venda** | ❌ Ausente | Nenhum chamador (ver §3) |

---

## 5. Impacto cruzado (read-only)

| Módulo | Impacto atual | Observação |
|---|---|---|
| **PDV / Venda** | Nenhum | State machine é no-op; nenhuma emissão. Ativar emissão **não pode** bloquear o balcão (exige fila assíncrona — `FiscalEmissaoJob`). |
| **Financeiro** | Nenhum | Camada fiscal não toca caixa/recebível. |
| **Estoque** | Nenhum | Snapshot lê produto via `getProdutoFiscal` (read-only). |
| **Multi-loja** | Conforme | Tudo escopado por `storeId`; sem fallback `loja-1`. |
| **Auth** | Conforme | APIs fiscais são admin-only (`guard-fiscal-admin.ts`). |

---

## 6. Documentos referenciados pelo código que NÃO existem (dívida de doc)

O próprio código aponta para documentos ausentes — gap a sanar nesta Fase 0:

- `docs/architecture/FISCAL_SCHEMA_DESIGN_v01.md` — citado em `schema.prisma:2077`.
- `MASTER_FISCAL_EXECUTION_PLAN.md` — citado em `schema.prisma:2077` (criado nesta Fase 0).
- `NFCE_ARCHITECTURE §17/§18` — citado em `venda-fiscal-state-machine.ts:13`.

> A memória do projeto registrava `AUDITORIA_PRE_FISCAL_READINESS_v01.md` e
> `NFCE_ARCHITECTURE_v01.md` como criados numa sessão anterior — **ambos ausentes do repo**
> (nunca commitados). Esta auditoria recria o readiness; o blueprint de arquitetura fica
> como item recomendado para a fase de implementação.

---

## 7. Conclusão e recomendação

1. **Não reimplementar** GOALs 001B–008. Estão entregues, testados e dormentes.
2. O roadmap restante deve focar **emissão real**: tributos → XML → assinatura → SEFAZ →
   QR/DANFE → eventos → contingência → ativação gated por fila.
3. A ativação é a manobra de maior risco e **exige fila assíncrona pós-commit**
   (`FiscalEmissaoJob`) para nunca travar o PDV.
4. Sanar a dívida de documentação (este doc + Plano Mestre + Roadmap + gaps).

**Gaps priorizados:** ver `AUDITORIA_FISCAL_GAPS_v01.md`.
**Plano de execução:** ver `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
**Roadmap confirmado:** ver `docs/roadmaps/ROADMAP_FISCAL.md`.

---

*Imutável. Atualizações em `_v02`.*
