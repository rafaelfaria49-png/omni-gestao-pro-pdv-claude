# AUDITORIA FISCAL — GAPS v01

> **Tipo:** Auditoria READ-ONLY (análise de lacunas) · **Módulo:** Fiscal
> **Data:** 2026-06-24 · **Fase:** 0 · **Base:** `AUDITORIA_PRE_FISCAL_READINESS_v01.md`
> Nenhum código/schema/banco alterado. Imutável (correções = v02).

---

## 0. Como ler este documento

A `AUDITORIA_PRE_FISCAL_READINESS_v01` provou que GOALs 001B–008 estão entregues
e dormentes. Este documento cataloga **apenas o que falta** para sair de "scaffold
simulado" e chegar a "NFC-e autorizada na SEFAZ", classificado por severidade:

- **P0** — bloqueia qualquer emissão real. Sem isto, nada vira documento fiscal.
- **P1** — necessário para operação fiscal completa/legal, mas não bloqueia o 1º "autorizado".
- **P2** — qualidade, robustez, escala, conveniência.

> Convenção de risco herdada de `docs/status/RISCOS.md` e `DIVIDA_TECNICA.md`.

---

## 1. Gaps P0 — bloqueadores de emissão real

### P0-1 · Motor de tributos (CST/CSOSN/ICMS)
- **Hoje:** `NotaFiscalItem` aceita base/alíquota/valor ICMS, mas o snapshot grava **0**.
  `getProdutoFiscal` (GOAL_004) traz NCM/CEST/CFOP/origem, **não** a tributação calculada.
- **Falta:** regra por regime (Simples Nacional × Normal), CSOSN×CST, cálculo de base e
  alíquota por UF/operação, total de tributos (Lei da Transparência).
- **Risco se ignorado:** XML rejeitado ou imposto incorreto (passivo fiscal).
- **Depende de:** decisão de escopo (NFC-e B2C Simples Nacional primeiro reduz muito a matriz).

### P0-2 · Geração de XML NFC-e (layout 4.00)
- **Hoje:** provider `STUB_HOMOLOGACAO` devolve `chaveAcesso`/`protocolo` placeholders `SIM-...`.
- **Falta:** serialização `infNFe` (ide, emit, dest, det/prod/imposto, total, pgto, infAdic),
  cálculo da chave de acesso (44 dígitos + DV), `cNF`/`cDV`.
- **Risco se ignorado:** impossível assinar/transmitir.
- **Depende de:** P0-1 (totais/tributos entram no XML).

### P0-3 · Assinatura digital XMLDSig (certificado A1)
- **Hoje:** `CertificadoDigital` guarda só metadados + `blobRef`/`senhaRef`. **Sem** código
  de assinatura e **sem cofre** (vault) para o `.pfx`/senha.
- **Falta:** (a) decisão e implementação do **cofre de segredo** (onde mora o `.pfx`);
  (b) carregamento seguro do A1; (c) assinatura XMLDSig (RSA-SHA1/SHA256) do `infNFe`.
- **Risco se ignorado:** SEFAZ recusa documento não assinado; ou pior, segredo vaza.
- **Depende de:** P0-2; decisão de infraestrutura (vault).

### P0-4 · Transmissão SEFAZ (autorização + retorno)
- **Hoje:** nenhuma chamada externa. Resolver reconhece `SEFAZ_DIRETO` e 4 gateways como
  `provider_nao_implementado`.
- **Falta:** cliente de webservice por UF (SOAP/REST), envio de lote/síncrono, parse do
  retorno (`cStat`/`xMotivo`/`protocolo`), tratamento de rejeição × denegação × autorização.
- **Decisão estratégica:** **SEFAZ direto** (mais barato, mais trabalho por UF) **vs gateway**
  (Focus/PlugNotas/eNotas/NFE.io — mais rápido, custo recorrente). O enum já prevê ambos.
- **Risco se ignorado:** sem isto não há "autorizado".
- **Depende de:** P0-2, P0-3.

### P0-5 · QR-Code NFC-e + URL de consulta (CSC)
- **Hoje:** `NotaFiscal.qrCodeData`/`urlConsulta` existem; `cscId`/`cscTokenRef` na config.
  **Sem** gerador.
- **Falta:** hash do QR-Code conforme CSC (token do contribuinte) e URL por UF/ambiente.
- **Risco se ignorado:** NFC-e sem QR-Code é inválida no cupom.
- **Depende de:** P0-2.

### P0-6 · Ativação no fluxo de venda via fila assíncrona
- **Hoje:** `FiscalEmissaoJob` (tabela com lock/retry/dedupe) existe, mas **sem produtor**
  (quem enfileira após a venda) e **sem worker** (quem drena a fila e chama o pipeline).
- **Falta:** (a) produtor pós-commit no `finalizeSaleTransaction`/venda (enfileira, não emite
  inline); (b) worker idempotente que chama `emitirNotaFiscalVenda`; (c) reflexo de status no
  PDV/recibo.
- **Risco se ignorado / mal feito:** emitir **inline** trava o balcão e acopla venda a SEFAZ.
  **Esta é a manobra mais arriscada de toda a frente.**
- **Depende de:** P0-2..P0-5 prontos + `fiscalEnabled` por loja.

---

## 2. Gaps P1 — operação fiscal completa

