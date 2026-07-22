---
title: ADR-0013 · Redefinição do gate executável do dry-run fiscal — 11 itens auferíveis (com autoridade e evidência)
status: aceita
data: 2026-07-22
autor: Opus 4.8 (Claude Code)
revisores: [Rafael]
hub: cross / fiscal
tags: [fiscal, dry-run, gate, nfce, xsd, assinatura, numeracao, idempotencia, provider]
superado_por:
substitui:
---

# ADR-0013 · Redefinição do gate executável do dry-run fiscal (11 itens auferíveis)

> **Status:** aceita (ADR-P03 do pacote de continuação fiscal do Fable 5) — ratificada por **Rafael** no
> checkpoint humano deste GOAL (2026-07-22), que também autorizou declarar o **G-C4 fechável**.
> **Decisão em uma frase:** substituir o antigo "dry-run verde" — que podia passar **sem
> comprovação real** — por um **gate executável de 11 itens**, cada um com **autoridade** (quem
> decide) e **evidência** (o que prova); o gate só fica verde com **11/11 aprovados**, nenhum item
> é aprovado por ausência de verificação, e **falha permanece falha** (nunca vira aviso).

---

## 1. Contexto

A `AUDITORIA_FISCAL_RECONCILIACAO_CODIGO_001` (§9) provou que o **gate de entrada da F5 era falso**:
o dry-run podia ficar "verde" enquanto validava o XML contra um XSD que não validava (D3), assinava
com um canonicalizador que a SEFAZ não usa (D2), calculava tributo sem ST (D9) e usava **numeração
placeholder** (`numeracaoPlaceholder: true`). *"O gate existe, é respeitado, e não protege nada."*

Desde então, os GOALs de continuação **fecharam as autoridades**:
- **GOAL-002 / G-C2** — worker XSD real (xmllint containerizado, pacote oficial `PL_010e_v1.02`,
  manifest `fc42d03e…`), ADR-0010.
- **GOAL-003 / G-C3** — prova externa de C14N/XMLDSig (RSA-SHA1/SHA-1), ADR-0011.
- **GOAL-004** — paridade fiscal do `upsertProduto` (produto grava NCM/CFOP/CSOSN).
- **GOAL-005** — snapshot fiscal integrado ao runtime.
- **GOAL-006 / G-C6** — cobertura de ST (CSOSN 500) no motor, ADR-0012.
- **GOAL-008** — certificado piloto via cofre (`EnvVault`, ADR-0009).

Faltava **reconstruir o critério de "verde"** para que seja **auferível** — não um booleano frouxo,
mas uma matriz de 11 itens onde cada aprovação tem autoridade e evidência.

