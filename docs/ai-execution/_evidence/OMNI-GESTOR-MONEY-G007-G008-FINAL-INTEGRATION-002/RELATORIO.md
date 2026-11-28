# OMNI-GESTOR-MONEY-G007-G008-FINAL-INTEGRATION-002 — relatório

Branch `claude/gestor-money-conversational-engine-001` (PR #417, DRAFT), dependente da #405.
A #405 foi integrada até o **HEAD final `e3d141c`** (o agente da fundação declarou a missão dela encerrada).
O módulo continua desligado, não houve envio real e Production não foi tocada.

## 1. Reconciliação
- Três merges sem conflito: `6c67cbb` (limites de cartão e gate R2), `a94e41a` (receita, recebimento, plano de fatura,
  `PROCESSADO_G008`, acessos EMPRESA) e `e3d141c` (recusa tipada no plano de fatura).
- Alterações próprias preservadas:
  - `lib/gastos/access.ts` (emissor por principal);
  - `lib/gastos/worker.ts` (gancho `staging`/`aposCiclo`);
  - `prisma/schema.prisma` (modelos `gm_assist_*`).
- Ordem das migrations validada com DRIFT_ZERO: `…20261127100000 → 20261127120000 → 20261127140000 → 20261128100000` (a do assistente).
- Ajuste novo em `access.ts`: o import de `guard-enterprise` passou a ser dinâmico, de modo que o caminho por principal (worker Node) não carrega
  NextAuth nem o React de sessão. O caminho de sessão web continua idêntico: os testes de acesso seguem verdes.

## 2. Contratos financeiros (somente os canônicos da #405, nada duplicado)
| Intenção no chat | Contrato #405 |
|---|---|
| Receita ("recebi 1500 de um cliente no pix pelo nubank") | `RECEITA_RECEBIDA` |
| Recebimento parcial ou quitação ("recebi 300 que o joão me devia", "recebi o restante") | `RECEBER_TITULO`, sobre títulos de G005 `receber[]` |
| Pagamento de conta, parcial e quitação | `PAGAR_TITULO` (já existia) |
| Transferência PESSOAL e EMPRESA | `TRANSFERENCIA_INTERNA` |
| Pagamento de fatura ("paguei a fatura do cartão…", escolha do ciclo, valor ou "a fatura toda") | `planejarPagamentoFaturaGasto` → `PAGAR_FATURA` com as alocações do plano |
| Consulta de faturas por ciclo | G005 `ConsultaFinanceiraDTO.cartoes[].ciclos[]` |
| Limite total, utilizado e disponível (e o excedido, quando houver) | G005 `cartoes[]`; limite ausente aparece como "não informado", nunca 0 |
| Compra acima do limite | o G004 recusa com `limite_cartao_insuficiente` e o chat avisa sem gravar |

A alocação própria de fatura que existia na rodada anterior foi **removida** e substituída pelo plano canônico.

## 3. Worker real
- O entrypoint oficial `workers/gastos/index.ts` tem opt-in `GASTOS_WORKER_ASSISTENTE=ligado`. Sem ele, o comportamento G006 é idêntico (provado).
- Execução: `node --conditions=react-server --import ./workers/gastos/react-server-preload.mjs --import tsx workers/gastos/index.ts`.
  O preload resolve `server-only` com a mesma regra de `exports` que o Next usa (vazio só sob `react-server`; sem a condição, aponta para o módulo que lança).
- O bootstrap (`whatsapp/worker-assistente.ts`) falha fechado com `CONFIG_INVALIDA` quando:
  - falta a condição `react-server`;
  - o modo não é SIMULADO ou o ambiente não é `teste`;
  - a 2ª conexão (`GASTOS_WORKER_APP_DATABASE_URL`) falta, é igual à do worker ou não passa no Datasource Guard (#404);
  - o papel da 2ª conexão é superusuário, tem BYPASSRLS, CREATEROLE/CREATEDB, é dono de tabela, é papel G006 ou não tem DML no assistente.
- Rodado como **processo real** (Node 24, filho do teste) contra PostgreSQL descartável:
  - pareamento → despesa → "sim" → COMMIT G004 pelo runtime restrito (RLS real) → outbox G006 → envio SIMULADO;
  - todas as mensagens da inbox terminam em `PROCESSADO_G008`;
  - os textos das respostas são apagados depois do aceite.
- Reinício: um worker "morre" com a lease e o processo real a recupera (`LEASE_RECUPERADA`) com uma única escrita.
- Duplicidade: a mesma wamid entregue duas vezes e dois "sim" em paralelo (concorrência 2) geram uma escrita.
- Revogação imediata: um "sim" depois da revogação não grava.

## 4. Inbox
O gateway conclui o staging com `concluirStaging(fila, claim, { estadoInbox: "PROCESSADO_G008" })`.
Não sobra nenhum `AGUARDANDO_VINCULO` para mensagem tratada pelo assistente. Sem o opt-in, o G006 original mantém `AGUARDANDO_VINCULO`, também provado.

## 5. Pareamento e interface
Contrato publicado em [`CONTRATOS_PAREAMENTO_PR418.md`](CONTRATOS_PAREAMENTO_PR418.md). As Server Actions são:
- `gerarCodigoVinculoWhatsApp`, que também serve para novo pareamento;
- `situacaoVinculoWhatsApp`, com os estados SEM_VINCULO, PENDENTE, EXPIRADO, BLOQUEADO e VINCULADO;
- `cancelarPareamentoWhatsApp` (novo);
- `revogarVinculoWhatsApp`.

A confirmação é a própria mensagem no WhatsApp. Nenhum componente visual foi criado; a branch da #418 não foi tocada.

## 6. Validação
| Gate | Resultado |
|---|---|
| Unitários `lib/gestor-money-assistente` + `lib/gastos` + `mensageria.unit` | 317/317 |
| PostgreSQL descartável local (PG 17, 127.0.0.1:55530, `gastos_g006_test`, DRIFT_ZERO) | 23/23 (14 conversa/segurança + 4 contratos + 5 entrypoint real) |
| eslint nos arquivos alterados | limpo |
| `npm run typecheck` (local) / CI | ver o PR |

Os cenários PostgreSQL anteriores (13) foram preservados.

## Bloqueios externos
- Migrations G002–G006, `20261127120000`, `20261127140000` e `20261128100000` não aplicadas em ambiente hospedado (gate humano).
- Canal Meta de gestão não provisionado (app/WABA/número, App Secret, `WHATSAPP_CANAL_TOKEN_*`, registro do webhook). Envio real desabilitado.
- Worker em nuvem: o entrypoint está pronto, mas falta o deploy com um banco de homologação atestado no Datasource Guard. Esta entrega não declara homologação cloud.
- Interface do pareamento: a #418 não tem sessão ativa conhecida; o contrato está publicado.
