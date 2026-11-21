# Vendas e Estoque — operação comercial dos primeiros clientes

GOAL `OMNI-SAAS-CAPTACAO-COMERCIAL-PILOTO-002` · auditoria de 2026-11-19 sobre `main` `d27d969`
(#374 e #375 integradas). Complementa `GESTAO_LOJAS_MATRIZ_RECURSOS.md` e
`GESTAO_LOJAS_PROCEDIMENTO_MIGRATION.md`.

Nada aqui liga cobrança, altera Stripe, publica preço ou cria registro em Production.

## 1. O que está no ar (auditoria só de leitura, 2026-11-19)

| Item | Production (`omni-gestao-pro.vercel.app`) | Evidência |
|---|---|---|
| Página `/gestao-lojas` | 200, pública | `curl` |
| Preços | ocultos (o único "R$" é o comprovante fictício R$ 62,30) | HTML publicado |
| Download Windows | desligado: "Download ainda não liberado" (`span aria-disabled`, sem link) | HTML publicado |
| Contato direto | nenhum telefone/email exibido; texto honesto "canais enviados no contato da equipe" | HTML publicado |
| `POST /api/comercial/solicitacoes-teste` | só POST (GET = 405); 400 com campo inválido sem gravar | #374 |
| Caixa de pedidos `GET /api/platform/solicitacoes-teste` | 403 sem sessão | `curl` |
| `/dashboard/plataforma` | 307 → `/login` sem sessão | `curl` |
| Migration `20261118120000_solicitacoes_teste_comercial` | aplicada (30/30) em 2026-11-19, tabela vazia | memória do #374 |
| Política de privacidade `/privacy` | 200, genérica (não cita o formulário comercial) | ver §6 |

Garantias do código (testadas em `lib/comercial/solicitacao-teste.test.ts` e `e2e/platform-pilot/gestao-lojas.spec.ts`):

- **Protocolo** só aparece depois que a linha existe no banco (`GL-XXXX-XXXX`).
- **Idempotência:** mesmo email com pedido aberto devolve o mesmo protocolo (UNIQUE `emailAberto`, sem corrida).
- **Antispam:** campo-isca `site`; corpo > 8 KB recusado; 5 pedidos/hora por origem (HMAC do IP, IP cru nunca gravado); 60 pedidos/10 min no total. Contagem no banco (vale entre instâncias).
- **Consentimento:** obrigatório, gravado com data e versão (`gestao-lojas-2026-11-18`).
- **Acesso:** só sessão da plataforma (`isPlatformSession`) e sem troca de senha pendente lê ou altera pedidos.
- **Status:** `recebida → em_contato → provisionada | descartada`, com compare-and-set e histórico (`historico[]`).

## 2. Roteiro de teste real em Production (executa o proprietário)

Pré-requisito: um email que o proprietário controla e que **não** é usuário do sistema
(o provisionamento recusa email já cadastrado). Não usar a RAFACELL nem a loja-2.

1. Em uma janela anônima, abrir `https://omni-gestao-pro.vercel.app/gestao-lojas#solicitar`.
2. Enviar o pedido com: seu nome, loja `TESTE PILOTO — APAGAR`, o email controlado, seu WhatsApp, tipo "Pequeno comércio", marcar o consentimento.
   - Esperado: "Pedido de teste recebido" + protocolo `GL-…`. Anotar o protocolo.
3. Reenviar o mesmo formulário com o mesmo email.
   - Esperado: "Seu pedido já estava registrado" com **o mesmo** protocolo.
4. Entrar como plataforma em `/dashboard/plataforma`. O pedido aparece em "Solicitações de teste".
   - Conferir "Abrir conversa no WhatsApp" (abre o seu número) e "Responder por email".
   - Clicar "Marcar em contato": o selo muda para "Em contato".
5. **Decisão:** parar aqui e clicar "Descartar" (teste sem criar loja) **ou** seguir para o 6.
   - Seguir cria uma loja e um usuário reais em Production. Só com autorização expressa.
6. "Usar no provisionamento" → conferir "Ligado ao pedido GL-…" → "Provisionar cliente".
   - Esperado: senha temporária, instruções de entrada (sem a senha) e o aviso "Pedido GL-… marcado como acesso liberado". O pedido some da caixa.
7. Em outra janela anônima, entrar com o email controlado e a senha temporária.
   - Esperado: o sistema leva a `/conta/seguranca` e exige senha nova; depois, o assistente de primeiro acesso.
8. Conferir que a loja nova só vê os próprios dados (seletor de loja com uma unidade só).
9. Depois do teste, **desativar** o usuário de teste (Configurações → Usuários) e anotar o `storeId`
   para limpeza autorizada. Nenhum dado é apagado automaticamente.

Consulta de conferência (somente leitura, role RO):

```sql
SELECT protocolo, status, "emailAberto" IS NULL AS encerrado, historico
FROM solicitacoes_teste_comercial WHERE protocolo = 'GL-XXXX-XXXX';
```

## 3. Atendimento comercial — passo a passo da equipe

| Etapa | Onde | O que fica registrado |
|---|---|---|
| Interessado envia pedido | `/gestao-lojas` | linha nova, status `recebida`, consentimento + versão |
| Plataforma recebe | `/dashboard/plataforma` → "Solicitações de teste" | lista dos pedidos abertos (até 500, mais novos primeiro) |
| Equipe consulta os dados | mesmo cartão: loja, nome, email, WhatsApp, ramo, mensagem | — |
| Equipe entra em contato | "Abrir conversa no WhatsApp" / "Responder por email"; depois "Marcar em contato" | `em_contato` + quem marcou + quando |
| Equipe aprova | decisão humana no contato (impressora, ramo, tamanho da loja) | — |
| Provisiona acesso assistido | "Usar no provisionamento" → "Provisionar cliente" | loja + ADMIN local com `mustChangePassword`; pedido vira `provisionada` com `storeId` e `userId` no histórico, na mesma transação da loja (pedido já encerrado = nada é criado; dois operadores no mesmo pedido = uma conta só) |
| Cliente recebe instruções | "Copiar instruções" (sem senha) + senha temporária em mensagem separada | — |
| Cliente acessa | `/login` → troca obrigatória de senha → assistente de primeiro acesso | — |
| Descartar | "Descartar" | `descartada`; o mesmo email pode pedir de novo (protocolo novo) |

**Novo nesta entrega:** antes, provisionar e marcar o pedido eram cliques separados e o pedido
não guardava qual loja tinha sido criada. Agora o provisionamento feito a partir de um pedido
fecha o pedido e grava `storeId`/`userId` no histórico. Se a marcação falhar (ex.: pedido
descartado por outra pessoa no meio), a conta continua criada e a tela avisa para marcar à mão.

Contato comercial da página: só aparece com `GESTAO_LOJAS_CONTATO_WHATSAPP` (12–13 dígitos,
com 55) e/ou `GESTAO_LOJAS_CONTATO_EMAIL` na Vercel. A página é estática: mudar a variável
exige redeploy. **Nenhum valor foi configurado** — depende do proprietário fornecer o contato real.

## 4. Liberação de clientes piloto — checklist

| Item | Estado no código | Evidência |
|---|---|---|
| Isolamento de lojas | OK: loja nova `cliente-<uuid>`, ADMIN com `accessScope: STORE` e vínculo só com ela | `lib/auth/provision-client.ts`; E2E `access.spec.ts` (gestor A não vê B) |
| Usuário administrador inicial | OK: um ADMIN local, criado na mesma transação da loja | E2E "provisionamento atômico" |
| Troca obrigatória de senha | OK: `mustChangePassword: true`; proxy só libera `/conta/seguranca` | E2E "senha temporária exige troca própria" |
| Onboarding | OK: assistente de primeiro acesso (`components/onboarding/first-access-wizard`) | E2E `first-access.spec.ts` |
| Permissões | OK: ADMIN local não promove ADMIN/GERENTE/SUPER_ADMIN | `assertActorMayAssignRole` |
| Seleção de loja | OK: só as lojas do vínculo | E2E `client-experience.spec.ts` |
| Recursos disponíveis | `BASIC_MODULE_ACCESS`: início, PDV, vendas, caixa, cadastros, estoque, relatórios, configurações | `lib/auth/access-policy.ts` |
| Funções experimentais | fora do pacote básico: IA, agente, marketing, marketplace, contador, WhatsApp, financeiro completo, fiscal, experimentos | idem; liberar só por "Liberação por loja" |

Atenção no piloto:

- O ramo padaria provisiona normalmente, mas venda por peso (kg) **não** está liberada. Ofertar padaria só com venda por unidade.
- Roupas: grade de tamanho/cor não liberada.
- A primeira venda de loja nova já travou no passado (go-live padaria FASTTRACK-002). Fazer a primeira venda **junto com o cliente**.
- Impressão: navegador. O app Windows não está distribuído.

## 5. Mensalidades — auditoria dos preços propostos

| Plano | Proposto | Pessoas (proposta) | Por pessoa |
|---|---|---|---|
| Essencial | R$ 39,90 | 1 | R$ 39,90 |
| Comércio | R$ 69,90 | 2 | R$ 34,95 |
| Comércio Plus | R$ 99,90 | 3 | R$ 33,30 |

Custos a levantar (sem dado no repositório; **não estimados aqui** para não inventar número):

- Infraestrutura fixa: Vercel (plano do time) e Neon (computação + armazenamento). O custo por loja
  é marginal enquanto a base for pequena; o custo fixo é que precisa ser coberto.
- Taxa da cobrança: ainda não escolhida (Stripe cobra por transação; boleto/Pix têm tarifa própria).
- Suporte humano: provisionamento é assistido e a primeira venda é acompanhada → é o maior custo por cliente no piloto.
- Impostos sobre a receita (regime do proprietário).

Riscos de operação:

1. **Planos sem diferença técnica.** Hoje os três entregam o mesmo pacote; sem limite real, "1/2/3 pessoas" é promessa sem freio.
2. **Cobrança manual.** Sem automação, inadimplência e corte de acesso dependem da equipe (há "Liberação por loja" para restringir módulos; não há bloqueio por falta de pagamento).
3. **Promessa de teste grátis.** O Stripe antigo cria `trial_period_days: 14`; a landing antiga fala 7 dias. A página nova não promete prazo — manter assim.
4. **Suporte da primeira venda** e compatibilidade de impressora consomem tempo por cliente.
5. Base de dados única: incidente afeta todos os clientes (backup Neon por ponto de restauração).

## 6. Privacidade

O consentimento do formulário aponta para `/privacy`, que é genérica: não descreve o formulário
comercial (finalidade: contato sobre o teste; dados: nome, loja, email, WhatsApp, ramo, mensagem;
retenção; como pedir exclusão). Proposta de texto para o proprietário validar — **não publicada**:

> **Pedido de teste da página Vendas e Estoque.** Quando você pede um teste, guardamos nome,
> nome da loja, email, WhatsApp, tipo de loja e a mensagem que você escrever, com a data do seu
> consentimento. Usamos esses dados só para falar com você sobre o teste e liberar o acesso.
> Guardamos um código da sua conexão (não o endereço) para evitar envios em massa.
> Para pedir correção ou exclusão, escreva para o contato desta página.

O prazo de retenção dos pedidos descartados precisa de decisão do proprietário (hoje não há expurgo).

## 7. Limite de operadores por plano — proposta de implementação (não implementada)

Onde o número de pessoas muda hoje:

- `POST /api/admin/users` — cria usuário (ADMIN local cria CAIXA/VENDEDOR/OPERADOR/TECNICO).
- `PATCH /api/admin/users/[id]` — reativa (`active: true`), troca `lojaId` ou as lojas do usuário.
- `lib/auth/provision-client.ts` — cria o ADMIN inicial (conta como 1).

Proposta segura e compatível:

1. **Dado:** limite por loja em campo novo e opcional (`Store.operatorLimit Int?`), via migration
   aditiva com prefixo novo. `NULL` = sem limite → **todas as lojas atuais (RAFACELL, loja-2 e
   pilotos) continuam exatamente como estão.** Exige autorização de schema + aplicação da migration
   antes do merge (mesmo procedimento do #374).
2. **Contagem:** usuários `active = true`, `accessScope = STORE`, ligados à loja por `lojaId` ou
   `adminUserStores`, incluindo o ADMIN. Contas da plataforma nunca contam.
3. **Verificação no servidor** (nunca só na tela) em criar, reativar e mudar de loja, dentro de
   transação com `pg_advisory_xact_lock(hashtext(storeId))` — evita dois cadastros simultâneos
   passando do limite sem usar SERIALIZABLE (que colide em tabela pequena, ver memória do DP).
4. **Excesso existente:** baixar o limite **não** desativa ninguém; só impede novos/reativações.
5. **Tela:** "Usuários" mostra "2 de 3 pessoas do plano" e explica o bloqueio em português;
   a plataforma ajusta o limite em "Liberação por loja".
6. **Testes:** unidade da contagem; E2E criar até o limite, recusar o próximo, reativar recusado,
   dois POST simultâneos → só um passa; loja com `NULL` sem mudança.

Esforço estimado: 1 PR com migration aditiva + 2 rotas + 1 tela + testes. Bloqueio: autorização de schema.
