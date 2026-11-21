# Conferência das lojas na janela KG — roteiro do proprietário

Para usar **somente na janela autorizada (W1/J0)**, em cada terminal, pelo próprio operador, com o
proprietário acompanhando. Ninguém acessa os terminais remotamente. Nada aqui está preenchido nem aprovado.
O modelo técnico completo (inventário de origens, consulta das sessões, deployments) está no
`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md` da #315; este roteiro é a versão para a loja.

**Por que isto importa:** vendas que ainda não chegaram ao servidor ficam guardadas **no navegador**, ligadas ao
**endereço** em que foram feitas. Depois do corte, um endereço antigo não alcança mais o banco e a venda fica
presa naquele aparelho. Não limpar cache, histórico ou "dados do site": isso pode apagar a única cópia da venda.

## Lojas (identificar sempre pelo código)

| Código | Loja | Atenção |
| --- | --- | --- |
| `loja-1` | RAFACELL | — |
| `loja-2` | RAFA BRINQUEDOS | existe uma loja de teste `loja-11` com o mesmo nome: conferir o código |

## Passo a passo em cada terminal (computador, celular, app instalado, cada perfil de navegador)

1. **Anote** o aparelho (ex.: "Caixa 1, notebook Dell"), o navegador/perfil ou "app instalado", e o operador.
2. **Endereço**: na barra do navegador deve aparecer `omni-gestao-pro.vercel.app`. No app instalado, use a
   opção do próprio app/navegador que mostra ou abre o endereço (por exemplo "Abrir no navegador") e anote-o. Qualquer outro endereço: **anote e avise o responsável
   antes de continuar** — não feche essa aba ainda.
3. **Vendas pendentes**: abra **Vendas → Arquivo geral** (`/dashboard/vendas-arquivo-geral`).
   - Nenhuma venda com selo **"Pendente"** e nenhum botão **"Verificar pendentes locais"** → pendentes = 0.
   - Tem pendente e a internet funciona → deixe a tela aberta 2 minutos (o reenvio é automático) e confira de novo.
   - Continua pendente ou aparece "ação necessária" → **não clique em reenviar**. Fotografe a tela (pedido,
     valor, forma de pagamento, horário) e avise o responsável. A janela não começa até decidir.
4. **Pagamentos**: nenhum PIX aguardando, nenhuma maquininha com transação aberta, nenhuma tela de pagamento
   aberta. Venda paga sem confirmação na tela → guarde o comprovante e avise; não cobre de novo.
5. **Trocas e devoluções**: nenhuma devolução ou vale "pendente de sincronização".
6. **Caixa**: fechamento normal do dia feito pelo responsável. Não abrir caixa até a reabertura autorizada.
7. **Feche** todas as abas do sistema e o app instalado. Não vender durante a janela.
8. **Terminal desligado, guardado ou que não foi encontrado**: a janela **não começa**. Ele precisa ser ligado
   e conferido, porque pode ter vendas guardadas.

## Folha de conferência

| Código | Loja | Aparelho / navegador ou app | Endereço confere? | Pendentes = 0? | Pagamento aberto = 0? | Devolução pendente = 0? | Caixa fechado? | Abas fechadas? | Operador | Horário |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| loja-1 | RAFACELL | | | | | | | | | |
| loja-1 | RAFACELL | | | | | | | | | |
| loja-2 | RAFA BRINQUEDOS | | | | | | | | | |
| loja-2 | RAFA BRINQUEDOS | | | | | | | | | |

Acrescente uma linha para **cada** aparelho/perfil usado nas lojas, inclusive os que ficam guardados.

## Depois da janela (J13 e W2/W3)

- Abrir o sistema **só** pelo endereço `omni-gestao-pro.vercel.app` e esperar a tela carregar inteira.
- Fazer uma venda UN normal de conferência indicada pelo responsável (não usar venda de cliente como teste).
- Venda por peso continua **desligada** até autorização separada.
- Qualquer mensagem de "manutenção programada" ou venda pendente que não zera: avisar e **não** limpar o navegador.

**Resultado da conferência:** GO / NO-GO · responsável: ______ · data e hora: ______ · autorização: ______

## Painel de gates de liberação — situação técnica em 2026-11-08

Retrato do GOAL `PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001`. **Nenhum item abaixo autoriza o rollout**;
cada autorização é do proprietário e vale só para o passo indicado.

