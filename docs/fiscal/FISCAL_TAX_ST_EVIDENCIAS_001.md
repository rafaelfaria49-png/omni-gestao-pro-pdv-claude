---
title: Evidências — Cobertura de ST no motor fiscal (GOAL-006 / CSOSN 500)
status: vivo
data: 2026-07-22
goal: FISCAL-TAX-ENGINE-ST-COVERAGE-006
base: origin/main @ e8737f1 (merge PR #21 — GOAL-005 snapshot-runtime)
branch: fiscal/goal-006-tax-st-coverage
---

# Evidências — ST/CSOSN 500 no motor fiscal (D9 / DoD F2)

> Documento de evidência do GOAL-006. Registra a pesquisa Q-09 (fontes oficiais datadas), o
> instrumento do contador, a decisão (ADR-0012) e a prova de implementação. **Não** autoriza
> emissão, produção, SEFAZ nem dados reais de contribuinte.

## 1. Pré-flight

| Item | Valor |
|---|---|
| origin/main | `e8737f13941f9de04c39bb58a5e233d1849ffb67` |
| Merge PR #21 | `feat(fiscal): integrar snapshot fiscal ao runtime (GOAL-005)` — integrado |
| Mapeamento tributário do snapshot (caminho real) | `lib/fiscal/venda-fiscal-snapshot.ts` → `computeSnapshotTributacao` (o arquivo `venda-fiscal-snapshot-tax.ts` **não existe**; só há o `.test.ts`) |

## 2. Estado anterior do motor (por que o D9 estava aberto)

- `tax-engine/rules.ts`: CSOSN 500 estava em `CSOSN_COM_ST = {201,202,203,500,900}` — **bloqueado em bloco**.
- `tax-engine/validators.ts`: qualquer CSOSN de ST → `csosn_nao_suportado`.
- `xml/nfce-xml-builder.ts`: só `ICMSSN101`/`ICMSSN102` — sem `ICMSSN500` (500 cairia, erroneamente, em `ICMSSN102`).
- `ROADMAP_FISCAL.md`: F2 = “N3, lacuna CSOSN 500”; `FISCAL_RECONCILE_REPORT_001.md`: “F2 não cumpre o DoD de CSOSN 500”.
- Obs.: `resolveOrig` (builder) já cobria origem 0–8; `ICMSTot` já emitia `vBCST=0`/`vST=0`.

## 3. Pesquisa Q-09 (fontes oficiais e datadas — não afirmado de memória)

**CSOSN 500** = “ICMS cobrado anteriormente por substituição tributária (substituído) ou por
antecipação” — **Ajuste SINIEF 07/2005**, Anexo I, Tabela B. No leiaute NF-e/NFC-e **4.00** mapeia ao
grupo **`ICMSSN500`**.

**Campos do grupo `ICMSSN500`** (leiaute 4.00):

| Campo | Obrigatoriedade | Descrição |
|---|---|---|
| `orig` | Obrigatório | Origem da mercadoria (0–8) |
| `CSOSN` | Obrigatório | `500` |
| `vBCSTRet` | Condicional | Valor da BC do ICMS-ST retido anteriormente |
| `pST` | Condicional (novo 4.00) | Alíquota suportada pelo consumidor final |
| `vICMSSubstituto` | Condicional | ICMS próprio do substituto cobrado na operação anterior |
| `vICMSSTRet` | Condicional | Valor do ICMS-ST retido anteriormente |
| `vBCFCPSTRet` / `pFCPSTRet` / `vFCPSTRet` | Condicional (novo 4.00) | FCP retido anteriormente por ST |

**ICMS Efetivo (crítico para NFC-e consumidor final, `indFinal=1` — caso RafaCell):** as **NT
2016.002 (v1.60)** e **NT 2018.005** criaram o grupo com `pRedBCEfet`, `vBCEfet`, `pICMSEfet`,
`vICMSEfet`, que se torna **obrigatório** quando `CST=60`/`CSOSN=500` **e** `indFinal=1` em várias UFs
(fontes citam SP, MG, PR, PE, CE, MA, AC, AM). Ausência gera **Rejeição 906 / 938**.

**Ressalva de proveniência:** as páginas abertas são bases técnicas de implementadores que **citam**
os instrumentos oficiais; o PDF do portal SEFAZ/NF-e não pôde ser aberto diretamente. **A exigência
específica da UF da RafaCell deve ser confirmada pelo contador contra a NT/MOC oficial.**

Fontes consultadas (2026-07-22):
- flexdocs — leiaute ICMS/CSOSN 4.00 (grupo `ICMSSN500`): https://flexdocs.net/guiaNFe/gerarNFe.detalhe.imp.ICMS.NT20005.CSOSN.html
- nfe.io — CSOSN 500 (SINIEF 07/2005): https://nfe.io/blog/nota-fiscal/csosn-500/
- Oobj / NS Tecnologia — Rejeição 938 (vBCSTRet/pST/vICMSSubstituto/vICMSSTRet): https://oobj.com.br/bc/rejeicao-938-como-resolver/ · https://blog.nstecnologia.com.br/rejeicao-938/
- Tecnospeed — Rejeição 906 / ICMS Efetivo (CST 60 / CSOSN 500, indFinal=1): https://atendimento.tecnospeed.com.br/hc/pt-br/articles/360011362894
- Webmania — orientações CST 60 e CSOSN 500: https://ajuda.webmania.com.br/pt-BR/articles/12680760-orientacoes-para-emissao-com-o-cst-60-e-csosn-500
- Oobj/Avalara — NT 2018.005 (novos campos do ICMS ST): https://blog.oobj.com.br/nota-tecnica-2018-005

## 4. Instrumento do contador (mix piloto RafaCell — PENDENTE de preenchimento)

O contador informa, por categoria, os campos abaixo. **Os valores fiscais não foram preenchidos de
memória** — dependem do parecer do contador / consulta oficial.

| Categoria | Ex. produto | NCM | CEST | CFOP | CSOSN | Origem (0–8) | Interna/Interestadual | Tem ST? | vICMSSubstituto / ICMS Efetivo aplicável? | Obs. |
|---|---|---|---|---|---|---|---|---|---|---|
| Capinhas | | | | | | | | | | |
| Películas | | | | | | | | | | |
| Carregadores | | | | | | | | | | |
| Cabos | | | | | | | | | | |
| Fones | | | | | | | | | | |
| Caixas de som | | | | | | | | | | |
| Baterias | | | | | | | | | | |
| Telas / peças | | | | | | | | | | |
| Celulares | | | | | | | | | | |
| Eletrônicos/acessórios | | | | | | | | | | |
| Variedades/supermercado | | | | | | | | | | |

Perguntas objetivas: (a) quais categorias são CSOSN 500 (comprou já com ST retido) vs 102?
(b) UF da RafaCell exige o grupo ICMS Efetivo em NFC-e `indFinal=1`? (c) origem dos valores
`vICMSSubstituto`/`vICMSEfet` (cadastro do produto? cálculo?).

## 5. Decisão (ADR-0012 — aceita no checkpoint 2026-07-22)

- **CSOSN 500** = mínimo obrigatório → implementado no motor.
- **CSOSN 201/202/203/900** e **CST/regime normal** → bloqueados com mensagem clara.
- **Matriz origem 0–8** → validada explicitamente.
- **ICMS Efetivo/ST-retido** → condicional + **pendência bloqueante** (fail-closed) quando falta ST.
- **Escopo:** “motor pronto” (dentro da allowlist). Fiação end-to-end (snapshot/cadastro) = GOAL separado.

## 6. Prova de implementação

**Arquivos (allowlist):** `lib/fiscal/tax-engine/{types,rules,validators,calculator,index}.ts`,
`lib/fiscal/xml/nfce-xml-builder.ts`, testes (`tax-engine/csosn-500.test.ts`,
`tax-engine/calculator.test.ts`, `xml/nfce-xml-builder.test.ts`), `docs/decisions/ADR-0012-*.md`,
`docs/decisions/INDEX.md`, este documento.

**Comportamento verificado:**
- CSOSN 500 com ST (`vBCSTRet`/`vICMSSTRet`/`vICMSSubstituto` ou `vBCEfet`+`pICMSEfet`) → `ok=true`,
  `icms.situacao="st"`, ICMS próprio 0, `icms.st` preenchido; `vICMSEfet` derivado de `vBCEfet×pICMSEfet`.
- CSOSN 500 **sem** ST → `ok=false`, `st_incompleta` (fail-closed).
- CSOSN 201/202/203/900 → `ok=false`, `csosn_nao_suportado`.
- Origem “9” → `ok=false`, `origem_nao_suportada`; origens 0–8 aceitas.
- `nfce-xml-builder`: item CSOSN 500 na tributação congelada → grupo `ICMSSN500` (não `ICMSSN102`).

**Gates:**
- `npx tsc --noEmit` → **exit 0** (projeto inteiro).
- `vitest run lib/fiscal` → **310 passed / 16 skipped / 0 failed** (22 arquivos).

## 7. Fora do escopo (registrado, não corrigido)

- Fiação ST venda→snapshot→XML (estende `venda-fiscal-snapshot.ts` `SnapshotItemTributos` + cadastro
  fiscal do produto) — **GOAL separado**; `app/**` e `prisma/**` bloqueados neste GOAL.
- Precisão da exigência de ICMS Efetivo por UF — depende do parecer do contador.
- CSOSN 201/202/203/900, CST/regime normal, DIFAL, FCP próprio, IPI, ISS, interestadual, emissão, SEFAZ.
