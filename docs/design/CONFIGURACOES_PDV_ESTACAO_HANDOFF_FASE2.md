# Configurações → PDV e impressão · “Estação de caixa” — handoff da Fase 2

Fase 1 entregue na branch `claude/configuracoes-pdv-estacao-001` (PR draft). Variante **B** aprovada no Gate 1
(2026-11-26). Este documento diz o que a Fase 1 já faz, o que a Fase 2 precisa ligar e o que **bloqueia a publicação
definitiva**. Evidências (capturas, auditorias, protótipo, canvas): pasta local
`docs/ai-execution/_evidence/OMNI-CONFIGURACOES-PDV-ESTACAO-PHASE1-CLOSEOUT-002/` (não versionada).

## 1. Bloqueios da publicação definitiva

A Fase 1 pode ser revisada e testada, mas **não deve ir para produção** antes de:

1. **PR #406 integrada** e a Estação ligada à infraestrutura de guarda dela (seção 3). Sem isso, “Voltar para
   Configurações”, a troca de unidade e a navegação externa descartam pendências sem perguntar — igual à main hoje,
   mas a Estação deixa as pendências mais visíveis, então a expectativa de proteção é maior.
2. Decisão sobre as capturas reais do diálogo “Ver tela” (achado 3, seção 6): mostram dados do ambiente de quem capturou.

Não criar uma segunda infraestrutura de guarda: a Fase 1 não tem nenhuma de propósito.

## 2. O que a Fase 1 entrega

| Arquivo (`components/configuracoes-v3/features/settings/`) | Responsabilidade |
|---|---|
| `sections/PdvSection.tsx` | Monta `<PdvStation key={lojaAtivaId}>`: remonta por unidade, nenhum rascunho atravessa a troca |
| `pdv/PdvStation.tsx` | Composição da tela (cabeçalho, avisos, seções, painel, barra, diálogo) |
| `pdv/use-pdv-station.ts` | Estado e salvamentos dos três blocos; travas de carregamento e de unidade |
| `pdv/TelaCaixaSection.tsx` | Seleção de layout (Clássico, Assistência, Rápido/Grade, Next) e modo inicial do Clássico |
| `pdv/FlowPreviewDialog.tsx` | “Ver tela”: captura real por tema (Assistência, Next) ou esquema |
| `pdv/LeitorSection.tsx` | Ação ao bipar código não cadastrado + “Como aparece no caixa” |
| `pdv/BalancaSection.tsx` | Visor de peso (só com permissão de configurações) |
| `pdv/ImpressaoSection.tsx` | Cupom, impressora (rede ESC/POS ou navegador), automação, outros documentos |
| `pdv/DesktopStationRow.tsx` | Impressora **deste computador** (app Windows) — gravada no computador, fora da barra |
| `pdv/StationSummary.tsx` | Resumo “em vigor → novo” (faixa estreita e painel) + prévia do cupom |
| `pdv/ReceiptPreview.tsx` | Prévia 1:1 com a mesma estrutura do HTML real do cupom (teste de paridade) |
| `pdv/PendingDock.tsx` | Barra de ações e feedback (pendências, salvar/descartar, falha parcial) |
| `pdv/pdv-station-model.ts` | Regras de leitura/gravação, `buildStationSpecs`, textos e tipos |
| `pdv/pdv-station-controls.tsx`, `pdv-station-visuals.tsx`, `pdv-station.css` | Controles, esquemas e estilos (`@layer components`, tokens derivados) |

Contratos preservados (os testes e o E2E dependem deles):
- PUT parcial por bloco em `/api/stores/:id/settings`: caixa (`v3PdvSectionCard`, `v3PdvClassicModoInicial`,
  `pdvParams.pdvClassicLayout`, `pdvScanUnregisteredAction`), balança (`pdvScaleVisorVisible`, com conferência da
  resposta) e impressão (`impressao.*` só das chaves alteradas, `receiptFooter` só com rodapé não vazio).
- Espelhos locais do layout (`writePdvMainLayout`, `writePdvClassicLayout`, `writeOmnigestaoPdvModoPreferencia`).
- Títulos e rótulos: “Impressão operacional”, “Impressão do cupom”, “Impressora de comprovante (host/IP)”,
  “Rodapé do cupom”, “Exibir logo no cupom”, “Testar impressão”, “Prévia no navegador”, “Salvar alterações”;
  toasts “PDV atualizado”, “Impressão salva”, “Alterações salvas”; `data-testid` `pdv-classic`, `pdv-assistencia`,
  `pdv-supermercado`, `pdv-black-edition`, `pdv-classic-modo-inicial`, `pdv-scan-unregistered-action`, `desktop-print-station`.
