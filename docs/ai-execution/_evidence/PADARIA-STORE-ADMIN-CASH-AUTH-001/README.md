# PADARIA-STORE-ADMIN-CASH-AUTH-001 — Caixa Seguro com a senha da ADMIN da loja

Data: 2026-10-28 · Branch `claude/padaria-store-admin-cash-auth-001` a partir de `main` `34b70a1` ·
sem migration · sem produção · sem Vercel.

## Problema

O Caixa Seguro (resumo, sangria, suprimento e fechamento) pedia o **PIN global de supervisor**
(`User.pin`, sem `storeId`). Para fechar o caixa, a padaria precisaria conhecer o mesmo segredo das
contas internas. Além disso, a proteção era **só visual**: `POST /api/ops/caixa/fechar` fechava para
qualquer sessão com `pdv.fecharCaixa`. O próprio teste do piloto provava que o CAIXA fechava direto
pela API.

## Decisão implementada

| Quem | Resumo / sangria / suprimento / fechar |
| --- | --- |
| ADMIN com `accessScope` STORE | Confirma a **senha de login da própria conta**; o servidor emite uma autorização curta |
| CAIXA / OPERADOR / GERENTE / VENDEDOR STORE | Não recebe autorização; a tela orienta chamar a administradora e o servidor recusa (403) |
| Conta interna legada (`accessScope` NULL) e plataforma | **Inalterado**: diálogo de PIN e nenhuma exigência nova no servidor |

## Como funciona

1. `POST /api/auth/store-admin-reauth` com `{ password, sessaoId }` e o header da loja. A rota confere:
   - módulo `cash` e sessão NextAuth (o `jwt` já relê `active` e `sessionVersion`);
   - que a conta é ADMIN STORE; CAIXA STORE e contas legadas recebem 403 sem comparação de senha;
   - `storeId`, segredo do servidor e rate limit (5 tentativas por 15 min, balde por `userId`);
   - `canAccessStore` e, no banco, vínculo, `active`, `mustChangePassword`, `sessionVersion`, papel e escopo;
   - sessão de caixa ABERTA desta loja;
   - bcrypt contra `AdminUser.password`.
2. Em sucesso, grava o cookie httpOnly `assistec_store_admin_reauth` (SameSite=strict). O token é
   HMAC com chave derivada do schema `omni.store.admin-reauth/v1` e vale 15 min. Ele fica preso a
   `userId`, `storeId`, ação `caixa_seguro`, `resource` = `sessaoId` e `sv` = `sessionVersion`.
3. `storeAdminCashApprovalDenied` roda em `fechar` e em `operacao` (só sangria e suprimento):
   - sessão STORE sem esse token, ou com token de outra loja, sessão, usuária ou versão: **403**;
   - funcionário STORE: **403** mesmo carregando o cookie da administradora.

   O cookie do PIN (`assistec_admin_session`) não é aceito: o domínio criptográfico é outro.
4. Respostas sem enumeração. Senha errada, conta inativa, troca pendente, sessão revogada e papel
   alterado devolvem o mesmo `401 { error: "invalid_credentials" }`, com bcrypt de custo 12 também
   no caminho sem hash.
5. Auditoria em `logs_auditoria`: `CAIXA_SEGURO_ADMIN_LOJA_AUTORIZADO`, `_RECUSADO` e `_BLOQUEADO`.
   Registra só ids e `ipHash`; nunca a senha, o hash ou o token.
6. Interface:
   - a `CaixaStatusBar` escolhe o diálogo pela sessão. ADMIN STORE vê "Senha da administradora";
     funcionário STORE vê uma orientação, sem campo; contas legadas veem o `SupervisorGateDialog`
     de sempre. Enquanto a sessão carrega, nenhum gate abre;
   - a senha é apagada do estado no envio, no erro, no cancelamento e no fechamento;
   - a aprovação é revogada (`DELETE`) em quatro momentos: em "Ocultar"; quando o resumo se
     esconde sozinho sem ação em curso; quando o modal de fechamento ou de sangria/suprimento
     fecha com o resumo já escondido; e quando a barra sai da tela;
   - se o `sessaoId` local se perdeu, o diálogo usa a sessão ABERTA do terminal no servidor (a
     mesma reconciliação do modal de fechamento);
   - o PDV Black usa a mesma troca de diálogo.
7. Fila local de sangria/suprimento (achado P1 da revisão). A fila é por loja, não por usuário:
   reenviá-la depois deixaria uma operação antiga ou forjada no storage aproveitar a próxima
   aprovação. Na experiência STORE, e enquanto a sessão carrega:
   - a operação é **online-only**. Se falha, sai da fila e do total local, e a tela diz
     "não registrada";
   - não há reenvio automático;
   - pendências antigas de sangria/suprimento são descartadas ao carregar.

   Contas legadas mantêm a fila e o reenvio como antes.

