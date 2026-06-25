---
title: Roadmap Fiscal (NFC-e/SAT/NF-e) — OmniGestão Pro
hub: fiscal
status: vivo
owner: produto/arquitetura
last_update: 2026-06-24
sprint_atual: nenhuma (Fase 0 Plano + Fase 1 Arquitetura + F1 ADR cofre [ADR-0009] concluídos; próxima: F2 tributos)
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

**Entregue e dormente (não refazer):** schema fiscal (8 modelos/10 enums), identidade por
loja, state machine, produto fiscal, snapshot, abstração de provider, pipeline de emissão e
numeração — todos **simulados** (`STUB_HOMOLOGACAO`) e **sem chamador** no fluxo de venda.

**Falta (o trabalho real):**
- P0: motor de tributos · XML NFC-e · assinatura A1 · transmissão SEFAZ · QR-Code/CSC · ativação por fila.
- P1: DANFCE · serviço de eventos · contingência real · destinatário estruturado · cofre de segredo (ADR).
- Doc: `CURRENT_STATUS.md:2934` ainda diz "NF-e — mock" (desatualizado vs GOALs 001B–008).

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
- [ ] `lib/fiscal/tributos/*`: CSOSN/CST + base/alíquota/total (Simples Nacional).
- [ ] `lib/fiscal/xml/*`: builder `infNFe` 4.00 + chave de acesso (44 díg + DV).
- [ ] `lib/fiscal/assinatura/*`: XMLDSig com A1 carregado do cofre.
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

**Nenhuma em execução.** Fase 0 (Plano Mestre) concluída nesta sessão. Próxima sprint
candidata: **F1 — ADR do cofre de segredo** (`[GATE HUMANO]` antes de qualquer certificado).

## 12. Status atual (1 parágrafo)

A frente fiscal tem uma **fundação dormente madura** (GOALs 001B–008: schema, identidade,
state machine, produto fiscal, snapshot, provider abstration, pipeline e numeração), toda
**simulada** e **desligada por padrão**, sem nenhum chamador no fluxo de venda — risco
operacional atual nulo. **Nenhum documento fiscal real é emitido**: faltam tributos, XML,
assinatura, transmissão SEFAZ, QR-Code, DANFE, eventos e a ativação por fila. O próximo passo
é o ADR do cofre de segredo, seguido do motor de tributos NFC-e.

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
