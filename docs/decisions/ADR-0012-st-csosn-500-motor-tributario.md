---
title: ADR-0012 · Cobertura de Substituição Tributária no motor fiscal — CSOSN 500 (substituído)
status: aceita
data: 2026-07-22
autor: Opus 4.8 (Claude Code)
revisores: [Rafael]
hub: cross / fiscal
tags: [fiscal, tax-engine, st, csosn-500, nfce, simples-nacional]
superado_por:
substitui:
---

# ADR-0012 · Cobertura de Substituição Tributária no motor fiscal — CSOSN 500 (substituído)

> **Status:** aceita
> **Decisão em uma frase:** o motor tributário passa a **suportar CSOSN 500** (ICMS cobrado
> anteriormente por ST — substituído) como cobertura mínima de ST; **CSOSN 201/202/203/900 e CST
> permanecem bloqueados** com mensagem clara; CSOSN 500 sem identificação de ST retida é rejeitado
> (**fail-closed**).

---

## 1. Contexto

O motor tributário (F2, `lib/fiscal/tax-engine/*`) foi construído para NFC-e Simples Nacional B2C
(consumidor final, interna) sem qualquer ST — CSOSN 500 e 201/202/203/900 eram **bloqueados em
bloco**. Isso deixou aberto o gap **D9 / DoD F2** (“F2 não cumpre o DoD de CSOSN 500” —
`FISCAL_RECONCILE_REPORT_001.md`; “lacuna CSOSN 500” — `ROADMAP_FISCAL.md`), que impede o mix
varejista real da RafaCell (produtos comprados já com ICMS retido por ST).

- Restrição: o motor é **puro/dormente** (ADR-0008) — sem caller de venda, banco fiscal vazio; a
  mudança não pode tocar assinatura/emissão/provider/numbering/dry-run/app/prisma.
- Restrição: no substituído, o ICMS foi retido na operação anterior → a nota de saída **não destaca
  ICMS próprio**; os valores de ST são **congelados da entrada** (o motor não os inventa).
- Restrição pesquisada (Q-09): em NFC-e a consumidor final (`indFinal=1`), várias UFs exigem o grupo
  **ICMS Efetivo** (NT 2016.002/2018.005) quando CSOSN 500 — ausência gera Rejeição 906/938.

**Estado atual relevante:**
- `origin/main` @ `e8737f1` (merge PR #21, GOAL-005 snapshot-runtime integrado).
- `ROADMAP_FISCAL.md`: F2 = `N3, lacuna CSOSN 500`.
- Evidências e fontes: `docs/fiscal/FISCAL_TAX_ST_EVIDENCIAS_001.md`.

---

## 2. Decisão

Cobrir ST no **motor fiscal** com o mínimo **CSOSN 500**, matriz de origem **0–8** e bloqueio
explícito dos códigos não suportados.

**Detalhamento operacional:**
- `tax-engine`: CSOSN 500 → situação `st`, ICMS próprio não destacado (valor 0), ST retida carregada
  em `icms.st` (campos do grupo `ICMSSN500` + ICMS Efetivo, normalizados/ecoados — nunca inventados;
  `vICMSEfet`/`vFCPSTRet` derivados de base×alíquota só quando ausentes).
- Validação **fail-closed**: CSOSN 500 sem identificação mínima de ST retida
  (`vICMSSubstituto`/`vICMSSTRet`/`vBCSTRet` ou ICMS Efetivo `vBCEfet`+`pICMSEfet`) → erro
  `st_incompleta` (nunca emite um 500 “vazio”).
- Matriz de origem **0–8** validada explicitamente (`origem_nao_suportada` para 9/inválida).
- `nfce-xml-builder`: novo ramo `ICMSSN500` (orig + CSOSN), corrigindo o desvio latente de emitir 500
  dentro de `ICMSSN102`.
- Bloqueios mantidos com mensagem clara: **CSOSN 201/202/203/900** (`csosn_nao_suportado`), **CST /
  regime normal**, DIFAL/FCP-próprio/IPI/ISS.

**O que esta decisão NÃO inclui (escopo fechado):**
- Fiação end-to-end da ST (venda real → snapshot → XML com valores de ST): exige estender
  `venda-fiscal-snapshot.ts` (`SnapshotItemTributos`) + cadastro fiscal do produto — **GOAL
  separado** (fora da allowlist deste GOAL; `app/**` e `prisma/**` bloqueados).
- CSOSN 201/202/203/900, CST/regime normal, DIFAL, FCP próprio, IPI, ISS, interestadual.
- Emissão, assinatura, provider real, numeração, SEFAZ.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que não escolhida |
|---|---|---|---|
| A) Manter 500 bloqueado | zero mudança | D9 aberto; bloqueia mix varejista | não fecha o gap |
| B) Implementar 500 + 201/202/203/900 | cobertura ampla | ST próprio/antecipação sem demanda confirmada do piloto; superfície maior | overengineering |
| C) **500 mínimo, fail-closed, motor pronto** (escolhida) | fecha D9 no eixo do motor; honesto; dentro da allowlist | ST end-to-end fica p/ GOAL futuro | — |

