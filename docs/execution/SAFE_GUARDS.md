---
title: Safe-Guards — limites operacionais do Execution Engine
status: vivo
owner: produto + arquitetura
last_update: 2026-05-27
bloco: 30
---

# 🛡️ Safe-Guards do Execution Engine

> **Limites mecânicos** que o engine aplica automaticamente. Skill que tenta violar é rejeitada antes de tocar arquivo.
> Complementa: [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (pipeline) e [`HUMAN_GATES.md`](./HUMAN_GATES.md) (gates humanos).

---

## 1. Princípio

Safe-guard é **regra que não pede licença**. Engine valida e rejeita. Humano não precisa ser chamado para barrar — o engine barra sozinho. Só é chamado para **aprovar exceção explícita** quando faz sentido.

> Filosofia: confiar é bom, validar é melhor. IA é colaborador júnior brilhante — guard-rails ajudam todos.

---

## 2. Allow-list de paths por skill

Toda skill **declara explicitamente** quais paths pode tocar. Engine valida cada Write/Edit/Delete.

### 2.1 Formato no front matter da skill

```yaml
allowed_paths:
  - "lib/financeiro/services/**"
  - "app/api/financeiro/**"
  - "docs/sprints/proposals/**"
  - "docs/audits/**"
denied_paths:
  - "prisma/schema.prisma"
  - "auth.ts"
  - "lib/financeiro/contracts/**"  # contratos viram ADR
```

### 2.2 Validação
- Match glob estrito.
- `allowed_paths` é whitelist (lista positiva).
- `denied_paths` é blacklist (lista negativa, vence em conflito).
- **Default deny:** se path não está em `allowed_paths`, é negado.
- Match faz na **tentativa de escrita**, não no resultado. Skill não consegue contornar com `mv`.

### 2.3 Falha
- Tentou escrever fora da allow-list → **ABORT + ROLLBACK** (Fase 10 do Engine).
- Não há "warning silencioso".

---

## 3. Deny-list global (hardcoded no engine)

Estes paths **nunca** podem ser tocados sem flag humana explícita ao vivo (`--with-protected-areas`):

| Path | Por quê |
|---|---|
| `prisma/schema.prisma` | Schema = contrato com banco produção |
| `prisma/migrations/**` | Migrações imutáveis após aplicadas |
| `auth.ts` | Auth = porta de entrada |
| `auth.config.ts` | idem |
| `proxy.ts` | Proteção de rotas |
| `lib/pdv*/core/**` | PDV core (área protegida CLAUDE.md) |
| `lib/financeiro/services/**/core*` | Financeiro services core |
| `lib/operacoes/services/**/core*` | OS services core |
| `lib/whatsapp/**/core*` | WhatsApp core |
| `lib/omni-agent/executores/**` | Executores de IA |
| `.env*` | Segredos |
| `next.config.mjs` | Build/security headers |
| `package.json` (modificar deps) | Dependências = decisão de produto |
| `tsconfig.json` (paths/excludes) | Aliases = quebra implícita de tudo |

> **Nota:** *ler* qualquer arquivo é livre. **Modificar** estes exige flag.

### 3.1 Como liberar exceção
- Humano roda skill em modo SAFE.
- Passa flag `--with-protected-areas:<path_relativo>` no intake.
- Engine confirma 2x (skill + humano) antes de prosseguir.
- Log dedicado em `EXECUTION_LOG.md` com tag `[PROTECTED]`.

### 3.2 Em OVERNIGHT
- Flag `--with-protected-areas` **é proibida**. Engine rejeita o intake.

---

## 4. Limites de tamanho

| Limite | Valor | Ação se excedido |
|---|---|---|
| **Diff total da skill** | 500 linhas adicionadas + removidas | PAUSE + humano decide (continuar / dividir) |
| **Diff por arquivo** | 200 linhas | WARN (não bloqueia, mas registra) |
| **Arquivos modificados** | 15 | PAUSE + humano |
| **Novos arquivos criados** | 8 | WARN |
| **Arquivos deletados** | 3 | PAUSE + humano (delete é destrutivo) |
| **Tempo total de skill** (S) | 4h reais | ABORT + handoff |
| **Tempo total de skill** (M) | 8h reais | ABORT + handoff |
| **Tempo total de skill** (L) | 24h reais | ABORT + handoff (L exigia flag, já era exceção) |
| **Tempo de benchmark** | 30 min | trunca + segue |
| **Tempo de uma fase específica** | 1h | PAUSE + humano |

---

## 5. Comandos proibidos

Skill **nunca** pode executar:

| Comando | Por quê |
|---|---|
| `rm -rf <qualquer>` (recursivo) | Destrutivo irreversível |
| `git reset --hard <qualquer>` (exceto rollback automático) | Apaga trabalho |
| `git push --force` | Reescreve histórico remoto |
| `git push --no-verify` | Bypassa hooks |
| `git commit --no-verify` | Bypassa hooks |
| `git commit --no-gpg-sign` | Bypassa assinatura |
| `git branch -D <main\|master>` | Apaga branch principal |
| `git checkout .` | Descarta uncommitted |
| `git restore .` | idem |
| `git clean -f` | Apaga untracked |
| `npm install <nova-dep>` | Dependência = decisão humana + ADR |
| `npm uninstall <dep>` | idem |
| `prisma migrate reset` | Apaga banco |
| `prisma db push --accept-data-loss` | Pode perder dados |
| `prisma db push --force-reset` | Pode perder dados |
| `psql ... DROP/TRUNCATE/DELETE FROM` | DDL/DML destrutiva direta |
| Qualquer pipe para `\| sh` de fonte externa | Execução remota |
| `curl ... \| bash` | idem |

### 5.1 Validação
- Engine valida string do comando ANTES de executar.
- Match por regex em comandos proibidos.
- Bypass tentado → ABORT + log marcado como suspeito + notifica humano.

---

## 6. Build/test verdes obrigatórios

| Fase | Comando obrigatório | Falha se vermelho |
|---|---|---|
| 8 Pre-tests | `npx tsc --noEmit` | ABORT (sujeira pré-existente) |
| 8 Pre-tests | `npm run build` (se mexe em config/rotas/Server Actions/Prisma) | ABORT |
| 8 Pre-tests | `npm run test` (se mexe em código testado) | ABORT |
| 11 Post-tests | `npx tsc --noEmit` | 1 retry, depois ROLLBACK |
| 11 Post-tests | `npm run build` (se aplicável) | 1 retry, depois ROLLBACK |
| 11 Post-tests | `npm run test` (cobertura nova + antiga) | 1 retry, depois ROLLBACK |

### 6.1 Por que pre-tests
- Se `tsc` já está vermelho antes da skill tocar, a skill não pode ser responsabilizada — e qualquer fix dela vai esconder o problema real.

---

## 7. Lock por HUB (serialização)

> Detalhe operacional vai para [`COWORK_PROTOCOL.md`](./COWORK_PROTOCOL.md) (Bloco 38).

Resumo:

| Regra | Valor |
|---|---|
| 1 lock = 1 HUB | sim |
| TTL do lock | 4h |
| Heartbeat | 15 min |
| Lock expirado sem heartbeat | liberado automaticamente |
| Matriz de paralelismo (`roadmaps/INDEX.md §4`) | honrada — par "serial obrigatório" não pode ter locks simultâneos |
| Force-release | apenas humano |
| Onde vive | `docs/status/LOCKS.md` |

---

## 8. Snapshot + rollback automático

| Quando | O que faz |
|---|---|
| Fase 9 (sempre) | Cria branch `skill/<ticket_id>` + registra hash do HEAD anterior |
| Fase 10 falha (touch fora allow-list, diff > 500, comando proibido) | `git reset --hard <hash_anterior>` na branch da skill + ABORT |
| Fase 11 falha 2x | idem |
| Fase 12 P0 finding | idem + escala humano |
| Fase 13 humano rejeita | idem + libera lock |
| Fase 14+ falha (já mergeado) | NÃO rollback — código está aprovado; doc fix vai como sprint separada |

### 8.1 Branch da skill nunca é mergeada sem Fase 13 verde
- Engine não tem permissão de merge.
- PR draft criado em Fase 13 (overnight) ou merge clicado por humano (SAFE).

---

## 9. Rate limits

| Limite | Valor |
|---|---|
| Commits por skill | 20 (1 por checkpoint, máx) |
| Tool calls por fase | 50 (telemetria; soft warning) |
| WebFetches em benchmark | 12 (cap rígido) |
| Skills concorrentes do mesmo IA | 1 (uma IA não roda 2 skills ao mesmo tempo) |
| Skills concorrentes na frota | 4 HUBs (matriz manda) |
| Skills overnight por noite | 3 (decisão fundadora #1 + #2) |

---

## 10. Logging obrigatório

Toda skill gera entradas em `docs/status/EXECUTION_LOG.md` (append-only, criado no Bloco 42):

```yaml
- ticket_id: MULTI_LOJA-S-001
  ia: sonnet
  modo: SAFE
  started_at: 2026-05-28T09:14:00-03:00
  ended_at: 2026-05-28T11:42:00-03:00
  fases_completas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
  fase_falha: null
  resultado: encerrada
  pr: null  # ou número do PR se overnight
  rollback: false
  flags: []
```

Log nunca é editado retroativamente. Erro num log = nova entrada de correção.

---

## 11. Audit log de tentativas bloqueadas

Toda violação de guard-rail gera entrada em `EXECUTION_LOG.md` com `resultado: blocked` e razão. Isso vira insumo para:
- Auditoria mensal de skills (estão bem escopadas?).
- Detecção de skill mal projetada (muito blocked → revisar).
- Detecção de prompt injection (skill tenta sair da allow-list de forma anômala).

---

## 12. Recovery / pause / resume

| Cenário | Ação |
|---|---|
| IA caiu em meio à execução | Próxima sessão lê `EXECUTION_LOG.md`; se ticket está sem `ended_at` e lock ainda vivo, retoma da última fase completa |
| Lock expirou | Próxima IA precisa adquirir novo lock; rollback automático para snapshot se Fase ≥ 9 |
| Humano pausou no Gate #1 ou #2 | Lock mantém heartbeat; ticket fica "aguardando aprovação"; outra IA não pode tomar este HUB |
| Humano cancelou explicitamente | ROLLBACK + lock release + ticket marcado `cancelado` |

---

## 13. Fonte da verdade

- **Safe-guards mecânicos:** este arquivo.
- **Pipeline:** [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md).
- **Gates humanos:** [`HUMAN_GATES.md`](./HUMAN_GATES.md).
- **Áreas protegidas (lista canônica):** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md) — engine sincroniza com este.
- **Decisões fundadoras:** [`INDEX.md §4`](./INDEX.md).
