# Merge readiness da ADR-0010 — validação XSD fiscal

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-ADR-0010-MERGE-READINESS` |
| Data | 2026-07-14 |
| Branch auditada | `origin/fiscal/goal-002-xsd-adr-p01` |
| HEAD auditado | `edaaf948062fdd317903ffd1f01af94391bd4965` |
| `origin/main` auditada | `b5289456fed35732dff54ab3f30974dc848065c8` |
| Branch da auditoria | `audit/fiscal-xsd-adr-0010-readiness` |
| Resultado | **A — PRONTO PARA INTEGRAÇÃO** |

## 1. Objetivo

Auditar a segurança de integração da branch documental que formaliza a ADR-0010 contra a
`origin/main` atual, sem executar merge, rebase, cherry-pick ou qualquer alteração na branch
auditada.

A auditoria cobre Git, commits, escopo, colisão de numeração, merge virtual, links, hashes, segredos,
consistência com a arquitetura Fiscal e ausência de contato com o Contador HUB. O único artefato
criado é este relatório.

## 2. Base e pre-flight

Após `git fetch origin --prune`:

| Verificação | Resultado |
|---|---|
| `origin/main` | `b5289456fed35732dff54ab3f30974dc848065c8` |
| base original declarada | `b5289456fed35732dff54ab3f30974dc848065c8` |
| branch ADR | `edaaf948062fdd317903ffd1f01af94391bd4965` |
| tipo do objeto esperado | `commit` |
| HEAD inicial da auditoria | `b5289456fed35732dff54ab3f30974dc848065c8` |
| worktree inicial | limpa |

A `origin/main` não avançou desde a base original. Portanto, o risco de drift concorrente entre a
pesquisa/decisão e esta auditoria é nulo no recorte Git observado.

## 3. Branch e isolamento da auditoria

- Worktree: `C:\Projetos\wt-fiscal-002-xsd-adr-readiness`.
- Branch: `audit/fiscal-xsd-adr-0010-readiness`.
- Base: `origin/main`.
- A branch `fiscal/goal-002-xsd-adr-p01` foi usada somente por referências remotas/read-only.
- Nenhuma outra worktree, branch do Contador HUB ou documento auditado foi modificado.

## 4. Commits auditados

| Commit | Parent | Mensagem | Escopo |
|---|---|---|---|
| `6fb9ff641897d05dd1729d4c5c816a15aad93d88` | `b5289456fed35732dff54ab3f30974dc848065c8` | `docs(fiscal): decidir validador XSD em worker containerizado` | 5 documentos; 397 inserções e 12 remoções |
| `edaaf948062fdd317903ffd1f01af94391bd4965` | `6fb9ff641897d05dd1729d4c5c816a15aad93d88` | `docs(fiscal): definir contrato arquitetural do worker XSD` | 2 documentos; 405 inserções |

Os commits formam uma cadeia linear de dois commits próprios, sem merge commit. Total contra a
base: 7 arquivos, 802 inserções e 12 remoções.

## 5. Merge-base e ahead/behind

```text
merge-base:
b5289456fed35732dff54ab3f30974dc848065c8

git rev-list --left-right --count \
  origin/main...origin/fiscal/goal-002-xsd-adr-p01

0    2
```

Interpretação: zero commits exclusivos da `origin/main` e dois commits exclusivos da branch ADR.
A branch não está atrás da `main` auditada.

## 6. Commits novos da main

O intervalo
`b5289456fed35732dff54ab3f30974dc848065c8..origin/main` está vazio.

| Hash | Mensagem | Arquivos | Fiscal | Contador HUB | ADRs | Risco de conflito |
|---|---|---|---|---|---|---|
| — | nenhum commit novo | — | nenhum | nenhum | nenhum | nenhum |

Não há mudança da `main` a reconciliar, nem mudança concorrente de status Fiscal, próximo GOAL,
arquitetura ou Contador HUB.

## 7. Inventário dos sete arquivos

| Status | Caminho | Natureza |
|---|---|---|
| M | `docs/ai/CURRENT_STATUS.md` | atualização exclusiva da seção Fiscal |
| A | `docs/decisions/ADR-0010-validacao-xsd-worker-containerizado-xmllint-provisionado.md` | decisão arquitetural aceita |
| M | `docs/fiscal/FISCAL_CONTINUATION_ADRS_PROPOSTOS_001.md` | mapeamento/reconciliação ADR-P01 |
| M | `docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md` | nota histórica de execução segura |
| M | `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | checkpoint da trilha XSD |
| A | `docs/fiscal/FISCAL_XSD_SPIKE_ARTIFACT_DISPOSITION_001.md` | disposição dos artefatos experimentais |
| A | `docs/fiscal/FISCAL_XSD_WORKER_ARCHITECTURE_CONTRACT_001.md` | contrato conceitual do worker |

Confirmações de escopo:

