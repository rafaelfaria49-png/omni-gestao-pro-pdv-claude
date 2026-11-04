# D01-A1 — Reimpressão registrada pelo Histórico de vendas e pela Conferência do caixa

GOAL `OMNI-PRINT-D01-A1-REIMPRESSAO-REGISTRADA-001` · opção D01-A aprovada pelo proprietário · base `f639248` (PR #327) ·
branch `claude/omni-print-d01-a1-reimpressao`.

**Não ativa nada:** `APPROVED_RELEASE` continua `null`, o recurso segue desligado por padrão, e nada foi aplicado ou
publicado em produção. **Nenhuma impressão física:** todos os testes usam o spooler simulado.

## O que mudou

| Ponto do escopo | Como ficou | Arquivos |
|---|---|---|
| 1–2. Histórico e Conferência pelo registro | As duas telas reimprimem pelo mesmo diálogo (`CupomNaoFiscal`), que agora recebe a loja (`reprintStoreId`) e o id da venda no servidor (`vendaId`). Com a impressão direta ligada na loja, os botões antigos de impressão sem registro dão lugar ao painel de reimpressão registrada | `vendas-arquivo-geral.tsx`, `conferencia-caixa.tsx`, `cupom-nao-fiscal.tsx`, `venda-cupom-mapper.ts`, `direct-reprint-panel.tsx` |
| 3. SEGUNDA VIA e registro auditável | Pela térmica, o job `REPRINT` sai com "SEGUNDA VIA - REIMPRESSAO". Pelo navegador, o HTML gerado no servidor sai **sempre** "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR", mesmo sem via anterior registrada (reimpressão é segunda via por definição). Toda reimpressão grava evento com usuário e `origin: REPRINT` | `core.ts` (`browserFallback`) |
| 4. Confirmação com risco | Antes de imprimir, o painel mostra as vias que podem já ter saído, as incertas e as que ainda aguardam a impressora. O servidor só imprime contra um **consentimento assinado e preso a esse risco**. Se o risco mudou (outra aba ou caixa imprimiu, ou o consentimento expirou), nada sai e o operador confirma o risco atual | `core.ts` (`browserConsentHolds`), `direct-reprint-panel.tsx` |
| 5. Proteção contra duplicidade (abas e terminais) | Térmica em duas abas converge num job só. Navegador em duas abas: a segunda precisa confirmar de novo, inclusive quando as duas já viam risco. Cliques simultâneos são serializados pelo lock do documento. Uma via ainda na fila é cancelada e substituída, nunca impressa a mais. Reimpressão de venda sem via registrada fecha a 1ª via, e nenhum "original" sai depois | `core.ts` |
| 6. Aviso "só PDV Clássico" | O cartão de configuração diz que a impressão automática atende, por enquanto, só o PDV Clássico. Também diz que as reimpressões ficam registradas, exceto vendas fora do contrato (peso/KG), que seguem o fluxo atual | `ImpressaoDiretaAgenteCard.tsx` |
| 7. A4 que não é cupom de venda | Intocado (recibos de OS e de contas a receber, relatórios). A Venda Completa não recebe o painel | — |
| 8. Limite de bytes | No PDV, `COMMAND_LIMIT`, `SNAPSHOT_LIMIT` e `PAYLOAD_LIMIT` voltam ao fluxo antigo, como já acontecia com o limite de itens: são recusados antes de existir qualquer via (S21). Na reimpressão, esses códigos escondem a térmica e orientam a 2ª via pelo navegador, que continua registrada. O limite de **vias** ganhou código próprio (`COPIES_LIMIT`): é erro de configuração e não serve de motivo para imprimir sem registro | `client.ts` (`UNSUPPORTED_DIRECT_PRINT`), `pdv-direct-print-feedback.tsx`, `core.ts` |
| 9. Omni Print desligado | Loja sem impressão direta: diálogo antigo idêntico e nenhuma chamada nova (PW17). Servidor com o recurso fechado (404 `DIRECT_PRINT_DISABLED`) ou venda fora do contrato (KG): volta ao fluxo antigo sem registrar nada (PW18) | `cupom-nao-fiscal.tsx` |
| 10. Sincronização offline (#326) | Venda pendente não abre o cupom no Histórico (`blocksConfirmedSaleAction`, já existente). Só há `vendaId` quando a venda tem linha no servidor. Erros de rede ou de sessão **não** voltam ao fluxo antigo: o painel falha fechado e oferece "Tentar de novo" | `direct-reprint-panel.tsx` |

Abrir o cupom (para ver ou copiar o resumo) não grava nada no servidor. A consulta e o registro só começam no clique em
"Reimprimir como 2ª via".

## Testes (sem hardware)

| Etapa | Resultado |
|---|---|
| Playwright (diálogo real + API real + PostgreSQL descartável + agente real com spooler simulado) | 18/18: PW1–PW11 (PDV) + **PW12–PW18** (reimpressão: térmica, navegador, venda sem via, duas abas com e sem risco, resultado incerto, recurso desligado, KG e servidor fechado) |
| Cenários PostgreSQL | 34/34, incluindo **S34**: consentimento preso ao risco, duas abas com risco, REPRINT térmico na intenção cotada, cliques simultâneos, consentimento ausente/forjado/de outro usuário, origem inválida, técnico (403), outra loja (404), via na fila substituída |
| Testes de mutação | S34 falha se o servidor ignorar a origem REPRINT e se aceitar qualquer consentimento |
| Unitários | mapper (`vendaId`), ligação das duas telas (estático), `lib/printing/direct`, agente, configurações: PASS |
| Regressão ampla (PDV, vendas, caixa, auth, configurações) | 1891 passam; as 10 falhas são as mesmas da `main` limpa (`fechamento-calculadora-modal.static`, `pdv-scan-autoclear.static`) |
| Typecheck completo / ESLint dos arquivos alterados | 0 erros / 0 erros |
| Bateria completa 004C | `evidence/battery-summary.json` |

## Revisão independente

Rodada 6 (`REVISAO_INDEPENDENTE.md`): REQUEST_CHANGES (1 P2, 10 P3) → corrigido → **APPROVE**.

## Riscos residuais

- **API do PDV:** o caminho de impressão pelo navegador do **PDV** (`origin` ausente ou `PDV`) continua aceitando `confirm: true` sem
  token. Um cliente fora da interface, com a mesma permissão, poderia imprimir pelo navegador uma venda antiga sem o
  consentimento preso ao risco. A cópia fica registrada, mas sem a marca SEGUNDA VIA quando não havia via anterior. Não
  há caminho de interface para isso. Correção sugerida para uma próxima etapa: exigir token também na origem PDV ou
  recusá-la fora da janela da 1ª via.
- **Térmica sem segundo clique:** a reimpressão térmica no painel não pede um segundo clique de confirmação (o risco é
  mostrado antes e o consentimento fica preso a ele no servidor). Com uma via em envio naquele instante, o operador vê o
  aviso, mas confirma com um clique só.
- **Restrição por navegador** (herdada do 004C): usa um identificador do `localStorage`. Evita uso acidental por outro
  navegador, não um usuário mal-intencionado no mesmo computador.
- **Outros PDVs e A4:** os demais PDVs (Supermercado, Assistência, Venda Completa) e o A4 da Venda Completa seguem o fluxo
  antigo, como aprovado em D01-A2.
- **Homologação física:** pendente (`PHYSICAL_HOMOLOGATION=PENDING`).
