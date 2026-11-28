# OMNI-GESTOR-MONEY-CONVERSATIONAL-ENGINE-001 — Motor conversacional do Gestor Money

- Executor: Claude Code (Opus 5.5). Data: 27/11/2026.
- Branch própria: `claude/gestor-money-conversational-engine-001`, worktree `.worktrees/gestor-money-conversational-engine-001`.
- Base: `origin/codex/gestor-money-main-reconciliation-001` @ `3ed6cb7` (PR #405, G001–G006 publicados). PR em draft **empilhada sobre a #405**, sem alterar a #405 nem a branch de UI (`feat/gestor-money-mobile-web-g006-5`).
- Roadmap oficial recuperado: pacote `OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001` rev. 2 (`GOALS_DE_IMPLEMENTACAO.md`) + `docs/decisions/OMNI-GESTAO-GASTOS-001-PERFIS.md` (consequências G007–G010). Este GOAL entrega o **núcleo do G008** (conversa de gestão por texto, revisão, correção, cancelamento, expiração, confirmação versionada) e os **contratos de entrada** que G009 (áudio) e G010 (foto) vão alimentar — sem antecipar G007 (canal/binding) nem G011/G012 (rascunhos de venda/OS).

## O que foi entregue

Namespace próprio `lib/gestor-money-assistente/` (nenhum arquivo fora dele, exceto esta pasta de evidência):

| Arquivo | Papel |
|---|---|
| `interpretacao.ts` | Linguagem natural pt-BR → intenção + campos. **Determinístico** (sem LLM): valor só se explícito; 2+ valores = ambiguidade. |
| `texto.ts`, `datas.ts`, `categorias.ts` | Normalização, números por extenso, centavos sem float, datas no fuso `America/Sao_Paulo`, categoria sugerida. |
| `tipos.ts` | Intenções, rascunho, estado, resposta e **portas** (autorização, cadastros, consulta, execução, repositório). |
| `motor.ts` | Orquestração: rascunho, perguntas mínimas, complemento, correção, cancelamento, expiração, confirmação vinculada, execução, reconciliação. |
| `mapeamento-g004.ts` | Rascunho → `PropostaGasto` (contrato G004 `operacao-schema.ts`). |
| `consultas.ts` | Consultas sobre o motor canônico G005; nenhum número fora do DTO. |
| `entradas.ts` | Contratos de entrada: texto, áudio transcrito, imagem interpretada, comprovante estruturado. |
| `adaptador-servidor.ts` | `server-only`, **dormente**: liga as portas aos contratos reais G001/G003/G004/G005. Nenhuma rota/Action/UI/worker o importa. |
| `simulacao.ts`, `cenario-teste.ts` | **SIMULADO**: repositório em memória, contexto opaco simulado, executor que valida com o schema G004 real, fixture G005, transporte simulado. |
| `*.test.ts` | 132 testes (interpretação, conversas, consultas, segurança, falhas, entradas, demonstração). |

### Classificação (11 classes + controle)
DESPESA · RECEITA · DIVIDA · PAGAMENTO · RECEBIMENTO · TRANSFERENCIA · COMPRA_CREDITO · PARCELAMENTO · CONSULTA · CORRECAO · CANCELAMENTO (+ CONFIRMACAO, NEGACAO, DESCONHECIDO).

### Extração
Valor em centavos (`"1.500"`, `"1.500,00"`, `"250,5"`, `"2 mil"`, `"mil e quinhentos"`, `"12 reais e 50 centavos"`), categoria, descrição, data econômica (hoje/ontem/anteontem/`dia N`/`DD/MM`), vencimento (sentido futuro), forma de pagamento, conta/banco, nº de parcelas, credor/beneficiário, perfil (pessoal/empresa/loja nomeada).

### Mapeamento para o G004 (único caminho de escrita)

| Intenção | Proposta G004 | Campos exigidos antes de confirmar |
|---|---|---|
| DESPESA | `GASTO_PAGO` | perfil, valor, forma (pix/dinheiro/débito/transferência/boleto), conta |
| DIVIDA | `CONTA_PAGAR` | perfil, valor, vencimento |
| COMPRA_CREDITO / PARCELAMENTO | `COMPRA_CREDITO` com `parcelas[]` (centavos exatos, resto na 1ª) | perfil, valor, cartão com ciclos G004 cadastrados para todas as parcelas |
| PAGAMENTO | `PAGAR_TITULO` (parcial ou `quitar`) | perfil, título em aberto (resolvido por leitura), valor ≤ saldo, forma, conta |
| RECEITA / RECEBIMENTO / TRANSFERENCIA | — **sem contrato G004** | classificadas e explicadas; **nada é gravado** |

Escrita: `prepararRevisaoGasto(ctx, { grupoChave: "gm-conv:{rascunho}:v{versão}", proposta })` → `aplicarOperacaoGasto(ctx, { revisaoId, versaoEsperada, chave: "gm-conv-op:{rascunho}:v{versão}" })`. Não há outro writer.

### Contexto conversacional
- Pergunta só o que falta, um campo por vez, na ordem perfil → valor → título → forma → conta → cartão → vencimento; opções numeradas quando há candidatos.
- Interpreta respostas complementares ("pix", "nubank", "1", "dia 10", "pessoal").
- Edição antes da confirmação ("na verdade foi 300", "sim, mas no débito") gera nova versão e novo token; **"sim" com conteúdo adicional nunca confirma**.
- Troca de perfil antes de confirmar **descarta** todos os ids resolvidos no perfil anterior (G008: não copiar objetos entre perfis).
- Cancelamento descarta; expiração (15 min, renovada a cada interação; G004 limita a revisão a 24 h) descarta com aviso.
- Nova operação com rascunho aberto é recusada até confirmar/cancelar; consulta no meio do rascunho é respondida com lembrete.
- Aviso de possível duplicidade quando operação idêntica foi registrada há < 10 min.

### Confirmação e escrita
- Resumo no formato pedido: `Despesa de R$ 350,00 em Supermercado.` / `Pagamento via Pix.` / detalhes (conta, data, perfil) / `Confirma?`.
- Confirmação vinculada à **versão exata**: token por (rascunho, versão, proposta, perfil) e id da mensagem de confirmação; botão/reply antigo → `confirmacao_desatualizada`.
- O contexto `edit` só é pedido à PortaAutorizacao **no ato da confirmação** (revogação entre rascunho e "sim" impede a escrita).
- Estado `EM_EXECUCAO` é gravado (CAS) **antes** de chamar o G004 → dois "sim" concorrentes produzem uma escrita.
- Falha **DEFINITIVA** (servidor recusou antes do COMMIT): nada gravado, nova versão/novas chaves. Falha **INCERTA** (timeout/resposta perdida): estado `INCERTO`, edição e cancelamento bloqueados, reenvio com a **mesma** chave (idempotência G004) por "sim" ou por `reconciliarPendencia()` (worker), nunca duplica.

### Consultas inteligentes (G005)
Gastos do dia/semana/mês/mês passado/ano, por categoria, gastos numa categoria, saldo (contas ativas não crédito), dívidas (contas a pagar em aberto), vencimentos (hoje/amanhã/próximos N dias/mês, filtrando as linhas do DTO), a receber, receitas, receitas × despesas, comparativo mês atual × mesmo período do mês anterior (duas consultas G005). Todo número vem do `ConsultaFinanceiraDTO` (compatibilidade verificada em tempo de compilação no adaptador); sem dado → "não encontrei"; falha do G005 → "não consegui consultar", sem número. **Faturas por cartão: indisponível** (ver dependências).

### Segurança
- Identidade = `Principal` autenticado fora da mensagem; o schema de entrada é estrito e rejeita `userId`/`perfilId`/`storeId`.
- Estado de conversa indexado por `userId::conversaId` → outro usuário não confirma rascunho alheio.
- Perfil só entre os autorizados pela PortaAutorizacao; perfil pessoal de outro usuário inalcançável; loja não autorizada recusada sem listar as existentes.
- Contexto opaco nunca é construído pelo motor (o adaptador usa `requireFinanceiroPerfilAccess`, que relê sessão/banco a cada chamada).
- Comandos suspeitos (sobrescrita de instruções, elevação, SQL/script, identificadores internos, escopo alheio, credenciais, texto longo) → `comando_recusado`, sem rascunho e sem alterar o pendente. Texto extraído de imagem é dado: instrução embutida bloqueia o registro.
- Idempotência por `mensagemId` (resposta registrada), CAS do estado e chave G004 estável por versão.
- O estado persistido não guarda o texto livre da mensagem.
- A IA não executa nada: o parser é determinístico e não há chamada a modelo generativo.

### Entradas (preparadas, não homologadas)
`TEXTO`, `AUDIO_TRANSCRITO`, `IMAGEM_INTERPRETADA`, `COMPROVANTE_ESTRUTURADO`. Nesta etapa o schema só aceita `canal: "SIMULADO"`, `provedor: "SINTETICO"` e `homologado: false` (literal). **Áudio (STT), OCR/visão e WhatsApp oficial NÃO estão homologados** — e o contrato impede que uma entrada se declare homologada.

## Conversas demonstradas
Ver [`CONVERSAS_DEMONSTRADAS.md`](./CONVERSAS_DEMONSTRADAS.md) — 12 roteiros gerados pela execução real do motor sobre o transporte simulado (despesa Pix, energia, parcelado, dívida, receita sem contrato, pagamento parcial, 6 consultas, vencimentos, perfil ambíguo + correção + botão antigo, valores ambíguos + cancelamento, comando malicioso, falha incerta sem duplicar). Total: 7 escritas simuladas, todas após confirmação válida.

## Testes e validação

| Gate | Resultado |
|---|---|
| `npx vitest run lib/gestor-money-assistente` | 132/132 (6 arquivos) |
| `npx vitest run lib/gestor-money-assistente lib/gastos` (regressão da fundação) | 261/261 (14 arquivos) |
| `npm run typecheck` | exit 0, sem erros (38 min — máquina com ~750 MB de RAM livre) |
| `npx eslint lib/gestor-money-assistente` | limpo |
| `npm run build` | exit 0, "Compiled successfully" (o módulo não entra em nenhuma rota — prova de não regressão do bundle) |

O executor simulado valida cada proposta com `normalizarPropostaGasto` do G004 real; os testes também a revalidam. **Não houve teste contra PostgreSQL** nesta etapa: o adaptador real é verificado por tipos, não por execução (ver blockers).

## Dependências para integração oficial

1. **#405 mergeada e G002–G005 aplicadas em Production** (hoje só a G001 está aplicada) + `GESTOR_MONEY_ENABLED` ligado sob gate próprio. Sem isso o adaptador não tem tabelas.
2. **Repositório durável do estado conversacional.** Não há tabela para rascunho/estado/respostas por `mensagemId`; schema compartilhado ficou congelado. Opções: tabela própria aditiva (`gm_assistente_conversas`, `gm_assistente_respostas`, escopo por usuário, RLS por dono) ou reaproveitar staging privado G006. Exige gate de schema.
3. **G007 — binding do telefone**: principal `BINDING_G007` e entrada interna equivalente a `requireFinanceiroPerfilAccess` sem sessão web (decisão G001). O adaptador recusa hoje qualquer principal que não seja `SESSAO_WEB` (fail-closed).
4. **Worker G006 de gestão**: job STAGING → `processarMensagem(principal, entrada)`; resposta enfileirada na outbox G006 (não duplicar fila); `reconciliarPendencia()` para estados INCERTO/EM_EXECUCAO; webhook só faz ACK após persistir (já é o contrato G006).
5. **Canal**: aceitar `canal: "WHATSAPP_CLOUD"` em `entradas.ts` só depois de G007 homologado; `respondendoA` ← `context.id` da Meta; `confirmacaoToken` ← payload do botão interativo.
6. **Contratos financeiros ausentes no G004** para RECEITA, RECEBIMENTO e TRANSFERÊNCIA (hoje o motor classifica e não grava) e para **PAGAR_FATURA** por conversa (exige escolha de alocações).
7. **G005**: projeção de **faturas por ciclo/cartão** no DTO (hoje a consulta de faturas responde "indisponível" para não estimar).
8. **Fornecedor**: o motor usa `contraparteTexto`; ligar `fornecedorId` exige resolução validada (G004 `resolverFornecedorGasto`) com escolha explícita quando houver homônimos.
9. **UI (Antigravity)**: pode consumir `RespostaAssistente` (`mensagens`, `confirmacao.token`, `rascunho`) via Server Action futura que monte `Principal{origem:"SESSAO_WEB"}` e o repositório durável do item 2.
10. **G009/G010**: STT e OCR reais devem produzir exatamente `AUDIO_TRANSCRITO`/`IMAGEM_INTERPRETADA`/`COMPROVANTE_ESTRUTURADO` com `provedor` homologado (ampliar o enum somente com prova de provider) e `documentoId` do G003.

## Blockers reais
- **Sem persistência durável de conversa** (item 2): não é possível ligar o motor a um canal real sem decisão/gate de schema.
- **Sem binding G007**: não há principal autenticado para WhatsApp; hoje só a sessão web autoriza.
- **Ativação do Gestor Money em Production** (G002–G005 pendentes) — fora do escopo e sem autorização.
- Receita/recebimento/transferência/pagamento de fatura pelo chat dependem de contrato financeiro novo (não criado aqui por regra: sem segundo motor).

## Limites declarados (não alegar)
- Nenhuma mensagem real enviada, nenhum número configurado, nenhum serviço contratado, nenhum acesso a Production, nenhuma migration, nenhuma flag alterada, nenhum merge.
- Áudio, OCR e WhatsApp oficial **não homologados**; entradas desses tipos são sintéticas.
- O interpretador é baseado em regras pt-BR: frases fora dos padrões caem em "não entendi" ou em pergunta — preferência deliberada por recusar a adivinhar.
