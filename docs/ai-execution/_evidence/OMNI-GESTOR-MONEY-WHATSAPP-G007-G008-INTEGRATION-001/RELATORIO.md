# OMNI-GESTOR-MONEY-WHATSAPP-G007-G008-INTEGRATION-001 — relatório

Branch `claude/gestor-money-conversational-engine-001` (PR #417, DRAFT), **dependente** da #405
(`codex/gestor-money-main-reconciliation-001`, integrada até `10f28c2`). Tudo DESLIGADO por padrão; nenhum
envio real, nenhuma migration hospedada, nenhuma flag hospedada, Production intocada.

## O que foi entregue

| Item do GOAL | Implementação |
|---|---|
| 1. Vínculo seguro (G007) | `lib/gestor-money-assistente/whatsapp/vinculo.ts` + `app/actions/gestor-money-vinculo.ts` |
| 2. Memória persistente (G008) | `whatsapp/persistencia.ts` + migration `20261128100000_gestor_money_assistente_vinculo_conversa` |
| 3. Worker e outbox G006 | gancho `staging`/`aposCiclo` em `lib/gastos/worker.ts` + `whatsapp/gateway.ts` + `whatsapp/respostas.ts` |
| 4. Transporte WhatsApp | `app/api/gestor-money/whatsapp/webhook/route.ts` + `whatsapp/webhook.ts` + `whatsapp/transporte.ts` |
| 5. Contratos financeiros | emissor G001 por principal em `lib/gastos/access.ts`; `TRANSFERENCIA_INTERNA` no motor |
| 6. PostgreSQL | `test/gastos/assistente-whatsapp.postgres.test.ts` (13 cenários) + grupo `g007` na CI |

### 1. Vínculo (G007)
- Pareamento só a partir da sessão web autenticada (`requireEnterpriseSession`); identidade nunca vem do formulário.
- Dupla posse: o código de 6 dígitos aparece só na tela da conta e precisa chegar **do telefone declarado** ao
  número de gestão (remetente Meta + HMAC + canal GESTAO vigente). Nem só a conta nem só o número bastam.
- Código guardado como `sha256(sal:código)` com sal por desafio; validade 10 min; uso único (CONFIRMADO é terminal);
  5 tentativas por desafio (depois BLOQUEADO); 5 desafios por usuário por hora; consentimento versionado obrigatório.
- Telefone já ativo em OUTRA conta: reassociação recusada (o titular revoga antes). Novo pareamento do mesmo usuário
  revoga o vínculo anterior (`NOVO_PAREAMENTO`). Revogação é definitiva e auditada.
- Trilha `gm_assist_eventos` imutável e minimizada (sem texto de mensagem, telefone mascarado `+*********0000`).
- O vínculo é só identidade: PESSOAL e EMPRESA continuam vindo das concessões G001. Nenhuma loja fictícia.
- Não autentica só pelo número: além do vínculo ATIVO na versão esperada, cada contexto/ato revalida usuário ativo,
  permissão do papel e, em EMPRESA, membro do perfil + módulo `finance` contratado pela loja.

### 2. Memória persistente — por que não o staging G006
`whatsapp_gestao_inbox`/`gastos_origens_canal` são imutáveis por gatilho, a inbox só admite `RECEBIDO`/`AGUARDANDO_VINCULO`
e `gastos_jobs` só `STAGING`/`ENVIAR_RESULTADO`. Não há onde guardar rascunho versionado, confirmação, cache
idempotente de resposta nem respostas que não sejam resultado financeiro. Migration **aditiva própria** (só tabelas
`gm_assist_*`, nada existente alterado), aplicada apenas no PostgreSQL descartável (DRIFT_ZERO contra o schema):
- `gm_assist_conversas`: estado com CAS por `versaoEstado` (gatilho exige `+1`); chave `userId::vinculoId`;
  revogação congela (gatilho recusa gravar sem vínculo ATIVO).
- `gm_assist_mensagens`: resposta registrada uma vez por mensagem (reentrega/reclaim devolve a mesma).
- `gm_assist_respostas`: outbox das respostas conversacionais (estado/lease/tentativas/INCERTA), texto apagado após aceite.
- `gm_assist_desafios`, `gm_assist_vinculos`, `gm_assist_eventos`.
- Papéis G006 sem acesso a essas tabelas (`REVOKE ... FROM PUBLIC`); `validarPapelWorker` continua aprovando.

### 3. Worker e outbox G006 (sem worker novo)
- `rodarWorker`/`processarClaim` ganharam o gancho opcional `staging` (+ `aposCiclo`). Sem ele, comportamento G006 idêntico.
- Mesma fila, lease, retry (`decidirFalha`), DLQ e recuperação de lease do G006.
- Antes do G004: `registrarOrigemCanal` (G006) com o verificador de vínculo G007. O **resultado financeiro sai pela outbox
  G006** (`prepararOutbox` → `ENVIAR_RESULTADO`) só após o COMMIT. Perguntas e resumos saem por `gm_assist_respostas`.
- Reconciliação periódica: conversas `EM_EXECUCAO`/`INCERTO` reenviam a MESMA chave G004 (`reconciliarPendencia`).

### 4. Transporte
- Rota própria `/api/gestor-money/whatsapp/webhook` (o webhook comercial das lojas não foi tocado). 404 sem
  `GESTOR_MONEY_ENABLED=true` + `GESTOR_MONEY_WHATSAPP_GESTAO=ligado`.
- HMAC sempre obrigatório (`GESTOR_MONEY_WHATSAPP_APP_SECRET`), sem bypass de desenvolvimento; corpo limitado.
- Só números `whatsapp_canais` papel GESTAO, ativos e da mesma WABA. Número de atendimento/desconhecido é ignorado.
- ACK só após COMMIT inbox+job (`persistirIngresso`, papel `omni_gastos_ingress`); reentrega idempotente por wamid.
- Reply do usuário (`context.id`) é traduzido para a versão exata do resumo: botão/resposta antiga é recusada.
- Envio real: `transporteMetaGestao` reutiliza `sendTextMessage`, mas só constrói com `GESTOR_MONEY_WHATSAPP_ENVIO_REAL=habilitado`
  (nenhum ambiente define). O G006 só aceita transporte SIMULADO para o resultado. **Nada foi enviado.**

### 5. Contratos financeiros
- Novo emissor G001 `requireFinanceiroPerfilAccessPorPrincipal(verificar, seletor, acao)`: mesmo contexto opaco
  (WeakSet), mesma busca de perfil/RLS; `revalidateFinanceiroContexto` revalida pelo mesmo verificador. Assim
  G003/G004/G005 funcionam sem cookie de sessão.
- `TRANSFERENCIA_INTERNA` (#405) ligada: origem/destino no mesmo perfil, pergunta do que faltar, sem fato/despesa.
- Lista de perfis não oferece loja sem módulo `finance`.

## Testes

| Gate | Resultado |
|---|---|
| Unitários `lib/gestor-money-assistente` + `lib/gastos` + `mensageria.unit` | 300/300 (+4 de desligamento) |
| PostgreSQL descartável local (PG 17, 127.0.0.1:55530, migrations reais + DRIFT_ZERO) | 13/13, 3 execuções seguidas |
| eslint nos arquivos alterados | limpo |
| typecheck / build | ver PR (CI) |

Cenários PostgreSQL (todos sem sessão de navegador, `@/auth` → null):
1. Papéis: worker G006 válido e sem acesso às tabelas do assistente.
2. Pareamento válido; código só como hash; reutilização recusada; auditoria e vínculo imutáveis.
3. Pareamento inválido: outro telefone, código errado (contagem), bloqueio, código certo após bloqueio, expirado,
   sem consentimento, telefone inválido, limite por hora.
4. Telefone não vinculado → onboarding, nenhuma conversa nem dinheiro; HMAC inválido 401; flag off 404; número alheio ignorado.
5. Despesa, correção antes de confirmar, reply ao resumo antigo recusado, gravação única, resultado pela outbox G006.
6. PESSOAL × EMPRESA: pergunta o perfil, grava na loja escolhida; loja sem `finance` não oferecida e negada pelo emissor.
7. Isolamento: U2 não vê gastos nem contas de U1.
8. Pagamento parcial (200 de 800), quitação (600) e transferência interna (2 movimentos, nenhuma despesa).
9. Consulta: número da resposta = `consultarFinanceiro` G005 canônico.
10. Reentrega da mesma wamid (uma resposta) e dois "sim" processados em paralelo (uma escrita).
11. Reinício do worker ANTES e DEPOIS do COMMIT G004 (lease vencida, `LEASE_RECUPERADA`): uma escrita; o zumbi não duplica.
12. Falha incerta após COMMIT + reconciliação periódica (uma escrita, um resultado); entrega 500 → INCERTA sem reenvio;
    429 comprovado → retentado; texto apagado após aceite.
13. Revogação: conversa congelada, mensagens viram onboarding, rascunho antigo não volta com novo pareamento,
    resultado já COMMITado não é enviado após revogação (`VINCULO_AUSENTE`).

## Dependências para o agente da fundação (#405)

1. **`lib/gastos/access.ts`** — esta branch adiciona `requireFinanceiroPerfilAccessPorPrincipal` e o mapa de origem
   na revalidação (contrato da sessão inalterado). Precisa ser absorvido pela #405 ou revisto lá.
2. **`lib/gastos/worker.ts`** — gancho opcional `staging`/`aposCiclo` em `processarClaim`/`rodarWorker`.
3. **G006 `whatsapp_gestao_inbox.estado`** só tem `AGUARDANDO_VINCULO` para "processado"; o gateway conclui com
   `concluirStaging` (rótulo enganoso). Sugestão: estado `PROCESSADO_G008`.
4. **Entrypoint do worker em nuvem** (`workers/gastos/index.ts`) não liga o gancho: precisa de segunda conexão (runtime da
   aplicação, para G001–G005 e `gm_assist_*`) e de execução com `--conditions=react-server` (os serviços importam
   `server-only`). Gate de implantação.
5. **Contratos ausentes (G004/G005)**: RECEITA, RECEBIMENTO, PAGAR_FATURA pelo chat (exige seleção de ciclo/valor),
   consulta de faturas por ciclo no G005. O motor classifica e responde "não disponível" sem gravar.

## Bloqueios remanescentes (não resolvíveis nesta entrega)
- Migrations G002–G006 + esta não aplicadas em Production (gate humano); módulo desligado.
- Canal oficial (app/WABA/número, App Secret, credencial `WHATSAPP_CANAL_TOKEN_*`, registro do webhook) não provisionado.
- Envio real desabilitado; nenhuma homologação Meta.
- Entrypoint do worker em nuvem (item 4) e absorção dos itens 1–2 pela fundação.
- Interface do pareamento (Antigravity/#416) consome as Server Actions; não incluída aqui.