- “Impressão direta neste computador” é o nome que a página `/baixar` ensina a procurar.

Segurança dos salvamentos (coberta por teste em `pdv/pdv-station.component.test.ts`):
- Edição e gravação só com as configurações **desta** unidade lidas (`loaded`); leitura que falhou não deixa
  editar nem apresenta padrões como “em vigor”; recarga após salvar trava os controles sem trocar a tela pelo esqueleto.
- Antes de gravar, a unidade do provider tem de ser a ativa; senão nada é enviado e a barra explica.
- Dois cliques seguidos gravam cada bloco uma vez. Falha parcial: só o bloco recusado continua pendente.
- Impressora do Windows: salva no computador (bobina sozinha também), sem PUT da unidade e sem a barra.

## 3. Ligar na infraestrutura da PR #406 (Fase 2)

Confirmado no branch `feat/configuracoes-premium-pilot-003` (head `bdcec37`):

| Peça da #406 | Como a Estação deve usar |
|---|---|
| `ConfiguracoesNavContext`: `setSectionDirty(id, dirty)`, `setSectionSaving(id, saving)`, `requestExternalNavigation(href)` | Em `use-pdv-station.ts`, publicar `anyDirty` e `saving !== null` para a seção `pdv`. “Voltar para Configurações” deixa de chamar `navigateToSection` direto quando houver pendência (a guarda decide) |
| `lib/navigation/route-exit-guard.ts`: `registerRouteExitGuard` / `interceptRouteExit` | Coberto pela navegação de Configurações da #406; a Estação só informa estado |
| `lib/loja-ativa.tsx`: `registrarGuardaTrocaLoja({ temRascunhoSujo })` | Registrar enquanto houver `anyDirty` ou salvamento em andamento; a remontagem por unidade continua como rede de segurança |
| `SettingsDirtyDock` | Convergir `PendingDock` para ela. Manter na versão compartilhada: falha por bloco (`role="alert"` único), “As demais alterações já estão em vigor”, contagem de alterações |
| `revalidate()` / `StoreSettingsReadbackError` (`lib/store-settings-readback.ts`) | Trocar `refresh()` por releitura confirmada após cada PUT (hoje só o visor confere a resposta) |
| `UnidadeAtivaRequiredBanner` (`clientMode`, `onSelectStore`) | Passar `clientMode` na visão cliente e `onSelectStore` na plataforma |
| Tokens `--cfg-*` e fim da paleta local de `configuracoes-v3.css` | Os `--cx-*` (pdv-station.css) passam a derivar dos `--cfg-*`; nada de tema próprio. Re-medir contraste: o selo de check usa `--cx-select` porque a paleta local do Midnight deixava `--primary-foreground` sobre `--primary` em 2:1 |

## 4. Sistema visual definitivo (Omni Premium) — o que a Fase 2 alinha

- **Navegação interna e índice de âncoras**: na aba PDV, a navegação de Configurações hoje fica oculta (como na main).
  Na Fase 2, mostrar a navegação + índice das seções (Tela do caixa, Leitor, Balança, Impressão, Atalhos) com o
  ponto de pendência por seção. Moldura por container query: ≥ 1280 px navegação de 232 px; < 1280 px seletor que
  abre Sheet. Conteúdo: ≥ 960 px duas colunas (painel 344 px; 372 px a partir de 1180 px); < 960 px faixa de resumo e
  prévia recolhível; < 600 px linhas empilhadas e alvos de 44 px.
- **Sidebar global e contextual, scrollbar premium, tipografia e superfícies**: usar o que a #406 definir (referências
  Omni Premium Light, Coffee Gold, Scrollbar Premium). A Estação não tem rolagem própria: herda a do conteúdo de
  Configurações; o painel é `sticky`. Superfícies: só o painel e os cartões de layout têm superfície; o resto é folha
  aberta com linhas.
- **Guardas de alterações pendentes**: seção 3.
- **Temas e Alta Legibilidade**: validar os 10 temas e a Alta Legibilidade de novo sobre os tokens finais; tamanhos de
  texto continuam em classes Tailwind para `styles/legibility.css` reforçar; `styles/operational-density.css` (sem
  `@layer`) exige `!important` em camada para alvos de 44 px.
- **Movimento**: barra entra em 180 ms; rolagem suave para âncoras; tudo desligado em `prefers-reduced-motion`.

