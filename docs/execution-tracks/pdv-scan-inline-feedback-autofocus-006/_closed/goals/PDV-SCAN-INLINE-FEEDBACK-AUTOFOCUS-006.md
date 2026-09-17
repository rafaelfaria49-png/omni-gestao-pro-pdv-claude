<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006",
  "track": "pdv-scan-inline-feedback-autofocus-006",
  "title": "Feedback inline de código não cadastrado no próprio campo Código/Bipe + autofocus operacional ao entrar/retornar ao PDV",
  "status": "READY",
  "class": "C2",
  "risk_tier": "MEDIO",
  "branch": "goal/pdv-scan-inline-feedback-autofocus-006",
  "worktree": "C:/Projetos/work/pdv-scan-inline-feedback-autofocus-006",
  "test_command": "npx vitest run lib/pdv-scan-input.test.ts components/dashboard/vendas/pdv-scan-autoclear.static.test.ts",
  "allowlist": [
    "lib/pdv-scan-input.ts",
    "lib/pdv-scan-input.test.ts",
    "components/dashboard/vendas/use-pdv-scan-feedback.ts",
    "components/dashboard/vendas/pdv-scan-inline-feedback.tsx",
    "components/dashboard/vendas/pdv-omni-classic-shell.tsx",
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/pdv-scan-autoclear.static.test.ts",
    "docs/pdv/PDV_SCAN_INLINE_FEEDBACK_AUTOFOCUS_006.md",
    "docs/ai-execution/_evidence/**",
    "docs/execution-tracks/pdv-scan-inline-feedback-autofocus-006/**",
    "docs/ai-execution/protocol.json",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md"
  ],
  "gates_liberados": [],
  "read_budget": 250,
  "plan_ref": "GOAL humano PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006-ENDTOEND (prompt do operador)",
  "plan_rev": 1,
  "familia_executor": "zcode",
  "revisao_independente": true,
  "reversibilidade": "UX-only em 4 superfícies de PDV; sem schema/backend/negócio; reversível por revert do commit",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006 — Feedback inline no bipe + autofocus

- trilha: `pdv-scan-inline-feedback-autofocus-006`
- classe: C2 · status: READY
- base: `origin/main` `608c285` (merge PR #196)
- branch: `goal/pdv-scan-inline-feedback-autofocus-006`
- worktree: `C:/Projetos/work/pdv-scan-inline-feedback-autofocus-006`
- teste: `npx vitest run lib/pdv-scan-input.test.ts components/dashboard/vendas/pdv-scan-autoclear.static.test.ts`
- risco: `MEDIO` (UX + foco em produção; sem toque em cálculo/estoque/pagamento/schema)

## Objetivo

1. **Feedback inline**: código bipado não cadastrado → aviso visível NO PRÓPRIO campo
   Código/Bipe (`⚠ Produto não cadastrado · <código>`), input real permanece `value=""`
   e focado, some sozinho (~1,8 s), novo bipe substitui na hora.
2. **Autofocus operacional**: Código/Bipe focado ao entrar/retornar ao PDV e nos retornos
   que já devolvem foco, sem roubar foco de Cliente/Quantidade/Pagamento/Item Avulso/modais.

Superfícies: Clássico, Clássico Rápido, Assistência, Assistência Rápido, Supermercado,
Supermercado Rápido, Venda Completa. PDV Next/Black: auditoria apenas.

## Decisões registradas na implementação

- Toast inferior "Produto não encontrado": **REMOVIDO** — o inline é o feedback principal;
  linha de status (`shellInfo`) permanece como registro passivo no Clássico. Evita dois
  alertas fortes simultâneos.
- Duração: `PDV_SCAN_NOT_FOUND_FEEDBACK_MS = 1800` (dentro de 1,8–2,2 s), reutilizada.
- Estado inline em fábrica pura na lib (`createPdvScanInlineNotFoundFeedback`), testável
  em node; hook React fino por cima. Um único timer vivo por superfície.
- Acessibilidade: `role="status"` + `aria-live="polite"`; foco NUNCA se move para a mensagem.
- Tokens do tema (`text-destructive`, `bg-background`, anel destructive) — claro/Midnight/Black.
- Digitação no campo encerra o aviso na hora (busca manual nunca convive com erro velho).
