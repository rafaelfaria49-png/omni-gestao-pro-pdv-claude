<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B2-PIN-KEYMAP-001",
  "track": "pdv",
  "title": "N5-B2 — política conservadora de PIN e teclado nas quatro superfícies",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-b2-pin-keymap-001",
  "worktree": "C:/Projetos/omni-gestao/.worktrees/pdv-n5-b2-pin-keymap-001",
  "test_command": "npx vitest run lib/pdv/parity-keymap.test.ts lib/pdv/parity-pin-keymap.component.test.ts lib/pdv-assistencia-shortcuts.test.ts",
  "allowlist": [
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/pdv-omni-classic-shell.tsx",
    "lib/pdv-keymap.ts",
    "lib/pdv/parity-keymap.ts",
    "lib/pdv/parity-keymap.test.ts",
    "lib/pdv/parity-pin-keymap.component.test.ts",
    "docs/pdv/PDV_N5_B2_PIN_KEYMAP_001.md",
    "docs/ai-execution/_evidence/PDV-PARITY-N5-B2-PIN-KEYMAP-001.md"
  ],
  "gates_liberados": [],
  "read_budget": 45,
  "plan_ref": "PDV-N5-FINAL-HANDOFF-B2-C-001",
  "plan_rev": 1,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta — mudanças locais de teclado e apresentação revertíveis por Git, sem mutação de dados",
  "successor": "PDV-PARITY-N5-C-E2E-002",
  "stop_after_goal": true,
  "autorizacoes": { "commit": true, "push": true, "branch_only": "goal/pdv-parity-n5-b2-pin-keymap-001", "merge": false }
}
-->

# N5-B2 — PIN e keymap

## Entrada e autorização

Planejado em 14/10/2026 pelo pedido humano `PDV-N5-FINAL-HANDOFF-B2-C-001`.
Este documento READY não inicia implementação na entrega de planejamento.
Executar somente em sessão futura, após merge humano do PR de plano e comando
humano para iniciar B2. Criar a branch/worktree acima de `origin/main` atualizada;
rodar `status pdv`, `open pdv` e ler este GOAL. Não usar a worktree do plano.
Commit e push estão autorizados exclusivamente na branch declarada, dentro
da allowlist. Merge exige ato humano. Nenhum gate de auth, dados, CI ou deploy
está liberado. Se for necessário sair da allowlist, parar para replanejamento.

Base publicada: PR #269, merge `a70469ddb96ba60f9575ab8036a78a71da35d35d`.
N5-B1 001/002/003 DONE; 004 BLOCKED por dependência de Auth.js e ausência de
validação de sessão, loja e terminal. Não reabrir 004, corrigir Auth.js, repetir
smoke produtivo, R4, build ou Docker nesta trilha.

## Objetivo e fronteira

Concluir a política de PIN e o comportamento de teclado em `classic`,
`assistencia`, `supermercado` e `venda-completa`. Incluir a implementação
necessária e os testes focados neste mesmo GOAL, sem refatoração ampla.
Next/Black não são superfícies oficiais; rápido é modo, não quinta superfície.

Decisão de produto conservadora: manter o PIN já exigido no Supermercado;
não introduzir PIN automaticamente nas outras três superfícies; não enfraquecer
autorização existente. Preservar exceções intencionais de perfil/modo já existentes
sem ampliá-las. Clique e teclado devem atravessar a mesma autorização da ação.
Verificador/API de PIN e Auth.js são somente referências read-only; não criar
autenticação paralela, fallback permissivo ou persistência de PIN no cliente.

## Matriz de decisão de teclado

Confrontar a extração N5-A com o runtime atual antes de editar. Atualizar tabela,
handlers, ajuda e testes juntos; diferenças de domínio intencionais não exigem
renumeração global. Esta é a política a implementar, não evidência de PASS.