**Estado de referência:** `origin/main` @ `f010ba1` (merge do PR #23 — GOAL-008). O motor fiscal
segue **dormente** (0 callers produtivos; 0 notas no banco); nada aqui liga emissão.

---

## 2. Decisão

Redefinir o dry-run como um **gate de 11 itens** (`runFiscalDryRunGate`), rodado em **modo gate**
(numeração real de homologação — **sem placeholder**), preservando integralmente:
- o **nome e a função do gate G-F5** (critério de entrada da transmissão);
- a separação **pipeline a seco × pipeline de emissão**;
- `pipeline/**` **nunca** persiste em banco e **nunca** transmite;
- **provider simulado**; **nenhuma chamada à SEFAZ**.

**Os 11 itens (número · nome · autoridade):**

| # | Item | Autoridade |
|---|---|---|
| 1 | Snapshot imutável válido | Contrato `VendaFiscalSnapshot` (versão) + deep-freeze |
| 2 | Produto fiscal completo | Diagnóstico do snapshot (`getProdutoFiscal`, GOAL-004) |
| 3 | XML estruturalmente correto | Builder NFC-e 4.00 + validação estrutural |
| 4 | **XSD oficial válido** | **Worker XSD real** (xmllint, `PL_010e_v1.02`) — G-C2/ADR-0010 |
| 5 | Assinatura válida | XMLDSig RSA-SHA1/SHA-1 (`verifyNfceSignature`) — G-C3/ADR-0011 |
| 6 | Certificado de teste compatível | `EnvVault` + `validarCertificadoLoja` (CNPJ×loja, validade, cadeia) — GOAL-008/ADR-0009 |
| 7 | Numeração controlada real | `allocateFiscalNumber` por série de homologação — GOAL_008 |
| 8 | Idempotência | localKey determinística + numeração idempotente + bytes determinísticos |
| 9 | Máquina de estados | Transições do pipeline a seco — GOAL_003 |
| 10 | Artefatos e logs | Invariante `descartado` + varredura de segredos — sem persistência |
| 11 | Contrato do provider | `FiscalProvider` por record/replay (Mock × Stub) — simulado |

**Regras do gate (inegociáveis):**
- **Verde ⇔ 11/11 `aprovado`.** Um item pode estar `aprovado`, `reprovado` ou **`nao_auferivel`**;
  `nao_auferivel` **nunca** conta como aprovado.
- **Nenhum item aprovado por ausência de verificação.** O item 4 consome o **worker XSD real** (G-C2)
  via adapter injetado; sem worker provisionado, fica **`nao_auferivel`** (fail-closed) — não verde.
- **Falha permanece falha.** Nenhuma reprovação é convertida em aviso para alcançar 11/11.
- **`numeracaoPlaceholder` eliminado do modo gate.** A numeração é alocada de fato (série de
  homologação); o gate exige `numeracaoPlaceholder === false`.

**O que esta decisão NÃO inclui (escopo fechado):**
- Não implementa provider real, XSD engine próprio, assinatura, XML, tax-engine ou numeração — apenas
  **exercita** as autoridades já mescladas (blocklist honrada).
- Não faz a **fiação end-to-end da ST** (venda→snapshot→XML com valores de ST): é **GOAL separado**
  (ADR-0012 §2). Por isso um **CSOSN 500 sem ST** é **fail-closed** no item 3 — nunca verde.
- Não exige a **concorrência plena da numeração** (GOAL-010): a reserva de homologação é single-thread.
- Não liga emissão, não toca banco, não faz homologação SEFAZ.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que não |
|---|---|---|---|
| A) Manter o booleano `prontoParaEmissao` | zero mudança | continua o "gate falso" (§9 da auditoria) | não fecha o risco |
| B) Gate binário só com XSD real | simples | não cobre idempotência/numeração/cofre/estados/provider | insuficiente para N4 auferível |
| C) **Gate de 11 itens com autoridade+evidência** (escolhida) | cada verde é rastreável; falha aponta o item; honesto sobre o não-auferível | superfície de teste maior | — |

---

## 4. Consequências

### 4.1 Positivas
- "Verde" passa a **significar** algo: 11 autoridades reais aprovaram, com evidência estruturada.
- A matriz **aponta o item exato** de qualquer falha (auditável).
- O item 4 amarra o gate ao **xmllint real** (não ao placebo) — fecha D3 no eixo do gate.
- Elimina a numeração placeholder do modo gate — fecha o vetor da auditoria §9.

### 4.2 Negativas / custos
- O gate só é **11/11** no **contexto provisionado** (worker XSD real). Em execução local pura, o
  item 4 é `nao_auferivel` (10/11) — **por design**, não por defeito.
- CSOSN 500 permanece **fail-closed** até o GOAL de fiação da ST.

### 4.3 Riscos introduzidos
- Ler `nao_auferivel` como "quase verde" e liberar transmissão. **Mitigação:** o gate só é verde com
  11/11 `aprovado`; `nao_auferivel` é explicitamente **não-verde**.