## Validação

| Gate | Resultado |
| --- | --- |
| Testes novos (token, guard, rota, cliente da operação, diálogo) | 32 testes em 5 arquivos, todos passam |
| Suítes vizinhas (caixa, auth, PDV, `app/api/ops/caixa`) | Mesmas 210 falhas, por nome, da `main` `34b70a1` limpa (ambiente: `localStorage` indefinido no jsdom com Node 26, `next/server` pela junction, marketplace). Nenhuma falha nova; 989 testes passando contra 957 na base |
| `npm run typecheck` | exit 0 |
| ESLint nos arquivos tocados | 0 erros. 1 aviso já existente em `PdvBlackEdition.tsx:218`, fora do diff |
| `npm run build` | "Compiled successfully"; rota `ƒ /api/auth/store-admin-reauth` presente |
| E2E do piloto local (PG 17 descartável na 55443, NextAuth real, `next start`) | **41/41** (rodada final, após todas as correções); `01-e2e-piloto-local.txt` |
| Revisão independente (subagente, só leitura) | 1ª: REQUEST_CHANGES (1 P1, 4 P2, 3 P3). 2ª, após as correções: **APPROVE** (5 P3 sem bloqueio; 3 corrigidos, 2 documentados abaixo) |

A E2E roda pela tela. Em `caixa-seguro-store.spec.ts`:
- **ADMIN STORE:**
  - fechar pela API sem aprovação → 403;
  - Resumo do Caixa → diálogo sem PIN → senha errada mostra "Senha incorreta." e limpa o campo;
  - senha certa → o resumo aparece;
  - aprovação revogada → a sangria é recusada ("não registrada") e o resumo se esconde;
  - nova aprovação → sangria de R$ 7 registrada;
  - depois de um ciclo de reenvio de 30 s, continua existindo só **1** sangria;
  - fechamento com R$ 43 contados → `FECHADA`;
  - a auditoria tem 2 autorizações e 1 recusa, sem senha.
- **CAIXA STORE:** o diálogo só orienta (sem campo nem PIN); fechar e reautenticar pela API → 403;
  a sessão continua `ABERTA`.
- **Conta interna legada:** o diálogo de PIN continua aparecendo.

Em `access.spec.ts` (o caso do piloto foi ajustado):
- **CAIXA STORE:** fechar → 403; sangria → 403; reautenticar → 403;
- **ADMIN STORE:** fechar sem aprovar → 403; senha errada → 401; loja B → 403;
- a sessão continua ABERTA até a ADMIN aprovar e fechar (200).

Telas em `telas/`.

## Limitações conhecidas (fora do escopo, não corrigidas)

1. **Outras aprovações STORE ainda pedem o PIN global**: cancelar venda, correções de venda,
   desconto no pagamento e estorno da conferência. Elas usam `/api/auth/admin` ou `supervisorPin`
   no corpo. Na padaria essas ações ficam inalcançáveis, porque a cliente não tem o PIN. Mudar isso
   é outra GOAL.
2. **Ver o resumo é proteção de tela**: `GET /api/ops/caixa/sessao-detalhe` continua legível por
   funcionário STORE. Isso já era assim com o PIN. Fechamento, sangria e suprimento são protegidos
   no servidor.
3. **Rate limit em memória, por instância**: o motor `lib/contador/auth/rate-limit.ts` é o mesmo do
   PIN. A tentativa conta antes de qualquer `await`, então rajada paralela não fura o limite na
   instância. Recusas que não chegam ao bcrypt (por exemplo, 409 de caixa já fechado) também contam.
4. **Um cookie de aprovação por navegador**: aprovar outra loja ou sessão em outra aba invalida a
   anterior. Com a fila online-only, isso não deixa operação presa.
5. **Resposta perdida**: se o servidor gravar a sangria mas a resposta não chegar, a tela diz "não
   registrada". A mensagem orienta conferir o resumo antes de repetir; repetir gera outro `localId`.
6. **Tela legada**: `devolucao` em `/api/ops/caixa/operacao` segue sem esse guard. Não entra no
   resumo do Caixa Seguro.

## Para liberar a padaria

Esta PR remove o bloqueio B2 (PIN global) do fechamento de caixa. Os bloqueios B1 e B3 da
FASTTRACK-002 continuam:
- **B1:** confirmar o writer v2 e provisionar o código de numeração;
- **B3:** provisionar a loja e a conta ADMIN da padaria em produção.

Também falta revisão e merge humanos, deploy autorizado e o teste do primeiro dia: abrir, vender e
fechar o caixa com a senha da administradora.
