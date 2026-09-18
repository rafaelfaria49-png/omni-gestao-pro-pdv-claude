<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-EMISSION-AUTHORIZATION-HANDOFF-022D",
  "track": "fiscal",
  "title": "Ratificar e publicar pelo AEP canônico o handoff autorizado de emissão do piloto (transplante byte-idêntico do 022C, zero SEFAZ)",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/fiscal-022D-pilot-emission-authorization-handoff",
  "worktree": "C:/Projetos/omni-gestao-fiscal-022D-pilot-emission-authorization-handoff",
  "test_command": "npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery",
  "allowlist": [
    "lib/fiscal/queue/**",
    "lib/fiscal/homologation/**",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 120,
  "plan_ref": "FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001",
  "plan_rev": 1,
  "familia_executor": "humano",
  "revisao_independente": true,
  "reversibilidade": "transplante puro de 2 commits revisados sobre origin/main; reversível por git revert dos cherry-picks; fiscalEnabled intocado (false); janela PILOT_EMISSION_HOMOLOGATION_WINDOW permanece dormente; Production/G-F12 fechados; zero escrita Neon; zero rede SEFAZ",
  "gates_extra": [
    {
      "id": "sefaz_homologacao",
      "status": "bloqueado_022d_zero_transmissao",
      "dependencias": []
    },
    {
      "id": "production",
      "status": "bloqueado",
      "dependencias": []
    }
  ],
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "autorizacao": "GOAL 022 permanece BLOCKED e 022B permanece DONE. Autorizo o sucessor FISCAL-PILOT-EMISSION-AUTHORIZATION-HANDOFF-022D a ratificar e publicar pelo AEP canônico a implementação 022C já revisada independentemente (commits 5e52492842c06645769035c50881fc672ef0af7a e 97b4d166c6b343235c87a42dae6a5db38e11503b, HEAD 97b4d166c6b343235c87a42dae6a5db38e11503b), via transplante byte-idêntico dos 7 arquivos técnicos/evidência, sem alterar semântica, sem corrigir o 022C retroativamente, sem mergear o PR #203, sem transmitir documento fiscal, sem contato SEFAZ e sem writes Neon. PR #203 será fechado como superseded pelo 022D após merge canônico.",
      "registrado_por": "Rafael Faria",
      "em": "2026-09-17T21:00:00-03:00"
    }
  }
}
-->

# FISCAL-PILOT-EMISSION-AUTHORIZATION-HANDOFF-022D — Ratificar handoff autorizado de emissão do piloto

