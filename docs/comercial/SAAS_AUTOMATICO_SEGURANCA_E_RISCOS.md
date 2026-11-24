# SaaS automático — segurança e riscos

GOAL `OMNI-SAAS-AUTOMATICO-ARQUITETURA-ROADMAP-000` · 2026-11-23 · base `d613656`.
Referências `C..` = matriz da auditoria; `SAAS-ADR-..` = arquitetura §12.

---

## 1. Plano de segurança

| Tema | Controle | GOAL |
|---|---|---|
| Fonte única do direito de uso | `Subscription` + `resolverEntitlement` puro; JWT só transporta o resultado; rotas críticas rechecam no banco dentro da transação | 001A / 002 |
| Isolamento multi-tenant | toda rota nova resolve `organizationId` **da sessão** (loja autorizada → `Store.organizationId`), nunca do corpo ou da URL; `requireModuleApi` continua exigindo que todo `storeId` explícito seja autorizado (C19) | todos |
| RBAC | dentro da loja: papéis existentes (`assertActorMayAssignRole`); contratar/cancelar só `ADMIN` da loja com `OrganizationMember.papel ∈ {OWNER, BILLING}`; plataforma: `requirePlatformAction` | 003 / 004 |
| Privilégio administrativo | toda ação comercial da plataforma grava `PlatformAuditLog` com antes/depois e motivo; papéis finos de plataforma (D-12) antes de dar acesso a terceiros | 004 |
| Gates server-side | modo `limitado`/`bloqueado` aplicado em `requireModuleApi`, `requireModuleAction` e nos gates de domínio (`lib/aparelhos/api-gate`, `lib/catalogo-aparelhos/loja-catalogo-api`, `lib/compat/compat-api`) | 002 |
| IDOR | IDs de organização/assinatura nunca aceitos do cliente nas rotas do lojista; no painel, busca por id + `requirePlatformAction`; testes negativos com id de outra organização | 002–004 |
| Abuso de cadastro | campo-isca, limite por origem (HMAC do IP) e global no banco (padrão C13), domínios descartáveis, captcha (D-10), `TrialGrant` por email normalizado/WhatsApp/documento | 001B |
| Enumeração de contas | respostas públicas idênticas em cadastro, reenvio e recuperação de senha; diferença só no conteúdo do email | 001B |
| Tokens | 32 bytes, só `sha256` no banco, expiração (24 h verificação, 1 h senha), uso único por compare-and-set, no fragmento da URL (sem `Referer`), invalidação no reenvio | 001B |
| Senhas | `newPasswordSchema` (12+, bcrypt ≤ 72 bytes), bcrypt custo 12, nunca senha padrão; reset incrementa `sessionVersion` (revoga sessões) | 001B |
| Concorrência | compare-and-set em `Subscription.version`; `pg_advisory_xact_lock(hashtext(storeId))` na contagem de usuários (evita SERIALIZABLE, que colide em tabela pequena — memória do DP) | 002 / 003 |
| Idempotência | `Organization.origemCadastroId @unique`; `BillingEvent @@unique([provedor, eventoId])`; `NotificationOutbox.dedupeKey @unique`; `BillingCharge.provedorChargeId @unique` | 001A / 003 / 005 |
| Webhooks e replay | token comparado em tempo constante, falha fechado sem env; evento registrado antes do efeito; **reconsulta ao provedor** (SAAS-ADR-05); eventos fora de ordem resolvidos pelo estado reconsultado, não pela ordem de chegada | 003 |
| Credenciais | só em env da Vercel (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`); nunca no banco, nunca em `NEXT_PUBLIC_*` (memória "env → bundle"); chaves separadas sandbox × produção; Preview usa sandbox | 001A / 003 |
| Dados de cartão | nunca tocam o servidor (checkout/tokenização do provedor) | 003 |
| Auditoria financeira | `SubscriptionHistory` + `BillingEvent` + `BillingCharge` só recebem insert/update de status; nada é apagado | 003 |
| LGPD | consentimento versionado (termos + privacidade); base legal: execução de contrato (conta) e consentimento (marketing/WhatsApp, caixa separada não marcada); suboperadores listados (Vercel, Neon, Asaas, Resend); exportação e exclusão por organização (backlog G-08/G-09); cadastros não verificados apagados em 7 dias; logs sem IP cru e sem PII | 001B / 005 / 006 |
| Logs | não usar `log: ["error"]` do Prisma com dados pessoais (vaza "Failing row contains" — memória do DP); erros de Server Action devolvidos como resultado (produção mascara exceção — memória de release) | todos |
| Cache | rotas `/api/saas/*`, `/api/platform/saas/*` com `Cache-Control: no-store`; conferir o service worker do next-pwa (NetworkFirst cacheia GET `/api/*` por 24 h — memória) e excluir esses caminhos | 001B / 004 |
| Recuperação de falhas | transações únicas; outbox com retentativa; conciliação diária com o provedor; cadastros `falhou` visíveis no painel | 001A–005 |
| Observabilidade | contadores sem PII: cadastros/verificações/provisionamentos, recusas por modo limitado (por rota), webhooks recebidos/duplicados/falhos, emails enviados/falhos; alerta por email à plataforma quando falhas > limiar | 006 |
| Feature flags | `SAAS_CADASTRO_PUBLICO`, `SAAS_ENTITLEMENT_ENFORCE`, `SAAS_COBRANCA`, `SAAS_EMAIL_ENVIO`; valor ausente = desligado | 001A |
| Migrations | só aditivas, prefixo novo por GOAL, aplicadas no banco **antes** do merge (procedimento do #374 em `GESTAO_LOJAS_PROCEDIMENTO_MIGRATION.md`), backup Neon antes; rollback = desligar flag (as colunas novas ficam sem uso) | 001A–003 |
| Compatibilidade | `organizationId NULL` ⇒ pleno, sem limite (SAAS-ADR-07); E2E de regressão RAFACELL e piloto em toda PR do programa | todos |

### 1.1 Limite de usuários sem bypass

1. Uma função única `assertVagaUsuario(tx, storeId)` chamada **dentro da transação**, depois de
   `pg_advisory_xact_lock(hashtext('seats:' || storeId))`.
2. Chamadores obrigatórios: `POST /api/admin/users`, `PATCH /api/admin/users/[id]` (reativar,
   trocar `lojaId`, trocar lojas), `provisionClient`/`provisionarOrganizacao`, qualquer convite futuro,
   e scripts de seed/backfill (que falham sem a função).
3. Teste estático: um teste falha se aparecer `adminUser.create`/`adminUserStore.create` fora da
   lista de chamadores conhecidos.
4. E2E: duas criações simultâneas no limite → só uma passa; reativação recusada; mover usuário de
   outra loja recusado; plataforma não conta; loja legada sem limite.

## 2. Ameaças (resumo STRIDE)

| Ameaça | Vetor | Controle |
|---|---|---|
| Spoofing | webhook forjado | token + reconsulta |
| Spoofing | link de verificação adivinhado | 256 bits, hash, expiração |
| Tampering | cliente envia `organizationId`/`planoId` alheio | ids resolvidos da sessão; plano do catálogo no servidor |
| Repudiation | admin estende teste sem rastro | `PlatformAuditLog` obrigatório |
| Information disclosure | painel vaza dados de cartão/token | `select` explícito; nada sensível persistido |
| Information disclosure | enumeração de emails | respostas idênticas |
| DoS | enxurrada de cadastros/emails | limites no banco + captcha + teto diário de envio |
| Elevation | lojista chama rota da plataforma | `requirePlatformAction` + teste negativo |
| Elevation | lojista contorna modo limitado por rota sem gate | inventário + teste de cobertura (R-P0-01) |

## 3. Riscos

### P0 — impedem a ativação pública

| ID | Risco | Mitigação | GOAL |
|---|---|---|---|
| R-P0-01 | **Escrita escapando do modo limitado.** 225 rotas de escrita, 32 com gate próprio, 30 arquivos de Server Actions (22 com `requireModuleAction`). Uma rota esquecida = uso gratuito ilimitado | inventário gerado por script (rota × método × gate × classificação); teste que falha com rota nova não classificada; enforcement começa em modo sombra e só liga com zero rota não classificada | 002 |
| R-P0-02 | **Ligar o cadastro público antes dos gates.** Cada cadastro vira loja com acesso pleno para sempre | `SAAS_CADASTRO_PUBLICO` só pode ser `on` com `SAAS_ENTITLEMENT_ENFORCE=on` (checado no próprio endpoint de cadastro); gate de aprovação humana em SAAS-006 | 001B / 006 |
| R-P0-03 | **Interromper venda/caixa no vencimento** ou perder venda offline | regra `limitedSince` + caixa aberto antes continua + sync aceito (arquitetura §6.3); recusa antes de mutação; nada apagado da fila local; E2E com relógio controlado | 002 |
| R-P0-04 | **Webhook de pagamento forjado ou repetido** (Asaas não assina) | SAAS-ADR-05 | 003 |
| R-P0-05 | **Mensalidade misturada ao Financeiro do lojista** | tabelas próprias por `organizationId`; teste que garante que o fluxo de cobrança não toca `ContaReceberTitulo`/`MovimentacaoFinanceira`/`SessaoCaixa` | 003 |
| R-P0-06 | **Regressão nos clientes atuais** (RAFACELL, loja-2, pilotos) ao ligar o resolvedor | legado = pleno; modo sombra primeiro; E2E RAFACELL/piloto obrigatório; flag de rollback | 001A / 002 |

### P1 — precisam de tratamento antes ou logo após a ativação

| ID | Risco | Mitigação |
|---|---|---|
| R-P1-01 | Email de verificação não chega (spam, domínio sem DKIM) → cadastro abandonado | domínio próprio com SPF/DKIM/DMARC; reenvio; painel de cadastros pendentes; teste em Gmail/Outlook |
| R-P1-02 | Plano Vercel Hobby: cron 1×/dia sem minuto garantido | acesso não depende do cron; emails críticos imediatos; confirmar plano (D-14) |
| R-P1-03 | JWT com modo antigo por alguns segundos | rechecagem no banco nas rotas críticas |
| R-P1-04 | Contradição de documentação do Stripe/Asaas sobre Pix Automático | Pix avulso como caminho garantido; Pix Automático liga por flag após teste em sandbox |
| R-P1-05 | Testes repetidos com emails diferentes | `TrialGrant` também por WhatsApp; captcha; revisão manual de padrões no painel |
| R-P1-06 | Autoridade de plataforma binária: quem vê o painel faz tudo | papéis de plataforma (D-12) antes de dar acesso a outra pessoa |
| R-P1-07 | Rotas Stripe legadas ainda acessíveis (`/api/billing/checkout` com 14 dias e cartão) | conter na SAAS-003 (resposta 410 para a oferta nova) ou GOAL de remoção autorizado |
| R-P1-08 | Service worker do PWA cacheando GET de assinatura/painel | excluir `/api/saas/*` e `/api/platform/*` do runtime caching |
| R-P1-09 | Primeira venda de loja nova já travou (FASTTRACK-002) — no self-service ninguém acompanha | E2E de jornada completa em loja recém-criada (já existe `jornada-cliente-independente.spec`) obrigatório em SAAS-006 |
| R-P1-10 | Sem emissão fiscal: cliente que precisa de NFC-e assina e não consegue operar | aviso explícito no cadastro e nos termos (D-16) |
| R-P1-11 | Transferência internacional (Resend/Asaas) sem constar na política | atualizar `/privacy` antes da ativação |
| R-P1-12 | Landing diz "acompanhado pela equipe" | trocar o texto só no SAAS-006, junto com a flag |

### P2 — acompanhar

| ID | Risco |
|---|---|
| R-P2-01 | Três catálogos de plano coexistindo (`Store.subscriptionPlan`, `lib/stripe.ts`, oferta) — confusão em código novo |
| R-P2-02 | `SubscriptionPlan` do banco sem `DIAMANTE`, que `lib/stripe.ts` conhece |
| R-P2-03 | Banco único para todos os clientes: incidente afeta todos (backup Neon por ponto de restauração) |
| R-P2-04 | Custo do email/cron/infra por cliente não medido (sem dado no repositório) |

## 4. Checklist de segurança por PR do programa

- [ ] Nenhuma rota nova aceita `organizationId`/`subscriptionId` do cliente nas rotas do lojista.
- [ ] Testes negativos: outra organização, sem sessão, sessão com troca de senha pendente, papel insuficiente.
- [ ] Nenhum segredo em `NEXT_PUBLIC_*`; nenhum token bruto persistido.
- [ ] `Cache-Control: no-store` nas respostas novas.
- [ ] Inventário de escritas atualizado e verde (a partir de SAAS-002).
- [ ] E2E RAFACELL/loja legada sem mudança.
- [ ] Migration aditiva aplicada antes do merge, com backup.
