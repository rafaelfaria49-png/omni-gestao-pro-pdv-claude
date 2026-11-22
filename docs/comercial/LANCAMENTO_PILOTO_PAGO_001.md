# Lançamento comercial do piloto "Vendas e Estoque" — matriz de decisão

GOAL `OMNI-SAAS-LANCAMENTO-COMERCIAL-PILOTO-001` · 2026-11-22.

- **Base:** `origin/main` = `8286a4a` (#387). **Production** (`omni-gestao-pro`) = `8286a4a`, deploy `success` 2026-11-22 15:15 UTC.
- **Branch de integração:** `claude/saas-lancamento-piloto-001` = main + #343 + #344 + #376 + as correções desta missão. Sem conflito.
- Nenhum dado real foi lido para escrita, nenhuma loja/venda criada, nenhum merge ou deploy.
- PRs KG #315/#335/#336/#337 e financeiras (#341/#384/#388) **não** foram tocadas nem integradas.

Complementa: `GESTAO_LOJAS_MATRIZ_RECURSOS.md`, `GESTAO_LOJAS_OPERACAO_PILOTO.md`,
`PRIVACIDADE_TERMOS_PROPOSTA_PILOTO.md`, `SAAS_AUTOMATICO_PROPOSTA.md`.

---

## A) PRs prontas para merge (ordem recomendada)

| Ordem | PR | O que resolve | Revisão desta missão | Ressalva |
|---|---|---|---|---|
| 1 | #343 `fix(ops)` loja legada | Antes da loja ativa resolver, o `OperationsProvider` lia (e podia gravar ordens, livro diário e reenviar fila) na **`loja-1`** com outra loja selecionada | **APROVADA.** Porta `storageKey !== OPS_KEY_LEGACY` em 5 efeitos; `loja-1` real usa `assistec-pro-ops-v1-loja-1` (não é afetada); fila local preservada | CI verde é de 2026-11-10 (138 commits atrás); revalidada nesta integração |
| 2 | #344 `fix(onboarding)` "Voltar depois" | Assistente reabria a cada recarga/navegação | **APROVADA.** `sessionStorage` por usuário+sessão+loja; o assistente só existe com cadastro **incompleto**, então não aparece depois da configuração | Banner "Retomar configuração" segue visível enquanto faltar dado básico (intencional) |
| 3 | #376 `feat(comercial)` atendimento | Pedido → provisionamento → loja na **mesma transação**; contato com o interessado; instruções sem senha | **APROVADA.** Email do pedido checado no servidor; corrida → 1 conta; pedido encerrado → nada criado | Texto do doc dizia "a conta continua criada" se o vínculo falhar — corrigido aqui (é atômico) |
| 4 | PR desta missão | `/suporte` sem contato fictício; botão "Falar com Especialista" sem `wa.me/5500000000000`; E2E de cliente independente; documentos | ver validação abaixo | Depois de 1–3, o diff dela fica só com os commits próprios |
| — | #345 `fix(auth)` logout verificado | Corrida no logout (SEC-342) | fora do escopo; CI verde antigo | recomendada para o mesmo ciclo |

**Validação na integração (local, Windows):** `npm run typecheck` 0 erros · ESLint limpo nos arquivos tocados ·
Vitest 283/283 (`lib/comercial`, `lib/auth`, onboarding, loja resolvida, pilot-access, `/suporte`) com Node 22
(Node 26 quebra `localStorage.clear` em jsdom — limitação da máquina, não do código).
**Build e E2E autenticado** rodam na CI (`platform-pilot.yml`, PostgreSQL descartável) — ver o PR.

## B) Fluxo completo do primeiro cliente

| Passo | Quem | Onde | Coberto por E2E (PG descartável) |
|---|---|---|---|
| 1. Pede teste | interessado | `/gestao-lojas#solicitar` | `gestao-lojas.spec`, `jornada-cliente-independente.spec` |
| 2. Contato e aprovação | equipe | `/dashboard/plataforma` → WhatsApp/email do pedido | `gestao-lojas.spec` |
| 3. Provisiona (loja + ADMIN + pedido fechado, atômico) | equipe | "Usar no provisionamento" | ambos |
| 4. Envia instruções (sem senha) + senha em mensagem separada | equipe | "Copiar instruções" | `gestao-lojas.spec` |
| 5. Login → troca obrigatória de senha | cliente | `/login` → `/conta/seguranca` | ambos + `first-access.spec` |
| 6. Assistente de primeiro acesso; "Voltar depois" vale para a aba | cliente | `/dashboard` | `first-access.spec`, **`jornada-…`** (recarga) |
| 7. Produto UN com estoque | cliente | Cadastros | `first-access.spec` (tela), **`jornada-…`** (API) |
| 8. Abre Caixa → venda → baixa de estoque | cliente | PDV | `access.spec`, **`jornada-…`** (loja nova) |
| 9. Fecha Caixa com a própria senha (ADMIN) | cliente | Caixa | `caixa-seguro-store.spec`, **`jornada-…`** |
| 10. Relatório de produtos (tela + PDF) | cliente | Relatórios | **`jornada-…`** |
| 11. Comprovante | cliente | navegador | **`jornada-…`** prova o conteúdo; **impressão física não coberta** |
| Negativas: 2º cliente independente não cria/lê/vende/fecha/consulta relatório na loja do 1º | — | API com cabeçalho e `storeId` adulterados | **`jornada-…`** |

**Fazer junto com o cliente:** a primeira venda e o teste de impressão (impressora do cliente, pelo navegador).

## C) Recursos vendáveis por ramo

| Ramo | Classificação | Vendável no piloto | Fora / limitação |
|---|---|---|---|
| Comércio geral | **OPERACIONAL** | PDV, Caixa, Produtos UN, Estoque, Clientes, Relatórios básicos, comprovante pelo navegador | fiscal |
| Variedades / Brinquedos | **OPERACIONAL** | idem | fiscal |
| Acessórios para aparelhos | **OPERACIONAL** | idem + compatibilidade e modelo/cor de acessório | Compat profissional (#351) em draft |
| Supermercado | **PARCIAL** | idem | sem balança/peso, sem NFC-e — inviável para quem precisa de cupom fiscal no caixa |
| Padaria / Confeitaria | **PARCIAL** | só venda por **unidade** | venda por peso (kg) NÃO DISPONÍVEL (#315/#335/#336/#337 fora desta missão) |
| Agropecuária | **PARCIAL** | só por unidade | peso NÃO DISPONÍVEL |
| Moda / Vestuário | **PARCIAL** | produto simples | grade cor/tamanho NÃO DISPONÍVEL (#358 draft) |
| Assistência técnica | **PARCIAL** | balcão (vendas/estoque) | OS/Operações **não** fazem parte do pacote básico (`service` fora de `BASIC_MODULE_ACCESS`) |
| Aparelhos por IMEI | **NÃO DISPONÍVEL** | — | desligado até homologação POS-80 |
| Fiscal (NF-e/NFC-e), App Windows, IA, WhatsApp, Financeiro completo, Marketplace | **NÃO DISPONÍVEL** | — | ver `GESTAO_LOJAS_MATRIZ_RECURSOS.md` |

## D) Riscos e bloqueios obrigatórios

| # | Risco | Tipo | Mitigação |
|---|---|---|---|
| D1 | **Sem emissão fiscal.** Varejo que vende a consumidor geralmente precisa de NFC-e/SAT (exceção usual: MEI) | **Bloqueio comercial** | Vender só para quem já tem emissor próprio ou é dispensado — declarar no contrato (validar com contador) |
| D2 | `/suporte` em Production mostra `(00) 00000-0000` e `suporte@seudominio.com.br` (conferido 2026-11-22) | **Bloqueio** | corrigido no PR desta missão; precisa de merge + `GESTAO_LOJAS_CONTATO_*` real na Vercel |
| D3 | Isolamento: efeitos do Operações falando com `loja-1` antes de a loja resolver | **Bloqueio** | #343 |
| D4 | Limite de usuários por plano não existe | Bloqueio p/ diferenciar planos | vender **um** plano só no piloto, ou regra contratual |
| D5 | Cobrança e inadimplência manuais | Operacional | régua manual + "Liberação por loja"; nada automático |
| D6 | Política de privacidade genérica, sem retenção/exclusão; sem termos publicados | Jurídico | `PRIVACIDADE_TERMOS_PROPOSTA_PILOTO.md` → aprovação humana |
| D7 | Primeira venda de loja nova já travou (FASTTRACK-002) | Operacional | primeira venda acompanhada; E2E novo cobre loja nova |
| D8 | Impressão física (POS-80/USB) só pelo navegador; app Windows não distribuído | Operacional | testar a impressora do cliente no onboarding |
| D9 | Banco único para todos os clientes | Operacional | backup/restore Neon; plano de incidente |
| D10 | Exclusão de dados só manual no banco | Jurídico | procedimento com backup e registro até existir ferramenta |
| D11 | `WHITELABEL_TELEFONE_PADRAO = "(00) 00000-0000"` (`lib/config-empresa.tsx`) pode aparecer em documento da loja sem telefone | Baixo | o assistente exige telefone; conferir no 1º comprovante |

### Controle manual de pilotos (item 8)

Não há onde registrar piloto no banco que sirva: `Store.subscriptionPlan` é o catálogo antigo
(`BRONZE…DIAMANTE`) e a assinatura Stripe fica no `AdminUser`. **Não** foi implementado bloqueio.
Recomendação para os primeiros clientes: planilha controlada pelo proprietário, uma linha por loja:

| Campo | Fonte |
|---|---|
| protocolo `GL-…` e `storeId` | histórico do pedido (gravado pelo #376) |
| início / fim do piloto | contrato |
| responsável interno | equipe |
| situação (`em teste` · `pago` · `atrasado` · `restrito` · `encerrado`) | equipe |
| plano proposto e valor | contrato |
| acompanhamento (data, assunto, próximo passo) | equipe |

Se houver mais de ~10 pilotos, virar a tabela aditiva `PilotoComercial` (fase S1 da proposta automática).

## E) Custos e decisões comerciais pendentes (proprietário)

| Decisão | Estado | Onde aplicar |
|---|---|---|
| Contato real de suporte e comercial (WhatsApp 55+DDD, email) | **não fornecido** | Vercel: `GESTAO_LOJAS_CONTATO_WHATSAPP`, `GESTAO_LOJAS_CONTATO_EMAIL` + redeploy |
| Preço do piloto (propostos R$ 39,90 / 69,90 / 99,90 **não aprovados**) | pendente | contrato; página só com `GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1` |
| Limite de usuários | pendente (sistema não aplica) | contrato agora; código depois (§7 do doc de operação) |
| Forma e dia de cobrança, carência, régua de inadimplência | pendente | contrato |
| Horário e prazo de resposta do suporte | pendente | `/suporte`, contrato |
| Razão social/CNPJ do operador, prazos de retenção | pendente | `/privacy` |
| Custos fixos (Vercel, Neon), taxa de cobrança, impostos, horas de suporte por cliente | **não há dado no repositório** — não estimado | planilha do proprietário |
| Público-alvo vs. fiscal (MEI / quem já tem emissor) | pendente | landing + contrato |

## F) GO / NO-GO para piloto pago

**NO-GO hoje** (Production `8286a4a`). **GO condicionado** quando todos abaixo forem verdade:

1. Merge de #343, #344, #376 e do PR desta missão, com CI verde **na main do momento** e Preview conferido.
2. Contato real configurado na Vercel (D2) — a `/suporte` deixa de mostrar contato fictício só com o merge; o contato aparece só com a variável.
3. Proprietário aprova: preço de **um** plano, limite contratual de usuários, cobrança manual, suporte.
4. Privacidade atualizada e termos aprovados (D6).
5. Regra fiscal explícita no contrato e na conversa comercial (D1).
6. Teste real em Production pelo proprietário (roteiro §2 de `GESTAO_LOJAS_OPERACAO_PILOTO.md`), com autorização para criar a loja de teste.

Ramos para os primeiros clientes: **Comércio geral, Variedades e Acessórios**. Padaria/Agro/Moda
só se o cliente aceitar venda por unidade e produto simples.

## G) Backlog separado — SaaS 100% automático

Detalhe em `SAAS_AUTOMATICO_PROPOSTA.md`. Resumo:

| ID | Item | Depende de |
|---|---|---|
| G-01 | `Organization` + `Store.organizationId` (aditivo; lojas atuais = NULL) | autorização de schema |
| G-02 | Limite de usuários por plano no servidor | G-01, preços |
| G-03 | `Subscription` + `BillingEvent` idempotente por organização | provedor de cobrança |
| G-04 | Teste grátis controlado (prazo no servidor, 1 por email/documento, só-leitura ao vencer) | prazo aprovado |
| G-05 | Cadastro self-service com verificação de email e antiabuso | G-03, G-04, termos |
| G-06 | Inadimplência: aviso → só leitura na próxima abertura de caixa | régua aprovada |
| G-07 | Registro de pilotos no banco (`PilotoComercial`) | G-01 |
| G-08 | Encerrar loja / exportar dados | retenção aprovada |
| G-09 | Exclusão de dados por titular/organização com auditoria | G-08 |
| G-10 | Expurgo de pedidos descartados | retenção aprovada |
