# Evidência visual — OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001

Capturas reais da página `/gestao-lojas`, geradas por `next build` + `next start` sobre PostgreSQL
descartável (harness `scripts/platform/run-pilot-e2e.mjs`), NextAuth real, dados 100% fictícios.

| Arquivo | O que prova |
|---|---|
| `gestao-lojas-375.png` · `-768.png` · `-1440.png` | página inteira nas três larguras, sem rolagem horizontal (medido no E2E) |
| `gestao-lojas-confirmacao.png` | confirmação com protocolo devolvido pelo servidor, dizendo "acesso ainda não criado" |
| `gestao-lojas-plataforma.png` | caixa de pedidos em `/dashboard/plataforma` (só sessão da plataforma) |
| `planos-qa-1440.png` · `-375.png` | modo QA com `GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1`: valores marcados "em avaliação" |

As telas do sistema usadas na página (`public/gestao-lojas/*.png`) saem de
`e2e/platform-pilot/gestao-lojas-capturas.spec.ts` (`GESTAO_LOJAS_CAPTURAS=1`).
Sem a chave de preços (padrão, inclusive Production) nenhum valor aparece — o E2E verifica.
