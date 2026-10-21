# CAD-R2-021 — relatório único de texto, voz e prontidão de governança

## Correção: microfone no campo e diagnóstico da transcrição — 20/10/2026

`GOAL=CAD-R2-021`. `INLINE_MICROPHONE=PASS` (Chromium real, geometria medida; motor simulado). `LOCAL_VOICE_DIAGNOSTIC=IMPLEMENTED` — comprovado neste host: o motor local do Chrome 155 detecta fala e não devolve resultado (dependência do navegador, não do React); terminal da loja ainda não medido. `REAL_SPEECH_TO_TEXT=NOT_TESTED`. `REMOTE_FALLBACK=DISABLED`. `HUMAN_REVIEW=PRESERVED`. `OTHER_MODULES=UNCHANGED`. `WIP_PRESERVED=YES`.

Continuação corretiva, sem GOAL novo, sobre a main `16c496ad2ffe56fc6a89de237b204842494b8cbb`. Worktree isolada `.worktrees/cad-r2-021-voz-inline`, branch `claude/cad-r2-021-voz-inline-diagnostico`; AEP inativo; WIP da worktree principal intocado.

### Sintoma relatado

No computador da loja, Chrome instalou o pacote e iniciou a escuta, mas o campo ficou vazio e, ao parar, apareceu "Nenhuma fala reconhecida". O gravador do Windows captou a voz. Pedido de UX: microfone dentro da caixa "Descreva o novo cliente".

### Causas encontradas no código (corrigidas)

1. **Provisório perdido ao parar.** `session.ts` (compartilhado com Produto) zera `interim` em `stop-requested`, e o adapter local ignorava provisório recebido depois de parar. Se o navegador só tivesse produzido provisório, o texto sumia e restava "Nenhuma fala reconhecida". Agora o adapter repassa o provisório tardio e Clientes guarda uma cópia (`provisional`) para recuperação **explícita** ("Usar trecho provisório"/"Descartar trecho"); ela só entra no campo de descrição editável e nunca é interpretada ou salva sozinha. Produto e `session.ts` sem mudança.
2. **Ordem final × provisório no mesmo evento.** O adapter emitia o provisório antes do final, e o final apagava a cauda provisória. Agora o final sai primeiro.
3. **`service-not-allowed` exibido como "Microfone bloqueado".** Pela especificação, com `processLocally` é o motor local indisponível. Mensagem própria e reconsulta da disponibilidade (sem remoto).
4. **"Ouvindo" sem prova.** A faixa de captura mostra a etapa comprovada por evento: "Iniciando o microfone…" → "Microfone ativo — aguardando som" (`audiostart`) → "Som detectado" (`soundstart`) → "Fala detectada — aguardando o texto" (`speechstart`) → "Recebendo texto" (primeiro `result`).

### O que não é corrigível no React

Neste host (Chrome 155.0.8059.80, Windows 11), com fala sintética e rede do navegador bloqueada, tanto o editor quanto a API crua, fora do produto, recebem `audiostart`/`soundstart`/`speechstart` e **zero** `result` (detalhes em "Captura real", 19–20/10). No novo classificador isso é `NO_RESULTS` (ou `ENGINE_FAILURE` quando o caminho do modelo passava de 260 caracteres). O sintoma da loja é compatível, mas só a medição no próprio terminal o confirma.

### `quality` (`dictation`) — avaliação técnica

- Especificação atual: `SpeechRecognitionOptions.quality` (`command`, padrão; `dictation`; `conversation`) em `available()`/`install()`.
- Chrome 155 (sonda só de metadados): conhece o enum (valor inválido → `TypeError`) e expõe `quality` na instância. Para **pt-BR: `command` = downloadable; `dictation` = unavailable; `conversation` = unavailable**. Logo, `dictation` **não** está disponível para pt-BR neste Chrome e não é solução.
- Implementado sem degradar o modo local: `checkLocalVoiceSupport` detecta o enum e só escolhe `dictation` quando o navegador a declara disponível (ou instalável) para pt-BR; caso contrário mantém `command`/padrão exatamente como antes. `install()` e a instância recebem a mesma qualidade.

### Diagnóstico sanitizado