| Gate | Situação | Quem decide / próximo passo |
| --- | --- | --- |
| A6 — script `07` (CHECK de milésimos) | revisado e aprovado tecnicamente (sha256 LF `dea40868…`, inalterado); aplicação **não autorizada** | dono: aplicar ou não no J9 (recomendação técnica: aplicar) |
| A7 — congelamento de sessões e conectores escritores | **pendente** | dono: desligar conectores/MCPs com alcance à produção e listar sessões encerradas |
| A7b — `cron.job` | **PASS** (2026-11-08): `pg_cron` não instalado em nenhum database; nenhum job | reconfirmar no J0 |
| A8 — janela com RAFACELL e Rafa Brinquedos fechadas | **pendente** (1 sessão de caixa ABERTA na leitura de 2026-11-08) | dono: data/hora + congelamento |
| V1 — inventário de escritores | atualizado (§11 do `KG_RELEASE_READINESS_A4_A8.md`); residual: projeto `omni-gestao` com banco de destino não comprovável sem decriptar | dono: confirmar/neutralizar o `omni-gestao`; refazer a lista no J0/J7 |
| N1 — ponto de recuperação Neon (J1) | **não autorizado** | dono |
| L1 — conferência presencial das duas lojas | **pendente** | este roteiro, em cada terminal |
| F1 — ativação KG por loja | **desligada** (`PDV_MANUAL_KG_*` ausentes) | autorização separada, depois de W1–W3 estáveis |
| Revisão cruzada Codex da #336 | **pendente** — sem cota até 2026-11-10 21:48 | repetir a partir dessa data |
| Ordem de merge | #315 → #335 → #336 → #337, merge commit, cada uma retargetada para `main` só no seu passo | dono, na janela |
| Compatibilidade com a main atual (`ce9228c`) | **PASS** — pilha reconciliada sem conflito; testes, build e E2E verdes | se a main andar de novo: reconciliar e repetir CI |
| Migrations de outras frentes (MIG-X) | **PASS hoje** — a `20261107` do catálogo já está em Production; pendentes = só as 3 KG | reconferir antes de J4/J8/9b (runbook §0.1); qualquer outra pendente = NO-GO |

### Atualização do painel — 2026-11-08, GOAL `PADARIA-KG-FINAL-HARDENING-RELEASE-EXECUTION-001` (prevalece sobre a tabela acima)

| Gate | Situação | Quem decide / próximo passo |
| --- | --- | --- |
| A6 — script `07` | **DECIDIDO pelo dono em 2026-11-08: aplicar no J9** (`APPROVED_APPLY_07`, `W1_J9_ONLY`); sha256 LF `dea40868a5458e1cceeeae90c9db5ff91a7e291432326269fca932fca5d51935` conferido; reensaio PG 17: 235/235 + 161/161, suíte KG 80/80 com os 5 CHECKs ativos | execução **ainda não autorizada**: só no J9, com a autorização da janela (A8) |
| A7 — sessões/conectores escritores | **pendente** | dono: desligar conectores/MCPs/agentes com credencial `neondb_owner` ou Vercel de produção (inclui os arquivos `C:\Projetos\secrets\neon-*.env`) e listar as sessões encerradas |
| A7b — `cron.job` | **PASS** (reconfirmado 2026-11-08 11:17Z: só `plpgsql`) | reconfirmar no J0 |
| A8 — janela | **pendente**; 1 sessão de caixa ABERTA na leitura das 11:17Z | dono: data/hora, lojas fechadas, caixas fechados pelo operador |
| V1 — escritores antigos | **PASS de inventário**: projeto `omni-gestao` **não alcança** o Neon de produção (envs de 2026-05-08; projeto/endpoint Neon criados em 2026-07-27); Production atual, 7 Production antigos e previews pré-P3 do `omni-gestao-pro` usam `neondb_owner` → barreira = J6 `04`+`05`, conferida no J7 | demonstração da barreira só na janela (J7); refazer inventário no J0/J7 |
| MIG-X | **PASS** (24 migrations, checksums iguais ao repositório; pendentes exatas por checkout) | repetir no J4/J8/9b |
| N1 — ponto de recuperação Neon | **não autorizado** | dono |
| L1 — conferência presencial RAFACELL e Rafa Brinquedos | **pendente** | roteiro acima, em cada terminal |
| F1 — ativação KG por loja | **desligada** (`PDV_MANUAL_KG_*` ausentes) | autorização separada por loja, depois de W1–W3 |
| R3 Codex (#336) | **PENDING** — reconfirmado sem cota às 2026-11-08 (`try again at Nov 10th, 2026 9:48 PM`) | repetir após essa data **ou** exceção expressa do dono, registrada com justificativa |
| Revisão substituta (contexto limpo) | APPROVE_WITH_NOTES; P2-1 corrigido (cancelamento de venda com marcador KG e só linhas UN) | não substitui o R3 Codex |
| Contrato F8 em venda mista KG+UN | **DECIDIDO PELO DONO (2026-11-09)**: trocas/devoluções por peso PERMITIDAS por padrão, por linha e por loja (`printerConfig.pdvTrocasPeso`, padrão ATIVADO, alterável por proprietário/gerente na UI de Configurações → PDV → Trocas e Devoluções). A política anterior de recusar TODAS as linhas da venda KG foi **SUBSTITUÍDA** (GOAL `PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001`, PR #336) | concluído — sem ação do dono; para recusar trocas por peso numa loja, desativar na própria loja |
| Branch Neon `kg-rehearsal-002-temp` (cópia do ensaio de 2026-10-26) | existe; não removida | dono: autorizar remoção quando quiser (dados sintéticos/cópia) |