## 5. Outras PRs abertas na mesma área

- **#336** (cadeia PADARIA-KG, base `claude/padaria-kg-venda-peso-integracao-001`): adiciona “Trocas por peso”
  ao `PdvSection` antigo (chave `TROCAS_PESO_KEY`, confirmação ao desativar). Ao chegar na main, vira uma linha da
  Estação (provavelmente em Balança ou num bloco próprio) com o mesmo PUT parcial e a mesma confirmação.
- **#327** (marcada “NÃO MERGEAR”): pendura `ImpressaoDiretaAgenteCard` no `PdvSection` antigo. Se for adiante,
  entra como linha de `ImpressaoSection` (escopo Unidade).
- **#331, #334, #315, #336**: mexem nas listas de `.github/workflows/pdv-scale-visor.yml` e `platform-pilot.yml`;
  conflito de texto provável nas linhas de ESLint — manter `components/configuracoes-v3/features/settings/pdv`.

## 6. Achados preservados (não corrigidos nesta fase)

1. **Contraste do aviso real do PDV** (`components/dashboard/vendas/pdv-scan-inline-feedback.tsx`, reproduzido em
   “Como aparece no caixa”): `text-destructive` sobre `bg-background` abaixo de 4,5:1 — **18 falhas** (9 temas × 2
   modos de legibilidade; só o Midnight passa, 4,89:1):

   | Tema | Normal | Alta Legibilidade |
   |---|---|---|
   | Light | 4,06:1 | 4,06:1 |
   | Soft Ice | 4,26:1 | 4,26:1 |
   | Black | 3,86:1 | 3,86:1 |
   | Quantum Violet | 3,68:1 | 3,68:1 |
   | Coffee Gold | 3,67:1 | 3,67:1 |
   | Ruby Black | 3,73:1 | 3,73:1 |
   | Neon Ice | 4,28:1 | 4,28:1 |
   | Violet Ice | 4,26:1 | 4,26:1 |
   | Coffee Cream | 4,20:1 | 4,20:1 |

   Sugestão para o PDV (fora desta frente): tinta `color-mix(in oklab, var(--destructive) 72%, var(--foreground))`.
   **Não há conformidade WCAG integral declarada** enquanto isso existir.
2. **Miniaturas genéricas e com tipo errado**: `public/images/pdv-classic-thumb.png`, `pdv-supermercado-thumb.png` e
   `pdv-next-thumb.png` são JPEG (JFIF) com extensão `.png` e mostram ilustrações que não são o OmniGestão. Depois
   da Fase 1 não têm mais uso no código (eram do `PdvMiniPreview` removido) — remoção fica para uma limpeza separada.
3. **Capturas reais com dados do ambiente**: `public/images/pdv-assistencia/*.png` e `pdv-next/*.png` (usadas no
   diálogo “Ver tela”) mostram o e-mail do administrador; `pdv-assistencia/light.png` mostra também a barra de
   favoritos do navegador. Recapturar com loja sintética e sem moldura do navegador antes da publicação.
4. **Requisições de imagem inexistentes**: a tela antiga pedia `/images/pdv-classic-<tema>.png` e
   `/images/pdv-supermercado-<tema>.png` (404) a cada abertura. **Resolvido** na Fase 1 (o componente saiu).
5. **Diálogo** (`configuracoes-v3/components/ui/dialog.tsx`): o botão de fechar anuncia “Close” em inglês.
6. **Duas bobinas**: a da unidade vale para as vendas em todos os caminhos (inclusive Windows); a do computador só
   para o teste sem venda — a tela explica (“Bobina do teste”). Decidir se a do computador deve existir.
7. **Rótulo**: o menu chama a seção de “PDV” para a plataforma e “PDV e impressão” para o cliente; a Estação usa
   “PDV e impressão” no título para os dois.

## 7. Aceite da Fase 2

- [ ] Guardas da #406 ligadas (seção, rota externa, troca de unidade) e testadas com pendência e com salvamento em andamento.
- [ ] `PendingDock` convergida na `SettingsDirtyDock` sem perder falha parcial por bloco.
- [ ] Releitura confirmada após cada PUT.
- [ ] Navegação interna + índice de âncoras na aba PDV, nas larguras da seção 4.
- [ ] 10 temas + Alta Legibilidade revalidados sobre os tokens `--cfg-*`; contraste e toque re-medidos.
- [ ] Capturas do “Ver tela” refeitas com dados sintéticos.
- [ ] E2E `e2e/platform-pilot/client-experience.spec.ts` verde em CI.