`lib/cadastros/voice-capture/diagnostic.ts`: só deslocamentos em ms, contagens (`results`, `interim`, `final`, `nomatch`), código de erro de lista fechada e motivo de término. Nada de áudio, texto, nome, CPF ou telefone; nada em log, storage, URL ou rede — só na tela. Classificador: `MIC_NOT_STARTED`, `NO_AUDIO`, `NO_SPEECH`, `NO_RESULTS`, `INTERIM_ONLY`, `FINAL_RECEIVED`, `ENGINE_FAILURE` (erro ou motor sem `end`), além de `CANCELLED`. No editor: linha "Diagnóstico do ditado" após falha e, em "Diagnóstico da voz", os detalhes técnicos e o botão **"Testar o navegador (8 s)"** — chamada mínima à API nativa (`processLocally`, pt-BR), independente do adapter, no mesmo navegador. Se editor e teste mínimo falharem igual, a dependência é do navegador.

### Interface

Microfone (ícone, 44 px, nome acessível "Ditar por voz") dentro do campo, canto inferior direito; `pr-16` reserva a coluna. Durante a captura, a faixa interna mostra indicador pulsante, etapa, tempo e "Parar ditado"/"Cancelar ditado" (44 px); o texto confirmado aparece no próprio campo (somente leitura) e o provisório numa linha "Provisório · ainda não confirmado". Ao terminar, o texto confirmado vira editável na mesma posição, preservando o que foi digitado. Instalar/verificar/indisponível usam o mesmo botão interno. Sequência mantida: microfone → texto editável → Interpretar texto → sugestões → revisão humana → Salvar cliente. Sem microfones por campo.

### Testes

Simulados (motor sintético, sem áudio): adapter (`quality`, provisório após parar, ordem final/provisório, diagnóstico por etapa, timeout, cancelamento, erro saneado), política (retenção/descartes do provisório, etapas, textos), teste mínimo nativo (recusas, contagens sem texto, `NO_RESULTS`, timeout, cancelamento, `dictation`), UI (posição/acessibilidade, etapas, provisório rotulado e não mesclado, recuperação explícita, cauda provisória, diagnóstico visível, teste do navegador, fechamento durante o teste, `dictation` só quando declarada, e as regressões anteriores de parada, cancelamento, erros, troca de loja, aba oculta, fechamento). Mutação: desligar a retenção do provisório derruba 7 testes; arquivo restaurado byte a byte. Smoke Chromium 1440/390/320 com geometria real: microfone e controles dentro do campo, alvos ≥ 44 px, texto fora da coluna do microfone, etapa legível em 320 px, provisório visível e não mesclado.

Regressão local no recorte do CI: 1164 PASS/20 skipped. ESLint dos arquivos alterados: 0 erros/0 warnings (2 warnings preexistentes em `ConferenciaLoteProdutos.tsx`/`MovimentacaoEstoqueModal.tsx`, intocados). `npm run typecheck`: exit 0. `npm run build` local: `MIGRATION_SKIPPED` e "Compiled successfully", mas terminou em `ENOSPC` (disco C: com 0 GB livres no host); o `.next` gerado foi apagado e o build completo fica a cargo do CI.

### Teste manual único necessário (aceite real)

No computador da loja, depois do deploy: Chrome → Cadastros → Clientes → **Novo cliente**.
1. Toque no microfone dentro do campo e diga devagar: "Nome Lia de Teste, telefone 14 99999 8888"; toque em **Parar ditado**.
2. **PASS** se o texto aparecer no campo e puder ser editado. Se não aparecer, abra **Diagnóstico da voz**, anote a linha "Último ditado", toque em **Testar o navegador (8 s)**, fale uma frase curta e anote o resultado.

As duas linhas dizem em que etapa parou (microfone, som, fala, reconhecedor, provisório, final ou motor). Use apenas dados de teste.

## Implementação da voz local de Clientes — 19/10/2026

`GOAL=CAD-R2-021`. `VOICE_IMPLEMENTATION=IMPLEMENTED_LOCAL_ONLY`. `REAL_DEVICE_RECOGNITION=NOT_DEMONSTRATED_ON_THIS_HOST` (ver "Captura real"). `TEXT_CAPTURE=PRESERVED`. `HUMAN_REVIEW=REQUIRED`. `CLIENT_WRITE_SERVICE=REUSED`. `VOICE_AUDIO_STORAGE=NONE_IN_APPLICATION`. `REMOTE_FALLBACK=DISABLED`. `OTHER_MODULES=UNCHANGED`. `SCHEMA_MIGRATIONS=UNCHANGED`. `WIP_PRESERVED=YES`.

### Autoridade e base