### P1-1 · DANFE / DANFCE (Roadmap #9)
- Renderização do cupom/representação gráfica (NFC-e = DANFCE com QR-Code) e PDF da NF-e.
- Hoje há 3 pipelines de impressão não-fiscais (cupom térmico, recibo, `CupomNaoFiscal`).
  O DANFCE precisa nascer **unificado** sobre o XML autorizado, não sobre o carrinho.

### P1-2 · Serviço de eventos fiscais (Roadmap #10)
- `EventoFiscal` (tabela) + métodos `cancelar`/`inutilizar` no provider existem.
- **Falta** o serviço que: valida janela legal (ex.: cancelamento NFC-e em até 30 min),
  grava `EventoFiscal` idempotente, transmite o evento, atualiza `NotaFiscal.status` e
  `Venda.fiscalStatus`. Hoje só o provider STUB responde simulado.

### P1-3 · Contingência real (offline → transmissão posterior)
- Enum `TipoEmissao.CONTINGENCIA_OFFLINE` + campos `dataContingencia`/`justContingencia`
  existem; **sem lógica** de entrada/saída de contingência nem reprocessamento.

### P1-4 · Destinatário com endereço estruturado
- Snapshot lê apenas `cliente.city`. NFC-e nominal (acima de limite/ a pedido) e NF-e exigem
  endereço completo + (CPF|CNPJ) válidos. Falta capturar/validar no fluxo.

### P1-5 · Validação de identidade fiscal da loja
- `ConfiguracaoFiscalLoja` tem `codigoMunicipioIbge`, `cep`, `uf`, `crt`, IE — **sem**
  validação/lookup (IBGE, dígitos de IE por UF). Config incompleta hoje só barra no provider.

### P1-6 · Cofre de segredo (decisão pendente)
- `blobRef`/`senhaRef`/`cscTokenRef`/`providerTokenRef` referenciam um cofre que **não existe**.
- Decisão arquitetural (ADR) obrigatória **antes** de subir qualquer `.pfx`: Supabase Vault?
  KMS? variável de ambiente por loja? Bloqueia P0-3 na prática.

---

## 3. Gaps P2 — qualidade/escala

| Item | Descrição |
|---|---|
| Observabilidade fiscal | Painel sobre `FiscalLog`/`FiscalEmissaoJob` (fila, falhas, cStat). |
| Reprocessamento/dead-letter | Política de `maxTentativas` esgotadas no job. |
| Multi-modelo | SAT (SP) e NF-e (modelo 55) além de NFC-e — enums prontos, lógica não. |
| Inutilização em lote | UI/serviço de faixas inutilizadas. |
| Exportação contábil | XML/relatórios para contabilidade. |
| Testes de homologação SEFAZ | Suíte contra ambiente de homologação real (não o stub). |

---

## 4. Documentos ausentes (dívida de doc citada pelo código)

| Doc citado | Onde é citado | Ação |
|---|---|---|
| `MASTER_FISCAL_EXECUTION_PLAN.md` | `schema.prisma:2077` | **Criado nesta Fase 0** |
| `docs/architecture/FISCAL_SCHEMA_DESIGN_v01.md` | `schema.prisma:2077` | Recomendado na fase de implementação |
| `NFCE_ARCHITECTURE_v01` (§17/§18) | `venda-fiscal-state-machine.ts:13` | Recomendado (reconstruir blueprint) |
| `CURRENT_STATUS.md` (linha do "Documento fiscal (NF-e) — Mock") | `docs/ai/CURRENT_STATUS.md:2934` | **Desatualizado** — não reflete GOALs 001B–008; atualizar na próxima fase |

---

## 5. Matriz de dependências (ordem forçada)

```
P0-1 tributos ─┐
               ├─► P0-2 XML ─► P0-3 assinatura ─► P0-4 SEFAZ ─► P0-6 ativação (fila)
P0-5 QR-Code ──┘                    ▲
                                    └── P1-6 cofre de segredo (ADR) bloqueia P0-3
P1-2 eventos  ── requer ► nota AUTORIZADA (P0-4)
P1-1 DANFCE   ── requer ► XML autorizado (P0-4)
P1-3 contingência ── requer ► P0-4 + política
```

**Leitura:** o cofre de segredo (P1-6) e o motor de tributos (P0-1) são os dois pré-requisitos
que destravam a cadeia. DANFE e eventos só fazem sentido **depois** do primeiro "autorizado".

---

## 6. Recomendação de sequência (resumo)

1. **ADR do cofre de segredo** (P1-6) — decisão antes de qualquer `.pfx`.
2. **Motor de tributos NFC-e Simples Nacional** (P0-1) — menor matriz primeiro.
3. **XML + chave de acesso** (P0-2).
4. **Assinatura A1** (P0-3).
5. **Decisão provider** (SEFAZ direto vs gateway) → **transmissão** (P0-4).
6. **QR-Code/CSC** (P0-5).
7. **Ativação gated por fila** (P0-6) — homologação primeiro.
8. **DANFCE** (P1-1) → **eventos** (P1-2) → **contingência** (P1-3).

Detalhe operacional, gates e critérios de pronto: `MASTER_FISCAL_EXECUTION_PLAN.md`.

---

*Imutável. Atualizações em `_v02`.*