---

## 4. Consequências

### 4.1 Positivas
- Fecha o D9 / DoD F2 no eixo do **motor** (ST/CSOSN 500 coberta).
- Fail-closed: nunca produz um 500 sem identificação de ST → sem Rejeição 906/938 silenciosa.
- Corrige o desvio latente 500→`ICMSSN102` no builder.

### 4.2 Negativas / Custos
- CSOSN 500 real permanece **pendente** no fluxo de venda até o GOAL de fiação (snapshot/cadastro).
- O motor é intencionalmente conservador (exige ST mesmo onde a UF talvez não exija) — a precisão por
  UF fica para o GOAL end-to-end + parecer do contador.

### 4.3 Riscos introduzidos
- Divergência UF na exigência de ICMS Efetivo · mitigação: confirmar UF/regra com o contador antes de
  ativar 500 end-to-end.

### 4.4 O que muda imediatamente
- Arquivos afetados: `lib/fiscal/tax-engine/{types,rules,validators,calculator,index}.ts`,
  `lib/fiscal/xml/nfce-xml-builder.ts` (+ testes).
- Docs: `docs/fiscal/FISCAL_TAX_ST_EVIDENCIAS_001.md`; este ADR; `ROADMAP_FISCAL` (fora do escopo aqui).
- Outras decisões afetadas: nenhuma (ADR-0008/0009/0010/0011 intocados).

### 4.5 O que muda no longo prazo
- Contrato do motor já carrega os campos de ST — a fiação end-to-end não reescreve o contrato.

---

## 5. Plano de implementação

**Implementado neste GOAL (`FISCAL-TAX-ENGINE-ST-COVERAGE-006`), motor pronto — dentro da allowlist.**

- Owner humano: Rafael.
- Pré-requisitos: PR #21 (GOAL-005) integrado — ok.
- Critério de pronto: `tsc --noEmit` verde + suíte `lib/fiscal` verde (feito).
- Próximo (GOAL separado): fiação ST venda→snapshot→XML (exige ampliar allowlist).

---

## 6. Validação / como saberemos que deu certo

- `npx tsc --noEmit` = 0 (feito).
- `vitest run lib/fiscal` = verde, incluindo `csosn-500.test.ts` (feito).
- CSOSN 500 sem ST → `st_incompleta`; 201/202/203/900 → `csosn_nao_suportado`; origem 9 →
  `origem_nao_suportada` (coberto por testes).

---

## 7. Referências

- ADRs relacionados: ADR-0008 (arquitetura fiscal), ADR-0011 (assinatura NFC-e).
- Evidências / pesquisa Q-09: `docs/fiscal/FISCAL_TAX_ST_EVIDENCIAS_001.md`.
- Roadmap: `docs/roadmaps/ROADMAP_FISCAL.md` (F2 / gap CSOSN 500).
- Instrumentos oficiais: Ajuste SINIEF 07/2005 (Anexo I, Tabela B — CSOSN 500); Nota Técnica
  2016.002; Nota Técnica 2018.005; leiaute NFC-e 4.00 (grupos `ICMSSN500` / ICMS Efetivo).

---

## 8. Notas / discussão

Decisão ratificada por Rafael no **checkpoint humano do GOAL-006** (2026-07-22), via três seleções de
escopo: (1) **apenas CSOSN 500**; (2) **motor pronto, dentro da allowlist**; (3) **ICMS Efetivo/ST
condicional + pendência bloqueante (fail-closed)**.

Nota de numeração: o comando rotulou a decisão como “ADR-P04”, mas a tabela
`FISCAL_CONTINUATION_ADRS_PROPOSTOS_001.md` mapeia ADR-P04→ADR-0013 (dry-run verde, outro tema) e a
ADR tributária histórica era ADR-P01 (sem número real). O **próximo número livre real** era
**ADR-0012** (ADR-0010/0011 ocupados; colisão verificada em todas as refs), adotado aqui.
