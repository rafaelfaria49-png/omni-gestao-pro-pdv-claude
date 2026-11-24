# Fiscal XSD Worker B2 — "Container, offline integration and supply chain" na PR #398

## Fatos

| Execução | SHA | Resultado | Passo que falhou | Testes vermelhos |
|---|---|---|---|---|
| PR #398 | 7bee9ef | falha | Typecheck | OOM do `tsc` a 4 GB (pico 4078/4096 MB), sem erro de tipo |
| PR #398 | c348163 | falha | Typecheck | `TS2493` no mock de `lib/saas/entitlement-sombra.test.ts` (corrigido em 08cbf5b) |
| PR #398 | 08cbf5b | falha | **Suíte completa e build Next** (`npm run test:root:sem-pg`) | `lib/pdv-scale-visor.component.test.ts` › "falha malformed…" e `components/cadastros/…/ClienteEditor.test.ts` › "cancel restores…" |

Todos os passos próprios do worker fiscal passaram em 08cbf5b: build imutável, rede sem egress,
readiness, isolamento, testes no container, prova de zero egress e verificação de hashes do XSD.
A falha está na suíte da raiz, que roda no mesmo job.

## Causa

1. **Os dois testes não pertencem a esta PR.** `git diff origin/main` não toca `components/cadastros/**`,
   `lib/cadastros/**`, `lib/pdv-scale-visor*` nem `components/pdv/**`: esses arquivos são idênticos aos da `main`.
2. **São instáveis na base, independentemente do SaaS:**
   - `ClienteEditor` › ditado por voz falhou no mesmo workflow em outras branches, cada vez num
     sub-teste diferente: `switching store…` (claude/pwa-instalacao-custo-zero-003 3df0c9c, run 45433656401),
     `discard after dictation…` (claude/omni-print-004c-e2e-001, run 45039090173) e `cancel restores…` (#398 08cbf5b).
   - **Reproduzido localmente, sem carga**, só com os dois arquivos e Node 22: 1 falha em 3 rodadas
     (`hiding the tab…`) e, em outra série, falha na 3ª rodada (`discard after dictation…`:
     botão "Descartar sugestões" ausente porque o campo continua `readonly`, ou seja, o cancelamento do
     ditado não foi aplicado naquela rodada).
   - A própria suíte reconhece o risco: o 1º teste do bloco usa relógio falso porque "eventos
     sintéticos não devem perder a sessão por latência do runner"; os demais usam relógio real.
3. **Conclusão:** instabilidade **preexistente** nos testes de componente de Cadastros (ditado por
   voz) e de PDV (visor da balança), sensível a tempo e ordem de renderização. Não é regressão do SaaS.
   A causa exata dentro do ciclo de vida da sessão de voz não foi isolada. Fica registrada como
   indício de que o cancelamento do ditado pode não ser aplicado em alguma ordem de eventos, o que
   merece um GOAL próprio da frente de Cadastros.

## O que foi feito

- Nada foi desligado, pulado ou afrouxado, nem testes nem controles de segurança.
- Código e testes de Cadastros e PDV **não** foram alterados (fora do escopo e protegidos pelo GOAL).
- A CI foi reexecutada no SHA final com a `main` reconciliada. Ver o resultado no relatório final do GOAL.
