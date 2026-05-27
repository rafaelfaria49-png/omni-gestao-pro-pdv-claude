---
title: AUDITORIA_<HUB>_v<NN> · <título curto>
audit_id: <HUB>-<NN>
hub: <pdv | operacoes_os | financeiro | estoque | marketplace | crm | whatsapp | marketing_ia | omni_agent | bi | multi_loja | governanca | cross>
tipo: <saude_geral | ux | seguranca | performance | dados | fiscal | ia | forense>
data: YYYY-MM-DD
duracao_horas: <X>
auditor_humano: <nome>
auditor_ia: <opus | sonnet | antigravity_gemini>
escopo: <escopo conciso>
status: rascunho | publicada | superada
imutavel_apos: publicada
versao_anterior: AUDITORIA_<HUB>_v<NN-1>   # preencher se houver
---

# AUDITORIA_<HUB>_v<NN> · <título curto>

> **Status:** <rascunho | publicada | superada>
> **Tipo:** <…> · **Duração:** <X> horas · **Auditor:** <…>
> **Modo:** somente leitura — auditoria não altera código (alterações vão para sprint).

---

## 1. Escopo

### 1.1 Dentro
- <O que foi olhado>
- <Arquivos / módulos / fluxos>
- <Janela de tempo (logs/dados)>

### 1.2 Fora
- <O que não foi olhado e por quê>

### 1.3 Premissas
- <Estado do projeto na data: link `CURRENT_STATUS.md`>
- <Versão do schema, migrações pendentes, etc.>

---

## 2. Metodologia

- Documentos lidos: <lista>
- Código inspecionado: <lista de paths>
- Queries rodadas: <descrição>
- Ferramentas: <ts-prune, eslint, grep, etc.>
- Cenários testados: <lista>

---

## 3. Severidade — convenção

| Severidade | Critério |
|---|---|
| **P0** | Operação para / dinheiro perdido / vazamento de dados / fiscal / multi-loja quebrado |
| **P1** | Risco alto, sem operação parar — corrigir em < 7 dias |
| **P2** | Correção em < 30 dias; UX, performance, dívida técnica relevante |
| **P3** | Melhoria; sem prazo |

> **Regra de upgrade:** P1 envolvendo dinheiro, fiscal ou multi-loja → vira **P0** automaticamente.

---

## 4. Findings (achados)

> Numerados sequencialmente nesta auditoria. Cada finding tem título único, severidade e plano.

### F-01 · <título do finding> — `P0`

- **Local:** `<arquivo:linha>` ou `<módulo>` ou `<fluxo>`
- **Descrição:** <o que está errado, em 2-4 linhas>
- **Evidência:** <log, query, screenshot ref, snippet>
- **Impacto:** <quem é afetado, em que magnitude>
- **Causa raiz (hipótese):** <…>
- **Plano sugerido:** <ação concreta, com sprint sugerida ou ADR>
- **Sprint/ADR alvo:** <SPRINT_<NN>_<HUB> ou ADR-<NNNN> a criar>

---

### F-02 · <título> — `P1`

- **Local:** <…>
- **Descrição:** <…>
- **Evidência:** <…>
- **Impacto:** <…>
- **Causa raiz:** <…>
- **Plano sugerido:** <…>

---

### F-03 · <título> — `P2`

- (mesma estrutura)

---

## 5. Resumo executivo

> 1 parágrafo + tabela. Para humano que tem 3 minutos.

| Severidade | Quantidade | Itens |
|---|---|---|
| P0 | <N> | F-01, F-03 |
| P1 | <N> | F-02, F-05 |
| P2 | <N> | F-04 |
| P3 | <N> | F-06 |

**Diagnóstico em 1 parágrafo:** <…>

---

## 6. Recomendações priorizadas

| # | Ação | Severidade | Tipo | Owner sugerido |
|---|---|---|---|---|
| 1 | <…> | P0 | sprint | Sonnet |
| 2 | <…> | P0 | ADR | Opus |
| 3 | <…> | P1 | sprint | Sonnet |

---

## 7. Pontos positivos (registrar o que está bem)

> Importante para evitar regressão. Auditorias futuras checam se o que estava bom continua bom.

- <…>
- <…>

---

## 8. Comparativo com auditoria anterior

> Preencher quando houver `versao_anterior`.

| Finding anterior | Status atual | Comentário |
|---|---|---|
| F-01 v<NN-1> | resolvido / persiste / piorou | <…> |

---

## 9. Próximos passos

- [ ] Abrir sprint(s): SPRINT_<NN>_<HUB>
- [ ] Criar ADR(s): ADR-<NNNN>
- [ ] Atualizar roadmap (gaps): `docs/roadmaps/ROADMAP_<HUB>.md`
- [ ] Atualizar `docs/status/RISCOS.md`
- [ ] Notificar humano dono do HUB

---

## 10. Referências

- Auditoria anterior do HUB: <link>
- Roadmap: `docs/roadmaps/ROADMAP_<HUB>.md`
- Status: `docs/ai/CURRENT_STATUS.md`
- ADRs relacionados: ADR-<NNNN>
- Sprints relacionadas: SPRINT_<NN>_<HUB>

---

## 11. Imutabilidade

Após `status = publicada`:
- **Conteúdo não é editado** (exceto correção tipográfica).
- Mudança de cenário → nova auditoria `AUDITORIA_<HUB>_v<NN+1>.md` com seção §8 preenchida.
