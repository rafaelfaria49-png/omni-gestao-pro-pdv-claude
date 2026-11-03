# CAUSA_RAIZ — PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001

Base: `main` @ `a07e067` (merge da #325; #324 = `4946688`). Auditoria feita no código real
(`lib/operations-store.tsx`, `lib/vendas/*`, `components/dashboard/vendas/*`, rotas `app/api/ops/*`).
Nenhuma leitura ou escrita em produção. A venda real da RafaCell (≈ R$ 119,98) **não** foi tocada.

| # | Sintoma relatado | Causa raiz comprovada no código | Camada |
|---|---|---|---|
| RC1 | "Reenviar não faz nada", tentativas sem resultado | Nenhuma escrita/consulta de venda tinha prazo (`fetch` sem `AbortController`). Em Wi-Fi sem internet / servidor travado a requisição ficava pendurada; o Reenviar manual se juntava à MESMA promessa pendurada (`persistInFlightRef`) e a finalização ficava em "Finalizando…". | Rede/cliente |
| RC2 | Resultado do Reenviar some | O desfecho só existia num toast (`TOAST_LIMIT = 1`, 5 s, substituído por qualquer outro toast). Para erro determinístico (ex.: 409) o banner ficava idêntico → parecia inerte. | UI |
| RC3 | Venda "sincronizada" sem estar | `persistPendingSale` marcava confirmada em **qualquer 2xx**, mesmo sem a venda no corpo (portal cativo de Wi-Fi, proxy, resposta truncada). O caminho de fallback V1 nem lia o corpo. | Cliente |
| RC4 | Venda offline sumindo | `findMatchingPendingSale` + mapa de tentativas persistido coalesciam uma finalização com **qualquer** pendente de mesma "impressão" (itens+total+pagamento). Offline todas ficam pendentes: a 2ª venda idêntica (padaria: dois pães, dinheiro) retornava a 1ª e era perdida — sem estoque, sem caixa. | Cliente |
| RC5 | Pendência some com 2 abas | Cada aba gravava o blob inteiro de `localStorage`; a aba que não conhecia a venda nova sobrescrevia a gravação da outra (o listener de `storage` só propagava códigos de quarentena). | Persistência |
| RC6 | Fila para de gravar | Blob corrompido: a gravação fazia `JSON.parse` do valor atual dentro do `try` e, ao falhar, **nunca mais gravava** (erro engolido). Quota esgotada também era engolida — venda só na memória, sem aviso. | Persistência |
| RC7 | Venda perdida ao fechar a aba | A venda só ia para o `localStorage` no efeito do próximo render, **depois** do 1º `fetch` sair. Fechar/travar a aba nesse intervalo perdia a venda (só o mapa de tentativas era síncrono). | Persistência |
| RC8 | Pendência travada após login | 401 sem `code` virava ACTION_REQUIRED genérico; o reenvio automático nunca voltava, nem depois de entrar de novo. 403 idem. | Auth/cliente |
| RC9 | Reconexão lenta / polling | Retry fixo (30 s + foco + `online`) sem backoff nem coordenação entre abas; `navigator.onLine` era o único sinal de conexão. | Cliente |
| RC10 | Fechamento de caixa mascarando diferença | Fechar o caixa com vendas da sessão não confirmadas não avisava: elas não entram no fechamento do servidor. | UI/caixa |

**Incidente RafaCell (referência sintética):** a venda ficou PENDING por `PRODUTO_NAO_RESOLVIDO`
(SKU renomeado antes da sincronização) — corrigido na #324 (`produtoId`). Os "reenvios sem efeito"
eram RC2 (mesmo 409, banner idêntico, toast efêmero). Com esta entrega o resultado de cada tentativa
fica gravado na venda e visível no painel.

Não confirmado como causa: servidor não idempotente — **falso**. `@@unique([storeId, clientSaleId])`
+ replay em `P2002` já garantiam uma venda por identidade (provado em PostgreSQL real, ver
`RESULTADOS_DB_E_API.md`).