- exatamente dois commits e sete arquivos;
- somente Markdown/documentação;
- nenhum código, teste, workflow, migration ou schema;
- nenhuma mudança em `package.json`, lockfile, `next.config.*`, Prisma ou banco;
- nenhum binário, XSD ou dependência incorporado;
- nenhum caminho do Contador HUB;
- modos dos arquivos regulares (`100644`), sem symlink/submódulo.

## 8. Interseção de arquivos

Listas desde a base original:

- branch ADR: 7 arquivos;
- `origin/main`: 0 arquivos;
- interseção exata: **nenhuma**.

Como não há arquivo comum, não existe conflito textual ou alteração concorrente a avaliar por
caminho. Também não há mudança semântica nova da `main` que altere a interpretação da ADR.

## 9. Colisão da ADR-0010

A `origin/main` contém ADRs reais até ADR-0009. `ADR-0010-*` não existe na `main`.

A busca em todas as referências remotas encontrou uma única utilização de ADR-0010:

```text
origin/fiscal/goal-002-xsd-adr-p01
docs/decisions/ADR-0010-validacao-xsd-worker-containerizado-xmllint-provisionado.md
```

Resultados:

- usos remotos: 1;
- caminhos distintos: 1;
- blobs distintos: 1;
- ADR-0010 paralela/diferente: nenhuma;
- colisão: **não**;
- número global: continua livre na `origin/main` e é legitimamente ocupado pela branch auditada.

O nome segue `ADR-<NNNN>-<slug-kebab-case>.md`. O status `aceita` pertence ao enum real
`proposta | aceita | superada | rejeitada | depreciada` e é coerente com a aprovação humana
registrada.

## 10. Merge virtual

### 10.1 Forma clássica

```text
git merge-tree <merge-base> origin/main origin/fiscal/goal-002-xsd-adr-p01
exit: 0
linhas: 880
marcadores/conflitos: 0
```

### 10.2 `--write-tree`

```text
git merge-tree --write-tree \
  origin/main \
  origin/fiscal/goal-002-xsd-adr-p01

exit: 0
árvore virtual: 62c7df20b109f3cab1a306505f9b54edee6f2c9a
```

A árvore virtual contém exatamente os sete arquivos listados no §7. `git diff --check` entre
`origin/main` e a árvore virtual também passou. Nenhum arquivo conflitante foi produzido.

## 11. Validação integral dos documentos

Os sete arquivos foram carregados integralmente diretamente da branch auditada:

- arquivos lidos: 7;
- linhas totais carregadas: 4.227;
- `docs/ai/CURRENT_STATUS.md`: 3.304 linhas, não apenas a seção Fiscal.

| # | Requisito | Resultado |
|---:|---|---|
| 1 | ADR-0010 registra B2 como única opção aprovada | aprovado — “Adotar exclusivamente B2” |
| 2 | Opção A rejeitada somente na versão avaliada | aprovado — `xmllint-wasm@5.2.0`; reavaliação futura permitida |
| 3 | B1 rejeitada | aprovado — host/PATH imprevisível |
| 4 | Opção C permanece alternativa | aprovado — contingência arquitetural |
| 5 | worker containerizado obrigatório | aprovado |
| 6 | execução direta na Vercel proibida | aprovado |
| 7 | egress bloqueado previsto | aprovado |
| 8 | source/patch/binário/XSD por hash | aprovado |
| 9 | `validarXsd` continua no-op | aprovado; código atual também confirma o placeholder |
| 10 | GOAL-002 permanece aberto | aprovado |
| 11 | nenhuma homologação/produção declarada | aprovado; N6/N7 continuam zero |
| 12 | contrato não cria API pública | aprovado, explicitamente |
| 13 | matriz cobre todos os artefatos | aprovado — 32/32 caminhos únicos |
| 14 | nenhum experimental promovido automaticamente | aprovado — promoção futura exige recaptura/revalidação |
| 15 | nenhum segredo | aprovado |
| 16 | nenhuma contradição com `origin/main` | aprovado |
| 17 | nenhuma invasão do Contador HUB | aprovado |

## 12. Links, referências e hashes

Validações executadas sobre o conteúdo integral dos sete arquivos e sobre as linhas adicionadas:

| Verificação | Resultado |
|---|---|
| links locais nos sete arquivos | 0 ausentes |
| links locais introduzidos pelos commits | 0 ausentes |
| `git diff --check origin/main...branch` | aprovado |
| marcadores `<<<<<<<`, `=======`, `>>>>>>>` | 0 |
| nomes das três branches de evidência | existentes e coerentes |
| commits de evidência | referências resolvem para os HEADs citados |
| SHA-256 citados | 3; todos conferidos nas fontes dos spikes |
| caminhos do no-op e testes placeholder | presentes na `origin/main` |

Hashes documentais conferidos:

- pacote XSD: `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1`;
- source libxml2: `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07`;
- patch oficial: `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c`.

## 13. Segredos e dados reais

A varredura integral dos sete arquivos e do diff não encontrou:

