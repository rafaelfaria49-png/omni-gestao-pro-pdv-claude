---
title: Execution Rules — Execução contínua de múltiplos GOALs
status: vivo
owner: produto + arquitetura
last_update: 2026-06-25
versao: v1
bloco: execution-v2-bloco1
---

# ⚙️ Execution Rules — Execução contínua de GOALs

> **Este documento define o comportamento do agente em execução de múltiplos GOALs sequenciais.**
> Complementa o [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (pipeline de 17 fases) — não o substitui.
> **O GOAL é a autorização.** Tudo explicitamente permitido no GOAL é executado sem pausa.

---

## 1. Princípio fundamental

**O GOAL é a autorização.** Quando o usuário envia um GOAL com escopo, permissões e restrições explícitas:

- O agente **executa** sem pedir confirmações intermediárias para ações já autorizadas.
- O agente **para** somente se a próxima ação NÃO estiver coberta pelo GOAL.
- O agente **registra** o resultado de cada GOAL e inicia o próximo automaticamente.
- Dúvida sobre escopo → **para e pergunta** (nunca assume mais do que o que está escrito).

---

## 2. Modo Continuous Execution

Quando o usuário envia vários GOALs em sequência (explicitamente ou como lista):

1. Executar o GOAL 1 por completo (validação + entrega + relatório final).
2. Registrar resultado resumido.
3. Iniciar o GOAL 2 automaticamente, sem aguardar confirmação.
4. Repetir até o último GOAL da lista.
5. Emitir **relatório consolidado único** ao final.

### 2.1 Quando parar entre GOALs

O agente **deve** parar entre GOALs se:

- O próximo GOAL toca uma área **Gate obrigatório** (§4 deste documento).
- O working tree está sujo com arquivos fora do escopo do GOAL anterior.
- O GOAL anterior terminou com erro não resolvido que afeta o próximo.
- A lista de GOALs não foi aprovada previamente (modo overnight — ver §5).

### 2.2 O que NÃO interrompe o fluxo

O agente **não para** para pedir confirmação em:

- Leitura de qualquer arquivo do projeto.
- Criação ou edição de arquivos dentro do escopo autorizado pelo GOAL.
- Criação de documentação em `docs/`.
- Execução de `npx tsc --noEmit`.
- Execução de `npm run test` / `npm run build`.
- Execução de `git status`, `git diff`, `git log`.
- Commit local **se o GOAL autorizar** explicitamente.
- Correção de erros de TypeScript ou testes gerados pela própria tarefa.
- Criação de arquivos novos dentro das pastas permitidas pelo GOAL.

---

## 3. Auto Approval — lista de ações automaticamente permitidas

| Ação | Permitida automaticamente |
|---|---|
| Ler qualquer arquivo | ✅ sempre |
| Criar arquivo dentro do escopo | ✅ se o GOAL define a pasta |
| Editar arquivo dentro do escopo | ✅ se o GOAL define os paths |
| `npx tsc --noEmit` | ✅ sempre |
| `npm run test` / `vitest` | ✅ sempre |
| `npm run build` | ✅ se o GOAL autoriza ou se há mudança em config/rotas/Server Actions/Prisma |
| `git status` / `git diff` / `git log` | ✅ sempre |
| `git add <arquivo>` (seletivo) | ✅ se o GOAL autoriza commit local |
| `git commit` (local, seletivo) | ✅ somente se o GOAL autoriza **explicitamente** |
| Criar doc em `docs/` | ✅ se GOAL define criação de documentação |
| Criar arquivo em `docs/execution/` | ✅ se o GOAL é de governança/documentação |
| Corrigir erro de tsc gerado pela sprint | ✅ dentro do escopo do GOAL |
| Continuar para o próximo GOAL da lista | ✅ se não houver gate obrigatório |

---

## 4. Gates que SEMPRE exigem parada — aprovação humana obrigatória

Independente de qualquer autorização prévia no GOAL, as ações abaixo **nunca são automáticas**:

| Gate | Ação proibida sem aprovação explícita separada |
|---|---|
| **Push** | `git push` — sempre requer confirmação separada |
| **Merge** | merge entre branches — humano sempre clica |
| **DB** | `npm run db:push` / `db:migrate` — sempre requer confirmação |
| **Schema** | Qualquer alteração em `prisma/schema.prisma` |
| **Exclusão destrutiva** | `rm -rf`, exclusão de pastas, remoção de arquivos grandes |
| **Produção** | Deploy para Vercel ou qualquer ambiente de produção |
| **Segredos** | Secrets reais, certificados A1 reais, tokens de produção |
| **Áreas protegidas** | auth, proxy, core PDV funcional, core Financeiro funcional, core Operações funcional |
| **Ação irreversível** | Qualquer ação que não pode ser desfeita por `git reset` local |
| **Fora do escopo** | Qualquer edição em arquivo não listado no allow-list do GOAL |

> **Regra**: se a ação não está na lista de Auto Approval (§3) e não está explicitamente no GOAL → **parar e perguntar**.

---

## 5. Modo Overnight

### 5.1 Pré-condições

Para que um batch overnight seja válido, o usuário deve:

1. Enviar a lista completa de GOALs com escopo, allow-list e restrições de cada um.
2. Confirmar explicitamente que o batch overnight está aprovado.
3. Garantir que nenhum GOAL da lista toca áreas de Gate obrigatório (§4).

### 5.2 Regras do modo overnight

- Aceita 5, 10 ou mais GOALs em sequência.
- Executa um por vez, validando completamente antes de avançar.
- **Nunca faz `git push`** em nenhum GOAL da fila.
- **Nunca faz migration ou db:push** em nenhum GOAL da fila.
- **Nunca toca produção** em nenhum GOAL da fila.
- **Nunca cria ADR novo** automaticamente em overnight (apenas propõe para revisão humana).
- Se um GOAL falhar: registra o erro, para a fila, relata ao usuário.
- Ao final: gera **relatório consolidado único** com resultado de cada GOAL.

### 5.3 Tamanho permitido em overnight

Conforme decisão fundadora #1 (`INDEX.md §4`):

- Apenas **skills S (≤ 4h estimadas)** por GOAL.
- GOAL tamanho M+ em overnight → ABORT + relata ao usuário.

### 5.4 Relatório final overnight

O relatório consolidado deve conter para cada GOAL:

```
## GOAL N — <nome>
- Status: ✅ concluído | ❌ falhou | ⏭️ pulado
- Arquivos criados: []
- Arquivos alterados: []
- Validações: tsc ✅ | build ✅ | testes ✅
- Commit local: sim/não
- Riscos: []
- Próximo passo: []
- Push realizado: nunca
```

---

## 6. Controle de escopo por GOAL

### 6.1 Antes de iniciar cada GOAL

O agente deve listar explicitamente:

```
## Escopo do GOAL N
### Permitido
- paths/pastas que podem ser tocados
- ações autorizadas

### Proibido
- paths/pastas fora do escopo
- ações não autorizadas

### Gates ativos
- lista de gates obrigatórios identificados neste GOAL
```

### 6.2 Durante execução

- Tocar arquivo fora da allow-list → **parar imediatamente**, não editar, relatar.
- Descobrir que o escopo precisaria crescer → **parar, relatar, aguardar aprovação**.

### 6.3 Antes de finalizar

Validar com `git diff --name-only` que apenas arquivos dentro do escopo foram modificados.
Se houver arquivo fora do escopo no diff → **não commitar**, relatar ao usuário.

---

## 7. Gestão de working tree em múltiplos GOALs

### 7.1 Detectar working tree suja

Antes de iniciar qualquer GOAL que faça commit, rodar `git status` e verificar:

- Existem arquivos staged de um GOAL anterior?
- Existem arquivos modified que não pertencem ao GOAL atual?

Se sim → **não misturar**. Usar stage seletivo (`git add <arquivo>` específico).

### 7.2 Regra de não-mistura

- Nunca usar `git add -A` ou `git add .` — sempre por arquivo ou pasta específica.
- Arquivos fora do escopo do GOAL atual: **preservar intocados**, não incluir no commit.
- Se working tree tem trabalho em andamento de outra frente → relatar, não commitar.

### 7.3 Stage seletivo obrigatório

Todo commit deve ser precedido de `git status` + `git diff --name-only` para confirmar que apenas os arquivos do GOAL estão staged.

---

## 8. Relatório de fechamento por GOAL (obrigatório)

Todo GOAL deve terminar com:

```
## Relatório final — GOAL <nome>

### Arquivos criados
- path/arquivo.ext

### Arquivos alterados
- path/arquivo.ext (descrição da mudança)

### Validações
- tsc: ✅ / ❌
- build: ✅ / ❌ / não aplicável
- testes: ✅ N passed | ❌ erros

### Commit local
- realizado: sim/não
- hash: <hash> (se sim)
- arquivos incluídos: []

### Riscos identificados
- []

### Próximo passo
- []

### Confirmações de segurança
- [ ] Nenhum push realizado
- [ ] Nenhuma migration aplicada
- [ ] Nenhuma área protegida tocada
- [ ] Nenhum arquivo fora do escopo commitado
```

---

## 9. Commit — regras

- **Só commitar se o GOAL autorizar explicitamente.**
- Commit sempre seletivo — nunca `git add .`.
- Mensagem de commit no padrão: `<tipo>(<escopo>): <descrição>`.
- Co-authored-by obrigatório: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Nunca incluir arquivos fora do escopo declarado pelo GOAL.
- Nunca usar `--no-verify` (não pular hooks).

---

## 10. Push — regra única

**Nunca fazer `git push` sem autorização explícita separada do usuário**, mesmo que o GOAL autorize commit local.

A autorização de commit local **não implica** autorização de push. São dois atos distintos.

---

## 11. Relação com documentos existentes

| Documento | Como interage com EXECUTION_RULES |
|---|---|
| [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) | Pipeline de 17 fases que cada GOAL segue internamente |
| [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) | Limites de segurança que **nunca** são sobrescritos pelo GOAL |
| [`HUMAN_GATES.md`](./HUMAN_GATES.md) | Gates obrigatórios que §4 deste doc reproduz em forma de tabela |
| [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md) | Taxonomia das skills; define tamanhos S/M/L/XL |
| [`INTAKE_PROTOCOL.md`](./INTAKE_PROTOCOL.md) | Roteamento de pedidos livres → Intake Manifest → Gate #1 |
| `docs/skills/rules/CORE_RULES.md` | Regras inegociáveis do projeto (têm precedência) |
| `docs/ai/CURRENT_STATUS.md` | Lido antes de cada GOAL para verificar estado atual |

---

## 12. Hierarquia de autoridade

Em caso de conflito entre documentos:

```
CORE_RULES.md
   > SAFE_GUARDS.md + HUMAN_GATES.md
      > EXECUTION_RULES.md (este documento)
         > o GOAL individual
            > preferência do agente
```

O GOAL nunca sobrescreve `CORE_RULES.md`, `SAFE_GUARDS.md` ou `HUMAN_GATES.md`.

---

## 13. Versionamento

- Esta é a **v1** (criado 2026-06-25, Bloco execution-v2-bloco1).
- Mudança de regra → nova versão + atualização de `last_update`.
- Versão anterior preservada como seção `## Histórico` ao final do arquivo.
