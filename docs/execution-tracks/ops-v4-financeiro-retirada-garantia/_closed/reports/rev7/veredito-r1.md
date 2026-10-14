Solicito alterações: **2 achados P1 e 5 P2**.

Bloqueadores:

1. **P1 — Resposta antiga pode disparar pagamento após A→B→A.**  
   [use-v4-preview.ts:2377](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/use-v4-preview.ts:2377) compara apenas os IDs atuais. Se o operador sair de A e voltar antes da resposta da aprovação, `noAlvo()` volta a ser verdadeiro e executa o recebimento da visita anterior. A reprodução em memória resultou em `status: "recebido"` e uma chamada ao pagamento.  
   **Correção:** capturar uma geração da seleção e invalidar a continuação após qualquer troca de OS/loja; conferir também se a instância original do formulário continua ativa.

2. **P1 — A aprovação não está vinculada ao escopo consentido.**  
   [orcamento-actions.ts:508](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/orcamento-actions.ts:508) chama a aprovação apenas com loja e OS. O núcleo aprova o orçamento mais recente, sem comparar revisão ou conteúdo exibido ao operador. Reproduzi uma troca de serviço mantendo o total: a action devolveu `ok: true` e aprovou o serviço diferente. O CAS de saldo não detecta essa mudança de escopo.  
   **Correção:** enviar a identidade do orçamento conferido e compará-la sob a trava da aprovação; exigir nova conferência e consentimento quando houver mudança.

3. **P2 — Resultado incerto não preserva o conteúdo original da formalização.**  
   [FormalizarAprovacaoV4.tsx:90](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/FormalizarAprovacaoV4.tsx:90) recompõe a requisição a partir dos campos atuais. Após `incerto`, motivo, evidência e declarações continuam editáveis. Em componente montado, alterei o motivo e cliquei em “Reenviar”: foi enviada a mesma `operacaoId` com conteúdo diferente. Se o primeiro envio tiver sido gravado, isso produz conflito em vez de recuperar o resultado.  
   **Correção:** conservar uma cópia imutável da confirmação original e reenviá-la até obter resultado definitivo.

4. **P2 — Algumas recusas deixam um botão habilitado que não envia.**  
   [FormalizarAprovacaoV4.tsx:109](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/FormalizarAprovacaoV4.tsx:109) zera `operacaoId` para toda resposta com `naoRegistrada`, mas limpa a conferência somente em `escopo_divergente`. Reproduzi `vencido_sem_ratificacao`: “Formalizar aprovação” permaneceu habilitado, o clique seguinte não chamou a action e “Conferir de novo” não apareceu.  
   **Correção:** oferecer nova conferência após essas recusas, recalculando vencimento e identidade e solicitando novamente as declarações pertinentes.

5. **P2 — A conferência da formalização apresenta escopo e valores incorretos.**  
   [formalizacao-aprovacao-model.ts:210](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/formalizacao-aprovacao-model.ts:210) lista todas as alternativas e usa valores brutos, ignorando seleção, desconto da linha e `kindV3`. Reproduzi orçamento de R$ 300 com serviço selecionado de R$ 400 menos R$ 100, alternativa não selecionada de R$ 450 e brinde de R$ 20: a conferência mostrou os três valores brutos, sem distinguir essas condições.  
   **Correção:** apresentar o escopo efetivamente escolhido usando os helpers existentes de valor ao cliente e identificar cortesias e alternativas excluídas, preservando a assinatura completa para revalidação.

6. **P2 — O writer a prazo não cumpre a garantia de replay do item A.**  
   [pdv-servico-actions.ts:768](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/pdv-servico-actions.ts:768) entra diretamente na elegibilidade. `LancarAPrazoInputV3` não recebe identidade da operação e não existe consulta de replay. Na reprodução em memória, repetir o lançamento gerou duas atualizações do título e dois eventos; depois de mudar o comercial para rascunho, o reenvio foi recusado em vez de devolver o original.  
   **Correção:** implementar identidade e fingerprint persistidos, com replay autenticado sob a trava e antes da elegibilidade, conforme exigido para os três writers.

7. **P2 — O misto descarta o motivo comercial estruturado e o destino.**  
   [recebimento-misto-service.ts:479](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/recebimento-misto-service.ts:479) transforma todas as recusas em `comercial_nao_elegivel`, conservando apenas a mensagem. A resposta final em [pdv-servico-actions.ts:930](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/pdv-servico-actions.ts:930) também não contém o destino. Assim, `VALORES_DIVERGENTES → financeiro` e `APROVACAO_COMERCIAL_PENDENTE → comercial` perdem a distinção contratada.  
   **Correção:** preservar código e destino da regra única na recusa, no registro terminal, no replay e na resposta à UI.

Melhorias P3: nenhuma registrada.

A revisão foi estática e por reproduções em memória, sem banco ou escrita em arquivos. Confirmei os 38 caminhos dentro da allowlist, `lovable/api/os.ts` intocado, `git diff --check` limpo e HEAD final inalterado. As suítes PostgreSQL e E2E informadas pelo executor não foram reexecutadas nesta revisão.

```text
R_HEAD_REVIEWED=2223aa3e59e82243261232a033569d0f02339d16
R_FAMILY=openai
R_VERDICT=REQUEST_CHANGES
P0=0
P1=2
P2=5
P3=0
```