### 4.4 O que muda imediatamente
- Arquivos: `lib/fiscal/dry-run/{dry-run-gate.ts,dry-run-gate.types.ts,dry-run-gate-fixtures.ts,
  dry-run-gate.test.ts,index.ts}`; `package.json` (script `test:fiscal-gate`).
- Docs: `docs/architecture/FISCAL_DRY_RUN.md` (extensão — §9), este ADR, o relatório
  `docs/fiscal/FISCAL_DRY_RUN_GATE_REPORT_001.md`.
- ADR-0008/0009/0010/0011/0012 **intocados**.

### 4.5 O que muda no longo prazo
- O gate torna-se o **critério de entrada auferível** da F5 e roda em CI/worker provisionado a cada
  mudança fiscal. A fiação da ST e a concorrência plena da numeração o estenderão sem reescrever o
  contrato dos 11 itens.

---

## 5. Plano de implementação

**Implementado neste GOAL (`FISCAL-DRY-RUN-GATE-REDEFINE-007`) — dentro da allowlist.**

- Owner humano: Rafael.
- Pré-requisitos: GOAL-002/003/004/005/006/008 mesclados; G-C2/G-C3/G-C6 fechados — **confirmados**.
- Critério de pronto: `tsc` verde + suíte `lib/fiscal` verde + gate 11/11 no contexto provisionado +
  fixtures negativas reprovando no item exato.

---

## 6. Validação / como saberemos que deu certo

- `npx tsc --noEmit` = 0.
- `npm run test:fiscal-gate` verde (fiação dos 11 itens).
- Fixture positiva (mix piloto) ⇒ 11/11 no contexto com worker XSD real; 10/11 local (item 4
  `nao_auferivel`).
- Fixtures negativas reprovam no item exato: produto incompleto → 2; XML inválido → 4; assinatura
  corrompida → 5; localKey duplicado → 8; CSOSN 500 sem ST → 3 (fail-closed).
- `numeracaoPlaceholder === false` no modo gate; reexecução do mesmo localKey ⇒ mesmos bytes.

---

## 7. Referências

- Auditoria: `docs/audits/AUDITORIA_FISCAL_RECONCILIACAO_CODIGO_001.md` (§9, D2/D3/D9).
- Arquitetura: `docs/architecture/FISCAL_DRY_RUN.md` (§9 — o gate executável).
- Relatório: `docs/fiscal/FISCAL_DRY_RUN_GATE_REPORT_001.md` (matriz item × autoridade × evidência).
- ADRs: ADR-0008 (arquitetura), ADR-0009 (cofre), ADR-0010 (worker XSD), ADR-0011 (XMLDSig),
  ADR-0012 (ST/CSOSN 500).

---

## 8. Notas / discussão

- **Escala de maturidade (auditoria §6):** este gate eleva o dry-run a **N4 auferível** — *não* é N6.
  **N4 auferível ≠ N6.** **Nenhuma homologação SEFAZ ocorreu.** A **concorrência plena da numeração**
  permanece no **GOAL-010**.
- **Numeração do ADR:** o pacote rotula esta decisão como **ADR-P03**; o próximo número real livre no
  índice (`ADR-0010/0011/0012` ocupados) é **ADR-0013**, adotado aqui.
- **Ratificação (2026-07-22):** Rafael **aceitou a ADR-P03** e **autorizou declarar G-C4 fechável**. O
  registro em `docs/decisions/INDEX.md` fica como acréscimo fora da allowlist deste GOAL (follow-up de
  higiene documental).
- **G-C4 (fechável):** o critério de "dry-run verde" passa a ser **auferível** (matriz de 11 itens). G-C4
  é declarado **fechável** — não "fechado em produção": item 4 exige o worker XSD real provisionado e a
  fiação da ST (CSOSN 500) permanece pendente (GOAL separado). N4 auferível **≠** N6; nenhuma homologação
  SEFAZ ocorreu; concorrência plena da numeração permanece no **GOAL-010**.
