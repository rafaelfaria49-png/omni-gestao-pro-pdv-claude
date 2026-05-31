---
adr_id: ADR-0004
title: SAFE-lite como modo padrão; Engine de 17 fases como modo pesado reservado
status: aceita
data: 2026-05-30
hub: governanca
fase: R1 (Retro do Piloto)
aprovado_por: Rafael
relacionados: ADR-0002, ADR-0003
---

# ADR-0004 · SAFE-lite como modo padrão; Engine de 17 fases como modo pesado reservado

> **Status:** aceita
> **Decisão em uma frase:** o trabalho pequeno e cirúrgico passa a rodar em **SAFE-lite**
> (modo padrão); o **pipeline completo de 17 fases** fica **reservado** para trabalho grande,
> feature nova ou risco alto — **sem ser removido nem invalidado**.

## 1. Contexto

O Execution Engine de 17 fases foi aprovado em 2026-05-27 (Bloco 29). O piloto
(`RETRO_PILOTO_R1`) mostrou que:

- **O ritual completo é viável, mas caro.** Só **uma** sprint (S-001 multi-loja) rodou o
  pipeline inteiro (CP1–CP4, dois gates, ADR-0003). Funcionou (testes 90\|14 → 189\|4), mas
  exigiu runbook dedicado e horas de cerimônia.
- **A operação real usou um fluxo leve.** A maior parte das mudanças (incluindo o R0 inteiro,
  docs-only) seguiu "escopo fechado → preview → gate → tsc/build → relatório", sem
  PROPOSE_SPRINT formal nem lock.
- **Houve execução fora do ritual.** S-002 foi hotfix direto em `main` (ENTRY 010 / DP-01). O
  problema não foi o tamanho — foi **não existir um ritual leve legítimo** que a acolhesse.
- **COWORK e OVERNIGHT nunca rodaram** e seguem congelados (estratégia "Servir a operação real").

Conclusão: faltava **formalizar** o fluxo leve que já era usado de fato, **sem descartar** o
pipeline pesado que provou valor no caso de risco.

## 2. Decisão

1. **SAFE-lite é o modo padrão** para trabalho **S/cirúrgico** (bugfix, debt-item, mock removal,
   estabilização pequena, **ajustes documentais/governança**). Definido em `EXECUTION_ENGINE.md §11`.
2. **O pipeline completo de 17 fases é o modo pesado reservado** para M+, feature nova, mudança
   arquitetural, ou risco alto (auth/proxy/schema/core/multi-loja/dinheiro/fiscal/integração
   externa com efeito real).
3. **SAFE-lite preserva os inegociáveis:** Gate #1, Gate #2, `tsc` (+build/vitest), regra de área
   protegida, DOC_REFRESH e "sem commit/push sem ok humano". **Não relaxa nenhuma deny-list.**
4. **O DOC_REFRESH do SAFE-lite cobre contexto vivo** (MASTER_CONTEXT, ENTERPRISE_MODULE_MAP,
   memória), não só `status/` — lição direta do R0.

**O que esta decisão explicitamente NÃO significa:**
- ❌ O Engine de 17 fases **não foi removido** — continua íntegro em `EXECUTION_ENGINE.md §2`.
- ❌ O Engine **não foi invalidado** — provou-se na S-001 e segue sendo a referência para risco alto.
- ✅ O Engine **apenas deixou de ser o caminho padrão** — vira a exceção consciente para
  risco/escala, não a regra do dia a dia.

**Escopo fechado (o que NÃO muda):**
- O pipeline de 17 fases **não é editado** (`EXECUTION_ENGINE versao: v1`).
- COWORK / OVERNIGHT / Composite / Blocos 36+ seguem **congelados** — esta decisão não os reativa.
- Nenhum schema de log/skill muda (ADR-0002 segue valendo).

## 3. Alternativas descartadas

- **Manter o Engine de 17 fases como único caminho:** descartado — o piloto provou que não cabe
  no dia a dia; o resultado real foi gente operando fora do ritual (DP-01), pior que um ritual
  leve formal.
- **Criar um documento separado de SAFE-lite:** descartado — fragmenta a governança; SAFE-lite é
  um *modo* do mesmo pipeline, então vive em `EXECUTION_ENGINE.md §11`.
- **Substituir o Engine pelo SAFE-lite (remover o pesado):** descartado — jogaria fora o que
  funcionou no caso de risco (S-001); o custo de manter o pesado reservado é baixo.

## 4. Consequências

### Positivas
- Documenta a prática real; reduz cerimônia sem perder gates/testes/DOC_REFRESH.
- Dá ritual legítimo ao hotfix leve (fecha a lacuna que gerou a DP-01).
- DOC_REFRESH ampliado ataca o maior risco observado (doc-drift).

### Negativas / risco assumido
- **Risco:** usar SAFE-lite onde caberia o pesado (subestimar tamanho/risco).
  **Mitigação:** `EXECUTION_ENGINE §11.2/§11.4` — tocou área protegida ou cresceu para M+ →
  escala obrigatória; gates humanos continuam.
- **Honestidade:** o Engine de 17 fases permanece **largamente não-exercitado** end-to-end (só
  S-001 parcial; COWORK/OVERNIGHT nunca). Esta decisão **reposiciona**, não **valida** o pipeline pesado.

## 5. Referências

- Modo definido: `docs/execution/EXECUTION_ENGINE.md §11` (SAFE-lite) — formalizado no R1-L2.
- Motivação: `docs/execution/RETRO_PILOTO_R1.md` (lições L-a/L-d, falhas F2/F3, DP-01).
- Pipeline pesado preservado: `docs/execution/EXECUTION_ENGINE.md §2` (17 fases, intacto).
- ADR-0002 (congelamento de schemas — segue valendo) · ADR-0003 (multi-loja, uso real do pipeline pesado).
- Log do piloto: `docs/status/EXECUTION_LOG.md` ENTRY 009 (S-001 ritual) / ENTRY 010 (S-002 hotfix).
  *(referência apenas — o registro da DP-01 no log é o R1-L4.)*
