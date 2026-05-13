# Checklist operacional — Fase 1 (testes reais)

**Produto:** OmniGestão Pro  
**Escopo:** validação manual na UI com sessão real, loja ativa e dados reais.  
**Pré-requisitos automatizados (referência):** `npm run db:smoke`, `npx tsc --noEmit`, `npm run test`, `npm run build` devem estar verdes antes ou durante a campanha de testes.

---

## 1. Ambiente

Antes de iniciar os módulos, confirmar:

- [ ] `npm run dev` em execução (ou ambiente de homologação equivalente).
- [ ] **Loja ativa** correta no header/seletor (cookie `assistec-active-store` / contexto alinhado à unidade desejada).
- [ ] **Usuário logado** (NextAuth ou fluxo de acesso vigente) com o papel que está sendo testado.
- [ ] **Dados reais preservados:** evitar exclusões em massa; usar valores de teste acordados quando possível.
- [ ] **Smoke DB:** `npm run db:smoke` — conexão Prisma OK e leitura de amostra (ex.: `Cliente`).

**Observação:** não alterar schema Prisma nem regras de negócio durante esta fase; apenas observar e registrar.

---

## 2. PDV

Marque cada item após executar e validar na UI.

- [ ] Abrir caixa (sessão aberta, operador e loja corretos).
- [ ] Realizar **venda simples** (itens, totais, forma de pagamento).
- [ ] Verificar venda no **Histórico de Vendas**.
- [ ] Abrir **detalhe da venda** (dados consistentes com o PDV).
- [ ] **Imprimir** ou **copiar cupom** (conteúdo legível e coerente).
- [ ] **Devolução parcial** (estoque e valores conforme política).
- [ ] **Cancelamento** da venda (apenas se o perfil e o estado permitirem).
- [ ] **Fechar caixa** (fechamento sem erro; totais conferem).
- [ ] Verificar **Histórico de Caixa** (sessão vinculada, status, valores).
- [ ] Conferir impacto em **financeiro** e trilha de **auditoria** (quando aplicável ao fluxo).

---

## 3. Financeiro

- [ ] **Movimentação** gerada corretamente a partir do evento de teste (ex.: venda/OS).
- [ ] **Fluxo de caixa** reflete entradas/saídas esperadas no período.
- [ ] **DRE** (ou relatório equivalente) coerente com os lançamentos de teste.
- [ ] **Relatórios** principais abrem e os números batem com o cenário conhecido.
- [ ] **Exportação** CSV e/ou XLSX (arquivo válido, encoding e colunas utilizáveis).
- [ ] **Fechamento** (dia/mês conforme módulo): conclusão sem inconsistência óbvia.
- [ ] **Conciliação** (marcação, vínculo, estados).
- [ ] **Bloqueio de período fechado:** tentativa de alteração em período fechado é impedida com mensagem clara.

---

## 4. Operações HUB

- [ ] **Criar OS** (cliente/aparelho mínimo preenchido, loja correta).
- [ ] Incluir **orçamento**.
- [ ] Incluir **peça** e/ou **serviço** no orçamento.
- [ ] **Aprovar** orçamento (status e timeline).
- [ ] **Gerar cobrança** (financeiro vinculado conforme esperado).
- [ ] Validar **estoque** (baixa/reserva conforme política).
- [ ] **Entregar** OS (status final e alertas).
- [ ] **Garantia** gerada/preenchida conforme fluxo.
- [ ] **Checklist** técnico preenchido e persistido.
- [ ] **Retirada** confirmada (quando aplicável ao tipo de OS).
- [ ] **Impressão** da OS (layout e dados essenciais).

**Validações cruzadas:** timeline, status, financeiro, estoque, garantia, barras de alerta.

---

## 5. WhatsApp

- [ ] **Loja ativa** correta antes de abrir o inbox (header `x-assistec-loja-id` / seletor de loja).
- [ ] **Inbox** carrega conversas da loja ativa (sem misturar outra unidade).
- [ ] **Quick reply** cria/edita/remove e uso na conversa.
- [ ] **Etiqueta** em conversa (adicionar/remover; lista por loja).
- [ ] **Envio** de mensagem (outbound OK; não alterar webhook core para testes).
- [ ] **Trocar de loja** e confirmar recarga de conversas, etiquetas e respostas rápidas da nova unidade.

---

## 6. Permissões

Repetir visão mínima de **sidebar**, **rotas críticas** e **ações bloqueadas** para cada papel (contas de teste distintas recomendadas).

| Papel    | Sidebar coerente | Acesso negado onde esperado | Ações bloqueadas (UI/API) |
|----------|------------------|-----------------------------|---------------------------|
| Admin    | [ ]              | [ ]                         | [ ]                       |
| Gerente  | [ ]              | [ ]                         | [ ]                       |
| Caixa    | [ ]              | [ ]                         | [ ]                       |
| Técnico  | [ ]              | [ ]                         | [ ]                       |
| Vendedor | [ ]              | [ ]                         | [ ]                       |

---

## 7. Modelo de registro de bug

Copie linhas na tabela abaixo para cada não conformidade. **Fase 1:** corrigir apenas bugs pequenos e localizados; problemas estruturais ficam documentados para fase posterior.

| Data (ISO) | Módulo   | Passo (ref. seção) | Resultado esperado | Resultado obtido | Severidade (baixa/média/alta/crítica) | Status (aberto/em análise/corrigido/adiado) |
|------------|----------|--------------------|--------------------|------------------|---------------------------------------|---------------------------------------------|
| AAAA-MM-DD | ex.: PDV | §2 item …          |                    |                  |                                       |                                             |

**Campos sugeridos em notas livres (fora da tabela):** navegador, URL, `storeId`, usuário/papel, prints ou ID de entidade (OS, venda, etc.).

---

## 8. Critério de aprovação da Fase 1

A fase é considerada **aprovada** quando **todas** as condições abaixo forem atendidas:

1. **Ambiente (§1):** checklist completo; smoke DB OK na janela do teste.
2. **PDV (§2):** todos os itens obrigatórios marcados; nenhum bug **crítico** ou **alto** aberto sem plano (correção imediata ou adiamento explícito com dono).
3. **Financeiro (§3):** todos os itens marcados; exportações e fechamento/conciliação/bloqueio validados no cenário acordado.
4. **Operações HUB (§4):** fluxo ponta a ponta executado pelo menos uma vez por loja de referência; impressão e garantia verificadas.
5. **WhatsApp (§5):** multiloja e envio validados; sem alteração ao core do webhook para “contornar” teste.
6. **Permissões (§6):** matriz de papéis preenchida; sem acesso indevido a rotas sensíveis.
7. **Registros (§7):** bugs encontrados documentados; bugs **pequenos** corrigidos ou triados com decisão explícita.

**Não obrigatório nesta fase:** cobertura Playwright/automação E2E (prevista para fase futura).

---

## Validações de build (referência rápida)

```bash
npx tsc --noEmit
npm run build
```

Registrar no rodapé da campanha: data, branch/commit e resultado (OK / falha + log resumido).

---

*Documento oficial Fase 1 — testes operacionais reais. Atualizar versão ou data no rodapé ao revisar o checklist.*