Decisão do responsável pelo produto: desenvolver e desbloquear tecnicamente a voz de Clientes, sem novo GOAL, preservando #282 e #286. Não é parecer jurídico, consentimento de titulares nem aprovação de fornecedor externo; processamento remoto continua sem aprovação (VOICE-GOVERNANCE.md, "Decisão registrada"). Base conferida após fetch: `a6777234bcc336fef64ecb7491d5705bdd404b39`. Worktree isolada `.worktrees/cad-r2-021-voz`, branch `claude/cad-r2-021-voz-clientes-funcional`. Worktree principal e seu WIP intocados. `.aep-active` ausente; não existe trilha AEP de Cadastros; nenhum state/LEDGER/REGISTRY editado.

### O que mudou

- **Política** (`lib/cadastros/voice-capture/cliente.ts`): `CLIENT_VOICE_PRIVACY_GATE` (bloqueio permanente) substituído por `CLIENT_VOICE_POLICY` congelado — local estrito, sem fallback remoto, pt-BR, 30 s, 2000 caracteres, sem áudio armazenado, sem autosave. Mensagens próprias de Clientes sobre a máquina compartilhada `reduceVoiceCapture`, com descarte do trecho temporário em todo término sem sucesso. Formatação visível da transcrição (pontuação falada, separação dos rótulos que o parser conhece) e junção em linha própria.
- **Adapter local** (`lib/cadastros/voice-capture/local.ts`): verificação por metadados (`available({langs:["pt-BR"], processLocally:true})`, contexto seguro, API on-device completa), instalação explícita do pacote, sessão com `processLocally = true` antes de `start()`, recusa de instância que não confirma o modo local, parar/cancelar/descartar, limites de duração e caracteres, carência de `end`. Reconhecimento genérico nunca é aceito.
- **Editor** (`ClienteEditor.tsx`): "Ditar por voz" / "Instalar voz local pt-BR" / "Verificar voz local" / "Voz indisponível" conforme o terminal; "Parar ditado", "Cancelar ditado", indicador "Ouvindo · m:ss de 0:30"; transcrição ao vivo somente leitura e, ao concluir, texto editável; "Interpretar texto" e "Salvar cliente" bloqueados durante a escuta; fechar, trocar loja, descartar, ocultar aba e `pagehide` encerram o motor e invalidam callbacks. Rótulo de origem "Extraído da transcrição por voz" na revisão.
- **Action** (`cliente-texto-livre.ts`): depois de autenticar/autorizar a loja, aceita só os literais `text`/`voice`; qualquer outra origem é recusada antes do parser com mensagem constante. A origem não muda parser, sugestão nem `salvarClienteRevisado` → ClientWriteService.
- **Sem mudança**: adapter/máquina/tipos de voz de Produto (`browser.ts`, `session.ts`, `types.ts`, `detect.ts`, `index.ts`), `produto-ia.tsx`, Prisma/schema/migrations, auth/proxy, `next.config.mjs` e os demais HUBs.

### Testes

Simulados (motor sintético `__fixtures__/fake-local-speech.ts`, sem áudio): unidade do adapter, política, Action e UI cobrindo início, parada, cancelamento, permissões negadas, `audio-capture`/`no-speech`, compatibilidade pt-BR (available/downloadable/downloading/unavailable/política/timeout/contexto inseguro/API genérica), `processLocally` obrigatório e sem fallback, eventos tardios após cancelar/fechar/trocar loja, aba oculta/`pagehide`, limites, revisão humana, duplicidade e isolamento por loja na Action, ausência de logs/storage/URL. Duas mutações (remover `processLocally`; remover o encerramento no unmount/ocultação) derrubaram 18 e 4 testes, respectivamente; arquivos restaurados byte a byte.

Smoke Chromium do editor real (motor SIMULADO injetado, I/O das Actions simulado) em 1440×1000, 390×844 e 320×740: instalação explícita, início local pt-BR, transcrição ao vivo, parar → texto editável, interpretação com origem `voice`, revisão, aplicação, confirmação, save simulado, cancelamento com evento tardio, troca de loja abortando o motor, motor genérico recusado e caminho por texto. Zero chamadas a microfone/permissões pela aplicação, zero rede externa, zero storage, zero page errors, sem overflow. Capturas `voice-listening-*.png` e `review-*.png`.

Local (head `1942ecc`): `npm run typecheck` exit 0; ESLint dos arquivos alterados sem erros/warnings; `git diff --check` OK; Vitest no recorte do CI 1112 PASS/20 skipped; `npm run build` com `MIGRATION_SKIPPED` e "Compiled successfully"; smoke PASS com CSS do build e com CSS compilado da fonte. [CI 39272217919](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39272217919) no mesmo head: TypeScript, lint (0 erros/91 warnings históricos), 1112 PASS/20 skipped, build sem migrations, smoke PASS (motor simulado), sonda `ptBR=NOT_CHECKABLE` no Chromium 136 do runner (produto → só texto) e 20/20 integrações PostgreSQL descartáveis reais; previews Vercel concluídos.

