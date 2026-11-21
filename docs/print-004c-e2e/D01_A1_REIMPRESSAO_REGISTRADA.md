# D01-A1 — Reimpressão registrada pelo Histórico de vendas e pela Conferência do caixa

GOAL `OMNI-PRINT-D01-A1-REIMPRESSAO-REGISTRADA-001` · opção D01-A aprovada pelo proprietário · base `f639248` (PR #327) ·
branch `claude/omni-print-d01-a1-reimpressao` · PR #329 (rascunho).

**Não ativa nada:** `APPROVED_RELEASE` continua `null`, o recurso segue desligado por padrão, e nada foi aplicado ou
publicado em produção. **Nenhuma impressão física:** todos os testes usam o spooler simulado.

## O que mudou

| Ponto do escopo | Como ficou | Arquivos |
|---|---|---|
| 1–2. Histórico e Conferência pelo registro | As duas telas reimprimem pelo mesmo diálogo (`CupomNaoFiscal`), que agora recebe a loja (`reprintStoreId`) e o id da venda no servidor (`vendaId`). Com a impressão direta ligada na loja, os botões antigos de impressão sem registro dão lugar ao painel de reimpressão registrada | `vendas-arquivo-geral.tsx`, `conferencia-caixa.tsx`, `cupom-nao-fiscal.tsx`, `venda-cupom-mapper.ts`, `direct-reprint-panel.tsx` |
| 3. SEGUNDA VIA e registro auditável | Pela térmica, o job `REPRINT` sai com "SEGUNDA VIA - REIMPRESSAO". Pelo navegador, o HTML gerado no servidor sai **sempre** "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR", mesmo sem via anterior registrada (reimpressão é segunda via por definição). Toda reimpressão grava evento com usuário, `origin` e `firstCopy` | `core.ts` (`browserFallback`) |
| 4. Confirmação com risco | Antes de imprimir, o painel mostra as vias que podem já ter saído, as incertas e as que ainda aguardam a impressora. Na térmica, com via possivelmente impressa ou resultado incerto, há um **segundo clique explícito** ("Confirmar 2ª via na impressora do caixa"). O servidor só imprime contra um **consentimento assinado e preso a esse risco**. Se o risco mudou (outra aba ou caixa imprimiu, ou o consentimento expirou), nada sai e o operador confirma o risco atual | `core.ts` (`browserConsentHolds`), `direct-reprint-panel.tsx` |
| 5. Proteção contra duplicidade | **Quem decide é o estado do servidor, não o `origin` enviado pelo cliente.** A única impressão sem consentimento é a 1ª via legítima: venda dentro da janela (30 min), sem nenhuma via de qualquer tipo e sem reimpressão histórica. Todo o resto exige o token assinado, venha do PDV, sem origem, do Histórico/Conferência ou de chamada direta à API; o antigo `confirm: true` é ignorado. Térmica em duas abas converge num job só; navegador em duas abas obriga a segunda a confirmar de novo, inclusive quando as duas já viam risco; cliques simultâneos são serializados pelo lock do documento; uma via ainda na fila é cancelada e substituída, nunca impressa a mais | `core.ts`, `pdv-direct-print-feedback.tsx` |
| 6. Aviso "só PDV Clássico" | O cartão de configuração diz que a impressão automática atende, por enquanto, só o PDV Clássico. Também diz que as reimpressões ficam registradas, exceto vendas fora do contrato (peso/KG), que seguem o fluxo atual | `ImpressaoDiretaAgenteCard.tsx` |
| 7. A4 que não é cupom de venda | Intocado (recibos de OS e de contas a receber, relatórios). A Venda Completa não recebe o painel | — |
| 8. Limite de bytes | No PDV, `COMMAND_LIMIT`, `SNAPSHOT_LIMIT` e `PAYLOAD_LIMIT` voltam ao fluxo antigo, como já acontecia com o limite de itens: são recusados antes de existir qualquer via (S21). Na reimpressão, esses códigos escondem a térmica e orientam a 2ª via pelo navegador, que continua registrada. O limite de **vias** ganhou código próprio (`COPIES_LIMIT`): é erro de configuração e não serve de motivo para imprimir sem registro | `client.ts` (`UNSUPPORTED_DIRECT_PRINT`), `pdv-direct-print-feedback.tsx`, `core.ts` |
| 9. Omni Print desligado | Loja sem impressão direta: diálogo antigo idêntico e nenhuma chamada nova (PW17). Servidor com o recurso fechado (404 `DIRECT_PRINT_DISABLED`) ou venda fora do contrato (KG): volta ao fluxo antigo, com aviso de que não há registro (PW18). Registro indisponível (5xx/rede): **não** volta ao fluxo antigo; o painel falha fechado e a janela aberta é fechada sem uso (PW19, S35) | `cupom-nao-fiscal.tsx`, `direct-reprint-panel.tsx` |
| 10. Sincronização offline (#326) | Venda pendente não abre o cupom no Histórico (`blocksConfirmedSaleAction`, já existente). Só há `vendaId` quando a venda tem linha no servidor. Erros de rede ou de sessão nunca imprimem sem registro | `direct-reprint-panel.tsx` |

Abrir o cupom (para ver ou copiar o resumo) não grava nada no servidor. A consulta e o registro só começam no clique em
"Reimprimir como 2ª via".

## CI

O CI de `7e86fdd` falhou antes de rodar qualquer teste: o `ubuntu-latest` passou a ser `ubuntu-26.04`, e o Playwright
1.52.0 não instala o Chromium nessa imagem ("Playwright does not support chromium on ubuntu26.04-x64"). Os três jobs desta
PR que instalam o Playwright foram fixados em `runs-on: ubuntu-24.04`:

- `ramos-cadastros.yml`: `validate` e `e2e-authenticated`;
- `platform-pilot.yml`: `authenticated`.

Nenhum passo, teste ou gate foi removido, e não há `continue-on-error` nem skip.

**Pendência fora desta PR:** `pdv-scale-visor.yml` (job `browser`) e `cadastros-cliente-assistido.yml` (job `validate`)
também instalam o Playwright em `ubuntu-latest`. Eles não rodam nesta PR, mas vão falhar do mesmo jeito em qualquer PR que
os dispare. A #327 altera `PdvSection.tsx`, que está nos `paths` do visor. A correção definitiva é atualizar o Playwright;
até lá, fixar `ubuntu-24.04` também nesses dois jobs.

## Testes (sem hardware)

| Etapa | Resultado |
|---|---|
| Playwright (diálogo real + API real + PostgreSQL descartável + agente real com spooler simulado) | 19/19: PW1–PW11 (PDV) + **PW12–PW19** (reimpressão: térmica com confirmação, navegador, venda sem via, duas abas com e sem risco, resultado incerto, recurso desligado, KG e servidor fechado, registro indisponível) |
| Cenários PostgreSQL | 35/35. **S34**: reimpressão com consentimento preso ao risco, duas abas com risco, REPRINT térmico na intenção cotada, cliques simultâneos, permissão (técnico 403) e outra loja (404). **S35**: API direta; origem PDV/ausente com `confirm: true` nunca imprime segunda via; 1ª via legítima preservada; token obsoleto, forjado (403), expirado e de outro documento; venda antiga tratada como reimpressão; banco indisponível (5xx, nada impresso); gate fechado (404, nenhum documento) |
| Testes de mutação | S34 falha se o servidor ignorar a origem REPRINT ou aceitar qualquer consentimento; S35 falha se `confirm: true` voltar a valer |
| Unitários | mapper (`vendaId`), ligação das duas telas (estático), `lib/printing/direct`, agente, configurações: PASS |
| Regressão ampla (PDV, vendas, caixa, auth, configurações) | as únicas falhas são as mesmas da `main` limpa (`fechamento-calculadora-modal.static`, `pdv-scan-autoclear.static`) |
| Typecheck completo / ESLint dos arquivos alterados | 0 erros / 0 erros |
| Build de produção local (`npm run build`) | Compiled successfully (sem autoridade de migration) |
| Bateria completa 004C | `evidence/battery-summary.json` |

## Revisão independente

- **Rodada 6:** REQUEST_CHANGES (1 P2, 10 P3) → corrigido → APPROVE.
- **Rodada 7** (CI, consentimento também na origem PDV, confirmação térmica): APPROVE, sem P0/P1/P2.

Detalhes em `REVISAO_INDEPENDENTE.md`.

## Riscos residuais

- **Marca conservadora em venda antiga:** uma venda fora da janela da 1ª via (30 min) sem nenhuma via registrada sai como
  SEGUNDA VIA também pelo PDV. Isso é coerente com a regra "fora da janela é reimpressão" e deve ser observado na
  homologação física.
- **Restrição por navegador** (herdada do 004C): usa um identificador do `localStorage`. Evita uso acidental por outro
  navegador, não um usuário mal-intencionado no mesmo computador.
- **Outros PDVs e A4:** os demais PDVs (Supermercado, Assistência, Venda Completa) e o A4 da Venda Completa seguem o fluxo
  antigo, como aprovado em D01-A2.
- **Playwright fora desta PR:** ver a pendência na seção CI.
- **Homologação física:** pendente (`PHYSICAL_HOMOLOGATION=PENDING`).