- chave privada PEM;
- token GitHub/OpenAI/cloud;
- access key AWS;
- URL com credencial embutida;
- conexão PostgreSQL;
- certificado, senha, CSC ou segredo fiscal;
- identificador numérico real de 11 a 14 dígitos introduzido pelo diff;
- XML fiscal real ou dados reais de contribuinte.

As menções a segredo, certificado e token são exclusivamente regras de proibição/isolamento.

## 14. Escopo e blocklist

O diff da branch ADR não toca:

```text
app/**
components/**
lib/**
prisma/**
scripts/**
.github/**
package.json
lockfiles
next.config.*
docs/governance/**
docs/roadmaps/**
```

Não há implementação do worker, alteração de `validarXsd`, integração de pipeline, instalação de
dependência, banco, Prisma, emissão, certificado, chamada SEFAZ ou ativação de ambiente.

## 15. Contador HUB

Resultado: **nenhum contato incompatível**.

- nenhum arquivo da branch contém caminho do Contador HUB;
- a `origin/main` não recebeu commits no intervalo auditado, inclusive commits do Contador HUB;
- nenhuma branch/worktree do Contador foi alterada;
- a menção genérica a contador nos GOALs tributários é texto histórico preexistente, não mutação do
  HUB nem autoridade inventada.

## 16. Análise semântica

### 16.1 Coerência com o masterplan

O `MASTER_FISCAL_EXECUTION_PLAN.md` coloca geração/validação XSD na F3 antes da assinatura F4 e
mantém emissão assíncrona pós-commit. A ADR-0010 detalha a mesma ordem:

```text
snapshot → tributos → XML → validação XSD → assinatura → regras/gates → transmissão
```

Não há inversão de gate nem autorização para transmitir XML não validado.

### 16.2 Coerência com ADR-0008

A ADR-0010 preserva satélite pós-commit, fila, idempotência e a regra de que falha fiscal não desfaz
a venda. O worker é uma etapa interna da esteira fiscal, não um caller inline do PDV.

### 16.3 Coerência com ADR-0009

O contrato proíbe certificado, CSC ou outro segredo no worker XSD. Isso respeita o cofre por
referência opaca e reduz o limite de confiança do validador.

### 16.4 Status Fiscal e GOALs

- dry-run permanece N3;
- `validarXsd` permanece no-op;
- GOAL-002 e GOALs históricos 005/006 permanecem abertos;
- G-F5, G-F7 e G-F12 permanecem abertos;
- nenhuma homologação ou produção é declarada;
- a distinção entre o identificador nomeado da trilha XSD e a sequência histórica de GOALs está
  explícita, sem reclassificar trabalho concluído.

### 16.5 Índice de ADRs

`docs/decisions/INDEX.md` não faz parte dos sete arquivos esperados e ficou fora da allowlist do
GOAL de decisão. A própria ADR registra que o índice deve receber a nova entrada em etapa autorizada.
Isso é follow-up documental conhecido e não produz conflito ou ambiguidade na árvore atual; não é
bloqueio para a integração dos sete arquivos auditados.

## 17. Classificação

**A — PRONTO PARA INTEGRAÇÃO.**

Critérios satisfeitos:

- sem colisão de ADR;
- sem conflito textual ou semântico;
- branch 0 atrás / 2 à frente da `main`;
- sete arquivos corretos e exatamente no escopo esperado;
- nenhum segredo, dado real, código, dependência, migration ou teste;
- nenhuma alteração concorrente da `main`;
- nenhum contato incompatível com o Contador HUB;
- merge virtual e validações documentais aprovados.

Não foi identificado ajuste obrigatório na branch auditada.

## 18. Estratégia recomendada

1. submeter `fiscal/goal-002-xsd-adr-p01` ao fluxo normal de revisão humana/PR;
2. integrar os dois commits na ordem existente, sem rebase, renumeração ou edição da ADR aceita;
3. não integrar a branch de auditoria como substituta da branch ADR — ela contém somente este
   relatório;
4. após integração autorizada, registrar ADR-0010 no `docs/decisions/INDEX.md` em mudança documental
   escopada e autorizada;
5. abrir GOAL de implementação B2 a partir da `origin/main` integrada, sem merge/cherry-pick dos
   spikes e seguindo o contrato/guardrails da ADR-0010;
6. manter `validarXsd`, pipeline, homologação e produção bloqueados até os gates específicos.

Esta auditoria não executa nem autoriza o merge.

## 19. Conclusão

A branch `origin/fiscal/goal-002-xsd-adr-p01` no commit
`edaaf948062fdd317903ffd1f01af94391bd4965` é documental, linear, íntegra, semanticamente coerente
e aplicável sem conflito sobre a `origin/main` auditada em
`b5289456fed35732dff54ab3f30974dc848065c8`.

O merge virtual foi limpo, ADR-0010 não colide, os sete arquivos atendem ao checkpoint humano e não
há segredo, código ou invasão de outro HUB. A recomendação é integrar a branch ADR pelo processo
normal de revisão, mantendo este relatório como evidência e sem confundir auditoria com integração.