### Captura real

`scripts/cadastros/real-voice-capture-local.mjs` (fora do CI) dirige o editor real no Chrome instalado, com fala **sintética** pt-BR gerada localmente (SAPI, voz "Microsoft Maria", frase fictícia) entrando por dispositivo de áudio falso e a rede do navegador bloqueada por proxy morto durante o reconhecimento. Perfil Chrome descartável no scratchpad da sessão.

`REAL_DEVICE_RECOGNITION=NOT_DEMONSTRATED_ON_THIS_HOST` (impedimento de ambiente, causa não determinada; ver diagnóstico). Sequência observada em Chrome 155.0.8059.80 / Windows 11 (8 GB):

1. Antes: API local presente; `available(pt-BR, local) = downloadable`.
2. Download autorizado pelo responsável (19/10/2026), pelo botão do próprio editor: motor SODA 1.2.12 (35 MB) + pacote pt-BR 1.3071.0 (69 MB). Durante diagnósticos com rede liberada, o Chrome baixou também, por conta própria, o pacote en-US (194 MB) — total ≈298 MB, acima da estimativa de ~100 MB informada ao responsável. Tudo no perfil descartável.
3. Após reiniciar o Chrome, `available` volta a `downloadable` com os arquivos presentes; o clique em "Instalar voz local pt-BR" com a rede bloqueada (`ERR_PROXY_CONNECTION_FAILED`) os reativa em 11 ms → `available`. Texto do botão ajustado para explicar isso.
4. Ditado pelo editor real, offline: motor iniciado com `processLocally: true` e `lang: "pt-BR"`; o áudio sintético chega (`audiostart`, `soundstart`, `speechstart`; envelope de fala confirmado gravando o microfone falso), mas nenhum resultado é devolvido em 24 s; o editor encerra com "Nenhuma fala reconhecida…", formulário preservado, nada interpretado nem salvo, zero rede externa da página, zero storage, zero page errors (`real-voice-capture.json`, `result: FAIL`).
5. Isolamento: a API crua, fora do produto, falha igual em pt-BR e en-US, headless e com janela, com microfone padrão e com `start(track)`. `SODA.dll` está carregada no `SpeechRecognitionService`, sem bloqueio de integridade de código.
6. Primeira leitura (19/10): durante o ditado o serviço de fala consome >1 núcleo com working set preso em ~70 MB e ~45 mil falhas de página/s, com RAM livre entre 58 e 776 MB e descarte de páginas pelo Chrome. Hipótese inicial: thrashing por falta de RAM.
7. Repetição autorizada (20/10), com aplicativos fechados pelo responsável (RAM livre 370–720 MB; ChatGPT e Codex ainda abertos): mesmo padrão de CPU/falhas de página e nenhum texto. Isso **enfraquece** a hipótese de RAM.
8. Achado: o perfil descartável no scratchpad colocava 6 arquivos do modelo pt-BR acima de 260 caracteres (máx. 278; limite MAX_PATH do Windows). Com o mesmo perfil acessado por uma junção de caminho curto (máx. 187), o Chrome passa a registrar os caminhos curtos e o motor **termina limpo** 3 s após parar (antes nunca terminava) — mas continua sem devolver texto, em pt-BR e en-US, headless e com janela, na API crua e pelo editor (`real-voice-capture.json`, `longestModelPath: 187`, `result: FAIL`). O roteiro agora recusa perfis com caminho de modelo acima de 259 (`NOT_RUN_PROFILE_PATH_TOO_LONG`).
9. Causa restante **não determinada**. Hipóteses abertas: o motor do Chrome sob automação/dispositivo de áudio falso não entrega resultados; pressão de memória residual. Não é defeito do código do OmniGestão (a API crua falha igual), e nada aqui prova que o motor funcionaria — ou falharia — num terminal comum. Em perfis reais do Chrome (`%LOCALAPPDATA%GoogleChromeUser Data`, ~60 caracteres) o modelo fica perto de 220 caracteres; nomes de usuário Windows muito longos podem se aproximar do limite.

Conclusão: implementação e integração com o motor local estão verificadas até o ponto em que o motor recebe o áudio em modo local, offline; **reconhecimento real em dispositivo não foi demonstrado**. Próximo ato: validar num terminal da operação com microfone real e fala de teste (ou num navegador do responsável), com o pacote pt-BR instalado pelo próprio botão do editor. No produto, a falha nesse cenário é segura: após parar, carência de 5 s, mensagem constante e texto preservado.