- trilha: `fiscal`
- classe: C3 · status: READY
- plano: `FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001` (plan_rev 1)
- branch: `goal/fiscal-022D-pilot-emission-authorization-handoff`
- worktree: `C:/Projetos/omni-gestao-fiscal-022D-pilot-emission-authorization-handoff`
- teste: `npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery`
- risco: `ALTO`
- revisao_independente: `true` (herdada do 022C: R1 providerInvoked + R2 expiração pós-resposta)
- predecessor: `022` BLOCKED permanece · `022B` DONE permanece · `022C` (branch/PR #203) com gap AEP pré-existente, substituído por este GOAL

## 1. Objetivo

Ratificar e publicar pelo AEP canônico a implementação 022C já revisada
independentemente, sem alterar sua semântica e sem qualquer contato SEFAZ.

- Não corrigir o 022C retroativamente.
- Não mergear o PR #203.
- Não transmitir documento fiscal.

HEAD técnico aprovado a reproduzir: `97b4d166c6b343235c87a42dae6a5db38e11503b`.

Commits técnicos aprovados (somente estes dois, sem merge commits da branch 022C):

- `5e52492842c06645769035c50881fc672ef0af7a`
- `97b4d166c6b343235c87a42dae6a5db38e11503b`

## 2. Base

- Partir da `origin/main` atual (fetch antes da branch).
- Branch/worktree nova: `goal/fiscal-022D-pilot-emission-authorization-handoff`.

## 3. Escopo técnico (allowlist estrita — única superfície de escrita do agente)

```
lib/fiscal/queue/**
lib/fiscal/homologation/**
docs/ai-execution/_evidence/**
```

Nenhuma nova alteração técnica é permitida no 022D. A revisão independente do 022C
já aprovou e deve ser preservada byte-idêntica:

- providerInvoked gate (R1)
- startedAt pré-boundary (R2)
- proof WeakMap/non-forgeable
- one-shot
- job/store/nota binding
- NFeAutorizacao4
- HOMOLOGACAO-only
- default deny
- Production block
- zero retry
- CONSULTA/contingência/inutilização sem regressão

## 4. Equivalência exigida com o PR #203 aprovado

Os 7 arquivos técnicos/evidência devem ficar byte-idênticos ao HEAD `97b4d16`
(conteúdo/blob/hash, não somente diffstat):

- `docs/ai-execution/_evidence/FISCAL-PILOT-EMISSION-AUTHORIZATION-HANDOFF-022C.md`
- `lib/fiscal/homologation/nfce-homologation-pilot-armed-wiring.ts`
- `lib/fiscal/homologation/pilot-emission-authorization-handoff-022c.test.ts`
- `lib/fiscal/homologation/pilot-emission-gate.ts`
- `lib/fiscal/queue/queue-worker-goal022c-prova.test.ts`
- `lib/fiscal/queue/queue-worker.ts`
- `lib/fiscal/queue/queue.types.ts`

Exigir: `TECHNICAL_TREE_IDENTICAL_TO_REVIEWED=true`.

Se qualquer arquivo divergir: parar com `INDEPENDENT_REVIEW_INVALIDATED`.

Se houver conflito em `lib/fiscal/**` no cherry-pick: parar com `TRANSPLANT_CONFLICT`.

## 5. Operações externas: zero

- `EXTERNAL_SEFAZ_CONTACT=false`
- `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0`
- `NEON_WRITES=0`
- `fiscalEnabled` não deve ser alterado.
- Nenhuma janela deve ser armada (`PILOT_EMISSION_HOMOLOGATION_WINDOW` permanece dormente).

## 6. Validação

```
npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery
npm run typecheck
eslint focado
git diff --check
node scripts/track.mjs check fiscal
node scripts/track.mjs verify --all
```

## 7. Publicação

- `close` canônico (`node scripts/track.mjs close fiscal`) deve ratificar DONE e
  mover 022D para `_closed` sem workaround manual.
- Push da branch + PR novo para `main` com título sugerido
  `goal(fiscal-022D): ratificar handoff autorizado de emissão do piloto`, registrando
  no body: transplante byte-idêntico ao PR #203; revisão independente final aprovada;
  746+ testes fiscais conforme nova execução; zero SEFAZ/Neon; PR #203 substituído
  por gap AEP pré-existente.
- Falha relacionada ao transplante/AEP: corrigir somente se não alterar os 7 arquivos
  técnicos aprovados. Se correção técnica for necessária: parar e invalidar a revisão.
- Falhas baseline externas: CORE_RULES §10.
- Se CI aceitável, branch mergeable, `TECHNICAL_TREE_IDENTICAL_TO_REVIEWED=true`,
  AEP close=DONE, P0=0, P1=0: merge canônico do novo PR (não parar em "ready to merge").
- Acompanhar Vercel Production até READY; confirmar deployment do merge SHA; smoke
  mínimo `GET /api/version` + `GET /login` sem 404/500 estrutural; não executar NFC-e.
- Depois do merge: fechar PR #203 SEM merge como superseded pelo 022D; não deletar
  a branch 022C até confirmar a main publicada.

## 8. Critério de Pronto

1. Transplante byte-idêntico ao HEAD 022C aprovado.
2. Suíte do GOAL verde (746+ testes conforme nova execução).
3. Typecheck + lint focado + diff-check verdes.
4. `track check` + `track verify --all` verdes.
5. AEP 022D DONE; PR novo mergeado; `origin/main` atualizado; Vercel READY; smoke OK;
   PR #203 fechado como superseded.
