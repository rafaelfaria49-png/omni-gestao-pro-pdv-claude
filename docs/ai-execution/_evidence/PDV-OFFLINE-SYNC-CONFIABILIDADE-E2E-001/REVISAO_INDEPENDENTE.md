# REVISAO_INDEPENDENTE

## Rodada 1 — commit `15323ff`
- **Revisor:** subagente independente (sessão separada, somente leitura), instruído a caçar perda de venda,
  duplicação, confirmação falsa, loops, locks, isolamento, autenticação, validade dos testes e seletores do E2E.
- **Execução real do revisor:** leu o diff completo e rodou 4 suítes (97 testes, todos PASS) com Node 22.
- **Veredito:** **REQUEST_CHANGES** (1 P0, 3 P1, 7 P2).

| # | Sev. | Apontamento | Tratamento | Prova |
|---|---|---|---|---|
| 1 | P0 | Lápide só filtrava o que entrava do storage: a aba B que adotou a pendência X a mantinha, regravava e reenviava depois que a aba A a recusou/descartou → venda fantasma/duplicada | `dropTombstonedPending` aplicado na hidratação, na gravação, na adoção, no evento `storage` (inclusive da chave de lápides), no `latestPendingSale` e no reenvio automático; a tentativa aberta na própria aba é preservada | componente **REV-P0** (2 abas: adota, A recusa, B larga, nenhum POST de X, storage limpo) |
| 2 | P1 | E2E 10 esperava "NÃO gravada" mas a falha offline marcava "resultado desconhecido" | novo `syncResultUnknown`: só rede com navegador online, prazo, 5xx e 2xx sem prova criam dúvida; navegador offline = "nada saiu" (`SEM_CONEXAO`); recusa de negócio do writer zera | motor `nextResultUnknown`; componente T04/T56 |
| 3 | P1 | Duas abas regravando o storage uma da outra sem fim | evento `storage` devolve o MESMO estado quando nada muda (`sameRefs`); gravação pulada quando o serializado é igual ao gravado | componente **REV-P1** (5 eventos iguais → 0 gravações) |
| 4 | P1 | Lápide de venda V1 pelo `VDA-…` (reaproveitado por `nextSaleId`) apagaria a venda nova de mesmo número; casamento só por id substituía pendente por confirmada de outra venda | chave entre abas = `clientSaleId`; sem ela, `id@at` (`crossTabSaleKey`) — usada no merge, no drop e na lápide | motor "V1 sem clientSaleId…" |
| 5 | P2 | 1 resposta 5xx bloqueava crédito/a prazo por 2 min | só rede/prazo contam como "servidor inacessível"; qualquer resposta HTTP = alcançável | diff `noteServerReachability(true)` |
| 6 | P2 | "Nada foi enviado" afirmado para todo erro de rede | `SEM_CONEXAO` só com navegador offline (ou consulta prévia que falhou, quando de fato não houve POST); demais = `SEM_RESPOSTA` (desconhecido) | motor "desfecho da tentativa" |
| 7 | P2 | F5 + carrinho idêntico a uma venda com resposta perdida criaria duplicata (antes reaproveitava a identidade) | trava: venda idêntica pendente com resultado DESCONHECIDO (≤ 10 min) e carrinho não encerrado conscientemente → recusa com orientação "Reenviar para verificar"; Cancelar/Limpar libera (cliente novo) | componente **REV-P2-7** (barra, Reenviar reconcilia, depois vende) |
| 8 | P2 | Black Edition não liberava a tentativa | `releaseSaleAttempt` no Cancelar da Black | diff `PdvBlackEdition.tsx` |
| 9 | P2 | Merge O(n·m) a cada mudança de estado | índice por `Map` | diff `mergeSalesFromOtherTab` |
| 10 | P2 | Espera do lock (30 s) menor que o pior caso; mensagem dizia "outra aba" | `SALE_LOCK_WAIT_MS` = 85 s (verificar+enviar+verificar+fallback V1+verificar); mensagem "nesta ou em outra aba" | diff |
| 11 | P2 | Confirmação adotada de outra aba não aplica efeitos locais (totais locais divergem até recarregar) | **aceito como risco** — fechamento e resumo do caixa usam o servidor (`useCaixaResumo`) | `RISCOS_REMANESCENTES.md` |

