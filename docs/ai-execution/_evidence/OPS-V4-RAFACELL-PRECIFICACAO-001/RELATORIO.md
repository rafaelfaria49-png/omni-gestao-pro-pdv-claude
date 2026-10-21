# OPS-V4-RAFACELL-PRECIFICACAO-001

Data: 18/10/2026. Entrega local; publicação bloqueada pelo fluxo de envio descrito abaixo.

## Pré-flight e isolamento

- Repositório canônico: `C:/Projetos/omni-gestao`, origin `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.
- Checkout inicial: `codex/db-migration-reconciliation-001`, HEAD `5ae661d730af827006fd10c389ddbdd4f18edc51`, com WIPs de outras frentes. Preservado, sem checkout/reset/stash/clean.
- `git fetch origin main` confirmou `origin/main` em `976ebaa294e09441ce0c5be7bbe5776a568f4013`.
- Branch criada: `codex/ops-v4-rafacell-precificacao-001`.
- Worktree: `C:/Projetos/omni-gestao/.worktrees/ops-v4-rafacell-precificacao-001`, inicialmente limpa, na mesma base acima. Branches/worktrees paralelas preservadas.
- Lidos ENTRYPOINT AEP, AGENTS, CLAUDE, índice/regras de governança, CURRENT_STATUS e roadmap de Operações. AEP opt-in inativo: `.aep-active` ausente. Nenhum state/ledger/registry editado.
- Dependências locais reutilizadas por junção `node_modules`; cliente Prisma gerado somente nesta worktree. Nenhum schema/migration modificado ou aplicado.

## Contratos auditados e implementação

- `orcamento-model.ts`: linhas `brinde` custam internamente e cobram zero; grupos sem escolha produzem faixa; seleção soma uma alternativa.
- `orcamento-rapido-model.ts`: itens fixos e variantes são montados como `ServicoV3`. As novas cortesias ficam fora do grupo, uma linha por item, sem vínculo de estoque.
- `orcamento-rapido-actions.ts`: a criação continua em `criarOrcamentoRapidoV3` → geração/salvamento canônicos V3; nenhuma action ou motor de OS novo.
- `precificacao-telas.ts`: função pura em centavos, validação de inteiros seguros e multiplicação racional com BigInt. Meio centavo arredondado para cima. Valores fora de duas casas decimais/limite seguro são recusados, sem aproximação silenciosa.
- UI: opt-in por proposta, botão **Sugerir preço** por alternativa, prévia da sugestão e botão **Aplicar sugestão**. Nenhuma mudança automática de preço ao editar custo. Preço aplicado permanece editável.
- Refinamento visual da interface existente: tipografia e tokens semânticos `C` preservados, campos das alternativas empilhados no celular, nomes acessíveis para preço/custo/garantia e anúncio da sugestão/resultado. Sem redesign ou dependência nova.
- Capinha e película entram como cortesias fixas de R$ 0,00, com custos de referência editáveis de R$ 3,50 e R$ 1,50. Reativar o checkbox não duplica as linhas; cortesias vindas do prefill também são reconhecidas.
- Resultado bruto por alternativa: simulação de uma escolha em cópias, pelo motor V3, com valores internos convertidos para centavos. Inclui itens fixos uma vez. Sem mão de obra, reserva de garantia, tributo ou taxa criados automaticamente. Sem custo informado na opção/itens fixos, o resultado fica indisponível.
- Para uma proposta somente de tela e kit, resultado = preço revisado − custo da tela − R$ 5. Havendo outros itens fixos, seus valores/custos informados entram pelo mesmo motor; custo desconhecido impede estimativa completa.
- Garantias existentes são preservadas; a sugestão não define prazo/cobertura. Placeholder de prazo não sugere mais 90 dias.

## Multi-loja, permissões e privacidade

- Auditados `StoreSettings`, `StoreSettingsBlob` e configuração existente. Não há contrato de precificação de telas por loja. Não foi usado `printerConfig` para simular uma configuração comercial.
- Regra desligada ao abrir o modal. Troca de loja remonta o formulário, descarta ativação/preços/custos/cortesias e impede reutilizar o prefill da loja anterior. Nenhum localStorage, configuração remota ou nome/ID de estabelecimento hardcoded.
- A regra aprovada para a RafaCell só é aplicada por opção explícita na proposta; não vira padrão de outros estabelecimentos.
- A matriz enterprise não define uma ACL granular de visualização de custos. Mantidos o contexto interno de edição de custos já existente e os guards canônicos da criação/salvamento; sem ampliar permissões, alterar auth/proxy ou introduzir outra rota de leitura.
- Nenhuma informação interna nova é passada à observação do cliente. O mapper envia somente campos canônicos do orçamento; identificador local da cortesia não é enviado.
- Projeção `orcamento-cliente-view.ts`, mensagem `orcamento-mensagem.ts` e documento `OrcamentoClienteDocV4` permanecem com whitelist explícita. Testados com custos e cortesias: nenhum custo, resultado bruto ou metadado interno no conteúdo público. Testado o HTML usado na impressão/PDF; nenhum PDF foi enviado/gerado contra dados reais.
- Sem fornecedores, Hermes, integração de WhatsApp, mensagens a clientes, baixa/reserva de estoque, vendas ou movimentos financeiros. A prévia se identifica como estimativa não realizada, nunca como lucro líquido.

## Faixas verificadas

Valores em reais; resultado da alternativa com kit completo, sem outros itens fixos.

| Custo da tela | Preço sugerido | Resultado bruto estimado |
|---:|---:|---:|
| 60,00 | 260,00 | 195,00 |
| 80,00 | 280,00 | 195,00 |
| 100,00 | 300,00 | 195,00 |
| 130,00 | 330,00 | 195,00 |
| 200,00 | 400,00 | 195,00 |
| 201,00 | 402,00 | 196,00 |
| 230,00 | 460,00 | 225,00 |
| 350,00 | 700,00 | 345,00 |
| 500,00 | 1.000,00 | 495,00 |
| 700,00 | 1.400,00 | 695,00 |
| 701,00 | 1.401,00 | 695,00 |
| 1.000,00 | 1.700,00 | 695,00 |
| 1.001,00 | 1.701,70 | 695,70 |
| 1.500,00 | 2.550,00 | 1.045,00 |

Também cobertos limites fracionários (200,01; 700,01; 1.000,01), arredondamento de meio centavo, overflow, custos ausentes/inválidos, alteração do custo de referência e resultado negativo.

## Validação

- Testes focados de lógica/contratos: **256/256**, 12 arquivos. Incluem os modelos/actions canônicos de orçamento V3 e os contratos de formulário, projeção, mensagem, seleção e prefill V4.
- Testes montados desta entrega: **6/6**. Opt-in, revisão, preço manual, sugestão invalidada por mudança de custo, custo ausente, save canônico em rascunho, cortesias, troca de loja, reabertura e HTML público.
- Regressão montada `test/ops-datas-retroativas-001`: **30/30**, 3 arquivos, com `--maxWorkers=1 --no-file-parallelism`. Aviso preexistente de Canvas não implementado no jsdom, sem teste falhando.
- **292 testes verdes** no total. Nenhum teste toca banco/cliente real.
- ESLint dos oito arquivos TS/TSX envolvidos: aprovado, sem erros/avisos.
- `npm run typecheck`: **aprovado**, execução completa com exit code 0, sem erros.
- `npm run build`: **aprovado**, exit code 0; webpack compilou em 4,8 min e gerou 102/102 páginas estáticas. `MIGRATION_SKIPPED`, sem baseline/migration. URLs de banco somente offline (`127.0.0.1:1`), nenhuma `.env` real copiada. A configuração existente pula o typecheck dentro do build; o gate completo de TypeScript acima foi executado separadamente e passou.
- Avisos do build: atualização disponível do Prisma, Browserslist antigo, múltiplos lockfiles pela worktree aninhada e ENOSPC ao gravar cache webpack. Não impediram compilação, geração de páginas ou finalização. Nenhuma dependência/config alterada para silenciá-los. Cache temporário de compilação desta worktree removido após o build para devolver espaço; artefatos finais preservados.
- `git diff --check` e `git diff --cached --check`: aprovados. Staging conferido com exatamente os 11 caminhos listados abaixo, sem área protegida ou arquivo de WIP paralelo.
- QA em Chromium headless, usando componentes reais com fixture e actions bloqueadas: desktop 1280×900 e mobile 390×844, botão por teclado, sugestão/aplicação/revisão, cortesias, cálculo e ausência de erro de página. Mobile: documento 390 px e conteúdo do diálogo 348/348 px, sem overflow horizontal. Capturas inspecionadas visualmente. Não houve login ou teste em produção.

Comandos principais:

```text
npm run typecheck
npm run test -- lib/operacoes-v4/precificacao-telas.test.ts lib/operacoes-v4/precificacao-telas-contract.test.ts lib/operacoes-v4/orcamento-rapido-form.test.ts lib/operacoes-v4/orcamento-cliente-view.test.ts lib/operacoes-v4/orcamento-mensagem.test.ts lib/operacoes-v4/orcamento-selecao.test.ts lib/operacoes-v4/orcamento-prefill.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/orcamento-rapido-model.test.ts lib/operacoes-v3/orcamento-rapido-actions.test.ts lib/operacoes-v3/orcamento-actions.test.ts lib/operacoes-v3/orcamento-envio-actions.test.ts
node node_modules/vitest/vitest.mjs run --config test/ops-v4-rafacell-precificacao-001/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config test/ops-datas-retroativas-001/vitest.config.ts --maxWorkers=1 --no-file-parallelism
node node_modules/eslint/bin/eslint.js lib/operacoes-v4/precificacao-telas.ts lib/operacoes-v4/precificacao-telas.test.ts lib/operacoes-v4/precificacao-telas-contract.test.ts lib/operacoes-v4/orcamento-rapido-form.ts components/operacoes-v4-preview/parts/OrcamentoRapidoModal.tsx components/operacoes-v4-preview/parts/atendimento/CommercialOptionEditor.tsx test/ops-v4-rafacell-precificacao-001/vitest.config.ts test/ops-v4-rafacell-precificacao-001/precificacao-ui.test.tsx
npm run build
git diff --check
```

Nos testes, TEMP/TMP foram direcionados a `test-results/tmp-*` (gitignored) após EPERM de rename no temporário do sandbox. A primeira execução paralela da regressão montada esgotou a memória; repetição serial passou. A tentativa de TypeScript no sandbox foi interrompida por demora/pressão de memória; a execução completa posterior fora do sandbox passou. O primeiro build concorrente foi interrompido para liberar memória (a máquina chegou a ter cerca de 200 MB livres); build final executado sozinho. O navegador integrado estava indisponível (`@oai/cua/tinyskyAlt`); a QA visual foi feita com Playwright/Chromium local já instalado.

## Bloqueador de publicação confirmado — envio anterior ao fato real

Em `components/operacoes-v4-preview/parts/OrcamentoRapidoModal.tsx`, `persistir(true)` chama `marcarOrcamentoPreOsV3` com `statusComercial: "enviado"` **antes** de `enviarOrcamentoPorCanalV3`. Depois chama `atualizarStatusComercialV3(..., "enviado")` e ignora sua falha.

Em `lib/operacoes-v3/orcamento-envio-actions.ts`, o helper orquestra `enviarOrcamentoV3`/`registrarEnvioOrcamento`; em `orcamento-actions.ts`, `enviarOrcamentoV3` grava `status: "enviado"`. Esse caminho não transporta mensagem, não abre WhatsApp e não confirma impressão/entrega. Portanto, o botão **Criar e enviar orçamento** pode registrar envio sem o fato de envio, inclusive antes da conclusão da própria orquestração.

Achado preexistente, mantido sem refazer o fluxo neste GOAL. **Bloqueia publicação desta entrega até autorização e correção em GOAL próprio.** Salvar rascunho/Criar sem enviar continuam sem chamar o helper de envio.

Próximo GOAL recomendado: **OPS-V4-ORCAMENTO-ENVIO-REAL-STATUS-001** — separar criação, preparação de mensagem/documento e registro do envio efetivo; testes de falha parcial e nenhum `enviado` prematuro. Persistência de regras comerciais por loja permanece como trabalho futuro separado, sem migração neste GOAL.

## Arquivos da entrega

Criados:

- `lib/operacoes-v4/precificacao-telas.ts`
- `lib/operacoes-v4/precificacao-telas.test.ts`
- `lib/operacoes-v4/precificacao-telas-contract.test.ts`
- `test/ops-v4-rafacell-precificacao-001/vitest.config.ts`
- `test/ops-v4-rafacell-precificacao-001/precificacao-ui.test.tsx`
- Este relatório.

Alterados:

- `lib/operacoes-v4/orcamento-rapido-form.ts`
- `components/operacoes-v4-preview/parts/OrcamentoRapidoModal.tsx`
- `components/operacoes-v4-preview/parts/atendimento/CommercialOptionEditor.tsx`
- `docs/ai/CURRENT_STATUS.md` (estado local e bloqueio de publicação).
- `docs/changelog/CHANGELOG.md` (feature visível, ainda local).

Nenhum arquivo removido. MASTER_CONTEXT/roadmaps não alterados: sem nova convenção arquitetural ou mudança de estratégia. Commit local com staging por caminhos explícitos. Nenhum push, merge, PR ou deploy autorizado/executado. Aguardar aprovação humana após a entrega.
