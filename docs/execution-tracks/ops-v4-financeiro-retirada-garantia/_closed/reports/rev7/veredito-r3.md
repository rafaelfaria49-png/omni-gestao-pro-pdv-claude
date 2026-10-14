Solicito alterações: **2 bloqueadores P1**.

**Bloqueadores**

1. **P1 — Erro lançado libera a confirmação sem comprovar o resultado da operação anterior.**  
   [use-pdv-servico-v3.ts:106](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v3/hooks/use-pdv-servico-v3.ts:106) considera erros comuns e qualquer erro com `digest` como resposta definitiva. Essa classificação controla a liberação da pendência em [use-pdv-servico-v3.ts:247](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v3/hooks/use-pdv-servico-v3.ts:247).

   Reproduzi com o hook e writer reais, usando React e Prisma em memória:
   - R$ 100 gravados sobre saldo de R$ 420; resposta perdida como `Error("Connection closed.")`; reenvio após trocar a sessão gera outra chave, com saldo esperado de R$ 320. Resultado: **dois pagamentos de R$ 100 e duas operações de caixa**. Confirmei que o cliente React Flight de produção instalado gera exatamente esse erro, sem `digest`, quando o stream termina incompleto.
   - Após `TypeError`, a confirmação fica preservada; porém, uma recusa de permissão no reenvio a libera **antes da consulta de replay**. Restaurada a permissão e alterada a sessão, outra chave também permite a segunda baixa.

   **Correção sugerida:** preservar a confirmação original enquanto não houver resultado terminal comprovado para aquela chave. Erros de transporte, autenticação/permissão e falhas anteriores ao replay não comprovam ausência de registro. Usar resposta estruturada do servidor que distinga esses casos.

2. **P1 — O recebimento misto contorna uma pendência imediata no PDV V3.**  
   [PdvServicoV3.tsx:194](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v3/pages/PdvServicoV3.tsx:194) não considera `pendenciaReceber` ao habilitar o misto. Em [use-pdv-servico-v3.ts:294](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v3/hooks/use-pdv-servico-v3.ts:294), `registrarMisto` consulta somente a pendência mista e gera uma nova chave.

   Reproduzi na **tela real do PDV V3 montada**, com hook e writers reais sobre Prisma em memória: pagamento imediato de R$ 100 gravado, resposta perdida por `TypeError`, saldo relido como R$ 320. Com “Resultado não confirmado” ainda visível, foi possível selecionar pagamento dividido e confirmar **R$ 100 + R$ 220 a prazo**. O botão permaneceu habilitado; o writer aceitou a nova chave. Resultado: **dois pagamentos de R$ 100, duas operações de caixa e a pendência original ainda aberta**.

   **Correção sugerida:** tornar a pendência exclusiva por loja/OS entre os caminhos imediato e misto. Bloquear novas confirmações na interface e no hook até reconciliar a confirmação original.

**Conferência da R2**

| Achado | Resultado no candidato |
|---|---|
| R2-1 — Reenvio incerto | Parcialmente corrigido; permanecem os dois bloqueadores acima. |
| R2-2 — Materialização fora da transação | Corrigido: conferência e gravação usam o mesmo `tx`; não há materialização independente sobrevivendo à transação externa. |
| R2-3 — Garantia divergente | Corrigido: exibida a garantia do snapshot conferido. Reprodução confirmou mudança de 180 para 30 dias acompanhada de mudança na assinatura. |
| R2-4 — Período fechado antes do replay | Corrigido: reprodução do writer real devolveu o lançamento original após mudança comercial e fechamento do período, sem novas escritas em memória. |

Os corretivos da **R1 permanecem presentes**: gerações de seleção/loja e instância ativa (R1-1); comparação do conteúdo consentido sob trava (R1-2); confirmação original da formalização preservada (R1-3); nova conferência após recusas definitivas (R1-4); valores efetivos e condições das linhas identificados (R1-5); identidade e replay a prazo (R1-6); código e destino comercial preservados no writer misto, registro terminal e resposta da action (R1-7).

**Melhorias P3:** nenhuma.

Revisei o diff completo base..HEAD. São **39 caminhos**, todos na allowlist; `lovable/api/os.ts` e `goals/**` permanecem intocados. `git diff --check` passou. HEAD e árvore limpa foram preservados. Executei apenas reproduções em memória, sem arquivos ou banco; não reexecutei PostgreSQL, E2E ou build.

```text
R_HEAD_REVIEWED=6155b4d0d3f905c99f45ade0b029e566bd64a672
R_FAMILY=openai
R_VERDICT=REQUEST_CHANGES
P0=0
P1=2
P2=0
P3=0
```