| Tecla | classic | assistencia | supermercado | venda-completa |
| --- | --- | --- | --- | --- |
| F1 | pagamento | pagamento | pagamento, alias seguro da primeira forma rápida | finalizar/pagamento |
| F7 | colocar/retomar espera | colocar/retomar espera | colocar/retomar espera | colocar/retomar espera |
| Insert | item avulso | item avulso | item avulso | item avulso |
| Escape | fechar/limpar contexto; regra explícita do modo rápido | idem | idem, preservando política PIN | fechar ajuda/entrada/modal pertinente |
| F2 | cliente | cliente | primeira forma rápida, diferença intencional | buscar/limpar cliente |
| F4 | quantidade | quantidade | terceira forma rápida, diferença intencional | sem novo atalho obrigatório |
| F5 | recebimento de contas | remoção com confirmação consciente, nunca exclusão imediata por colisão | sem novo atalho obrigatório | sem novo atalho obrigatório |
| F10 | pagamento com desconto no modal | desconto no pagamento | cliente/CPF, diferença intencional | sem novo atalho obrigatório |

F3 do Supermercado (segunda forma rápida), F8/F9/F12 e demais atalhos específicos
intencionais são preservados e documentados. Ausência de atalho deve aparecer
como tal na ajuda, sem prometer efeito inexistente. F1 não é ajuda.
N5-A registrou F1 ausente no handler do Supermercado apesar da auditoria §A.3;
o alias acima exige implementação e prova, não simples alteração da tabela.

Impedir ações destrutivas acidentais: input/textarea/contenteditable, dropdown,
diálogo aberto, repetição da tecla e request em voo não podem deixar um evento
vazar para remover item, limpar carrinho ou confirmar venda. Escape que fecha
um modal não pode também remover item. Remoção rápida só em modo explicitamente
ativo, contexto válido e uma ação por evento, respeitando as exceções vigentes;
não ativar modo rápido implicitamente. Cancelamento/limpeza conservam confirmação
e PIN onde exigidos. F5 na Assistência deve oferecer decisão explícita antes da
remoção, preservando o atalho sem apagar ao esperar recebimento.

Ajuda, barras, hints e mensagens devem descrever o runtime de cada superfície e
modo, inclusive colisões mantidas e gates; remover promessas de atalhos mortos
em vez de introduzir ações desnecessárias. F7/Insert respeitam capability/modal;
pagamento conserva caixa, cliente quando obrigatório e proteção de concorrência.

## Testes e critérios de aceite

- Atualizar `parity-keymap.test.ts` para provar a matriz final sem congelar os
  erros antigos de ajuda. Reusar helpers/fixtures existentes onde bastam.
- Criar somente a prova comportamental faltante em
  `parity-pin-keymap.component.test.ts`: montar as quatro superfícies reais,
  simular teclas e observar efeitos, sem substituir handlers por mocks.
  I/O pode ser sintético, identificado como tal; nenhuma escrita produtiva.
- Provar PIN existente no Supermercado (negação/erro não remove nem limpa,
  autorização permite só a ação solicitada), ausência de PIN novo nas demais,
  F1/F7/Insert/Escape, colisões F2/F4/F5/F10, foco/input/modal, repeat e ajuda
  coerente. Não aceitar somente busca de strings como prova do efeito.
- `test_command` verde e `npm run typecheck` verde se houver `.ts`/`.tsx`;
  registrar contagens e comandos. Nenhuma alteração de config, rota, schema,
  Server Action, motor de venda/financeiro/estoque, fiscal ou Auth.js.
- Publicar a matriz final de PIN/teclas em `docs/pdv/PDV_N5_B2_PIN_KEYMAP_001.md`
  e evidências no arquivo próprio da allowlist, incluindo limites da prova.
- Revisão R obrigatória por família declarada diferente de `openai`
  (`anthropic` ou `humano`, conforme `executors.json`). Registrar revisor,
  família, SHA revisado, diff/allowlist, teste e veredito. Outra instância
  OpenAI não cumpre R. Sem R favorável, não declarar aceite/encerrar DONE.

## Encerramento

Usar staging por caminhos explícitos e commit `goal(pdv-001): ...`;
`check pdv`/`close pdv` somente após testes e R favoráveis. O script gera o
commit de estado; não editar ledger/state/registry manualmente. Push somente
da branch deste GOAL e apresentar entrega revisável para merge humano.
Parar após B2, obedecendo NEW_SESSION por risco ALTO. Não abrir nem implementar
C na mesma execução. C só começa em sua própria worktree após B2 DONE,
revisado e publicado em main, e novo comando humano.