## Continuação — 19/10/2026

`CAD_R2_021_STATUS=PARTIAL_BLOCKED`. `TEXT_CAPTURE=PUBLISHED_PRESERVED`. `VOICE_CAPTURE=DISABLED`. `VOICE_PRIVACY_GATE=BLOCKED`. `LEGAL_APPROVAL=PENDING`. Testes, revisão, CI, merge ou deployment não substituem a decisão administrativa/jurídica.

### Autoridade, base e isolamento

Comando humano: continuação autônoma de Voice Privacy & Governance Readiness do GOAL existente, sem habilitação de voz. Base remota conferida após fetch: `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`. Branch isolada: `codex/cad-r2-021-voice-governance-readiness`; nenhuma modificação na worktree principal. `.aep-active` ausente na principal e na nova worktree; AEP opt-in inativo. Nenhum state/LEDGER/REGISTRY editado. PRs paralelas inventariadas e preservadas.

### Reconciliação com a entrega publicada

A [PR #282](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/282) foi merged, head `bf16f06c519496450b531f891f261d9a909df575`, merge `d6bdaa023f44a2ad3a7650c68979810934636069`. O [CI anterior](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39143910374) aprovou TypeScript, lint de fontes ativas, 994 testes/20 skips, build sem migrations e smoke responsivo. O prefixo de build `d6bdaa023f44` foi observado no smoke somente GET da publicação anterior. Esses números são históricos, não resultados presumidos desta continuação. A main atual inclui alterações posteriores de outras frentes.

O texto já publicado não foi reimplementado. Os parágrafos abaixo de “Histórico da PR #282” registram sua evolução e suas falhas intermediárias; referências antigas a validação/merge pendentes não descrevem o estado atual dessa PR.

### Auditoria e proteções desta continuação

- Leitura direta de gate, lifecycle, Action, editor, tipos, parser, testes e dependências. Gate constante `false`, agora congelado em runtime; sem env, query, local/sessionStorage ou configuração externa para ativá-lo.
- UI sem import do adapter de fala, construção de reconhecedor, enumeração de dispositivos ou solicitação de microfone. Testes ampliados para os dois nomes de SpeechRecognition, query/storage adulterados, APIs de permissão e descarte de respostas tardias/erros após fechamento e troca de loja.
- Action direta autentica/autoriza antes de responder e recusa origem não literal `text` antes do parser; matriz ampliada de tipos/valores adulterados, sem rede, escrita, auditoria ou log de conteúdo. O discriminador não certifica a origem física de uma string fornecida pelo chamador; ferramentas externas de ditado não são ativadas pela aplicação.
- Texto/sugestão efêmeros e DTO de escrita revisado preservados; ClientWriteService continua sendo a fronteira canônica, com identidade, deduplicação, UNIQUE e isolamento de loja.
- Smoke Chromium instrumentado para falhar se o editor consultar motores de fala, permissões ou microfone. Probe de compatibilidade separado do produto consulta apenas metadados de pt-BR em localhost com microfone negado; não instala pacotes nem inicia áudio.
- PostgreSQL local indisponível (Docker sem daemon). CI preparado com serviço PostgreSQL descartável, credenciais sintéticas e guard de URL exata/loopback antes de qualquer operação. `db push` somente materializa o schema inalterado nesse serviço; não executa migrations nem backfill. O teste de update concorrente foi fortalecido: documento novo e exatamente um sucesso, evitando PASS com duas recusas sobre documento previamente ocupado.

### Pacote preparado para análise humana

- [VOICE-GOVERNANCE.md](VOICE-GOVERNANCE.md): finalidades separadas, hipóteses sem fundamento selecionado, matriz de agentes, retenção/minimização por camada, riscos de atendente/cliente/terceiros/sensíveis, minutas de transparência, diligência de transferência, matriz de decisão e suspensão. **Todos os campos de aprovação permanecem PENDENTES.** Não há parecer, assinatura ou aceite fictício.
- [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md): alternativas local/externa/manual, API/pacotes pt-BR, compatibilidade documental, Permissions-Policy, estados de erro e proibição de fallback remoto. Google Cloud Speech-to-Text V1 e Azure Speech avaliados apenas como candidatos; contratos, contas e países efetivamente contratados não validados. Não se declara retenção zero de fornecedores.
- Próximo ato humano indispensável: administração e assessoria jurídica identificarem responsáveis reais e documentarem finalidade/base, tecnologia/escopo, destinatários/países, retenção, avisos, condições e suspensão. Homologação dos terminais e qualidade de reconhecimento ainda dependerá de autorização apropriada; nenhuma captura de áudio real foi executada.

### Validação e publicação desta continuação

Validação local: 48 testes de Action/gate/guard passaram; o worker jsdom inicialmente não iniciou por timeout no host com pressão de memória. A repetição isolada aprovou os 13 testes de UI: 61 testes focados PASS. ESLint dos dez arquivos de código alterados passou sem erros/warnings; sintaxe dos scripts e `git diff --check` passaram.

A [PR #286](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/286) foi aberta com commit inicial `2c486c0d9e3f29337a8e17c68f5fc578565408a2`. As 20 integrações passaram em PostgreSQL descartável no primeiro CI, sem escrita produtiva. A revisão automatizada apontou que `Promise.all` sozinho não comprova colisão UNIQUE. Corrigido para usar duas conexões reais, barreira imediatamente antes de create/update (após os lookups), confirmação de dois backend PIDs e observação obrigatória de exatamente um P2002 real, além do resultado de domínio seguro. A nova execução deve validar esse cenário mais forte.

O [primeiro CI completo](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39193697563), head `2c486c0d9e3f29337a8e17c68f5fc578565408a2`, passou TypeScript, lint de fontes ativas (0 erros/91 warnings históricos), regressões, build com `MIGRATION_SKIPPED`, smoke em 1440/390/320 e probe sem áudio. No smoke, zero chamadas às APIs de voz/microfone/permissões, zero rede externa, zero storage, zero page errors e sem overflow. I/O de save simulado; editor/parser reais. Não se declara save autenticado produtivo testado.

No [CI da correção](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39194301274), head `b8d4300aa71c83a5084336b1106f47288a651e8e`, as 20 integrações passaram novamente, agora exigindo a corrida real e P2002. A suíte sem banco pode exibir os 20 opt-in como skips; o job PostgreSQL separado os executa efetivamente. O workflow passa a produzir também `voice-regression.json` para contagem exata das regressões no head final, sem depender da apresentação dos logs.

Compatibilidade observada no primeiro runner: Chromium 136.0.7103.25 expõe reconhecimento genérico, mas não API local nem consulta de pacote; `ptBR=NOT_CHECKABLE`. Não existe demonstração de suporte local pt-BR nos terminais atuais da operação. Arquitetura local continua não homologada, mesmo com o pacote documental pronto.

### Self-review R5 da continuação

1. **Autoridade e escopo:** comando humano autoriza preparação/publicação técnica; não autoriza voz. AEP inativo; 14 caminhos específicos, sem áreas protegidas nem controle manual de state/LEDGER/REGISTRY.
2. **Privacidade:** gate imutável, UI sem engine/permissão, Action com recusa antes do parser, nenhuma integração externa. Minutas não publicadas como aceites; retenção externa/infraestrutura separada da efemeridade comprovada na aplicação.
3. **Contexto e lifecycle:** testes de loja/sessão reais no servidor, campos de autoridade ignorados, respostas tardias de sucesso/erro descartadas na UI; preservação do manual e confirmação explícita.
4. **Integridade:** writer e identidade canônicos preservados. Corrida sintética com duas conexões/transações reais, barreira após lookup, UNIQUE e mapeamento P2002 comprovados no serviço PostgreSQL descartável; nenhum backfill ou migration.
5. **Evidência e release:** limitações locais registradas, CI e fontes oficiais vinculados; revisão automatizada e gates no head a integrar são obrigatórios antes do merge. Deployment canônico e smoke final só leitura, sem alterações de secrets ou da autoridade de migrations.

### Recibo final de publicação

O resultado único pós-execução, com SHA final, commits, CI/revisão, merge, deployment/smoke e limpeza da worktree, será registrado no corpo da [PR #286](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/286) e no relatório final entregue ao solicitante. Este arquivo preserva as evidências verificadas antes de sua própria publicação; não presume aprovação futura. Os artefatos `voice-regression.json`, `postgres-integration.json`, `postgres-isolation.json`, `browser-smoke.json` e `voice-compatibility.json` pertencem ao CI do head respectivo.

`PRODUCTION_DB_WRITES_BY_AGENT=0`. `MIGRATIONS_EXECUTED=NO`. `CAD_R2_022_STARTED=NO`. `WIP_PRESERVED=YES`.

## Histórico da PR #282

Registro histórico da implementação e revisão anterior. Texto publicado; voz continuou bloqueada. Não declarar o GOAL encerrado nem habilitar o microfone com base em testes técnicos.

## Escopo e autoridade

Base remota verificada: `976ebaa294e09441ce0c5be7bbe5776a568f4013`. Branch `codex/cad-r2-021-cliente-texto-voz`, em worktree nova e isolada. WIPs e worktrees anteriores preservados. ENTRYPOINT lido, `.aep-active` ausente; `track status cadastros` confirmou que não existe trilha AEP de Cadastros. Nenhum state, LEDGER ou REGISTRY editado.

Nenhuma especificação REV2.2 posterior/CAD-R2-021 foi encontrada no código versionado da main. Aplica-se o contrato detalhado da missão humana. As pendências de `CAD-R2-020-PRIVACY-20261015/GOVERNANCE.md` continuam abertas. Não se inferiu consentimento, base jurídica ou aprovação de compartilhamento.

## Implementação

- Editor real do HUB extraído para `ClienteEditor.tsx`, com componentes e tokens existentes, diálogo Radix, labels, foco e uma coluna no celular. A marca visual é o preview por campo com origem explícita. Criação e edição continuam na mesma superfície do HUB.
- Parser fechado e determinístico de Cliente em `natural-text/cliente.ts`; envelope de sugestão reutiliza o contrato 016, com schema de Cliente separado. Nome, telefone, CPF/CNPJ, email, cidade, endereço e UF somente com evidência explícita. Documentos e números ambíguos não são adivinhados. Normalizadores/validadores de identidade canônicos reutilizados.
- Sugestões editáveis; campos ausentes/ambíguos identificados; aplicação preenche apenas vazios; descarte e cancelamento sem escrita. Troca de loja, unmount, reabertura e edição do texto invalidam respostas anteriores. Texto/transcrição não entram no payload de escrita.
- Confirmação explícita e novo clique de salvar; alterações posteriores revogam a confirmação. Adapter server-side autoriza sessão/perfil/loja, valida o DTO fechado e chama exclusivamente ClientWriteService, com autor canônico e preservação server-side dos metadados ocultos. Sem force/reviewDecision/merge automático. Histórico financeiro/fiscal e UNIQUE permanecem no serviço existente.
- Gate de voz efetivo na UI e na Action: não constrói SpeechRecognition, não solicita permissão e recusa captureSource diferente de text. Reutiliza o lifecycle compartilhado de captura no estado unavailable. O aviso informa que o reconhecimento do navegador pode enviar áudio externamente.
- Sem providers externos de IA no caminho de Cliente, sem logs de captura/PII, URL de busca, armazenamento local ou cache próprio. Motores 016/017 de Produto preservados.

## Validações até o primeiro commit

- 986 testes passaram; 20 integrações opt-in ficaram skipped (16 de listagem SQL de Produto e 4 de concorrência PostgreSQL). 65 arquivos: 63 passaram e 2 skipped. Inclui writer, identity, merge, documento/UNIQUE, privacidade, HUB, importadores, consumidores, Produto 016/017, novas Actions e editor. Banco fictício de loopback/mocks, zero escrita em banco real. Resultado completo em `regression.json`.
- Os testes novos usam nomes e números sintéticos para algoritmos, sem vínculo com pessoas reais. A integração das novas Actions usa os gates, classificadores e ClientWriteService reais com persistência simulada.
- O primeiro worker de interface sofreu timeout de inicialização com pouca memória; a execução sequencial passou. Um warning de descrição Radix encontrado foi corrigido e a regressão subsequente passou sem esse warning.
- Typecheck local não aprovado por esgotamento de memória do host de 8 GB, inclusive em execução isolada. `typecheck.log` preserva a falha ambiental; não equivale a PASS. Workflow dedicado valida o commit em ambiente limpo com Node 24, TypeScript, lint, regressões, build sem migrations e smoke em Chromium.
- Lint completo, CI, build, smoke responsivo e release: resultados finais a acrescentar após execução. Nenhum resultado futuro presumido.

## Self-review R5

1. **Autoridade:** gates reais de sessão, perfil e membership cobertos; contexto canônico do servidor prevalece sobre payload adulterado; IDOR update e matches de outra loja recusados/isolados.
2. **Privacidade:** caminho determinístico sem imports do interpretador externo de Produto; erros constantes; sugestão efêmera; payload de save fechado, sem transcript, fonte bruta ou campos financeiros; gate de voz fechado em duas fronteiras.
3. **Integridade:** nenhum motor paralelo de identidade/escrita; conflitos fortes, duplicidade de contato, colisão UNIQUE P2002 e metadados ocultos testados com writer real; sem merge, mudança de schema, migration ou reexecução do backfill.
4. **Interface/lifecycle:** revisão, correção, preservação de dados manuais, confirmação revogada ao editar, descarte, cancelamento, concorrência e troca de loja cobertos. Diálogo, labels e mensagens operacionais reutilizam componentes existentes. Conferência visual ainda pendente neste registro inicial.
5. **Evidência/release:** resultados locais distinguidos dos checks remotos. Merge e produção dependem de CI verde e revisão da PR. `MIGRATION_AUTHORITY_ENABLED=false` informado na missão não será alterado. Smoke produtivo será somente leitura, sem gravação de clientes reais.

## Dependência para voz

A administração e a assessoria jurídica precisam aprovar e documentar o processamento de voz de Clientes: finalidade, fundamento aplicável, serviço/navegadores autorizados, destinatários, retenção e comunicação ao operador. Essa aprovação não foi fornecida. O gate fica fechado até implementação e validação contra tal decisão; um checkbox do operador não substitui essa autorização.

CAD_R2_021_STATUS=PARTIAL. READY_FOR_NEXT_GOAL=NO. CAD-R2-022 não iniciado.

## Revisão e CI — continuação

- A revisão automatizada da PR #282 identificou dois P2, corrigidos em `66812da`: edições de registros históricos com documento inválido continuam sob a policy do writer; marcadores de campo não dividem palavras dentro de nomes/endereços. Testes específicos acrescentados. Threads respondidas e resolvidas; a nova revisão de `66812da` terminou sem achados.
- A revisão própria também preservou o tipo PF/PJ escolhido pelo operador e marcou UF explícita conflitante como ambígua.
- TypeScript completo PASS no runner, execução 39140256136. A execução anterior encontrou `startSaving` removido da inativação inline e uma opção não tipada num helper de teste; ambos corrigidos.
- Nova regressão local: 988 PASS/20 skipped, seguida de testes focados verdes para o delimitador final. O relatório JSON local registra essa execução; a contagem final do CI pode incluir os casos acrescentados depois.
- O scan de lint sem excluir cópias encontrou 105 erros antigos apenas em `components/pdv-github-original/claude-export` e `components/pdv-github-original/components/studio/components/bom-dia-modal.tsx`, sem alterações da tarefa. Não foi declarado PASS para esse scan bruto. O Vitest já exclui o espelho e o tsconfig já exclui seus componentes copiados. O wrapper vivo `PdvGithubOriginal.tsx` importa `Icons`, `Modals` e `data` da raiz do espelho, não os exports/cópias defeituosos. A CI verifica todas as fontes ativas, inclusive esse wrapper, excluindo somente Prisma gerado e essas duas árvores de cópias. Nenhuma regra de ESLint ou código do PDV foi modificado.
- Smoke local Chromium PASS em 1440×1000, 390×844 e 320×740. Editor e parser reais, CSS real compilado diretamente do `app/globals.css`; apenas I/O das Actions simulado. Revisão, correção, confirmação revogada após edição, aplicação, save simulado, descarte/reabertura e resposta antiga após troca de loja passaram. Sem overflow horizontal, chamadas externas, entradas em local/sessionStorage ou page errors. Capturas desktop e mobile inspecionadas. Evidências: `browser-smoke.json` e `review-*.png`. Isso não substitui o build completo ou smoke de produção.
- O próprio smoke inicialmente usou polling incompatível com a CSP restritiva do harness. Corrigido para polling pelo runner, preservando a CSP; a execução completa subsequente passou. Não houve mudança na segurança da aplicação para viabilizar o teste.
- A execução 39141288488 de `d36cb52` passou integralmente: TypeScript, lint de fontes ativas, regressões, build completo sem migrations e smoke Chromium com CSS do build. A revisão desse SHA identificou mais um caso de endereço com bairro iniciado por palavra de rótulo (`Cidade Jardim`). Corrigido conservadoramente: após Endereço, outro campo exige `:`/`=` ou separação por ponto e vírgula/nova linha; vírgulas internas permanecem no endereço. 58 testes focados passaram; a validação integral será repetida para esse ajuste antes do merge.
- A execução 39142043853 de `3ebb16f` também passou integralmente. A revisão pediu validação de identidade efetivamente alterada durante edição: uma leitura mínima autorizada no servidor prova o original; tipo/documento são revalidados juntos quando mudam, telefone/email modificados são validados, e campos históricos intocados são omitidos do patch. O writer continua sendo a única fronteira de escrita/dedupe/transação. 62 testes focados passaram, incluindo tentativa de trocar PF por PJ conservando CPF e alterações inválidas de identidade legada. Os gates completos serão repetidos para esse ajuste.
