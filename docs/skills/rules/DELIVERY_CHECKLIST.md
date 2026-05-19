# DELIVERY_CHECKLIST.md — Checklist obrigatório de entrega

Nenhuma tarefa é considerada encerrada sem passar por este checklist.
Aplica-se a **toda IA** que executa mudanças neste repositório.

## 1. Antes de encerrar — verificações obrigatórias

### 1.1 Arquivos alterados
- [ ] Liste **todos** os arquivos criados/alterados/removidos.
- [ ] Confirme que nenhum arquivo fora do escopo foi tocado.
- [ ] Confirme que nenhuma área protegida (auth, proxy, schema, core) foi
      alterada sem autorização explícita — ver `CORE_RULES.md` §5.

### 1.2 Validação TypeScript
- [ ] Houve mudança em código `.ts`/`.tsx`? → rodar `npx tsc --noEmit`.
- [ ] O type-check passou **sem novos erros**.
- [ ] Se a tarefa foi só documentação (`.md`), o type-check não é exigido.

### 1.3 Build (quando aplicável)
Rodar `npm run build` quando a mudança:
- [ ] altera config (`next.config.mjs`, `tsconfig.json`);
- [ ] altera rotas, layouts ou Server Actions;
- [ ] afeta o pipeline Prisma (`prisma generate`).

Mudanças triviais ou só de documentação **não** exigem build.

### 1.4 Git status
- [ ] Rodar `git status` e conferir o conjunto de mudanças.
- [ ] O resultado do `git status` bate com a lista declarada no relatório.
- [ ] Não há arquivo inesperado em staging.

## 2. Quando atualizar documentação

### 2.1 `docs/ai/CURRENT_STATUS.md`
Atualize **somente** quando houver mudança **relevante** de estado:
- módulo passou de mock → real (ou vice-versa);
- feature nova entregue;
- mudança que altera o que está "pronto" vs "pendente".

Não atualize por: refactor interno, fix trivial, ajuste de doc.

### 2.2 `CHANGELOG.md`
Atualize (ou crie, se ainda não existir) quando a mudança for **visível**
para o usuário ou para outra IA:
- feature, fix de bug funcional, breaking change.
Não registre: ajuste de comentário, formatação, doc interna.

### 2.3 MASTER_MEMORY / `docs/ai/MASTER_CONTEXT.md`
Atualize quando houver decisão **estratégica/arquitetural** persistente:
- nova convenção do projeto;
- decisão que afeta sessões futuras de qualquer IA;
- mudança de roadmap ou de contrato entre módulos.
Não registre tarefa pontual de execução.

## 3. Regra anti-invenção de status

- **Nunca** declare um módulo "pronto" sem critério verificado.
- **Nunca** marque algo como "real" se ainda usa mock.
- **Nunca** arredonde resultado de teste ou build.
- Se ficou pendência, ela vai **no relatório**, explícita.

## 4. Relatório final obrigatório

Toda tarefa termina com um relatório contendo:

1. **Arquivos** criados / alterados / removidos.
2. **Validação**: resultado de `npx tsc --noEmit` e `npm run build`
   (ou justificativa de por que não se aplicam).
3. **Git status**: resumo do estado.
4. **Escopo**: confirmação de que nada fora do pedido foi tocado.
5. **Pendências**: o que ficou em aberto (ou "nenhuma").
6. **Docs**: se `CURRENT_STATUS.md` / `CHANGELOG.md` / `MASTER_CONTEXT.md`
   foram atualizados — e por quê (ou por que não).

Sem relatório = tarefa não entregue.

---

Ver também: [`CORE_RULES.md`](./CORE_RULES.md) ·
[`AI_WORKFLOW.md`](./AI_WORKFLOW.md)
