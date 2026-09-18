# PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007 — Resumo da prova de browser

- Método: app real (`next dev` local, banco de dados de desenvolvimento), login e2e real,
  eventos de teclado reais via Playwright headless. Dados sintéticos (códigos `XK9001`/`XK9002`,
  inexistentes no catálogo). **Nenhuma venda financeira real concluída** (Item Avulso não baixa
  estoque e os carrinhos não foram finalizados).
- Especificação temporária (não commitada) dirigiu a mesma suíte de comportamentos nas 4
  superfícies; screenshots em `PDV_SCAN_UNREGISTERED_ACTION_SETTINGS_007/`.

## PNGs (7/7)

| Arquivo | O que prova |
|---|---|
| `01-configuracao.png` | Seção canônica **Leitor de Código de Barras** na UI V3 (PdvSection) com as 3 opções; `open_avulso` escolhido pela UI, salvo e **marcado sozinho após reload** (persistência server-side). |
| `02-avisar-continuar.png` | Modo A no Clássico/Rápido: overlay `Produto não cadastrado · XK9001` **sem** hint de Insert; input `value=""` e focado. |
| `03-avisar-insert.png` | Modo B no Supermercado/Rápido: overlay com `· Insert para Item Avulso`; campo focado. |
| `04-autoabrir-item-avulso.png` | Modo C no Clássico: miss scan-like abre o Item Avulso **uma única vez** (1 dialog contado; 2º Enter/CR-LF inerte). |
| `05-item-avulso-codigo-contexto.png` | Código `XK9001` **semeado** no campo Código de barras/SKU + badge `capturado do bipe`; foco na Descrição. |
| `06-cancelar-volta-bipe.png` | Cancelar: modal fecha, contexto limpo, Código/Bipe vazio e focado. |
| `07-concluir-volta-bipe.png` | Concluir: exatamente **1** linha "Item prova GOAL007" adicionada; Código/Bipe focado. |

## Matriz de validação (asserções Playwright, além dos PNGs)

| Superfície | Modo A (sem hint, foco, campo vazio) | Modo B (hint + Insert abre com código + cancelar volta foco) | Modo C (autoabre com código) | Busca manual ("capinha samsung") não abre modal |
|---|---|---|---|---|
| Clássico/Rápido | ✅ (02) | ✅* | ✅ (04–07) | ✅ |
| Supermercado/Rápido | — | ✅ (03) | — | — |
| Assistência/Rápido | — | ✅ | — | — |
| Venda Completa | ✅ | — | ✅ | — |

\* Modo B no Clássico usa o mesmo caminho de código validado em Supermercado/Assistência
(hint via estado do aviso; Insert via `openItemAvulso` com contexto) — cobertura por
unit + contrato estático + paridade de implementação.

Isolamento por loja: provado por teste da camada de resolução
(`lib/pdv-settings-server-first.test.ts`, blob por loja, sem fonte global) e pelas
leituras/escritas reais de `/api/stores/[id]/settings` durante a prova.

## Observações de ambiente (não-bloqueantes)

- Servidor de dev compartilhando o Postgres local com outra instância ativa do usuário:
  latência de até ~25 s em `GET/PUT /api/stores/[id]/settings` e ECONNRESET pontuais exigiram
  esperas determinísticas (poll pós-PUT, espera da resposta de settings antes de interagir).
  Nenhuma falha de aplicação; tudo reprovado por timeout de infraestrutura.
- Uma corrida legítima descoberta pela prova e corrigida neste GOAL: a autoabertura (modo C)
  e o hint/contexto agora valem **apenas para miss scan-like** — miss de busca textual
  (ex.: "capinha samsung") preserva integralmente a semântica do GOAL 005.
