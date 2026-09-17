# PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006 — Feedback inline no bipe + autofocus

- GOAL: `PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006-ENDTOEND`
- base: `origin/main` `608c285` · branch: `goal/pdv-scan-inline-feedback-autofocus-006`
- superfícies: Clássico, Clássico Rápido, Assistência, Assistência Rápido, Supermercado,
  Supermercado Rápido, Venda Completa

## 1. Feedback inline de código não cadastrado

Quando um código confirmado por Enter não existe (miss local + remoto sem resultado):

- o **input real permanece `value=""` e focado** (o código nunca vira `value` do campo);
- o próprio campo Código/Bipe exibe, sobreposto e sem layout shift:
  `⚠ Produto não cadastrado · <código>` (ícone `TriangleAlert` + texto, não só cor);
- o campo ganha borda/anel destructive (`border-destructive`, `aria-invalid="true"`);
- o aviso some sozinho após `PDV_SCAN_NOT_FOUND_FEEDBACK_MS = 1800 ms` (1,8 s, faixa 1,8–2,2 s);
- um novo bipe, Esc ou digitação encerra o aviso anterior **na hora** — nenhum scan espera o
  timeout, nenhum caractere é perdido, nenhum produto duplica;
- acessibilidade: `role="status"` + `aria-live="polite"` — anuncia sem mover o foco;
- tokens do tema (`text-destructive`, `bg-background`): válido nos temas Padrão claro,
  Midnight e Black Edition. Sem paleta paralela, sem shake/glow.

Implementação:

- `lib/pdv-scan-input.ts`: fábrica pura `createPdvScanInlineNotFoundFeedback` (um único timer
  vivo; estado `{ code, seq }`; `seq` crescente permite re-anúncio do mesmo código) — testável
  em node com fake timers.
- `components/dashboard/vendas/use-pdv-scan-feedback.ts`: hook fino sobre a fábrica; expõe
  `notify`/`dismiss` (mesma API dos call sites do GOAL 005 — zero mudança nos fluxos) + `inline`.
- `components/dashboard/vendas/pdv-scan-inline-feedback.tsx`: overlay compartilhado
  (`pointer-events-none`, `data-pdv-scan-inline`), reutilizado pelas 4 superfícies.
- Clássico: o estado viaja pela `PdvOmniClassicShell` (`bipeInlineFeedback`) e o `PosField`
  ganha `error`/`overlay`; Assistência, Supermercado e Venda Completa renderizam o overlay no
  wrapper `relative` do próprio input + classes condicionais de erro + `aria-invalid`.

### Decisão sobre o toast (seção 3 do GOAL)

**REMOVIDO.** O aviso inline é o feedback principal; o toast inferior "Produto não encontrado"
competia com o próximo bipe e criava dois alertas fortes simultâneos. O Clássico mantém a linha
de status (`shellInfo`) como registro passivo do resultado do bipe.

## 2. Autofocus operacional

- **Na entrada/retorno** (montagem da superfície e, no Clássico, liberação do gate da loja):
  o campo de bipe recebe foco uma única vez — `canAutoFocusPdvBipe()` (novo guard em
  `lib/pdv-scan-input.ts`) recusa se o operador já está em outro campo de texto ou se há
  `[role="dialog"]` aberto. Nada de interval/loop de foco.
- Clássico: o effect de gate antes valeia só para o modo Rápido; agora cobre os dois modos.
- Assistência: idem — antes só focava na entrada em modo Rápido; agora os dois.
- Supermercado: efeitos existentes (100 ms / 220 ms Rápido) agora passam pelo guard.
- Venda Completa: o foco de entrada migrou de Cliente para Código/Bipe (critério 1 do GOAL);
  F2 continua focando o Cliente, e o fluxo pós-Item-Avulso/scan permanece intocado.
- **Retornos que já devolvem foco** (encontrado, não encontrado, Item Avulso concluir/cancelar,
  Esc, fechar modais) foram preservados — o GOAL 005 permanece de pé (contrato estático).

## 3. Auditoria PDV Next/Black (sem mudanças)

`pdv-neon-shell.tsx` mantém o comportamento deliberadamente diferente: bipe inexistente
seleciona o texto para o próximo scan sobrescrever e não há Item Avulso. Sem necessidade
comprovada de mudança — intocado, conforme escopo.

## 4. O que NÃO mudou

Cálculo de venda, preço, desconto, estoque, finalização, pagamento, Caixa, Financeiro, Fiscal,
Prisma/schema/migrations, auth/proxy, Operações V4, WhatsApp, Marketplace — zero diff.
`BACKEND_CHANGED=NO`, `SCHEMA_CHANGED=NO`, `MIGRATION_CREATED=NO`.

## 5. Validação

- `npm run typecheck` — PASS
- ESLint nos arquivos do GOAL — 0 erros (warnings idênticos à baseline da main)
- `npx vitest run lib/pdv-scan-input.test.ts components/dashboard/vendas/pdv-scan-autoclear.static.test.ts`
  — 67 PASS (duração 1,8 s, substituição na hora, dismiss idempotente, guard de foco)
- Suite PDV/Vendas completa (lib/pdv + components/dashboard/vendas) — 471 PASS
- Suite completa do repo — **zero falhas novas** vs `origin/main` (22 falhas pré-existentes
  idênticas nos dois lados; comparadas por reporter JSON branch × main limpa)
- `git diff --check` — limpo
- `npm run build` — PASS

### Prova de browser (componentes reais + dados sintéticos)

Harness dev-only (não commitado) montando `PdvClassic`, `PdvAssistenciaEnterprise`,
`PdvSupermercado` e `VendaCompletaEnterprise` reais com inventário sintético; driver headless
Playwright com eventos de teclado reais. **64/65 checks PASS** — o único não-passado é o clique
no campo Cliente do Clássico, desabilitado no harness por capability (`customerSearchEnabled`
off sem settings de servidor); preservação de foco está provada na Assistência, na Venda
Completa e no modal de Pagamento.

Por superfície (A–G): entrada focada; inline com texto/código corretos, input vazio e focado,
`aria-invalid`; interrupção por novo scan com produto entrando; expiração sozinha com foco
preservado; A05 e "capinha samsung" preservados; Item Avulso Insert→cancelar limpa e devolve o
foco; modal de pagamento não perde foco para o scanner. Screenshots:
`docs/ai-execution/_evidence/pdv-006/*.png` (normal + não-cadastrado nas 4 superfícies).
Resumo completo: `docs/ai-execution/_evidence/PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006.md`.

Limitação honesta: a medição de duração no browser é imprecisa sob throttle de aba headless;
a duração exata de 1800 ms é garantida por testes unitários com fake timers.
