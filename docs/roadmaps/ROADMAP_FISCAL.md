---
title: Roadmap Fiscal (NFC-e/SAT/NF-e) — OmniGestão Pro
hub: fiscal
status: vivo
owner: produto/arquitetura
last_update: 2026-07-15
sprint_atual: GOAL-003 C14N/XMLDSig FECHADO (PR #6); gate global F4→F5 ainda aberto
---

# 🧾 Roadmap Fiscal — OmniGestão Pro

> **Nota de governança:** Fiscal é uma **frente transversal (satélite de PDV/Operações)**,
> não um dos 11 HUBs canônicos do `docs/roadmaps/INDEX.md §5`. Este roadmap segue a estrutura
> obrigatória de roadmap de HUB por consistência. Incluir Fiscal no índice §6 é follow-up
> recomendado (não feito nesta Fase 0 para manter escopo fechado).
>
> **Base factual:** `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md`,
> `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`. **Governa:**
> `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.

## 0. Reconciliação vigente — 2026-07-15

> **Fonte factual:** [`FISCAL_RECONCILE_REPORT_001.md`](../fiscal/FISCAL_RECONCILE_REPORT_001.md) ·
> fechamento XSD [`FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md`](../fiscal/FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md) ·
> prova C14N/XMLDSig [`FISCAL_XML_C14N_EXTERNAL_PROOF_003.md`](../fiscal/FISCAL_XML_C14N_EXTERNAL_PROOF_003.md) ·
> fechamento GOAL-003 [`FISCAL_XML_C14N_GOAL_003_CLOSURE_REPORT.md`](../fiscal/FISCAL_XML_C14N_GOAL_003_CLOSURE_REPORT.md).
> O commit `ba0cc12` colocou F2–F4 e o dry-run no código. O merge `82c219c` (PR #4) integrou o
> worker XSD B2. O merge `e52d16b` (PR #6) integrou a prova externa C14N/XMLDSig.
> **Prova técnica ≠ homologação ≠ produção.**

| Fase | Código/teste | Runtime/banco | Evidência externa | Estado reconciliado |
|---|---|---|---|---|
| F0 | plano e arquitetura existentes | n/a | não aplicável | governança reconciliada |
| F1 | ADR-0009 + EnvVault testado | sem caller; 0 certificados | nenhuma | N3 interno |
| F2 | tax-engine testado | sem caller | sem contador; sem ST | N3, lacuna CSOSN 500 |
| F3 | XML/chave + **XSD oficial B2** | worker XSD sob demanda; sem caller de venda | schema oficial versionado; **sem SEFAZ** | **N4 no eixo XSD**; G-C2 **fechado** |
| F4 | signer endurecido (RSA-SHA1) + C14N 1.0 **integrado** | **sem caller de venda** (dormente) | prova Java/JSR 105 + CI PR #6 + artefato | **N4 no eixo C14N/XMLDSig**; P-05 fechado |
| F5 | contrato + stub | 0 notas; sem provider real | nenhuma SEFAZ | N1 |
| F6 | ausente | ausente | nenhuma | N0 |
| F7 | tabela da fila + guards | 0 jobs; sem produtor/worker | nenhuma | N1; ativação proibida |
| F8 | ausente | ausente | nenhuma | N0 |
| F9 | schema + stub | 0 eventos | nenhuma | N1 |
| F10 | ausente | ausente | nenhuma | N0 |
| F11 | ausente | zero evidência | nenhuma | N0; não homologado |
| F12 | ausente | zero evidência | nenhuma | N0; não produtivo |

**Gates:** G-C1 fechado (GOAL-001) · **G-C2 fechado** (XSD B2) · **critério C14N/XMLDSig do gate
técnico F4→F5 = FECHADO** (GOAL-003, PR #6) · gate Fiscal **global** F4→F5 e G-F5/G-F7/G-F12
**ainda abertos**. Não existe G-C3.

**GOAL-003:** **FECHADO** (implementação + merge + fechamento documental). GOAL-004 **não**
iniciado. Backlog de cadastro (paridade `upsertProduto`) permanece distinto. Somente o GOAL 022
poderá construir ativação, restrita a `HOMOLOGACAO` e sujeita a G-F7.

---

## 1. Visão

Emitir documentos fiscais (NFC-e primeiro; SAT/NF-e depois) de forma **provider-agnóstica,
multi-loja e satélite** — sem nunca travar o balcão — transformando cada venda do PDV em
documento fiscal válido na SEFAZ.

## 2. Objetivos

1. Emitir **NFC-e autorizada** (cStat 100) em homologação para 1 loja-piloto.
2. **Zero impacto** no tempo de fechamento da venda (emissão 100% assíncrona pós-commit).
3. **Multi-loja real**: identidade/certificado/série/CSC por loja, habilitação loja-a-loja.
4. **Segredo seguro**: certificado A1 e CSC nunca em claro nem no bundle do cliente.
5. Cobertura de eventos: cancelamento e inutilização dentro das regras da SEFAZ.

## 3. Concorrentes analisados

| Concorrente | Aprendizado de 1 linha |
|---|---|
| Bling / Tiny | Emissão via gateway próprio; UX "1 clique" esconde a fila assíncrona por trás. |
| Avantpro / Mercado Turbo (PDV) | NFC-e no PDV com contingência offline é requisito de balcão, não opcional. |
| Omie / ContaAzul | Forte em NF-e (serviço/produto) + integração contábil; fiscal acoplado ao financeiro. |
| Gateways (Focus/PlugNotas/eNotas/NFE.io) | Abstraem SEFAZ por UF; custo recorrente troca esforço de manutenção por OPEX. |

> Benchmark detalhado de PDV/Estoque em `docs/skills/executoras/research/SKILL_BENCHMARK_*`.

## 4. Diferenciais do OmniGestão

- **Satélite desacoplado**: fila `FiscalEmissaoJob` com lock/retry/dedupe — o PDV só enfileira.
- **Provider-agnóstico de fábrica**: trocar SEFAZ-direto ↔ gateway sem tocar o pipeline.
- **Snapshot congelado**: o documento usa a foto fiscal do instante da venda, não dado vivo.
- **Default-off + habilitação por loja**: adoção gradual sem risco para lojas não fiscais.

## 5. Gaps atuais (real, cruzado com auditoria)

**Código existente (não refazer do zero):** schema fiscal, identidade por loja, state machine,
produto fiscal, snapshot, provider abstrato, pipeline, numeração, tax-engine, XML, assinatura,
EnvVault e dry-run. Os guards da state machine têm seis callers reais; o restante do motor permanece
sem caller no fluxo de venda e o banco fiscal está vazio.

**Falta (o trabalho real):**
- P0: paridade fiscal do `upsertProduto` · ST/CSOSN 500 · ~~XSD oficial~~ (**feito, G-C2**) ·
  ~~C14N interoperável~~ (**feito no eixo técnico, GOAL-003**) · gate global de dry-run auferível.
- P1: provider/transmissão em homologação · QR-Code/CSC · estado incerto · fila · DANFCE · eventos ·
  contingência · observabilidade. Ativação somente no GOAL 022 e mediante gate.
- Doc: o ponteiro histórico `CURRENT_STATUS.md:2934` estava errado. O caminho real é
  `docs/ai/CURRENT_STATUS.md`, agora com seção fiscal consolidada; o texto "NF-e — mock" permanece
  apenas no contexto do preview PDV Next, não como estado fiscal global.

> Detalhe e severidade: `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`.

## 6. Funcionalidades futuras (priorizadas)

1. NFC-e Simples Nacional B2C (caminho mais curto ao "autorizado").
2. DANFCE com QR-Code.
3. Cancelamento + inutilização.
4. Contingência offline.
5. NF-e modelo 55 (B2B) e SAT (SP).
6. Integração contábil (exportação de XML/relatórios).
7. Painel de observabilidade fiscal (fila/falhas/cStat).

## 7. Backlog (granular, pronto para virar sprint)

- [x] ADR: cofre de segredo do certificado A1 (Vault × KMS × env por loja) → **ADR-0009** (aceito).
- [x] `lib/fiscal/tax-engine/*`: motor Simples Nacional existente e testado (`ba0cc12`), **sem ST/CSOSN 500**.
- [x] `lib/fiscal/xml/*`: builder `infNFe` 4.00 + chave existentes (`ba0cc12`).
- [x] Worker XSD B2 + `validarXsd` real + pacote `PL_010e_v1.02` (merge `82c219c`, G-C2).
- [x] `lib/fiscal/signing/*`: XMLDSig com RSA-SHA1/SHA-1 (ADR-0011), C14N 1.0 e prova externa
  Java/JSR 105; **N4 no eixo C14N/XMLDSig**, sem certificado real.
- [ ] `lib/fiscal/provider/<impl>`: provider real (homologação) registrado no resolver.
- [ ] `lib/fiscal/qrcode/*`: QR-Code NFC-e + URL consulta por UF/CSC.
- [ ] Produtor pós-commit (enfileira `FiscalEmissaoJob`) + worker idempotente.
- [ ] Reflexo de status fiscal no PDV/recibo (read-only).
- [ ] DANFCE unificado sobre XML autorizado.
- [ ] Serviço de eventos (`EventoFiscal`) cancelamento/inutilização.
- [ ] Atualizar `CURRENT_STATUS.md` (fiscal: mock → fundação dormente).

## 8. Fases (objetivo + critério de saída)

| Fase | Objetivo | Critério de saída |
|---|---|---|
| **F0** Plano Mestre | Auditar + planejar | 4 docs criados; tsc limpo; código intocado ✅ |
| **F1** ADR cofre `[GATE]` | Decidir onde mora o A1/senha | ADR aprovado |
| **F2** Tributos | Calcular impostos NFC-e SN | Função pura + testes |
| **F3** XML | Gerar `infNFe` + chave | XML válido no XSD |
| **F4** Assinatura | Assinar com A1 | XML assinado verificável; segredo nunca logado |
| **Dry-Run** (gate) | Esteira a seco, sem transmitir (descarta XML) | Relatório de prontidão verde — critério de entrada da F5 |
| **F5** SEFAZ `[GATE]` | Provider real + transmissão | Documento autorizado em homologação (cStat 100) |
| **F6** QR-Code | QR + URL consulta | QR validado no portal SEFAZ homolog. |
| **F7** Ativação `[GATE]` | Ligar emissão por fila (piloto) | Venda real (homolog.) → job → autoriza; PDV não trava |
| **F8** DANFCE | Representação gráfica | DANFCE com QR sobre XML autorizado |
| **F9** Eventos | Cancelamento/inutilização | Evento autorizado + status refletido |
| **F10** Contingência | Offline → transmissão posterior | Entra/sai de contingência; fila reprocessa |
| **F11** Homologação ampla | Bateria SEFAZ por UF | Casos felizes + rejeição/denegação verdes |
| **F12** Produção `[GATE]` | Virada por loja | NFC-e autorizada em produção na loja-piloto |

> Detalhe de cada fase (arquivos prováveis, "não fazer", DoD): `MASTER_FISCAL_EXECUTION_PLAN.md §3`.

## 9. Dependências

| Depende de | Por quê |
|---|---|
| **PDV** | Origem da venda; ponto de enfileiramento pós-commit (não inline). |
| **Estoque/Produto** | Identidade fiscal do item (NCM/CEST/CFOP/origem via `getProdutoFiscal`). |
| **CRM/Cliente** | Destinatário (CPF/CNPJ + endereço estruturado para NFC-e nominal/NF-e). |
| **Multi-loja** | Identidade/certificado/série/CSC por `storeId`; habilitação por loja. |
| **Infra/segredo** | Cofre para o A1/CSC (ADR F1) — bloqueia assinatura. |

> Matriz de paralelismo: Fiscal **não deve** evoluir em paralelo com mudanças de contrato do
> PDV (`finalizeSaleTransaction`) nem do schema — é serial nesses pontos.

## 10. Riscos

| Risco | Tipo | Mitigação |
|---|---|---|
| Emissão inline travar o balcão | Técnico/Produto | Fila assíncrona obrigatória; PDV só enfileira. |
| Falha fiscal desfazer a venda | Técnico | Venda commita primeiro; fiscal é satélite; nunca rollback de venda. |
| Vazamento de certificado/senha | Segurança | Segredo só por referência; cofre por ADR; nunca em log/bundle. |
| Imposto calculado errado | Negócio/Legal | Começar por matriz mínima (SN B2C); testes; homologação ampla antes de produção. |
| Ligar para todas as lojas de uma vez | Produto | Habilitação loja-a-loja; kill-switch `fiscalEnabled`. |
| Divergência de layout por UF | Técnico | Provider-agnóstico; gateway como rota alternativa. |

## 11. Sprint atual

**GOAL-003 C14N/XMLDSig (`FISCAL-XML-C14N-EXTERNAL-PROOF-003`) FECHADO em 15/07/2026** — integrado
na `main` pelo PR #6 (`e52d16b`); prova Java/JSR 105 independente; 16/16 provas externas;
workflow e artefato do PR verdes. F1 segue resolvida pela ADR-0009; F3 tem validação XSD real
(N4 no eixo XSD) e F4 alcança N4 no eixo C14N/XMLDSig com signer **dormente**. Próximo passo:
avaliação do GOAL seguinte (dry-run auferível / backlog); **GOAL-004 não iniciado**.
Homologação e produção **não** foram abertas.

## 12. Status atual (1 parágrafo)

A frente fiscal tem fundação dormente com **validação XSD oficial real** (worker B2, G-C2) e
**prova técnica externa de C14N/XMLDSig** (PR #6, critério C14N do F4→F5 fechado). Schema,
identidade, guards, snapshot, tax-engine, XML, assinatura (RSA-SHA1), vault, provider stub,
pipeline e numeração existem; o motor de emissão **não tem caller de venda**; banco fiscal vazio;
`fiscalEnabled` inalcançável. O gate Fiscal **global** ainda **não** autoriza F5 (lacunas fora do
GOAL-003). **Prova técnica ≠ homologação ≠ produção. N6=0 e N7=0.** Sequência oficial em
`docs/fiscal/`.

## 13. Métricas de sucesso

- **Tempo extra na venda por causa do fiscal:** ~0 ms (emissão fora da transação).
- **Taxa de autorização** (cStat 100) em homologação: > 99% nos casos felizes.
- **Lojas habilitadas sem incidente de balcão:** 100% das ativadas.
- **Vazamento de segredo:** 0 (auditável: nada em claro em log/bundle/coluna).
- **Jobs em dead-letter:** monitorado e drenado (sem documento "preso").

## 14. Blockers

- **BL-FISCAL-1:** ✅ **RESOLVIDO** por `ADR-0009` (cofre de segredos: EnvVault piloto → KmsStorageVault produção). A implementação do cofre entra na F4 (assinatura).
- **BL-FISCAL-2:** decisão provider (SEFAZ direto × gateway) → bloqueia transmissão (F5).

> Tracking vivo de blockers gerais: `docs/status/BLOCKERS.md`.

## 15. Referências

- Auditorias: `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md`,
  `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`.
- Plano mestre: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
- Código vivo: `lib/fiscal/**`, `prisma/schema.prisma` (bloco fiscal ~L2075+),
  `app/api/fiscal/**`, `components/configuracoes-v3/.../FiscalSection.tsx`.
- Commits da fundação: `32ae9c8`, `549513d`, `ca681ed`, `04ce54d`, `b5177cf`, `a206dce`,
  `cd565c8`, `2b88411`.
- Arquitetura oficial (Fase 1, **criada**): `docs/decisions/ADR-0008-fiscal-architecture.md` +
  `docs/architecture/{FISCAL_SCHEMA_DESIGN,NFCE_ARCHITECTURE,FISCAL_EVENTS,FISCAL_SECURITY,FISCAL_DRY_RUN}.md`
  (sem sufixo `_v01`; comentários de código que citam `_v01`/`§17/§18` não foram alterados —
  área protegida).