## Achado adicional do CI (E2E 10, rodada 1) — corrigido
Offline, o `SessionProvider` do NextAuth refazia `/api/auth/session` a cada 30 s; a falha de rede virava sessão
`null` e o `WorkspaceAccessBoundary` trocava o dashboard inteiro por **"Sua sessão foi encerrada"** — o PDV sumia
no meio da operação offline (snapshot do artefato do CI). Correção **somente no cliente**
(`components/auth/SessionProvider.tsx`): poll/foco nativos desligados e revalidação própria com a mesma cadência
que **só age com resposta real do servidor** (rede fora/5xx = mantém; identidade diferente/null = NextAuth relê
pelo próprio canal e encerra como antes). Servidor, `auth.ts`, `auth.config.ts` e `proxy.ts` **inalterados**.
Provas: `SessionProvider.offline.component.test.ts` (3/3) e `SessionProvider.first-access` (1/1).
⚠️ Toca a camada de autenticação do cliente: requer **aprovação explícita do proprietário** antes do merge (CORE_RULES).

## Rodada 2 — diff `15323ff..16a2ed2`
- **Execução real do revisor:** 10 arquivos de teste, 263 testes, todos PASS (Node 22).
- **Veredito:** **REQUEST_CHANGES** (1 P1 novo, 4 P2). Todos os itens da rodada 1 confirmados como fechados
  (P0 de lápide entre abas, convergência, chave V1, desfecho honesto). Sessão: **nenhuma regressão de segurança** —
  revogação/logout seguem detectados online; entrega do `BroadcastChannel` no mesmo documento verificada no código
  do next-auth 5.0.0-beta.31; falhas de rede/5xx/corpo não-JSON são inconclusivas.

| # | Sev. | Apontamento | Tratamento | Prova |
|---|---|---|---|---|
| R2-1 | P1 | Venda legada da quarentena que GANHA a `clientSaleId` derivada passava a ter outra chave: a cópia antiga do storage voltava como "outra" venda a cada ciclo (lista crescendo até esgotar a quota) | chave secundária `id@at` indexada junto da primária no merge, no drop e na lápide | motor **REV2-P1** (5 ciclos → 1 venda) |
| R2-2 | P2 | `navigator.onLine` lido DEPOIS da falha: rede caindo após o commit virava "nada foi enviado" | medido ANTES do `fetch` (`offlineAtSend`) e propagado ao desfecho | componente **REV2-P2 rede cai depois do envio** (SEM_RESPOSTA, `syncResultUnknown`) |
| R2-3 | P2 | Trava da venda gêmea sem saída quando o servidor está fora | repetir a finalização dentro de 2 min confirma "é outro cliente" e registra com identidade nova; o aviso diz isso | componente **REV2-P2 'é outro cliente'** |
| R2-4 | P2 | Revalidação comparava só id/versão: papel/lojas/módulos ficavam velhos no cliente | compara o `user` inteiro (serialização estável; `expires` fora) | `SessionProvider.offline` "mudança de papel" |
| R2-5 | P2 | Consulta de sessão sem prazo | `AbortController` 8 s | diff |

## Rodada 3 — diff `16a2ed2..2677f78`
- **Execução real do revisor:** 7 arquivos, 113 testes, todos PASS (Node 22).
- **Veredito: APPROVE** — R2-1…R2-5 confirmados corrigidos; nada novo em P0/P1.
- P2 residuais (aceitos, em `RISCOS_REMANESCENTES.md`): (1) a confirmação "é outra venda" é implícita (repetir a
  finalização) — um operador que repete por reflexo pode criar a duplicata que a trava evita; só ocorre após F5/outra
  aba com resultado desconhecido; botão explícito "É outra venda" fica como melhoria; (2) duas gêmeas desconhecidas
  geram dois avisos seguidos (cosmético).
- Sobre a falha do piloto `client-experience.spec.ts:141` (2 h3 "Impressão operacional", um oculto) no commit
  `16a2ed2`: o revisor não encontrou caminho pelo qual o `SessionProvider` duplique ou oculte a subárvore
  (renderiza `children` uma vez; a chave só muda com a prop do servidor e o React desmonta antes de remontar;
  `goto` é carga completa). Hipótese: Suspense ocultando subárvore já renderizada (dependente de tempo).
  Resultado da reexecução no commit final: ver `RELATORIO_FINAL.md`.
